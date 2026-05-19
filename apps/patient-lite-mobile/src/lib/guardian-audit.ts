/**
 * Guardian-specific audit event emitter.
 *
 * Story 18.7, Task 7: Audit logging for guardian actions.
 *
 * AC #4: All guardian actions logged with GUARDIAN_ACTION audit tag.
 * CLAUDE.md Rule #1: No PHI in audit events — use opaque IDs only.
 * CLAUDE.md Rule #6: Every PHI access emits a structured audit event.
 */
import { emitAuditEvent } from '@/lib/audit'

export type GuardianAuditAction =
  | 'GUARDIAN_LINK_CREATED'
  | 'GUARDIAN_LINK_REVOKED'
  | 'GUARDIAN_ACTION'

/**
 * Emit a guardian-related audit event. Fire-and-forget — never throws.
 *
 * @param action - The audit action type
 * @param patientId - Patient's opaque ID (never PHI)
 * @param guardianUserId - Guardian's opaque user ID (never PHI)
 * @param metadata - Additional opaque metadata (never phone numbers or PHI)
 */
export function emitGuardianAudit(
  action: GuardianAuditAction,
  patientId: string,
  guardianUserId: string,
  metadata?: Record<string, string>,
): void {
  try {
    emitAuditEvent({
      action,
      resourceType: 'GuardianLink',
      resourceId: `${patientId}:${guardianUserId}`,
      patientId,
      outcome: 'success',
      metadata: {
        ...metadata,
        guardianUserId,
        tag: 'GUARDIAN_ACTION',
      },
    })
  } catch {
    // Fire-and-forget — audit failure must never break guardian flow
  }
}

/**
 * Emit audit for guardian consent grant/revoke.
 * Tagged with GUARDIAN_ACTION per PRD HP-012.
 */
export function emitGuardianConsentAudit(
  consentAction: 'grant' | 'revoke',
  patientId: string,
  guardianUserId: string,
  consentId: string,
  scope: string,
): void {
  emitGuardianAudit('GUARDIAN_ACTION', patientId, guardianUserId, {
    consentAction,
    consentId,
    scope,
  })
}
