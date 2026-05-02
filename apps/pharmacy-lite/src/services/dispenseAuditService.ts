import { db, type DispenseAuditEntry } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

/**
 * Append-only audit log entry for a medication dispense event.
 * Follows the same pattern as interactionAuditService.
 *
 * Two audit writes happen here:
 *   1. Local Dexie table (dispenseAuditLog) — the local record with
 *      clinical details (encrypted at rest via Dexie middleware).
 *   2. Structured audit event (pendingAuditEvents) — queued for sync
 *      to the Hub API where it feeds into the shared AuditLogger with
 *      SHA-256 hash chaining. Contains only opaque IDs, never PHI.
 *
 * This dual-write satisfies CLAUDE.md healthcare safety rule #6.
 */
export async function logDispenseEvent(
  dispense: LocalMedicationDispense,
  action: 'created' | 'cancelled',
): Promise<void> {
  const ts = hlc.now()

  const entry: DispenseAuditEntry = {
    id: crypto.randomUUID(),
    dispenseId: dispense.id,
    patientRef: dispense.subject.reference,
    medicationCode: dispense.medicationCodeableConcept.coding?.[0]?.code ?? '',
    medicationDisplay: dispense.medicationCodeableConcept.text ?? '',
    pharmacistRef: dispense.performer?.[0]?.actor.reference ?? '',
    action,
    hlcTimestamp: serializeHlc(ts),
    createdAt: new Date().toISOString(),
  }

  // 1. Local Dexie audit record (encrypted, includes clinical details)
  await db.dispenseAuditLog.add(entry)

  // 2. Structured audit event via shared @ultranos/audit-logger/client module.
  //    Replaces the ad-hoc emitAuditEvent pattern (Story 8.1).
  //    NOTE: Do NOT include medication names, codes, or any clinical
  //    content in the audit event payload. Use opaque IDs only.
  auditPhiAccess(
    dispense.performer?.[0]?.actor.reference ?? 'unknown',
    action === 'created' ? AuditAction.CREATE : AuditAction.DELETE_REQUEST,
    AuditResourceType.PRESCRIPTION,
    dispense.id,
    dispense.subject.reference,
    { phiAccess: 'dispense_action', dispenseAction: action },
  )
}
