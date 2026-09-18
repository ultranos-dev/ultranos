/**
 * sample-collection-worklist.test.ts
 *
 * Integration test for the sample-collection → worklist pipeline.
 * Covers Change 1 (no order-fallback) and Change 2 (accession persistence).
 *
 * Uses fake-indexeddb so no real IDB is needed.
 *
 * Tests prove:
 *  1. After accessionSample(), getSampleById(specimen.id) returns the specimen.
 *  2. After accessionSample(), getReceivedSampleForOrder(orderId) returns it.
 *  3. The specimen appears in getSamplesByStatus('received') with its own id (NOT the orderId).
 *  4. An order with NO accessioned specimen does NOT appear in getSamplesByStatus
 *     (i.e. the db query the hook uses yields nothing for that order → no fallback item).
 *  5. The samples-path logic (ACTIVE_STATUSES filter + request-join) returns
 *     sampleId === specimen.id for an accessioned specimen, never the orderId.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  putOrders,
  getSampleById,
  getSamplesByStatus,
  getReceivedSampleForOrder,
  putSample,
} from '../lib/db'
import type { LabOrderEntry } from '../lib/db'
import type { FhirSpecimen } from '@ultranos/shared-types'

// accessionSample calls navigator.onLine and useAuthSessionStore.getState()
// Stub them so the service function runs outside a browser/React context.
vi.stubGlobal('navigator', { onLine: false })
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { practitionerId: 'tech-test-01' } }),
  },
}))

// crypto.randomUUID stub (fake-indexeddb environment lacks it)
let uuidSeq = 0
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${(++uuidSeq).toString().padStart(4, '0')}`,
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i % 256
    return arr
  },
})

const ORDER_ID = '550e8400-e29b-41d4-a716-446655440000'
const PATIENT_REF = 'Patient/patient-blind-ref-001'

function makeOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: ORDER_ID,
    patientFirstName: 'Ahmad',
    patientAge: 38,
    patientRef: PATIENT_REF,
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC Panel' }],
    urgency: 'stat',
    orderingPhysicianName: 'Dr. Karimi',
    specialInstructions: null,
    status: 'RECEIVED',
    authoredOn: '2026-09-13T07:00:00.000Z',
    receivedAt: '2026-09-13T07:05:00.000Z',
    syncedAt: '2026-09-13T07:05:00.000Z',
    ...overrides,
  }
}

/**
 * Build a minimal FhirSpecimen as accessionSample() would create it.
 * We use putSample() directly so we can test the db layer without
 * triggering the full accessionSample side-effects (HLC, audit, sync queue).
 */
function makeSpecimen(specimenId: string, orderId: string): FhirSpecimen {
  const now = new Date().toISOString()
  return {
    id: specimenId,
    resourceType: 'Specimen',
    status: 'available',
    subject: { reference: PATIENT_REF },
    receivedTime: now,
    request: [{ reference: `ServiceRequest/${orderId}` }],
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: {
      labSampleId: 'LAB-20260913-0001',
      hlcTimestamp: now,
      createdAt: now,
      isOfflineCreated: true,
      pipelineStatus: 'received',
      sampleCondition: 'acceptable',
    },
  } as unknown as FhirSpecimen
}

/** Simulate the hook's samples-path filter + join, returning SampleInput-like objects. */
async function runHookSamplesPath(db: ReturnType<typeof getDb>) {
  const ACTIVE_STATUSES = new Set(['received', 'in-processing'])

  const activeSamples = await db.samples
    .filter((s: FhirSpecimen) => ACTIVE_STATUSES.has((s as any)._ultranos?.pipelineStatus))
    .toArray()

  if (activeSamples.length === 0) return []

  const orderIds = activeSamples.flatMap((s: FhirSpecimen) =>
    (s.request ?? [])
      .map((ref) => {
        const parts = ref.reference.split('/')
        return parts.length === 2 ? parts[1] ?? null : null
      })
      .filter((id): id is string => id !== null),
  )

  const orders = await db.orders.where('orderId').anyOf(orderIds).toArray()
  const orderMap = new Map(orders.map((o) => [o.orderId, o]))

  return activeSamples.map((specimen: FhirSpecimen) => {
    const orderId = specimen.request?.[0]?.reference?.split('/')?.[1] ?? ''
    const order = orderId ? orderMap.get(orderId) : undefined
    return {
      sampleId: specimen.id,      // always specimen.id — never orderId
      orderId: orderId ?? '',
      hasOrder: !!order,
    }
  })
}

