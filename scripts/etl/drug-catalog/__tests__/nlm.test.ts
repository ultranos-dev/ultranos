import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchFromNlm } from '../sources/nlm.js'

describe('fetchFromNlm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns rxnormCui when API finds a match', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idGroup: { rxnormId: ['723'] } }),
    } as Response)

    const result = await fetchFromNlm('J01CA04', 'amoxicillin')

    expect(result.source).toBe('nlm')
    expect(result.atcCode).toBe('J01CA04')
    expect(result.rxnormCui).toBe('723')
  })

  it('returns empty data (no rxnormCui) when API returns HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response)

    const result = await fetchFromNlm('J01CA04', 'amoxicillin')

    expect(result.rxnormCui).toBeUndefined()
    expect(result.source).toBe('nlm')
  })

  it('returns empty data when rxnormId array is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idGroup: {} }),
    } as Response)

    const result = await fetchFromNlm('J01CA04', 'amoxicillin')

    expect(result.rxnormCui).toBeUndefined()
  })

  it('URL-encodes the drug name', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idGroup: { rxnormId: ['7052'] } }),
    } as Response)

    await fetchFromNlm('B01AC06', 'acetylsalicylic acid')

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('acetylsalicylic%20acid')
  })

  it('returns empty data when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network timeout'))

    const result = await fetchFromNlm('J01CA04', 'amoxicillin')

    expect(result.rxnormCui).toBeUndefined()
  })
})
