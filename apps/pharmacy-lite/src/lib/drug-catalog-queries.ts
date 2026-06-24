import type { DrugBrand, DrugBrandPresentation, RecallAlert } from '@ultranos/shared-types'
import { db } from './db'

/** All brands (with their presentations) marketed for a generic ATC, from the local mirror. */
export async function getLocalBrandsByAtc(
  atc: string,
): Promise<Array<{ brand: DrugBrand; presentations: DrugBrandPresentation[] }>> {
  if (!atc) return []
  const brands = await db.drugBrandsMirror.where('genericAtcCode').equals(atc).toArray()
  if (brands.length === 0) return []
  const result: Array<{ brand: DrugBrand; presentations: DrugBrandPresentation[] }> = []
  for (const brand of brands) {
    const presentations = await db.drugBrandPresentationsMirror.where('brandId').equals(brand.id).toArray()
    result.push({ brand, presentations })
  }
  return result
}

/** Active recall alerts for a generic ATC, from the local Tier-3 mirror entry. */
export async function getRecallAlertsForAtc(atc: string): Promise<RecallAlert[]> {
  if (!atc) return []
  const entry = (await db.drugCatalogMirror.get(atc)) as unknown as { recallAlerts?: RecallAlert[] } | undefined
  return (entry?.recallAlerts ?? []).filter((r) => r.status !== 'terminated' && r.status !== 'completed')
}

/** Minimum indicative reference price across a generic's brand presentations. */
export async function getReferencePriceForAtc(atc: string): Promise<{ min: number; currency: string } | null> {
  const brands = await getLocalBrandsByAtc(atc)
  let min: number | null = null
  let currency = ''
  for (const { presentations } of brands) {
    for (const p of presentations) {
      if (typeof p.referencePrice === 'number' && (min === null || p.referencePrice < min)) {
        min = p.referencePrice
        currency = p.currency ?? ''
      }
    }
  }
  // Suppress the card when there's no price or no currency unit to display.
  return min === null || !currency ? null : { min, currency }
}
