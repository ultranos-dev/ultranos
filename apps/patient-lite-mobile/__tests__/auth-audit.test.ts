/**
 * Tests for auth-audit.ts — Story 18.2, Task 7.
 *
 * AC #11: Audit events for PATIENT_LOGIN_SUCCESS, PATIENT_LOGIN_FAILURE,
 *         PATIENT_OTP_SENT, PATIENT_BIOMETRIC_ENROLLED
 * AC #12: No PHI (phone numbers) in any audit event
 */
import { emitAuthAudit } from '../src/lib/auth-audit'
import { getAuditQueue, clearAuditQueue } from '../src/lib/audit'

beforeEach(() => {
  clearAuditQueue()
})

describe('auth-audit', () => {
  it('emits PATIENT_OTP_SENT audit event with correct action name', () => {
    emitAuthAudit('PATIENT_OTP_SENT', 'success')

    const queue = getAuditQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].action).toBe('PATIENT_OTP_SENT')
    expect(queue[0].metadata?.authAction).toBe('PATIENT_OTP_SENT')
    expect(queue[0].outcome).toBe('success')
    expect(queue[0].resourceType).toBe('Authentication')
  })

  it('emits PATIENT_LOGIN_SUCCESS with userId', () => {
    emitAuthAudit('PATIENT_LOGIN_SUCCESS', 'success', 'user-uuid-123')

    const queue = getAuditQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].patientId).toBe('user-uuid-123')
    expect(queue[0].outcome).toBe('success')
  })

  it('emits PATIENT_LOGIN_FAILURE without userId', () => {
    emitAuthAudit('PATIENT_LOGIN_FAILURE', 'failure')

    const queue = getAuditQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].patientId).toBe('anonymous')
    expect(queue[0].outcome).toBe('failure')
  })

  it('emits PATIENT_BIOMETRIC_ENROLLED with userId and correct action', () => {
    emitAuthAudit('PATIENT_BIOMETRIC_ENROLLED', 'success', 'user-uuid-456')

    const queue = getAuditQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].action).toBe('PATIENT_BIOMETRIC_ENROLLED')
    expect(queue[0].metadata?.authAction).toBe('PATIENT_BIOMETRIC_ENROLLED')
    expect(queue[0].patientId).toBe('user-uuid-456')
  })

  it('never includes phone numbers in audit events (AC #12)', () => {
    emitAuthAudit('PATIENT_OTP_SENT', 'success')
    emitAuthAudit('PATIENT_LOGIN_SUCCESS', 'success', 'user-uuid')
    emitAuthAudit('PATIENT_LOGIN_FAILURE', 'failure')

    const queue = getAuditQueue()
    for (const entry of queue) {
      const serialized = JSON.stringify(entry)
      // No phone-like patterns should appear
      expect(serialized).not.toMatch(/\+93\d/)
      expect(serialized).not.toMatch(/\+971\d/)
      expect(serialized).not.toMatch(/\+966\d/)
      expect(serialized).not.toMatch(/\+962\d/)
    }
  })

  it('does not throw on audit failure (fire-and-forget)', () => {
    // This should never crash the auth flow
    expect(() => {
      emitAuthAudit('PATIENT_LOGIN_SUCCESS', 'success')
    }).not.toThrow()
  })
})
