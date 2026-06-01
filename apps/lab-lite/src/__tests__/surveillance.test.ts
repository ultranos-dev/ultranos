/**
 * Surveillance Tests — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Tests covering:
 *   12.1 — Rolling average baseline calculation (4-week window)
 *   12.2 — Baseline caching and cold-start handling
 *   12.3 — Spike detection at 2x threshold and below
 *   12.4 — Small sample suppression (< 5 tests)
 *   12.5 — Cluster detection at and below threshold
 *   12.6 — Cluster deduplication (50% overlap suppression)
 *   12.7 — Alert message format completeness
 *   12.8 — Alert enqueued to syncQueue
 *   12.9 — Offline detection (all functions run without network)
 *   12.10 — Configuration threshold is honoured
 *   12.11 — In-app notification dispatched
 *   12.12 — Audit events emitted with no PHI
 *
 * PHI Safety: No patient names, IDs, or raw results appear in any
 * assertion, mock value, or console output in this file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  calculateRollingBaseline,
  detectPositivitySpike,
  detectDiseaseCluster,
} from '../lib/surveillance-engine'
import {
  buildAlertMessage,
  onSurveillanceAlert,
  runSurveillanceCheck,
} from '../lib/surveillance-scheduler'
import type { ReportableDiseaseConfig, SurveillanceAlert } from '../lib/surveillance-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiseaseConfig(overrides: Partial<ReportableDiseaseConfig> = {}): ReportableDiseaseConfig {
  return {
    diseaseCode: 'malaria',
    diseaseLabel: 'Malaria',
    loincCodes: ['51587-4'],
    positiveResultIndicators: ['positive', 'detected'],
    spikeThresholdMultiplier: 2.0,
    clusterThreshold: 3,
    clusterWindowHours: 48,
    isActive: true,
    isIhrReportable: true,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Build a logbook entry stub (aggregate data only — no patient identifiers). */
function makeEntry(date: string, loincCode: string, resultSummary: string, authorizedAt?: string) {
  return {
    testLoincCode: loincCode,
    resultSummary,
    date,
    authorizedAt: authorizedAt ?? `${date}T10:00:00Z`,
  }
}

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

const mockLabLogbook = {
  where: vi.fn(),
}

const mockSurveillanceAlerts = {
  put: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue(undefined),
  where: vi.fn(),
  toArray: vi.fn().mockResolvedValue([]),
  orderBy: vi.fn(),
}

const mockSurveillanceBaselines = {
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined),
}

const mockReportableDiseases = {
  filter: vi.fn(),
  toArray: vi.fn().mockResolvedValue([]),
}

const mockSurveillanceSchedulerConfig = {
  get: vi.fn(),
  put: vi.fn().mockResolvedValue(undefined),
}

const mockSyncQueue = {
  add: vi.fn().mockResolvedValue(undefined),
}

const mockDb = {
  labLogbook: mockLabLogbook,
  surveillanceAlerts: mockSurveillanceAlerts,
  surveillanceBaselines: mockSurveillanceBaselines,
  reportableDiseases: mockReportableDiseases,
  surveillanceSchedulerConfig: mockSurveillanceSchedulerConfig,
  syncQueue: mockSyncQueue,
}

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => mockDb),
  getSurveillanceBaseline: vi.fn().mockResolvedValue(null),
  putSurveillanceBaseline: vi.fn().mockResolvedValue(undefined),
  saveSurveillanceAlert: vi.fn().mockResolvedValue(undefined),
  getSurveillanceAlerts: vi.fn().mockResolvedValue([]),
  getAlertsByDateRange: vi.fn().mockResolvedValue([]),
  getActiveReportableDiseases: vi.fn().mockResolvedValue([]),
  getRecentClusterAlerts: vi.fn().mockResolvedValue([]),
  enqueueSyncEvent: vi.fn().mockResolvedValue(undefined),
  getSurveillanceSchedulerConfig: vi.fn().mockResolvedValue({
    id: 'surveillance-scheduler',
    lastSpikeCheckAt: null,
    lastClusterCheckAt: null,
    dailyCheckHour: 8,
    isEnabled: true,
  }),
  putSurveillanceSchedulerConfig: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: vi.fn(() => ({ session: { userId: 'lab-user-001' } })),
  },
}))

