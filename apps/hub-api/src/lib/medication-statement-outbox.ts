import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase'

/**
 * MedicationStatement durability — Story 60.4 (Task 4 / AC 6).
 *
 * MedicationStatement creation on dispense is deliberately OUTSIDE the dispense
 * atomic tx (Story 61.3) as a best-effort, post-commit step. Previously any
 * failure there was swallowed (console.warn), so the active-med list could
 * silently diverge from the dispense ledger — the exact "silent under-delivery"
 * this story closes.
 *
 * This module makes that step DURABLE:
 *   - writeMedicationStatementFromPrescription(): the core create/update logic,
 *     which THROWS on error (so the caller can react) instead of swallowing.
 *   - enqueueMedicationStatementRetry(): on a best-effort failure, persist the
 *     intent to `medication_statement_outbox` for a later retry.
 *   - drainMedicationStatementOutbox(): the retry worker (invoked by cron).
 *
 * PHI note (CLAUDE.md Rule #1): the outbox row and all logs here carry ONLY
 * opaque references (prescription id, patient ref, actor id, hlc). The
 * medication identity is never persisted here — it is re-resolved from
 * medication_requests at write time.
 */

export interface MedStatementIntent {
  prescriptionId: string
  patientRef: string
  actorId: string
  hlcTimestamp: string
}

/**
 * Create or refresh the active MedicationStatement for a dispensed prescription.
 * THROWS on any DB error so the caller can enqueue a durable retry — this is the
 * key behavioral change from the old swallow-and-warn path.
 *
 * Returns:
 *   - 'created' — a new MedicationStatement row was inserted
 *   - 'updated' — an existing active statement's effective period was refreshed
 *   - 'skipped' — the source prescription no longer exists (nothing to do)
 */
export async function writeMedicationStatementFromPrescription(
  supabase: SupabaseClient,
  intent: MedStatementIntent,
): Promise<'created' | 'updated' | 'skipped'> {
  const { prescriptionId, patientRef, actorId, hlcTimestamp } = intent

  const { data: rx, error: rxError } = await supabase
    .from('medication_requests')
    .select('id, medication_codeable_concept, medication_display, subject_reference, encounter_reference')
    .eq('id', prescriptionId)
    .single()

  if (rxError) throw new Error(`prescription lookup failed: ${rxError.code ?? 'unknown'}`)
  if (!rx) return 'skipped'

  const now = new Date().toISOString()

  // Existing active statement for this prescription → refresh effective period.
  const { data: existing, error: existingError } = await supabase
    .from('medication_statements')
    .select('id')
    .eq('source_prescription_id', prescriptionId)
    .eq('status', 'active')
    .limit(1)

  if (existingError) throw new Error(`existing statement lookup failed: ${existingError.code ?? 'unknown'}`)

  const existingRow = existing?.[0]
  if (existingRow) {
    const { error: updateError } = await supabase
      .from('medication_statements')
      .update(db.toRow({
        effectivePeriodStart: now,
        metaLastUpdated: now,
        hlcTimestamp,
      }))
      .eq('id', existingRow.id)
    if (updateError) throw new Error(`statement update failed: ${updateError.code ?? 'unknown'}`)
    return 'updated'
  }

  const row = db.toRow({
    id: crypto.randomUUID(),
    resourceType: 'MedicationStatement',
    status: 'active',
    medicationCodeableConcept: rx.medication_codeable_concept,
    medicationDisplay: rx.medication_display,
    subjectReference: rx.subject_reference ?? patientRef,
    effectivePeriodStart: now,
    dateAsserted: now,
    informationSourceReference: `Practitioner/${actorId}`,
    sourceEncounterId: rx.encounter_reference?.replace('Encounter/', '') ?? null,
    sourcePrescriptionId: prescriptionId,
    isOfflineCreated: false,
    hlcTimestamp,
    createdAt: now,
    metaLastUpdated: now,
    metaVersionId: '1',
  })

  const { error: insertError } = await supabase.from('medication_statements').insert(row)
  if (insertError) throw new Error(`statement insert failed: ${insertError.code ?? 'unknown'}`)
  return 'created'
}

