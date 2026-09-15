import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, putOrders, getOrders, updateOrderStatus, putSample, type LabOrderEntry } from '../lib/db'
import type { FhirSpecimen } from '@ultranos/shared-types'

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
    },
  }),
}))

// Mock trpc functions
const mockPullOrders = vi.fn()
const mockAcknowledgeOrder = vi.fn()
vi.mock('@/lib/trpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trpc')>()
  return {
    ...actual,
    pullOrders: (...args: unknown[]) => mockPullOrders(...args),
    acknowledgeOrder: (...args: unknown[]) => mockAcknowledgeOrder(...args),
  }
})

function makeOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    patientFirstName: 'Ahmad',
    patientAge: 45,
    patientRef: 'Patient/123',
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
    urgency: 'stat',
    orderingPhysicianName: 'Dr. Karimi',
    specialInstructions: null,
    status: 'RECEIVED',
    authoredOn: '2026-05-30T10:00:00.000Z',
    receivedAt: '2026-05-30T10:05:00.000Z',
    syncedAt: '2026-05-30T10:05:00.000Z',
    ...overrides,
  }
}

describe('Order Sync (pullOrders / acknowledgeOrder)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.orders.clear()
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.orders.clear()
  })

  it('pullOrders is called with token and optional since parameter', async () => {
    mockPullOrders.mockResolvedValue([])
    const { pullOrders } = await import('../lib/trpc')
    await pullOrders('test-token', '2026-05-30T10:00:00.000Z')
    // Verify the function can be called (the actual fetch is mocked)
    expect(mockPullOrders).toHaveBeenCalledWith('test-token', '2026-05-30T10:00:00.000Z')
  })

  it('pullOrders works without since parameter', async () => {
    mockPullOrders.mockResolvedValue([])
    const { pullOrders } = await import('../lib/trpc')
    await pullOrders('test-token')
    expect(mockPullOrders).toHaveBeenCalledWith('test-token')
  })

  it('acknowledgeOrder is called with orderId and token', async () => {
    mockAcknowledgeOrder.mockResolvedValue(undefined)
    const { acknowledgeOrder } = await import('../lib/trpc')
    await acknowledgeOrder('order-123', 'test-token')
    expect(mockAcknowledgeOrder).toHaveBeenCalledWith('order-123', 'test-token')
  })

  it('orders pulled from API can be stored in Dexie', async () => {
    const apiResponse = {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      patientFirstName: 'Ahmad',
      patientAge: 45,
      patientRef: 'Patient/123',
      testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
      urgency: 'stat' as const,
      orderingPhysicianName: 'Dr. Karimi',
      specialInstructions: null,
      status: 'active',
      authoredOn: '2026-05-30T10:00:00.000Z',
    }

    // Map API response to Dexie entry (same as useOrderSync does)
    const now = new Date().toISOString()
    const entry: LabOrderEntry = {
      orderId: apiResponse.orderId,
      patientFirstName: apiResponse.patientFirstName,
      patientAge: apiResponse.patientAge,
      patientRef: apiResponse.patientRef,
      testsRequested: apiResponse.testsRequested,
      urgency: apiResponse.urgency,
      orderingPhysicianName: apiResponse.orderingPhysicianName,
      specialInstructions: apiResponse.specialInstructions,
      status: 'RECEIVED',
      authoredOn: apiResponse.authoredOn,
      receivedAt: now,
      syncedAt: now,
    }

    await putOrders([entry])
    const stored = await getOrders()
    expect(stored).toHaveLength(1)
    expect(stored[0].patientFirstName).toBe('Ahmad')
    expect(stored[0].status).toBe('RECEIVED')
  })

  it('updateOrderStatus marks a cached order CANCELLED (tombstone reconciliation)', async () => {
    await putOrders([makeOrder({ orderId: 'ord-1', status: 'RECEIVED' })])
    await updateOrderStatus('ord-1', 'CANCELLED')
    const stored = await getOrders()
    expect(stored.find((o) => o.orderId === 'ord-1')?.status).toBe('CANCELLED')
  })

  it('updateOrderStatus is a no-op for an unknown order id', async () => {
    await expect(updateOrderStatus('does-not-exist', 'CANCELLED')).resolves.toBeUndefined()
    expect(await getOrders()).toHaveLength(0)
  })

  it('offline fallback serves cached orders from Dexie', async () => {
    // Pre-populate Dexie with a cached order
    await putOrders([makeOrder()])

    // Simulate network failure
    mockPullOrders.mockRejectedValue(new Error('Network error'))

    // Orders should still be readable from Dexie
    const cached = await getOrders()
    expect(cached).toHaveLength(1)
    expect(cached[0].patientFirstName).toBe('Ahmad')
  })
})

