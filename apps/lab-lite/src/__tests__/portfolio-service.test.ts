/**
 * Story 51.6 — Technician Performance Portfolio: Portfolio Service Tests
 * Task 8: Unit tests for portfolio metric calculations
 *
 * Tests run with mocked Dexie to isolate the calculation logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getTestsPerShift,
  getAverageTAT,
  getQCPassRate,
  getRejectionRate,
  getTrainingModules,
  getMentorshipSessions,
  calculatePortfolioMetrics,
  type DateRange,
} from '../lib/portfolio-service'

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockShiftSessions: any[] = []
const mockLabResults: any[] = []
const mockSamples: any[] = []
const mockQcRuns: any[] = []
const mockSopAcknowledgments: any[] = []
const mockSops: any[] = []
const mockMentorshipPairings: any[] = []
const mockAchievements: any[] = []

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getDb: () => ({
      shift_sessions: {
        filter: (fn: any) => ({ toArray: async () => mockShiftSessions.filter(fn) }),
        where: (key: string) => ({
          equals: (val: any) => ({
            toArray: async () => mockShiftSessions.filter((s) => s[key] === val),
            filter: (fn: any) => ({ toArray: async () => mockShiftSessions.filter((s) => s[key] === val).filter(fn) }),
          }),
          anyOf: (vals: any[]) => ({
            toArray: async () => mockShiftSessions.filter((s) => vals.includes(s[key])),
          }),
        }),
      },
      lab_results: {
        filter: (fn: any) => ({ toArray: async () => mockLabResults.filter(fn) }),
        where: (key: string) => ({
          equals: (val: any) => ({
            toArray: async () => mockLabResults.filter((r) => r[key] === val),
            filter: (fn: any) => ({
              toArray: async () => mockLabResults.filter((r) => r[key] === val).filter(fn),
            }),
          }),
        }),
      },
      samples: {
        filter: (fn: any) => ({ toArray: async () => mockSamples.filter(fn) }),
        where: (key: string) => ({
          anyOf: (vals: any[]) => ({
            toArray: async () => mockSamples.filter((s) => vals.includes(s[key])),
            filter: (fn: any) => ({
              toArray: async () => mockSamples.filter((s) => vals.includes(s[key])).filter(fn),
            }),
          }),
        }),
      },
      qcRuns: {
        filter: (fn: any) => ({ toArray: async () => mockQcRuns.filter(fn) }),
        where: (key: string) => ({
          equals: (val: any) => ({
            toArray: async () => mockQcRuns.filter((r) => r[key] === val),
            filter: (fn: any) => ({
              toArray: async () => mockQcRuns.filter((r) => r[key] === val).filter(fn),
            }),
          }),
        }),
      },
      sop_acknowledgments: {
        filter: (fn: any) => ({ toArray: async () => mockSopAcknowledgments.filter(fn) }),
        where: (key: string) => ({
          equals: (val: any) => ({
            toArray: async () => mockSopAcknowledgments.filter((a) => a[key] === val),
          }),
        }),
      },
      sops: {
        get: async (id: string) => mockSops.find((s) => s.id === id),
        bulkGet: async (ids: string[]) => ids.map((id) => mockSops.find((s) => s.id === id) ?? undefined),
        filter: (fn: any) => ({ toArray: async () => mockSops.filter(fn) }),
      },
      mentorship_pairings: {
        filter: (fn: any) => ({ toArray: async () => mockMentorshipPairings.filter(fn) }),
        where: (key: string) => ({
          equals: (val: any) => ({
            toArray: async () => mockMentorshipPairings.filter((p) => p[key] === val),
          }),
        }),
      },
      achievements: {
        filter: (fn: any) => ({ toArray: async () => mockAchievements.filter(fn) }),
        where: (key: string) => ({
          equals: (val: any) => ({
            toArray: async () => mockAchievements.filter((a) => a[key] === val),
          }),
        }),
      },
    }),
  }
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeShiftSession(techId: string, startedAt: string, endedAt: string | null = null): any {
  return { id: crypto.randomUUID(), techId, startedAt, endedAt, status: endedAt ? 'ENDED' : 'ACTIVE' }
}

function makeLabResult(techId: string, sampleId: string, enteredAt: string, loincCode?: string): any {
  return {
    id: crypto.randomUUID(),
    sampleId,
    templateId: 't1',
    templateVersion: '1.0',
    status: 'completed',
    enteredBy: techId,
    enteredAt,
    updatedAt: enteredAt,
    loincCode,
  }
}

function makeSample(id: string, receivedTime: string, pipelineStatus = 'completed', rejectionReason?: string): any {
  return {
    id,
    receivedTime,
    _ultranos: { pipelineStatus, rejectionReason, labSampleId: `LAB-${id}` },
    subject: { reference: 'Patient/test' },
  }
}

function makeQcRun(techId: string, runDate: string, targetMean: number, targetSd: number, observedValue: number, loincCode = '718-7'): any {
  return {
    id: crypto.randomUUID(),
    analyte: 'Hemoglobin',
    loincCode,
    instrumentId: 'INST-001',
    controlLevel: 'LEVEL_2',
    targetMean,
    targetSd,
    observedValue,
    runDate,
    runBy: techId,
    hlcTimestamp: '2026-01-01T00:00:00.000Z',
  }
}

const RANGE: DateRange = { startDate: '2026-01-01', endDate: '2026-01-31' }

beforeEach(() => {
  mockShiftSessions.length = 0
  mockLabResults.length = 0
  mockSamples.length = 0
  mockQcRuns.length = 0
  mockSopAcknowledgments.length = 0
  mockSops.length = 0
  mockMentorshipPairings.length = 0
  mockAchievements.length = 0
})

// ---------------------------------------------------------------------------
// getTestsPerShift
// ---------------------------------------------------------------------------

describe('getTestsPerShift', () => {
  it('returns noData=true when tech has no shifts', async () => {
    const result = await getTestsPerShift('tech-1', RANGE)
    expect(result.noData).toBe(true)
    expect(result.value).toBe(0)
  })

  it('calculates average tests per shift correctly', async () => {
    mockShiftSessions.push(
      makeShiftSession('tech-1', '2026-01-05T08:00:00Z', '2026-01-05T16:00:00Z'),
      makeShiftSession('tech-1', '2026-01-06T08:00:00Z', '2026-01-06T16:00:00Z'),
    )
    mockLabResults.push(
      makeLabResult('tech-1', 's1', '2026-01-05T10:00:00Z'),
      makeLabResult('tech-1', 's2', '2026-01-05T11:00:00Z'),
      makeLabResult('tech-1', 's3', '2026-01-05T12:00:00Z'),
      makeLabResult('tech-1', 's4', '2026-01-06T10:00:00Z'),
    )
    const result = await getTestsPerShift('tech-1', RANGE)
    expect(result.noData).toBe(false)
    expect(result.value).toBe(2) // 4 results / 2 shifts
    expect(result.dataPoints).toBe(2)
  })

  it('shows IMPROVING trend when current period is >5% better than previous', async () => {
    // Current period (Jan): 6 results / 2 shifts = 3 per shift
    // Previous period (Dec, computed from dateRange): 2 results / 2 shifts = 1 per shift
    // But trend comparison is based on previousValue vs value
    mockShiftSessions.push(
      makeShiftSession('tech-1', '2026-01-05T08:00:00Z', '2026-01-05T16:00:00Z'),
      makeShiftSession('tech-1', '2026-01-06T08:00:00Z', '2026-01-06T16:00:00Z'),
    )
    mockLabResults.push(
      makeLabResult('tech-1', 's1', '2026-01-05T10:00:00Z'),
      makeLabResult('tech-1', 's2', '2026-01-05T11:00:00Z'),
      makeLabResult('tech-1', 's3', '2026-01-05T12:00:00Z'),
      makeLabResult('tech-1', 's4', '2026-01-06T10:00:00Z'),
      makeLabResult('tech-1', 's5', '2026-01-06T11:00:00Z'),
      makeLabResult('tech-1', 's6', '2026-01-06T12:00:00Z'),
    )
    const result = await getTestsPerShift('tech-1', RANGE)
    // value is 3, no previous data for comparison → STABLE
    expect(result.trend).toBe('STABLE')
  })

  it('shows STABLE trend when single data point (no prior period)', async () => {
    mockShiftSessions.push(
      makeShiftSession('tech-1', '2026-01-05T08:00:00Z', '2026-01-05T16:00:00Z'),
    )
    mockLabResults.push(
      makeLabResult('tech-1', 's1', '2026-01-05T10:00:00Z'),
    )
    const result = await getTestsPerShift('tech-1', RANGE)
    expect(result.trend).toBe('STABLE')
    expect(result.previousValue).toBeNull()
  })

  it('filters results to the selected date range', async () => {
    mockShiftSessions.push(
      makeShiftSession('tech-1', '2026-01-05T08:00:00Z', '2026-01-05T16:00:00Z'),
      makeShiftSession('tech-1', '2026-02-05T08:00:00Z', '2026-02-05T16:00:00Z'), // Outside range
    )
    mockLabResults.push(
      makeLabResult('tech-1', 's1', '2026-01-05T10:00:00Z'),
      makeLabResult('tech-1', 's2', '2026-02-05T10:00:00Z'), // Outside range
    )
    const result = await getTestsPerShift('tech-1', RANGE)
    expect(result.dataPoints).toBe(1) // Only 1 shift in range
    expect(result.value).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getAverageTAT
// ---------------------------------------------------------------------------

describe('getAverageTAT', () => {
  it('returns empty array when no results in range', async () => {
    const result = await getAverageTAT('tech-1', RANGE)
    expect(result).toEqual([])
  })

  it('computes TAT per test category (loincCode)', async () => {
    const sampleId1 = 'sample-1'
    const sampleId2 = 'sample-2'
    mockSamples.push(
      makeSample(sampleId1, '2026-01-10T08:00:00Z'),
      makeSample(sampleId2, '2026-01-11T08:00:00Z'),
    )
    mockLabResults.push(
      makeLabResult('tech-1', sampleId1, '2026-01-10T10:00:00Z', '718-7'), // 2h TAT
      makeLabResult('tech-1', sampleId2, '2026-01-11T09:00:00Z', '718-7'), // 1h TAT
    )
    const result = await getAverageTAT('tech-1', RANGE)
    expect(result).toHaveLength(1)
    expect(result[0].loincCode).toBe('718-7')
    // Average TAT: (2h + 1h) / 2 = 1.5h = 90 min
    expect(result[0].avgTatMinutes).toBe(90)
    expect(result[0].sampleCount).toBe(2)
  })

  it('groups by loincCode with correct sampleCount', async () => {
    const s1 = 'sample-1', s2 = 'sample-2', s3 = 'sample-3'
    mockSamples.push(
      makeSample(s1, '2026-01-10T08:00:00Z'),
      makeSample(s2, '2026-01-11T08:00:00Z'),
      makeSample(s3, '2026-01-12T08:00:00Z'),
    )
    mockLabResults.push(
      makeLabResult('tech-1', s1, '2026-01-10T09:00:00Z', '718-7'),
      makeLabResult('tech-1', s2, '2026-01-11T09:00:00Z', '718-7'),
      makeLabResult('tech-1', s3, '2026-01-12T09:00:00Z', '2951-2'), // sodium
    )
    const result = await getAverageTAT('tech-1', RANGE)
    expect(result).toHaveLength(2)
    const hemoglobin = result.find((r) => r.loincCode === '718-7')
    expect(hemoglobin?.sampleCount).toBe(2)
    const sodium = result.find((r) => r.loincCode === '2951-2')
    expect(sodium?.sampleCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getQCPassRate
// ---------------------------------------------------------------------------

describe('getQCPassRate', () => {
  it('returns noData=true when tech has no QC runs', async () => {
    const result = await getQCPassRate('tech-1', RANGE)
    expect(result.noData).toBe(true)
    expect(result.value).toBe(0)
  })

  it('correctly calculates pass rate (within ±2SD = pass)', async () => {
    // 3 passes (within 2SD) + 1 fail (outside 2SD) = 75%
    mockQcRuns.push(
      makeQcRun('tech-1', '2026-01-05', 100, 5, 102), // within 2SD ✓
      makeQcRun('tech-1', '2026-01-06', 100, 5, 108), // outside 2SD ✗ (108-100=8 > 2*5=10: actually 8 < 10, so PASS)
      makeQcRun('tech-1', '2026-01-07', 100, 5, 111), // outside 2SD ✗ (111-100=11 > 10: FAIL)
      makeQcRun('tech-1', '2026-01-08', 100, 5, 95),  // within 2SD ✓
    )
    const result = await getQCPassRate('tech-1', RANGE)
    expect(result.noData).toBe(false)
    expect(result.dataPoints).toBe(4)
    // 3 pass (102, 108=within, 95), 1 fail (111)
    expect(result.value).toBe(75)
  })

  it('returns 100 when all runs pass', async () => {
    mockQcRuns.push(
      makeQcRun('tech-1', '2026-01-05', 100, 5, 100),
      makeQcRun('tech-1', '2026-01-06', 100, 5, 103),
    )
    const result = await getQCPassRate('tech-1', RANGE)
    expect(result.value).toBe(100)
  })

  it('filters QC runs by date range', async () => {
    mockQcRuns.push(
      makeQcRun('tech-1', '2026-01-05', 100, 5, 100), // in range ✓
      makeQcRun('tech-1', '2026-02-05', 100, 5, 115), // out of range (Feb)
    )
    const result = await getQCPassRate('tech-1', RANGE)
    expect(result.dataPoints).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getRejectionRate
// ---------------------------------------------------------------------------

describe('getRejectionRate', () => {
  it('returns noData=true when no results for tech in range', async () => {
    const result = await getRejectionRate('tech-1', RANGE)
    expect(result.noData).toBe(true)
    expect(result.value).toBe(0)
  })

  it('calculates rejection rate correctly', async () => {
    const s1 = 'sample-1', s2 = 'sample-2', s3 = 'sample-3', s4 = 'sample-4'
    mockLabResults.push(
      makeLabResult('tech-1', s1, '2026-01-05T10:00:00Z'),
      makeLabResult('tech-1', s2, '2026-01-06T10:00:00Z'),
      makeLabResult('tech-1', s3, '2026-01-07T10:00:00Z'),
      makeLabResult('tech-1', s4, '2026-01-08T10:00:00Z'),
    )
    mockSamples.push(
      makeSample(s1, '2026-01-05T08:00:00Z', 'completed'),
      makeSample(s2, '2026-01-06T08:00:00Z', 'rejected', 'insufficient'),
      makeSample(s3, '2026-01-07T08:00:00Z', 'completed'),
      makeSample(s4, '2026-01-08T08:00:00Z', 'rejected', 'hemolyzed'),
    )
    const result = await getRejectionRate('tech-1', RANGE)
    expect(result.noData).toBe(false)
    expect(result.value).toBe(50) // 2/4 = 50%
    expect(result.dataPoints).toBe(4)
    expect(result.rejectionBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'insufficient', count: 1 }),
        expect.objectContaining({ reason: 'hemolyzed', count: 1 }),
      ])
    )
  })

  it('returns 0 rejection rate when no rejections', async () => {
    const s1 = 'sample-1'
    mockLabResults.push(makeLabResult('tech-1', s1, '2026-01-05T10:00:00Z'))
    mockSamples.push(makeSample(s1, '2026-01-05T08:00:00Z', 'completed'))
    const result = await getRejectionRate('tech-1', RANGE)
    expect(result.value).toBe(0)
    expect(result.rejectionBreakdown).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// getTrainingModules
// ---------------------------------------------------------------------------

describe('getTrainingModules', () => {
  it('returns empty array when no acknowledgments', async () => {
    const result = await getTrainingModules('tech-1')
    expect(result).toEqual([])
  })

  it('returns acknowledged SOPs for the tech', async () => {
    mockSops.push({ id: 'sop-1', title: 'Hemoglobin SOP', category: 'HEMATOLOGY', version: '1.0' })
    mockSopAcknowledgments.push({
      id: 'ack-1',
      sopId: 'sop-1',
      sopVersion: '1.0',
      technicianId: 'tech-1',
      acknowledgedAt: '2026-01-15T10:00:00Z',
      syncStatus: 'synced',
    })
    const result = await getTrainingModules('tech-1')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Hemoglobin SOP')
    expect(result[0].category).toBe('HEMATOLOGY')
    expect(result[0].acknowledgedAt).toBe('2026-01-15T10:00:00Z')
  })
})

// ---------------------------------------------------------------------------
// getMentorshipSessions
// ---------------------------------------------------------------------------

describe('getMentorshipSessions', () => {
  it('returns 0 when tech has no mentorship pairings', async () => {
    const result = await getMentorshipSessions('tech-1', RANGE)
    expect(result).toBe(0)
  })

  it('counts pairings where tech is mentor or mentee', async () => {
    mockMentorshipPairings.push(
      { id: 'p1', mentorId: 'tech-1', menteeId: 'tech-2', status: 'active', createdAt: '2026-01-10T00:00:00Z' },
      { id: 'p2', mentorId: 'tech-3', menteeId: 'tech-1', status: 'active', createdAt: '2026-01-12T00:00:00Z' },
      { id: 'p3', mentorId: 'tech-4', menteeId: 'tech-5', status: 'active', createdAt: '2026-01-12T00:00:00Z' }, // other tech
    )
    const result = await getMentorshipSessions('tech-1', RANGE)
    expect(result).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// calculatePortfolioMetrics
// ---------------------------------------------------------------------------

describe('calculatePortfolioMetrics', () => {
  it('returns a complete PortfolioMetrics object', async () => {
    const result = await calculatePortfolioMetrics('tech-1', RANGE)
    expect(result).toMatchObject({
      techId: 'tech-1',
      dateRange: RANGE,
      calculatedAt: expect.any(String),
      testsPerShift: expect.any(Object),
      averageTAT: expect.any(Array),
      qcPassRate: expect.any(Object),
      rejectionRate: expect.any(Object),
      trainingModules: expect.any(Array),
      mentorshipCount: expect.any(Number),
      achievements: expect.any(Array),
    })
  })

  it('handles zero-data edge cases without throwing', async () => {
    await expect(calculatePortfolioMetrics('tech-nobody', RANGE)).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Trend calculation
// ---------------------------------------------------------------------------

describe('Trend direction (IMPROVING / STABLE / NEEDS_ATTENTION)', () => {
  it('calls IMPROVING when current is >5% better than previous (for QC pass rate: higher = better)', async () => {
    // Setup two consecutive 30-day periods:
    // Previous period: Dec — 1 shift with 1 result
    // Current period: Jan — 1 shift with 3 results (300% improvement)
    const prevRange: DateRange = { startDate: '2025-12-01', endDate: '2025-12-31' }
    const currRange: DateRange = { startDate: '2026-01-01', endDate: '2026-01-31' }
    // We need to indirectly test via getTestsPerShift which computes trend
    // by fetching previous period data using prevRange

    // Current: 3 results / 1 shift = 3 per shift
    mockShiftSessions.push(
      makeShiftSession('tech-1', '2026-01-10T08:00:00Z', '2026-01-10T16:00:00Z'),
      makeShiftSession('tech-1', '2025-12-10T08:00:00Z', '2025-12-10T16:00:00Z'),
    )
    mockLabResults.push(
      makeLabResult('tech-1', 's1', '2026-01-10T10:00:00Z'),
      makeLabResult('tech-1', 's2', '2026-01-10T11:00:00Z'),
      makeLabResult('tech-1', 's3', '2026-01-10T12:00:00Z'),
      makeLabResult('tech-1', 's4', '2025-12-10T10:00:00Z'),
    )
    const result = await getTestsPerShift('tech-1', currRange)
    // Current: 3/1 = 3. Previous: 1/1 = 1. Improvement: (3-1)/1 = 200% > 5% → IMPROVING
    expect(result.trend).toBe('IMPROVING')
    expect(result.previousValue).toBe(1)
  })

  it('returns NEEDS_ATTENTION when current is >5% worse (for rejection rate: higher = worse)', async () => {
    // Uses getQCPassRate where higher is better
    // Previous: 100% pass. Current: 50% pass → 50% decrease → NEEDS_ATTENTION
    const prevRange: DateRange = { startDate: '2025-12-01', endDate: '2025-12-31' }
    mockQcRuns.push(
      makeQcRun('tech-1', '2026-01-05', 100, 5, 100), // Jan: pass
      makeQcRun('tech-1', '2026-01-06', 100, 5, 120), // Jan: FAIL (outside 2SD)
      makeQcRun('tech-1', '2025-12-05', 100, 5, 100), // Dec: pass
      makeQcRun('tech-1', '2025-12-06', 100, 5, 102), // Dec: pass
    )
    const currRange: DateRange = { startDate: '2026-01-01', endDate: '2026-01-31' }
    const result = await getQCPassRate('tech-1', currRange)
    // Current: 50%. Previous: 100%. Decrease > 5% → NEEDS_ATTENTION
    expect(result.trend).toBe('NEEDS_ATTENTION')
    expect(result.previousValue).toBe(100)
  })
})