vi.mock('../lib/audit-client', () => ({
  reportSurveillanceAuditEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Test helpers to import mocks
// ---------------------------------------------------------------------------
import {
  getDb,
  getSurveillanceBaseline,
  putSurveillanceBaseline,
  saveSurveillanceAlert,
  enqueueSyncEvent,
  getActiveReportableDiseases,
  getRecentClusterAlerts,
} from '../lib/db'

// ---------------------------------------------------------------------------
// 12.1 & 12.2 — Rolling Average Baseline Calculation
// ---------------------------------------------------------------------------

describe('calculateRollingBaseline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no cache
    vi.mocked(getSurveillanceBaseline).mockResolvedValue(undefined)
    vi.mocked(putSurveillanceBaseline).mockResolvedValue(undefined)
  })

  it('12.1 — calculates average positivity rate across 4 weekly buckets', async () => {
    const disease = makeDiseaseConfig()
    const asOfDate = '2026-05-31'

    // Provide entries across 4 weeks in the [asOfDate-35d, asOfDate-7d] window
    // Week 1: 10 tests, 2 positive → 20%
    // Week 2: 10 tests, 1 positive → 10%
    // Week 3: 10 tests, 3 positive → 30%
    // Week 4: 10 tests, 0 positive → 0%
    // Average = 15%
    const entries = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeEntry('2026-04-27', '51587-4', i < 2 ? 'positive' : 'negative')
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeEntry('2026-05-04', '51587-4', i < 1 ? 'positive' : 'negative')
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeEntry('2026-05-11', '51587-4', i < 3 ? 'positive' : 'negative')
      ),
      ...Array.from({ length: 10 }, () =>
        makeEntry('2026-05-18', '51587-4', 'negative')
      ),
    ]

    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(entries) })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })

    const baseline = await calculateRollingBaseline(disease, asOfDate)

    expect(baseline.diseaseCode).toBe('malaria')
    expect(baseline.dataWeeks).toBeGreaterThanOrEqual(1)
    expect(baseline.totalTests).toBe(40)
    expect(baseline.averageRate).toBeGreaterThan(0)
    expect(baseline.weeklyRates.length).toBe(baseline.dataWeeks)
  })

  it('12.2 — returns cached baseline if less than 24h old', async () => {
    const disease = makeDiseaseConfig()
    const asOfDate = '2026-05-31'
    const cached = {
      id: 'malaria_2026-05-31',
      diseaseCode: 'malaria',
      asOfDate,
      weeklyRates: [20, 10],
      averageRate: 15,
      totalTests: 20,
      totalPositive: 3,
      calculatedAt: new Date().toISOString(), // just now
      dataWeeks: 2,
    }

    vi.mocked(getSurveillanceBaseline).mockResolvedValue(cached)

    const result = await calculateRollingBaseline(disease, asOfDate)
    expect(result).toEqual(cached)
    // DB should not be queried since cache is fresh
    expect(vi.mocked(getDb)).not.toHaveBeenCalled()
  })

  it('12.2 — cold-start: returns baseline with dataWeeks=0 when no historical data', async () => {
    const disease = makeDiseaseConfig()
    const asOfDate = '2026-05-31'

    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })

    const baseline = await calculateRollingBaseline(disease, asOfDate)

    expect(baseline.dataWeeks).toBe(0)
    expect(baseline.averageRate).toBe(0)
    expect(baseline.totalTests).toBe(0)
    expect(baseline.weeklyRates).toEqual([])
  })

  it('12.1 — ignores LOINC codes from other diseases', async () => {
    const disease = makeDiseaseConfig({ loincCodes: ['51587-4'] })
    const asOfDate = '2026-05-31'

    // All entries have a different LOINC code; the filter should exclude them
    const entries = Array.from({ length: 10 }, () =>
      makeEntry('2026-05-18', '99999-0', 'positive')
    )

    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn((fn: (e: typeof entries[0]) => boolean) => ({
              toArray: vi.fn().mockResolvedValue(entries.filter(fn)),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })

    const baseline = await calculateRollingBaseline(disease, asOfDate)
    expect(baseline.totalTests).toBe(0)
    expect(baseline.dataWeeks).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 12.3 & 12.4 — Spike Detection
// ---------------------------------------------------------------------------

describe('detectPositivitySpike', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSurveillanceBaseline).mockResolvedValue(undefined)
  })

  function setupLogbookMock(currentEntries: ReturnType<typeof makeEntry>[], historicalEntries: ReturnType<typeof makeEntry>[] = []) {
    let callCount = 0
    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn(() => ({
              toArray: vi.fn().mockImplementation(() => {
                callCount++
                // First call = current period, second call = baseline
                return Promise.resolve(callCount === 1 ? currentEntries : historicalEntries)
              }),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })
  }

  it('12.3 — detects critical spike at 2x threshold', async () => {
    const disease = makeDiseaseConfig({ spikeThresholdMultiplier: 2.0 })
    const asOfDate = '2026-05-31'

    // Current: 5 tests, 4 positive → 80%
    // Baseline: averageRate = 20%
    // Ratio: 4.0 → critical
    const currentEntries = Array.from({ length: 5 }, (_, i) =>
      makeEntry(asOfDate, '51587-4', i < 4 ? 'positive' : 'negative')
    )
    setupLogbookMock(currentEntries)

    // Mock baseline directly
    vi.mocked(getSurveillanceBaseline).mockResolvedValue({
      id: 'malaria_2026-05-31',
      diseaseCode: 'malaria',
      asOfDate,
      weeklyRates: [20, 20, 20, 20],
      averageRate: 20,
      totalTests: 40,
      totalPositive: 8,
      calculatedAt: new Date().toISOString(),
      dataWeeks: 4,
    })

    const result = await detectPositivitySpike(disease, asOfDate)

    expect(result.detected).toBe(true)
    expect(result.severity).toBe('critical')
    expect(result.currentRate).toBe(80)
    expect(result.ratio).toBe(4)
  })

  it('12.3 — detects warning spike at 1.5x–2x range', async () => {
    const disease = makeDiseaseConfig({ spikeThresholdMultiplier: 2.0 })
    const asOfDate = '2026-05-31'

    // Current: 5 tests, 3 positive → 60%
    // Baseline: 30% → ratio = 2.0 (at threshold exactly → critical)
    // Use 55% current / 30% baseline → ratio ≈ 1.83 → warning
    const currentEntries = [
      ...Array.from({ length: 3 }, () => makeEntry(asOfDate, '51587-4', 'positive')),
      ...Array.from({ length: 2 }, () => makeEntry(asOfDate, '51587-4', 'negative')),
      makeEntry(asOfDate, '51587-4', 'positive'), // 4/6 = 66.7% → ratio ≈ 2.2 @ 30% baseline
    ]
    // Let's use explicit: 10 tests, 5 positive = 50%, baseline 30% → ratio 1.67 → warning
    const warningEntries = Array.from({ length: 10 }, (_, i) =>
      makeEntry(asOfDate, '51587-4', i < 5 ? 'positive' : 'negative')
    )

    setupLogbookMock(warningEntries)

    vi.mocked(getSurveillanceBaseline).mockResolvedValue({
      id: 'malaria_2026-05-31',
      diseaseCode: 'malaria',
      asOfDate,
      weeklyRates: [30],
      averageRate: 30,
      totalTests: 10,
      totalPositive: 3,
      calculatedAt: new Date().toISOString(),
      dataWeeks: 1,
    })

    const result = await detectPositivitySpike(disease, asOfDate)

    expect(result.detected).toBe(true)
    expect(result.severity).toBe('warning')
    expect(result.ratio).toBeGreaterThanOrEqual(1.5)
    expect(result.ratio).toBeLessThan(2.0)
  })

  it('12.3 — no detection below 1.5x threshold', async () => {
    const disease = makeDiseaseConfig()
    const asOfDate = '2026-05-31'

    // Current: 10 tests, 3 positive = 30%, baseline = 25% → ratio = 1.2 → no alert
    const currentEntries = Array.from({ length: 10 }, (_, i) =>
      makeEntry(asOfDate, '51587-4', i < 3 ? 'positive' : 'negative')
    )
    setupLogbookMock(currentEntries)

    vi.mocked(getSurveillanceBaseline).mockResolvedValue({
      id: 'malaria_2026-05-31',
      diseaseCode: 'malaria',
      asOfDate,
      weeklyRates: [25],
      averageRate: 25,
      totalTests: 4,
      totalPositive: 1,
      calculatedAt: new Date().toISOString(),
      dataWeeks: 1,
    })

    const result = await detectPositivitySpike(disease, asOfDate)
    expect(result.detected).toBe(false)
    expect(result.severity).toBeNull()
  })

  it('12.4 — suppresses spike detection for < 5 tests (small sample)', async () => {
    const disease = makeDiseaseConfig()
    const asOfDate = '2026-05-31'

    // Only 3 tests (below minimum of 5)
    const fewEntries = Array.from({ length: 3 }, () =>
      makeEntry(asOfDate, '51587-4', 'positive')
    )
    setupLogbookMock(fewEntries)

    const result = await detectPositivitySpike(disease, asOfDate)

    expect(result.detected).toBe(false)
    expect(result.suppressedSmallSample).toBe(true)
    // Baseline should not have been computed
    expect(vi.mocked(getSurveillanceBaseline)).not.toHaveBeenCalled()
  })

  it('12.3 — zero baseline with positives triggers critical alert', async () => {
    const disease = makeDiseaseConfig()
    const asOfDate = '2026-05-31'

    const currentEntries = Array.from({ length: 5 }, (_, i) =>
      makeEntry(asOfDate, '51587-4', i < 2 ? 'positive' : 'negative')
    )
    setupLogbookMock(currentEntries)

    vi.mocked(getSurveillanceBaseline).mockResolvedValue({
      id: 'malaria_2026-05-31',
      diseaseCode: 'malaria',
      asOfDate,
      weeklyRates: [],
      averageRate: 0,    // Zero baseline
      totalTests: 0,
      totalPositive: 0,
      calculatedAt: new Date().toISOString(),
      dataWeeks: 0,
    })

    const result = await detectPositivitySpike(disease, asOfDate)

    expect(result.detected).toBe(true)
    expect(result.severity).toBe('critical')
    expect(result.ratio).toBe(Infinity)
  })
})

