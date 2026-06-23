import type * as SQLite from 'expo-sqlite'
import type {
  DrugBrand, DrugBrandPresentation, DrugBrandWithPresentations,
  BrandSearchResult, DrugBrandDetail, DrugBrandSibling,
} from '@ultranos/shared-types'

interface BrandRow {
  id: string
  generic_atc_code: string
  brand_name: string
  manufacturer: string | null
  brand_name_local: string | null
  rx_status: string | null
  version: number
}

interface PresentationRow {
  id: string
  brand_id: string
  strength: string | null
  dose_form: string | null
  route: string | null
  pack_size: number | null
  pack_unit: string | null
  volume: string | null
  gtin: string | null
  registration_number: string | null
  registration_status: string | null
  market: string | null
  reference_price: number | null
  currency: string | null
  packaging_photo_url: string | null
  version: number
}

function mapBrand(row: BrandRow): DrugBrand {
  return {
    id: row.id,
    genericAtcCode: row.generic_atc_code,
    brandName: row.brand_name,
    manufacturer: row.manufacturer || undefined,
    brandNameLocal: row.brand_name_local ? JSON.parse(row.brand_name_local) : {},
    rxStatus: (row.rx_status ?? 'unknown') as 'rx' | 'otc' | 'unknown',
    version: row.version,
    lastUpdated: '',
  }
}

function mapPresentation(row: PresentationRow): DrugBrandPresentation {
  return {
    id: row.id,
    brandId: row.brand_id,
    strength: row.strength ?? undefined,
    doseForm: row.dose_form ?? undefined,
    route: row.route ?? undefined,
    packSize: row.pack_size ?? undefined,
    packUnit: row.pack_unit ?? undefined,
    volume: row.volume ?? undefined,
    gtin: row.gtin ?? undefined,
    registrationNumber: row.registration_number ?? undefined,
    registrationStatus: (row.registration_status ?? 'unknown') as 'marketed' | 'withdrawn' | 'unknown',
    market: row.market ?? undefined,
    referencePrice: row.reference_price ?? undefined,
    currency: row.currency ?? undefined,
    packagingPhotoUrl: row.packaging_photo_url ?? undefined,
    version: row.version,
    lastUpdated: '',
  }
}

/** Brands (with nested presentations) for a generic drug, from the local cache. */
export async function getBrandsWithPresentations(
  db: Pick<SQLite.SQLiteDatabase, 'getAllAsync'>,
  atcCode: string,
): Promise<DrugBrandWithPresentations[]> {
  const brands = await db.getAllAsync<BrandRow>(
    'SELECT * FROM drug_brands WHERE generic_atc_code = ? ORDER BY brand_name ASC',
    [atcCode],
  )
  if (brands.length === 0) return []

  const ids = brands.map((b) => b.id)
  const placeholders = ids.map(() => '?').join(',')
  const presentations = await db.getAllAsync<PresentationRow>(
    `SELECT * FROM drug_brand_presentations WHERE brand_id IN (${placeholders})
     ORDER BY strength ASC`,
    ids,
  )

  const byBrand = new Map<string, DrugBrandPresentation[]>()
  for (const p of presentations) {
    const list = byBrand.get(p.brand_id) ?? []
    list.push(mapPresentation(p))
    byBrand.set(p.brand_id, list)
  }

  return brands.map((b) => ({ ...mapBrand(b), presentations: byBrand.get(b.id) ?? [] }))
}

interface BrandSearchRow {
  id: string
  brand_name: string
  manufacturer: string | null
  generic_atc_code: string
  inn_name: string | null
  dose_form: string | null
  min_price: number | null
  currency: string | null
}

/**
 * Brand-name search against the local cache. Returns one hit per brand, joined
 * to its generic, with a representative dose form + lowest presentation price.
 * Powers the "Brands" results alongside the generic FTS hits.
 */
