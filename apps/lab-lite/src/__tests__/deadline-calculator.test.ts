/**
 * Deadline Calculator Tests — Story 54.6 Task 15.3 (AC 5, 6)
 *
 * Unit tests for:
 *  - calculateDeadlines() with reagent, staffing, power, and protocol categories
 *  - Lead time calculations from surge start date
 *  - Overdue detection and urgency classification
 *  - Configurable lead times
 *  - Sorting (overdue first, then ascending by date)
 *  - No PHI validation
 */

import { describe, it, expect } from 'vitest'
import { calculateDeadlines } from '../lib/deadline-calculator'
import type { SeasonalPlan, ReagentForecastItem } from '../types/seasonal-planner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function makePlan(overrides: Partial<SeasonalPlan> = {}): SeasonalPlan {
  const today = new Date().toISOString()
  return {
    id: 'plan-1',
    planPeriod: { start: isoOffset(0), end: isoOffset(30) },
    generatedAt: today,
    generatedBy: 'user-opaque-id',
    status: 'draft',
    powerForecast: {
      estimatedAnalyzerHours: 150,
      solarAvailabilityHours: null,
      generatorFuelNeeded: 75,
      recommendations: ['Stock 75L diesel.'],
    },
    reagentForecast: {
      items: [],
      dataSource: 'linear_projection',
    },
    staffingForecast: {
      currentStaffCount: 2,
      projectedDailyTests: 40,
      recommendedStaffCount: 2,
      shiftAdjustments: ['Staffing is sufficient.'],
      overtimeHoursEstimate: 0,
    },
    protocolRecommendations: [],
    deadlines: [],
    meta: { lastUpdated: today, versionId: '1' },
    _ultranos: {
      createdAt: today,
      dataConfidence: 'moderate',
      surgeAlerts: [],
    },
    ...overrides,
  }
}

function makeReagentItem(overrides: Partial<ReagentForecastItem> = {}): ReagentForecastItem {
  return {
    reagentName: 'Malaria RDT',
    reagentId: 'rg-001',
    linkedLoincCode: '18719-5',
    currentStock: 50,
    projectedConsumption: 90,
    projectedDepletionDate: isoOffset(30),
    expiryDate: null,
    reorderDeadline: isoOffset(10),
    estimatedCost: 450,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests: reagent deadlines
// ---------------------------------------------------------------------------

describe('calculateDeadlines — reagent', () => {
  it('generates a deadline for each reagent with a reorderDeadline', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem(), makeReagentItem({ reagentId: 'rg-002', reagentName: 'Glucose Strip', reorderDeadline: isoOffset(15) })],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const reagentDeadlines = deadlines.filter((d) => d.category === 'reagent')
    expect(reagentDeadlines).toHaveLength(2)
  })

  it('skips reagents without a reorderDeadline', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem({ reorderDeadline: null })],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const reagentDeadlines = deadlines.filter((d) => d.category === 'reagent')
    expect(reagentDeadlines).toHaveLength(0)
  })

  it('deadline action includes reagent name', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem({ reagentName: 'Malaria RDT' })],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const dl = deadlines.find((d) => d.category === 'reagent')
    expect(dl?.action).toContain('Malaria RDT')
  })

  it('reagent deadline has leadTimeDays = supplierLeadTimeDays + reagentSafetyBufferDays', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem()],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan, { supplierLeadTimeDays: 14, reagentSafetyBufferDays: 7 })
    const dl = deadlines.find((d) => d.category === 'reagent')
    expect(dl?.leadTimeDays).toBe(21)
  })
})

// ---------------------------------------------------------------------------
// Tests: staffing deadlines
// ---------------------------------------------------------------------------

