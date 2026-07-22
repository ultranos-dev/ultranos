import type * as SQLite from 'expo-sqlite'
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
import { syncBrandsApi, syncBrandPresentationsApi } from '@/api/drug-catalog'
import { upsertBrandBatch, upsertPresentationBatch } from '@/db/brands'
import { getSyncMeta, setSyncMeta } from '@/db/drug-catalog'

const SYNC_PAGE_SIZE = 200

export interface BrandsSyncResult {
  brands: number
  presentations: number
}

/** Injectable seams so the paging logic can be unit-tested without network/SQLite. */
export interface BrandsSyncDeps {
  fetchBrands?: (since: number, limit: number, token: string) => Promise<{ brands: DrugBrand[]; latestVersion: number }>
  fetchPresentations?: (since: number, limit: number, token: string) => Promise<{ presentations: DrugBrandPresentation[]; latestVersion: number }>
  upsertBrands?: (db: SQLite.SQLiteDatabase, brands: DrugBrand[]) => Promise<void>
  upsertPresentations?: (db: SQLite.SQLiteDatabase, presentations: DrugBrandPresentation[]) => Promise<void>
  getMeta?: (db: SQLite.SQLiteDatabase, key: string) => Promise<string | null>
  setMeta?: (db: SQLite.SQLiteDatabase, key: string, value: string) => Promise<void>
}

/**
 * Sync branded medications into the local cache. Brands and presentations are
 * separate tables on independent version watermarks, so each pages on its own
 * sync_meta cursor ('brandsVersion' / 'presentationsVersion').
 */
export async function runBrandsSync(
  db: SQLite.SQLiteDatabase,
  token: string,
  deps: BrandsSyncDeps = {},
): Promise<BrandsSyncResult> {
  const fetchBrands = deps.fetchBrands ?? syncBrandsApi
  const fetchPresentations = deps.fetchPresentations ?? syncBrandPresentationsApi
  const upsertBrands = deps.upsertBrands ?? upsertBrandBatch
  const upsertPresentations = deps.upsertPresentations ?? upsertPresentationBatch
  const getMeta = deps.getMeta ?? getSyncMeta
  const setMeta = deps.setMeta ?? setSyncMeta

  let brandCount = 0
  let since = Number((await getMeta(db, 'brandsVersion')) ?? '0') || 0
  while (true) {
    const { brands, latestVersion } = await fetchBrands(since, SYNC_PAGE_SIZE, token)
    if (brands.length === 0) break
    // Guard against a stalled server that returns entries but never advances the
    // version: silently breaking here would leave brands unsynced with no error,
    // producing an incomplete drug reference. Throw loudly instead (matches
    // catalog-sync's stall guard).
    if (latestVersion <= since) {
      throw new Error(
        `Brands sync stalled: server returned entries but version did not advance (since=${since}, latestVersion=${latestVersion})`,
      )
    }
    await upsertBrands(db, brands)
    brandCount += brands.length
    since = latestVersion
    await setMeta(db, 'brandsVersion', String(since))
  }

  let presCount = 0
  let psince = Number((await getMeta(db, 'presentationsVersion')) ?? '0') || 0
  while (true) {
    const { presentations, latestVersion } = await fetchPresentations(psince, SYNC_PAGE_SIZE, token)
    if (presentations.length === 0) break
    // Same stall guard as the brands loop — never silently truncate presentations.
    if (latestVersion <= psince) {
      throw new Error(
        `Presentations sync stalled: server returned entries but version did not advance (since=${psince}, latestVersion=${latestVersion})`,
      )
    }
    await upsertPresentations(db, presentations)
    presCount += presentations.length
    psince = latestVersion
    await setMeta(db, 'presentationsVersion', String(psince))
  }

  return { brands: brandCount, presentations: presCount }
}
