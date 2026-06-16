import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAccessToken = vi.fn().mockResolvedValue('pharm-token')

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ getAccessToken: mockGetAccessToken }),
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { searchDrugCatalog, setDrugPrice } = await import('@/lib/trpc')

function mockOkJson(json: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => json,
  })
}

describe('searchDrugCatalog', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('GETs drugCatalog.search with q, lang, limit in input param', async () => {
    mockOkJson({ result: { data: { json: [] } } })
    await searchDrugCatalog('metro')
    const [calledUrl, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('drugCatalog.search')
    expect(opts.method).toBe('GET')
    const inputParam = JSON.parse(new URL(calledUrl).searchParams.get('input')!)
    expect(inputParam.json.q).toBe('metro')
    expect(inputParam.json.lang).toBe('en')
  })

  it('passes Authorization header', async () => {
    mockOkJson({ result: { data: { json: [] } } })
    await searchDrugCatalog('amox')
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer pharm-token')
  })

  it('returns DrugSearchResult array', async () => {
    mockOkJson({
      result: {
        data: {
          json: [
            { atcCode: 'A02BC01', innName: 'Omeprazole', brandNames: [], therapeuticClass: 'PPIs', doseForms: ['Capsule'], localName: undefined },
          ],
        },
      },
    })
    const results = await searchDrugCatalog('ome')
    expect(results).toHaveLength(1)
    expect(results[0].atcCode).toBe('A02BC01')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 })
    await expect(searchDrugCatalog('ome')).rejects.toThrow('502')
  })
})

describe('setDrugPrice', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('POSTs to drugCatalog.setPrice with correct body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await setDrugPrice({
      atcCode: 'A02BC01',
      facilityId: 'fac-uuid-1234',
      retailPrice: 35.5,
      stockSignal: 'in_stock',
      doseForm: 'Capsule',
    })
    const [calledUrl, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('drugCatalog.setPrice')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body.json.atcCode).toBe('A02BC01')
    expect(body.json.retailPrice).toBe(35.5)
    expect(body.json.stockSignal).toBe('in_stock')
  })

  it('does nothing when getAccessToken returns null', async () => {
    mockGetAccessToken.mockResolvedValueOnce(null)
    await setDrugPrice({ atcCode: 'A02BC01', facilityId: 'fac-1', retailPrice: 10, stockSignal: 'in_stock' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not throw on non-ok response (best-effort)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
    await expect(setDrugPrice({ atcCode: 'A02BC01', facilityId: 'fac-1', retailPrice: 10, stockSignal: 'in_stock' })).resolves.toBeUndefined()
  })
})
