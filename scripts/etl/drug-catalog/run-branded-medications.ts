/**
 * run-branded-medications — ingest a branded-products dataset into the two
 * normalized tables (drug_brands, drug_brand_presentations) and keep the
 * drug_catalog.brand_names search shadow in sync.
 *
 * The operator supplies the dataset (this pipeline never invents products).
 * Drop it at docs/datasets/branded-medications.json (or set BRANDED_FILE) and:
 *   pnpm -F @ultranos/drug-catalog-etl run-branded-medications
 *
 * Dataset (JSON array; nested presentations; camelCase or snake_case keys):
 *   [{ "genericAtcCode": "J01CR02", "brandName": "Augmentin", "manufacturer": "GSK",
 *      "rxStatus": "rx", "brandNameLocal": { "ar": "..." },
 *      "presentations": [
 *        { "strength": "625 mg", "doseForm": "tablet", "packSize": 14,
 *          "referencePrice": 12.5, "currency": "AFN", "market": "AF",
 *          "registrationNumber": "...", "registrationStatus": "marketed" }
 *      ] }]
 * See datasets/branded-medications.example.json.
 *
 * Idempotent: brands upsert on (atc, brand, manufacturer); presentations on
 * (brand_id, presentation_key); the brand_names shadow only updates rows that
 * actually gain a name (safe append + dedup).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: BRANDED_FILE.
 */
import { readFile } from 'node:fs/promises'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mergeBrandNames, addedBrands } from './transforms/brand-merge.js'

const DEFAULT_FILE = 'docs/datasets/branded-medications.json'

export interface PresentationInput {
  strength?: string
  doseForm?: string
  route?: string
  packSize?: number
  packUnit?: string
  volume?: string
  gtin?: string
  registrationNumber?: string
  registrationStatus?: 'marketed' | 'withdrawn' | 'unknown'
  market?: string
  referencePrice?: number
  currency?: string
  packagingPhotoUrl?: string
}

export interface BrandedRecord {
  genericAtcCode: string
  brandName: string
  manufacturer?: string
  rxStatus?: 'rx' | 'otc' | 'unknown'
  brandNameLocal?: Record<string, string>
  presentations: PresentationInput[]
}

/** Deterministic slug identifying a presentation within a brand (idempotent upsert key). */
export function presentationKey(p: PresentationInput): string {
  return [p.strength, p.doseForm, p.packSize, p.packUnit, p.volume]
    .map((x) => String(x ?? '').trim().toLowerCase())
    .join('|')
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isNaN(n) ? undefined : n
}

function normalizePresentation(raw: Record<string, unknown>): PresentationInput {
  return {
    strength: (raw.strength as string) ?? undefined,
    doseForm: (raw.doseForm ?? raw.dose_form) as string | undefined,
    route: (raw.route as string) ?? undefined,
    packSize: num(raw.packSize ?? raw.pack_size),
    packUnit: (raw.packUnit ?? raw.pack_unit) as string | undefined,
    volume: (raw.volume as string) ?? undefined,
    gtin: (raw.gtin as string) ?? undefined,
    registrationNumber: (raw.registrationNumber ?? raw.registration_number) as string | undefined,
    registrationStatus: (raw.registrationStatus ?? raw.registration_status) as PresentationInput['registrationStatus'],
    market: (raw.market as string) ?? undefined,
    referencePrice: num(raw.referencePrice ?? raw.reference_price),
    currency: (raw.currency as string) ?? undefined,
    packagingPhotoUrl: (raw.packagingPhotoUrl ?? raw.packaging_photo_url) as string | undefined,
  }
}

/** Parse a branded-products JSON dataset into validated records. */
export function parseBrandedDataset(content: string): BrandedRecord[] {
  const parsed = JSON.parse(content)
  if (!Array.isArray(parsed)) throw new Error('branded medications dataset must be a JSON array')
  const out: BrandedRecord[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const genericAtcCode = ((raw.genericAtcCode ?? raw.generic_atc_code) as string | undefined)?.trim()
    const brandName = ((raw.brandName ?? raw.brand_name) as string | undefined)?.trim()
    if (!genericAtcCode || !brandName) continue
    const presentationsRaw = (raw.presentations ?? []) as Record<string, unknown>[]
    out.push({
      genericAtcCode: genericAtcCode.toUpperCase(),
      brandName,
      manufacturer: ((raw.manufacturer as string) ?? '').trim() || undefined,
      rxStatus: (raw.rxStatus ?? raw.rx_status) as BrandedRecord['rxStatus'],
      brandNameLocal: (raw.brandNameLocal ?? raw.brand_name_local) as Record<string, string> | undefined,
      presentations: Array.isArray(presentationsRaw) ? presentationsRaw.map(normalizePresentation) : [],
    })
  }
  return out
}

interface BrandIdRow { id: string; generic_atc_code: string; brand_name: string; manufacturer: string }

interface Deps {
  supabase?: SupabaseClient
  records?: BrandedRecord[]
  file?: string
  upsertBrands?: (rows: Array<Record<string, unknown>>) => Promise<BrandIdRow[]>
  upsertPresentations?: (rows: Array<Record<string, unknown>>) => Promise<void>
  fetchCatalogBrandNames?: (atcCodes: string[]) => Promise<Array<{ atc_code: string; brand_names: string[] }>>
  upsertCatalogBrandNames?: (updates: Array<Record<string, unknown>>) => Promise<void>
}

function brandKey(atc: string, brand: string, manufacturer: string): string {
  return `${atc}|${brand.trim().toLowerCase()}|${manufacturer}`
}

