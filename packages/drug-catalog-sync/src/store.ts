import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
import type { DrugEntry } from './client.js'

export type CursorKey =
  | 'catalogVersion'
  | 'brandsVersion'
  | 'presentationsVersion'
  | 'lastSyncAt'

/**
 * Platform-agnostic local mirror. Each app provides a Dexie/SQLite-backed
 * implementation (Phase 1/2); tests and adapter unit tests use InMemoryDrugCatalogStore.
 */
export interface DrugCatalogStore {
  getCursor(key: CursorKey): Promise<string | null>
  setCursor(key: CursorKey, value: string): Promise<void>
  upsertDrugs(entries: DrugEntry[]): Promise<void>
  upsertBrands(brands: DrugBrand[]): Promise<void>
  upsertPresentations(presentations: DrugBrandPresentation[]): Promise<void>
}
