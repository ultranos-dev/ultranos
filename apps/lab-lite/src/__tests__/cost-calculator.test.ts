import { describe, it, expect } from 'vitest'
import {
  calculateOverheadAllocations,
  calculateCostPerTest,
  calculateAllTestCosts,
  getRecommendation,
  computeCostSummary,
} from '../lib/cost-calculator'
import type { TestCostConfig, LabOverheadConfig } from '../lib/db'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseOverhead: LabOverheadConfig = {
  id: 'lab-overhead',
  monthlyRent: 50000,
  monthlyUtilities: 10000,
  monthlyEquipmentDepreciation: 5000,
  monthlyMiscOverhead: 5000,
  staffCount: 3,
  avgMonthlySalary: 20000,
  avgTestsPerShift: 10,
  shiftsPerMonth: 20,
}

function makeConfig(overrides: Partial<TestCostConfig> = {}): TestCostConfig {
  return {
    testCode: '58410-2',
    testName: 'CBC',
    reagentCostPerTest: 50,
    consumableCost: 20,
    laborAllocation: 30,
    overheadAllocation: 35,
    currentPrice: 200,
    lastUpdated: '2026-05-01T00:00:00.000Z',
    updatedBy: 'prac-001',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// calculateOverheadAllocations
// ---------------------------------------------------------------------------

describe('calculateOverheadAllocations', () => {
  it('calculates labor and overhead per test correctly', () => {
    const result = calculateOverheadAllocations(baseOverhead)

    // Labor = (3 * 20000) / (10 * 20) = 60000 / 200 = 300
    expect(result.laborCostPerTest).toBeCloseTo(300, 2)
    // Overhead = (50000 + 10000 + 5000 + 5000) / 200 = 70000 / 200 = 350
    expect(result.overheadPerTest).toBeCloseTo(350, 2)
    expect(result.divisionGuardTriggered).toBe(false)
  })

  it('triggers division guard when avgTestsPerShift is 0', () => {
    const result = calculateOverheadAllocations({ ...baseOverhead, avgTestsPerShift: 0 })
    expect(result.divisionGuardTriggered).toBe(true)
    expect(result.laborCostPerTest).toBe(0)
    expect(result.overheadPerTest).toBe(0)
  })

  it('triggers division guard when shiftsPerMonth is 0', () => {
    const result = calculateOverheadAllocations({ ...baseOverhead, shiftsPerMonth: 0 })
    expect(result.divisionGuardTriggered).toBe(true)
    expect(result.laborCostPerTest).toBe(0)
    expect(result.overheadPerTest).toBe(0)
  })

  it('handles all-zero overhead gracefully', () => {
    const result = calculateOverheadAllocations({
      ...baseOverhead,
      monthlyRent: 0,
      monthlyUtilities: 0,
      monthlyEquipmentDepreciation: 0,
      monthlyMiscOverhead: 0,
      staffCount: 0,
      avgMonthlySalary: 0,
    })
    expect(result.laborCostPerTest).toBe(0)
    expect(result.overheadPerTest).toBe(0)
    expect(result.divisionGuardTriggered).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// calculateCostPerTest
// ---------------------------------------------------------------------------

describe('calculateCostPerTest', () => {
  it('calculates profitable test correctly', () => {
    // totalCost = 50 + 20 + 30 + 35 = 135; price = 200; margin = 65; marginPct = 32.5%
    const result = calculateCostPerTest(makeConfig())
    expect(result.totalCost).toBeCloseTo(135, 2)
    expect(result.margin).toBeCloseTo(65, 2)
    expect(result.marginPercent).toBeCloseTo(32.5, 1)
    expect(result.isProfitable).toBe(true)
  })

  it('calculates subsidized test correctly', () => {
    const config = makeConfig({ currentPrice: 100 })
    // margin = 100 - 135 = -35; marginPct = -35%
    const result = calculateCostPerTest(config)
    expect(result.margin).toBeCloseTo(-35, 2)
    expect(result.marginPercent).toBeCloseTo(-35, 1)
    expect(result.isProfitable).toBe(false)
  })

  it('calculates break-even test correctly', () => {
    const config = makeConfig({ currentPrice: 135 })
    const result = calculateCostPerTest(config)
    expect(result.margin).toBeCloseTo(0, 5)
    expect(result.marginPercent).toBeCloseTo(0, 5)
    expect(result.isProfitable).toBe(true)
  })

  it('returns null marginPercent when currentPrice is 0', () => {
    const config = makeConfig({ currentPrice: 0 })
    const result = calculateCostPerTest(config)
    expect(result.marginPercent).toBeNull()
    expect(result.isProfitable).toBe(false)
  })

  it('returns null marginPercent for zero-price test and does not throw', () => {
    const config = makeConfig({ reagentCostPerTest: 0, consumableCost: 0, laborAllocation: 0, overheadAllocation: 0, currentPrice: 0 })
    const result = calculateCostPerTest(config)
    expect(result.totalCost).toBe(0)
    expect(result.marginPercent).toBeNull()
  })

  it('passes through testCode and testName', () => {
    const config = makeConfig({ testCode: 'X-123', testName: 'Special Test' })
    const result = calculateCostPerTest(config)
    expect(result.testCode).toBe('X-123')
    expect(result.testName).toBe('Special Test')
  })
})

// ---------------------------------------------------------------------------
// calculateAllTestCosts
// ---------------------------------------------------------------------------

describe('calculateAllTestCosts', () => {
  it('returns empty array for empty input', () => {
    expect(calculateAllTestCosts([])).toEqual([])
  })

  it('maps each config to a cost analysis', () => {
    const configs = [
      makeConfig({ testCode: 'A', testName: 'Test A', currentPrice: 200 }),
      makeConfig({ testCode: 'B', testName: 'Test B', currentPrice: 50 }),
    ]
    const results = calculateAllTestCosts(configs)
    expect(results).toHaveLength(2)
    expect(results[0].testCode).toBe('A')
    expect(results[1].testCode).toBe('B')
    expect(results[0].isProfitable).toBe(true)
    expect(results[1].isProfitable).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getRecommendation
// ---------------------------------------------------------------------------

describe('getRecommendation', () => {
  it('returns null for profitable test', () => {
    const analysis = calculateCostPerTest(makeConfig({ currentPrice: 200 }))
    expect(getRecommendation(analysis)).toBeNull()
  })

  it('returns high-subsidy recommendation for margin < -20%', () => {
    // totalCost = 135; to get < -20%: price = 100 → margin = -35; marginPct = -35%
    const analysis = calculateCostPerTest(makeConfig({ currentPrice: 100 }))
    expect(analysis.marginPercent).toBeLessThan(-20)
    expect(getRecommendation(analysis)).toBe(
      'Consider price increase or find alternative reagent supplier',
    )
  })

  it('returns marginal-subsidy recommendation for margin between -20% and -5%', () => {
    // totalCost = 135; need marginPct in (-20, -5)
    // price = 120 → margin = -15; marginPct = -15/120 * 100 = -12.5%
    const analysis = calculateCostPerTest(makeConfig({ currentPrice: 120 }))
    expect(analysis.marginPercent).toBeGreaterThan(-20)
    expect(analysis.marginPercent).toBeLessThan(-5)
    expect(getRecommendation(analysis)).toBe('Marginally subsidized — review consumable costs')
  })

  it('returns near-break-even recommendation for margin between -5% and 0%', () => {
    // price = 134 → margin = -1; marginPct ≈ -0.75%
    const analysis = calculateCostPerTest(makeConfig({ currentPrice: 134 }))
    expect(analysis.marginPercent).toBeGreaterThan(-5)
    expect(analysis.marginPercent).toBeLessThan(0)
    expect(getRecommendation(analysis)).toBe('Near break-even — minor adjustments may help')
  })

  it('returns no-price message for zero-price test', () => {
    const analysis = calculateCostPerTest(makeConfig({ currentPrice: 0 }))
    expect(getRecommendation(analysis)).toBe('No price set — unable to calculate margin')
  })
})

// ---------------------------------------------------------------------------
// computeCostSummary
// ---------------------------------------------------------------------------

describe('computeCostSummary', () => {
  it('returns zeros and null for empty array', () => {
    const summary = computeCostSummary([])
    expect(summary.totalTests).toBe(0)
    expect(summary.profitableCount).toBe(0)
    expect(summary.subsidizedCount).toBe(0)
    expect(summary.averageMarginPercent).toBeNull()
  })

  it('counts profitable and subsidized correctly', () => {
    const analyses = [
      calculateCostPerTest(makeConfig({ testCode: 'A', currentPrice: 200 })),  // profitable
      calculateCostPerTest(makeConfig({ testCode: 'B', currentPrice: 100 })),  // subsidized
      calculateCostPerTest(makeConfig({ testCode: 'C', currentPrice: 180 })),  // profitable
    ]
    const summary = computeCostSummary(analyses)
    expect(summary.totalTests).toBe(3)
    expect(summary.profitableCount).toBe(2)
    expect(summary.subsidizedCount).toBe(1)
  })

  it('computes average margin percent excluding zero-price tests', () => {
    const analyses = [
      calculateCostPerTest(makeConfig({ testCode: 'A', currentPrice: 200 })), // marginPct = 32.5%
      calculateCostPerTest(makeConfig({ testCode: 'B', currentPrice: 0 })),   // null — excluded
    ]
    const summary = computeCostSummary(analyses)
    // Only A has a valid marginPercent
    expect(summary.averageMarginPercent).toBeCloseTo(32.5, 1)
  })

  it('returns null averageMarginPercent when all tests have zero price', () => {
    const analyses = [
      calculateCostPerTest(makeConfig({ testCode: 'A', currentPrice: 0 })),
    ]
    const summary = computeCostSummary(analyses)
    expect(summary.averageMarginPercent).toBeNull()
  })
})
