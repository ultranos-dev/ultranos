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

/**
 * Parse an HLC-serialized or ISO timestamp and return a Date.
 * HLC format: "wallMs:counter:nodeId" — first segment is Unix timestamp in ms.
 * ISO format: "2024-01-15T10:30:00.000Z" — passed through directly.
 */
function parseTimestamp(ts: string): Date {
  const firstSegment = ts.split(':')[0]
  const asNumber = Number(firstSegment)
  // HLC timestamps have a 13-digit epoch-ms value as the first segment
  if (!isNaN(asNumber) && asNumber > 1_000_000_000_000) {
    return new Date(asNumber)
  }
  return new Date(ts)
}

/** Elapsed days since sentAt relative to now. */
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
 * Return all pending send-outs exceeding their expected TAT.
 * Threshold multiplier is read from the lab_config table (key: "tatOverdueMultiplier"),
 * falling back to 1.5x if not configured. Results sorted by most overdue first.
 */
export async function getOverdueSendOuts(): Promise<SendOut[]> {
  const db = getDb()

  // Read configurable threshold from lab_config (H12)
  const configEntry = await db.lab_config.get('tatOverdueMultiplier')
  const thresholdMultiplier = configEntry ? Number(configEntry.value) : 1.5

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
 * Uses the actual elapsed time from sentAt to resultsAvailableAt (not sentAt to now).
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
    // Measure actual TAT: sentAt → resultsAvailableAt (not sentAt → now) (H8)
    const tatMs =
      parseTimestamp(sendOut.resultsAvailableAt).getTime() -
      parseTimestamp(sendOut.sentAt).getTime()
    const elapsedDays = Math.max(0, tatMs / (1000 * 60 * 60 * 24))
    const code = sendOut.testRequested.loincCode
    if (!grouped[code]) grouped[code] = []
    grouped[code].push(elapsedDays)
  }

  const result: Record<string, number> = {}
  for (const [code, values] of Object.entries(grouped)) {
    result[code] = values.reduce((a, b) => a + b, 0) / values.length
  }

  return result
}
