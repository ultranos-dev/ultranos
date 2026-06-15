/**
 * Seasonal Forecast Tests — Story 54.6 Task 15.2 (AC 2, 3, 4, 5, 6)
 *
 * Unit tests for:
 *  - generateSeasonalPlan() — all 4 domains
 *  - Power forecast: analyzer hours, fuel calculation, solar vs generator
 *  - Reagent forecast: surge multiplier applied, 48.2 fallback
 *  - Staffing forecast: gap analysis, overtime estimation
 *  - Protocol recommendations: QC frequency, worklist, batch processing
 *  - No PHI validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSeasonalPlan } from '../lib/seasonal-forecast'
import type { SeasonalDemandPattern, SurgeAlert } from '../types/seasonal-planner'

// ---------------------------------------------------------------------------
// Mock Dexie
// ---------------------------------------------------------------------------

const mockReagents: Array<{
  reagentId: string
  name: string
  expectedTests: number
  testsPerformed: number
  linkedTestCode: string
  costPerUnit: number
  expiryDate: string | null
  status: string
}> = []

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => ({
    reagent_inventory: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue(mockReagents),
        })),
      })),
    },
  })),
}))

// Mock HLC to return a stable value
vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, counter: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-05-31T00:00:00.000Z-0000-test'),
}))

// Mock reagent-burndown (Story 48.2) — simulate not available: getBurndownProjections throws
vi.mock('../lib/reagent-burndown', () => ({
  getBurndownProjections: vi.fn().mockRejectedValue(new Error('Story 48.2 not yet implemented')),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePattern(overrides: Partial<SeasonalDemandPattern> = {}): SeasonalDemandPattern {
  return {
    id: 'p1',
    testCategory: 'ALL',
    testCategoryDisplay: 'All Tests',
    monthlyBaseline: [10, 10, 10, 10, 10, 60, 65, 60, 30, 20, 15, 12],
    peakMonths: [6, 7, 8],
    peakMultiplier: 3.0,
    confidence: 'high',
    computedAt: new Date().toISOString(),
    dataMonths: 24,
    ...overrides,
  }
}

function makeSurge(overrides: Partial<SurgeAlert> = {}): SurgeAlert {
  const surgeStart = new Date()
  surgeStart.setDate(surgeStart.getDate() + 10)
  const surgeEnd = new Date(surgeStart)
  surgeEnd.setDate(surgeEnd.getDate() + 30)
  return {
    testCategory: 'ALL',
    testCategoryDisplay: 'All Tests',
    surgeStartDate: surgeStart.toISOString().slice(0, 10),
    surgeEndDate: surgeEnd.toISOString().slice(0, 10),
    projectedMultiplier: 3.0,
    confidence: 'high',
    daysUntilSurge: 10,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests: generateSeasonalPlan structure
// ---------------------------------------------------------------------------

describe('generateSeasonalPlan', () => {
  beforeEach(() => {
    mockReagents.length = 0
  })

  it('returns a plan with all required domain fields', async () => {
    const patterns = [makePattern()]
    const surges: SurgeAlert[] = []

    const plan = await generateSeasonalPlan(patterns, surges, 'user-opaque-id-123')

    expect(plan).toHaveProperty('id')
    expect(plan).toHaveProperty('planPeriod.start')
    expect(plan).toHaveProperty('planPeriod.end')
    expect(plan).toHaveProperty('powerForecast')
    expect(plan).toHaveProperty('reagentForecast')
    expect(plan).toHaveProperty('staffingForecast')
    expect(plan).toHaveProperty('protocolRecommendations')
    expect(plan).toHaveProperty('deadlines')
    expect(plan).toHaveProperty('meta.lastUpdated')
    expect(plan).toHaveProperty('meta.versionId')
    expect(plan).toHaveProperty('_ultranos.createdAt')
    expect(plan).toHaveProperty('_ultranos.dataConfidence')
    expect(plan).toHaveProperty('_ultranos.surgeAlerts')
    expect(plan.status).toBe('draft')
  })

  it('planPeriod.end is 30 days after start', async () => {
    const plan = await generateSeasonalPlan([], [], 'user-abc')
    const start = new Date(plan.planPeriod.start)
    const end = new Date(plan.planPeriod.end)
    const diffDays = Math.round((end.getTime() - start.getTime()) / 86_400_000)
    expect(diffDays).toBe(30)
  })

  it('deadlines array is empty (populated by deadline-calculator)', async () => {
    const plan = await generateSeasonalPlan([makePattern()], [], 'user-abc')
    expect(plan.deadlines).toEqual([])
  })

  it('does not contain PHI — no patient IDs, names, or clinical content', async () => {
    const plan = await generateSeasonalPlan([makePattern()], [makeSurge()], 'user-opaque-id-123')

    const serialized = JSON.stringify(plan)
    // No patient identifiers
    expect(serialized).not.toMatch(/patientId/)
    expect(serialized).not.toMatch(/patientName/)
    expect(serialized).not.toMatch(/patientRef/)
    // generatedBy is opaque ID, not a real name
    expect(plan.generatedBy).toBe('user-opaque-id-123')
  })
})

// ---------------------------------------------------------------------------
// Tests: power forecast
// ---------------------------------------------------------------------------

describe('generateSeasonalPlan — powerForecast', () => {
  beforeEach(() => {
    mockReagents.length = 0
  })

  it('computes estimatedAnalyzerHours as totalTests × 0.25', async () => {
    // ALL pattern with monthlyBaseline of 40 for current month → 40 tests/day × 30 days = 1200 total
    const today = new Date()
    const monthIndex = today.getMonth()
    const baseline = Array(12).fill(10) as [number,number,number,number,number,number,number,number,number,number,number,number]
    baseline[monthIndex] = 40

    const patterns = [makePattern({ monthlyBaseline: baseline, peakMonths: [], peakMultiplier: 1 })]
    const plan = await generateSeasonalPlan(patterns, [], 'u1', {
      analyzerHoursPerTest: 0.25,
      generatorLitersPerHour: 0.5,
    })

    // 40 tests/day × 30 days = 1200 tests × 0.25 h/test = 300 analyzer-hours
    expect(plan.powerForecast.estimatedAnalyzerHours).toBe(300)
  })

  it('computes generatorFuelNeeded as analyzerHours × 0.5', async () => {
    const today = new Date()
    const monthIndex = today.getMonth()
    const baseline = Array(12).fill(10) as [number,number,number,number,number,number,number,number,number,number,number,number]
    baseline[monthIndex] = 40

    const patterns = [makePattern({ monthlyBaseline: baseline, peakMonths: [], peakMultiplier: 1 })]
    const plan = await generateSeasonalPlan(patterns, [], 'u1', {
      analyzerHoursPerTest: 0.25,
      generatorLitersPerHour: 0.5,
    })

    // 300 analyzer-hours × 0.5 L/h = 150L
    expect(plan.powerForecast.generatorFuelNeeded).toBe(150)
  })

  it('includes solarAvailabilityHours when solarHoursPerDay is configured', async () => {
    const plan = await generateSeasonalPlan([], [], 'u1', { solarHoursPerDay: 6 })
    // 6 h/day × 30 days = 180 solar hours
    expect(plan.powerForecast.solarAvailabilityHours).toBe(180)
  })

  it('solarAvailabilityHours is null when not configured', async () => {
    const plan = await generateSeasonalPlan([], [], 'u1', { solarHoursPerDay: null })
    expect(plan.powerForecast.solarAvailabilityHours).toBeNull()
  })

  it('recommendations array is non-empty', async () => {
    const plan = await generateSeasonalPlan([makePattern()], [], 'u1')
    expect(plan.powerForecast.recommendations.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: reagent forecast
// ---------------------------------------------------------------------------

describe('generateSeasonalPlan — reagentForecast', () => {
  beforeEach(() => {
    mockReagents.length = 0
  })

  it('returns empty items when no reagent inventory exists', async () => {
    const plan = await generateSeasonalPlan([], [], 'u1')
    expect(plan.reagentForecast.items).toHaveLength(0)
  })

  it('computes projectedConsumption per reagent with surge multiplier', async () => {
    mockReagents.push({
      reagentId: 'rg-001',
      name: 'Malaria RDT',
      expectedTests: 90,
      testsPerformed: 0,
      linkedTestCode: '18719-5',
      costPerUnit: 5,
      expiryDate: null,
      status: 'ACTIVE',
    })

    // Surge multiplier of 3.0 with 30-day lookahead
    const surges = [makeSurge({ projectedMultiplier: 3.0, daysUntilSurge: 5 })]
    const plan = await generateSeasonalPlan([], surges, 'u1')

    const item = plan.reagentForecast.items.find((i) => i.reagentId === 'rg-001')
    expect(item).toBeDefined()
    // Daily rate = 90/90 = 1/day, × 3.0 surge = 3/day, × 30 days = 90 projected
    expect(item!.projectedConsumption).toBe(90)
  })

  it('dataSource is linear_projection when 48.2 module unavailable', async () => {
    const plan = await generateSeasonalPlan([], [], 'u1')
    expect(plan.reagentForecast.dataSource).toBe('linear_projection')
  })

  it('computes reorderDeadline = depletionDate − supplierLeadTime − safetyBuffer', async () => {
    mockReagents.push({
      reagentId: 'rg-002',
      name: 'Glucose Strip',
      expectedTests: 60,
      testsPerformed: 0,
      linkedTestCode: '14749-6',
      costPerUnit: 2,
      expiryDate: null,
      status: 'ACTIVE',
    })

    const plan = await generateSeasonalPlan([], [], 'u1', {
      supplierLeadTimeDays: 14,
      reagentSafetyBufferDays: 7,
    })

    const item = plan.reagentForecast.items.find((i) => i.reagentId === 'rg-002')
    if (item?.reorderDeadline && item.projectedDepletionDate) {
      const depletion = new Date(item.projectedDepletionDate)
      const expectedDeadline = new Date(depletion)
      expectedDeadline.setDate(expectedDeadline.getDate() - 14 - 7)
      expect(item.reorderDeadline).toBe(expectedDeadline.toISOString().slice(0, 10))
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: staffing forecast
// ---------------------------------------------------------------------------

describe('generateSeasonalPlan — staffingForecast', () => {
  beforeEach(() => {
    mockReagents.length = 0
  })

  it('recommendedStaffCount = ceil(dailyTests / testsPerShift)', async () => {
    // 40 tests/day, 4 tests/hr/tech × 8hr = 32 tests/shift → ceil(40/32) = 2
    const today = new Date()
    const monthIndex = today.getMonth()
    const baseline = Array(12).fill(10) as [number,number,number,number,number,number,number,number,number,number,number,number]
    baseline[monthIndex] = 40

    const patterns = [makePattern({ monthlyBaseline: baseline, peakMonths: [], peakMultiplier: 1 })]
    const plan = await generateSeasonalPlan(patterns, [], 'u1', {
      testsPerTechPerHour: 4,
      currentStaffCount: 1,
    })

    expect(plan.staffingForecast.recommendedStaffCount).toBe(2)
    expect(plan.staffingForecast.currentStaffCount).toBe(1)
  })

  it('projectedDailyTests is recorded correctly', async () => {
    const today = new Date()
    const monthIndex = today.getMonth()
    const baseline = Array(12).fill(0) as [number,number,number,number,number,number,number,number,number,number,number,number]
    baseline[monthIndex] = 25

    const patterns = [makePattern({ monthlyBaseline: baseline, peakMonths: [], peakMultiplier: 1 })]
    const plan = await generateSeasonalPlan(patterns, [], 'u1')

    expect(plan.staffingForecast.projectedDailyTests).toBe(25)
  })

  it('shiftAdjustments array is non-empty', async () => {
    const plan = await generateSeasonalPlan([makePattern()], [], 'u1')
    expect(plan.staffingForecast.shiftAdjustments.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: protocol recommendations
// ---------------------------------------------------------------------------

describe('generateSeasonalPlan — protocolRecommendations', () => {
  beforeEach(() => {
    mockReagents.length = 0
  })

  it('returns at least one protocol recommendation', async () => {
    const plan = await generateSeasonalPlan([makePattern()], [], 'u1')
    expect(plan.protocolRecommendations.length).toBeGreaterThan(0)
  })

  it('QC recommendation priority is high when projectedDailyTests > 50', async () => {
    // Force high-volume surge: ALL pattern with 100 tests baseline + 3x surge multiplier
    const today = new Date()
    const monthIndex = today.getMonth()
    const baseline = Array(12).fill(0) as [number,number,number,number,number,number,number,number,number,number,number,number]
    baseline[monthIndex] = 30

    const patterns = [makePattern({ monthlyBaseline: baseline, peakMonths: [monthIndex + 1], peakMultiplier: 3.0 })]
    const surges = [makeSurge({ projectedMultiplier: 3.0, daysUntilSurge: 0 })]

    const plan = await generateSeasonalPlan(patterns, surges, 'u1')

    const qcRec = plan.protocolRecommendations.find((r) => r.category === 'qc')
    expect(qcRec).toBeDefined()
    // 30 × 3 = 90 tests/day → above 50 threshold
    expect(qcRec!.priority).toBe('high')
  })

  it('all recommendations have effectiveDate, category, priority, recommendation', async () => {
    const plan = await generateSeasonalPlan([makePattern()], [makeSurge()], 'u1')
    for (const rec of plan.protocolRecommendations) {
      expect(rec).toHaveProperty('effectiveDate')
      expect(rec).toHaveProperty('category')
      expect(rec).toHaveProperty('priority')
      expect(rec).toHaveProperty('recommendation')
      expect(typeof rec.recommendation).toBe('string')
      expect(rec.recommendation.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: confidence aggregation
// ---------------------------------------------------------------------------

describe('generateSeasonalPlan — confidence', () => {
  beforeEach(() => {
    mockReagents.length = 0
  })

  it('uses minimum confidence across all patterns', async () => {
    const patterns = [
      makePattern({ id: 'p1', confidence: 'high' }),
      makePattern({ id: 'p2', testCategory: '18719-5', confidence: 'low' }),
    ]

    const plan = await generateSeasonalPlan(patterns, [], 'u1')
    expect(plan._ultranos.dataConfidence).toBe('low')
  })

  it('defaults to high when patterns array is empty', async () => {
    const plan = await generateSeasonalPlan([], [], 'u1')
    expect(plan._ultranos.dataConfidence).toBe('high')
  })
})
