/**
 * Real-db integration tests for monitoringFlags + medicationLabMappings Dexie stores.
 * Finding 1b: these stores were previously missing from db.ts — all existing monitoring
 * tests mock @/lib/db, hiding the gap. These tests use the REAL Dexie store via
 * fake-indexeddb to verify persistence actually works.
 *
 * No vi.mock('@/lib/db') here — that is intentional.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb } from '../lib/db'
import { processDispenseEvent } from '../lib/monitoring/dispense-receiver'
import type { MedicationLabMapping } from '../lib/monitoring/medication-lab-map'

describe('monitoringFlags real Dexie store (finding 1b)', () => {
  beforeEach(async () => { await getDb().monitoringFlags.clear() })

  it('processDispenseEvent persists a flag to the REAL store', async () => {
    const mapping: MedicationLabMapping = {
      atcCode: 'B01AA03',
      medicationDisplay: 'Warfarin',
      version: 1,
      requiredTests: [{
        loincCode: '6301-6',
        testDisplay: 'INR',
        frequencyDays: 14,
        initialDelayDays: 3,
        priority: 'urgent',
      }],
    }
    const overrides = new Map<string, MedicationLabMapping>([['B01AA03', mapping]])
    const ids = await processDispenseEvent(
      {
        dispensingEventId: 'd1',
        patientRef: 'blind1',
        patientFirstName: 'Ali',
        patientAge: 40,
        medicationCode: 'B01AA03',
        medicationDisplay: 'Warfarin',
        dispensedAt: '2026-09-15',
        orderingPractitionerRef: 'ref',
        hlcTimestamp: '1',
      },
      overrides,
    )
    expect(ids.length).toBe(1)
    const stored = await getDb().monitoringFlags.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.testRequired).toBe('6301-6')
  })

  it('dedups on [patientRef+medicationCode+testRequired]', async () => {
    const mapping: MedicationLabMapping = {
      atcCode: 'B01AA03',
      medicationDisplay: 'Warfarin',
      version: 1,
      requiredTests: [{
        loincCode: '6301-6',
        testDisplay: 'INR',
        frequencyDays: 14,
        initialDelayDays: 3,
        priority: 'urgent',
      }],
    }
    const overrides = new Map<string, MedicationLabMapping>([['B01AA03', mapping]])
    const p = {
      dispensingEventId: 'd1',
      patientRef: 'blind1',
      patientFirstName: 'Ali',
      patientAge: 40,
      medicationCode: 'B01AA03',
      medicationDisplay: 'Warfarin',
      dispensedAt: '2026-09-15',
      orderingPractitionerRef: 'ref',
      hlcTimestamp: '1',
    }
    await processDispenseEvent(p, overrides)
    await processDispenseEvent({ ...p, dispensingEventId: 'd2', dispensedAt: '2026-09-16' }, overrides)
    expect(await getDb().monitoringFlags.count()).toBe(1)
  })
})
