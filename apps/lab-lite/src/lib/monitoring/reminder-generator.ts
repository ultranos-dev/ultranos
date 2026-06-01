/**
 * Reminder Generator — Story 52.1 Task 6
 *
 * When a monitoring flag transitions to 'overdue', this module:
 *  1. Generates a notification payload for the ordering physician
 *  2. Enqueues it via the sync engine to Hub (→ physician's OPD-Lite queue)
 *  3. Optionally generates a plain-language patient notification
 *  4. Throttles: no re-send for same flag within 48 hours
 *  5. Tracks reminderSentAt on the flag to enforce throttling
 *  6. Audit-logs every reminder sent
 *
 * No PHI in the outbound payload — uses opaque practitioner ref and opaque
 * patient ref only. medicationDisplay and testDisplay are operational data
 * (not clinical context) and are included for the physician's routing.
 */

import { getDb, type MonitoringFlag } from '@/lib/db'
import { emitMonitoringAuditEvent } from './monitoring-audit'

const REMINDER_THROTTLE_HOURS = 48

export interface MonitoringReminderPayload {
  type: 'MONITORING_OVERDUE'
  patientRef: string                 // opaque patient ID
  orderingPractitionerRef: string   // opaque practitioner ID
  medicationDisplay: string
  testDisplay: string
  dueDate: string
  daysOverdue: number
  flagId: number
  generatedAt: string               // ISO 8601
}

export interface PatientReminderPayload {
  type: 'MONITORING_OVERDUE_PATIENT'
  patientRef: string
  testDisplay: string
  dueDate: string
  generatedAt: string
}

function isThrottled(flag: MonitoringFlag): boolean {
  if (!flag.reminderSentAt) return false
  const lastSent = new Date(flag.reminderSentAt).getTime()
  const now = Date.now()
  const hoursElapsed = (now - lastSent) / (1000 * 60 * 60)
  return hoursElapsed < REMINDER_THROTTLE_HOURS
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

/**
 * Generate and enqueue a reminder for a single overdue monitoring flag.
 * Respects 48-hour throttle — skips if recently sent.
 *
 * @returns true if reminder was sent, false if throttled or not applicable
 */
export async function generateReminder(
  flag: MonitoringFlag,
  options?: { includePatientNotification?: boolean },
): Promise<boolean> {
  if (flag.status !== 'overdue') return false
  if (!flag.id) return false
  if (isThrottled(flag)) return false

  const now = new Date().toISOString()
  const todayStr = now.split('T')[0]
  const daysOverdue = daysBetween(flag.dueDate, todayStr)

  const physicianPayload: MonitoringReminderPayload = {
    type: 'MONITORING_OVERDUE',
    patientRef: flag.patientRef,
    orderingPractitionerRef: flag.orderingPractitionerRef,
    medicationDisplay: flag.medicationDisplay,
    testDisplay: flag.testDisplay,
    dueDate: flag.dueDate,
    daysOverdue,
    flagId: flag.id,
    generatedAt: now,
  }

  // Enqueue via sync engine for Hub routing to physician's OPD-Lite queue
  await enqueuePractitionerNotification(physicianPayload)

  if (options?.includePatientNotification) {
    const patientPayload: PatientReminderPayload = {
      type: 'MONITORING_OVERDUE_PATIENT',
      patientRef: flag.patientRef,
      testDisplay: flag.testDisplay,
      dueDate: flag.dueDate,
      generatedAt: now,
    }
    await enqueuePatientNotification(patientPayload)
  }

  // Update reminderSentAt to enforce throttling
  const db = getDb()
  await db.monitoringFlags.update(flag.id, { reminderSentAt: now, updatedAt: now })

  // Audit-log: opaque refs only
  emitMonitoringAuditEvent('MONITORING_REMINDER_SENT', {
    patientRef: flag.patientRef,
    destination: options?.includePatientNotification ? 'physician+patient' : 'physician',
    daysOverdue,
    flagId: flag.id,
    dispensingEventId: flag.dispensingEventId,
  })

  return true
}

/**
 * Scan all overdue flags and generate reminders for those not recently reminded.
 * Intended to run on the same 15-minute timer as status recalculation.
 */
export async function generatePendingReminders(
  options?: { includePatientNotification?: boolean },
): Promise<number> {
  const db = getDb()
  const overdueFlags = await db.monitoringFlags
    .where('status')
    .equals('overdue')
    .toArray()

  let sentCount = 0
  for (const flag of overdueFlags) {
    const sent = await generateReminder(flag, options)
    if (sent) sentCount++
  }
  return sentCount
}

// ---------------------------------------------------------------------------
// Sync engine integration — enqueue outbound notifications
// ---------------------------------------------------------------------------

/**
 * Enqueue physician notification via sync engine.
 * The sync engine will deliver this to the Hub which routes to OPD-Lite.
 *
 * Uses the syncQueue Dexie table as a durable outbound queue (same pattern
 * as other Lab-Lite outbound sync actions). Priority 5 (operational).
 */
async function enqueuePractitionerNotification(payload: MonitoringReminderPayload): Promise<void> {
  try {
    const db = getDb()
    const { serializeHlc, hlc } = await import('@/lib/hlc')
    await db.syncQueue.add({
      id: `monitoring-reminder-${payload.flagId}-${Date.now()}`,
      resourceType: 'MonitoringReminder',
      resourceId: String(payload.flagId),
      action: 'CREATE',
      payload: JSON.stringify(payload),
      status: 'pending',
      priority: 5,
      createdAt: payload.generatedAt,
      hlcTimestamp: serializeHlc(hlc.now()),
      retryCount: 0,
    })
  } catch {
    // Sync queue failures must not block clinical UI — fail silently
  }
}

async function enqueuePatientNotification(payload: PatientReminderPayload): Promise<void> {
  try {
    const db = getDb()
    const { serializeHlc, hlc } = await import('@/lib/hlc')
    await db.syncQueue.add({
      id: `monitoring-patient-reminder-${payload.patientRef}-${Date.now()}`,
      resourceType: 'MonitoringPatientReminder',
      resourceId: payload.patientRef,
      action: 'CREATE',
      payload: JSON.stringify(payload),
      status: 'pending',
      priority: 5,
      createdAt: payload.generatedAt,
      hlcTimestamp: serializeHlc(hlc.now()),
      retryCount: 0,
    })
  } catch {
    // Fail silently
  }
}

export { isThrottled as _isThrottled, REMINDER_THROTTLE_HOURS }
