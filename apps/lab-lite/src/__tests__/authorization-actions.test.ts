/**
 * Story 42.5 — Authorization Action Handler Tests
 * Task 11.2: approve/reject/hold actions; Task 11.4: critical value flows;
 * Task 11.6: offline persistence
 * Story 43.7 — Checklist gate integration tests (8.10, 8.11)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { approveResult, rejectResult, holdResult } from '../lib/authorization-actions'
import type { LabResultForAuthorization } from '../types/authorization'
import { AuthorizationStatus } from '../types/authorization'
import type { CompletedChecklist } from '../lib/critical-values/types'

// Shared mock DB singleton — same reference for both test assertions and implementation calls
const mockDbInstance = {
  lab_results: {
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
  },
  authorizationActions: {
    add: vi.fn().mockResolvedValue(1),
  },
  syncQueue: {
    put: vi.fn().mockResolvedValue(undefined),
  },
}

const mockAddCompletedChecklist = vi.fn().mockResolvedValue(undefined)
const mockGetCompletedChecklistForResult = vi.fn().mockResolvedValue(null)

vi.mock('../lib/db', () => ({
  getDb: () => mockDbInstance,
  addCompletedChecklist: (...args: unknown[]) => mockAddCompletedChecklist(...args),
  getCompletedChecklistForResult: (...args: unknown[]) => mockGetCompletedChecklistForResult(...args),
}))

// Mock audit client
vi.mock('../lib/audit-client', () => ({
  reportAuthorizationAuditEvent: vi.fn(),
  reportChecklistEvent: vi.fn(),
}))

// Mock escalation integration (fire-and-forget)
vi.mock('../lib/escalation-integration', () => ({
  checkAndInitiateEscalation: vi.fn().mockResolvedValue(undefined),
}))

// Mock result-release (fire-and-forget in approveResult)
vi.mock('../lib/result-release', () => ({
  dispatchResultRelease: vi.fn().mockResolvedValue(undefined),
}))

// Mock hlc
vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: 1000, counter: 0, nodeId: 'test' }) },
  serializeHlc: () => '2026-05-31T00:00:00.000Z-0-test',
}))

// Mock auth session store
vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: {
        userId: 'prac-supervisor-003',
        labRole: 'SUPERVISOR',
      },
    }),
  },
}))

const baseResult: LabResultForAuthorization = {
  id: 'result-uuid-001',
  serviceRequestId: 'order-123',
  patientRef: 'Patient/pat-001',
  patientFirstName: 'Ahmad',
  patientAge: 35,
  testCategory: 'CBC',
  loincCode: '58410-2',
  templateVersion: '1.0.0',
  abnormalityFlags: [],
  qcStatus: 'passing',
  enteredBy: 'prac-tech-001',
  enteredByRole: 'LAB_TECH',
  enteredAt: '2026-05-31T08:00:00.000Z-0-abc',
  authorizationStatus: AuthorizationStatus.PENDING,
  syncStatus: 'local',
}

const criticalResult: LabResultForAuthorization = {
  ...baseResult,
  id: 'result-uuid-critical',
  abnormalityFlags: ['LL'],
}

// A minimal valid CompletedChecklist for use in critical result tests
const mockCompletedChecklist: CompletedChecklist = {
  id: 'checklist-uuid-001',
  resultId: 'result-uuid-critical',
  items: [
    { id: 'qc-passed-today', label: 'QC passed today', isRequired: true, isChecked: true },
    { id: 'patient-id-verified', label: 'Patient ID verified', isRequired: true, isChecked: true },
    { id: 'result-plausibility', label: 'Result plausibility', isRequired: true, isChecked: true },
    { id: 'delta-check-reviewed', label: 'Delta check reviewed', isRequired: true, isChecked: true },
    { id: 'repeat-testing', label: 'Repeat testing', isRequired: false, isChecked: false },
  ],
  completedBy: 'prac-supervisor-003',
  completedAt: '2026-05-31T10:00:00.000Z',
  hlcTimestamp: '2026-05-31T10:00:00.000Z-0-test',
  syncStatus: 'local',
}

describe('approveResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddCompletedChecklist.mockResolvedValue(undefined)
    mockGetCompletedChecklistForResult.mockResolvedValue(null)
  })

  it('updates result status to APPROVED', async () => {
    const { getDb } = await import('../lib/db')
    const db = getDb()

    await approveResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
    })

    expect(db.lab_results.update).toHaveBeenCalledWith(
      baseResult.id,
      expect.objectContaining({
        authorizationStatus: AuthorizationStatus.APPROVED,
        authorizedBy: 'prac-supervisor-003',
      }),
    )
  })

  it('records an authorizationAction entry', async () => {
    const { getDb } = await import('../lib/db')
    const db = getDb()

    await approveResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
    })

    expect(db.authorizationActions.add).toHaveBeenCalledWith(
      expect.objectContaining({
        resultId: baseResult.id,
        action: 'APPROVE',
        actorId: 'prac-supervisor-003',
        actorRole: 'SUPERVISOR',
        syncStatus: 'local',
      }),
    )
  })

  it('emits audit event', async () => {
    const { reportAuthorizationAuditEvent } = await import('../lib/audit-client')

    await approveResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
    })

    expect(reportAuthorizationAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESULT_APPROVED',
        resultId: baseResult.id,
      }),
    )
  })

  it('dispatches result release notification on approve', async () => {
    const { dispatchResultRelease } = await import('../lib/result-release')

    await approveResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
    })

    expect(dispatchResultRelease).toHaveBeenCalledWith(baseResult)
  })

  it('critical result: requires criticalValueAcknowledged=true', async () => {
    await expect(
      approveResult({
        result: criticalResult,
        actorId: 'prac-supervisor-003',
        actorRole: 'SUPERVISOR',
        criticalValueAcknowledged: false,
      }),
    ).rejects.toThrow(/critical/i)
  })

  it('critical result: succeeds when criticalValueAcknowledged=true and completedChecklist provided', async () => {
    const { getDb } = await import('../lib/db')
    const db = getDb()

    await approveResult({
      result: criticalResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      criticalValueAcknowledged: true,
      completedChecklist: { ...mockCompletedChecklist, resultId: criticalResult.id },
    })

    expect(db.lab_results.update).toHaveBeenCalledWith(
      criticalResult.id,
      expect.objectContaining({
        authorizationStatus: AuthorizationStatus.APPROVED,
      }),
    )
  })

  it('Story 43.7 — critical result: throws when no completedChecklist and none stored', async () => {
    mockGetCompletedChecklistForResult.mockResolvedValue(null)

    await expect(
      approveResult({
        result: criticalResult,
        actorId: 'prac-supervisor-003',
        actorRole: 'SUPERVISOR',
        criticalValueAcknowledged: true,
        // No completedChecklist provided
      }),
    ).rejects.toThrow(/completed critical value checklist/i)
  })

  it('Story 43.7 — critical result: succeeds on idempotent retry when checklist already stored', async () => {
    // Simulate retry: no completedChecklist passed but one already exists in Dexie
    mockGetCompletedChecklistForResult.mockResolvedValue({
      ...mockCompletedChecklist,
      resultId: criticalResult.id,
    })

    const { getDb } = await import('../lib/db')
    const db = getDb()

    await approveResult({
      result: criticalResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      criticalValueAcknowledged: true,
    })

    expect(db.lab_results.update).toHaveBeenCalledWith(
      criticalResult.id,
      expect.objectContaining({ authorizationStatus: AuthorizationStatus.APPROVED }),
    )
  })

  it('8.10 Story 43.7 — emits CRITICAL_VALUE_CHECKLIST_COMPLETED audit event on approval with checklist', async () => {
    const { reportChecklistEvent } = await import('../lib/audit-client')

    await approveResult({
      result: criticalResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      criticalValueAcknowledged: true,
      completedChecklist: { ...mockCompletedChecklist, resultId: criticalResult.id },
      criticalValueMatches: [
        { loincCode: '2823-3', analyte: 'Potassium', direction: 'LOW', threshold: 2.5, unit: 'mEq/L' },
      ],
    })

    expect(reportChecklistEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        checklistId: mockCompletedChecklist.id,
        resultId: criticalResult.id,
        allItemsChecked: expect.any(Boolean),
        checkedBy: 'prac-supervisor-003',
      }),
    )
  })

  it('8.11 Story 43.7 — audit event criticalAnalytes contains analyte names only, no numeric values', async () => {
    const { reportChecklistEvent } = await import('../lib/audit-client')

    await approveResult({
      result: criticalResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      criticalValueAcknowledged: true,
      completedChecklist: { ...mockCompletedChecklist, resultId: criticalResult.id },
      criticalValueMatches: [
        { loincCode: '2823-3', analyte: 'Potassium', direction: 'LOW', threshold: 2.5, unit: 'mEq/L' },
        { loincCode: '718-7', analyte: 'Hemoglobin', direction: 'LOW', threshold: 5.0, unit: 'g/dL' },
      ],
    })

    const call = vi.mocked(reportChecklistEvent).mock.calls[0][0]
    // criticalAnalytes should be strings like "Potassium - LOW", NOT "2.5" or numeric values
    for (const entry of call.criticalAnalytes) {
      expect(typeof entry).toBe('string')
      // No bare numbers in the analyte label
      expect(entry).toMatch(/^[A-Za-z]/)
    }
    expect(call.criticalAnalytes).toContain('Potassium - LOW')
    expect(call.criticalAnalytes).toContain('Hemoglobin - LOW')
  })

  it('Story 43.7 — stores completedChecklist in Dexie before releasing', async () => {
    await approveResult({
      result: criticalResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      criticalValueAcknowledged: true,
      completedChecklist: { ...mockCompletedChecklist, resultId: criticalResult.id },
    })

    expect(mockAddCompletedChecklist).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mockCompletedChecklist.id,
        resultId: criticalResult.id,
      }),
    )
  })
})

describe('rejectResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates result status to REJECTED', async () => {
    const { getDb } = await import('../lib/db')
    const db = getDb()

    await rejectResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      rejectionComments: 'QC failed on instrument 3',
    })

    expect(db.lab_results.update).toHaveBeenCalledWith(
      baseResult.id,
      expect.objectContaining({
        authorizationStatus: AuthorizationStatus.REJECTED,
        rejectionComments: 'QC failed on instrument 3',
      }),
    )
  })

  it('throws if rejectionComments is empty', async () => {
    await expect(
      rejectResult({
        result: baseResult,
        actorId: 'prac-supervisor-003',
        actorRole: 'SUPERVISOR',
        rejectionComments: '',
      }),
    ).rejects.toThrow(/comments/i)
  })

  it('throws if rejectionComments is whitespace only', async () => {
    await expect(
      rejectResult({
        result: baseResult,
        actorId: 'prac-supervisor-003',
        actorRole: 'SUPERVISOR',
        rejectionComments: '   ',
      }),
    ).rejects.toThrow(/comments/i)
  })

  it('emits audit event with rejection reason', async () => {
    const { reportAuthorizationAuditEvent } = await import('../lib/audit-client')

    await rejectResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      rejectionComments: 'Insufficient sample volume',
    })

    expect(reportAuthorizationAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESULT_REJECTED',
        resultId: baseResult.id,
        reason: 'Insufficient sample volume',
      }),
    )
  })

  it('records an authorizationAction entry with REJECT action', async () => {
    const { getDb } = await import('../lib/db')
    const db = getDb()

    await rejectResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      rejectionComments: 'Hemolyzed sample',
    })

    expect(db.authorizationActions.add).toHaveBeenCalledWith(
      expect.objectContaining({
        resultId: baseResult.id,
        action: 'REJECT',
        comments: 'Hemolyzed sample',
        syncStatus: 'local',
      }),
    )
  })
})

describe('holdResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates result status to HELD', async () => {
    const { getDb } = await import('../lib/db')
    const db = getDb()

    await holdResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
    })

    expect(db.lab_results.update).toHaveBeenCalledWith(
      baseResult.id,
      expect.objectContaining({
        authorizationStatus: AuthorizationStatus.HELD,
      }),
    )
  })

  it('accepts optional holdComments', async () => {
    const { getDb } = await import('../lib/db')
    const db = getDb()

    await holdResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
      holdComments: 'Awaiting clinical context',
    })

    expect(db.lab_results.update).toHaveBeenCalledWith(
      baseResult.id,
      expect.objectContaining({
        holdComments: 'Awaiting clinical context',
      }),
    )
  })

  it('emits audit event', async () => {
    const { reportAuthorizationAuditEvent } = await import('../lib/audit-client')

    await holdResult({
      result: baseResult,
      actorId: 'prac-supervisor-003',
      actorRole: 'SUPERVISOR',
    })

    expect(reportAuthorizationAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RESULT_HELD',
        resultId: baseResult.id,
      }),
    )
  })
})
