/**
 * Surveillance Engine — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Implements offline-capable spike and cluster detection.
 * All computation runs on local Dexie data — no network required.
 *
 * PHI Safety (CLAUDE.md Rule #1):
 * - Engine NEVER accesses or returns patient names, IDs, or individual results.
 * - LabLogbookEntry.resultSummary is checked against positive indicators but
 *   NEVER included in detection results or alerts.
 * - Cluster detection returns timestamps only — no patient identifiers.
 */

import { getDb, getSurveillanceBaseline, putSurveillanceBaseline } from './db'
import type { ReportableDiseaseConfig, SurveillanceBaseline, SpikeDetectionResult, ClusterDetectionResult } from './surveillance-types'

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD date string into a Date. Throws on malformed input. */
function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) {
    throw new Error(`Invalid date string: "${dateStr}"`)
  }
  return new Date(y, m - 1, d)
}

/** Format a Date to YYYY-MM-DD. */
function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Get the ISO date N days before (or after, if negative) a reference date. */
function daysFromDate(baseISO: string, days: number): string {
  const d = parseDate(baseISO)
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

/** Get ISO 8601 week number string for a date (year-boundary safe). */
function isoWeekKey(dateStr: string): string {
  const d = parseDate(dateStr)
  // Find the Thursday of this date's week (ISO weeks are defined by their Thursday)
  const dayOfWeek = d.getDay() || 7 // Mon=1 … Sun=7
  const thursday = new Date(d)
  thursday.setDate(d.getDate() + (4 - dayOfWeek))
  // The ISO week-year is the year that contains this Thursday
  const isoYear = thursday.getFullYear()
  // Week 1 contains Jan 4, so find Jan 1 of isoYear and its Thursday-based week start
  const jan1 = new Date(isoYear, 0, 1)
  const jan1Day = jan1.getDay() || 7
  const week1Start = new Date(isoYear, 0, 1 + (1 - jan1Day)) // Monday of week containing Jan 1
  const diff = thursday.getTime() - week1Start.getTime()
  const week = Math.floor(diff / (7 * 86400000)) + 1
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Positive result check
// ---------------------------------------------------------------------------

/**
 * Check if a resultSummary string matches any of the disease's positive indicators.
 * Case-insensitive, trimmed comparison.
 * PHI: resultSummary is passed in but NEVER returned or logged.
 */
function isPositiveResult(resultSummary: string, indicators: string[]): boolean {
  const normalized = resultSummary.toLowerCase().trim()
  return indicators.some((ind) => normalized.includes(ind.toLowerCase()))
}

// ---------------------------------------------------------------------------
// Task 3 — Rolling Average Baseline Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the 4-week rolling baseline positivity rate for a disease.
 *
 * Queries labLogbook for entries in the 4 weeks prior to `asOfDate` (i.e.
 * [asOfDate - 35 days, asOfDate - 7 days]), groups by ISO week, calculates
 * positivity rate per week, and returns the mean.
 *
 * Cold-start handling:
 * - If fewer than 4 weeks of data exist, uses available data with dataWeeks < 4.
 * - If no historical data at all, returns baseline with dataWeeks = 0 (spike
 *   detection will handle the zero-baseline case separately).
 *
 * PHI: Only reads LOINC codes and resultSummary (aggregate check) — no patient data returned.
 */
export async function calculateRollingBaseline(
  disease: ReportableDiseaseConfig,
  asOfDate: string,
): Promise<SurveillanceBaseline> {
  const baselineId = `${disease.diseaseCode}_${asOfDate}`

  // Check cache — recalculate if more than 24h old
  const cached = await getSurveillanceBaseline(disease.diseaseCode, asOfDate)
  const now = new Date().toISOString()
  if (cached) {
    const cacheAge = Date.now() - new Date(cached.calculatedAt).getTime()
    if (cacheAge < 24 * 60 * 60 * 1000) {
      return cached
    }
  }

  const db = getDb()
  const windowStart = daysFromDate(asOfDate, -35) // 5 weeks back
  const windowEnd = daysFromDate(asOfDate, -7)   // exclude current week

  // Query logbook entries in the 4-week historical window (end exclusive to avoid overlap with current period)
  const entries = await db.labLogbook
    .where('date')
    .between(windowStart, windowEnd, true, false)
    .filter((e) => disease.loincCodes.includes(e.testLoincCode))
    .toArray()

  // Group by ISO week
  const weekMap = new Map<string, { total: number; positive: number }>()
  for (const entry of entries) {
    const weekKey = isoWeekKey(entry.date)
    const current = weekMap.get(weekKey) ?? { total: 0, positive: 0 }
    current.total++
    if (isPositiveResult(entry.resultSummary, disease.positiveResultIndicators)) {
      current.positive++
    }
    weekMap.set(weekKey, current)
  }

  // Calculate weekly positivity rates (only weeks with at least 1 test)
  const weeklyRates: number[] = []
  let totalTests = 0
  let totalPositive = 0

  for (const [, { total, positive }] of weekMap) {
    const rate = total > 0 ? (positive / total) * 100 : 0
    weeklyRates.push(rate)
    totalTests += total
    totalPositive += positive
  }

  const dataWeeks = weeklyRates.length
  const averageRate = dataWeeks > 0
    ? weeklyRates.reduce((sum, r) => sum + r, 0) / dataWeeks
    : 0

  const baseline: SurveillanceBaseline = {
    id: baselineId,
    diseaseCode: disease.diseaseCode,
    asOfDate,
    weeklyRates,
    averageRate,
    totalTests,
    totalPositive,
    calculatedAt: now,
    dataWeeks,
  }

  await putSurveillanceBaseline(baseline)
  return baseline
}

// ---------------------------------------------------------------------------
// Task 4 — Spike Detection
// ---------------------------------------------------------------------------

const MIN_TESTS_FOR_SPIKE = 5

/**
 * Detect a positivity rate spike for a disease.
 *
 * Algorithm:
 * 1. Calculate current week's positivity rate (last 7 days).
 * 2. Compare to 4-week rolling baseline.
 * 3. Alert levels:
 *    - critical: currentRate >= spikeThresholdMultiplier * baselineRate (default 2x)
 *    - warning:  currentRate >= 1.5 * baselineRate
 *    - none: no alert
 * 4. Suppress if fewer than MIN_TESTS_FOR_SPIKE total tests in current period.
 * 5. Special case: if baseline = 0 and any positives exist → critical.
 */
export async function detectPositivitySpike(
  disease: ReportableDiseaseConfig,
  asOfDate: string,
): Promise<SpikeDetectionResult> {
  const periodEnd = asOfDate
  const periodStart = daysFromDate(asOfDate, -7)

  const db = getDb()

  // Query current period results
  const currentEntries = await db.labLogbook
    .where('date')
    .between(periodStart, periodEnd, true, true)
    .filter((e) => disease.loincCodes.includes(e.testLoincCode))
    .toArray()

  const testCount = currentEntries.length
  const positiveCount = currentEntries.filter((e) =>
    isPositiveResult(e.resultSummary, disease.positiveResultIndicators),
  ).length

  const currentRate = testCount > 0 ? (positiveCount / testCount) * 100 : 0

  // Suppress small samples
  if (testCount < MIN_TESTS_FOR_SPIKE) {
    return {
      detected: false,
      severity: null,
      currentRate,
      baselineRate: 0,
      ratio: 0,
      testCount,
      positiveCount,
      periodStart,
      periodEnd,
      suppressedSmallSample: true,
    }
  }

  // Calculate baseline
  const baseline = await calculateRollingBaseline(disease, asOfDate)
  const baselineRate = baseline.averageRate

  // Special case: zero baseline with any positives
  if (baselineRate === 0 && positiveCount > 0) {
    return {
      detected: true,
      severity: 'critical',
      currentRate,
      baselineRate: 0,
      ratio: Infinity,
      testCount,
      positiveCount,
      periodStart,
      periodEnd,
      suppressedSmallSample: false,
    }
  }

  if (baselineRate === 0) {
    return {
      detected: false,
      severity: null,
      currentRate: 0,
      baselineRate: 0,
      ratio: 0,
      testCount,
      positiveCount,
      periodStart,
      periodEnd,
      suppressedSmallSample: false,
    }
  }

  const ratio = currentRate / baselineRate

  if (ratio >= disease.spikeThresholdMultiplier) {
    return {
      detected: true,
      severity: 'critical',
      currentRate,
      baselineRate,
      ratio,
      testCount,
      positiveCount,
      periodStart,
      periodEnd,
      suppressedSmallSample: false,
    }
  }

  if (ratio >= 1.5) {
    return {
      detected: true,
      severity: 'warning',
      currentRate,
      baselineRate,
      ratio,
      testCount,
      positiveCount,
      periodStart,
      periodEnd,
      suppressedSmallSample: false,
    }
  }

  return {
    detected: false,
    severity: null,
    currentRate,
    baselineRate,
    ratio,
    testCount,
    positiveCount,
    periodStart,
    periodEnd,
    suppressedSmallSample: false,
  }
}

// ---------------------------------------------------------------------------
// Task 5 — Cluster Detection
// ---------------------------------------------------------------------------

/**
 * Detect a disease cluster (N confirmed cases within a time window).
 *
 * Algorithm:
 * 1. Query labLogbook for positive results in [now - clusterWindowHours, now].
 * 2. Count distinct positive cases.
 * 3. Alert if count >= clusterThreshold.
 * 4. De-duplicate: if an existing cluster alert covers >= 50% of the same
 *    time window, suppress (already alerted).
 *
 * PHI: Returns timestamps only — NO patient identifiers in result.
 */
export async function detectDiseaseCluster(
  disease: ReportableDiseaseConfig,
  existingClusterAlerts: Array<{ clusterWindowEnd?: string }>,
): Promise<ClusterDetectionResult> {
  const now = new Date()
  const windowEnd = now.toISOString()
  const windowStartMs = now.getTime() - disease.clusterWindowHours * 60 * 60 * 1000
  const windowStart = new Date(windowStartMs).toISOString()
  const windowStartDate = formatDate(new Date(windowStartMs))
  const windowEndDate = formatDate(now)

  const db = getDb()

  // Query logbook entries in cluster window (by date range, then filter by time)
  const entries = await db.labLogbook
    .where('date')
    .between(windowStartDate, windowEndDate, true, true)
    .filter((e) => {
      if (!disease.loincCodes.includes(e.testLoincCode)) return false
      if (!isPositiveResult(e.resultSummary, disease.positiveResultIndicators)) return false
      // Fine-grained time check for entries on boundary dates
      return e.authorizedAt >= windowStart && e.authorizedAt <= windowEnd
    })
    .toArray()

  const caseCount = entries.length
  const caseTimestamps = entries.map((e) => e.authorizedAt)

  if (caseCount < disease.clusterThreshold) {
    return {
      detected: false,
      caseCount,
      windowStart,
      windowEnd,
      caseTimestamps,
      suppressedDuplicate: false,
    }
  }

  // De-duplicate: check if existing alert covers >= 50% of current window
  const overlappingThresholdMs = (disease.clusterWindowHours * 60 * 60 * 1000) * 0.5
  const suppressionBoundary = new Date(windowStartMs + overlappingThresholdMs).toISOString()

  const isDuplicate = existingClusterAlerts.some((existing) => {
    if (!existing.clusterWindowEnd) return false
    return existing.clusterWindowEnd >= suppressionBoundary
  })

  if (isDuplicate) {
    return {
      detected: false,
      caseCount,
      windowStart,
      windowEnd,
      caseTimestamps,
      suppressedDuplicate: true,
    }
  }

  return {
    detected: true,
    caseCount,
    windowStart,
    windowEnd,
    caseTimestamps,
    suppressedDuplicate: false,
  }
}
