import { describe, it, expect } from 'vitest'
import { searchBrandsLocal, getBrandDetail } from '@/db/brands'

/** Fake db that routes getAllAsync/getFirstAsync by the table the SQL hits. */
function fakeDb(handlers: Record<string, unknown>) {
  const pick = (sql: string) => {
    if (sql.includes('b.brand_name LIKE')) return handlers.brand          // searchBrandsLocal
    if (sql.includes('FROM drug_brands b2')) return handlers.siblings     // sibling brands
    if (sql.includes('FROM drug_brand_presentations')) return handlers.presentations
    if (sql.includes('drug_brands')) return handlers.brand                // brand-detail head
    return []
  }
  return {
    getAllAsync: async (sql: string) => pick(sql),
    getFirstAsync: async (sql: string) => {
      const r = pick(sql)
      return Array.isArray(r) ? (r[0] ?? null) : r
    },
  } as never
}

describe('searchBrandsLocal', () => {
  it('returns brand hits joined to their generic, with representative price/form', async () => {
    const db = fakeDb({
      brand: [
        { id: 'b1', brand_name: 'SNOCIP', manufacturer: 'Snow Pharma', generic_atc_code: 'J01MA02', inn_name: 'Ciprofloxacin', dose_form: 'tablet', min_price: 54.4, currency: 'AFN' },
        { id: 'b2', brand_name: 'Cipromin', manufacturer: 'Afghan Medicine', generic_atc_code: 'J01MA02', inn_name: 'Ciprofloxacin', dose_form: 'tablet', min_price: null, currency: null },
      ],
    })
    const out = await searchBrandsLocal(db, 'cip', 20)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      id: 'b1', brandName: 'SNOCIP', manufacturer: 'Snow Pharma',
      genericAtcCode: 'J01MA02', genericInnName: 'Ciprofloxacin',
      doseForm: 'tablet', referencePrice: 54.4, currency: 'AFN',
    })
    expect(out[1]!.manufacturer).toBe('Afghan Medicine')
    expect(out[1]!.referencePrice).toBeUndefined()
  })

  it('returns [] for a blank query', async () => {
    expect(await searchBrandsLocal(fakeDb({ brand: [] }), '  ', 20)).toEqual([])
  })
})

describe('getBrandDetail', () => {
  it('assembles the brand, its presentations, the generic, and sibling brands', async () => {
    const db = fakeDb({
      brand: { id: 'b1', brand_name: 'SNOCIP', manufacturer: 'Snow Pharma', rx_status: 'rx', generic_atc_code: 'J01MA02', inn_name: 'Ciprofloxacin' },
      presentations: [
        { id: 'p1', brand_id: 'b1', strength: '500mg', dose_form: 'tablet', pack_size: 10, pack_unit: 'tablets', reference_price: 83.3, currency: 'AFN', registration_status: 'marketed', version: 1 },
        { id: 'p2', brand_id: 'b1', strength: '250mg', dose_form: 'tablet', reference_price: 54.4, currency: 'AFN', registration_status: 'marketed', version: 1 },
      ],
      siblings: [{ id: 'b2', brand_name: 'Cipromin', manufacturer: 'Afghan Medicine' }],
    })
    const d = await getBrandDetail(db, 'b1')
    expect(d).toBeTruthy()
    expect(d!.brandName).toBe('SNOCIP')
    expect(d!.genericInnName).toBe('Ciprofloxacin')
    expect(d!.genericAtcCode).toBe('J01MA02')
    expect(d!.presentations).toHaveLength(2)
    expect(d!.presentations[0]!.referencePrice).toBe(83.3)
    expect(d!.siblings).toEqual([{ id: 'b2', brandName: 'Cipromin', manufacturer: 'Afghan Medicine' }])
  })

  it('returns null when the brand is not found', async () => {
    const d = await getBrandDetail(fakeDb({ brand: null }), 'missing')
    expect(d).toBeNull()
  })
})
