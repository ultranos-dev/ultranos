/**
 * Dispensing Event Receiver — Story 52.1 Task 3
 *
 * Processes inbound MedicationDispense events from the Hub.
 * When a pharmacy dispenses a monitored medication, this module:
 *  1. Looks up monitoring requirements from the mapping table
 *  2. Creates MonitoringFlag entries in Dexie for each required test
 *  3. Deduplicates flags (same patient-medication-test combination)
 *  4. Emits audit events for every flag created or updated
 *
 * Data minimization (CLAUDE.md Rule #7):
 *  The payload from Hub contains ONLY:
 *    - patientFirstName (first name only, no surname)
 *    - patientAge (computed age, NOT date of birth)
 *    - medicationCode + medicationDisplay
 *    - Opaque practitioner ref (no prescriber name)
 *  No diagnosis, no dosage instructions, no clinical context.
 */

import { getDb, type MonitoringFlag } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { getMedicationMapping, type MedicationLabMapping } from './medication-lab-map'
import { emitMonitoringAuditEvent } from './monitoring-audit'

/** Data-minimized projection of MedicationDispense pushed by Hub. */
export interface DispenseMonitoringPayload {
  dispensingEventId: string
  patientRef: string
  patientFirstName: string           // first name only — CLAUDE.md Rule #7
  patientAge: number                 // computed age, NOT DOB — CLAUDE.md Rule #7
  medicationCode: string
  medicationDisplay: string
  dispensedAt: string                // ISO 8601
  orderingPractitionerRef: string   // opaque ID — no prescriber name
  hlcTimestamp: string
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Process a single dispensing event from Hub.
 * Creates or updates MonitoringFlag entries for each required lab test.
 *
 * Returns the list of flag IDs created or updated.
 */
export async function processDispenseEvent(
  payload: DispenseMonitoringPayload,
  hubOverrides?: Map<string, MedicationLabMapping>,
): Promise<number[]> {
  const mapping = getMedicationMapping(payload.medicationCode, hubOverrides)
  if (!mapping) {
    // No monitoring required for this medication — nothing to do
    return []
  }

  const db = getDb()
  const now = new Date().toISOString()
  const processedIds: number[] = []

  for (const testSpec of mapping.requiredTests) {
    const dueDate = addDays(payload.dispensedAt, testSpec.initialDelayDays)
    const hlcTs = serializeHlc(hlc.now())

    await db.transaction('rw', db.monitoringFlags, async () => {
      // Dedup check: find existing flag for same patient-medication-test
      const existing = await db.monitoringFlags
        .where('[patientRef+medicationCode+testRequired]')
        .equals([payload.patientRef, payload.medicationCode, testSpec.loincCode])
        .first()

      if (existing) {
        // Update: refresh dispensing event ref and recalculate due date
        // Only update if the new dispense is more recent (prevent stale overwrites)
        if (existing.status === 'completed' || payload.dispensedAt > existing.dispensedAt) {
          const updates: Partial<MonitoringFlag> = {
            dispensingEventId: payload.dispensingEventId,
            dispensedAt: payload.dispensedAt,
            dueDate,
            status: 'upcoming',
            lastCompletedAt: null,
            hlcTimestamp: hlcTs,
            syncedFromHub: true,
            updatedAt: now,
          }
          await db.monitoringFlags.update(existing.id!, updates)
          processedIds.push(existing.id!)
        }
        return
      }

      // Create new flag
      const flag: Omit<MonitoringFlag, 'id'> = {
        patientRef: payload.patientRef,
        patientFirstName: payload.patientFirstName,
        patientAge: payload.patientAge,
        medicationCode: payload.medicationCode,
        medicationDisplay: payload.medicationDisplay,
        dispensedAt: payload.dispensedAt,
        dispensingEventId: payload.dispensingEventId,
        testRequired: testSpec.loincCode,
        testDisplay: testSpec.testDisplay,
        frequencyDays: testSpec.frequencyDays,
        dueDate,
        status: 'upcoming',
        lastCompletedAt: null,
        reminderSentAt: null,
        orderingPractitionerRef: payload.orderingPractitionerRef,
        hlcTimestamp: hlcTs,
        syncedFromHub: true,
        createdAt: now,
        updatedAt: now,
      }

      const id = await db.monitoringFlags.add(flag as MonitoringFlag)
      processedIds.push(id)
    })
  }

  // Audit-log: MONITORING_FLAG_CREATED per test
  for (const testSpec of mapping.requiredTests) {
    emitMonitoringAuditEvent('MONITORING_FLAG_CREATED', {
      patientRef: payload.patientRef,     // opaque ID only — Rule #6
      medicationCode: payload.medicationCode,
      testRequired: testSpec.loincCode,
      dispensingEventId: payload.dispensingEventId,
    })
  }

  return processedIds
}

/**
 * Process multiple dispensing events in batch (e.g., after sync reconnection).
 */
export async function processBatchDispenseEvents(
  payloads: DispenseMonitoringPayload[],
  hubOverrides?: Map<string, MedicationLabMapping>,
): Promise<void> {
  for (const payload of payloads) {
    await processDispenseEvent(payload, hubOverrides)
  }
}
