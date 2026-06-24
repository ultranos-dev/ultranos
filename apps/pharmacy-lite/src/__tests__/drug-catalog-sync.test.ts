import { describe, it, expect, vi } from 'vitest'

// Mock auth-session-store to avoid Supabase env var requirement at import time
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ getAccessToken: async () => 'test-token' }),
  },
}))

// Mock trpc to avoid environment dependency
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: () => 'http://localhost:3004/api/trpc',
}))

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

describe('Pharmacy runDrugCatalogSync', () => {
  it('drives catalog + brand sync into the store', async () => {
    const store = new InMemoryDrugCatalogStore()
    const result = await runDrugCatalogSync(store, fakeClient())
    expect(result.drugs).toBe(1)
    expect(store.drugs.get('A')?.innName).toBe('Aspirin')
    expect(await store.getCursor('catalogVersion')).toBe('1')
  })
})
