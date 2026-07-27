/**
 * Story 54.6 — Historical Demand Pattern Analysis
 *
 * Analyzes local Dexie test history to identify seasonal demand patterns.
 * Groups completed tests by LOINC category and calendar month, calculates
 * monthly baselines, and identifies peak periods.
 *
 * NO PHI — all analysis is on aggregate counts. Lab results are grouped
 * by LOINC code only; patient identifiers are never read or stored.
 *
 * Confidence levels:
 *   - 'low': 6+ months of data
 *   - 'moderate': 12+ months of data
 *   - 'high': 24+ months of data
 */

import { getDb } from './db'
import type { SeasonalDemandPattern, SurgeAlert, PatternConfidence } from '@/types/seasonal-planner'

const MIN_MONTHS_LOW = 6
const MIN_MONTHS_MODERATE = 12
const MIN_MONTHS_HIGH = 24

/**
 * Determine confidence level based on the number of distinct calendar months
 * for which we have test data.
 */
function computeConfidence(dataMonths: number): PatternConfidence {
  if (dataMonths >= MIN_MONTHS_HIGH) return 'high'
  if (dataMonths >= MIN_MONTHS_MODERATE) return 'moderate'
  return 'low'
}

/**
 * Parse an ISO timestamp and return { year, month } (month is 1-indexed).
 */
