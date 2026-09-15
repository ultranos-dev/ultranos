/**
 * TDM E2E Verification — pharmacy→lab warfarin dispense → INR flag
 *
 * Stitched integration test: exercises the REAL dispense-receiver and
 * REAL Dexie monitoringFlags store (via fake-indexeddb), with NO mocking
 * of db.ts or medication-lab-map.ts.
 *
 * Tests:
 *  1. Warfarin dispense (B01AA03) → produces exactly one INR (6301-6) flag
 *     with correct patientRef (bare, no prefix), medicationCode, and dueDate
 *     (dispensedAt + initialDelayDays = 2026-09-15 + 3 = 2026-09-18).
 *  2. Non-monitored ATC (A10AB01, insulin aspart) → produces ZERO flags.
 *
 * Date math: addDays('2026-09-15', 3)
 *   new Date('2026-09-15') → Sep 15 2026 UTC
 *   setDate(15 + 3) → Sep 18 2026
 *   toISOString().split('T')[0] → '2026-09-18'
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// ---------------------------------------------------------------------------
// Mocks for side-effecting modules that are not under test
// ---------------------------------------------------------------------------

// audit-logger/client: emitClientAudit hits IndexedDB via its own adapter;
// we just suppress the side-effect so the test stays self-contained.
vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
}))

// monitoring-audit wraps emitClientAudit + reads from auth store — mock so the
// receiver's audit call doesn't require a live session.
vi.mock('../lib/monitoring/monitoring-audit', () => ({
  emitMonitoringAuditEvent: vi.fn(),
}))

// auth-session-store is a Zustand store; not relevant to this test.
vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: vi.fn(() => ({ session: null })) },
}))

// ---------------------------------------------------------------------------
// Imports AFTER mocks are registered (vi.mock is hoisted; safe here)
// ---------------------------------------------------------------------------

import { processBatchDispenseEvents, type DispenseMonitoringPayload } from '../lib/monitoring/dispense-receiver'
import { getDb } from '../lib/db'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a DispenseMonitoringPayload exactly as the useMonitoringSync hook
 * produces from a DispenseMonitoringEventDTO returned by hub's
 * lab.pullDispenseMonitoringEvents.
 *
 * Mapping applied (from useMonitoringSync.ts lines 59-69):
 *   medicationCode: e.atcCode
 *   patientRef: e.patientRef.replace(/^Patient\//, '')   // R1: store bare blind index
 *   patientAge: e.patientAge ?? 0
 *   all other fields: passthrough
 */
function makeWarfarinPayload(): DispenseMonitoringPayload {
  // Simulated DispenseMonitoringEventDTO as Hub would return:
  const e = {
    dispensingEventId: 'dispense-evt-warfarin-001',
    patientRef: 'Patient/blindhash-abc123',
    patientFirstName: 'Ali',
    patientAge: 40,
    atcCode: 'B01AA03',
    medicationDisplay: 'Warfarin',
    dispensedAt: '2026-09-15',
    orderingPractitionerRef: 'Practitioner/opaque-ref-dr-001',
    hlcTimestamp: '1',
  }

  // Apply the exact mapping from useMonitoringSync hook
  return {
    dispensingEventId: e.dispensingEventId,
    patientRef: e.patientRef.replace(/^Patient\//, ''),   // → 'blindhash-abc123'
    patientFirstName: e.patientFirstName,
    patientAge: e.patientAge ?? 0,
    medicationCode: e.atcCode,                            // → 'B01AA03'
    medicationDisplay: e.medicationDisplay,
    dispensedAt: e.dispensedAt,
    orderingPractitionerRef: e.orderingPractitionerRef,
    hlcTimestamp: e.hlcTimestamp,
  }
}

function makeNonMonitoredPayload(): DispenseMonitoringPayload {
  // A10AB01 = Insulin aspart — not in the bundled ATC map → should produce 0 flags
  const e = {
    dispensingEventId: 'dispense-evt-insulin-001',
    patientRef: 'Patient/blindhash-xyz789',
    patientFirstName: 'Sara',
    patientAge: 30,
    atcCode: 'A10AB01',
    medicationDisplay: 'Insulin Aspart',
    dispensedAt: '2026-09-15',
    orderingPractitionerRef: 'Practitioner/opaque-ref-dr-002',
    hlcTimestamp: '2',
  }

  return {
    dispensingEventId: e.dispensingEventId,
    patientRef: e.patientRef.replace(/^Patient\//, ''),
    patientFirstName: e.patientFirstName,
    patientAge: e.patientAge ?? 0,
    medicationCode: e.atcCode,
    medicationDisplay: e.medicationDisplay,
    dispensedAt: e.dispensedAt,
    orderingPractitionerRef: e.orderingPractitionerRef,
    hlcTimestamp: e.hlcTimestamp,
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('TDM E2E: pharmacy dispense → lab monitoring flag', () => {
  beforeEach(async () => {
    // Clear the real Dexie monitoringFlags table before each test
    const db = getDb()
    await db.monitoringFlags.clear()
  })

  it('warfarin (B01AA03) dispense → exactly one INR (6301-6) flag with correct fields', async () => {
    const payload = makeWarfarinPayload()

    // Feed through the REAL processBatchDispenseEvents with NO overrides —
    // the receiver will fall through to the bundled ATC map (getMedicationMapping
    // checks hubOverrides first, then BUNDLED_INDEX).
    await processBatchDispenseEvents([payload])

    const db = getDb()
    const flags = await db.monitoringFlags.toArray()

    // ASSERTION 1: exactly one flag created
    expect(flags).toHaveLength(1)

    const flag = flags[0]

    // ASSERTION 2: correct LOINC code (INR)
    expect(flag.testRequired).toBe('6301-6')

    // ASSERTION 3: correct ATC medication code
    expect(flag.medicationCode).toBe('B01AA03')

    // ASSERTION 4: patientRef is bare (no 'Patient/' prefix) — R1 convention
    expect(flag.patientRef).toBe('blindhash-abc123')
    expect(flag.patientRef).not.toMatch(/^Patient\//)

    // ASSERTION 5: dueDate = dispensedAt (2026-09-15) + initialDelayDays (3) = 2026-09-18
    // This mirrors the addDays() function in dispense-receiver.ts:
    //   new Date('2026-09-15') + setDate(15+3) → '2026-09-18'
    expect(flag.dueDate).toBe('2026-09-18')

    // ASSERTION 6: status starts as 'upcoming'
    expect(flag.status).toBe('upcoming')

    // ASSERTION 7: syncedFromHub is true (this came from Hub)
    expect(flag.syncedFromHub).toBe(true)

    // ASSERTION 8: dispensingEventId preserved
    expect(flag.dispensingEventId).toBe('dispense-evt-warfarin-001')
  })

  it('non-monitored ATC (A10AB01, insulin aspart) → zero flags produced', async () => {
    const payload = makeNonMonitoredPayload()

    await processBatchDispenseEvents([payload])

    const db = getDb()
    const flags = await db.monitoringFlags.toArray()

    // A10AB01 is not in BUNDLED_MEDICATION_MAPPINGS → getMedicationMapping returns null
    // → processDispenseEvent returns [] early → no Dexie write
    expect(flags).toHaveLength(0)
  })
})