export interface BrandedMedicationsResult {
  brands: number
  presentations: number
  catalogShadowUpdated: number
}

export async function runBrandedMedicationsEtl(deps: Deps = {}): Promise<BrandedMedicationsResult> {
  const supabase = deps.supabase
    ?? (deps.upsertBrands ? undefined : createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!))
  const records = deps.records ?? parseBrandedDataset(await readFile(deps.file ?? process.env.BRANDED_FILE ?? DEFAULT_FILE, 'utf8'))

  const upsertBrands = deps.upsertBrands ?? (async (rows) => {
    const { data, error } = await supabase!.from('drug_brands')
      .upsert(rows, { onConflict: 'generic_atc_code,brand_name,manufacturer' })
      .select('id, generic_atc_code, brand_name, manufacturer')
    if (error) throw new Error(`drug_brands upsert failed: ${error.message}`)
    return (data ?? []) as unknown as BrandIdRow[]
  })
  const upsertPresentations = deps.upsertPresentations ?? (async (rows) => {
    if (!rows.length) return
    const { error } = await supabase!.from('drug_brand_presentations')
      .upsert(rows, { onConflict: 'brand_id,presentation_key' })
    if (error) throw new Error(`drug_brand_presentations upsert failed: ${error.message}`)
  })
  const fetchCatalogBrandNames = deps.fetchCatalogBrandNames ?? (async (atcCodes) => {
    const { data, error } = await supabase!.from('drug_catalog')
      .select('atc_code, brand_names').in('atc_code', atcCodes)
    if (error) throw new Error(`drug_catalog fetch failed: ${error.message}`)
    return (data ?? []) as unknown as Array<{ atc_code: string; brand_names: string[] }>
  })
  const upsertCatalogBrandNames = deps.upsertCatalogBrandNames ?? (async (updates) => {
    // These catalog rows already exist — UPDATE (not upsert): an upsert's INSERT
    // arm would violate drug_catalog.inn_name NOT NULL even on conflict.
    for (const u of updates) {
      const { error } = await supabase!.from('drug_catalog')
        .update({ brand_names: u.brand_names }).eq('atc_code', u.atc_code as string)
      if (error) throw new Error(`drug_catalog shadow update failed: ${error.message}`)
    }
  })

  // 1. Upsert brands, get their ids back.
  const brandRows = records.map((r) => ({
    generic_atc_code: r.genericAtcCode,
    brand_name: r.brandName,
    manufacturer: r.manufacturer ?? '',
    brand_name_local: r.brandNameLocal ?? {},
    rx_status: r.rxStatus ?? 'unknown',
    etl_source: 'branded-loader',
    last_etl_refresh: new Date().toISOString(),
  }))
  const idRows = await upsertBrands(brandRows)
  const idByKey = new Map<string, string>()
  for (const row of idRows) idByKey.set(brandKey(row.generic_atc_code, row.brand_name, row.manufacturer ?? ''), row.id)

  // 2. Upsert presentations, keyed to their brand id. Dedupe within the batch on
  // (brand_id, presentation_key) — two identical presentations would otherwise make
  // the ON CONFLICT upsert hit the same row twice ("cannot affect row a second time").
  const presRows: Array<Record<string, unknown>> = []
  const seenPres = new Set<string>()
  for (const r of records) {
    const id = idByKey.get(brandKey(r.genericAtcCode, r.brandName, r.manufacturer ?? ''))
    if (!id) continue
    for (const p of r.presentations) {
      const pkey = presentationKey(p)
      if (seenPres.has(`${id}|${pkey}`)) continue
      seenPres.add(`${id}|${pkey}`)
      presRows.push({
        brand_id: id,
        presentation_key: pkey,
        strength: p.strength ?? null,
        dose_form: p.doseForm ?? null,
        route: p.route ?? null,
        pack_size: p.packSize ?? null,
        pack_unit: p.packUnit ?? null,
        volume: p.volume ?? null,
        gtin: p.gtin ?? null,
        registration_number: p.registrationNumber ?? null,
        registration_status: p.registrationStatus ?? 'unknown',
        market: p.market ?? null,
        reference_price: p.referencePrice ?? null,
        currency: p.currency ?? null,
        packaging_photo_url: p.packagingPhotoUrl ?? null,
      })
    }
  }
  await upsertPresentations(presRows)

  // 3. Keep the drug_catalog.brand_names search shadow in sync (append + dedup).
  const namesByAtc = new Map<string, string[]>()
  for (const r of records) {
    const cur = namesByAtc.get(r.genericAtcCode) ?? []
    cur.push(r.brandName)
    namesByAtc.set(r.genericAtcCode, cur)
  }
  const atcs = [...namesByAtc.keys()]
  const existing = await fetchCatalogBrandNames(atcs)
  const existingByAtc = new Map(existing.map((e) => [e.atc_code, e.brand_names ?? []]))
  const catalogUpdates: Array<Record<string, unknown>> = []
  for (const [atc, names] of namesByAtc) {
    const before = existingByAtc.get(atc) ?? []
    const merged = mergeBrandNames(before, names)
    if (addedBrands(before, merged).length) catalogUpdates.push({ atc_code: atc, brand_names: merged })
  }
  await upsertCatalogBrandNames(catalogUpdates)

  return { brands: brandRows.length, presentations: presRows.length, catalogShadowUpdated: catalogUpdates.length }
}

const isMain = !!process.argv[1] && /run-branded-medications\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runBrandedMedicationsEtl().then((r) => { console.log('Branded medications ETL:', r); process.exit(0) })
    .catch((e) => { console.error('Branded medications ETL failed:', (e as Error).message); process.exit(1) })
}
