import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { getLocalBrandsByAtc, getRecallAlertsForAtc, getReferencePriceForAtc } from '@/lib/drug-catalog-queries'

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear(); await db.drugBrandsMirror.clear(); await db.drugBrandPresentationsMirror.clear()
})

describe('drug-catalog-queries', () => {
  it('returns brands + presentations for an ATC', async () => {
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    await db.drugBrandPresentationsMirror.bulkPut([
      { id: 'p1', brandId: 'b1', strength: '500mg', referencePrice: 12.5, currency: 'AFN' } as never,
      { id: 'p2', brandId: 'b1', strength: '250mg', referencePrice: 8, currency: 'AFN' } as never,
    ])
    const brands = await getLocalBrandsByAtc('J01CA04')
    expect(brands).toHaveLength(1)
    expect(brands[0]!.brand.brandName).toBe('Amoxil')
    expect(brands[0]!.presentations).toHaveLength(2)
  })

  it('returns the minimum reference price for an ATC', async () => {
    await db.drugBrandsMirror.put({ id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Amoxil' } as never)
    await db.drugBrandPresentationsMirror.bulkPut([
      { id: 'p1', brandId: 'b1', referencePrice: 12.5, currency: 'AFN' } as never,
      { id: 'p2', brandId: 'b1', referencePrice: 8, currency: 'AFN' } as never,
    ])
    expect(await getReferencePriceForAtc('J01CA04')).toEqual({ min: 8, currency: 'AFN' })
  })

  it('returns active recall alerts for an ATC', async () => {
    await db.drugCatalogMirror.put({
      atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: '',
      recallAlerts: [{ recallId: 'r1', description: 'Lot recall', initiationDate: '2026-01-01', status: 'ongoing' }],
    } as never)
    const recalls = await getRecallAlertsForAtc('J01CA04')
    expect(recalls).toHaveLength(1)
    expect(recalls[0]!.recallId).toBe('r1')
  })

  it('returns empty/null for an ATC with no data', async () => {
    expect(await getLocalBrandsByAtc('X')).toEqual([])
    expect(await getRecallAlertsForAtc('X')).toEqual([])
    expect(await getReferencePriceForAtc('X')).toBeNull()
  })
})
