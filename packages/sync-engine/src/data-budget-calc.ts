/**
 * Pure calculation functions for Data Budget Mode.
 * No side effects — used by the Zustand store and tests.
 */

export type ThresholdLevel = 'normal' | 'warning' | 'critical'

/**
 * Determine the threshold level based on usage percentage.
 * <75% = normal, 75-90% = warning, >=90% = critical
 */
export function getThresholdLevel(usedMB: number, planSizeMB: number): ThresholdLevel {
  if (planSizeMB <= 0) return 'normal'
  const pct = usedMB / planSizeMB
  if (pct >= 0.9) return 'critical'
  if (pct >= 0.75) return 'warning'
  return 'normal'
}

/**
 * Calculate the projected date when data budget will be exhausted.
 * Returns ISO date string, or null if no usage data.
 * Capped at billing cycle end date.
 */
export function calculateProjectedExhaustion(params: {
  planSizeMB: number
  usedMB: number
  avgDailyUsageMB: number
  cycleEndDate: string
}): string | null {
  const { planSizeMB, usedMB, avgDailyUsageMB, cycleEndDate } = params

  if (avgDailyUsageMB <= 0) return null

  const remainingMB = planSizeMB - usedMB
  if (remainingMB <= 0) {
    // Already exhausted
    return new Date().toISOString().slice(0, 10)
  }

  const daysRemaining = remainingMB / avgDailyUsageMB
  const projectedDate = new Date()
  projectedDate.setDate(projectedDate.getDate() + Math.round(daysRemaining))

  const cycleEnd = new Date(cycleEndDate)
  if (projectedDate > cycleEnd) {
    return cycleEndDate
  }

  return projectedDate.toISOString().slice(0, 10)
}

/**
 * Calculate the billing cycle start date for a given cycle day and reference date.
 * Cycle day 1 means the 1st of each month.
 */
export function getCycleStartDate(billingCycleDay: number, referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const day = referenceDate.getDate()

  if (day >= billingCycleDay) {
    // Cycle started this month
    return new Date(year, month, billingCycleDay).toISOString().slice(0, 10)
  }
  // Cycle started last month
  return new Date(year, month - 1, billingCycleDay).toISOString().slice(0, 10)
}

/**
 * Calculate the billing cycle end date (day before next cycle starts).
 */
export function getCycleEndDate(billingCycleDay: number, cycleStart: string): string {
  const start = new Date(cycleStart)
  // Next cycle start
  const nextStart = new Date(start.getFullYear(), start.getMonth() + 1, billingCycleDay)
  // End is one day before
  const end = new Date(nextStart)
  end.setDate(end.getDate() - 1)
  return end.toISOString().slice(0, 10)
}

/**
 * Check whether the current date has crossed the billing cycle boundary.
 */
export function isCycleBoundaryCrossed(
  currentCycleStart: string,
  billingCycleDay: number,
  today: Date = new Date(),
): boolean {
  const expectedCycleStart = getCycleStartDate(billingCycleDay, today)
  return expectedCycleStart !== currentCycleStart
}
