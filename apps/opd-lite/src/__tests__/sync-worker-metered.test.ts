import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMeterFetch } from '@ultranos/sync-engine'

describe('createMeterFetch wiring (opd-lite)', () => {
  it('calls the recorder after a successful fetch', async () => {
    const recorder = vi.fn().mockResolvedValue(undefined)
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const metered = createMeterFetch(mockFetch as unknown as typeof fetch, recorder)
    await metered('https://hub.example.com/api/trpc/sync.push', { method: 'POST', body: '{}' })
    expect(recorder).toHaveBeenCalledTimes(1)
    const call = recorder.mock.calls[0]![0]
    expect(call).toMatchObject({ category: 'upload', requestCount: 1 })
  })

  it('still calls recorder even when fetch throws', async () => {
    const recorder = vi.fn().mockResolvedValue(undefined)
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
    const metered = createMeterFetch(mockFetch as unknown as typeof fetch, recorder)
    await expect(metered('https://hub.example.com/api/trpc/sync.push')).rejects.toThrow('network error')
    expect(recorder).toHaveBeenCalledTimes(1)
  })
})
