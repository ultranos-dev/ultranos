/**
 * Streak Calculation Engine — Story 46.7
 *
 * Calculates consecutive-day streaks from local Dexie data.
 * Two streak types:
 *  - qc_passing:      consecutive calendar days where ALL QC runs by this
 *                     technician were within acceptable limits (±2 SD).
 *  - zero_rejection:  consecutive calendar days with zero rejected samples.
 *
 * Design decisions:
 * - "Passing" QC = observedValue within [targetMean - 2*targetSd, targetMean + 2*targetSd].
 * - Days with NO QC runs are treated as neutral (streak is not broken, not extended).
 * - Rejection is detected via samples._ultranos.pipelineStatus === 'rejected'.
 * - All calculations work offline from Dexie — no network required.
 * - No patient data: QC runs are instrument control material; sample IDs are opaque.
 */

import { getDb } from '@/lib/db'
import type { QualityStreak, QualityStreakType } from '@/lib/quality-streak-types'
import { crypto } from '@/lib/delegate-crypto'

// ---------------------------------------------------------------------------
// Pass/fail predicate for a single QC run
// ---------------------------------------------------------------------------

function isQcRunPassing(run: { observedValue: number; targetMean: number; targetSd: number }): boolean {
  const low = run.targetMean - 2 * run.targetSd
  const high = run.targetMean + 2 * run.targetSd
  return run.observedValue >= low && run.observedValue <= high
}

// ---------------------------------------------------------------------------
// Calendar day utilities
// ---------------------------------------------------------------------------

/** Return array of YYYY-MM-DD strings from startDate to endDate inclusive, descending. */
function calendarDaysDescending(startDate: string, endDate: string): string[] {
  const days: string[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  const cursor = new Date(end)
  while (cursor >= start) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() - 1)
  }
  return days
}

/** Today as YYYY-MM-DD. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 90 days ago as YYYY-MM-DD (look-back window for streak calculation). */
function ninetyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// QC Streak
// ---------------------------------------------------------------------------

/**
 * Calculate the QC passing streak for a technician.
 *
 * Reads all QcRuns for this technician (via runBy field) over the last 90 days.
 * Groups runs by calendar day, counts consecutive days where all runs were passing.
 * Days with no runs are skipped (don't count for or against the streak).
 */
export async function calculateQCStreak(technicianId: string): Promise<QualityStreak> {
  const db = getDb()
  const since = ninetyDaysAgo()
  const todayStr = today()

  // Load all recent QC runs for this technician
  const allRuns = await db.qcRuns
    .where('runDate')
    .between(since, todayStr, true, true)
    .filter((run) => run.runBy === technicianId)
    .toArray()

  // Group by calendar day
  const runsByDay: Map<string, typeof allRuns> = new Map()
  for (const run of allRuns) {
    const day = run.runDate.slice(0, 10)
    if (!runsByDay.has(day)) runsByDay.set(day, [])
    runsByDay.get(day)!.push(run)
  }

  // Walk days descending, compute current streak
  const days = calendarDaysDescending(since, todayStr)
  let currentStreak = 0
  let lastResetAt: string | null = null
  let lastResetReason: string | null = null
  let streakBroken = false

  for (const day of days) {
    const runs = runsByDay.get(day)
    if (!runs || runs.length === 0) {
      // No runs this day — neutral, skip (don't break streak, don't extend)
      continue
    }

    // Check if all runs on this day are passing
    const failedRun = runs.find((r) => !isQcRunPassing(r))
    if (failedRun) {
      if (!streakBroken) {
        // This is the day that broke the current streak
        lastResetAt = day
        lastResetReason = `QC result out of range on ${day} for ${failedRun.analyte}`
        streakBroken = true
      }
      break
    }

    currentStreak++
  }

  // Load existing record to track longestStreak
  const existing = await db.quality_streaks
    .where('[technicianId+streakType]')
    .equals([technicianId, 'qc_passing'])
    .first()

  const longestStreak = Math.max(currentStreak, existing?.longestStreak ?? 0)

  const streak: QualityStreak = {
    id: existing?.id ?? `qs-qc-${technicianId}`,
    technicianId,
    streakType: 'qc_passing',
    currentStreak,
    longestStreak,
    lastResetAt: streakBroken ? lastResetAt : (existing?.lastResetAt ?? null),
    lastResetReason: streakBroken ? lastResetReason : (existing?.lastResetReason ?? null),
    updatedAt: new Date().toISOString(),
  }

  await db.quality_streaks.put(streak)
  return streak
}

// ---------------------------------------------------------------------------
// Zero Rejection Streak
// ---------------------------------------------------------------------------

