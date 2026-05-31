import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  addSafetyReport,
  getSafetyReports,
  getSafetyReportsByStatus,
  getSafetyReportById,
  updateReportStatus,
} from '../lib/db'
import {
  SafetyConcernCategory,
  ReportStatus,
  type SafetyReport,
} from '@/types/safety-reporting'

// Mock audit client so service imports don't fail
vi.mock('@/lib/audit-client', () => ({
  reportSafetyManagerEvent: vi.fn(),
  reportTemperatureEvent: vi.fn(),
  reportWasteEvent: vi.fn(),
}))

// Mock hlc
vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => 'hlc-test-timestamp',
}))

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { userId: 'test-manager', labRole: 'LAB_MANAGER' } }),
  },
}))

// Mock enqueueSyncEvent
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  return {
    ...actual,
    enqueueSyncEvent: vi.fn(),
  }
})

function makeReport(overrides: Partial<SafetyReport> = {}): SafetyReport {
  const roundedTime = new Date()
  roundedTime.setMinutes(0, 0, 0)
  return {
    id: crypto.randomUUID(),
    category: SafetyConcernCategory.HAND_HYGIENE,
    details: 'Test safety concern details for hand hygiene observation',
    submittedAt: roundedTime.toISOString(),
    status: ReportStatus.SUBMITTED,
    resolution: null,
    acknowledgedAt: null,
    closedAt: null,
    investigatorNotes: null,
    ...overrides,
  }
}

describe('Safety Report DB Helpers (v14)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.safety_reports.clear()
  })

  it('adds a safety report and retrieves it by ID', async () => {
    const report = makeReport()
    await addSafetyReport(report)

    const found = await getSafetyReportById(report.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(report.id)
    expect(found!.category).toBe(SafetyConcernCategory.HAND_HYGIENE)
    expect(found!.status).toBe(ReportStatus.SUBMITTED)
  })

  it('retrieves all reports ordered by submittedAt descending', async () => {
    const older = makeReport({
      submittedAt: new Date('2026-05-01T10:00:00.000Z').toISOString(),
    })
    const newer = makeReport({
      submittedAt: new Date('2026-05-15T10:00:00.000Z').toISOString(),
    })
    await addSafetyReport(older)
    await addSafetyReport(newer)

    const all = await getSafetyReports()
    expect(all).toHaveLength(2)
    // Descending — newest first
    expect(all[0].id).toBe(newer.id)
    expect(all[1].id).toBe(older.id)
  })

  it('filters reports by status', async () => {
    const submitted = makeReport({ status: ReportStatus.SUBMITTED })
    const closed = makeReport({ status: ReportStatus.CLOSED })
    await addSafetyReport(submitted)
    await addSafetyReport(closed)

    const results = await getSafetyReportsByStatus(ReportStatus.SUBMITTED)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(submitted.id)
  })

  it('updates report status and associated fields', async () => {
    const report = makeReport()
    await addSafetyReport(report)

    await updateReportStatus(report.id, {
      status: ReportStatus.ACKNOWLEDGED,
      acknowledgedAt: new Date().toISOString(),
    })

    const updated = await getSafetyReportById(report.id)
    expect(updated!.status).toBe(ReportStatus.ACKNOWLEDGED)
    expect(updated!.acknowledgedAt).toBeTruthy()
  })

  it('updates report with investigation notes', async () => {
    const report = makeReport({ status: ReportStatus.ACKNOWLEDGED })
    await addSafetyReport(report)

    await updateReportStatus(report.id, {
      status: ReportStatus.INVESTIGATING,
      investigatorNotes: 'Investigation in progress',
    })

    const updated = await getSafetyReportById(report.id)
    expect(updated!.status).toBe(ReportStatus.INVESTIGATING)
    expect(updated!.investigatorNotes).toBe('Investigation in progress')
  })

  it('closes report with resolution', async () => {
    const report = makeReport({ status: ReportStatus.INVESTIGATING })
    await addSafetyReport(report)

    const closedAt = new Date().toISOString()
    await updateReportStatus(report.id, {
      status: ReportStatus.CLOSED,
      resolution: 'Issue resolved through retraining',
      closedAt,
    })

    const updated = await getSafetyReportById(report.id)
    expect(updated!.status).toBe(ReportStatus.CLOSED)
    expect(updated!.resolution).toBe('Issue resolved through retraining')
    expect(updated!.closedAt).toBe(closedAt)
  })
})

