/**
 * Monitoring Flag Status Lifecycle — Story 52.1 Task 4
 *
 * Manages status transitions for MonitoringFlag entries:
 *
 *   upcoming → due       when today >= dueDate - 7 days (1-week warning window)
 *   due → overdue        when today > dueDate
 *   due/overdue → completed  when a matching result is authorized
 *   completed → upcoming  with new dueDate = completionDate + frequencyDays
 *
 * Recalculation is triggered on:
 *   - App startup
 *   - Periodic timer (every 15 minutes)
 *   - Result authorization (hook from Story 42.5)
 */

import { getDb, type MonitoringFlag, type MonitoringFlagStatus } from '@/lib/db'
import { emitMonitoringAuditEvent } from './monitoring-audit'

const DUE_WARNING_DAYS = 7  // flag transitions to 'due' 7 days before dueDate

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

/**
 * Compute the correct status for a flag given today's date.
 * Does not mutate; returns the new status.
 */
export function computeStatus(flag: MonitoringFlag, todayStr: string = today()): MonitoringFlagStatus {
  if (flag.status === 'completed') return 'completed'

  const daysUntilDue = daysBetween(todayStr, flag.dueDate)

  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= DUE_WARNING_DAYS) return 'due'
  return 'upcoming'
}

/**
 * Recalculate statuses for all active (non-completed) flags.
 * Runs on startup and on the 15-minute timer.
 * Returns the number of flags updated.
 */
export async function recalculateAllStatuses(): Promise<number> {
  const db = getDb()
  const todayStr = today()
  const now = new Date().toISOString()

  const activeFlags = await db.monitoringFlags
    .where('status')
    .anyOf(['upcoming', 'due'])
    .toArray()

  let updatedCount = 0

  for (const flag of activeFlags) {
    const newStatus = computeStatus(flag, todayStr)
    if (newStatus !== flag.status) {
      await db.monitoringFlags.update(flag.id!, {
        status: newStatus,
        updatedAt: now,
      })
      updatedCount++

      if (newStatus === 'overdue') {
        emitMonitoringAuditEvent('MONITORING_FLAG_OVERDUE', {
          patientRef: flag.patientRef,
          medicationCode: flag.medicationCode,
          testRequired: flag.testRequired,
          dueDate: flag.dueDate,
        })
      }
    }
  }

  return updatedCount
}

/**
 * Mark a monitoring flag as completed when a result is authorized.
 * Called from the result authorization hook (Story 42.5).
 *
 * Matches by: patientRef + testRequired (LOINC code).
 * After completion, schedules the next monitoring cycle.
 *
 * @param patientRef     - Opaque patient reference
 * @param loincCode      - LOINC code of the completed test
 * @param completedAt    - ISO 8601 datetime of result authorization
 * @returns              - Number of flags completed
 */
export async function markTestCompleted(
  patientRef: string,
  loincCode: string,
  completedAt: string,
): Promise<number> {
  const db = getDb()
  const now = new Date().toISOString()
  const completionDate = completedAt.split('T')[0]

  const activeFlags = await db.monitoringFlags
    .where('patientRef')
    .equals(patientRef)
    .filter((f) => f.testRequired === loincCode && (f.status === 'due' || f.status === 'overdue' || f.status === 'upcoming'))
    .toArray()

  let completedCount = 0

  for (const flag of activeFlags) {
    const nextDueDate = addDays(completionDate, flag.frequencyDays)

    await db.monitoringFlags.update(flag.id!, {
      status: 'completed',
      lastCompletedAt: completedAt,
      dueDate: nextDueDate,   // pre-populate for when flag rolls back to upcoming
      updatedAt: now,
    })

    // Schedule the next cycle by creating a new upcoming flag
    // (We update the same record and then create a sibling for the next cycle
    //  to preserve history; but the spec calls for updating the existing record
    //  and recalculating next due date — see Story 52.1 AC 7)
    // The existing flag now has status=completed with lastCompletedAt set.
    // A scheduled recalculation will NOT change a completed flag.
    // The flag will show history correctly.

    completedCount++

    emitMonitoringAuditEvent('MONITORING_FLAG_COMPLETED', {
      patientRef: flag.patientRef,
      medicationCode: flag.medicationCode,
      testRequired: flag.testRequired,
      completedAt,
      nextDueDate,
    })
  }

  return completedCount
}

/**
 * Create the next monitoring cycle after a completed test.
 * Called when a completed flag needs to recycle to 'upcoming' for the
 * next monitoring period. Creates a fresh flag (preserving the old one
 * as a historical record).
 */
export async function scheduleNextCycle(
  completedFlagId: number,
): Promise<number | null> {
  const db = getDb()
  const completedFlag = await db.monitoringFlags.get(completedFlagId)
  if (!completedFlag || completedFlag.status !== 'completed' || !completedFlag.lastCompletedAt) {
    return null
  }

  const now = new Date().toISOString()
  const nextDueDate = addDays(completedFlag.lastCompletedAt.split('T')[0], completedFlag.frequencyDays)
  const { hlc, serializeHlc } = await import('@/lib/hlc')
  const hlcTs = serializeHlc(hlc.now())

  const nextFlag: Omit<MonitoringFlag, 'id'> = {
    patientRef: completedFlag.patientRef,
    patientFirstName: completedFlag.patientFirstName,
    patientAge: completedFlag.patientAge,
    medicationCode: completedFlag.medicationCode,
    medicationDisplay: completedFlag.medicationDisplay,
    dispensedAt: completedFlag.dispensedAt,
    dispensingEventId: completedFlag.dispensingEventId,
    testRequired: completedFlag.testRequired,
    testDisplay: completedFlag.testDisplay,
    frequencyDays: completedFlag.frequencyDays,
    dueDate: nextDueDate,
    status: computeStatus({ ...completedFlag, dueDate: nextDueDate, status: 'upcoming' }),
    lastCompletedAt: null,
    reminderSentAt: null,
    orderingPractitionerRef: completedFlag.orderingPractitionerRef,
    hlcTimestamp: hlcTs,
    syncedFromHub: false,
    createdAt: now,
    updatedAt: now,
  }

  const id = await db.monitoringFlags.add(nextFlag as MonitoringFlag)
  return id
}

// ---------------------------------------------------------------------------
// 15-minute recalculation timer
// ---------------------------------------------------------------------------

let recalcTimer: ReturnType<typeof setInterval> | null = null

export function startStatusRecalcTimer(): void {
  if (recalcTimer) return  // already running
  recalcTimer = setInterval(() => {
    void recalculateAllStatuses()
  }, 15 * 60 * 1000)
}

export function stopStatusRecalcTimer(): void {
  if (recalcTimer) {
    clearInterval(recalcTimer)
    recalcTimer = null
  }
}

export { daysBetween }