describe('calculateDeadlines — staffing', () => {
  it('generates a staffing deadline when gap > 0', () => {
    const plan = makePlan({
      staffingForecast: {
        currentStaffCount: 2,
        projectedDailyTests: 40,
        recommendedStaffCount: 4,
        shiftAdjustments: [],
        overtimeHoursEstimate: 0,
      },
    })
    const deadlines = calculateDeadlines(plan)
    const staffDeadlines = deadlines.filter((d) => d.category === 'staffing')
    expect(staffDeadlines).toHaveLength(1)
    expect(staffDeadlines[0]!.action).toContain('2 additional staff')
  })

  it('does not generate staffing deadline when no gap', () => {
    const plan = makePlan({
      staffingForecast: {
        currentStaffCount: 3,
        projectedDailyTests: 40,
        recommendedStaffCount: 2,
        shiftAdjustments: [],
        overtimeHoursEstimate: 0,
      },
    })
    const deadlines = calculateDeadlines(plan)
    const staffDeadlines = deadlines.filter((d) => d.category === 'staffing')
    expect(staffDeadlines).toHaveLength(0)
  })

  it('staffing deadline uses surge start − hrLeadTimeDays', () => {
    const surgeStart = isoOffset(20)
    const plan = makePlan({
      staffingForecast: {
        currentStaffCount: 1,
        projectedDailyTests: 80,
        recommendedStaffCount: 3,
        shiftAdjustments: [],
        overtimeHoursEstimate: 0,
      },
      _ultranos: {
        createdAt: new Date().toISOString(),
        dataConfidence: 'high',
        surgeAlerts: [{
          testCategory: 'ALL',
          testCategoryDisplay: 'All Tests',
          surgeStartDate: surgeStart,
          surgeEndDate: isoOffset(50),
          projectedMultiplier: 3,
          confidence: 'high',
          daysUntilSurge: 20,
        }],
      },
    })

    const deadlines = calculateDeadlines(plan, { hrLeadTimeDays: 14 })
    const staffDl = deadlines.find((d) => d.category === 'staffing')
    expect(staffDl).toBeDefined()

    // Expected: surge_start − 14 days = isoOffset(20 - 14 = 6)
    const expectedDate = isoOffset(6)
    expect(staffDl!.deadlineDate).toBe(expectedDate)
  })
})

// ---------------------------------------------------------------------------
// Tests: power deadlines
// ---------------------------------------------------------------------------

describe('calculateDeadlines — power', () => {
  it('generates a fuel procurement deadline', () => {
    const plan = makePlan()  // default plan has generatorFuelNeeded: 75
    const deadlines = calculateDeadlines(plan)
    const powerDeadlines = deadlines.filter((d) => d.category === 'power')
    expect(powerDeadlines).toHaveLength(1)
    expect(powerDeadlines[0]!.action).toContain('75L')
  })

  it('fuel deadline uses surge start − fuelLeadTimeDays', () => {
    const surgeStart = isoOffset(15)
    const plan = makePlan({
      _ultranos: {
        createdAt: new Date().toISOString(),
        dataConfidence: 'moderate',
        surgeAlerts: [{
          testCategory: 'ALL',
          testCategoryDisplay: 'All',
          surgeStartDate: surgeStart,
          surgeEndDate: isoOffset(45),
          projectedMultiplier: 2,
          confidence: 'moderate',
          daysUntilSurge: 15,
        }],
      },
    })

    const deadlines = calculateDeadlines(plan, { fuelLeadTimeDays: 7 })
    const powerDl = deadlines.find((d) => d.category === 'power')
    expect(powerDl).toBeDefined()

    // Expected: surge_start − 7 days = isoOffset(15 - 7 = 8)
    const expectedDate = isoOffset(8)
    expect(powerDl!.deadlineDate).toBe(expectedDate)
  })

  it('power deadline leadTimeDays matches configured fuelLeadTimeDays', () => {
    const plan = makePlan()
    const deadlines = calculateDeadlines(plan, { fuelLeadTimeDays: 10 })
    const powerDl = deadlines.find((d) => d.category === 'power')
    expect(powerDl?.leadTimeDays).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Tests: protocol deadlines
// ---------------------------------------------------------------------------

describe('calculateDeadlines — protocol', () => {
  it('always generates a team briefing protocol deadline', () => {
    const plan = makePlan()
    const deadlines = calculateDeadlines(plan)
    const protocolDl = deadlines.find(
      (d) => d.category === 'protocol' && d.action.includes('team briefing'),
    )
    expect(protocolDl).toBeDefined()
  })

  it('generates additional deadlines for high-priority protocol recommendations', () => {
    const plan = makePlan({
      protocolRecommendations: [
        {
          category: 'qc',
          recommendation: 'Increase QC run frequency to 2× daily.',
          priority: 'high',
          effectiveDate: isoOffset(5),
        },
      ],
    })
    const deadlines = calculateDeadlines(plan)
    const protocolDeadlines = deadlines.filter((d) => d.category === 'protocol')
    // Briefing + 1 high-priority recommendation = 2 protocol deadlines
    expect(protocolDeadlines).toHaveLength(2)
  })

  it('does not generate deadline for medium/low priority recommendations', () => {
    const plan = makePlan({
      protocolRecommendations: [
        {
          category: 'protocol',
          recommendation: 'Review reagent FIFO procedures.',
          priority: 'low',
          effectiveDate: isoOffset(10),
        },
        {
          category: 'batch',
          recommendation: 'Group similar tests into batches of 10.',
          priority: 'medium',
          effectiveDate: isoOffset(10),
        },
      ],
    })
    const deadlines = calculateDeadlines(plan)
    const protocolDeadlines = deadlines.filter((d) => d.category === 'protocol')
    // Only the always-present briefing deadline
    expect(protocolDeadlines).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: overdue detection and urgency classification
// ---------------------------------------------------------------------------

describe('calculateDeadlines — urgency and overdue', () => {
  it('marks past deadlines as overdue with critical urgency', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem({ reorderDeadline: isoOffset(-5) })],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const overdueDl = deadlines.find((d) => d.category === 'reagent')
    expect(overdueDl?.isOverdue).toBe(true)
    expect(overdueDl?.urgency).toBe('critical')
  })

  it('classifies deadline within 7 days as critical', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem({ reorderDeadline: isoOffset(5) })],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const dl = deadlines.find((d) => d.category === 'reagent')
    expect(dl?.urgency).toBe('critical')
    expect(dl?.isOverdue).toBe(false)
  })

  it('classifies deadline between 8-14 days as important', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem({ reorderDeadline: isoOffset(10) })],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const dl = deadlines.find((d) => d.category === 'reagent')
    expect(dl?.urgency).toBe('important')
  })

  it('classifies deadline beyond 14 days as routine', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem({ reorderDeadline: isoOffset(20) })],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const dl = deadlines.find((d) => d.category === 'reagent')
    expect(dl?.urgency).toBe('routine')
  })
})

