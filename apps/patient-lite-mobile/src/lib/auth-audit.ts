/**
 * Auth-specific audit event emitter for patient OTP authentication.
 *
 * Story 18.2, Task 7: Fire-and-forget audit events for login lifecycle.
 *
 * AC #11: Emits PATIENT_LOGIN_SUCCESS, PATIENT_LOGIN_FAILURE,
 *         PATIENT_OTP_SENT, PATIENT_BIOMETRIC_ENROLLED
 * AC #12: No PHI (phone numbers) in any audit event — only userId or hashes.
 *
 * Uses the existing in-memory audit queue from src/lib/audit.ts.
 * TODO: Migrate to @ultranos/audit-logger once SQLite adapter is wired up (P8).
 */
import { emitAuditEvent } from '@/lib/audit'

export type AuthAuditAction =
  | 'PATIENT_OTP_SENT'
  | 'PATIENT_LOGIN_SUCCESS'
  | 'PATIENT_LOGIN_FAILURE'
  | 'PATIENT_BIOMETRIC_ENROLLED'

/**
 * Emit an auth-related audit event. Fire-and-forget — never throws.
 *
 * Auth actions are emitted using their spec-defined names directly
 * (e.g. PATIENT_LOGIN_SUCCESS) rather than generic PHI_READ.
 *
 * @param action - The audit action type (used directly as the AuditEntry action)
 * @param outcome - 'success' or 'failure'
 * @param userId - Supabase user UUID (only for success events). Never a phone number.
 */
export function emitAuthAudit(
  action: AuthAuditAction,
  outcome: 'success' | 'failure',
  userId?: string,
): void {
  try {
    emitAuditEvent({
      action,
      resourceType: 'Authentication',
      resourceId: action,
      patientId: userId ?? 'anonymous',
      outcome,
      metadata: { authAction: action },
    })
  } catch {
    // Fire-and-forget — audit failure must never break auth flow
  }
}