function parseYearMonth(isoTs: string): { year: number; month: number } | null {
  const d = new Date(isoTs)
  if (isNaN(d.getTime())) return null
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Analyze historical lab result data from Dexie to compute seasonal demand
 * patterns per LOINC category.
 *
 * Integration with Story 50.1 HMIS data: if HMIS monthly reports exist,
 * their testCategorySummary totals supplement locally computed counts for
 * months where local data may be sparse (e.g., new installation).
 *
 * Returns one pattern per LOINC category, plus a synthetic "ALL" pattern
 * representing aggregate test volume.
 */
export async function analyzeHistoricalDemand(): Promise<SeasonalDemandPattern[]> {
  const db = getDb()

  // Step 1: Aggregate local lab_results by loincCode and calendar month
  const allResults = await db.lab_results
    .where('status')
    .equals('completed')
    .toArray()

  // Map: loincCode -> monthKey (YYYY-MM) -> count
  const localCounts = new Map<string, Map<string, number>>()
  const allMonthKeys = new Set<string>()

  for (const result of allResults) {
    const code = result.loincCode ?? 'UNKNOWN'
    const parsed = result.enteredAt ? parseYearMonth(result.enteredAt) : null
    if (!parsed) continue
    const monthKey = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`
    allMonthKeys.add(monthKey)

    if (!localCounts.has(code)) localCounts.set(code, new Map())
    const byMonth = localCounts.get(code)!
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + 1)
  }

  // Step 2: Supplement with HMIS monthly report aggregates (Story 50.1)
  try {
    const hmisReports = await db.hmisReports.toArray()
    for (const report of hmisReports) {
      const monthKey = `${report.reportYear}-${String(report.reportMonth).padStart(2, '0')}`
      allMonthKeys.add(monthKey)

      for (const cat of report.testCategorySummary) {
        const code = cat.loincCode
        if (!localCounts.has(code)) localCounts.set(code, new Map())
        const byMonth = localCounts.get(code)!
        // Only use HMIS data if we have no local data for that month/category
        if (!byMonth.has(monthKey)) {
          byMonth.set(monthKey, cat.totalPerformed)
        }
      }
    }
  } catch {
    // HMIS table may not be populated — not an error, just use local data
  }

  if (allMonthKeys.size < MIN_MONTHS_LOW) {
    // Not enough data for any pattern — return a single low-confidence catch-all
    return [buildEmptyPattern(allMonthKeys.size)]
  }

  const sortedMonths = Array.from(allMonthKeys).sort()
  const dataMonths = sortedMonths.length

  const patterns: SeasonalDemandPattern[] = []

  for (const [loincCode, byMonth] of localCounts) {
    const pattern = buildPattern(loincCode, byMonth, sortedMonths, dataMonths)
    patterns.push(pattern)
  }

  // Add aggregate "ALL" pattern
  const allCounts = new Map<string, number>()
  for (const byMonth of localCounts.values()) {
    for (const [mk, count] of byMonth) {
      allCounts.set(mk, (allCounts.get(mk) ?? 0) + count)
    }
  }
  if (allCounts.size > 0) {
    patterns.push(buildPattern('ALL', allCounts, sortedMonths, dataMonths, 'All Tests'))
  }

  return patterns
}

/**
 * Build a SeasonalDemandPattern for a given LOINC code from month-keyed counts.
 */
function buildPattern(
  loincCode: string,
  byMonth: Map<string, number>,
  sortedMonths: string[],
  dataMonths: number,
  displayName?: string,
): SeasonalDemandPattern {
  // Sum counts per calendar month (1–12) across all years
  const monthSums = new Array(12).fill(0) as number[]
  const monthDays = new Array(12).fill(0) as number[]

  for (const [mk, count] of byMonth) {
    const parts = mk.split('-')
    const monthIdx = parseInt(parts[1] ?? '1', 10) - 1
    if (monthIdx >= 0 && monthIdx < 12) {
      monthSums[monthIdx] += count
      monthDays[monthIdx] += 30  // approximate
    }
  }

  // Compute average daily count per month
  const monthlyBaseline = monthSums.map((sum, i) =>
    monthDays[i] > 0 ? parseFloat((sum / (monthDays[i] / 30)).toFixed(2)) : 0,
  ) as [number, number, number, number, number, number, number, number, number, number, number, number]

  const avgBaseline = monthlyBaseline.reduce((a, b) => a + b, 0) / 12
  if (avgBaseline === 0) {
    return {
      id: crypto.randomUUID(),
      testCategory: loincCode,
      testCategoryDisplay: displayName ?? loincCode,
      monthlyBaseline,
      peakMonths: [],
      peakMultiplier: 1,
      confidence: 'low',
      computedAt: new Date().toISOString(),
      dataMonths,
      warning: 'No activity recorded for this category.',
    }
  }

  // Identify peak months: months where average daily count > 1.5x overall average
  const PEAK_THRESHOLD = 1.5
  const peakMonths = monthlyBaseline
    .map((avg, idx) => ({ avg, month: idx + 1 }))
    .filter(({ avg }) => avg > avgBaseline * PEAK_THRESHOLD)
    .map(({ month }) => month)

  // Peak multiplier = max monthly average / overall average
  const maxMonthly = Math.max(...monthlyBaseline)
  const peakMultiplier = avgBaseline > 0
    ? parseFloat((maxMonthly / avgBaseline).toFixed(2))
    : 1

  const confidence = computeConfidence(dataMonths)
  const warning = dataMonths < MIN_MONTHS_MODERATE
    ? `Only ${dataMonths} month(s) of data — consider supplementing with HMIS reports for higher confidence.`
    : undefined

  return {
    id: crypto.randomUUID(),
    testCategory: loincCode,
    testCategoryDisplay: displayName ?? loincCode,
    monthlyBaseline,
    peakMonths,
    peakMultiplier,
    confidence,
    computedAt: new Date().toISOString(),
    dataMonths,
    warning,
  }
}

/**
 * Returns a placeholder pattern when there is insufficient data.
 */
function buildEmptyPattern(dataMonths: number): SeasonalDemandPattern {
  return {
    id: crypto.randomUUID(),
    testCategory: 'ALL',
    testCategoryDisplay: 'All Tests',
    monthlyBaseline: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    peakMonths: [],
    peakMultiplier: 1,
    confidence: 'low',
    computedAt: new Date().toISOString(),
    dataMonths,
    warning: `Insufficient data (${dataMonths} month(s)). At least ${MIN_MONTHS_LOW} months required for 'low' confidence patterns. Seasonal plan will use conservative estimates.`,
  }
}

/**
 * Detect upcoming surge periods within the next N days (default 30).
 *
 * Returns SurgeAlert[] for any pattern whose peak months overlap with
 * the lookahead window.
 */
export function detectUpcomingSurge(
  patterns: SeasonalDemandPattern[],
  lookaheadDays = 30,
): SurgeAlert[] {
  const today = new Date()
  const lookaheadEnd = new Date(today)
  lookaheadEnd.setDate(lookaheadEnd.getDate() + lookaheadDays)

  const alerts: SurgeAlert[] = []

  for (const pattern of patterns) {
    if (pattern.peakMonths.length === 0) continue

    for (const peakMonth of pattern.peakMonths) {
      // Check if this peak month overlaps with the next `lookaheadDays` days
      const thisYear = today.getFullYear()
      const nextYear = thisYear + 1

      // Try both this year and next year's occurrence
      for (const year of [thisYear, nextYear]) {
        const surgeStart = new Date(year, peakMonth - 1, 1)  // 1st of peak month
        const surgeEnd = new Date(year, peakMonth, 0)          // last day of peak month

        // Surge starts within our lookahead window, or we're already in it
        if (surgeStart <= lookaheadEnd && surgeEnd >= today) {
          const daysUntil = Math.max(
            0,
            Math.ceil((surgeStart.getTime() - today.getTime()) / 86_400_000),
          )

          alerts.push({
            testCategory: pattern.testCategory,
            testCategoryDisplay: pattern.testCategoryDisplay,
            surgeStartDate: surgeStart.toISOString().slice(0, 10),
            surgeEndDate: surgeEnd.toISOString().slice(0, 10),
            projectedMultiplier: pattern.peakMultiplier,
            daysUntilSurge: daysUntil,
            confidence: pattern.confidence,
          })
          break  // Only report the nearest occurrence per category
        }
      }
    }
  }

  // Sort by urgency: soonest first
  return alerts.sort((a, b) => a.daysUntilSurge - b.daysUntilSurge)
}
