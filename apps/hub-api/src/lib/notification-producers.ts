import type { SupabaseClient } from '@supabase/supabase-js'
import { AuditLogger } from '@ultranos/audit-logger'
import { buildNotificationContent } from '@/lib/notification-content'

/**
 * Cross-app notification PRODUCERS — Story 60.4 (Tasks 2 & 3).
 *
 * Four notification types existed in the content map with NO producer
 * (SYNC_CONFLICT, ALLERGY_UPDATE, CONSENT_CHANGE, and the stranded MPI review).
 * This module is the missing producer half: recipient resolution + a PHI-safe
 * insert into the existing `notifications` table (the same table lab.ts and the
 * escalation service write). All four spoke apps already poll notification.list,
 * so no new transport is added.
 *
 * ⛔ PHI SAFETY (CLAUDE.md Rule #1): a notification row/payload carries ONLY
 * opaque IDs (patientRef, resource id) and non-PHI operational descriptors
 * (criticality enum, consent status enum, resourceType). NEVER a patient name,
 * drug name, diagnosis, or allergy substance. body_params is filtered through
 * NON_PHI_PARAM_KEYS by buildNotificationContent — the single choke point.
 *
 * ── Recipient-resolution POLICY (documented per type) ─────────────────────────
 *   ALLERGY_UPDATE  → the patient's TREATING CLINICIANS: distinct prescribers on
 *                     the patient's active medication_requests (requester_id).
 *                     These are exactly the clinicians whose prescribing decisions
 *                     a new/changed allergy could invalidate — the audience that
 *                     must re-check. (No active prescriber ⇒ no recipient; the
 *                     allergy is still stored + Tier-1 append-only synced.)
 *   SYNC_CONFLICT   → same treating-clinician set for the conflicted patient. A
 *                     Tier-1 conflict blocks new prescribing until resolved, so the
 *                     prescribers are the ones who must act.
 *   CONSENT_CHANGE  → same treating-clinician set. A withdrawal changes what data
 *                     they may access at the Hub; grant/renewal is informational.
 *   MPI review      → ORG ADMINS (see notifyOrgAdminsMpiReview): duplicate-review
 *                     adjudication is an administrative task, not a clinical one.
 *
 * Recipients are keyed by practitioners.id (== requester_id / practitioner id),
 * matching the notification router's recipient_ref convention exactly.
 */

const NEXT_RETRY_MS = 60_000

const ADMIN_PRACTITIONER_ROLES = ['ADMIN', 'SUPERADMIN', 'PLATFORM_ADMIN', 'ORG_ADMIN'] as const

/**
 * Resolve the patient's treating clinicians: distinct prescriber ids on the
 * patient's active medication requests. patient_ref is stored bare in some tables
 * and prefixed in others, so query both forms. Returns opaque practitioner ids.
 * Never throws — a resolution failure yields an empty recipient set (the producer
 * then no-ops rather than blocking the parent clinical write).
 */