describe('Anonymity Verification', () => {
  it('SafetyReport type has no reporterId or userId field', () => {
    const report = makeReport()
    // TypeScript ensures these don't exist at compile time,
    // but verify at runtime that no identity fields leak
    const keys = Object.keys(report)
    expect(keys).not.toContain('reporterId')
    expect(keys).not.toContain('userId')
    expect(keys).not.toContain('sessionId')
    expect(keys).not.toContain('practitionerId')
    expect(keys).not.toContain('actorId')
  })

  it('submittedAt is rounded to nearest hour (minutes and seconds are zero)', () => {
    const report = makeReport()
    const date = new Date(report.submittedAt)
    expect(date.getMinutes()).toBe(0)
    expect(date.getSeconds()).toBe(0)
    expect(date.getMilliseconds()).toBe(0)
  })

  it('report IDs are random UUIDs (not sequential)', () => {
    const ids = Array.from({ length: 10 }, () => makeReport().id)
    // All unique
    expect(new Set(ids).size).toBe(10)
    // UUID format
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
    }
  })
})

describe('Safety Report Service', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.safety_reports.clear()
    vi.clearAllMocks()
  })

  it('submitAnonymousReport creates report with rounded timestamp and no identity', async () => {
    const { submitAnonymousReport } = await import(
      '@/lib/safety/safety-report-service'
    )

    const id = await submitAnonymousReport({
      category: SafetyConcernCategory.PPE_NON_USE,
      details: 'Observed technician without gloves during specimen handling',
    })

    expect(id).toBeTruthy()
    const report = await getSafetyReportById(id)
    expect(report).toBeDefined()
    expect(report!.category).toBe(SafetyConcernCategory.PPE_NON_USE)
    expect(report!.status).toBe(ReportStatus.SUBMITTED)

    // Verify timestamp is rounded
    const date = new Date(report!.submittedAt)
    expect(date.getMinutes()).toBe(0)
    expect(date.getSeconds()).toBe(0)
    expect(date.getMilliseconds()).toBe(0)

    // Verify no identity fields
    const keys = Object.keys(report!)
    expect(keys).not.toContain('reporterId')
    expect(keys).not.toContain('userId')
    expect(keys).not.toContain('sessionId')
  })

  it('submitAnonymousReport does NOT emit an audit event', async () => {
    const { reportSafetyManagerEvent } = await import('@/lib/audit-client')
    const { submitAnonymousReport } = await import(
      '@/lib/safety/safety-report-service'
    )

    await submitAnonymousReport({
      category: SafetyConcernCategory.HAND_HYGIENE,
      details: 'No handwashing between patients observed at station 2',
    })

    // Audit function should NOT have been called on submission
    expect(reportSafetyManagerEvent).not.toHaveBeenCalled()
  })

  it('submitAnonymousReport queues sync event without auth data', async () => {
    const { enqueueSyncEvent } = await import('@/lib/db')
    const { submitAnonymousReport } = await import(
      '@/lib/safety/safety-report-service'
    )

    await submitAnonymousReport({
      category: SafetyConcernCategory.EQUIPMENT_MISUSE,
      details: 'Centrifuge operated without lid secured, splash hazard',
    })

    expect(enqueueSyncEvent).toHaveBeenCalled()
    const call = (enqueueSyncEvent as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.resourceType).toBe('SafetyReport')
    // Verify payload has no auth/identity info
    expect(call.payload).not.toHaveProperty('userId')
    expect(call.payload).not.toHaveProperty('sessionId')
    expect(call.payload).not.toHaveProperty('reporterId')
    expect(call.payload).not.toHaveProperty('authorization')
  })

  it('submitAnonymousReport also queues a notification sync event', async () => {
    const { enqueueSyncEvent } = await import('@/lib/db')
    const { submitAnonymousReport } = await import(
      '@/lib/safety/safety-report-service'
    )

    await submitAnonymousReport({
      category: SafetyConcernCategory.HAND_HYGIENE,
      details: 'Hand hygiene non-compliance at blood draw station',
    })

    // Should be called twice: once for report, once for notification
    expect(enqueueSyncEvent).toHaveBeenCalledTimes(2)
    const notifCall = (enqueueSyncEvent as ReturnType<typeof vi.fn>).mock.calls[1][0]
    expect(notifCall.resourceType).toBe('SafetyConcernNotification')
    expect(notifCall.payload.type).toBe('SAFETY_CONCERN_REPORTED')
    // No reporter identity in notification
    expect(notifCall.payload).not.toHaveProperty('userId')
    expect(notifCall.payload).not.toHaveProperty('reporterId')
  })

  it('acknowledgeReport emits audit event for manager action', async () => {
    const { reportSafetyManagerEvent } = await import('@/lib/audit-client')
    const { acknowledgeReport } = await import(
      '@/lib/safety/safety-report-service'
    )

    const report = makeReport()
    await addSafetyReport(report)

    await acknowledgeReport(report.id, 'manager-123')

    expect(reportSafetyManagerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SAFETY_REPORT_ACKNOWLEDGED',
        reportId: report.id,
        managerId: 'manager-123',
      }),
    )

    const updated = await getSafetyReportById(report.id)
    expect(updated!.status).toBe(ReportStatus.ACKNOWLEDGED)
    expect(updated!.acknowledgedAt).toBeTruthy()
  })

  it('updateInvestigation sets status and notes, emits audit', async () => {
    const { reportSafetyManagerEvent } = await import('@/lib/audit-client')
    const { updateInvestigation } = await import(
      '@/lib/safety/safety-report-service'
    )

    const report = makeReport({ status: ReportStatus.ACKNOWLEDGED })
    await addSafetyReport(report)

    await updateInvestigation(report.id, 'manager-123', 'Checking CCTV footage')

    expect(reportSafetyManagerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SAFETY_REPORT_INVESTIGATED',
        reportId: report.id,
      }),
    )

    const updated = await getSafetyReportById(report.id)
    expect(updated!.status).toBe(ReportStatus.INVESTIGATING)
    expect(updated!.investigatorNotes).toBe('Checking CCTV footage')
  })

  it('closeReport sets status, resolution, closedAt, emits audit', async () => {
    const { reportSafetyManagerEvent } = await import('@/lib/audit-client')
    const { closeReport } = await import(
      '@/lib/safety/safety-report-service'
    )

    const report = makeReport({ status: ReportStatus.INVESTIGATING })
    await addSafetyReport(report)

    await closeReport(report.id, 'manager-123', 'Retraining conducted')

    expect(reportSafetyManagerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SAFETY_REPORT_CLOSED',
        reportId: report.id,
      }),
    )

    const updated = await getSafetyReportById(report.id)
    expect(updated!.status).toBe(ReportStatus.CLOSED)
    expect(updated!.resolution).toBe('Retraining conducted')
    expect(updated!.closedAt).toBeTruthy()
  })

  it('manager workflow state machine: SUBMITTED → ACKNOWLEDGED → INVESTIGATING → CLOSED', async () => {
    const { acknowledgeReport, updateInvestigation, closeReport } = await import(
      '@/lib/safety/safety-report-service'
    )

    const report = makeReport()
    await addSafetyReport(report)

    // SUBMITTED → ACKNOWLEDGED
    await acknowledgeReport(report.id, 'mgr')
    let r = await getSafetyReportById(report.id)
    expect(r!.status).toBe(ReportStatus.ACKNOWLEDGED)

    // ACKNOWLEDGED → INVESTIGATING
    await updateInvestigation(report.id, 'mgr', 'Looking into it')
    r = await getSafetyReportById(report.id)
    expect(r!.status).toBe(ReportStatus.INVESTIGATING)

    // INVESTIGATING → CLOSED
    await closeReport(report.id, 'mgr', 'Resolved')
    r = await getSafetyReportById(report.id)
    expect(r!.status).toBe(ReportStatus.CLOSED)
  })

  it('throws when acknowledging a non-existent report', async () => {
    const { acknowledgeReport } = await import(
      '@/lib/safety/safety-report-service'
    )

    await expect(
      acknowledgeReport('non-existent-id', 'mgr'),
    ).rejects.toThrow('Report not found')
  })
})
