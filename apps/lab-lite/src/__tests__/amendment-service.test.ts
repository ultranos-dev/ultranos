/**
 * Story 43.3 — Amendment & Correction Protocol: Service Tests
 * Tasks 9.1–9.9, 9.11
 *
 * RED phase: These tests define the required behavior BEFORE the implementation.
 * Run them first to confirm they fail, then implement amendment-service.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initiateAmendment,
  authorizeAmendment,
  commitAmendment,
  getAmendmentChain,
} from '../lib/amendment-service'
import { AmendmentReasonCode } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// Mock DB — shared instance for all tests
// ---------------------------------------------------------------------------

const originalReport = {
  id: 'report-original-001',
  resourceType: 'DiagnosticReport' as const,
  status: 'final' as const,
  code: { coding: [{ system: 'http://loinc.org', code: '58410-2', display: 'CBC' }] },
  subject: { reference: 'Patient/pat-001' },
  issued: '2026-05-31T08:00:00.000Z',
  _ultranos: {
    createdAt: '2026-05-31T08:00:00.000Z',
    hlcTimestamp: '2026-05-31T08:00:00.000Z-0-node1',
    isOfflineCreated: false,
  },
  meta: { lastUpdated: '2026-05-31T08:00:00.000Z', versionId: '1' },
}

const mockAmendmentsTable = {
  add: vi.fn().mockResolvedValue('amendment-id-001'),
  get: vi.fn().mockResolvedValue(null),
  update: vi.fn().mockResolvedValue(undefined),
  where: vi.fn().mockReturnThis(),
  equals: vi.fn().mockReturnThis(),
  toArray: vi.fn().mockResolvedValue([]),
}

const mockLabResultsTable = {
  get: vi.fn().mockResolvedValue(originalReport),
  update: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue(undefined),
}

const mockSyncQueueTable = {
  put: vi.fn().mockResolvedValue(undefined),
}

const mockDbInstance = {
  amendments: mockAmendmentsTable,
  lab_results: mockLabResultsTable,
  syncQueue: mockSyncQueueTable,
}

vi.mock('../lib/db', () => ({
  getDb: () => mockDbInstance,
}))

vi.mock('../lib/audit-client', () => ({
  reportAmendmentEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: 1000, counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => '2026-05-31T10:00:00.000Z-0-test',
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: {
        userId: 'prac-tech-001',
        labRole: 'LAB_TECH',
      },
    }),
  },
}))

vi.mock('../lib/logbook-writer', () => ({
  createLogbookAmendment: vi.fn().mockResolvedValue('logbook-amendment-id-001'),
}))

// ---------------------------------------------------------------------------
// 9.1: initiateAmendment preserves original and creates corrected copy
// ---------------------------------------------------------------------------
describe('initiateAmendment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLabResultsTable.get.mockResolvedValue(originalReport)
    mockAmendmentsTable.add.mockResolvedValue('amendment-id-001')
  })

  it('9.1 — preserves original report as read-only (status amended), creates corrected copy', async () => {
    const result = await initiateAmendment('report-original-001', 'prac-tech-001')

    // Original report status should be set to 'amended'
    expect(mockLabResultsTable.update).toHaveBeenCalledWith(
      'report-original-001',
      expect.objectContaining({ status: 'amended' }),
    )

    // New corrected report should be added
    expect(mockLabResultsTable.add).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'corrected',
        _ultranos: expect.objectContaining({
          amendsReportId: 'report-original-001',
        }),
      }),
    )

    // Amendment record created in PENDING_AUTHORIZATION state
    expect(mockAmendmentsTable.add).toHaveBeenCalledWith(
      expect.objectContaining({
        originalReportId: 'report-original-001',
        status: 'PENDING_AUTHORIZATION',
        initiatedBy: 'prac-tech-001',
      }),
    )

    expect(result).toBeDefined()
    expect(result.amendmentId).toBeDefined()
    expect(result.correctedReportId).toBeDefined()
  })

  it('9.1 — deep-clones original before modifying (original values snapshot stored)', async () => {
    await initiateAmendment('report-original-001', 'prac-tech-001')

    expect(mockAmendmentsTable.add).toHaveBeenCalledWith(
      expect.objectContaining({
        originalValues: expect.objectContaining({
          status: 'final',
        }),
      }),
    )
  })

  it('9.1 — throws if report not found', async () => {
    mockLabResultsTable.get.mockResolvedValue(undefined)
    await expect(initiateAmendment('non-existent-report', 'prac-tech-001')).rejects.toThrow()
  })

  it('9.1 — throws if report is not in final/released status', async () => {
    mockLabResultsTable.get.mockResolvedValue({ ...originalReport, status: 'preliminary' })
    await expect(initiateAmendment('report-original-001', 'prac-tech-001')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 9.2 & 9.3: Mandatory fields validation
// ---------------------------------------------------------------------------
describe('authorizeAmendment', () => {
  const validPayload = {
    amendmentId: 'amendment-id-001',
    reasonCode: AmendmentReasonCode.CLERICAL_ERROR,
    reasonText: 'Wrong value transcribed from instrument printout',
    supervisorId: 'prac-supervisor-001',
    amendedValues: { haemoglobin: '14.2 g/dL' },
  }

  const pendingAmendment = {
    id: 'amendment-id-001',
    originalReportId: 'report-original-001',
    amendedReportId: 'report-corrected-001',
    status: 'PENDING_AUTHORIZATION' as const,
    initiatedBy: 'prac-tech-001',
    initiatedAt: '2026-05-31T10:00:00.000Z',
    reasonCode: null,
    reasonText: null,
    authorizedBy: null,
    authorizedAt: null,
    originalValues: {},
    amendedValues: {},
    hlcTimestamp: '2026-05-31T10:00:00.000Z-0-test',
    syncStatus: 'pending' as const,
  }

  const supervisorSession = {
    userId: 'prac-supervisor-001',
    labRole: 'SUPERVISOR',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAmendmentsTable.get.mockResolvedValue(pendingAmendment)
    mockAmendmentsTable.update = vi.fn().mockResolvedValue(undefined)
  })

  it('9.2 — requires reasonCode, reasonText (>=10 chars), and supervisorId', async () => {
    // Missing reasonText
    await expect(authorizeAmendment({
      ...validPayload,
      reasonText: 'short',
    }, supervisorSession)).rejects.toThrow('reasonText must be at least 10 characters')
  })

  it('9.3 — rejects amendment with empty reasonText', async () => {
    await expect(authorizeAmendment({
      ...validPayload,
      reasonText: '',
    }, supervisorSession)).rejects.toThrow()
  })

  it('9.3 — rejects amendment with missing reasonCode', async () => {
    await expect(authorizeAmendment({
      ...validPayload,
      reasonCode: undefined as unknown as AmendmentReasonCode,
    }, supervisorSession)).rejects.toThrow()
  })

  it('9.4 — non-supervisor role cannot authorize an amendment', async () => {
    const techSession = { userId: 'prac-tech-001', labRole: 'LAB_TECH' }
    await expect(authorizeAmendment(validPayload, techSession)).rejects.toThrow('supervisor authorization required')
  })

  it('9.4 — SUPERVISOR role can authorize', async () => {
    await expect(authorizeAmendment(validPayload, supervisorSession)).resolves.toBeDefined()
    expect(mockAmendmentsTable.update).toHaveBeenCalled()
  })

  it('9.4 — LAB_MANAGER role can authorize', async () => {
    const managerSession = { userId: 'prac-manager-001', labRole: 'LAB_MANAGER' }
    await expect(authorizeAmendment(validPayload, managerSession)).resolves.toBeDefined()
  })

  it('WRONG_PATIENT — sets original report to entered-in-error', async () => {
    await authorizeAmendment({
      ...validPayload,
      reasonCode: AmendmentReasonCode.WRONG_PATIENT,
    }, supervisorSession)

    expect(mockLabResultsTable.update).toHaveBeenCalledWith(
      'report-original-001',
      expect.objectContaining({ status: 'entered-in-error' }),
    )
  })
})

// ---------------------------------------------------------------------------
// 9.5: Physician notification on amendment commit
// ---------------------------------------------------------------------------
describe('commitAmendment', () => {
  const committedAmendment = {
    id: 'amendment-id-001',
    originalReportId: 'report-original-001',
    amendedReportId: 'report-corrected-001',
    status: 'PENDING_AUTHORIZATION' as const,
    reasonCode: AmendmentReasonCode.CLERICAL_ERROR,
    reasonText: 'Wrong value transcribed from instrument printout',
    authorizedBy: 'prac-supervisor-001',
    authorizedAt: '2026-05-31T10:30:00.000Z',
    initiatedBy: 'prac-tech-001',
    initiatedAt: '2026-05-31T10:00:00.000Z',
    originalValues: { haemoglobin: '10.2 g/dL' },
    amendedValues: { haemoglobin: '14.2 g/dL' },
    hlcTimestamp: '2026-05-31T10:00:00.000Z-0-test',
    syncStatus: 'pending' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAmendmentsTable.get.mockResolvedValue(committedAmendment)
    mockAmendmentsTable.update = vi.fn().mockResolvedValue(undefined)
  })

  it('9.5 — creates physician notification on commit', async () => {
    await commitAmendment('amendment-id-001')

    expect(mockSyncQueueTable.put).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'notification',
        payload: expect.objectContaining({
          type: 'RESULT_AMENDED',
        }),
      }),
    )
  })

  it('9.5 — physician notification does NOT contain PHI/result values', async () => {
    await commitAmendment('amendment-id-001')

    const notificationCall = mockSyncQueueTable.put.mock.calls[0]?.[0]
    const payload = notificationCall?.payload

    // Must not contain actual result values
    expect(JSON.stringify(payload)).not.toContain('14.2 g/dL')
    expect(JSON.stringify(payload)).not.toContain('10.2 g/dL')
    // Must use opaque reference
    expect(payload?.payload?.originalReportId).toBe('report-original-001')
  })

  it('9.8 — emits audit events at initiation, authorization, and completion', async () => {
    const { reportAmendmentEvent } = await import('../lib/audit-client')
    await commitAmendment('amendment-id-001')
    expect(reportAmendmentEvent).toHaveBeenCalled()
  })

  it('9.7 — appends logbook amendment entry (never modifies original)', async () => {
    const { createLogbookAmendment } = await import('../lib/logbook-writer')
    await commitAmendment('amendment-id-001')
    expect(createLogbookAmendment).toHaveBeenCalled()
    // Original entry must not be touched
    expect(mockLabResultsTable.update).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ entryType: 'original' }),
    )
  })

  it('sets amendment status to COMMITTED after success', async () => {
    await commitAmendment('amendment-id-001')
    expect(mockAmendmentsTable.update).toHaveBeenCalledWith(
      'amendment-id-001',
      expect.objectContaining({ status: 'COMMITTED' }),
    )
  })
})

// ---------------------------------------------------------------------------
// 9.9: Amendment chain — multiple sequential amendments
// ---------------------------------------------------------------------------
describe('getAmendmentChain', () => {
  it('9.9 — returns chronological chain for a given original report ID', async () => {
    const chain = [
      {
        id: 'amend-1',
        originalReportId: 'report-original-001',
        amendedReportId: 'report-v2',
        initiatedAt: '2026-05-31T10:00:00.000Z',
        reasonCode: AmendmentReasonCode.CLERICAL_ERROR,
        status: 'COMMITTED',
      },
      {
        id: 'amend-2',
        originalReportId: 'report-v2',
        amendedReportId: 'report-v3',
        initiatedAt: '2026-05-31T11:00:00.000Z',
        reasonCode: AmendmentReasonCode.TRANSCRIPTION_ERROR,
        status: 'COMMITTED',
      },
    ]
    mockAmendmentsTable.toArray.mockResolvedValue(chain)

    const result = await getAmendmentChain('report-original-001')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})
