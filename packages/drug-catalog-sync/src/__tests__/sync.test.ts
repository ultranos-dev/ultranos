import { describe, it, expect } from 'vitest'
import { runCatalogSync, runBrandSync } from '../sync.js'
import { InMemoryDrugCatalogStore } from '../memory-store.js'
import type {
  CatalogClient,
  DrugEntry,
  DrugSyncPage,
  BrandSyncPage,
  PresentationSyncPage,
} from '../client.js'

const entry = (atcCode: string): DrugEntry =>
  ({ atcCode, innName: 'x', brandNames: [], doseForms: [], therapeuticClass: '' }) as unknown as DrugEntry

function clientFrom(opts: {
  drugPages?: DrugSyncPage[]
  brandPages?: BrandSyncPage[]
  presentationPages?: PresentationSyncPage[]
  drugSinceArgs?: number[]
  brandSinceArgs?: number[]
  presentationSinceArgs?: number[]
}): CatalogClient {
  let d = 0
  let b = 0
  let p = 0
  return {
    async syncDrugs(sinceVersion) {
      opts.drugSinceArgs?.push(sinceVersion)
      return opts.drugPages?.[d++] ?? { entries: [], latestVersion: sinceVersion }
    },
    async syncBrands(sinceVersion) {
      opts.brandSinceArgs?.push(sinceVersion)
      // Explicit terminal page — empty brands, latestVersion 0 (safe: empty page exits the loop)
      return opts.brandPages?.[b++] ?? { brands: [], latestVersion: 0 }
    },
    async syncBrandPresentations(sinceVersion) {
      opts.presentationSinceArgs?.push(sinceVersion)
      // Explicit terminal page
      return opts.presentationPages?.[p++] ?? { presentations: [], latestVersion: 0 }
    },
  }
}

describe('runCatalogSync', () => {
  it('pages through a cold sync, accumulates rows, and advances the cursor', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({
      drugPages: [
        { entries: [entry('A'), entry('B')], latestVersion: 10 }, // full page (size 2)
        { entries: [entry('C')], latestVersion: 11 }, // short page → stop
      ],
    })
    const result = await runCatalogSync(store, client, 2)
    expect(result).toEqual({ drugsSynced: 3, latestVersion: 11 })
    expect(store.drugs.size).toBe(3)
    expect(await store.getCursor('catalogVersion')).toBe('11')
    expect(await store.getCursor('lastSyncAt')).not.toBeNull()
  })

  it('resumes a delta sync from the stored cursor', async () => {
    const store = new InMemoryDrugCatalogStore()
    await store.setCursor('catalogVersion', '11')
    const drugSinceArgs: number[] = []
    const client = clientFrom({
      drugPages: [{ entries: [entry('D')], latestVersion: 12 }],
      drugSinceArgs,
    })
    await runCatalogSync(store, client, 200)
    expect(drugSinceArgs[0]).toBe(11)
    expect(await store.getCursor('catalogVersion')).toBe('12')
  })

  it('throws when the server returns rows but a non-advancing version', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({ drugPages: [{ entries: [entry('A')], latestVersion: 0 }] })
    await expect(runCatalogSync(store, client, 200)).rejects.toThrow('non-advancing')
  })

  it('no-ops cleanly when the server has nothing new', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({ drugPages: [{ entries: [], latestVersion: 0 }] })
    const result = await runCatalogSync(store, client, 200)
    expect(result.drugsSynced).toBe(0)
    // lastSyncAt must be stamped even when nothing was synced — it means "last checked"
    expect(await store.getCursor('lastSyncAt')).not.toBeNull()
  })
})

describe('runBrandSync', () => {
  it('syncs brands and presentations on independent cursors', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({
      brandPages: [{ brands: [{ id: 'b1' } as never], latestVersion: 5 }],
      presentationPages: [{ presentations: [{ id: 'p1' } as never], latestVersion: 9 }],
    })
    const result = await runBrandSync(store, client, 200)
    expect(result).toEqual({
      brandsSynced: 1,
      presentationsSynced: 1,
      brandsVersion: 5,
      presentationsVersion: 9,
    })
    expect(await store.getCursor('brandsVersion')).toBe('5')
    expect(await store.getCursor('presentationsVersion')).toBe('9')
  })

  it('pages through multiple brand pages, accumulates rows, and advances cursor', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({
      // pageSize=2: page 1 is full (2 brands) → continue; page 2 is short (1 brand) → stop
      brandPages: [
        { brands: [{ id: 'b1' } as never, { id: 'b2' } as never], latestVersion: 5 },
        { brands: [{ id: 'b3' } as never], latestVersion: 7 },
      ],
      // No presentations — terminal page returned by fallback
    })
    const result = await runBrandSync(store, client, 2)
    expect(result.brandsSynced).toBe(3)
    expect(result.brandsVersion).toBe(7)
    expect(await store.getCursor('brandsVersion')).toBe('7')
    expect(store.brands.size).toBe(3)
  })

  it('resumes brand sync from stored cursor and passes sinceVersion correctly', async () => {
    const store = new InMemoryDrugCatalogStore()
    await store.setCursor('brandsVersion', '5')
    const brandSinceArgs: number[] = []
    const client = clientFrom({
      brandSinceArgs,
      brandPages: [{ brands: [{ id: 'b4' } as never], latestVersion: 6 }],
    })
    await runBrandSync(store, client, 200)
    expect(brandSinceArgs[0]).toBe(5)
    expect(await store.getCursor('brandsVersion')).toBe('6')
  })

  it('throws when server returns brands but a non-advancing brands version', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({
      brandPages: [{ brands: [{ id: 'b1' } as never], latestVersion: 0 }],
    })
    await expect(runBrandSync(store, client, 200)).rejects.toThrow('non-advancing')
  })

  it('pages through multiple presentation pages, accumulates rows, and advances cursor', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({
      // No brands — terminal page returned by fallback
      // pageSize=2: page 1 is full (2 presentations) → continue; page 2 is short (1) → stop
      presentationPages: [
        { presentations: [{ id: 'p1' } as never, { id: 'p2' } as never], latestVersion: 3 },
        { presentations: [{ id: 'p3' } as never], latestVersion: 8 },
      ],
    })
    const result = await runBrandSync(store, client, 2)
    expect(result.presentationsSynced).toBe(3)
    expect(result.presentationsVersion).toBe(8)
    expect(await store.getCursor('presentationsVersion')).toBe('8')
    expect(store.presentations.size).toBe(3)
  })

  it('resumes presentation sync from stored cursor and passes sinceVersion correctly', async () => {
    const store = new InMemoryDrugCatalogStore()
    await store.setCursor('presentationsVersion', '4')
    const presentationSinceArgs: number[] = []
    const client = clientFrom({
      presentationSinceArgs,
      presentationPages: [{ presentations: [{ id: 'p5' } as never], latestVersion: 10 }],
    })
    await runBrandSync(store, client, 200)
    expect(presentationSinceArgs[0]).toBe(4)
    expect(await store.getCursor('presentationsVersion')).toBe('10')
  })

  it('throws when server returns presentations but a non-advancing presentations version', async () => {
    const store = new InMemoryDrugCatalogStore()
    const client = clientFrom({
      presentationPages: [{ presentations: [{ id: 'p1' } as never], latestVersion: 0 }],
    })
    await expect(runBrandSync(store, client, 200)).rejects.toThrow('non-advancing')
  })
})
