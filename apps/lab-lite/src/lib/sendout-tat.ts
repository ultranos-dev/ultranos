/**
 * Send-Out TAT (Turnaround Time) Tracking — Story 54.4 / Task 5
 *
 * Calculates elapsed time, expected time, and overdue status for pending send-outs.
 * TAT alerts integrate with the notification system (Story 42.7 patterns).
 *
 * No PHI — all metrics are operational (sendOutId, elapsed days, expected days).
 */

import { getDb } from './db'
import type { SendOut, SendOutTATStatus } from '@/types/reference-lab'

/** Parse an HLC-serialized or ISO timestamp and return a Date. */
function parseTimestamp(ts: string): Date {
  // HLC format: "timestamp|counter|nodeId" — extract wall-clock prefix
  const wallPart = ts.includes('|') ? ts.split('|')[0] : ts
  return new Date(Number(wallPart) || wallPart)
}

/** Elapsed days since sentAt. */
function elapsedDaysSince(sentAt: string): number {
  const ms = Date.now() - parseTimestamp(sentAt).getTime()
  return Math.max(0, ms / (1000 * 60 * 60 * 24))
}

/**
 * Calculate TAT status for a single send-out.
 * Uses the reference lab's averageTATDays for the requested test type.
 * Falls back to 7 days if no profile exists.
 */
export async function calculatePendingTAT(sendOutId: string): Promise<SendOutTATStatus> {
  const db = getDb()
  const sendOut = await db.send_outs.get(sendOutId)
  if (!sendOut) throw new Error(`Send-out not found: ${sendOutId}`)

  const referenceLab = await db.reference_labs.get(sendOut.referenceLabId)
  const expectedDays =
    referenceLab?.averageTATDays[sendOut.testRequested.loincCode] ?? 7

  const elapsedDays = elapsedDaysSince(sendOut.sentAt)
  const isOverdue = elapsedDays > expectedDays
  const overdueByDays = Math.max(0, elapsedDays - expectedDays)

  return { sendOutId, elapsedDays, expectedDays, isOverdue, overdueByDays }
}

/**
 * Return all pending send-outs exceeding their expected TAT by the given multiplier.
 * Default threshold: 1.5x average TAT. Results sorted by most overdue first.
 */
export async function getOverdueSendOuts(
  thresholdMultiplier = 1.5,
): Promise<SendOut[]> {
  const db = getDb()
  const pending = await db.send_outs
    .where('status')
    .anyOf(['sent', 'received', 'processing'])
    .toArray()

  const labs = await db.reference_labs.toArray()
  const labMap = new Map(labs.map((l) => [l.id, l]))

  type SortableSendOut = { sendOut: SendOut; overdueRatio: number }
  const overdue: SortableSendOut[] = []

  for (const sendOut of pending) {
    const lab = labMap.get(sendOut.referenceLabId)
    const expectedDays =
      lab?.averageTATDays[sendOut.testRequested.loincCode] ?? 7
    const threshold = expectedDays * thresholdMultiplier
    const elapsed = elapsedDaysSince(sendOut.sentAt)

    if (elapsed > threshold) {
      overdue.push({ sendOut, overdueRatio: elapsed / expectedDays })
    }
  }

  return overdue
    .sort((a, b) => b.overdueRatio - a.overdueRatio)
    .map((o) => o.sendOut)
}

/**
 * Calculate actual average TAT per test type from completed send-outs for a lab.
 * Returns a map of LOINC code → average completed TAT in days.
 */
export async function getAverageTATByLab(
  referenceLabId: string,
): Promise<Record<string, number>> {
  const db = getDb()
  const completed = await db.send_outs
    .where('referenceLabId')
    .equals(referenceLabId)
    .filter((s) => s.status === 'results-available' && s.resultsAvailableAt !== null)
    .toArray()

  const grouped: Record<string, number[]> = {}

  for (const sendOut of completed) {
    if (!sendOut.resultsAvailableAt) continue
    const elapsed = elapsedDaysSince(sendOut.sentAt)
    const code = sendOut.testRequested.loincCode
    if (!grouped[code]) grouped[code] = []
    grouped[code].push(elapsed)
  }

  const result: Record<string, number> = {}
  for (const [code, values] of Object.entries(grouped)) {
    result[code] = values.reduce((a, b) => a + b, 0) / values.length
  }

  return result
}
