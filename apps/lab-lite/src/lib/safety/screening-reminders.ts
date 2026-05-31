/**
 * Screening Reminder Engine — Story 47.3 AC 5, 6
 *
 * Reminders are calculated on-demand (not scheduled) — every time the
 * health record or dashboard is viewed, reminders are recalculated.
 * This avoids background scheduled tasks that may not run in a PWA context.
 *
 * Reminder states:
 *   daysUntilDue > 30:            no reminder
 *   0 < daysUntilDue <= 30:       UPCOMING
 *   daysUntilDue == 0:            DUE
 *   -30 <= daysUntilDue < 0:      DUE
 *   daysUntilDue < -30:           OVERDUE
 */

import type { EmployeeHealthRecord, ScreeningReminder, ReminderState } from '@/types/employee-health'
import { VaccinationStatus } from '@/types/employee-health'
import { getHealthRecord } from './health-record-service'
import { getDb } from '@/lib/db'
import { decryptHealthRecord } from './health-record-crypto'
import { getSessionEncryptionKey } from '@/lib/consent-crypto'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { LabRole } from '@ultranos/shared-types'

export interface ScreeningThresholds {
  tbScreeningDays: number
  hepBTiterDays: number
  tetanusBoosterDays: number
  covidBoosterDays: number
}

export const DEFAULT_THRESHOLDS: ScreeningThresholds = {
  tbScreeningDays: 365,
  hepBTiterDays: 1825,
  tetanusBoosterDays: 3650,
  covidBoosterDays: 365,
}

/**
 * Get screening reminders for a single practitioner.
 * Evaluates all screening dates against configurable thresholds.
 */
export async function getScreeningReminders(
  practitionerId: string,
  thresholds: ScreeningThresholds = DEFAULT_THRESHOLDS,
): Promise<ScreeningReminder[]> {
  const record = await getHealthRecord(practitionerId)
  if (!record) return []

  return calculateRemindersFromRecord(record, practitionerId, thresholds)
}

/**
 * Get all staff reminders grouped by practitioner.
 * Access-controlled: LAB_MANAGER only.
 */
export async function getAllStaffReminders(
  thresholds: ScreeningThresholds = DEFAULT_THRESHOLDS,
): Promise<Record<string, ScreeningReminder[]>> {
  const session = useAuthSessionStore.getState().session
  if (!session || session.labRole !== LabRole.LAB_MANAGER) {
    throw new Error('Unauthorized: LAB_MANAGER role required')
  }

  const db = getDb()
  const allEncrypted = await db.employee_health_records.toArray()
  const key = await getSessionEncryptionKey()

  const result: Record<string, ScreeningReminder[]> = {}
  for (const encrypted of allEncrypted) {
    const record = await decryptHealthRecord(encrypted, key)
    const reminders = calculateRemindersFromRecord(
      record,
      record.practitionerId,
      thresholds,
    )
    if (reminders.length > 0) {
      result[record.practitionerId] = reminders
    }
  }

  return result
}

/**
 * Calculate reminders from a decrypted health record.
 * Pure function — no side effects, no DB access.
 */
export function calculateRemindersFromRecord(
  record: EmployeeHealthRecord,
  practitionerId: string,
  thresholds: ScreeningThresholds = DEFAULT_THRESHOLDS,
): ScreeningReminder[] {
  const now = new Date()
  const reminders: ScreeningReminder[] = []

  // TB screening (annual by default)
  if (record.tbScreeningDate) {
    const reminder = evaluateScreening(
      practitionerId,
      'TB Screening',
      record.tbScreeningDate,
      thresholds.tbScreeningDays,
      now,
    )
    if (reminder) reminders.push(reminder)
  } else {
    reminders.push({
      practitionerId,
      screeningType: 'TB Screening',
      dueDate: now.toISOString().split('T')[0],
      message: 'TB screening has never been recorded',
      daysUntilDue: -Infinity,
    })
  }

  // Hep B titer recheck (every 5 years)
  if (record.hepBTiterDate) {
    const reminder = evaluateScreening(
      practitionerId,
      'Hepatitis B Titer',
      record.hepBTiterDate,
      thresholds.hepBTiterDays,
      now,
    )
    if (reminder) reminders.push(reminder)
  } else if (record.hepBStatus !== VaccinationStatus.NOT_STARTED) {
    reminders.push({
      practitionerId,
      screeningType: 'Hepatitis B Titer',
      dueDate: now.toISOString().split('T')[0],
      message: 'Hepatitis B titer has never been checked',
      daysUntilDue: -Infinity,
    })
  }

  // Tetanus booster (every 10 years)
  if (record.tetanusDate) {
    const reminder = evaluateScreening(
      practitionerId,
      'Tetanus Booster',
      record.tetanusDate,
      thresholds.tetanusBoosterDays,
      now,
    )
    if (reminder) reminders.push(reminder)
  }

  // COVID booster (annual by default)
  if (record.covidDate) {
    const reminder = evaluateScreening(
      practitionerId,
      'COVID Booster',
      record.covidDate,
      thresholds.covidBoosterDays,
      now,
    )
    if (reminder) reminders.push(reminder)
  }

  return reminders
}

/**
 * Evaluate a single screening type and return a reminder if applicable.
 * Returns null if no reminder is needed (more than 30 days until due).
 */
function evaluateScreening(
  practitionerId: string,
  screeningType: string,
  lastDate: string,
  thresholdDays: number,
  now: Date,
): ScreeningReminder | null {
  const last = new Date(lastDate)
  const nextDue = new Date(last.getTime() + thresholdDays * 24 * 60 * 60 * 1000)
  const daysUntilDue = Math.floor(
    (nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  )

  const state = getReminderState(daysUntilDue)
  if (!state) return null

  const dueDate = nextDue.toISOString().split('T')[0]
  const message = buildReminderMessage(screeningType, state, daysUntilDue)

  return {
    practitionerId,
    screeningType,
    dueDate,
    message,
    daysUntilDue,
  }
}

/**
 * Determine reminder state from days until due.
 * Returns null if no reminder needed (> 30 days out).
 */
export function getReminderState(daysUntilDue: number): ReminderState | null {
  if (daysUntilDue > 30) return null
  if (daysUntilDue > 0) return 'UPCOMING'
  if (daysUntilDue >= -30) return 'DUE'
  return 'OVERDUE'
}

function buildReminderMessage(
  screeningType: string,
  state: ReminderState,
  daysUntilDue: number,
): string {
  switch (state) {
    case 'UPCOMING':
      return `Your ${screeningType} is due in ${daysUntilDue} days`
    case 'DUE':
      return daysUntilDue === 0
        ? `Your ${screeningType} is due today`
        : `Your ${screeningType} is ${Math.abs(daysUntilDue)} days past due`
    case 'OVERDUE':
      return `Your ${screeningType} is ${Math.abs(daysUntilDue)} days overdue`
  }
}
