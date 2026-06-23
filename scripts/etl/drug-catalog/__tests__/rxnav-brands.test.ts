import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchBrandNamesByRxcui } from '../sources/rxnav-brands.js'

function relatedResponse(names: string[]) {
  return {
    ok: true,
    json: async () => ({
      relatedGroup: {
        rxcui: '723',
        conceptGroup: [
          { tty: 'BN', conceptProperties: names.map((name, i) => ({ rxcui: String(1000 + i), name })) },
        ],
      },
    }),
  } as Response
}

describe('fetchBrandNamesByRxcui', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns brand-name (BN) concept names for the rxcui', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(relatedResponse(['Amoxil', 'Moxatag']))
    const brands = await fetchBrandNamesByRxcui('723')
    expect(brands).toEqual(['Amoxil', 'Moxatag'])
  })

  it('queries the related endpoint filtered to tty=BN', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(relatedResponse(['Amoxil']))
    await fetchBrandNamesByRxcui('723')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/rxcui/723/related.json')
    expect(url).toContain('tty=BN')
  })

  it('dedupes case-insensitively within the response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(relatedResponse(['Amoxil', 'AMOXIL', 'Moxatag']))
    expect(await fetchBrandNamesByRxcui('723')).toEqual(['Amoxil', 'Moxatag'])
  })

  it('returns [] when there is no BN concept group', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ relatedGroup: { rxcui: '723', conceptGroup: [{ tty: 'SCD', conceptProperties: [] }] } }),
    } as Response)
    expect(await fetchBrandNamesByRxcui('723')).toEqual([])
  })

  it('returns [] on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    expect(await fetchBrandNamesByRxcui('723')).toEqual([])
  })

  it('returns [] when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network timeout'))
    expect(await fetchBrandNamesByRxcui('723')).toEqual([])
  })

  it('returns [] for an empty rxcui without calling the API', async () => {
    expect(await fetchBrandNamesByRxcui('')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