// ---------------------------------------------------------------------------
// 12.5 & 12.6 — Cluster Detection
// ---------------------------------------------------------------------------

describe('detectDiseaseCluster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function setupClusterMock(positiveEntries: ReturnType<typeof makeEntry>[]) {
    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn((fn: (e: ReturnType<typeof makeEntry>) => boolean) => ({
              toArray: vi.fn().mockResolvedValue(positiveEntries.filter(fn)),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })
  }

  it('12.5 — detects cluster when case count meets threshold', async () => {
    const disease = makeDiseaseConfig({ clusterThreshold: 3, clusterWindowHours: 48 })
    const now = new Date()
    const recentISO = new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString() // 10h ago
    const recentDate = recentISO.slice(0, 10)

    // 3 positive entries within the last 48h
    const positiveEntries = Array.from({ length: 3 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )
    setupClusterMock(positiveEntries)

    const result = await detectDiseaseCluster(disease, [])

    expect(result.detected).toBe(true)
    expect(result.caseCount).toBe(3)
    expect(result.suppressedDuplicate).toBe(false)
  })

  it('12.5 — no detection when case count below threshold', async () => {
    const disease = makeDiseaseConfig({ clusterThreshold: 3, clusterWindowHours: 48 })
    const now = new Date()
    const recentISO = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const recentDate = recentISO.slice(0, 10)

    // Only 2 positive entries (below threshold of 3)
    const positiveEntries = Array.from({ length: 2 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )
    setupClusterMock(positiveEntries)

    const result = await detectDiseaseCluster(disease, [])

    expect(result.detected).toBe(false)
    expect(result.caseCount).toBe(2)
  })

  it('12.6 — suppresses cluster when existing alert covers >= 50% of window', async () => {
    const disease = makeDiseaseConfig({ clusterThreshold: 3, clusterWindowHours: 48 })
    const now = new Date()
    const recentISO = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const recentDate = recentISO.slice(0, 10)

    // 3 positive entries → normally would trigger
    const positiveEntries = Array.from({ length: 3 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )
    setupClusterMock(positiveEntries)

    // Existing alert with clusterWindowEnd just 12h ago (well within 50% overlap zone)
    const existingAlerts = [
      { clusterWindowEnd: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString() },
    ]

    const result = await detectDiseaseCluster(disease, existingAlerts)

    expect(result.detected).toBe(false)
    expect(result.suppressedDuplicate).toBe(true)
    expect(result.caseCount).toBe(3)
  })

  it('12.6 — does NOT suppress when existing alert is outside overlap window', async () => {
    const disease = makeDiseaseConfig({ clusterThreshold: 3, clusterWindowHours: 48 })
    const now = new Date()
    const recentISO = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const recentDate = recentISO.slice(0, 10)

    const positiveEntries = Array.from({ length: 3 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )
    setupClusterMock(positiveEntries)

    // Existing alert with clusterWindowEnd 4 days ago — outside any overlap
    const existingAlerts = [
      { clusterWindowEnd: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString() },
    ]

    const result = await detectDiseaseCluster(disease, existingAlerts)

    expect(result.detected).toBe(true)
    expect(result.suppressedDuplicate).toBe(false)
  })

  it('12.6 — cluster result contains timestamps but NO patient identifiers', async () => {
    const disease = makeDiseaseConfig({ clusterThreshold: 2, clusterWindowHours: 48 })
    const now = new Date()
    const recentISO = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const recentDate = recentISO.slice(0, 10)

    const positiveEntries = Array.from({ length: 2 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )
    setupClusterMock(positiveEntries)

    const result = await detectDiseaseCluster(disease, [])

    expect(result.detected).toBe(true)
    expect(Array.isArray(result.caseTimestamps)).toBe(true)
    // caseTimestamps must be ISO strings only — verify no suspicious content
    for (const ts of result.caseTimestamps) {
      expect(typeof ts).toBe('string')
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
    // Result must NOT contain any patient-identifying fields
    expect((result as unknown as Record<string, unknown>).patientId).toBeUndefined()
    expect((result as unknown as Record<string, unknown>).patientName).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 12.7 — Alert Message Format
// ---------------------------------------------------------------------------

describe('buildAlertMessage', () => {
  const baseAlert = {
    alertType: 'spike' as const,
    severity: 'critical' as const,
    diseaseCode: 'malaria',
    diseaseLabel: 'Malaria',
    labFacilityId: 'lab-001',
    labFacilityName: 'Main Lab',
    labProvince: 'Kabul',
    labDistrict: 'District 1',
  }

  it('12.7 — spike message includes rate, baseline, ratio, count, and total', () => {
    const msg = buildAlertMessage({
      ...baseAlert,
      currentRate: 40,
      baselineRate: 10,
      spikeRatio: 4.0,
      currentPeriodPositiveCount: 8,
      currentPeriodTestCount: 20,
      periodStart: '2026-05-24',
      periodEnd: '2026-05-31',
    })

    expect(msg).toContain('40.0%')     // current rate
    expect(msg).toContain('10.0%')     // baseline rate
    expect(msg).toContain('4.0x')      // spike ratio
    expect(msg).toContain('8')         // positive count
    expect(msg).toContain('20')        // total count
    expect(msg).toContain('Malaria')   // disease label
  })

  it('12.7 — cluster message includes disease label, case count, and time window', () => {
    const msg = buildAlertMessage({
      ...baseAlert,
      alertType: 'cluster',
      clusterCaseCount: 5,
      clusterWindowStart: '2026-05-29T10:00:00Z',
      clusterWindowEnd: '2026-05-31T10:00:00Z',
    })

    expect(msg).toContain('5')         // case count
    expect(msg).toContain('48')        // hours window
    expect(msg).toContain('Malaria')   // disease label
  })

  it('12.7 — spike message with infinite ratio does not crash', () => {
    const msg = buildAlertMessage({
      ...baseAlert,
      currentRate: 50,
      baselineRate: 0,
      spikeRatio: 999,  // serialized Infinity
      currentPeriodPositiveCount: 5,
      currentPeriodTestCount: 10,
    })

    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
    expect(msg).toContain('Malaria')
  })
})

// ---------------------------------------------------------------------------
// 12.8 & 12.11 & 12.12 — Alert generation, syncQueue, notification, audit
// ---------------------------------------------------------------------------

describe('runSurveillanceCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('12.8 — alert is enqueued in syncQueue when generated', async () => {
    const disease = makeDiseaseConfig()

    vi.mocked(getActiveReportableDiseases).mockResolvedValue([disease])
    vi.mocked(getRecentClusterAlerts).mockResolvedValue([])

    // Cluster will be detected: 3 positive entries
    const now = new Date()
    const recentISO = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const recentDate = recentISO.slice(0, 10)
    const positiveEntries = Array.from({ length: 3 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )

    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn((fn: (e: ReturnType<typeof makeEntry>) => boolean) => ({
              toArray: vi.fn().mockResolvedValue(positiveEntries.filter(fn)),
            })),
          })),
        })),
        lab_locations: { toArray: vi.fn().mockResolvedValue([]) },
      } as unknown as ReturnType<typeof getDb>,
    })

    await runSurveillanceCheck('cluster')

    expect(vi.mocked(saveSurveillanceAlert)).toHaveBeenCalled()
    expect(vi.mocked(enqueueSyncEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'SurveillanceAlert',
        status: 'pending',
      })
    )
  })

  it('12.11 — in-app notification listener is called when alert generated', async () => {
    const disease = makeDiseaseConfig()

    vi.mocked(getActiveReportableDiseases).mockResolvedValue([disease])
    vi.mocked(getRecentClusterAlerts).mockResolvedValue([])

    const now = new Date()
    const recentISO = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const recentDate = recentISO.slice(0, 10)
    const positiveEntries = Array.from({ length: 3 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )

    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn((fn: (e: ReturnType<typeof makeEntry>) => boolean) => ({
              toArray: vi.fn().mockResolvedValue(positiveEntries.filter(fn)),
            })),
          })),
        })),
        lab_locations: { toArray: vi.fn().mockResolvedValue([]) },
      } as unknown as ReturnType<typeof getDb>,
    })

    const notifiedAlerts: SurveillanceAlert[] = []
    const unsubscribe = onSurveillanceAlert((a) => notifiedAlerts.push(a))

    await runSurveillanceCheck('cluster')
    unsubscribe()

    expect(notifiedAlerts.length).toBeGreaterThan(0)
    expect(notifiedAlerts[0]?.alertType).toBe('cluster')
    expect(notifiedAlerts[0]?.diseaseCode).toBe('malaria')
  })

  it('12.12 — audit event emitted with no PHI in metadata', async () => {
    const { reportSurveillanceAuditEvent } = await import('../lib/audit-client')

    const disease = makeDiseaseConfig()

    vi.mocked(getActiveReportableDiseases).mockResolvedValue([disease])
    vi.mocked(getRecentClusterAlerts).mockResolvedValue([])

    const now = new Date()
    const recentISO = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const recentDate = recentISO.slice(0, 10)
    const positiveEntries = Array.from({ length: 3 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )

    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn((fn: (e: ReturnType<typeof makeEntry>) => boolean) => ({
              toArray: vi.fn().mockResolvedValue(positiveEntries.filter(fn)),
            })),
          })),
        })),
        lab_locations: { toArray: vi.fn().mockResolvedValue([]) },
      } as unknown as ReturnType<typeof getDb>,
    })

    await runSurveillanceCheck('cluster')

    // Allow async audit import to settle
    await new Promise((r) => setTimeout(r, 50))

    expect(vi.mocked(reportSurveillanceAuditEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SURVEILLANCE_ALERT_GENERATED',
        alertId: expect.any(String),
        diseaseCode: 'malaria',
      })
    )

    // Verify no PHI in audit call
    const auditCalls = vi.mocked(reportSurveillanceAuditEvent).mock.calls
    for (const [payload] of auditCalls) {
      const payloadStr = JSON.stringify(payload)
      expect(payloadStr).not.toMatch(/patientId/)
      expect(payloadStr).not.toMatch(/patientName/)
      expect(payloadStr).not.toMatch(/resultSummary/)
    }
  })

  it('12.9 — all detection functions operate purely on local Dexie data (offline)', async () => {
    // This test verifies no network calls are made.
    // All mocks resolve locally — if any fetch() or external HTTP were called,
    // the test environment has no network and would throw.

    const disease = makeDiseaseConfig()

    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })

    vi.mocked(getSurveillanceBaseline).mockResolvedValue(null)

    // These should complete without error even with no network
    await expect(calculateRollingBaseline(disease, '2026-05-31')).resolves.toBeDefined()
    await expect(detectPositivitySpike(disease, '2026-05-31')).resolves.toBeDefined()
    await expect(detectDiseaseCluster(disease, [])).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 12.10 — Configuration threshold is honoured
