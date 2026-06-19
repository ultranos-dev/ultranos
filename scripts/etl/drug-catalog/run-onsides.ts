import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadOnsidesLookups, buildAdverseEventsByIngredient, type AdverseEvent } from './sources/onsides.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const ONSIDES_DIR = process.env.ONSIDES_DIR ?? 'docs/datasets/onsides-v3.1.1/csv'

interface CatalogRow { atc_code: string; rxnorm_cui: string; inn_name: string }
interface Deps { supabase?: SupabaseClient; catalogRows?: CatalogRow[] }

async function fetchCatalogRows(supabase: SupabaseClient): Promise<CatalogRow[]> {
  const PAGE = 1000
  const all: CatalogRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('drug_catalog')
      .select('atc_code, rxnorm_cui, inn_name')
      .not('rxnorm_cui', 'is', null)
      .order('atc_code', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    const rows = (data ?? []) as CatalogRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

export async function runOnsidesEtl(dir: string, deps: Deps = {}): Promise<{ ingredientsWithEffects: number; rowsUpdated: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const catalogRows = deps.catalogRows ?? await fetchCatalogRows(supabase)

  const cuiToAtc = new Map<string, string[]>()
  const innByAtc = new Map<string, string>()
  const cuis = new Set<string>()
  for (const r of catalogRows) {
    if (!r.rxnorm_cui) continue
    cuis.add(r.rxnorm_cui)
    innByAtc.set(r.atc_code, r.inn_name)
    const a = cuiToAtc.get(r.rxnorm_cui); if (a) a.push(r.atc_code); else cuiToAtc.set(r.rxnorm_cui, [r.atc_code])
  }

  const lookups = await loadOnsidesLookups(dir)
  const byIng = await buildAdverseEventsByIngredient(dir, lookups, cuis)

  const now = new Date().toISOString()
  const updates: Array<{ atc_code: string; inn_name: string; adverse_events: AdverseEvent[]; last_etl_refresh: string }> = []
  for (const [cui, evs] of byIng) {
    for (const atc of cuiToAtc.get(cui) ?? []) updates.push({ atc_code: atc, inn_name: innByAtc.get(atc) ?? '', adverse_events: evs, last_etl_refresh: now })
  }

  let upserts = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    const { error } = await supabase.from('drug_catalog').upsert(chunk, { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }
  return { ingredientsWithEffects: byIng.size, rowsUpdated: updates.length, upserts }
}

const isMain = !!process.argv[1] && /run-onsides\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runOnsidesEtl(ONSIDES_DIR).then((r) => { console.log('OnSIDES ETL:', r); process.exit(0) })
    .catch((e) => { console.error('OnSIDES ETL failed:', (e as Error).message); process.exit(1) })
}
