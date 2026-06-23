import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runRegionalBrandsEtl } from '../run-regional-brands.js'
import type { RegionalBrandRecord } from '../sources/regional-brands.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert }
}

const RECORDS: RegionalBrandRecord[] = [
  { atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil', 'Ospamox'], market: 'AF' },
  { innName: 'acetaminophen', brandNames: ['Panadol'], market: 'AF' },
]

describe('runRegionalBrandsEtl', () => {
  it('merges matched regional brands into the catalog and upserts changed rows', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01CA04', inn_name: 'Amoxicillin', brand_names: ['Amoxil'] },          // gains Ospamox
      { atc_code: 'N02BE01', inn_name: 'paracetamol', brand_names: [] },                   // gains Panadol via alias
      { atc_code: 'Z99ZZ99', inn_name: 'Nonexistol', brand_names: ['Keepme'] },            // no match
    ]
    const res = await runRegionalBrandsEtl({ supabase: client, records: RECORDS, catalogRows })

    expect(res.datasetRecords).toBe(2)
    expect(res.matched).toBe(2)
    expect(res.enriched).toBe(2)
    expect(res.brandsAdded).toBe(2)

    const upserted = (upsert.mock.calls[0][0] as Record<string, unknown>[])
    const amox = upserted.find((r) => r.atc_code === 'J01CA04')!
    expect(amox.brand_names).toEqual(['Amoxil', 'Ospamox'])
    const para = upserted.find((r) => r.atc_code === 'N02BE01')!
    expect(para.brand_names).toEqual(['Panadol'])
    expect(upserted.find((r) => r.atc_code === 'Z99ZZ99')).toBeUndefined()
  })

  it('is idempotent — re-run with already-present brands updates nothing', async () => {
    const { client, upsert } = makeSupabase()
    const res = await runRegionalBrandsEtl({
      supabase: client,
      records: RECORDS,
      catalogRows: [{ atc_code: 'J01CA04', inn_name: 'Amoxicillin', brand_names: ['Amoxil', 'Ospamox'] }],
    })
    expect(res.enriched).toBe(0)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('records regional provenance when writeSources is enabled', async () => {
    const { client, upsert } = makeSupabase()
    await runRegionalBrandsEtl({
      supabase: client,
      writeSources: true,
      records: [{ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Ospamox'] }],
      catalogRows: [{ atc_code: 'J01CA04', inn_name: 'Amoxicillin', brand_names: ['Amoxil'], brand_sources: { amoxil: 'drugbank' } }],
    })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(row.brand_sources).toEqual({ amoxil: 'drugbank', ospamox: 'regional' })
  })
})