export async function resolveTreatingClinicians(
  supabase: SupabaseClient,
  patientId: string,
): Promise<string[]> {
  const bare = patientId.replace(/^Patient\//, '')
  try {
    const { data, error } = await supabase
      .from('medication_requests')
      .select('requester_id')
      .in('subject_reference', [`Patient/${bare}`, bare])
      .in('status', ['active', 'completed'])
    if (error || !data) return []
    const ids = new Set<string>()
    for (const row of data) {
      const rid = (row as { requester_id?: string | null }).requester_id
      if (rid) ids.add(rid)
    }
    return [...ids]
  } catch {
    return []
  }
}

/**
 * Resolve org-admin practitioner ids. Scoped to an org when orgId is provided
 * (the common case), else falls back to all admins. Returns opaque ids.
 */
export async function resolveOrgAdmins(
  supabase: SupabaseClient,
  orgId?: string | null,
): Promise<string[]> {
  try {
    let query = supabase
      .from('practitioners')
      .select('id')
      .in('role', ADMIN_PRACTITIONER_ROLES as unknown as string[])
    if (orgId) query = query.eq('org_id', orgId)
    const { data, error } = await query
    if (error || !data) return []
    return data.map((r) => (r as { id: string }).id).filter(Boolean)
  } catch {
    return []
  }
}

export interface ProduceNotificationsArgs {
  supabase: SupabaseClient
  type: string
  /** Opaque practitioner/patient ids the notification is addressed to. */
  recipientRefs: string[]
  recipientRole: string
  /** Raw payload — filtered to NON_PHI_PARAM_KEYS before it reaches body_params. */
  payload: Record<string, unknown>
  /** Actor for the audit event (defaults to SYSTEM). */
  actorId?: string
  actorRole?: string
  sessionId?: string
  /** Opaque patient id for audit attribution only (never embedded in the row). */
  auditPatientId?: string | null
  orgId?: string | null
}

export interface ProduceResult {
  inserted: number
  recipients: number
}

/**
 * Insert one notification row per (deduped) recipient and emit a CREATE audit
 * event per row. Never throws — a producer failure must not roll back the parent
 * clinical mutation; failures are logged with opaque ids only (Rule #1).
 */
export async function produceNotifications(
  args: ProduceNotificationsArgs,
): Promise<ProduceResult> {
  const recipients = [...new Set(args.recipientRefs.filter(Boolean))]
  if (recipients.length === 0) return { inserted: 0, recipients: 0 }

  const content = buildNotificationContent(args.type, args.payload)
  const nextRetryAt = new Date(Date.now() + NEXT_RETRY_MS).toISOString()

  const rows = recipients.map((recipientRef) => ({
    recipient_ref: recipientRef,
    recipient_role: args.recipientRole,
    type: args.type,
    // body_params already carries the non-PHI descriptors; the payload column is
    // set to the SAME filtered params (never the raw payload) so nothing PHI-shaped
    // is ever persisted, even in the legacy payload column.
    payload: JSON.stringify(content.bodyParams),
    status: 'QUEUED',
    next_retry_at: nextRetryAt,
    source_app: content.sourceApp,
    subject_key: content.subjectKey,
    body_key: content.bodyKey,
    body_params: content.bodyParams,
    notes_key: content.notesKey,
  }))

  try {
    const { data: inserted, error } = await args.supabase
      .from('notifications')
      .insert(rows)
      .select('id')

    if (error || !inserted) {
      // Fire-and-forget failure MUST at least be logged (opaque ids only).
      console.warn('[NOTIFY_PRODUCER] Insert failed', { type: args.type, recipients: recipients.length, code: error?.code })
      return { inserted: 0, recipients: recipients.length }
    }

    // Audit each dispatched notification (Rule #6). Best-effort per row.
    const audit = new AuditLogger(args.supabase, args.orgId ?? undefined)
    for (const n of inserted) {
      try {
        await audit.emit({
          action: 'CREATE',
          resourceType: 'NOTIFICATION',
          resourceId: (n as { id: string }).id,
          actorId: args.actorId ?? 'SYSTEM',
          actorRole: (args.actorRole ?? 'SYSTEM') as Parameters<typeof audit.emit>[0]['actorRole'],
          outcome: 'SUCCESS',
          ...(args.sessionId ? { sessionId: args.sessionId } : {}),
          ...(args.auditPatientId ? { patientId: args.auditPatientId } : {}),
          metadata: { notificationType: args.type, producer: 'story-60.4' },
        })
      } catch {
        console.warn('[NOTIFY_PRODUCER] Audit failed', { type: args.type })
      }
    }

    return { inserted: inserted.length, recipients: recipients.length }
  } catch (err) {
    console.warn('[NOTIFY_PRODUCER] Insert threw', { type: args.type, message: err instanceof Error ? err.message : 'unknown' })
    return { inserted: 0, recipients: recipients.length }
  }
}

/**
 * ALLERGY_UPDATE producer — notify the patient's treating clinicians of a new /
 * changed allergy. PHI-safe: carries criticality (severity enum) + opaque
 * patientRef only, NEVER the substance. Never throws.
 */
export async function produceAllergyUpdateNotification(
  supabase: SupabaseClient,
  opts: {
    patientId: string
    criticality?: string | null
    actorId?: string
    actorRole?: string
    sessionId?: string
    orgId?: string | null
  },
): Promise<ProduceResult> {
  const recipients = await resolveTreatingClinicians(supabase, opts.patientId)
  return produceNotifications({
    supabase,
    type: 'ALLERGY_UPDATE',
    recipientRefs: recipients,
    recipientRole: 'CLINICIAN',
    payload: { criticality: opts.criticality ?? 'unable-to-assess' },
    actorId: opts.actorId,
    actorRole: opts.actorRole,
    sessionId: opts.sessionId,
    auditPatientId: opts.patientId.replace(/^Patient\//, ''),
    orgId: opts.orgId,
  })
}

/**
 * CONSENT_CHANGE producer — notify treating clinicians that a patient's consent
 * status changed (a withdrawal changes Hub data-access enforcement). PHI-safe:
 * consentStatus enum + opaque patientRef only. Never throws.
 */
export async function produceConsentChangeNotification(
  supabase: SupabaseClient,
  opts: {
    patientId: string
    consentStatus: string
    actorId?: string
    actorRole?: string
    sessionId?: string
    orgId?: string | null
  },
): Promise<ProduceResult> {
  const recipients = await resolveTreatingClinicians(supabase, opts.patientId)
  return produceNotifications({
    supabase,
    type: 'CONSENT_CHANGE',
    recipientRefs: recipients,
    recipientRole: 'CLINICIAN',
    payload: { consentStatus: opts.consentStatus },
    actorId: opts.actorId,
    actorRole: opts.actorRole,
    sessionId: opts.sessionId,
    auditPatientId: opts.patientId.replace(/^Patient\//, ''),
    orgId: opts.orgId,
  })
}

/**
 * SYNC_CONFLICT producer — notify treating clinicians that a Tier-1 sync conflict
 * was flagged for a patient (blocks new prescribing until resolved). PHI-safe:
 * resourceType enum + opaque patientRef only. Never throws.
 */
export async function produceSyncConflictNotification(
  supabase: SupabaseClient,
  opts: {
    patientId: string
    resourceType: string
    actorId?: string
    actorRole?: string
    sessionId?: string
    orgId?: string | null
  },
): Promise<ProduceResult> {
  const recipients = await resolveTreatingClinicians(supabase, opts.patientId)
  return produceNotifications({
    supabase,
    type: 'SYNC_CONFLICT',
    recipientRefs: recipients,
    recipientRole: 'CLINICIAN',
    payload: { resourceType: opts.resourceType },
    actorId: opts.actorId,
    actorRole: opts.actorRole,
    sessionId: opts.sessionId,
    auditPatientId: opts.patientId.replace(/^Patient\//, ''),
    orgId: opts.orgId,
  })
}
