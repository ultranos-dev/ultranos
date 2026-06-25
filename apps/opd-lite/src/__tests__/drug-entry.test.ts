import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { getMirrorDrugEntry, getBrandNamesForAtc } from '@/lib/drug-entry'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const entry = (atcCode: string): DrugEntry =>
  ({ atcCode, innName: 'Amoxicillin', brandNames: [], doseForms: ['capsule'], therapeuticClass: 'Penicillins',
     contraindications: ['Hypersensitivity to penicillins'] }) as unknown as DrugEntry

beforeEach(async () => { await db.open(); await db.drugCatalogMirror.clear() })

describe('getMirrorDrugEntry', () => {
  it('returns the entry for a known ATC', async () => {
    await db.drugCatalogMirror.put(entry('J01CA04') as never)
    const e = await getMirrorDrugEntry('J01CA04')
    expect(e?.innName).toBe('Amoxicillin')
  })
  it('returns null for an unknown ATC or empty input', async () => {
    expect(await getMirrorDrugEntry('X')).toBeNull()
    expect(await getMirrorDrugEntry('')).toBeNull()
  })
})

describe('getBrandNamesForAtc', () => {
  it('returns distinct sorted brand names for an ATC', async () => {
    await db.drugBrandsMirror.clear()
    await db.drugBrandsMirror.bulkPut([
      { id: 'b1', genericAtcCode: 'J01CA04', brandName: 'Moxil' },
      { id: 'b2', genericAtcCode: 'J01CA04', brandName: 'Amoxil' },
      { id: 'b3', genericAtcCode: 'C07AB07', brandName: 'Concor' },
    ] as never[])
    expect(await getBrandNamesForAtc('J01CA04')).toEqual(['Amoxil', 'Moxil'])
    expect(await getBrandNamesForAtc('')).toEqual([])
  })
})
