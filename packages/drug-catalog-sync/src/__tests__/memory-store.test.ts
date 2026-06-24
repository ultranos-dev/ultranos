import { describe, it, expect } from 'vitest'
import { InMemoryDrugCatalogStore } from '../memory-store.js'
import type { DrugEntry } from '../client.js'

const entry = (atcCode: string): DrugEntry =>
  ({ atcCode, innName: 'x', brandNames: [], doseForms: [], therapeuticClass: '' }) as unknown as DrugEntry

describe('InMemoryDrugCatalogStore', () => {
  it('round-trips cursors', async () => {
    const store = new InMemoryDrugCatalogStore()
    expect(await store.getCursor('catalogVersion')).toBeNull()
    await store.setCursor('catalogVersion', '17')
    expect(await store.getCursor('catalogVersion')).toBe('17')
  })

  it('upserts drugs keyed by atcCode (last write wins)', async () => {
    const store = new InMemoryDrugCatalogStore()
    await store.upsertDrugs([entry('A'), entry('B')])
    await store.upsertDrugs([entry('A')])
    expect(store.drugs.size).toBe(2)
    expect(store.drugs.get('A')?.atcCode).toBe('A')
  })

  it('upserts brands keyed by id (last write wins)', async () => {
    const store = new InMemoryDrugCatalogStore()
    await store.upsertBrands([{ id: 'b1' } as never, { id: 'b2' } as never])
    await store.upsertBrands([{ id: 'b1' } as never])
    expect(store.brands.size).toBe(2)
  })

  it('upserts presentations keyed by id (last write wins)', async () => {
    const store = new InMemoryDrugCatalogStore()
    await store.upsertPresentations([{ id: 'p1' } as never, { id: 'p2' } as never])
    await store.upsertPresentations([{ id: 'p1' } as never])
    expect(store.presentations.size).toBe(2)
  })
})
