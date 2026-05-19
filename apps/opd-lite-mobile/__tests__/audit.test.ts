import { emitClientAudit } from '@ultranos/audit-logger'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'

import { auditPatientRead } from '../src/lib/audit'

// Mock the audit-logger client
jest.mock('@ultranos/audit-logger', () => ({
  emitClientAudit: jest.fn().mockResolvedValue(undefined),
}))

describe('audit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('auditPatientRead', () => {
    it('emits a PHI_READ audit event on patient record access', async () => {
      await auditPatientRead('patient-001', 'clinician-42', '2026-01-01T00:00:00Z', 'search')

      expect(emitClientAudit).toHaveBeenCalledWith({
        actorId: 'clinician-42',
        actorRole: UserRole.DOCTOR,
        action: AuditAction.PHI_READ,
        resourceType: AuditResourceType.PATIENT,
        resourceId: 'patient-001',
        patientId: 'patient-001',
        hlcTimestamp: '2026-01-01T00:00:00Z',
        metadata: { context: 'search' },
      })
    })

    it('emits for summary context', async () => {
      await auditPatientRead('patient-002', 'clinician-42', '2026-01-01T00:00:00Z', 'summary')

      expect(emitClientAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: 'patient-002',
          metadata: { context: 'summary' },
        })
      )
    })

    it('omits metadata when no context provided', async () => {
      await auditPatientRead('patient-003', 'clinician-42', '2026-01-01T00:00:00Z')

      expect(emitClientAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: undefined,
        })
      )
    })

    it('never throws even if emitClientAudit fails', async () => {
      ;(emitClientAudit as jest.Mock).mockRejectedValueOnce(new Error('Adapter not registered'))

      // Should not throw — audit failures must not block clinical workflows
      await expect(
        auditPatientRead('patient-001', 'clinician-42', '2026-01-01T00:00:00Z')
      ).resolves.toBeUndefined()
    })

    it('uses opaque IDs only (no PHI in event)', async () => {
      await auditPatientRead('patient-001', 'clinician-42', '2026-01-01T00:00:00Z', 'search')

      const call = (emitClientAudit as jest.Mock).mock.calls[0][0]
      // Verify no patient names, diagnoses, or other PHI
      expect(call.actorId).toBe('clinician-42')
      expect(call.resourceId).toBe('patient-001')
      expect(call).not.toHaveProperty('name')
      expect(call).not.toHaveProperty('diagnosis')
      expect(call).not.toHaveProperty('allergyName')
    })
  })
})
