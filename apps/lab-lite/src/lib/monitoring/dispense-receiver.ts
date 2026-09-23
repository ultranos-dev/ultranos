/**
 * Dispensing Event Receiver — Story 52.1 Task 3 / Story 58.2
 *
 * Processes inbound dispense-monitoring events from the Hub.
 * When a pharmacy dispenses a monitored medication, the Hub resolves the required
 * monitoring test(s) server-side and pushes only those requirements. This module:
 *  1. Creates MonitoringFlag entries in Dexie for each required test the Hub sent
 *  2. Deduplicates flags (same patient-test combination)
 *  3. Emits audit events for every flag created or updated
 *
 * Data minimization (CLAUDE.md Rule #7 / audit C-LAB-1):
 *  The payload from Hub contains ONLY:
 *    - patientFirstName (first name only, no surname)
 *    - patientAge (computed age, NOT date of birth)
 *    - the required monitoring test(s) — LOINC + due window (NO medication identity:
 *      atcCode / medicationDisplay are stripped server-side and never reach the lab)
 *    - Opaque practitioner ref (no prescriber name)
 *  No diagnosis, no dosage instructions, no clinical context, no drug name.
 */

import { getDb, type MonitoringFlag } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { emitMonitoringAuditEvent } from './monitoring-audit'

/** A single monitoring test requirement resolved by the Hub (no medication identity). */
export interface MonitoringRequirement {
  loincCode: string
  testDisplay: string
  initialDelayDays: number
  frequencyDays: number
  priority: 'routine' | 'urgent'
}

/** Data-minimized projection of a dispense-monitoring event pushed by Hub. */
export interface DispenseMonitoringPayload {
  dispensingEventId: string
  patientRef: string
  patientFirstName: string           // first name only — CLAUDE.md Rule #7
  patientAge: number                 // computed age, NOT DOB — CLAUDE.md Rule #7
  /** Required monitoring test(s) — resolved server-side, NO drug identity (C-LAB-1). */
  requirements: MonitoringRequirement[]
  dispensedAt: string                // ISO 8601
  orderingPractitionerRef: string   // opaque ID — no prescriber name
  hlcTimestamp: string
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0] ?? d.toISOString()
}

/**
 * Process a single dispensing event from Hub.
 * Creates or updates MonitoringFlag entries for each required lab test that the
 * Hub resolved server-side (`payload.requirements`). The lab no longer performs a
 * medication→test lookup — the drug identity never crosses to the lab (C-LAB-1).
 *
 * Returns the list of flag IDs created or updated.
 */
export async function processDispenseEvent(
  payload: DispenseMonitoringPayload,
): Promise<number[]> {
  if (!payload.requirements || payload.requirements.length === 0) {
    // Hub resolved no monitoring requirement for this dispense — nothing to do.
    return []
  }

  const db = getDb()
  const now = new Date().toISOString()
  const processedIds: number[] = []

  for (const testSpec of payload.requirements) {
    const dueDate = addDays(payload.dispensedAt, testSpec.initialDelayDays)
    const hlcTs = serializeHlc(hlc.now())

    await db.transaction('rw', db.monitoringFlags, async () => {
      // Dedup check: find existing flag for same patient-test (medication identity
      // is no longer stored, so the dedup key is patientRef+testRequired).
      const existing = await db.monitoringFlags
        .where('[patientRef+testRequired]')
        .equals([payload.patientRef, testSpec.loincCode])
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

  // Audit-log: MONITORING_FLAG_CREATED per test. No medication identity in the
  // audit metadata — only opaque refs + the LOINC test (Rule #1 / Rule #6).
  for (const testSpec of payload.requirements) {
    emitMonitoringAuditEvent('MONITORING_FLAG_CREATED', {
      patientRef: payload.patientRef,     // opaque ID only — Rule #6
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
): Promise<void> {
  for (const payload of payloads) {
    await processDispenseEvent(payload)
  }
}
