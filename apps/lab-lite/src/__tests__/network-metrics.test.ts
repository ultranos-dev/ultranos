import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// NOTE: aggregateNetworkMetrics uses db.orders.where('receivedAt') which requires
// receivedAt to be indexed. The current Dexie schema for 'orders' only indexes
// status, urgency, and authoredOn — not receivedAt. The tests mock getDb() to
// provide a controlled fake that exercises the aggregation logic directly.

import type { LabOrderEntry } from '../lib/db'
import type { NetworkStatusSnapshot } from '../types/lab-network'

// Build a minimal fake Dexie-like object for orders / uploadQueue / network_snapshots
function makeFakeDb(
  orders: LabOrderEntry[] = [],
  uploadQueue: Array<{ status: string }> = [],
  snapshots: NetworkStatusSnapshot[] = [],
) {
  const makeWhere = (rows: unknown[], keyPath: string) => ({
    aboveOrEqual: (val: unknown) => ({
      toArray: async () =>
        (rows as Record<string, unknown>[]).filter((r) => (r[keyPath] as string) >= (val as string)),
    }),
    equals: (val: unknown) => ({
      toArray: async () => (rows as Record<string, unknown>[]).filter((r) => r[keyPath] === val),
      count: async () => (rows as Record<string, unknown>[]).filter((r) => r[keyPath] === val).length,
      anyOf: undefined as unknown,
    }),
    anyOf: (vals: unknown[]) => ({
      count: async () => (rows as Record<string, unknown>[]).filter((r) => vals.includes(r[keyPath])).length,
    }),
  })

  return {
    orders: {
      where: (kp: string) => makeWhere(orders, kp),
    },
    uploadQueue: {
      where: (kp: string) => makeWhere(uploadQueue, kp),
    },
    network_snapshots: {
      get: async (id: string) => snapshots.find((s) => s.locationId === id),
      put: async (_s: NetworkStatusSnapshot) => {},
      clear: async () => {},
    },
  }
}

vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    getDb: vi.fn(),
    getNetworkSnapshot: vi.fn(),
    getActiveLocations: vi.fn(),
  }
})

import { getDb, getNetworkSnapshot } from '../lib/db'
import { aggregateNetworkMetrics, getLocationStatus } from '../lib/network-metrics'

const mockGetDb = vi.mocked(getDb)
const mockGetNetworkSnapshot = vi.mocked(getNetworkSnapshot)

function makeTodayIso(): string {
  return new Date().toISOString()
}

function makeOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: crypto.randomUUID(),
    patientFirstName: 'Ahmad',
    patientAge: 30,
    patientRef: 'Patient/pat-001',
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
    urgency: 'routine',
    orderingPhysicianName: 'Dr. Omar',
    specialInstructions: null,
    status: 'PENDING',
    authoredOn: makeTodayIso(),
    receivedAt: makeTodayIso(),
    syncedAt: makeTodayIso(),
    ...overrides,
  }
}

describe('aggregateNetworkMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns zeros when no orders exist', async () => {
    mockGetDb.mockReturnValue(makeFakeDb([], [], []) as ReturnType<typeof getDb>)

    const metrics = await aggregateNetworkMetrics()

    expect(metrics.totalSamplesToday).toBe(0)
    expect(metrics.avgTATByLocation).toEqual({})
    expect(metrics.pendingResultsByLocation).toEqual({})
    expect(metrics.stockoutAlerts).toBe(0)
    expect(metrics.asOf).toBeDefined()
  })

  it('counts today\'s orders', async () => {
    const orders = [
      makeOrder({ orderId: 'o1', status: 'PENDING' }),
      makeOrder({ orderId: 'o2', status: 'PENDING' }),
      makeOrder({ orderId: 'o3', status: 'IN_PROGRESS' }),
    ]
    mockGetDb.mockReturnValue(makeFakeDb(orders, [], []) as ReturnType<typeof getDb>)

    const metrics = await aggregateNetworkMetrics()

    expect(metrics.totalSamplesToday).toBe(3)
    expect(metrics.pendingResultsByLocation['main']).toBe(1)
  })
})

describe('getLocationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns stored snapshot merged with live counts', async () => {
    const snapshot: NetworkStatusSnapshot = {
      locationId: 'loc-main',
      pendingSamples: 99, // overwritten by live count
      stockAlerts: 99, // overwritten by live count
      staffOnDuty: 3,
      lastSyncTimestamp: new Date().toISOString(),
      connectivityStatus: 'online',
    }
    mockGetNetworkSnapshot.mockResolvedValue(snapshot)
    // No upload queue entries — live counts are zero
    mockGetDb.mockReturnValue(makeFakeDb([], [], []) as ReturnType<typeof getDb>)

    const status = await getLocationStatus('loc-main')

    expect(status.locationId).toBe('loc-main')
    expect(status.staffOnDuty).toBe(3)
    expect(status.connectivityStatus).toBe('online')
    expect(status.pendingSamples).toBe(0)
    expect(status.stockAlerts).toBe(0)
  })

  it('returns offline stub when no snapshot exists', async () => {
    mockGetNetworkSnapshot.mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(makeFakeDb([], [], []) as ReturnType<typeof getDb>)

    const status = await getLocationStatus('loc-unknown')

    expect(status.locationId).toBe('loc-unknown')
    expect(status.connectivityStatus).toBe('offline')
    expect(status.staffOnDuty).toBe(0)
    expect(status.lastSyncTimestamp).toBe(new Date(0).toISOString())
    expect(status.pendingSamples).toBe(0)
    expect(status.stockAlerts).toBe(0)
  })
})
