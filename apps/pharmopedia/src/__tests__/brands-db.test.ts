import { describe, it, expect } from 'vitest'
import { getBrandsWithPresentations } from '@/db/brands'

/**
 * Fake db that routes getAllAsync by which table the query hits, so we can
 * exercise the brand→presentations grouping without a real SQLite engine.
 */
function fakeDb(brands: Array<Record<string, unknown>>, presentations: Array<Record<string, unknown>>) {
  return {
    getAllAsync: async (sql: string) => {
      if (sql.includes('drug_brand_presentations')) return presentations
      if (sql.includes('drug_brands')) return brands
      return []
    },
  } as unknown as Parameters<typeof getBrandsWithPresentations>[0]
}

const BRANDS = [
  { id: 'b1', generic_atc_code: 'J01CR02', brand_name: 'Augmentin', manufacturer: 'GSK', brand_name_local: '{"ar":"أوجمنتين"}', rx_status: 'rx', version: 10 },
  { id: 'b2', generic_atc_code: 'J01CR02', brand_name: 'Curam', manufacturer: '', brand_name_local: null, rx_status: 'unknown', version: 11 },
]
const PRES = [
  { id: 'p1', brand_id: 'b1', strength: '625 mg', dose_form: 'tablet', pack_size: 14, pack_unit: 'tablets', volume: null, reference_price: 12.5, currency: 'AFN', registration_status: 'marketed', version: 20 },
  { id: 'p2', brand_id: 'b1', strength: '228 mg/5 mL', dose_form: 'suspension', volume: '100 mL', reference_price: null, currency: null, registration_status: 'marketed', version: 21 },
]

describe('getBrandsWithPresentations', () => {
  it('groups presentations under their brand and maps to camelCase', async () => {
    const out = await getBrandsWithPresentations(fakeDb(BRANDS, PRES), 'J01CR02')
    expect(out).toHaveLength(2)
    const augmentin = out.find((b) => b.brandName === 'Augmentin')!
    expect(augmentin.manufacturer).toBe('GSK')
    expect(augmentin.brandNameLocal).toEqual({ ar: 'أوجمنتين' })
    expect(augmentin.presentations).toHaveLength(2)
    expect(augmentin.presentations[0]!.strength).toBe('625 mg')
    expect(augmentin.presentations[0]!.referencePrice).toBe(12.5)
  })

  it('maps empty manufacturer to undefined and a brand with no presentations to []', async () => {
    const out = await getBrandsWithPresentations(fakeDb(BRANDS, PRES), 'J01CR02')
    const curam = out.find((b) => b.brandName === 'Curam')!
    expect(curam.manufacturer).toBeUndefined()
    expect(curam.brandNameLocal).toEqual({})
    expect(curam.presentations).toEqual([])
  })

  it('returns [] when the drug has no brands', async () => {
    expect(await getBrandsWithPresentations(fakeDb([], []), 'X')).toEqual([])
  })
})
