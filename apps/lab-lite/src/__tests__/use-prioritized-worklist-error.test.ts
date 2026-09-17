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
import { getDb } from '../lib/db'

vi.mock('next/navigation', () => ({ useRouter: vi.fn(), usePathname: vi.fn() }))

let uuidSeq = 0
vi.stubGlobal('crypto', { randomUUID: () => `test-uuid-${++uuidSeq}` })

describe('usePrioritizedWorklist — real Dexie error vs. legitimate empty', () => {
  beforeEach(async () => {
    uuidSeq = 0
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
    const db = getDb()

    // Inject a spy that throws on the samples table filter to simulate a real DB error
    const filterSpy = vi.spyOn(db.samples, 'filter').mockImplementation(() => {
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
  // Verify the error thrown inside the catch doesn't corrupt the outer error
  // handler (inner re-throw propagates correctly to outer catch)
  // -------------------------------------------------------------------------
  it('error propagates to the outer catch which sets error state', async () => {
    const db = getDb()

    // Make .toArray() reject after filter succeeds (more realistic — filter is lazy)
    vi.spyOn(db.samples, 'filter').mockReturnValue({
      toArray: () => Promise.reject(new Error('Dexie internal error')),
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
