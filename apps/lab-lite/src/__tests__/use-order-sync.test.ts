/**
 * use-order-sync.test.ts
 *
 * TDD tests for the 4-state fix in useOrderSync:
 *  - loading stays true until the FIRST Hub sync() resolves (never clears on local read alone)
 *  - Hub-fail + empty cache → error set, data is empty (unavailable state)
 *  - Hub-fail + cached data → data shown, error is null (offline-tolerant)
 *  - Session-expired + empty cache → error set
 *  - Session-expired + cached data → data shown, no error
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { renderHook, act } from '@testing-library/react'
import { getDb } from '../lib/db'

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any import of the module under
// test because Vitest hoists vi.mock() calls.
// ---------------------------------------------------------------------------

// Supabase browser client — we control the session in each test
const mockGetSession = vi.fn()
vi.mock('../lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}))

// pullOrders — the Hub network call; we control resolution in each test
const mockPullOrders = vi.fn()
vi.mock('../lib/trpc', () => ({
  pullOrders: mockPullOrders,
  acknowledgeOrder: vi.fn().mockResolvedValue(undefined),
}))

// data-budget store — always returns lowDataMode=false for these tests
vi.mock('../stores/data-budget-store', () => ({
  useDataBudgetStore: (selector: (s: { lowDataMode: boolean }) => unknown) =>
    selector({ lowDataMode: false }),
}))

vi.mock('next/navigation', () => ({ useRouter: vi.fn(), usePathname: vi.fn() }))

// Minimal valid session fixture
const VALID_SESSION = { data: { session: { access_token: 'tok-test' } } }
const NO_SESSION = { data: { session: null } }

// Minimal pullOrders success response (no orders)
const EMPTY_PULL_RESPONSE = {
  orders: [],
  syncTimestamp: new Date().toISOString(),
  nextCursor: null,
}

// A minimal order fixture matching LabOrderEntry
function makeOrderEntry(id = 'order-001') {
  return {
    orderId: id,
    patientFirstName: 'Ahmad',
    patientAge: 35,
    patientRef: 'Patient/blind-ref-001',
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
    urgency: 'routine' as const,
    orderingPhysicianName: 'Dr. Karimi',
    specialInstructions: null,
    status: 'RECEIVED' as const,
    authoredOn: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
  }
}

describe('useOrderSync — 4-state loading fix', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const db = getDb()
    await db.orders.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Bug 1a: loading must NOT clear on local read alone
  // -------------------------------------------------------------------------
  it('loading stays true while Hub sync is in-flight (empty local cache)', async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION)

    // Make pullOrders hang indefinitely so we can observe the in-flight state
    let resolvePull!: (v: typeof EMPTY_PULL_RESPONSE) => void
    mockPullOrders.mockReturnValue(
      new Promise<typeof EMPTY_PULL_RESPONSE>((res) => { resolvePull = res }),
    )

    const { useOrderSync } = await import('../hooks/useOrderSync')
    const { result } = renderHook(() => useOrderSync())

    // Give the local read a tick to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    // loading must STILL be true — the Hub call hasn't resolved
    expect(result.current.loading).toBe(true)
    expect(result.current.orders).toEqual([]) // cache was empty

    // Now resolve the Hub call
    await act(async () => {
      resolvePull(EMPTY_PULL_RESPONSE)
      await new Promise((r) => setTimeout(r, 20))
    })

    // After Hub resolves, loading should be false
    expect(result.current.loading).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Bug 1b: Hub-fail + empty cache → error (not false genuine-empty)
  // -------------------------------------------------------------------------
  it('Hub-fail + empty cache → loading=false, error set, orders=[]', async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION)
    // Simulate network error
    mockPullOrders.mockRejectedValue(new Error('network error'))

    const { useOrderSync } = await import('../hooks/useOrderSync')
    const { result } = renderHook(() => useOrderSync())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.orders).toEqual([])
    // Error must be set — UI should show "unavailable", NOT "No orders"
    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('unable to load orders')
  })

  // -------------------------------------------------------------------------
  // Bug 1c: Hub-fail + cached data → data shown, no error (offline-tolerant)
  // -------------------------------------------------------------------------
  it('Hub-fail + cached data → orders shown, error=null', async () => {
    // Seed the local Dexie cache with one order
    const db = getDb()
    await db.orders.put(makeOrderEntry())

    mockGetSession.mockResolvedValue(VALID_SESSION)
    mockPullOrders.mockRejectedValue(new Error('network error'))

    const { useOrderSync } = await import('../hooks/useOrderSync')
    const { result } = renderHook(() => useOrderSync())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    // Cached order must be visible
    expect(result.current.orders).toHaveLength(1)
    expect(result.current.orders[0].orderId).toBe('order-001')
    // Must NOT set an error — the user has stale data to work with
    expect(result.current.error).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Session-expired + empty cache → error
  // -------------------------------------------------------------------------
  it('Session-expired + empty cache → loading=false, error set', async () => {
    mockGetSession.mockResolvedValue(NO_SESSION)

    const { useOrderSync } = await import('../hooks/useOrderSync')
    const { result } = renderHook(() => useOrderSync())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.orders).toEqual([])
    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toContain('unable to load orders')
  })

  // -------------------------------------------------------------------------
  // Session-expired + cached data → data shown, no error
  // -------------------------------------------------------------------------
  it('Session-expired + cached data → orders shown, error=null', async () => {
    const db = getDb()
    await db.orders.put(makeOrderEntry('order-cached-999'))

    mockGetSession.mockResolvedValue(NO_SESSION)

    const { useOrderSync } = await import('../hooks/useOrderSync')
    const { result } = renderHook(() => useOrderSync())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.orders).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Happy path: successful Hub pull → loading=false, error=null, data present
  // -------------------------------------------------------------------------
  it('successful Hub sync → loading=false, error=null, orders populated', async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION)
    const serverOrder = {
      orderId: 'server-order-01',
      patientFirstName: 'Farzana',
      patientAge: 28,
      patientRef: 'Patient/blind-ref-002',
      testsRequested: [{ loincCode: '2093-3', loincDisplay: 'Cholesterol' }],
      urgency: 'routine',
      orderingPhysicianName: 'Dr. Rashid',
      specialInstructions: null,
      authoredOn: new Date().toISOString(),
      assignedToLab: false,
    }
    mockPullOrders.mockResolvedValue({
      orders: [serverOrder],
      syncTimestamp: new Date().toISOString(),
      nextCursor: null,
    })

    const { useOrderSync } = await import('../hooks/useOrderSync')
    const { result } = renderHook(() => useOrderSync())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.orders).toHaveLength(1)
    expect(result.current.orders[0].orderId).toBe('server-order-01')
  })
})
