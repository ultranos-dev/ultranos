import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildOpenFdaBulk, candidateNamesFor, type BulkLabelFields } from './sources/openfda-bulk.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const ONFDA_DIR = process.env.OPENFDA_BULK_DIR ?? 'docs/datasets/opeFDA-datasets'

interface CatalogRow { atc_code: string; inn_name: string }
interface Deps { supabase?: SupabaseClient; catalogRows?: CatalogRow[]; bulk?: Map<string, BulkLabelFields> }

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

export async function runOpenFdaBulkEtl(deps: Deps = {}): Promise<{ matched: number; rowsUpdated: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const catalogRows = deps.catalogRows ?? await fetchCatalogRows(supabase)
  const nameToCanonical = new Map<string, string>()
  for (const r of catalogRows) {
    const inn = r.inn_name.toLowerCase()
    for (const cand of candidateNamesFor(inn)) {
      nameToCanonical.set(cand, inn)
    }
  }
  const bulk = deps.bulk ?? await buildOpenFdaBulk(ONFDA_DIR, nameToCanonical)

  const now = new Date().toISOString()
  const updates: Array<Record<string, unknown>> = []
  for (const r of catalogRows) {
    const f = r.inn_name ? bulk.get(r.inn_name.toLowerCase()) : undefined
    if (!f) continue
    // Build homogeneous rows: always include all 4 content fields
    updates.push({
      atc_code: r.atc_code,
      inn_name: r.inn_name,
      pregnancy_clinical: f.pregnancyClinical ?? {},
      contraindications: f.contraindications,
      administration_notes: f.administrationNotes ? { en: f.administrationNotes } : {},
      warnings_summary_plain: f.warnings ? { en: f.warnings } : {},
      last_etl_refresh: now,
    })
  }

  let upserts = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase.from('drug_catalog').upsert(updates.slice(i, i + CHUNK), { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }
  return { matched: bulk.size, rowsUpdated: updates.length, upserts }
}

const isMain = !!process.argv[1] && /run-openfda-bulk\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runOpenFdaBulkEtl().then((r) => { console.log('openFDA bulk ETL:', r); process.exit(0) })
    .catch((e) => { console.error('openFDA bulk ETL failed:', (e as Error).message); process.exit(1) })
}
