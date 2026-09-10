import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { searchMedications } from '@/lib/medication-search'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const drug = (atcCode: string, innName: string, brandNames: string[], doseForms = ['capsule']): DrugEntry =>
  ({ atcCode, innName, brandNames, doseForms, therapeuticClass: '' }) as unknown as DrugEntry

const brand = (id: string, genericAtcCode: string, brandName: string, manufacturer?: string) =>
  ({ id, genericAtcCode, brandName, manufacturer }) as never

const pres = (id: string, brandId: string, strength?: string, doseForm?: string, route?: string) =>
  ({ id, brandId, strength, doseForm, route }) as never

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  await db.drugBrandsMirror.clear()
  await db.drugBrandPresentationsMirror.clear()
  vi.stubGlobal('navigator', { onLine: false }) // force offline mirror path
})

describe('searchMedications — presentation enrichment', () => {
  it('emits one row per presentation with real strength, brand, manufacturer, and route', async () => {
    await db.drugCatalogMirror.bulkPut([drug('J01CA04', 'Amoxicillin', ['Amoxil'])] as never[])
    await db.drugBrandsMirror.bulkPut([brand('b1', 'J01CA04', 'Amoxil', 'GSK')])
    await db.drugBrandPresentationsMirror.bulkPut([
      pres('p1', 'b1', '500 mg', 'Capsule', 'PO'),
      pres('p2', 'b1', '250 mg', 'Capsule', 'PO'),
    ])

    const results = await searchMedications('Amox')
    const row500 = results.find((r) => r.item.strength === '500 mg')
    expect(row500).toBeDefined()
    expect(row500!.item.code).toBe('J01CA04')
    expect(row500!.item.brandName).toBe('Amoxil')
    expect(row500!.item.manufacturer).toBe('GSK')
    expect(row500!.item.route).toBe('PO')
    expect(row500!.item.presentationId).toBe('p1')
    expect(results.some((r) => r.item.strength === '250 mg')).toBe(true)
  })

  it('includes exactly one generic fallback row per ATC (no per-brand-name duplicates)', async () => {
    await db.drugCatalogMirror.bulkPut([drug('J01CA04', 'Amoxicillin', ['Amoxil', 'Moxatag', 'Trimox'])] as never[])
    await db.drugBrandsMirror.bulkPut([brand('b1', 'J01CA04', 'Amoxil')])
    await db.drugBrandPresentationsMirror.bulkPut([pres('p1', 'b1', '500 mg', 'Capsule')])

    const results = await searchMedications('Amox')
    const genericRows = results.filter((r) => r.item.code === 'J01CA04' && !r.item.brandName)
    expect(genericRows).toHaveLength(1)
  })

  it('dedupes presentations identical in brand, strength, and form', async () => {
    await db.drugCatalogMirror.bulkPut([drug('J01CA04', 'Amoxicillin', ['Amoxil'])] as never[])
    await db.drugBrandsMirror.bulkPut([brand('b1', 'J01CA04', 'Amoxil')])
    await db.drugBrandPresentationsMirror.bulkPut([
      pres('p1', 'b1', '500 mg', 'Capsule'),
      pres('p2', 'b1', '500 mg', 'Capsule'), // exact duplicate
    ])

    const results = await searchMedications('Amox')
    const brandRows = results.filter((r) => r.item.brandName === 'Amoxil' && r.item.strength === '500 mg')
    expect(brandRows).toHaveLength(1)
  })

  it('caps presentation rows per generic to avoid flooding the list', async () => {
    await db.drugCatalogMirror.bulkPut([drug('J01CA04', 'Amoxicillin', ['Amoxil'])] as never[])
    await db.drugBrandsMirror.bulkPut([brand('b1', 'J01CA04', 'Amoxil')])
    await db.drugBrandPresentationsMirror.bulkPut(
      Array.from({ length: 10 }, (_, i) => pres(`p${i}`, 'b1', `${(i + 1) * 50} mg`, 'Capsule')),
    )

    const results = await searchMedications('Amox')
    const brandRows = results.filter((r) => r.item.brandName === 'Amoxil')
    expect(brandRows.length).toBeLessThanOrEqual(6)
  })

  it('degrades to a single generic row when the ATC has no presentations', async () => {
    await db.drugCatalogMirror.bulkPut([drug('C07AB07', 'Bisoprolol', ['Concor'])] as never[])

    const results = await searchMedications('Bisopro')
    const rows = results.filter((r) => r.item.code === 'C07AB07')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.item.strength).toBe('')
    expect(rows[0]!.item.brandName).toBeUndefined()
  })

  it('still matches a brand-name query and returns enriched generic rows', async () => {
    await db.drugCatalogMirror.bulkPut([drug('J01CA04', 'Amoxicillin', ['Amoxil'])] as never[])
    await db.drugBrandsMirror.bulkPut([brand('b1', 'J01CA04', 'Amoxil', 'GSK')])
    await db.drugBrandPresentationsMirror.bulkPut([pres('p1', 'b1', '500 mg', 'Capsule', 'PO')])

    const results = await searchMedications('Amoxil')
    expect(results.some((r) => r.item.code === 'J01CA04')).toBe(true)
  })
})
