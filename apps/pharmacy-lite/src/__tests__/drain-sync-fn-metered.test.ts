import { describe, it, expect, vi } from 'vitest'
import { createMeterFetch } from '@ultranos/sync-engine'

describe('createMeterFetch wiring (pharmacy-lite)', () => {
  it('calls the recorder after a successful fetch', async () => {
    const recorder = vi.fn().mockResolvedValue(undefined)
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const metered = createMeterFetch(mockFetch as unknown as typeof fetch, recorder)
    await metered('https://hub.example.com/medication.recordDispense', { method: 'POST', body: '{}' })
    expect(recorder).toHaveBeenCalledTimes(1)
    const call = recorder.mock.calls[0]![0]
    expect(call).toMatchObject({ category: 'other', requestCount: 1 })
  })

  it('still calls recorder even when fetch throws', async () => {
    const recorder = vi.fn().mockResolvedValue(undefined)
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
    const metered = createMeterFetch(mockFetch as unknown as typeof fetch, recorder)
    await expect(metered('https://hub.example.com/medication.recordDispense')).rejects.toThrow('network error')
    expect(recorder).toHaveBeenCalledTimes(1)
  })
})
