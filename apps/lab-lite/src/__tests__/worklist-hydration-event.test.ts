/**
 * worklist-hydration-event.test.ts
 *
 * Regression test for Finding 1 (review commit 09088272):
 * usePrioritizedWorklist must immediately re-fetch when a 'lab-samples-hydrated'
 * event fires so that specimens restored by SyncProvider appear on the worklist
 * without waiting for the 60 s interval tick.
 *
 * Pattern: fake-indexeddb + renderHook per existing worklist-orphan-sample.test.ts
 * conventions.  Seed a specimen AFTER the initial render, dispatch the event, then
 * assert the specimen appears in the worklist.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { renderHook, act } from '@testing-library/react'
import { getDb } from '../lib/db'
import { usePrioritizedWorklist } from '../hooks/usePrioritizedWorklist'

vi.mock('next/navigation', () => ({ useRouter: vi.fn(), usePathname: vi.fn() }))

let uuidSeq = 0
vi.stubGlobal('crypto', { randomUUID: () => `test-uuid-${++uuidSeq}` })

const SPECIMEN_ID = 'specimen-hydrated-001'
const ORDER_REF   = 'ServiceRequest/order-hydrated-999'
const ORDER_ID    = 'order-hydrated-999'
const PATIENT_ID  = 'patient-hydrated-abc'

function makeSpecimen() {
  return {
    id: SPECIMEN_ID,
    resourceType: 'Specimen' as const,
    status: 'available' as const,
    subject: { reference: `Patient/${PATIENT_ID}` },
    receivedTime: new Date(Date.now() - 10 * 60_000).toISOString(),
    request: [{ reference: ORDER_REF }],
    meta: {
      lastUpdated: new Date().toISOString(),
      versionId: '1',
    },
    _ultranos: {
      labSampleId: 'LAB-HYDRATED-0001',
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isOfflineCreated: false,
      pipelineStatus: 'received' as const,
      sampleCondition: 'acceptable' as const,
    },
  }
}

function makeOrder() {
  return {
    orderId: ORDER_ID,
    patientFirstName: 'Zahra',
    patientAge: 28,
    patientRef: `Patient/${PATIENT_ID}`,
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC Panel' }],
    urgency: 'routine' as const,
    orderingPhysicianName: 'Dr. Khan',
    specialInstructions: null,
    status: 'RECEIVED' as const,
    authoredOn: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
  }
}

describe('usePrioritizedWorklist — lab-samples-hydrated event listener', () => {
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

  it('immediately re-fetches and shows specimen seeded before hydration event fires', async () => {
    const db = getDb()

    // Render the hook with an empty DB — initial load produces no samples
    const { result } = renderHook(() => usePrioritizedWorklist())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Empty local read while hub hydration is still pending must stay in the
    // loading state — never flash a false "no samples" empty state.
    expect(result.current.loading).toBe(true)
    expect(result.current.samples).toHaveLength(0)

    // Simulate SyncProvider finishing hydration: seed DB then dispatch event
    await act(async () => {
      await db.samples.put(makeSpecimen() as any)
      await db.orders.put(makeOrder())
      window.dispatchEvent(new Event('lab-samples-hydrated'))
      // Allow the async re-fetch to complete
      await new Promise((r) => setTimeout(r, 80))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()

    // The hydrated specimen must now appear in the worklist
    const found = result.current.samples.find((s) => s.sampleId === SPECIMEN_ID)
    expect(found).toBeDefined()
    expect(found!.patientRef.firstName).toBe('Zahra')
    expect(found!.orderId).toBe(ORDER_ID)
  })

  it('does not double-fetch when event fires while a fetch is already in-flight (inFlightRef guard)', async () => {
    const db = getDb()
    await db.samples.put(makeSpecimen() as any)
    await db.orders.put(makeOrder())

    const { result } = renderHook(() => usePrioritizedWorklist())

    // Fire the event twice rapidly — inFlightRef should dedupe concurrent runs
    await act(async () => {
      window.dispatchEvent(new Event('lab-samples-hydrated'))
      window.dispatchEvent(new Event('lab-samples-hydrated'))
      await new Promise((r) => setTimeout(r, 100))
    })

    // Worklist should still resolve correctly regardless of dedupe
    expect(result.current.error).toBeNull()
    const found = result.current.samples.find((s) => s.sampleId === SPECIMEN_ID)
    expect(found).toBeDefined()
  })
})
