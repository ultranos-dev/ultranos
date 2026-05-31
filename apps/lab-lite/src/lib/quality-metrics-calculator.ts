/**
 * Monthly Quality Metrics Calculator — Story 46.7
 *
 * Computes aggregate quality metrics from local Dexie data for a given
 * YYYY-MM period. All metrics are aggregate statistics — no patient data.
 *
 * Metrics:
 *  - hemoglobin_cv:          Coefficient of Variation % for hemoglobin QC controls
 *  - turnaround_time:        Average minutes from sample receivedTime to result enteredAt
 *  - rejection_rate:         Rejected samples / total samples received (%)
 *  - training_completion:    Modules completed / modules available this quarter (%)
 */

import { getDb } from '@/lib/db'
import type { QualityMetric, MetricTrend } from '@/lib/quality-streak-types'

// LOINC code for hemoglobin — used to identify hemoglobin QC control runs
const HEMOGLOBIN_LOINC = '718-7'

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Coefficient of Variation = (SD / Mean) * 100 */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  if (m === 0) return 0
  return (stddev(values) / m) * 100
}

/** Compare two metric values to determine trend. For CV% and rejection_rate, lower is better. */
function determineTrend(
  current: number,
  previous: number | undefined,
  lowerIsBetter: boolean,
): MetricTrend {
  if (previous === undefined) return 'stable'
  const diff = Math.abs(current - previous)
  const threshold = previous * 0.05 // 5% change threshold
  if (diff <= threshold) return 'stable'
  const improved = lowerIsBetter ? current < previous : current > previous
  return improved ? 'improving' : 'declining'
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/** '2026-05' → ['2026-05-01', '2026-05-31'] (start and end ISO dates) */
function periodBounds(period: string): { start: string; end: string } {
  const [year, month] = period.split('-').map(Number)
  const start = `${period}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${period}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Previous period: '2026-05' → '2026-04' */
function previousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  if (month === 1) return `${year - 1}-12`
  return `${year}-${String(month - 1).padStart(2, '0')}`
}

/** Quarter start period: '2026-05' → '2026-04' (start of Q2 2026) */
function quarterStartPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
  return `${year}-${String(quarterStartMonth).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Individual metric calculators
// ---------------------------------------------------------------------------

async function calcHemoglobinCV(
  technicianId: string,
  period: string,
): Promise<number> {
  const db = getDb()
  const { start, end } = periodBounds(period)

  const runs = await db.qcRuns
    .where('loincCode')
    .equals(HEMOGLOBIN_LOINC)
    .filter((r) => r.runDate >= start && r.runDate <= end && r.runBy === technicianId)
    .toArray()

  const values = runs.map((r) => r.observedValue)
  return coefficientOfVariation(values)
}

async function calcTurnaroundTime(
  technicianId: string,
  period: string,
): Promise<number> {
  const db = getDb()
  const { start, end } = periodBounds(period)

  // Lab results entered by this technician in this period
  const results = await db.lab_results
    .where('enteredBy')
    .equals(technicianId)
    .filter((r) => r.enteredAt >= start && r.enteredAt <= end + 'T23:59:59Z')
    .toArray()

  if (results.length === 0) return 0

  const tatMinutes: number[] = []
  for (const result of results) {
    // Get the associated sample to find receivedTime
    const sample = await db.samples.get(result.sampleId)
    if (!sample) continue
    const receivedTime: string | undefined =
      (sample as any).receivedTime ?? (sample as any)._ultranos?.receivedAt
    if (!receivedTime) continue

    const received = new Date(receivedTime).getTime()
    const entered = new Date(result.enteredAt).getTime()
    if (entered > received) {
      tatMinutes.push((entered - received) / 60_000)
    }
  }

  return tatMinutes.length > 0 ? Math.round(mean(tatMinutes)) : 0
}

async function calcRejectionRate(
  _technicianId: string,
  period: string,
): Promise<number> {
  const db = getDb()
  const { start, end } = periodBounds(period)

  // Total samples received this period (use meta.lastUpdated as proxy for received date)
  const allSamples = await db.samples.toArray()
  const periodSamples = allSamples.filter((s) => {
    const date =
      (s as any).receivedTime?.slice(0, 10) ??
      (s as any)._ultranos?.receivedAt?.slice(0, 10) ??
      (s as any).meta?.lastUpdated?.slice(0, 10)
    return date && date >= start && date <= end
  })

  if (periodSamples.length === 0) return 0

  const rejected = periodSamples.filter(
    (s) => (s as any)._ultranos?.pipelineStatus === 'rejected',
  )

  return (rejected.length / periodSamples.length) * 100
}

async function calcTrainingCompletion(
  technicianId: string,
  period: string,
): Promise<number> {
  const db = getDb()
  // Training completion is measured per quarter
  const qStart = quarterStartPeriod(period)
  const { start: qStartDate } = periodBounds(qStart)
  const { end: periodEnd } = periodBounds(period)

  const [totalModules, completions] = await Promise.all([
    db.micro_learning_modules.count(),
    db.module_completions
      .where('technicianId')
      .equals(technicianId)
      .filter((c) => c.completedAt >= qStartDate && c.completedAt <= periodEnd + 'T23:59:59Z')
      .toArray(),
  ])

  if (totalModules === 0) return 0
  return Math.min((completions.length / totalModules) * 100, 100)
}

// ---------------------------------------------------------------------------
// Previous period value lookup (for trend calculation)
// ---------------------------------------------------------------------------

async function getPreviousPeriodValue(
  technicianId: string,
  metricType: string,
  period: string,
): Promise<number | undefined> {
  const db = getDb()
  const prev = previousPeriod(period)
  const existing = await db.quality_metrics
    .where('[technicianId+period]')
    .equals([technicianId, prev])
    .filter((m) => m.metricType === metricType)
    .first()
  return existing?.value
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Calculate all monthly quality metrics for a technician and persist to Dexie.
 * Returns the full list of metrics for the given period.
 */
export async function calculateMonthlyMetrics(
  technicianId: string,
  period: string,
): Promise<QualityMetric[]> {
  const db = getDb()
  const now = new Date().toISOString()

  const [cvValue, tatValue, rejValue, trainValue] = await Promise.all([
    calcHemoglobinCV(technicianId, period),
    calcTurnaroundTime(technicianId, period),
    calcRejectionRate(technicianId, period),
    calcTrainingCompletion(technicianId, period),
  ])

  const [prevCv, prevTat, prevRej, prevTrain] = await Promise.all([
    getPreviousPeriodValue(technicianId, 'hemoglobin_cv', period),
    getPreviousPeriodValue(technicianId, 'turnaround_time', period),
    getPreviousPeriodValue(technicianId, 'rejection_rate', period),
    getPreviousPeriodValue(technicianId, 'training_completion', period),
  ])

  const metrics: QualityMetric[] = [
    {
      id: `qm-cv-${technicianId}-${period}`,
      technicianId,
      metricType: 'hemoglobin_cv',
      period,
      value: Math.round(cvValue * 10) / 10,
      unit: '%',
      trend: determineTrend(cvValue, prevCv, true), // lower CV is better
      updatedAt: now,
    },
    {
      id: `qm-tat-${technicianId}-${period}`,
      technicianId,
      metricType: 'turnaround_time',
      period,
      value: tatValue,
      unit: 'minutes',
      trend: determineTrend(tatValue, prevTat, true), // lower TAT is better
      updatedAt: now,
    },
    {
      id: `qm-rej-${technicianId}-${period}`,
      technicianId,
      metricType: 'rejection_rate',
      period,
      value: Math.round(rejValue * 10) / 10,
      unit: '%',
      trend: determineTrend(rejValue, prevRej, true), // lower rejection is better
      updatedAt: now,
    },
    {
      id: `qm-train-${technicianId}-${period}`,
      technicianId,
      metricType: 'training_completion',
      period,
      value: Math.round(trainValue),
      unit: '%',
      trend: determineTrend(trainValue, prevTrain, false), // higher completion is better
      updatedAt: now,
    },
  ]

  await db.quality_metrics.bulkPut(metrics)
  return metrics
}

/**
 * Load persisted metrics for a technician and period from Dexie.
 */
export async function getMetricsForPeriod(
  technicianId: string,
  period: string,
): Promise<QualityMetric[]> {
  const db = getDb()
  return db.quality_metrics
    .where('[technicianId+period]')
    .equals([technicianId, period])
    .toArray()
}

/**
 * Load the last N months of a specific metric (for sparkline display).
 */
export async function getMetricHistory(
  technicianId: string,
  metricType: string,
  monthCount = 6,
): Promise<QualityMetric[]> {
  const db = getDb()
  const all = await db.quality_metrics
    .where('technicianId')
    .equals(technicianId)
    .filter((m) => m.metricType === metricType)
    .toArray()
  return all
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, monthCount)
    .reverse()
}

/** Return the current YYYY-MM period string. */
export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}
