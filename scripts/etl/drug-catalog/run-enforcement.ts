import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { candidateNamesFor } from './sources/openfda-bulk.js'
import { buildRecallsByDrug, type RecallAlert } from './sources/openfda-enforcement.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const ENFORCEMENT_FILE = process.env.ENFORCEMENT_FILE
  ?? 'docs/datasets/opeFDA-datasets/drug-enforcement-0001-of-0001.json/drug-enforcement-0001-of-0001.json'

interface CatalogRow { atc_code: string; inn_name: string }
interface Deps { supabase?: SupabaseClient; catalogRows?: CatalogRow[]; recalls?: Map<string, RecallAlert[]> }

async function fetchCatalogRows(supabase: SupabaseClient): Promise<CatalogRow[]> {
  const PAGE = 1000; const all: CatalogRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('drug_catalog').select('atc_code, inn_name')
      .order('atc_code', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    const rows = (data ?? []) as CatalogRow[]; all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

export async function runEnforcementEtl(deps: Deps = {}): Promise<{ drugsWithRecalls: number; rowsUpdated: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const catalogRows = deps.catalogRows ?? await fetchCatalogRows(supabase)

  let recalls = deps.recalls
  if (!recalls) {
    const nameToCanonical = new Map<string, string>()
    for (const r of catalogRows) {
      if (!r.inn_name) continue
      const inn = r.inn_name.toLowerCase()
      for (const cand of candidateNamesFor(inn)) nameToCanonical.set(cand, inn)
    }
    recalls = buildRecallsByDrug(ENFORCEMENT_FILE, nameToCanonical)
  }

  const now = new Date().toISOString()
  const updates: Array<Record<string, unknown>> = []
  for (const r of catalogRows) {
    const list = r.inn_name ? recalls.get(r.inn_name.toLowerCase()) : undefined
    if (!list || list.length === 0) continue
    updates.push({ atc_code: r.atc_code, inn_name: r.inn_name, recall_alerts: list, last_etl_refresh: now })
  }

  let upserts = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase.from('drug_catalog').upsert(updates.slice(i, i + CHUNK), { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }
  return { drugsWithRecalls: recalls.size, rowsUpdated: updates.length, upserts }
}

const isMain = !!process.argv[1] && /run-enforcement\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runEnforcementEtl().then((r) => { console.log('Enforcement ETL:', r); process.exit(0) })
    .catch((e) => { console.error('Enforcement ETL failed:', (e as Error).message); process.exit(1) })
}
