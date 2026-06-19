import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchOpenFdaLabel, type OpenFdaLabel } from './sources/openfda-label.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const CONCURRENCY = Number(process.env.OPENFDA_CONCURRENCY ?? 4)
const API_KEY = process.env.OPENFDA_API_KEY

interface CatalogRow { atc_code: string; inn_name: string }
interface Deps {
  supabase?: SupabaseClient
  catalogRows?: CatalogRow[]
  fetchLabel?: (name: string) => Promise<OpenFdaLabel | null>
}

async function fetchCatalogRows(supabase: SupabaseClient): Promise<CatalogRow[]> {
  const PAGE = 1000
  const all: CatalogRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('drug_catalog')
      .select('atc_code, inn_name').order('atc_code', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    const rows = (data ?? []) as CatalogRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export async function runOpenFdaLabelEtl(deps: Deps = {}): Promise<{ fetched: number; withLabel: number; rowsUpdated: number; failed: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const fetchLabel = deps.fetchLabel ?? ((name: string) => fetchOpenFdaLabel(name, API_KEY))
  const catalogRows = deps.catalogRows ?? await fetchCatalogRows(supabase)

  const byName = new Map<string, CatalogRow[]>()
  for (const r of catalogRows) {
    if (!r.inn_name) continue
    const a = byName.get(r.inn_name); if (a) a.push(r); else byName.set(r.inn_name, [r])
  }
  const names = [...byName.keys()]

  const results = await mapWithConcurrency(names, CONCURRENCY, async (name) => ({ name, label: await fetchLabel(name) }))

  const now = new Date().toISOString()
  const updates: Array<Record<string, unknown>> = []
  let withLabel = 0, failed = 0
  for (const { name, label } of results) {
    if (!label) { failed++; continue }
    withLabel++
    const pregnancy_clinical = label.pregnancyClinical ?? {}
    const contraindications = label.contraindications
    for (const r of byName.get(name) ?? []) {
      updates.push({ atc_code: r.atc_code, inn_name: r.inn_name, pregnancy_clinical, contraindications, last_etl_refresh: now })
    }
  }

  let upserts = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase.from('drug_catalog').upsert(updates.slice(i, i + CHUNK), { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }
  return { fetched: names.length, withLabel, rowsUpdated: updates.length, failed, upserts }
}

const isMain = !!process.argv[1] && /run-openfda-label\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runOpenFdaLabelEtl().then((r) => { console.log('openFDA label ETL:', r); process.exit(0) })
    .catch((e) => { console.error('openFDA label ETL failed:', (e as Error).message); process.exit(1) })
}
