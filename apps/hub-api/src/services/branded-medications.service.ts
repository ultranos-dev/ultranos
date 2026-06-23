import type {
  DrugBrand,
  DrugBrandPresentation,
  DrugBrandWithPresentations,
  DrugLocalNames,
} from '@ultranos/shared-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawRow = Record<string, any>

/** Map a drug_brands row to a DrugBrand. Branded data is non-PHI — no role scoping. */
export function mapBrandRow(row: RawRow): DrugBrand {
  return {
    id: row.id as string,
    genericAtcCode: row.generic_atc_code as string,
    brandName: row.brand_name as string,
    // '' is the DB sentinel for "unknown manufacturer" — surface as undefined.
    manufacturer: row.manufacturer ? (row.manufacturer as string) : undefined,
    brandNameLocal: (row.brand_name_local ?? {}) as DrugLocalNames,
    rxStatus: (row.rx_status ?? 'unknown') as 'rx' | 'otc' | 'unknown',
    version: row.version as number,
    lastUpdated: row.last_updated as string,
  }
}

/** Map a drug_brand_presentations row to a DrugBrandPresentation. */
export function mapPresentationRow(row: RawRow): DrugBrandPresentation {
  return {
    id: row.id as string,
    brandId: row.brand_id as string,
    strength: (row.strength ?? undefined) as string | undefined,
    doseForm: (row.dose_form ?? undefined) as string | undefined,
    route: (row.route ?? undefined) as string | undefined,
    packSize: (row.pack_size ?? undefined) as number | undefined,
    packUnit: (row.pack_unit ?? undefined) as string | undefined,
    volume: (row.volume ?? undefined) as string | undefined,
    gtin: (row.gtin ?? undefined) as string | undefined,
    registrationNumber: (row.registration_number ?? undefined) as string | undefined,
    registrationStatus: (row.registration_status ?? 'unknown') as 'marketed' | 'withdrawn' | 'unknown',
    market: (row.market ?? undefined) as string | undefined,
    // NUMERIC comes back from PostgREST as a string — coerce, but keep undefined when absent.
    referencePrice: row.reference_price != null ? Number(row.reference_price) : undefined,
    currency: (row.currency ?? undefined) as string | undefined,
    packagingPhotoUrl: (row.packaging_photo_url ?? undefined) as string | undefined,
    version: row.version as number,
    lastUpdated: row.last_updated as string,
  }
}

/** Map a drug_brands row with an embedded drug_brand_presentations[] into a nested entity. */
export function mapBrandWithPresentations(row: RawRow): DrugBrandWithPresentations {
  const presentations = ((row.drug_brand_presentations ?? []) as RawRow[]).map(mapPresentationRow)
  return { ...mapBrandRow(row), presentations }
}