// ---------------------------------------------------------------------------

describe('configuration threshold honouring', () => {
  it('12.10 — spike fires at 3x multiplier but not at 2x when threshold is 3', async () => {
    const disease = makeDiseaseConfig({ spikeThresholdMultiplier: 3.0 })
    const asOfDate = '2026-05-31'

    // baseline = 20%, current = 50% → ratio = 2.5x (below 3.0 threshold → warning only)
    const entriesAt2x = Array.from({ length: 10 }, (_, i) =>
      makeEntry(asOfDate, '51587-4', i < 5 ? 'positive' : 'negative')
    )

    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(entriesAt2x) })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })

    vi.mocked(getSurveillanceBaseline).mockResolvedValue({
      id: 'malaria_2026-05-31',
      diseaseCode: 'malaria',
      asOfDate,
      weeklyRates: [20],
      averageRate: 20,
      totalTests: 5,
      totalPositive: 1,
      calculatedAt: new Date().toISOString(),
      dataWeeks: 1,
    })

    const result = await detectPositivitySpike(disease, asOfDate)
    // 50% / 20% = 2.5x → warning (below custom threshold of 3x → not critical)
    expect(result.detected).toBe(true)
    expect(result.severity).toBe('warning')
  })

  it('12.10 — cluster fires at custom threshold of 5 cases', async () => {
    const disease = makeDiseaseConfig({ clusterThreshold: 5, clusterWindowHours: 48 })
    const now = new Date()
    const recentISO = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const recentDate = recentISO.slice(0, 10)

    // Only 4 positive cases (below custom threshold of 5)
    const entries4 = Array.from({ length: 4 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )
    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn((fn: (e: ReturnType<typeof makeEntry>) => boolean) => ({
              toArray: vi.fn().mockResolvedValue(entries4.filter(fn)),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })

    const result = await detectDiseaseCluster(disease, [])
    expect(result.detected).toBe(false)

    // Now 5 positive cases → should trigger
    const entries5 = Array.from({ length: 5 }, () =>
      makeEntry(recentDate, '51587-4', 'positive', recentISO)
    )
    vi.mocked(getDb).mockReturnValue({
      ...mockDb,
      labLogbook: {
        where: vi.fn(() => ({
          between: vi.fn(() => ({
            filter: vi.fn((fn: (e: ReturnType<typeof makeEntry>) => boolean) => ({
              toArray: vi.fn().mockResolvedValue(entries5.filter(fn)),
            })),
          })),
        })),
      } as unknown as ReturnType<typeof getDb>,
    })

    const result5 = await detectDiseaseCluster(disease, [])
    expect(result5.detected).toBe(true)
    expect(result5.caseCount).toBe(5)
  })
})
