import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
import type { DrugEntry } from './client.js'
import type { CursorKey, DrugCatalogStore } from './store.js'

export class InMemoryDrugCatalogStore implements DrugCatalogStore {
  readonly drugs = new Map<string, DrugEntry>()
  readonly brands = new Map<string, DrugBrand>()
  readonly presentations = new Map<string, DrugBrandPresentation>()
  private readonly cursors = new Map<CursorKey, string>()

  async getCursor(key: CursorKey): Promise<string | null> {
    return this.cursors.get(key) ?? null
  }

  async setCursor(key: CursorKey, value: string): Promise<void> {
    this.cursors.set(key, value)
  }

  async upsertDrugs(entries: DrugEntry[]): Promise<void> {
    for (const e of entries) this.drugs.set(e.atcCode, e)
  }

  async upsertBrands(brands: DrugBrand[]): Promise<void> {
    for (const b of brands) this.brands.set(b.id, b)
  }

  async upsertPresentations(presentations: DrugBrandPresentation[]): Promise<void> {
    for (const p of presentations) this.presentations.set(p.id, p)
  }
}
