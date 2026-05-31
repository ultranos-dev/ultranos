/**
 * Cost-Per-Test Calculator — Story 44.2
 *
 * All functions are pure (no side effects, no Dexie reads).
 * Callers load data from Dexie and pass it in.
 * This makes testing trivial and keeps the logic reusable.
 */

import type { TestCostConfig, LabOverheadConfig } from '@/lib/db'

export interface CostAnalysis {
  testCode: string
  testName: string
  reagentCostPerTest: number
  consumableCost: number
  laborAllocation: number
  overheadAllocation: number
  totalCost: number
  currentPrice: number
  margin: number
  marginPercent: number | null  // null when currentPrice === 0
  isProfitable: boolean
  lastUpdated: string
}

export interface OverheadCalculation {
  laborCostPerTest: number
  overheadPerTest: number
  /** true when avgTestsPerShift or shiftsPerMonth is 0 — allocations set to 0 */
  divisionGuardTriggered: boolean
}

/**
 * Calculate per-test labor and overhead allocations from overhead config.
 * Guards against division by zero: if avgTestsPerShift or shiftsPerMonth is 0,
 * returns 0 allocations and sets divisionGuardTriggered = true.
 */
export function calculateOverheadAllocations(
  overhead: LabOverheadConfig,
): OverheadCalculation {
  const totalTestsPerMonth = overhead.avgTestsPerShift * overhead.shiftsPerMonth

  if (totalTestsPerMonth === 0) {
    return { laborCostPerTest: 0, overheadPerTest: 0, divisionGuardTriggered: true }
  }

  const laborCostPerTest =
    (overhead.staffCount * overhead.avgMonthlySalary) / totalTestsPerMonth

  const overheadPerTest =
    (overhead.monthlyRent +
      overhead.monthlyUtilities +
      overhead.monthlyEquipmentDepreciation +
      overhead.monthlyMiscOverhead) /
    totalTestsPerMonth

  return { laborCostPerTest, overheadPerTest, divisionGuardTriggered: false }
}

/**
 * Calculate cost analysis for a single test.
 * Uses config.laborAllocation and config.overheadAllocation directly
 * (these are pre-filled from overhead calculations or manually overridden by the manager).
 */
export function calculateCostPerTest(config: TestCostConfig): CostAnalysis {
  const totalCost =
    config.reagentCostPerTest +
    config.consumableCost +
    config.laborAllocation +
    config.overheadAllocation

  const margin = config.currentPrice - totalCost

  const marginPercent =
    config.currentPrice === 0
      ? null
      : (margin / config.currentPrice) * 100

  const isProfitable = margin >= 0

  return {
    testCode: config.testCode,
    testName: config.testName,
    reagentCostPerTest: config.reagentCostPerTest,
    consumableCost: config.consumableCost,
    laborAllocation: config.laborAllocation,
    overheadAllocation: config.overheadAllocation,
    totalCost,
    currentPrice: config.currentPrice,
    margin,
    marginPercent,
    isProfitable,
    lastUpdated: config.lastUpdated,
  }
}

/**
 * Calculate cost analysis for all test configs.
 */
export function calculateAllTestCosts(configs: TestCostConfig[]): CostAnalysis[] {
  return configs.map(calculateCostPerTest)
}

/**
 * Return a recommendation string for a subsidized (negative-margin) test.
 * Returns null for profitable tests.
 *
 * Thresholds:
 *   margin < -20%  → "Consider price increase or find alternative reagent supplier"
 *   -20% to -5%   → "Marginally subsidized — review consumable costs"
 *   -5% to 0%     → "Near break-even — minor adjustments may help"
 */
export function getRecommendation(analysis: CostAnalysis): string | null {
  if (analysis.isProfitable) return null
  if (analysis.marginPercent === null) return 'No price set — unable to calculate margin'

  if (analysis.marginPercent < -20) {
    return 'Consider price increase or find alternative reagent supplier'
  }
  if (analysis.marginPercent < -5) {
    return 'Marginally subsidized — review consumable costs'
  }
  return 'Near break-even — minor adjustments may help'
}

/**
 * Compute summary statistics across all analyses.
 */
export interface CostSummary {
  totalTests: number
  profitableCount: number
  subsidizedCount: number
  averageMarginPercent: number | null
}

export function computeCostSummary(analyses: CostAnalysis[]): CostSummary {
  if (analyses.length === 0) {
    return { totalTests: 0, profitableCount: 0, subsidizedCount: 0, averageMarginPercent: null }
  }

  const profitableCount = analyses.filter((a) => a.isProfitable).length
  const subsidizedCount = analyses.length - profitableCount

  const withPrice = analyses.filter((a) => a.marginPercent !== null)
  const averageMarginPercent =
    withPrice.length > 0
      ? withPrice.reduce((sum, a) => sum + (a.marginPercent as number), 0) / withPrice.length
      : null

  return {
    totalTests: analyses.length,
    profitableCount,
    subsidizedCount,
    averageMarginPercent,
  }
}
