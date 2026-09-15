/**
 * worklist-orphan-sample.test.ts
 *
 * Regression test for the silent-drop bug in usePrioritizedWorklist:
 * a collected sample whose linked order row is absent from the local `orders`
 * table was silently dropped from the worklist (the join hit `if (!order) continue`).
 *
 * Fix: when the order row is missing, still push a worklist entry using
 * best-effort fallbacks from verified_patients + specimen._ultranos extensions.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { renderHook, act } from '@testing-library/react'
import { getDb } from '../lib/db'
import { usePrioritizedWorklist } from '../hooks/usePrioritizedWorklist'

// usePrioritizedWorklist calls getDb() which internally imports 'next/headers'
// indirectly via app-side modules — mock any next.js server module that leaks in.
vi.mock('next/navigation', () => ({ useRouter: vi.fn(), usePathname: vi.fn() }))

// crypto.randomUUID is used by some db helpers
let uuidSeq = 0
vi.stubGlobal('crypto', { randomUUID: () => `test-uuid-${++uuidSeq}` })

const ORPHAN_SPECIMEN_ID = 'specimen-orphan-001'
const ORPHAN_ORDER_REF = 'ServiceRequest/orphan-order-999'
const PATIENT_ID = 'patient-abc'

function makeOrphanSpecimen() {
  return {
    id: ORPHAN_SPECIMEN_ID,
    resourceType: 'Specimen' as const,
    status: 'available' as const,
    subject: { reference: `Patient/${PATIENT_ID}` },
    receivedTime: new Date(Date.now() - 20 * 60_000).toISOString(), // 20 min ago
    request: [{ reference: ORPHAN_ORDER_REF }],
    meta: {
      lastUpdated: new Date().toISOString(),
      versionId: '1',
    },
    _ultranos: {
      labSampleId: 'LAB-20260914-0001',
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isOfflineCreated: false,
      pipelineStatus: 'received' as const,
      sampleCondition: 'acceptable' as const,
      orderedLoincCode: '58410-2',
      orderedTests: [
        { loincCode: '58410-2', loincDisplay: 'CBC Panel' },
      ],
    },
  }
}

function makeVerifiedPatient() {
  return {
    patientId: PATIENT_ID,
    firstName: 'Ahmad',
    age: 32,
    verifiedAt: new Date().toISOString(),
    verificationSource: 'qr' as const,
  }
}

describe('usePrioritizedWorklist — orphan sample (missing order row)', () => {
  beforeEach(async () => {
    uuidSeq = 0
    const db = getDb()
    await db.samples.clear()
    await db.orders.clear()
    await db.verified_patients.clear()
    await db.priorityOverrides.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('REGRESSION: orphan sample is NOT dropped when order row is missing', async () => {
    const db = getDb()

    // Seed a specimen whose linked ServiceRequest/orphan-order-999 is NOT in orders table
    await db.samples.put(makeOrphanSpecimen() as any)
    // Seed matching verified_patients row (provides firstName + age for fallback)
    await db.verified_patients.put(makeVerifiedPatient())
    // orders table is intentionally empty — the bug scenario

    const { result } = renderHook(() => usePrioritizedWorklist())

    await act(async () => {
      // Allow Dexie async queries to complete
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()

    // The orphan specimen MUST appear in the worklist
    const samples = result.current.samples
    const orphan = samples.find((s) => s.sampleId === ORPHAN_SPECIMEN_ID)
    expect(orphan).toBeDefined()

    // Patient data should come from verified_patients fallback
    expect(orphan!.patientRef.firstName).toBe('Ahmad')
    expect(orphan!.patientRef.age).toBe(32)

    // orderId should be preserved from the specimen reference
    expect(orphan!.orderId).toBe('orphan-order-999')
  })

  it('fallback uses empty firstName and age=0 when verified_patients also has no entry', async () => {
    const db = getDb()

    // No verified_patients entry either
    await db.samples.put(makeOrphanSpecimen() as any)
    // Both orders and verified_patients are empty

    const { result } = renderHook(() => usePrioritizedWorklist())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)

    const samples = result.current.samples
    const orphan = samples.find((s) => s.sampleId === ORPHAN_SPECIMEN_ID)
    expect(orphan).toBeDefined()

    // Graceful fallback — no crash, no PHI logged
    expect(orphan!.patientRef.firstName).toBe('')
    expect(orphan!.patientRef.age).toBe(0)
    expect(orphan!.orderId).toBe('orphan-order-999')
  })

  it('matched samples (with order row) still use order data, not fallback', async () => {
    const db = getDb()

    const specimen = makeOrphanSpecimen()
    // Now seed the order that matches this specimen
    await db.samples.put(specimen as any)
    await db.orders.put({
      orderId: 'orphan-order-999',
      patientFirstName: 'Mohammad',
      patientAge: 45,
      patientRef: `Patient/${PATIENT_ID}`,
      testsRequested: [{ loincCode: '57698-3', loincDisplay: 'Lipid Panel' }],
      urgency: 'urgent',
      orderingPhysicianName: 'Dr. Smith',
      specialInstructions: null,
      status: 'RECEIVED',
      authoredOn: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
    })
    await db.verified_patients.put(makeVerifiedPatient()) // different name than order

    const { result } = renderHook(() => usePrioritizedWorklist())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)

    const samples = result.current.samples
    const matched = samples.find((s) => s.sampleId === ORPHAN_SPECIMEN_ID)
    expect(matched).toBeDefined()

    // When order exists, order data wins (not verified_patients fallback)
    expect(matched!.patientRef.firstName).toBe('Mohammad')
    expect(matched!.patientRef.age).toBe(45)
    expect(matched!.loincCode).toBe('57698-3')
    expect(matched!.loincDisplay).toBe('Lipid Panel')
    expect(matched!.urgency).toBe('urgent')
  })
})