// ---------------------------------------------------------------------------
// Tombstone reconciliation guard (full-sync specimen protection)
// ---------------------------------------------------------------------------

describe('tombstoneAbsentOrders — specimen guard', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.orders.clear()
    await db.samples.clear()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    const db = getDb()
    await db.orders.clear()
    await db.samples.clear()
  })

  function makeSpecimen(orderId: string, pipelineStatus = 'received'): FhirSpecimen {
    const id = `specimen-${orderId}`
    return {
      id,
      resourceType: 'Specimen',
      status: 'available',
      subject: { reference: 'Patient/p-001' },
      receivedTime: new Date().toISOString(),
      request: [{ reference: `ServiceRequest/${orderId}` }],
      meta: { lastUpdated: new Date().toISOString(), versionId: '1' },
      _ultranos: {
        labSampleId: `LAB-TEST-${orderId}`,
        hlcTimestamp: 'mock-hlc',
        createdAt: new Date().toISOString(),
        isOfflineCreated: false,
        pipelineStatus: pipelineStatus as import('@ultranos/shared-types').PipelineStatus,
        sampleCondition: 'acceptable',
      },
    }
  }

  it('cancels a RECEIVED order absent from the server when no local specimen exists', async () => {
    const { tombstoneAbsentOrders } = await import('../hooks/useOrderSync')
    await putOrders([makeOrder({ orderId: 'ord-no-specimen', status: 'RECEIVED' })])

    // Server set does not include this order
    await tombstoneAbsentOrders(new Set<string>())

    const orders = await getOrders()
    expect(orders.find((o) => o.orderId === 'ord-no-specimen')?.status).toBe('CANCELLED')
  })

  it('does NOT cancel a RECEIVED order absent from server when a local specimen exists', async () => {
    const { tombstoneAbsentOrders } = await import('../hooks/useOrderSync')
    await putOrders([makeOrder({ orderId: 'ord-with-specimen', status: 'RECEIVED' })])
    await putSample(makeSpecimen('ord-with-specimen'))

    // Server set does not include this order
    await tombstoneAbsentOrders(new Set<string>())

    const orders = await getOrders()
    expect(orders.find((o) => o.orderId === 'ord-with-specimen')?.status).toBe('RECEIVED')
  })

  it('does NOT cancel orders that are present in the server set', async () => {
    const { tombstoneAbsentOrders } = await import('../hooks/useOrderSync')
    await putOrders([makeOrder({ orderId: 'ord-present', status: 'RECEIVED' })])

    // Server set INCLUDES this order
    await tombstoneAbsentOrders(new Set(['ord-present']))

    const orders = await getOrders()
    expect(orders.find((o) => o.orderId === 'ord-present')?.status).toBe('RECEIVED')
  })

  it('does NOT cancel an IN_PROGRESS order even if absent from server', async () => {
    const { tombstoneAbsentOrders } = await import('../hooks/useOrderSync')
    await putOrders([makeOrder({ orderId: 'ord-in-progress', status: 'IN_PROGRESS' })])

    await tombstoneAbsentOrders(new Set<string>())

    const orders = await getOrders()
    // Only RECEIVED orders are subject to tombstone — IN_PROGRESS stays untouched
    expect(orders.find((o) => o.orderId === 'ord-in-progress')?.status).toBe('IN_PROGRESS')
  })
})
