import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import type { DrugBrandPresentation } from '@ultranos/shared-types'
import { db } from './db'

/** A brand and its marketed presentations, for the monograph drawer's Brands section. */
export interface BrandWithPresentations {
  brandName: string
  manufacturer?: string
  presentations: DrugBrandPresentation[]
}

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

/**
 * Brands marketed for a generic ATC, each joined to its marketed presentations
 * (strength · form · pack · price), from the on-device mirror. Sorted by brand name.
 */
export async function getBrandsWithPresentationsForAtc(atc: string): Promise<BrandWithPresentations[]> {
  if (!atc) return []
  const brands = await db.drugBrandsMirror.where('genericAtcCode').equals(atc).toArray()
  const out: BrandWithPresentations[] = []
  for (const b of brands) {
    const presentations = await db.drugBrandPresentationsMirror.where('brandId').equals(b.id).toArray()
    out.push({ brandName: b.brandName, manufacturer: b.manufacturer ?? undefined, presentations })
  }
  return out.sort((a, z) => a.brandName.localeCompare(z.brandName))
}