export async function searchBrandsLocal(
  db: Pick<SQLite.SQLiteDatabase, 'getAllAsync'>,
  q: string,
  limit: number,
): Promise<BrandSearchResult[]> {
  const term = q.trim()
  if (!term) return []
  const rows = await db.getAllAsync<BrandSearchRow>(
    `SELECT b.id, b.brand_name, b.manufacturer, b.generic_atc_code, d.inn_name,
            (SELECT p.dose_form FROM drug_brand_presentations p WHERE p.brand_id = b.id AND p.dose_form IS NOT NULL LIMIT 1) AS dose_form,
            (SELECT MIN(p.reference_price) FROM drug_brand_presentations p WHERE p.brand_id = b.id) AS min_price,
            (SELECT p.currency FROM drug_brand_presentations p WHERE p.brand_id = b.id AND p.reference_price IS NOT NULL LIMIT 1) AS currency
     FROM drug_brands b
     LEFT JOIN drug_catalog d ON d.atc_code = b.generic_atc_code
     WHERE b.brand_name LIKE ? COLLATE NOCASE
     ORDER BY b.brand_name ASC
     LIMIT ?`,
    [`%${term}%`, limit],
  )
  return rows.map((r) => ({
    id: r.id,
    brandName: r.brand_name,
    manufacturer: r.manufacturer || undefined,
    genericAtcCode: r.generic_atc_code,
    genericInnName: r.inn_name ?? '',
    doseForm: r.dose_form ?? undefined,
    referencePrice: r.min_price ?? undefined,
    currency: r.currency ?? undefined,
  }))
}

/** Full brand-detail payload: the brand, its presentations, the generic, sibling brands. */
export async function getBrandDetail(
  db: Pick<SQLite.SQLiteDatabase, 'getFirstAsync' | 'getAllAsync'>,
  brandId: string,
): Promise<DrugBrandDetail | null> {
  const head = await db.getFirstAsync<BrandRow & { inn_name: string | null }>(
    `SELECT b.id, b.brand_name, b.manufacturer, b.rx_status, b.generic_atc_code, d.inn_name
     FROM drug_brands b LEFT JOIN drug_catalog d ON d.atc_code = b.generic_atc_code
     WHERE b.id = ?`,
    [brandId],
  )
  if (!head) return null

  const presentations = await db.getAllAsync<PresentationRow>(
    'SELECT * FROM drug_brand_presentations WHERE brand_id = ? ORDER BY strength ASC',
    [brandId],
  )
  const siblings = await db.getAllAsync<{ id: string; brand_name: string; manufacturer: string | null }>(
    `SELECT b2.id, b2.brand_name, b2.manufacturer FROM drug_brands b2
     WHERE b2.generic_atc_code = ? AND b2.id != ?
     ORDER BY b2.brand_name ASC`,
    [head.generic_atc_code, brandId],
  )

  return {
    id: head.id,
    brandName: head.brand_name,
    manufacturer: head.manufacturer || undefined,
    rxStatus: (head.rx_status ?? 'unknown') as 'rx' | 'otc' | 'unknown',
    genericAtcCode: head.generic_atc_code,
    genericInnName: head.inn_name ?? '',
    presentations: presentations.map(mapPresentation),
    siblings: siblings.map((s): DrugBrandSibling => ({ id: s.id, brandName: s.brand_name, manufacturer: s.manufacturer || undefined })),
  }
}

/** Upsert a batch of synced brand rows into the local cache. */
export async function upsertBrandBatch(db: SQLite.SQLiteDatabase, brands: DrugBrand[]): Promise<void> {
  for (const b of brands) {
    await db.runAsync(
      `INSERT OR REPLACE INTO drug_brands
         (id, generic_atc_code, brand_name, manufacturer, brand_name_local, rx_status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        b.id, b.genericAtcCode, b.brandName, b.manufacturer ?? '',
        JSON.stringify(b.brandNameLocal ?? {}), b.rxStatus, b.version,
      ],
    )
  }
}

/** Upsert a batch of synced presentation rows into the local cache. */
export async function upsertPresentationBatch(db: SQLite.SQLiteDatabase, presentations: DrugBrandPresentation[]): Promise<void> {
  for (const p of presentations) {
    await db.runAsync(
      `INSERT OR REPLACE INTO drug_brand_presentations
         (id, brand_id, strength, dose_form, route, pack_size, pack_unit, volume, gtin,
          registration_number, registration_status, market, reference_price, currency,
          packaging_photo_url, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id, p.brandId, p.strength ?? null, p.doseForm ?? null, p.route ?? null,
        p.packSize ?? null, p.packUnit ?? null, p.volume ?? null, p.gtin ?? null,
        p.registrationNumber ?? null, p.registrationStatus, p.market ?? null,
        p.referencePrice ?? null, p.currency ?? null, p.packagingPhotoUrl ?? null, p.version,
      ],
    )
  }
}
