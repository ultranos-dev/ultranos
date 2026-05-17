/**
 * Device Integrity Audit — emits audit events for device integrity checks.
 *
 * Story 21.5 AC#4: Root detection results must be logged as audit events.
 * Uses the existing audit queue for sync to Hub.
 */
import { emitAuditEvent } from '@/lib/audit'
import type { DeviceIntegrityResult } from '@/lib/device-security'

/**
 * Emit an audit event for a device integrity check result.
 *
 * - Compromised device: action=DEVICE_INTEGRITY_CHECK, outcome=failure
 * - Clean device: action=DEVICE_INTEGRITY_CHECK, outcome=success
 *
 * Metadata includes the reasons array (no PHI — only device state flags).
 */
export function emitDeviceIntegrityAudit(result: DeviceIntegrityResult): void {
  emitAuditEvent({
    action: 'DEVICE_INTEGRITY_CHECK',
    resourceType: 'SYSTEM',
    resourceId: 'device-integrity',
    patientId: 'N/A',
    outcome: result.isCompromised ? 'failure' : 'success',
    metadata: {
      reasons: result.reasons.join(','),
      checkedAt: new Date().toISOString(),
    },
  })
}
