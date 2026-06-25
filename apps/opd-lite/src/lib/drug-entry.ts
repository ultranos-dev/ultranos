import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { db } from './db'

/** Read a full tiered drug entry from the on-device mirror by ATC. Null when absent. */
export async function getMirrorDrugEntry(atcCode: string): Promise<DrugEntry | null> {
  if (!atcCode) return null
  const row = await db.drugCatalogMirror.get(atcCode)
  return (row as DrugEntry | undefined) ?? null
}

/** Distinct, sorted brand names marketed for a generic ATC, from the on-device brands mirror. */
export async function getBrandNamesForAtc(atc: string): Promise<string[]> {
  if (!atc) return []
  const brands = await db.drugBrandsMirror.where('genericAtcCode').equals(atc).toArray()
  return Array.from(new Set(brands.map((b) => b.brandName))).sort()
}
