import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runRxnavBrandsEtl } from '../run-rxnav-brands.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert }
}

describe('runRxnavBrandsEtl', () => {
  it('merges fetched brands into existing, dedupes, and upserts changed rows', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01CA04', inn_name: 'Amoxicillin', rxnorm_cui: '723', brand_names: ['Amoxil'] },
    ]
    const fetchBrands = vi.fn(async () => ['AMOXIL', 'Moxatag', 'Trimox'])
    const res = await runRxnavBrandsEtl({ supabase: client, catalogRows, fetchBrands })

    expect(fetchBrands).toHaveBeenCalledWith('723')
    expect(res.enriched).toBe(1)
    expect(res.brandsAdded).toBe(2)
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(row.brand_names).toEqual(['Amoxil', 'Moxatag', 'Trimox'])
    expect(row.atc_code).toBe('J01CA04')
    expect(row.last_etl_refresh).toBeDefined()
    // Default run does not touch the optional provenance column.
    expect(row.brand_sources).toBeUndefined()
  })

  it('skips rows without an rxnorm_cui (no API call, no update)', async () => {
    const { client, upsert } = makeSupabase()
    const fetchBrands = vi.fn(async () => ['Whatever'])
    const res = await runRxnavBrandsEtl({
      supabase: client,
      catalogRows: [{ atc_code: 'X', inn_name: 'X', rxnorm_cui: null, brand_names: [] }],
      fetchBrands,
    })
    expect(fetchBrands).not.toHaveBeenCalled()
    expect(res.withCui).toBe(0)
    expect(res.enriched).toBe(0)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('is idempotent — no update when fetched brands are already present', async () => {
    const { client, upsert } = makeSupabase()
    const res = await runRxnavBrandsEtl({
      supabase: client,
      catalogRows: [{ atc_code: 'J01CA04', inn_name: 'Amoxicillin', rxnorm_cui: '723', brand_names: ['Amoxil'] }],
      fetchBrands: async () => ['amoxil'],
    })
    expect(res.enriched).toBe(0)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('writes brand_sources provenance when writeSources is enabled', async () => {
    const { client, upsert } = makeSupabase()
    const res = await runRxnavBrandsEtl({
      supabase: client,
      writeSources: true,
      catalogRows: [{
        atc_code: 'J01CA04', inn_name: 'Amoxicillin', rxnorm_cui: '723',
        brand_names: ['Amoxil'], brand_sources: { amoxil: 'drugbank' },
      }],
      fetchBrands: async () => ['Moxatag'],
    })
    expect(res.enriched).toBe(1)
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(row.brand_sources).toEqual({ amoxil: 'drugbank', moxatag: 'rxnav' })
  })
})
