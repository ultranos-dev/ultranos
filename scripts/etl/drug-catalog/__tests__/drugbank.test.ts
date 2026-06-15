import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchFromDrugBank } from '../sources/drugbank.js'

describe('fetchFromDrugBank', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns empty SourceDrugData when no API key is set', async () => {
    vi.stubEnv('DRUGBANK_API_KEY', '')

    const result = await fetchFromDrugBank('J01CA04', 'amoxicillin')

    expect(result.source).toBe('drugbank')
    expect(result.atcCode).toBe('J01CA04')
    expect(result.rxnormCui).toBeUndefined()
    expect(result.brandNames).toBeUndefined()
  })

  it('still returns empty data when API key is set (Phase 1 stub)', async () => {
    vi.stubEnv('DRUGBANK_API_KEY', 'test-key-12345')

    const result = await fetchFromDrugBank('J01CA04', 'amoxicillin')

    // Phase 1: stub returns empty even with key — full impl is Phase 2
    expect(result.source).toBe('drugbank')
    expect(result.atcCode).toBe('J01CA04')
  })
})
