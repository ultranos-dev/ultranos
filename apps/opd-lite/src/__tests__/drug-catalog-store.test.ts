import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createDexieDrugCatalogStore } from '@/lib/drug-catalog-store'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const entry = (atcCode: string, innName: string): DrugEntry =>
  ({ atcCode, innName, brandNames: [], doseForms: [], therapeuticClass: '' }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  await db.drugBrandsMirror.clear()
  await db.drugBrandPresentationsMirror.clear()
  await db.drugCatalogSyncMeta.clear()
})

describe('DexieDrugCatalogStore', () => {
  it('round-trips cursors via the meta table', async () => {
    const store = createDexieDrugCatalogStore()
    expect(await store.getCursor('catalogVersion')).toBeNull()
    await store.setCursor('catalogVersion', '42')
    expect(await store.getCursor('catalogVersion')).toBe('42')
  })

  it('upserts drugs keyed by atcCode', async () => {
    const store = createDexieDrugCatalogStore()
    await store.upsertDrugs([entry('A', 'Aspirin'), entry('B', 'Bisoprolol')])
    await store.upsertDrugs([entry('A', 'Aspirin (updated)')])
    expect(await db.drugCatalogMirror.count()).toBe(2)
    expect((await db.drugCatalogMirror.get('A'))?.innName).toBe('Aspirin (updated)')
  })

  it('upserts brands and presentations keyed by id', async () => {
    const store = createDexieDrugCatalogStore()
    await store.upsertBrands([{ id: 'b1', genericAtcCode: 'A' } as never])
    await store.upsertPresentations([{ id: 'p1', brandId: 'b1' } as never])
    expect(await db.drugBrandsMirror.count()).toBe(1)
    expect(await db.drugBrandPresentationsMirror.count()).toBe(1)
  })
})
