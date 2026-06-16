import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create a stable mock function for getSession that can be controlled per-test
const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'test-token' } },
})

// Must mock supabase BEFORE importing trpc (module-level side effects)
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { searchDrugCatalog, enrichDrug } = await import('@/lib/trpc')

const MOCK_DRUG: import('@ultranos/shared-types').DrugSearchResult = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: ['Amoxil'],
  therapeuticClass: 'Antibacterials',
  doseForms: ['Capsule 500mg'],
  localName: undefined,
}

function mockSearchResponse(results: unknown[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ result: { data: { json: results } } }),
  })
}

describe('searchDrugCatalog', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('calls drugCatalog.search with correct URL and input', async () => {
    mockSearchResponse([MOCK_DRUG])
    const results = await searchDrugCatalog('amox')
    expect(results).toHaveLength(1)
    expect(results[0].atcCode).toBe('J01CA04')
    const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('drugCatalog.search')
    const inputParam = JSON.parse(new URL(calledUrl).searchParams.get('input')!)
    expect(inputParam.json.q).toBe('amox')
    expect(inputParam.json.lang).toBe('en')
  })

  it('passes lang and limit params', async () => {
    mockSearchResponse([])
    await searchDrugCatalog('para', 'prs', undefined)
    const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit]
    const inputParam = JSON.parse(new URL(calledUrl).searchParams.get('input')!)
    expect(inputParam.json.lang).toBe('prs')
    expect(inputParam.json.limit).toBe(20)
  })

  it('includes Authorization header when session exists', async () => {
    mockSearchResponse([])
    await searchDrugCatalog('amox')
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(searchDrugCatalog('amox')).rejects.toThrow('503')
  })
})

describe('enrichDrug', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
  })

  it('POSTs to drugCatalog.enrich with correct body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await enrichDrug('J01CA04', { localNames: { prs: 'آموکسیسیلین', en: 'Amoxicillin (local)' } })
    const [calledUrl, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('drugCatalog.enrich')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body.json.atcCode).toBe('J01CA04')
    expect(body.json.fields.localNames.prs).toBe('آموکسیسیلین')
  })

  it('does nothing (no throw) when session is missing', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    await expect(enrichDrug('J01CA04', { localNames: { en: 'test' } })).resolves.toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws on network failure so caller can display error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    await expect(
      enrichDrug('J01CA04', { localNames: { en: 'test' } })
    ).rejects.toThrow('Failed to fetch')
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('throws on non-ok response so caller can display error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 })
    await expect(
      enrichDrug('J01CA04', { localNames: { en: 'test' } })
    ).rejects.toThrow('422')
  })
})
