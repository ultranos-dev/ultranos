/**
 * run-rxnav-brands — enrich drug_catalog.brand_names with authoritative
 * RxNorm brand-name (TTY=BN) concepts, keyed off each row's rxnorm_cui.
 *
 * Safe & idempotent: brands are merged (never replaced) via mergeBrandNames,
 * deduped case-insensitively, and only rows that gained a brand are upserted.
 * Re-running adds nothing new. Rows without an rxnorm_cui are skipped (their
 * count is reported so the rxnorm_cui crosswalk gap stays visible).
 *
 * Optional provenance: set WRITE_BRAND_SOURCES=1 to also record each new
 * brand's origin in the brand_sources JSONB column (requires migration 039).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Optional: ETL_CHUNK (default 200), RXNAV_CONCURRENCY (default 4),
 *           WRITE_BRAND_SOURCES (default off).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchBrandNamesByRxcui } from './sources/rxnav-brands.js'
import { mergeBrandNames, addedBrands, brandProvenancePatch } from './transforms/brand-merge.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const CONCURRENCY = Number(process.env.RXNAV_CONCURRENCY ?? 4)

interface CatalogRow {
  atc_code: string
  inn_name: string
  rxnorm_cui: string | null
  brand_names: string[]
  brand_sources?: Record<string, string>
}

interface Deps {
  supabase?: SupabaseClient
  catalogRows?: CatalogRow[]
  fetchBrands?: (rxcui: string) => Promise<string[]>
  writeSources?: boolean
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, worker))
  return out
}

async function fetchCatalogRows(supabase: SupabaseClient, withSources: boolean): Promise<CatalogRow[]> {
  const cols = `atc_code, inn_name, rxnorm_cui, brand_names${withSources ? ', brand_sources' : ''}`
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

export interface RxnavBrandsResult {
  scanned: number
  withCui: number
  enriched: number
  brandsAdded: number
  upserts: number
}

export async function runRxnavBrandsEtl(deps: Deps = {}): Promise<RxnavBrandsResult> {
  const writeSources = deps.writeSources ?? process.env.WRITE_BRAND_SOURCES === '1'
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const fetchBrands = deps.fetchBrands ?? ((rxcui: string) => fetchBrandNamesByRxcui(rxcui))
  const rows = deps.catalogRows ?? await fetchCatalogRows(supabase, writeSources)

  const withCuiRows = rows.filter((r) => r.rxnorm_cui?.trim())
  const now = new Date().toISOString()
  let brandsAdded = 0

  const updates: Array<Record<string, unknown>> = []
  await mapWithConcurrency(withCuiRows, CONCURRENCY, async (row) => {
    const fetched = await fetchBrands(row.rxnorm_cui!)
    if (!fetched.length) return
    const merged = mergeBrandNames(row.brand_names ?? [], fetched)
    const added = addedBrands(row.brand_names ?? [], merged)
    if (!added.length) return
    brandsAdded += added.length
    const update: Record<string, unknown> = {
      atc_code: row.atc_code,
      inn_name: row.inn_name,
      brand_names: merged,
      last_etl_refresh: now,
    }
    if (writeSources) {
      update.brand_sources = brandProvenancePatch(row.brand_sources ?? {}, added, 'rxnav')
    }
    updates.push(update)
  })

  let upserts = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase.from('drug_catalog').upsert(updates.slice(i, i + CHUNK), { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }

  return { scanned: rows.length, withCui: withCuiRows.length, enriched: updates.length, brandsAdded, upserts }
}

const isMain = !!process.argv[1] && /run-rxnav-brands\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runRxnavBrandsEtl().then((r) => { console.log('RxNav brands ETL:', r); process.exit(0) })
    .catch((e) => { console.error('RxNav brands ETL failed:', (e as Error).message); process.exit(1) })
}
