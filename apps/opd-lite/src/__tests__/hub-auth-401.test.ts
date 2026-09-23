import { describe, it, expect, vi, beforeEach } from 'vitest'

// Story 59.3 (M-OPD-2): the single shared Hub request helper must implement
// 401 → one token refresh → one retry → surfaced failure DISTINCT from offline.
// This generalizes the one historically-correct call path
// (listEncountersByPractitionerFromHub) for all ~14 Hub helpers in lib/trpc.ts.

const mockGetSession = vi.fn()
const mockRefreshSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: mockGetSession, refreshSession: mockRefreshSession },
  }),
}))

vi.mock('@/lib/hub-url', () => ({
  getHubTrpcUrl: () => 'http://hub.test/api/trpc',
  getHubBaseUrl: () => 'http://hub.test',
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { hubTrpcRequest, HubRequestError } = await import('@/lib/hub-auth')

function okResponse(json: unknown) {
  return { ok: true, status: 200, json: async () => ({ result: { data: { json } } }) }
}

describe('hubTrpcRequest', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockGetSession.mockReset()
    mockRefreshSession.mockReset()
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } } })
  })

  it('GET: sends the input envelope + bearer token and unwraps result.data.json', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ hello: 'world' }))

    const result = await hubTrpcRequest<{ hello: string }>('patient.search', {
      input: { query: 'x' },
    })

    expect(result).toEqual({ hello: 'world' })
    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const url = new URL(calledUrl)
    expect(url.pathname).toBe('/api/trpc/patient.search')
    expect(JSON.parse(url.searchParams.get('input')!)).toEqual({ json: { query: 'x' } })
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1')
  })

  it('POST: sends { json: input } as the body', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ synced: 1 }))

    await hubTrpcRequest('appointment.syncBatch', {
      method: 'POST',
      input: { appointments: [{ id: 'a1' }] },
    })

    const [calledUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('appointment.syncBatch')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ json: { appointments: [{ id: 'a1' }] } })
  })

  it('401 → refreshes the session once and retries once with the new token', async () => {
    mockGetSession
      .mockResolvedValueOnce({ data: { session: { access_token: 'stale' } } })
      .mockResolvedValueOnce({ data: { session: { access_token: 'fresh' } } })
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: { access_token: 'fresh' } },
      error: null,
    })
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce(okResponse({ ok: true }))

    const result = await hubTrpcRequest<{ ok: boolean }>('allergy.list', { input: { patientId: 'p1' } })

    expect(result).toEqual({ ok: true })
    expect(mockRefreshSession).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const firstAuth = ((mockFetch.mock.calls[0]![1] as RequestInit).headers as Record<string, string>)['Authorization']
    const retryAuth = ((mockFetch.mock.calls[1]![1] as RequestInit).headers as Record<string, string>)['Authorization']
    expect(firstAuth).toBe('Bearer stale')
    expect(retryAuth).toBe('Bearer fresh')
  })

  it('401 with failed refresh → throws HubRequestError(401) without retrying', async () => {
    mockRefreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'refresh failed' } })
    mockFetch.mockResolvedValue({ ok: false, status: 401 })

    await expect(hubTrpcRequest('allergy.list', { input: { patientId: 'p1' } })).rejects.toMatchObject({
      name: 'HubRequestError',
      status: 401,
    })
    // No point retrying with the same credentials — exactly one request.
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('401 persisting after refresh → throws after exactly ONE retry', async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: { access_token: 'fresh' } },
      error: null,
    })
    mockFetch.mockResolvedValue({ ok: false, status: 401 })

    await expect(hubTrpcRequest('patient.list', {})).rejects.toBeInstanceOf(HubRequestError)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockRefreshSession).toHaveBeenCalledTimes(1)
  })

  it('surfaces the tRPC error message (e.g. KYC_REQUIRED) with the HTTP status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { json: { message: 'KYC_REQUIRED' } } }),
    })

    await expect(hubTrpcRequest('encounter.listByPractitioner', {})).rejects.toThrow(
      'KYC_REQUIRED (HTTP 403)',
    )
  })

  it('network failure (offline) propagates the ORIGINAL error — never a HubRequestError', async () => {
    const offline = new TypeError('Failed to fetch')
    mockFetch.mockRejectedValueOnce(offline)

    await expect(hubTrpcRequest('patient.list', {})).rejects.toBe(offline)
    // Offline must stay distinguishable from a Hub refusal (AC5): a caller can
    // check `err instanceof HubRequestError` to tell the two apart.
    expect(offline).not.toBeInstanceOf(HubRequestError)
  })
})
