import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { translate } from './sources/translator.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const CONCURRENCY = Number(process.env.TRANSLATE_CONCURRENCY ?? 4)
const LANGS = ['ar', 'prs', 'ps'] as const
type Lang = (typeof LANGS)[number]
type DLT = Record<string, string | undefined>

const SINGLE = [
  { col: 'summary_plain', key: 'summaryPlain' },
  { col: 'warnings_summary_plain', key: 'warningsSummaryPlain' },
  { col: 'when_to_seek_help', key: 'whenToSeekHelp' },
  { col: 'storage_instructions', key: 'storageInstructions' },
] as const

interface CatalogRow {
  atc_code: string; inn_name: string
  summary_plain: DLT; warnings_summary_plain: DLT; when_to_seek_help: DLT; storage_instructions: DLT
  used_for: DLT[]
  translation_status: Record<string, Record<string, string>>
}
interface Deps {
  supabase?: SupabaseClient
  catalogRows?: CatalogRow[]
  translateImpl?: (text: string) => Promise<{ ar?: string; prs?: string; ps?: string } | null>
}

function missingLangs(dlt: DLT): Lang[] {
  if (!dlt?.en?.trim()) return []
  return LANGS.filter((l) => !dlt[l])
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function fetchCatalogRows(supabase: SupabaseClient): Promise<CatalogRow[]> {
  const PAGE = 1000; const all: CatalogRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('drug_catalog')
      .select('atc_code, inn_name, summary_plain, warnings_summary_plain, when_to_seek_help, storage_instructions, used_for, translation_status')
      .order('atc_code', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    const rows = (data ?? []) as CatalogRow[]; all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

interface Work { rowIdx: number; col: string; key: string; dlt: DLT; missing: Lang[] }

export async function runTranslateEtl(deps: Deps = {}): Promise<{ scanned: number; translated: number; rowsUpdated: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const translateImpl = deps.translateImpl ?? ((text: string) => translate(text))
  const rows = deps.catalogRows ?? await fetchCatalogRows(supabase)

  const work: Work[] = []
  rows.forEach((row, rowIdx) => {
    for (const f of SINGLE) {
      const dlt = (row as unknown as Record<string, DLT>)[f.col] ?? {}
      const miss = missingLangs(dlt)
      if (miss.length) work.push({ rowIdx, col: f.col, key: f.key, dlt, missing: miss })
    }
    ;(row.used_for ?? []).forEach((dlt) => {
      const miss = missingLangs(dlt)
      if (miss.length) work.push({ rowIdx, col: 'used_for', key: 'usedFor', dlt, missing: miss })
    })
  })

  let translated = 0
  const wrote = new WeakSet<Work>()
  await mapWithConcurrency(work, CONCURRENCY, async (w) => {
    const got = await translateImpl(w.dlt.en as string)
    if (!got) return
    let any = false
    for (const l of w.missing) { if (got[l]) { w.dlt[l] = got[l]; any = true } }
    if (any) { translated++; wrote.add(w) }
  })

  const now = new Date().toISOString()
  const changedCols = new Map<number, Set<string>>()
  const statusByRow = new Map<number, Record<string, Record<string, string>>>()
  for (const w of work) {
    if (!wrote.has(w)) continue
    if (!changedCols.has(w.rowIdx)) changedCols.set(w.rowIdx, new Set())
    changedCols.get(w.rowIdx)!.add(w.col)
    if (!statusByRow.has(w.rowIdx)) statusByRow.set(w.rowIdx, structuredClone(rows[w.rowIdx].translation_status ?? {}))
    const st = statusByRow.get(w.rowIdx)!
    st[w.key] = st[w.key] ?? {}
    for (const l of w.missing) { if (w.dlt[l]) st[w.key][l] = 'machine' }
  }

  const updates: Array<Record<string, unknown>> = []
  for (const [rowIdx] of changedCols) {
    const row = rows[rowIdx]
    updates.push({
      atc_code: row.atc_code,
      inn_name: row.inn_name,
      summary_plain: row.summary_plain,
      warnings_summary_plain: row.warnings_summary_plain,
      when_to_seek_help: row.when_to_seek_help,
      storage_instructions: row.storage_instructions,
      used_for: row.used_for,
      translation_status: statusByRow.get(rowIdx),
      last_etl_refresh: now,
    })
  }

  let upserts = 0
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase.from('drug_catalog').upsert(updates.slice(i, i + CHUNK), { onConflict: 'atc_code' })
    if (error) throw new Error(`Upsert failed: ${error.message}`)
    upserts++
  }
  return { scanned: rows.length, translated, rowsUpdated: updates.length, upserts }
}

const isMain = !!process.argv[1] && /run-translate\.(ts|js|mts|mjs)$/.test(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  runTranslateEtl().then((r) => { console.log('Translate ETL:', r); process.exit(0) })
    .catch((e) => { console.error('Translate ETL failed:', (e as Error).message); process.exit(1) })
}
