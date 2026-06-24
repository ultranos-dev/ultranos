import { describe, it, expect } from 'vitest'
import { runDrugCatalogSync } from '@/lib/drug-catalog-sync'
import { InMemoryDrugCatalogStore } from '@ultranos/drug-catalog-sync'
import type { CatalogClient } from '@ultranos/drug-catalog-sync'

function fakeClient(): CatalogClient {
  let d = 0
  return {
    async syncDrugs() {
      d++
      return d === 1
        ? { entries: [{ atcCode: 'A', innName: 'Aspirin', brandNames: [], doseForms: [], therapeuticClass: '' } as never], latestVersion: 1 }
        : { entries: [], latestVersion: 1 }
    },
    async syncBrands() { return { brands: [], latestVersion: 0 } },
    async syncBrandPresentations() { return { presentations: [], latestVersion: 0 } },
  }
}

describe('runDrugCatalogSync', () => {
  it('drives catalog + brand sync into the store and reports counts', async () => {
    const store = new InMemoryDrugCatalogStore()
    const result = await runDrugCatalogSync(store, fakeClient())
    expect(result.drugs).toBe(1)
    expect(store.drugs.get('A')?.innName).toBe('Aspirin')
    expect(await store.getCursor('catalogVersion')).toBe('1')
  })
})
