import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchFromOpenFda } from '../sources/openfda.js'

const AMOXICILLIN_RESPONSE = {
  results: [{
    openfda: {
      brand_name: ['AMOXIL', 'TRIMOX'],
      pharm_class_epc: ['Penicillin-class Antibacterial [EPC]'],
    },
    indications_and_usage: ['Amoxicillin is indicated for infections caused by susceptible organisms.'],
    contraindications: ['Hypersensitivity to any penicillin. History of allergic reaction.'],
    adverse_reactions: ['Nausea, vomiting, diarrhea. Skin rashes. Anaphylaxis in rare cases.'],
    pregnancy: ['Pregnancy Category B. Animal reproduction studies.'],
    mechanism_of_action: ['Amoxicillin is a beta-lactam antibiotic that inhibits cell wall synthesis.'],
  }],
}

describe('fetchFromOpenFda', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns brand names deduplicated', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.source).toBe('openfda')
    expect(result.brandNames).toContain('AMOXIL')
    expect(result.brandNames).toContain('TRIMOX')
  })

  it('strips [EPC] suffix from therapeutic class', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.therapeuticClass).toBe('Penicillin-class Antibacterial')
    expect(result.therapeuticClass).not.toContain('[EPC]')
  })

  it('extracts pregnancy category letter', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.pregnancyCategory).toBe('B')
  })

  it('returns mechanismOfAction string', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.mechanismOfAction).toContain('beta-lactam')
  })

  it('returns empty data on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.brandNames).toBeUndefined()
    expect(result.source).toBe('openfda')
  })

  it('returns empty data when results array is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.brandNames).toBeUndefined()
  })

  it('returns empty data when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.brandNames).toBeUndefined()
  })
})
