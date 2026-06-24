import type { CatalogClient } from './client.js'
import type { DrugCatalogStore } from './store.js'

export const CATALOG_SYNC_PAGE_SIZE = 200

export interface CatalogSyncResult {
  drugsSynced: number
  latestVersion: number
}

export interface BrandSyncResult {
  brandsSynced: number
  presentationsSynced: number
  brandsVersion: number
  presentationsVersion: number
}

/** Paged delta pull of the generic catalog. Persists the cursor after each page. */
export async function runCatalogSync(
  store: DrugCatalogStore,
  client: CatalogClient,
  pageSize: number = CATALOG_SYNC_PAGE_SIZE,
): Promise<CatalogSyncResult> {
  let since = Number((await store.getCursor('catalogVersion')) ?? '0')
  let totalSynced = 0
  let latestVersion = since

  for (;;) {
    const page = await client.syncDrugs(since, pageSize)
    if (page.entries.length === 0) break
    if (page.latestVersion <= since) {
      throw new Error('drug-catalog-sync: server returned a non-advancing catalog version')
    }
    await store.upsertDrugs(page.entries)
    since = page.latestVersion
    latestVersion = page.latestVersion
    totalSynced += page.entries.length
    await store.setCursor('catalogVersion', String(latestVersion))
    if (page.entries.length < pageSize) break
  }

  await store.setCursor('lastSyncAt', new Date().toISOString())
  return { drugsSynced: totalSynced, latestVersion }
}

/** Paged delta pull of brands + presentations on their own independent cursors. */
export async function runBrandSync(
  store: DrugCatalogStore,
  client: CatalogClient,
  pageSize: number = CATALOG_SYNC_PAGE_SIZE,
): Promise<BrandSyncResult> {
  let brandsVersion = Number((await store.getCursor('brandsVersion')) ?? '0')
  let brandsSynced = 0
  for (;;) {
    const page = await client.syncBrands(brandsVersion, pageSize)
    if (page.brands.length === 0) break
    if (page.latestVersion <= brandsVersion) {
      throw new Error('drug-catalog-sync: server returned a non-advancing brands version')
    }
    await store.upsertBrands(page.brands)
    brandsVersion = page.latestVersion
    brandsSynced += page.brands.length
    await store.setCursor('brandsVersion', String(brandsVersion))
    if (page.brands.length < pageSize) break
  }

  let presentationsVersion = Number((await store.getCursor('presentationsVersion')) ?? '0')
  let presentationsSynced = 0
  for (;;) {
    const page = await client.syncBrandPresentations(presentationsVersion, pageSize)
    if (page.presentations.length === 0) break
    if (page.latestVersion <= presentationsVersion) {
      throw new Error('drug-catalog-sync: server returned a non-advancing presentations version')
    }
    await store.upsertPresentations(page.presentations)
    presentationsVersion = page.latestVersion
    presentationsSynced += page.presentations.length
    await store.setCursor('presentationsVersion', String(presentationsVersion))
    if (page.presentations.length < pageSize) break
  }

  return { brandsSynced, presentationsSynced, brandsVersion, presentationsVersion }
}
