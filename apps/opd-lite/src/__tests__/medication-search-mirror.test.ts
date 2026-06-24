import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { searchMedications } from '@/lib/medication-search'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const drug = (atcCode: string, innName: string, brandNames: string[]): DrugEntry =>
  ({ atcCode, innName, brandNames, doseForms: ['tablet'], therapeuticClass: '' }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  // Force the offline branch deterministically.
  vi.stubGlobal('navigator', { onLine: false })
})

describe('searchMedications (mirror-backed offline)', () => {
  it('finds a generic by its brand name from the mirror', async () => {
    await db.drugCatalogMirror.bulkPut([
      drug('J01CR02', 'Amoxicillin/clavulanate', ['Augmentin']),
      drug('C07AB07', 'Bisoprolol', ['Concor']),
    ] as never[])
    const results = await searchMedications('Augmentin')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.item.display).toContain('Amoxicillin')
  })

  it('finds a generic by INN from the mirror', async () => {
    await db.drugCatalogMirror.bulkPut([drug('C07AB07', 'Bisoprolol', ['Concor'])] as never[])
    const results = await searchMedications('Bisopro')
    expect(results[0]!.item.code).toBe('C07AB07')
  })
})