/**
 * Persist a MedicationStatement-creation intent for durable retry. Upserts on
 * prescription_id so a repeated dispense/replay updates the same live row rather
 * than piling up duplicates. Never throws — enqueue itself is best-effort, but a
 * failure is at least logged (opaque ids only) instead of silently lost.
 */
export async function enqueueMedicationStatementRetry(
  supabase: SupabaseClient,
  intent: MedStatementIntent,
  reason: string,
): Promise<void> {
  try {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('medication_statement_outbox')
      .upsert(
        {
          prescription_id: intent.prescriptionId,
          patient_ref: intent.patientRef,
          actor_id: intent.actorId,
          hlc_timestamp: intent.hlcTimestamp,
          status: 'PENDING',
          last_error: reason.slice(0, 200),
          next_retry_at: now,
          updated_at: now,
        },
        { onConflict: 'prescription_id' },
      )
    if (error) {
      console.warn('[MEDSTMT_OUTBOX] Enqueue failed', { prescriptionId: intent.prescriptionId, code: error.code })
    }
  } catch {
    console.warn('[MEDSTMT_OUTBOX] Enqueue threw', { prescriptionId: intent.prescriptionId })
  }
}

const MAX_ATTEMPTS = 8

export interface OutboxDrainResult {
  processed: number
  succeeded: number
  requeued: number
  deadLettered: number
}

/**
 * Drain pending MedicationStatement outbox rows (invoked by cron). Each row is
 * retried with exponential backoff up to MAX_ATTEMPTS; a row that keeps failing
 * is marked DEAD (dead-lettered) so it stops re-consuming — never silently
 * dropped. Idempotent: writeMedicationStatementFromPrescription refreshes an
 * existing active statement rather than duplicating it.
 */
export async function drainMedicationStatementOutbox(
  supabase: SupabaseClient,
): Promise<OutboxDrainResult> {
  const result: OutboxDrainResult = { processed: 0, succeeded: 0, requeued: 0, deadLettered: 0 }
  const nowIso = new Date().toISOString()

  const { data: rows, error } = await supabase
    .from('medication_statement_outbox')
    .select('id, prescription_id, patient_ref, actor_id, hlc_timestamp, attempts')
    .eq('status', 'PENDING')
    .lte('next_retry_at', nowIso)
    .order('next_retry_at', { ascending: true })
    .limit(100)

  if (error || !rows) return result

  for (const row of rows) {
    result.processed++
    const attempts = (row.attempts as number) ?? 0
    try {
      await writeMedicationStatementFromPrescription(supabase, {
        prescriptionId: row.prescription_id as string,
        patientRef: (row.patient_ref as string) ?? '',
        actorId: row.actor_id as string,
        hlcTimestamp: row.hlc_timestamp as string,
      })
      await supabase
        .from('medication_statement_outbox')
        .update({ status: 'DONE', attempts: attempts + 1, last_error: null, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      result.succeeded++
    } catch (err) {
      const nextAttempts = attempts + 1
      const message = err instanceof Error ? err.message : 'unknown error'
      if (nextAttempts >= MAX_ATTEMPTS) {
        await supabase
          .from('medication_statement_outbox')
          .update({ status: 'DEAD', attempts: nextAttempts, last_error: message.slice(0, 200), updated_at: new Date().toISOString() })
          .eq('id', row.id)
        result.deadLettered++
        console.error('[MEDSTMT_OUTBOX] Dead-lettered after max attempts', { prescriptionId: row.prescription_id })
      } else {
        // Exponential backoff: 2^n minutes, capped at 60 min.
        const backoffMs = Math.min(60, 2 ** nextAttempts) * 60_000
        await supabase
          .from('medication_statement_outbox')
          .update({
            attempts: nextAttempts,
            last_error: message.slice(0, 200),
            next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        result.requeued++
      }
    }
  }

  return result
}
