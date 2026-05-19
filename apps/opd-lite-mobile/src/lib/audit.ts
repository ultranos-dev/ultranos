/**
 * Audit logging for patient record access.
 * Every PHI read (search result display, summary screen load) emits an audit event.
 * Uses @ultranos/audit-logger client emitter.
 */
import { emitClientAudit } from '@ultranos/audit-logger'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'

/**
 * Emit a patient:read audit event.
 * Called on every patient record access — search result display and summary screen load.
 *
 * RULE: Never throws — audit failures must not block clinical workflows.
 * RULE: No PHI in metadata — only opaque IDs.
 */
export async function auditPatientRead(
  patientId: string,
  clinicianId: string,
  hlcTimestamp: string,
  context?: 'search' | 'summary'
): Promise<void> {
  try {
    await emitClientAudit({
      actorId: clinicianId,
      actorRole: UserRole.DOCTOR,
      action: AuditAction.PHI_READ,
      resourceType: AuditResourceType.PATIENT,
      resourceId: patientId,
      patientId,
      hlcTimestamp,
      metadata: context ? { context } : undefined,
    })
  } catch {
    // RULE: emitClientAudit must NEVER throw or block clinical workflows.
    // Swallow the error — audit store adapter may not be registered yet.
  }
}