// ---------------------------------------------------------------------------
// Tests: sorting
// ---------------------------------------------------------------------------

describe('calculateDeadlines — sorting', () => {
  it('sorts overdue deadlines before future deadlines', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [
          makeReagentItem({ reagentId: 'rg-future', reorderDeadline: isoOffset(15) }),
          makeReagentItem({ reagentId: 'rg-overdue', reorderDeadline: isoOffset(-3) }),
        ],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const reagentDls = deadlines.filter((d) => d.category === 'reagent')
    expect(reagentDls[0]!.isOverdue).toBe(true)
    expect(reagentDls[1]!.isOverdue).toBe(false)
  })

  it('sorts future deadlines by date ascending (soonest first)', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [
          makeReagentItem({ reagentId: 'rg-later', reorderDeadline: isoOffset(25) }),
          makeReagentItem({ reagentId: 'rg-soon', reorderDeadline: isoOffset(8) }),
        ],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const reagentDls = deadlines.filter((d) => d.category === 'reagent')
    expect(reagentDls[0]!.deadlineDate).toBe(isoOffset(8))
    expect(reagentDls[1]!.deadlineDate).toBe(isoOffset(25))
  })

  it('each deadline has a unique id', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [
          makeReagentItem({ reagentId: 'rg-a', reorderDeadline: isoOffset(10) }),
          makeReagentItem({ reagentId: 'rg-b', reorderDeadline: isoOffset(15) }),
        ],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const ids = deadlines.map((d) => d.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

// ---------------------------------------------------------------------------
// Tests: no PHI
// ---------------------------------------------------------------------------

describe('calculateDeadlines — no PHI', () => {
  it('deadline fields do not contain patient identifiers', () => {
    const plan = makePlan({
      reagentForecast: {
        items: [makeReagentItem()],
        dataSource: 'linear_projection',
      },
    })
    const deadlines = calculateDeadlines(plan)
    const serialized = JSON.stringify(deadlines)
    expect(serialized).not.toMatch(/patientId/)
    expect(serialized).not.toMatch(/patientName/)
    expect(serialized).not.toMatch(/patientRef/)
  })
})
