/**
 * portfolio-service.ts — Story 51.6 / 51.7
 *
 * Aggregates technician performance metrics for portfolio display and export.
 * No PHI: uses tech IDs and operational metrics only.
 * Offline-first: all data sourced from Dexie.
 */

import { getDb } from './db'
import type { Achievement } from './db'
import { getAchievementsForTech } from './achievement-service'

// ── Shared types ──────────────────────────────────────────────────────────────

export interface DateRange {
  startDate: string // ISO date 'YYYY-MM-DD'
  endDate: string   // ISO date 'YYYY-MM-DD'
}

export type TrendDirection = 'IMPROVING' | 'STABLE' | 'NEEDS_ATTENTION'

export interface MetricValue {
  value: number
  unit: string
  trend: TrendDirection
  previousValue: number | null
  dataPoints: number
  noData: boolean
}

export interface RejectionMetricValue extends MetricValue {
  rejectionBreakdown: { reason: string; count: number }[]
}

export interface TATByCategory {
  loincCode: string
  avgTatMinutes: number
  trend: TrendDirection
  previousAvgTatMinutes: number | null
  sampleCount: number
}

export interface TrainingModule {
  sopId: string
  title: string
  category: string
  version: string
  acknowledgedAt: string
}

export interface FullPortfolioMetrics {
  techId: string
  dateRange: DateRange
  testsPerShift: MetricValue
  averageTAT: TATByCategory[]
  qcPassRate: MetricValue
  rejectionRate: RejectionMetricValue
  trainingModules: TrainingModule[]
  mentorshipCount: number
  achievements: Achievement[]
  calculatedAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the period immediately before `range` with the same duration. */
function getPreviousPeriod(range: DateRange): DateRange {
  const start = new Date(range.startDate)
  const end = new Date(range.endDate)
  const durationMs = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000) // 1 day before start
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  return {
    startDate: prevStart.toISOString().slice(0, 10),
    endDate: prevEnd.toISOString().slice(0, 10),
  }
}

/** Compare current vs previous value. Higher = better for most metrics. */
function computeTrend(
  current: number,
  previous: number,
  direction: 'higher_is_better' | 'lower_is_better' = 'higher_is_better',
): TrendDirection {
  if (previous === 0) return 'STABLE'
  const change = (current - previous) / previous
  const threshold = 0.05
  if (direction === 'higher_is_better') {
    if (change > threshold) return 'IMPROVING'
    if (change < -threshold) return 'NEEDS_ATTENTION'
  } else {
    if (change < -threshold) return 'IMPROVING'
    if (change > threshold) return 'NEEDS_ATTENTION'
  }
  return 'STABLE'
}

/** True if an ISO datetime string (or date string) falls within [startDate, endDate]. */
function inRange(dateTimeStr: string, range: DateRange): boolean {
  const d = dateTimeStr.slice(0, 10)
  return d >= range.startDate && d <= range.endDate
}

// ── Per-metric functions ──────────────────────────────────────────────────────

export async function getTestsPerShift(techId: string, range: DateRange): Promise<MetricValue> {
  const db = getDb()

  const [currentShifts, currentResults] = await Promise.all([
    db.shift_sessions
      .where('techId').equals(techId)
      .filter((s: any) => inRange(s.startedAt, range))
      .toArray()
      .catch(() => []),
    db.lab_results
      .where('enteredBy').equals(techId)
      .filter((r: any) => inRange(r.enteredAt, range))
      .toArray()
      .catch(() => []),
  ])

  if (currentShifts.length === 0) {
    return { value: 0, unit: 'tests/shift', trend: 'STABLE', previousValue: null, dataPoints: 0, noData: true }
  }

  const currentValue = currentResults.length / currentShifts.length
  const prevRange = getPreviousPeriod(range)

  const [prevShifts, prevResults] = await Promise.all([
    db.shift_sessions
      .where('techId').equals(techId)
      .filter((s: any) => inRange(s.startedAt, prevRange))
      .toArray()
      .catch(() => []),
    db.lab_results
      .where('enteredBy').equals(techId)
      .filter((r: any) => inRange(r.enteredAt, prevRange))
      .toArray()
      .catch(() => []),
  ])

  let previousValue: number | null = null
  let trend: TrendDirection = 'STABLE'
  if (prevShifts.length > 0) {
    previousValue = prevResults.length / prevShifts.length
    trend = computeTrend(currentValue, previousValue, 'higher_is_better')
  }

  return {
    value: currentValue,
    unit: 'tests/shift',
    trend,
    previousValue,
    dataPoints: currentShifts.length,
    noData: false,
  }
}

export async function getAverageTAT(techId: string, range: DateRange): Promise<TATByCategory[]> {
  const db = getDb()

  const results = await db.lab_results
    .where('enteredBy').equals(techId)
    .filter((r: any) => inRange(r.enteredAt, range) && !!r.loincCode)
    .toArray()
    .catch(() => [])

  if (results.length === 0) return []

  const sampleIds = [...new Set(results.map((r: any) => r.sampleId as string))]
  const samples = await db.samples
    .where('id').anyOf(sampleIds)
    .toArray()
    .catch(() => [])

  const sampleMap = new Map(samples.map((s: any) => [s.id, s]))

  // Group TATs by loincCode
  const byLoinc = new Map<string, number[]>()
  for (const r of results) {
    const sample = sampleMap.get(r.sampleId)
    const receivedTime = sample?.receivedTime ?? sample?._ultranos?.receivedAt ?? sample?.receivedDateTime
    if (!receivedTime) continue
    const tat = (new Date(r.enteredAt).getTime() - new Date(receivedTime).getTime()) / 60000
    if (tat < 0) continue
    const bucket = byLoinc.get(r.loincCode) ?? []
    bucket.push(tat)
    byLoinc.set(r.loincCode, bucket)
  }

  return Array.from(byLoinc.entries()).map(([loincCode, tats]) => ({
    loincCode,
    avgTatMinutes: tats.reduce((a, b) => a + b, 0) / tats.length,
    trend: 'STABLE' as TrendDirection,
    previousAvgTatMinutes: null,
    sampleCount: tats.length,
  }))
}

