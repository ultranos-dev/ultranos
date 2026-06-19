import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchMedlinePlusProse, type MedlinePlusProse } from './sources/medlineplus.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const CONCURRENCY = Number(process.env.MLP_CONCURRENCY ?? 5)

interface CatalogRow { atc_code: string; rxnorm_cui: string; inn_name: string }
interface Deps {
  supabase?: SupabaseClient
  catalogRows?: CatalogRow[]
  fetchProse?: (rxcui: string) => Promise<MedlinePlusProse | null>
}

async function fetchCatalogRows(supabase: SupabaseClient): Promise<CatalogRow[]> {
  const PAGE = 1000
  const all: CatalogRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('drug_catalog')
      .select('atc_code, rxnorm_cui, inn_name').not('rxnorm_cui', 'is', null)
      .order('atc_code', { ascending: true }).range(from, from + PAGE - 1)
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

export async function runMedlinePlusEtl(deps: Deps = {}): Promise<{ fetched: number; withProse: number; rowsUpdated: number; failed: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const fetchProse = deps.fetchProse ?? ((cui: string) => fetchMedlinePlusProse(cui))
  const catalogRows = deps.catalogRows ?? await fetchCatalogRows(supabase)

  const cuiToRows = new Map<string, CatalogRow[]>()
  for (const r of catalogRows) {
    if (!r.rxnorm_cui) continue
    const a = cuiToRows.get(r.rxnorm_cui); if (a) a.push(r); else cuiToRows.set(r.rxnorm_cui, [r])
  }
  const cuis = [...cuiToRows.keys()]

  const results = await mapWithConcurrency(cuis, CONCURRENCY, async (cui) => ({ cui, prose: await fetchProse(cui) }))

  const now = new Date().toISOString()
  const updates: Array<Record<string, unknown>> = []
  let withProse = 0, failed = 0
  for (const { cui, prose } of results) {
    if (!prose) { failed++; continue }
    withProse++
    const summary_plain = { en: prose.summary }
    const used_for = prose.uses.map((u) => ({ en: u }))
    for (const r of cuiToRows.get(cui) ?? []) {
      updates.push({ atc_code: r.atc_code, inn_name: r.inn_name, summary_plain, used_for, last_etl_refresh: now })
    }
  }

  let upserts = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase.from('drug_catalog').upsert(updates.slice(i, i + CHUNK), { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }
  return { fetched: cuis.length, withProse, rowsUpdated: updates.length, failed, upserts }
}

const isMain = !!process.argv[1] && /run-medlineplus\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runMedlinePlusEtl().then((r) => { console.log('MedlinePlus ETL:', r); process.exit(0) })
    .catch((e) => { console.error('MedlinePlus ETL failed:', (e as Error).message); process.exit(1) })
}
