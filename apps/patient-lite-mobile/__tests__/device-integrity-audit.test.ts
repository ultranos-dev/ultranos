/**
 * Tests for device-integrity-audit.ts — audit event emission.
 *
 * Story 21.5 AC#4: Root detection results logged as audit events.
 */
import { emitAuditEvent, getAuditQueue, clearAuditQueue } from '@/lib/audit'
import { emitDeviceIntegrityAudit } from '@/lib/device-integrity-audit'

describe('emitDeviceIntegrityAudit', () => {
  beforeEach(() => {
    clearAuditQueue()
  })

  it('emits success audit event for clean device', () => {
    emitDeviceIntegrityAudit({ isCompromised: false, reasons: [] })

    const queue = getAuditQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      action: 'DEVICE_INTEGRITY_CHECK',
      resourceType: 'SYSTEM',
      resourceId: 'device-integrity',
      outcome: 'success',
    })
    expect(queue[0].metadata?.reasons).toBe('')
  })

  it('emits failure audit event for compromised device', () => {
    emitDeviceIntegrityAudit({
      isCompromised: true,
      reasons: ['rooted', 'debug-mode'],
    })

    const queue = getAuditQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      action: 'DEVICE_INTEGRITY_CHECK',
      resourceType: 'SYSTEM',
      resourceId: 'device-integrity',
      outcome: 'failure',
    })
    expect(queue[0].metadata?.reasons).toBe('rooted,debug-mode')
  })

  it('includes checkedAt timestamp in metadata', () => {
    const before = new Date().toISOString()
    emitDeviceIntegrityAudit({ isCompromised: false, reasons: [] })

    const queue = getAuditQueue()
    expect(queue[0].metadata?.checkedAt).toBeDefined()
    expect(queue[0].metadata!.checkedAt! >= before).toBe(true)
  })

  it('does not include PHI in audit metadata', () => {
    emitDeviceIntegrityAudit({
      isCompromised: true,
      reasons: ['rooted'],
    })

    const queue = getAuditQueue()
    const entry = queue[0]
    // patientId should be N/A (no patient context for device checks)
    expect(entry.patientId).toBe('N/A')
    // No PHI fields present
    expect(entry.metadata).not.toHaveProperty('patientName')
    expect(entry.metadata).not.toHaveProperty('diagnosis')
  })
})
