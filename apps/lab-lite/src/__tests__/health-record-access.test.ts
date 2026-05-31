import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LabRole } from '@ultranos/shared-types'

// Mock audit-client before importing the module under test
vi.mock('../lib/audit-client', () => ({
  reportHealthRecordAuditEvent: vi.fn(),
}))

import { canAccessHealthRecord, assertHealthRecordAccess } from '../lib/safety/health-record-access'
import { reportHealthRecordAuditEvent } from '../lib/audit-client'

const mockAudit = reportHealthRecordAuditEvent as ReturnType<typeof vi.fn>

describe('Health Record Access Control (Story 47.3, Task 3)', () => {
  beforeEach(() => {
    mockAudit.mockClear()
  })

  it('allows self-access (tech viewing own record)', () => {
    const result = canAccessHealthRecord('tech-1', LabRole.LAB_TECH, 'tech-1')
    expect(result).toBe(true)
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('allows lab manager to access any record', () => {
    const result = canAccessHealthRecord('mgr-1', LabRole.LAB_MANAGER, 'tech-2')
    expect(result).toBe(true)
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('denies tech viewing another tech record', () => {
    const result = canAccessHealthRecord('tech-1', LabRole.LAB_TECH, 'tech-2')
    expect(result).toBe(false)
    expect(mockAudit).toHaveBeenCalledWith({
      action: 'HEALTH_RECORD_ACCESS_DENIED',
      practitionerId: 'tech-2',
      accessedBy: 'tech-1',
      fieldsModified: [],
    })
  })

  it('denies senior tech viewing another tech record', () => {
    const result = canAccessHealthRecord('tech-3', LabRole.SENIOR_TECH, 'tech-1')
    expect(result).toBe(false)
    expect(mockAudit).toHaveBeenCalledOnce()
  })

  it('denies supervisor viewing another tech record', () => {
    const result = canAccessHealthRecord('sup-1', LabRole.SUPERVISOR, 'tech-1')
    expect(result).toBe(false)
    expect(mockAudit).toHaveBeenCalledOnce()
  })

  it('denies access when labRole is null', () => {
    const result = canAccessHealthRecord('user-1', null, 'tech-1')
    expect(result).toBe(false)
    expect(mockAudit).toHaveBeenCalledOnce()
  })

  it('assertHealthRecordAccess throws on denial', () => {
    expect(() =>
      assertHealthRecordAccess('tech-1', LabRole.LAB_TECH, 'tech-2'),
    ).toThrow('Unauthorized access to health record')
  })

  it('assertHealthRecordAccess does not throw for self-access', () => {
    expect(() =>
      assertHealthRecordAccess('tech-1', LabRole.LAB_TECH, 'tech-1'),
    ).not.toThrow()
  })

  it('assertHealthRecordAccess does not throw for lab manager', () => {
    expect(() =>
      assertHealthRecordAccess('mgr-1', LabRole.LAB_MANAGER, 'tech-2'),
    ).not.toThrow()
  })

  it('emits audit event with correct structure on denial', () => {
    canAccessHealthRecord('intruder', LabRole.LAB_TECH, 'target-tech')

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HEALTH_RECORD_ACCESS_DENIED',
        practitionerId: 'target-tech',
        accessedBy: 'intruder',
        fieldsModified: [],
      }),
    )
  })
})
