/**
 * Real-db integration tests for monitoringFlags + medicationLabMappings Dexie stores.
 * Finding 1b: these stores were previously missing from db.ts — all existing monitoring
 * tests mock @/lib/db, hiding the gap. These tests use the REAL Dexie store via
 * fake-indexeddb to verify persistence actually works.
 *
 * No vi.mock('@/lib/db') here — that is intentional.
 *
 * Story 58.2: monitoring requirements are resolved by the Hub and delivered on the
 * event payload; the receiver no longer performs a local ATC-map lookup and no
 * medication identity is stored on the flag (audit C-LAB-1).
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { getDb } from '../lib/db'
import { processDispenseEvent } from '../lib/monitoring/dispense-receiver'
import type { MonitoringRequirement } from '../lib/monitoring/dispense-receiver'

const INR_REQUIREMENT: MonitoringRequirement = {
  loincCode: '6301-6',
  testDisplay: 'INR',
  frequencyDays: 14,
  initialDelayDays: 3,
  priority: 'urgent',
}

describe('monitoringFlags real Dexie store (finding 1b)', () => {
  beforeEach(async () => { await getDb().monitoringFlags.clear() })

  it('processDispenseEvent persists a flag to the REAL store — no medication identity', async () => {
    const ids = await processDispenseEvent({
      dispensingEventId: 'd1',
      patientRef: 'blind1',
      patientFirstName: 'Ali',
      patientAge: 40,
      requirements: [INR_REQUIREMENT],
      dispensedAt: '2026-09-15',
      orderingPractitionerRef: 'ref',
      hlcTimestamp: '1',
    })
    expect(ids.length).toBe(1)
    const stored = await getDb().monitoringFlags.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.testRequired).toBe('6301-6')
    // Medication identity is never persisted on the flag (Story 58.2 / C-LAB-1).
    const asRecord = stored[0]! as unknown as Record<string, unknown>
    expect('medicationCode' in asRecord).toBe(false)
    expect('medicationDisplay' in asRecord).toBe(false)
  })

  it('dedups on [patientRef+testRequired]', async () => {
    const p = {
      dispensingEventId: 'd1',
      patientRef: 'blind1',
      patientFirstName: 'Ali',
      patientAge: 40,
      requirements: [INR_REQUIREMENT],
      dispensedAt: '2026-09-15',
      orderingPractitionerRef: 'ref',
      hlcTimestamp: '1',
    }
    await processDispenseEvent(p)
    await processDispenseEvent({ ...p, dispensingEventId: 'd2', dispensedAt: '2026-09-16' })
    expect(await getDb().monitoringFlags.count()).toBe(1)
  })
})