/**
 * Calculate the zero-rejection streak for a technician.
 *
 * Reads all samples over the last 90 days, counts consecutive calendar days
 * where no sample had _ultranos.pipelineStatus === 'rejected'.
 *
 * In a solo-tech environment all samples belong to the working technician's
 * shift, so we count rejections globally (not filtered by tech ID).
 * If the sample has a receivedTime field, we use its date; otherwise we fall
 * back to meta.lastUpdated or today.
 */
export async function calculateRejectionStreak(technicianId: string): Promise<QualityStreak> {
  const db = getDb()
  const since = ninetyDaysAgo()
  const todayStr = today()

  // Load all samples — filter rejected ones
  // FhirSpecimen is typed as `any` in db.ts for the patients table subset, but
  // the samples table has `_ultranos.pipelineStatus` indexed.
  const rejectedSamples = await db.samples
    .where('_ultranos.pipelineStatus')
    .equals('rejected')
    .toArray()

  // Group rejection days by calendar day
  const rejectionDays = new Set<string>()
  for (const sample of rejectedSamples) {
    // Try receivedTime (FHIR Specimen standard field), fallback to meta.lastUpdated
    const rawDate: string =
      (sample as any).receivedTime ??
      (sample as any)['_ultranos']?.receivedAt ??
      (sample as any).meta?.lastUpdated ??
      todayStr
    const day = rawDate.slice(0, 10)
    if (day >= since && day <= todayStr) {
      rejectionDays.add(day)
    }
  }

  const days = calendarDaysDescending(since, todayStr)
  let currentStreak = 0
  let lastResetAt: string | null = null
  let lastResetReason: string | null = null
  let streakBroken = false

  for (const day of days) {
    if (rejectionDays.has(day)) {
      if (!streakBroken) {
        lastResetAt = day
        // Find one rejected sample from that day for the reason
        const sampleFromDay = rejectedSamples.find((s) => {
          const rawDate: string =
            (s as any).receivedTime ??
            (s as any)['_ultranos']?.receivedAt ??
            (s as any).meta?.lastUpdated ??
            ''
          return rawDate.slice(0, 10) === day
        })
        const sampleId: string = (sampleFromDay as any)?._ultranos?.labSampleId ?? 'a sample'
        const reason: string =
          (sampleFromDay as any)?._ultranos?.rejectionReason ?? 'quality issue'
        lastResetReason = `Sample rejected on ${day}: ${reason} (sample ${sampleId})`
        streakBroken = true
      }
      break
    }
    currentStreak++
  }

  const existing = await db.quality_streaks
    .where('[technicianId+streakType]')
    .equals([technicianId, 'zero_rejection'])
    .first()

  const longestStreak = Math.max(currentStreak, existing?.longestStreak ?? 0)

  const streak: QualityStreak = {
    id: existing?.id ?? `qs-rej-${technicianId}`,
    technicianId,
    streakType: 'zero_rejection',
    currentStreak,
    longestStreak,
    lastResetAt: streakBroken ? lastResetAt : (existing?.lastResetAt ?? null),
    lastResetReason: streakBroken ? lastResetReason : (existing?.lastResetReason ?? null),
    updatedAt: new Date().toISOString(),
  }

  await db.quality_streaks.put(streak)
  return streak
}

// ---------------------------------------------------------------------------
// Reset message builder (AC #4 — encouraging framing)
// ---------------------------------------------------------------------------

/**
 * Build the reset message to display in the UI when a streak was broken.
 * The message acknowledges the achievement, explains what happened, and
 * encourages the technician to start fresh.
 */
export function buildResetMessage(streak: QualityStreak): string | null {
  if (!streak.lastResetAt || !streak.lastResetReason) return null

  const streakLabel =
    streak.streakType === 'qc_passing' ? 'QC passing' : 'zero rejection'

  const previousBest = streak.longestStreak > 0 ? streak.longestStreak : null
  const achievement = previousBest
    ? `Your ${previousBest}-day ${streakLabel} streak was impressive.`
    : `You started building a ${streakLabel} streak.`

  return `${achievement} Here's what happened: ${streak.lastResetReason}. You're starting fresh — let's build it back!`
}

// ---------------------------------------------------------------------------
// Load helper
// ---------------------------------------------------------------------------

export async function getStreak(
  technicianId: string,
  streakType: QualityStreakType,
): Promise<QualityStreak | undefined> {
  const db = getDb()
  return db.quality_streaks
    .where('[technicianId+streakType]')
    .equals([technicianId, streakType])
    .first()
}
