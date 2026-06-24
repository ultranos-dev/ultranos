export const PACKAGE_NAME = '@ultranos/drug-catalog-sync'

export { createCatalogClient } from './client.js'
export type {
  CatalogClient,
  CatalogClientConfig,
  DrugEntry,
  DrugSyncPage,
  BrandSyncPage,
  PresentationSyncPage,
} from './client.js'

export type { DrugCatalogStore, CursorKey } from './store.js'
export { InMemoryDrugCatalogStore } from './memory-store.js'

export { runCatalogSync, runBrandSync, CATALOG_SYNC_PAGE_SIZE } from './sync.js'
export type { CatalogSyncResult, BrandSyncResult } from './sync.js'

export { hasText, hasList, hasValue, isTier2, isTier3, presence } from './coverage.js'
export type { FieldPresence } from './coverage.js'
