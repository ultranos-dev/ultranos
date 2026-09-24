/**
 * use-prioritized-worklist-error.test.ts
 *
 * TDD tests for Bug 3 fix in usePrioritizedWorklist:
 * A real Dexie/read error on the samples table must surface as error state
 * (not a silent empty worklist). A legitimate empty samples table (42.3
 * not yet synced) is still shown as a genuine empty, not an error.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { renderHook, act } from '@testing-library/react'
import { getDb, _getRawPhiTable } from '../lib/db'

vi.mock('next/navigation', () => ({ useRouter: vi.fn(), usePathname: vi.fn() }))

// Control the hydration-settled gate: empty worklist only stops "loading" once
// the initial hub hydration has settled. Default settled=true for legacy tests.
let hydrationSettled = true
vi.mock('@/lib/specimen-hydrate', () => ({
  isSpecimenHydrationSettled: () => hydrationSettled,
}))

let uuidSeq = 0
// Story 58.3: preserve real crypto.subtle/getRandomValues (the PHI encryption
// middleware needs them) while keeping deterministic randomUUID. Capture the
// real crypto BEFORE stubbing to avoid recursing into the stub.
const _realCrypto = globalThis.crypto
vi.stubGlobal('crypto', {
  subtle: _realCrypto.subtle,
  getRandomValues: (arr: Uint8Array) => _realCrypto.getRandomValues(arr),
  randomUUID: () => `test-uuid-${++uuidSeq}`,
})

describe('usePrioritizedWorklist — real Dexie error vs. legitimate empty', () => {
  beforeEach(async () => {
    uuidSeq = 0
    hydrationSettled = true
    const db = getDb()
    await db.samples.clear()
    await db.orders.clear()
    await db.verified_patients.clear()
    await db.priorityOverrides.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Bug 3: real Dexie error on samples.filter().toArray() → must set error
  // -------------------------------------------------------------------------
  it('a real Dexie read error sets error (not a false empty worklist)', async () => {
    // Story 58.3: the `samples` table is now wrapped by the encryption proxy, so
    // spying on `db.samples.filter` (the proxy) is bypassed — the proxy delegates
    // reads to the RAW table's toCollection(). Spy on the raw table's
    // toCollection so the proxy's filter() path throws a real Dexie read error.
    const raw = _getRawPhiTable('samples') as unknown as { toCollection: () => unknown }
    const filterSpy = vi.spyOn(raw, 'toCollection').mockImplementation(() => {
      throw new Error('IndexedDB: transaction aborted')
    })

    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    // Error must be set — NOT a silent empty
    expect(result.current.error).not.toBeNull()
    expect(result.current.samples).toHaveLength(0)

    filterSpy.mockRestore()
  })

  // -------------------------------------------------------------------------
  // Legitimate empty: samples table exists but has no active records
  // -------------------------------------------------------------------------
  it('legitimate empty samples table → error=null, samples=[]', async () => {
    // samples table is empty (no 42.3 sync yet) — nothing seeded

    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    // Must be genuine empty — no error
    expect(result.current.error).toBeNull()
    expect(result.current.samples).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // No false "empty": while the initial hub hydration is still pending, an
  // empty local read must keep loading=true (never flash "no samples").
  // -------------------------------------------------------------------------
  it('keeps loading=true on an empty read while hub hydration is still pending', async () => {
    hydrationSettled = false // hub pull not settled yet

    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Empty + not settled → still loading (skeleton), NOT a false empty state
    expect(result.current.samples).toHaveLength(0)
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Verify the error thrown inside the catch doesn't corrupt the outer error
  // handler (inner re-throw propagates correctly to outer catch)
  // -------------------------------------------------------------------------
  it('error propagates to the outer catch which sets error state', async () => {
    // Story 58.3: spy the RAW table's toCollection (the encryption proxy delegates
    // reads to it). Return a collection whose filter().toArray() rejects — the
    // async error must propagate through the proxy to the hook's outer catch.
    const raw = _getRawPhiTable('samples') as unknown as { toCollection: () => unknown }
    vi.spyOn(raw, 'toCollection').mockReturnValue({
      filter: () => ({
        toArray: () => Promise.reject(new Error('Dexie internal error')),
      }),
    } as any)

    const { usePrioritizedWorklist } = await import('../hooks/usePrioritizedWorklist')
    const { result } = renderHook(() => usePrioritizedWorklist())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).not.toBeNull()
    expect(result.current.samples).toHaveLength(0)
  })
})
