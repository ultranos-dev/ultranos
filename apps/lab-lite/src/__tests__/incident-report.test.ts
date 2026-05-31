/**
 * Unit tests for incident-report.ts
 * Story 47.1 — Task 12.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExposureType } from '../lib/safety/exposure-protocol'
import type { SourceStatus, TechVaccinationStatus, PepRecommendation } from '../lib/safety/exposure-protocol'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockIncidentReportsTable = {
  put: vi.fn(),
  toArray: vi.fn(),
  get: vi.fn(),
}

const mockDb = {
  incident_reports: mockIncidentReportsTable,
}

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
  enqueueSyncEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wall: 1000000000000n, logical: 0n, node: 'test' }) },
  serializeHlc: (_hlc: unknown) => 'hlc:test:0',
}))

import {
  generateIncidentReport,
  persistIncidentReport,
  getIncidentReports,
  getIncidentReportById,
  createExposureNotificationPayloads,
  queueExposureNotifications,
} from '../lib/safety/incident-report'
import { enqueueSyncEvent } from '@/lib/db'

const sourceStatus: SourceStatus = {
  hepB: 'UNKNOWN',
  hiv: 'POSITIVE',
  hepC: 'NEGATIVE',
}

const techVaccinationStatus: TechVaccinationStatus = {
  hepBImmunity: 'NOT_IMMUNE',
}

const pepRecommendation: PepRecommendation = {
  urgency: 'IMMEDIATE',
  actions: ['Seek care now', 'Start HIV PEP within 2 hours'],
  referral: true,
}

const baseWorkflowData = {
  exposureType: ExposureType.NEEDLESTICK,
  occurredAt: '2026-05-31T09:00:00.000Z',
  location: 'Station 2',
  mechanism: 'Needle slipped during blood draw',
  sourcePatientRef: 'Patient/abc-123',
  sourceStatus,
  techId: 'Practitioner/tech-001',
  techVaccinationStatus,
  firstAidActions: ['Washed wound', 'Applied antiseptic'],
  pepRecommendation,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIncidentReportsTable.put.mockResolvedValue(undefined)
  mockIncidentReportsTable.toArray.mockResolvedValue([])
  mockIncidentReportsTable.get.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// generateIncidentReport
// ---------------------------------------------------------------------------

describe('generateIncidentReport', () => {
  it('generates a report with a UUID id', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(typeof report.id).toBe('string')
    expect(report.id.length).toBeGreaterThan(10)
  })

  it('uses the provided exposure type', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(report.type).toBe(ExposureType.NEEDLESTICK)
  })

  it('uses the opaque sourcePatientRef — never patient name', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(report.sourcePatientRef).toBe('Patient/abc-123')
    // Confirm no name fields exist
    expect((report as any).patientName).toBeUndefined()
    expect((report as any).firstName).toBeUndefined()
  })

  it('includes a generatedAt ISO timestamp', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(() => new Date(report.generatedAt)).not.toThrow()
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt)
  })

  it('sets hlcTimestamp', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(typeof report.hlcTimestamp).toBe('string')
    expect(report.hlcTimestamp.length).toBeGreaterThan(0)
  })

  it('includes firstAidActions from workflow data', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(report.firstAidActions).toEqual(baseWorkflowData.firstAidActions)
  })

  it('sets notifiedRecipients from labManagerId and infectionControlOfficerId', () => {
    const report = generateIncidentReport({
      ...baseWorkflowData,
      labManagerId: 'Practitioner/mgr-001',
      infectionControlOfficerId: 'Practitioner/ic-001',
    })
    expect(report.notifiedRecipients).toContain('Practitioner/mgr-001')
    expect(report.notifiedRecipients).toContain('Practitioner/ic-001')
  })

  it('produces empty notifiedRecipients when none configured', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(report.notifiedRecipients).toEqual([])
  })

  it('includes PEP recommendation with correct urgency', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(report.pepRecommendation.urgency).toBe('IMMEDIATE')
    expect(report.pepRecommendation.referral).toBe(true)
  })

  it('preserves source status in report', () => {
    const report = generateIncidentReport(baseWorkflowData)
    expect(report.sourceStatus.hiv).toBe('POSITIVE')
    expect(report.sourceStatus.hepB).toBe('UNKNOWN')
  })
})

// ---------------------------------------------------------------------------
// persistIncidentReport
// ---------------------------------------------------------------------------

describe('persistIncidentReport', () => {
  it('persists report to incident_reports table', async () => {
    const report = generateIncidentReport(baseWorkflowData)
    await persistIncidentReport(report)
    expect(mockIncidentReportsTable.put).toHaveBeenCalledWith(report)
  })

  it('enqueues sync event after persisting', async () => {
    const report = generateIncidentReport(baseWorkflowData)
    await persistIncidentReport(report)
    expect(enqueueSyncEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'IncidentReport',
        resourceId: report.id,
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// createExposureNotificationPayloads
// ---------------------------------------------------------------------------

describe('createExposureNotificationPayloads', () => {
  it('returns one payload per recipient', () => {
    const report = generateIncidentReport({
      ...baseWorkflowData,
      labManagerId: 'Practitioner/mgr-001',
      infectionControlOfficerId: 'Practitioner/ic-001',
    })
    const payloads = createExposureNotificationPayloads(report)
    expect(payloads).toHaveLength(2)
  })

  it('returns empty array when no recipients configured', () => {
    const report = generateIncidentReport(baseWorkflowData)
    const payloads = createExposureNotificationPayloads(report)
    expect(payloads).toHaveLength(0)
  })

  it('notification payload type is EXPOSURE_INCIDENT', () => {
    const report = generateIncidentReport({
      ...baseWorkflowData,
      labManagerId: 'Practitioner/mgr-001',
    })
    const payloads = createExposureNotificationPayloads(report)
    expect(payloads[0].type).toBe('EXPOSURE_INCIDENT')
  })

  it('notification payload contains no patient demographics', () => {
    const report = generateIncidentReport({
      ...baseWorkflowData,
      labManagerId: 'Practitioner/mgr-001',
    })
    const payloads = createExposureNotificationPayloads(report)
    const payload = payloads[0]
    expect((payload as any).patientName).toBeUndefined()
    expect((payload as any).firstName).toBeUndefined()
    expect((payload as any).age).toBeUndefined()
    expect((payload as any).dob).toBeUndefined()
  })

  it('notification payload includes incidentId and exposureType', () => {
    const report = generateIncidentReport({
      ...baseWorkflowData,
      labManagerId: 'Practitioner/mgr-001',
    })
    const payloads = createExposureNotificationPayloads(report)
    expect(payloads[0].incidentId).toBe(report.id)
    expect(payloads[0].exposureType).toBe(ExposureType.NEEDLESTICK)
  })
})

// ---------------------------------------------------------------------------
// queueExposureNotifications
// ---------------------------------------------------------------------------

describe('queueExposureNotifications', () => {
  it('enqueues one sync event per recipient', async () => {
    const report = generateIncidentReport({
      ...baseWorkflowData,
      labManagerId: 'Practitioner/mgr-001',
      infectionControlOfficerId: 'Practitioner/ic-001',
    })
    await queueExposureNotifications(report)
    // Should have called enqueueSyncEvent twice (once per recipient)
    expect(enqueueSyncEvent).toHaveBeenCalledTimes(2)
    expect(enqueueSyncEvent).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'Notification' }),
    )
  })

  it('enqueues nothing when no recipients', async () => {
    const report = generateIncidentReport(baseWorkflowData)
    await queueExposureNotifications(report)
    expect(enqueueSyncEvent).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getIncidentReports / getIncidentReportById
// ---------------------------------------------------------------------------

describe('getIncidentReports', () => {
  it('returns all reports from local DB', async () => {
    const fakeReports = [generateIncidentReport(baseWorkflowData)]
    mockIncidentReportsTable.toArray.mockResolvedValue(fakeReports)
    const reports = await getIncidentReports()
    expect(reports).toHaveLength(1)
  })
})

describe('getIncidentReportById', () => {
  it('returns report when found', async () => {
    const fakeReport = generateIncidentReport(baseWorkflowData)
    mockIncidentReportsTable.get.mockResolvedValue(fakeReport)
    const result = await getIncidentReportById(fakeReport.id)
    expect(result).toEqual(fakeReport)
  })

  it('returns undefined when not found', async () => {
    mockIncidentReportsTable.get.mockResolvedValue(undefined)
    const result = await getIncidentReportById('nonexistent')
    expect(result).toBeUndefined()
  })
})
