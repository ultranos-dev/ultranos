import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetAccessToken } = vi.hoisted(() => ({ mockGetAccessToken: vi.fn() }))
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ getAccessToken: mockGetAccessToken }) },
}))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'http://hub.test/api/trpc' }))

import { fetchPendingDispenseReviewCount } from '@/lib/dispense-review-client'

beforeEach(() => {
  mockGetAccessToken.mockReset()
  vi.restoreAllMocks()
})

describe('fetchPendingDispenseReviewCount', () => {
  it('returns the number of PENDING rows the Hub returns', async () => {
    mockGetAccessToken.mockResolvedValue('tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: { json: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] } } }),
    }))
    expect(await fetchPendingDispenseReviewCount()).toBe(3)
  })

  it('requests only PENDING via the input query param', async () => {
    mockGetAccessToken.mockResolvedValue('tok')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: [] } } }) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchPendingDispenseReviewCount()
    const calledUrl = String(fetchMock.mock.calls[0]![0])
    expect(calledUrl).toContain('dispenseReview.list')
    expect(decodeURIComponent(calledUrl)).toContain('"statuses":["PENDING"]')
  })

  it('returns 0 when there is no token (not authenticated)', async () => {
    mockGetAccessToken.mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchPendingDispenseReviewCount()).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled() // no network attempt without a token
  })

  it('returns 0 on a non-2xx response (offline-safe degrade)', async () => {
    mockGetAccessToken.mockResolvedValue('tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    expect(await fetchPendingDispenseReviewCount()).toBe(0)
  })

  it('returns 0 when fetch throws (offline) — never propagates', async () => {
    mockGetAccessToken.mockResolvedValue('tok')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(fetchPendingDispenseReviewCount()).resolves.toBe(0)
  })
})
