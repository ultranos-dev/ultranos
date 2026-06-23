/**
 * run-regional-brands — ingest a curated regional/national brand-name dataset
 * (MENA & Central Asia) and merge its brands into drug_catalog.brand_names,
 * matched by ATC code or INN (alias-aware).
 *
 * The operator supplies the dataset file (this pipeline never invents brands).
 * Drop it in docs/datasets/ and point REGIONAL_BRANDS_FILE at it; the format is
 * inferred from the extension (.csv → CSV, otherwise JSON). See
 * sources/regional-brands.ts for the exact schema, and
 * docs/datasets/regional-brands.example.json for a template.
 *
 * Safe & idempotent: brands are merged (never replaced), deduped, and only rows
 * that gained a brand are upserted. Re-running adds nothing new.
 *
 * Optional provenance: WRITE_BRAND_SOURCES=1 records new brands' origin in the
 * brand_sources JSONB column (requires migration 039).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Optional: REGIONAL_BRANDS_FILE (default docs/datasets/regional-brands.json),
 *           ETL_CHUNK (default 200), WRITE_BRAND_SOURCES (default off).
 */
import { readFile } from 'node:fs/promises'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  parseRegionalBrands, buildBrandIndex, matchRegionalBrands, type RegionalBrandRecord,
} from './sources/regional-brands.js'
import { mergeBrandNames, addedBrands, brandProvenancePatch } from './transforms/brand-merge.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const DEFAULT_FILE = 'docs/datasets/regional-brands.json'

interface CatalogRow {
  atc_code: string
  inn_name: string
  brand_names: string[]
  brand_sources?: Record<string, string>
}

interface Deps {
  supabase?: SupabaseClient
  catalogRows?: CatalogRow[]
  records?: RegionalBrandRecord[]
  file?: string
  writeSources?: boolean
}

async function fetchCatalogRows(supabase: SupabaseClient, withSources: boolean): Promise<CatalogRow[]> {
  const cols = `atc_code, inn_name, brand_names${withSources ? ', brand_sources' : ''}`
  const PAGE = 1000; const all: CatalogRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('drug_catalog')
      .select(cols).order('atc_code', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    const rows = (data ?? []) as unknown as CatalogRow[]; all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

async function loadRecords(file: string): Promise<RegionalBrandRecord[]> {
  const content = await readFile(file, 'utf8')
  const format = file.toLowerCase().endsWith('.csv') ? 'csv' : 'json'
  return parseRegionalBrands(content, format)
}

export interface RegionalBrandsResult {
  datasetRecords: number
  scanned: number
  matched: number
  enriched: number
  brandsAdded: number
  upserts: number
}

export async function runRegionalBrandsEtl(deps: Deps = {}): Promise<RegionalBrandsResult> {
  const writeSources = deps.writeSources ?? process.env.WRITE_BRAND_SOURCES === '1'
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const records = deps.records ?? await loadRecords(deps.file ?? process.env.REGIONAL_BRANDS_FILE ?? DEFAULT_FILE)
  const index = buildBrandIndex(records)
  const rows = deps.catalogRows ?? await fetchCatalogRows(supabase, writeSources)

  const now = new Date().toISOString()
  let matched = 0
  let brandsAdded = 0
  const updates: Array<Record<string, unknown>> = []

  for (const row of rows) {
    const regional = matchRegionalBrands(row.atc_code, row.inn_name, index)
    if (!regional.length) continue
    matched++
    const merged = mergeBrandNames(row.brand_names ?? [], regional)
    const added = addedBrands(row.brand_names ?? [], merged)
    if (!added.length) continue
    brandsAdded += added.length
    const update: Record<string, unknown> = {
      atc_code: row.atc_code,
      inn_name: row.inn_name,
      brand_names: merged,
      last_etl_refresh: now,
    }
    if (writeSources) {
      update.brand_sources = brandProvenancePatch(row.brand_sources ?? {}, added, 'regional')
    }
    updates.push(update)
  }

  let upserts = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase.from('drug_catalog').upsert(updates.slice(i, i + CHUNK), { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }

  return { datasetRecords: records.length, scanned: rows.length, matched, enriched: updates.length, brandsAdded, upserts }
}

const isMain = !!process.argv[1] && /run-regional-brands\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runRegionalBrandsEtl().then((r) => { console.log('Regional brands ETL:', r); process.exit(0) })
    .catch((e) => { console.error('Regional brands ETL failed:', (e as Error).message); process.exit(1) })
}