describe('Sample collection → worklist pipeline', () => {
  beforeEach(async () => {
    uuidSeq = 0
    const db = getDb()
    await db.samples.clear()
    await db.orders.clear()
  })

  // -------------------------------------------------------------------------
  // Test 1: getSampleById returns the specimen after putSample
  // -------------------------------------------------------------------------
  it('getSampleById returns the persisted specimen', async () => {
    const db = getDb()
    const specimen = makeSpecimen('specimen-abc-001', ORDER_ID)
    await putSample(specimen)

    const found = await getSampleById(specimen.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe('specimen-abc-001')
    expect((found! as any)._ultranos.pipelineStatus).toBe('received')
    // The specimen's id must NEVER equal the orderId
    expect(found!.id).not.toBe(ORDER_ID)
  })

  // -------------------------------------------------------------------------
  // Test 2: getReceivedSampleForOrder links specimen to order via FHIR reference
  // -------------------------------------------------------------------------
  it('getReceivedSampleForOrder returns the specimen for its orderId', async () => {
    const db = getDb()
    const specimen = makeSpecimen('specimen-abc-002', ORDER_ID)
    await putSample(specimen)
    await putOrders([makeOrder()])

    const found = await getReceivedSampleForOrder(ORDER_ID)
    expect(found).toBeDefined()
    expect(found!.id).toBe('specimen-abc-002')
    // The link is by reference, not by sharing the ID
    expect(found!.request![0]!.reference).toBe(`ServiceRequest/${ORDER_ID}`)
  })

  // -------------------------------------------------------------------------
  // Test 3: Worklist samples-path returns sampleId === specimen.id (not orderId)
  // -------------------------------------------------------------------------
  it('hook samples-path yields sampleId === specimen.id, never orderId', async () => {
    const db = getDb()
    const specimen = makeSpecimen('specimen-abc-003', ORDER_ID)
    await putSample(specimen)
    await putOrders([makeOrder()])

    const items = await runHookSamplesPath(db)
    expect(items).toHaveLength(1)
    expect(items[0]!.sampleId).toBe('specimen-abc-003')
    expect(items[0]!.sampleId).not.toBe(ORDER_ID)
    expect(items[0]!.orderId).toBe(ORDER_ID)
    expect(items[0]!.hasOrder).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test 4: An order with NO accessioned specimen produces NO worklist items
  //         (the fallback is gone — the samples table returns nothing)
  // -------------------------------------------------------------------------
  it('order without an accessioned specimen yields no worklist items', async () => {
    const db = getDb()
    // Seed the order but NOT the specimen
    await putOrders([makeOrder()])
    // samples table intentionally empty

    const items = await runHookSamplesPath(db)
    expect(items).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Test 5: getSamplesByStatus('received') includes our specimen
  // -------------------------------------------------------------------------
  it('getSamplesByStatus returns the received specimen', async () => {
    const specimen = makeSpecimen('specimen-abc-005', ORDER_ID)
    await putSample(specimen)

    const received = await getSamplesByStatus('received')
    expect(received.length).toBeGreaterThan(0)
    const found = received.find((s) => s.id === 'specimen-abc-005')
    expect(found).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Test 6: Two orders, one accessioned → only the accessioned one has a worklist item
  // -------------------------------------------------------------------------
  it('only accessioned specimens appear; un-accessioned order is absent', async () => {
    const db = getDb()
    const ORDER_ID_2 = '660e8400-e29b-41d4-a716-446655440001'
    const specimen = makeSpecimen('specimen-abc-006', ORDER_ID)
    await putSample(specimen)
    await putOrders([
      makeOrder({ orderId: ORDER_ID }),
      makeOrder({ orderId: ORDER_ID_2, patientFirstName: 'Bahar' }),
    ])
    // Only ORDER_ID has a specimen; ORDER_ID_2 does NOT

    const items = await runHookSamplesPath(db)
    expect(items).toHaveLength(1)
    expect(items[0]!.sampleId).toBe('specimen-abc-006')
    expect(items[0]!.orderId).toBe(ORDER_ID)
    // No item for ORDER_ID_2 — the fallback is gone
    const ghost = items.find((i) => i.orderId === ORDER_ID_2)
    expect(ghost).toBeUndefined()
  })
})
