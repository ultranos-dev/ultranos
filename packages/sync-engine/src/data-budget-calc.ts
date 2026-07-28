/**
 * Pure calculation functions for Data Budget Mode.
 * No side effects — used by the Zustand store and tests.
 */

export type ThresholdLevel = 'normal' | 'warning' | 'critical'

/**
 * Serialize a Date's LOCAL calendar day as YYYY-MM-DD.
 * Avoids `toISOString()`, which converts to UTC and can shift the date across
 * midnight in non-UTC timezones (both positive and negative offsets).
 */
function formatLocalDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a YYYY-MM-DD string as a LOCAL-midnight Date.
 * Avoids `new Date('YYYY-MM-DD')`, which parses as UTC midnight and, read back
 * via local getters, can land on the previous/next calendar day off-server-tz.
 */
function parseLocalDate(iso: string): Date {
  const parts = iso.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  return new Date(year, month - 1, day)
}

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

  const today = new Date()

  const remainingMB = planSizeMB - usedMB
  if (remainingMB <= 0) {
    // Already exhausted
    return formatLocalDate(today)
  }

  const daysRemaining = remainingMB / avgDailyUsageMB
  const projectedDate = new Date(today)
  projectedDate.setDate(projectedDate.getDate() + Math.round(daysRemaining))

  // Cap at the billing cycle end, but never project a date in the past
  // (a stale/past cycle end must not surface as an exhaustion date before today).
  const cycleEnd = parseLocalDate(cycleEndDate)
  const capped = projectedDate > cycleEnd ? cycleEnd : projectedDate
  const todayMidnight = parseLocalDate(formatLocalDate(today))
  const result = capped < todayMidnight ? todayMidnight : capped

  return formatLocalDate(result)
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
    return formatLocalDate(new Date(year, month, billingCycleDay))
  }
  // Cycle started last month
  return formatLocalDate(new Date(year, month - 1, billingCycleDay))
}

/**
 * Calculate the billing cycle end date (day before next cycle starts).
 */
export function getCycleEndDate(billingCycleDay: number, cycleStart: string): string {
  const start = parseLocalDate(cycleStart)
  // Next cycle start
  const nextStart = new Date(start.getFullYear(), start.getMonth() + 1, billingCycleDay)
  // End is one day before
  const end = new Date(nextStart)
  end.setDate(end.getDate() - 1)
  return formatLocalDate(end)
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
