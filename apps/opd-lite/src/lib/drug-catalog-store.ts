import type { DrugCatalogStore, CursorKey, DrugEntry } from '@ultranos/drug-catalog-sync'
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
import { db } from './db'

/**
 * Dexie-backed mirror store for the enriched drug catalog (non-PHI, plaintext).
 * Implements the @ultranos/drug-catalog-sync DrugCatalogStore contract so the
 * shared sync orchestrator can write into OPD-Lite's IndexedDB.
 */
export class DexieDrugCatalogStore implements DrugCatalogStore {
  async getCursor(key: CursorKey): Promise<string | null> {
    const row = await db.drugCatalogSyncMeta.get(key)
    return row?.value ?? null
  }

  async setCursor(key: CursorKey, value: string): Promise<void> {
    await db.drugCatalogSyncMeta.put({ key, value })
  }

  async upsertDrugs(entries: DrugEntry[]): Promise<void> {
    await db.drugCatalogMirror.bulkPut(entries)
  }

  async upsertBrands(brands: DrugBrand[]): Promise<void> {
    await db.drugBrandsMirror.bulkPut(brands)
  }

  async upsertPresentations(presentations: DrugBrandPresentation[]): Promise<void> {
    await db.drugBrandPresentationsMirror.bulkPut(presentations)
  }
}

export function createDexieDrugCatalogStore(): DrugCatalogStore {
  return new DexieDrugCatalogStore()
}