export async function getQCPassRate(techId: string, range: DateRange): Promise<MetricValue> {
  const db = getDb()

  const currentRuns = await db.qcRuns
    .where('runBy').equals(techId)
    .filter((r: any) => inRange(r.runDate, range))
    .toArray()
    .catch(() => [])

  if (currentRuns.length === 0) {
    return { value: 0, unit: '%', trend: 'STABLE', previousValue: null, dataPoints: 0, noData: true }
  }

  function passRate(runs: any[]): number {
    const passes = runs.filter((r) => {
      if (r.targetSd <= 0) return false
      return Math.abs(r.observedValue - r.targetMean) / r.targetSd <= 2
    }).length
    return (passes / runs.length) * 100
  }

  const currentValue = passRate(currentRuns)
  const prevRange = getPreviousPeriod(range)

  const prevRuns = await db.qcRuns
    .where('runBy').equals(techId)
    .filter((r: any) => inRange(r.runDate, prevRange))
    .toArray()
    .catch(() => [])

  let previousValue: number | null = null
  let trend: TrendDirection = 'STABLE'
  if (prevRuns.length > 0) {
    previousValue = passRate(prevRuns)
    trend = computeTrend(currentValue, previousValue, 'higher_is_better')
  }

  return {
    value: currentValue,
    unit: '%',
    trend,
    previousValue,
    dataPoints: currentRuns.length,
    noData: false,
  }
}

export async function getRejectionRate(techId: string, range: DateRange): Promise<RejectionMetricValue> {
  const db = getDb()

  const results = await db.lab_results
    .where('enteredBy').equals(techId)
    .filter((r: any) => inRange(r.enteredAt, range))
    .toArray()
    .catch(() => [])

  if (results.length === 0) {
    return {
      value: 0, unit: '%', trend: 'STABLE', previousValue: null,
      dataPoints: 0, noData: true, rejectionBreakdown: [],
    }
  }

  const sampleIds = [...new Set(results.map((r: any) => r.sampleId as string))]
  const samples = await db.samples
    .where('id').anyOf(sampleIds)
    .toArray()
    .catch(() => [])

  const rejected = samples.filter((s: any) => s._ultranos?.pipelineStatus === 'rejected')
  const value = samples.length > 0 ? (rejected.length / samples.length) * 100 : 0

  const breakdown: Record<string, number> = {}
  for (const s of rejected) {
    const reason: string = s._ultranos?.rejectionReason ?? 'unknown'
    breakdown[reason] = (breakdown[reason] ?? 0) + 1
  }
  const rejectionBreakdown = Object.entries(breakdown).map(([reason, count]) => ({ reason, count }))

  return {
    value,
    unit: '%',
    trend: 'STABLE',
    previousValue: null,
    dataPoints: samples.length,
    noData: false,
    rejectionBreakdown,
  }
}

export async function getTrainingModules(techId: string): Promise<TrainingModule[]> {
  const db = getDb()

  const acks = await db.sop_acknowledgments
    .where('technicianId').equals(techId)
    .toArray()
    .catch(() => [])

  if (acks.length === 0) return []

  const sopIds = acks.map((a: any) => a.sopId as string)
  const sops = await db.sops.bulkGet(sopIds).catch(() => [])

  return acks
    .map((ack: any, i: number) => {
      const sop = sops[i]
      if (!sop) return null
      return {
        sopId: ack.sopId,
        title: sop.title,
        category: sop.category,
        version: ack.sopVersion,
        acknowledgedAt: ack.acknowledgedAt,
      } satisfies TrainingModule
    })
    .filter((m): m is TrainingModule => m !== null)
}

export async function getMentorshipSessions(techId: string, range: DateRange): Promise<number> {
  const db = getDb()

  const pairings = await db.mentorship_pairings
    .filter((p: any) =>
      (p.mentorId === techId || p.menteeId === techId) &&
      inRange(p.createdAt, range),
    )
    .toArray()
    .catch(() => [])

  return pairings.length
}

// ── Aggregate ────────────────────────────────────────────────────────────────

export async function calculatePortfolioMetrics(
  techId: string,
  range: DateRange,
): Promise<FullPortfolioMetrics> {
  const [testsPerShift, averageTAT, qcPassRate, rejectionRate, trainingModules, mentorshipCount, achievements] =
    await Promise.all([
      getTestsPerShift(techId, range),
      getAverageTAT(techId, range),
      getQCPassRate(techId, range),
      getRejectionRate(techId, range),
      getTrainingModules(techId),
      getMentorshipSessions(techId, range),
      getAchievementsForTech(techId).catch(() => [] as Achievement[]),
    ])

  return {
    techId,
    dateRange: range,
    testsPerShift,
    averageTAT,
    qcPassRate,
    rejectionRate,
    trainingModules,
    mentorshipCount,
    achievements,
    calculatedAt: new Date().toISOString(),
  }
}