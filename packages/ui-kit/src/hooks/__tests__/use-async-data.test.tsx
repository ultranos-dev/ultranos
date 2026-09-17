import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsyncData } from '../use-async-data.js'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Returns a promise + resolver/rejecter so tests can control settlement timing. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('useAsyncData', () => {
  it('load resolves → status ready, data set, authoritative true', async () => {
    const { result } = renderHook(() =>
      useAsyncData({ load: async () => ['item-1', 'item-2'] })
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual(['item-1', 'item-2'])
    expect(result.current.authoritative).toBe(true)
    expect(result.current.error).toBeUndefined()
  })

  it('load rejects, no loadLocal → status error', async () => {
    const err = new Error('network failed')
    const { result } = renderHook(() =>
      useAsyncData({ load: async () => { throw err } })
    )

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe(err)
    expect(result.current.data).toBeUndefined()
    expect(result.current.authoritative).toBe(false)
  })

  it('loadLocal resolves + load rejects + offlineTolerant → status ready, data = local, authoritative false', async () => {
    const localItems = ['local-item']
    const { result } = renderHook(() =>
      useAsyncData({
        loadLocal: async () => localItems,
        load: async () => { throw new Error('hub down') },
        offlineTolerant: true,
      })
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual(localItems)
    expect(result.current.authoritative).toBe(false)
  })

  /**
   * THE CORE GUARANTEE:
   * loadLocal resolves EMPTY (`[]`) while load is still pending → status stays
   * 'loading' (NOT 'ready'/empty); after load resolves → 'ready'.
   */
  it('loadLocal resolves empty while load pending → stays loading; resolves after load settles', async () => {
    const authDeferred = deferred<string[]>()

    const { result } = renderHook(() =>
      useAsyncData({
        loadLocal: async () => [] as string[],           // resolves immediately with empty
        load: () => authDeferred.promise,                // stays pending
        offlineTolerant: true,
      })
    )

    // Allow microtasks to flush so loadLocal completes — status must still be 'loading'
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.status).toBe('loading')

    // Now resolve the authoritative load
    await act(async () => {
      authDeferred.resolve(['hub-item'])
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toEqual(['hub-item'])
    expect(result.current.authoritative).toBe(true)
  })

  it('loadLocal rejects + load rejects → status error', async () => {
    const { result } = renderHook(() =>
      useAsyncData({
        loadLocal: async () => { throw new Error('local db missing') },
        load: async () => { throw new Error('hub down') },
        offlineTolerant: true,
      })
    )

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.data).toBeUndefined()
  })

  it('reload() re-runs the loader', async () => {
    let callCount = 0
    const { result } = renderHook(() =>
      useAsyncData({
        load: async () => {
          callCount++
          return callCount
        },
      })
    )

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data).toBe(1)

    act(() => { result.current.reload() })
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(callCount).toBe(2)
  })

  it('enabled=false → stays loading without running load', async () => {
    const load = vi.fn(async () => ['data'])
    const { result } = renderHook(() =>
      useAsyncData({ load, enabled: false })
    )

    // Let any potential async work settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(result.current.status).toBe('loading')
    expect(load).not.toHaveBeenCalled()
  })

  it('offlineTolerant=false + load rejects → error even if loadLocal resolved', async () => {
    const { result } = renderHook(() =>
      useAsyncData({
        loadLocal: async () => ['local'],
        load: async () => { throw new Error('hub down') },
        offlineTolerant: false,
      })
    )

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('stale responses are discarded when deps change mid-flight', async () => {
    const firstDeferred = deferred<string[]>()
    let loadCount = 0

    const { result, rerender } = renderHook(
      ({ dep }: { dep: string }) =>
        useAsyncData({
          load: () => {
            loadCount++
            if (loadCount === 1) return firstDeferred.promise
            return Promise.resolve(['second-result'])
          },
          deps: [dep],
        }),
      { initialProps: { dep: 'a' } }
    )

    // Trigger second load by changing dep
    rerender({ dep: 'b' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Settle first (now stale) after second already completed
    act(() => { firstDeferred.resolve(['stale-result']) })
    // Data should be from the second load, not the stale first
    expect(result.current.data).toEqual(['second-result'])
  })
})
