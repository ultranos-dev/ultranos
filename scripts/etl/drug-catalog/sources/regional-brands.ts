/**
 * Regional brand-name source.
 *
 * Ingests a curated regional/national drug-registry dataset (MENA & Central
 * Asia markets) and matches its brand names to catalog drugs by ATC code or
 * INN (alias-aware). This is the path to true region-specific coverage that
 * DrugBank/RxNorm lack — the operator supplies the dataset file; this module
 * only parses, indexes and matches it. No brand is ever invented here.
 *
 * Dataset formats (drop the file in docs/datasets/ and point the runner at it):
 *
 *   JSON  — array of records. Keys may be camelCase or snake_case:
 *     [{ "atcCode": "J01CA04", "innName": "Amoxicillin",
 *        "brandNames": ["Amoxil","Trimox"], "market": "AF", "source": "MoPH" }]
 *     (`brandName`/`brand_name` singular and `brand_names` are also accepted.)
 *
 *   CSV   — header row required. Recognised columns (case-insensitive):
 *     atc_code, inn_name, brand_name (single) | brand_names (";"/"|"-delimited),
 *     market, source.
 */
import { candidateNamesFor } from '../transforms/inn-aliases.js'
import { mergeBrandNames } from '../transforms/brand-merge.js'

export interface RegionalBrandRecord {
  atcCode?: string
  innName?: string
  brandNames: string[]
  market?: string
  source?: string
}

export interface BrandIndex {
  byAtc: Map<string, string[]>
  byInn: Map<string, string[]>
}

function asBrandList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
  }
  return []
}

function normalizeRecord(raw: Record<string, unknown>): RegionalBrandRecord | null {
  const atcRaw = (raw.atcCode ?? raw.atc_code) as string | undefined
  const innRaw = (raw.innName ?? raw.inn_name) as string | undefined
  const atcCode = atcRaw?.trim() ? atcRaw.trim().toUpperCase() : undefined
  const innName = innRaw?.trim() ? innRaw.trim() : undefined
  const brandNames = asBrandList(raw.brandNames ?? raw.brand_names ?? raw.brandName ?? raw.brand_name)
  const market = (raw.market as string | undefined)?.trim() || undefined
  const source = (raw.source as string | undefined)?.trim() || undefined
  if (!brandNames.length) return null
  if (!atcCode && !innName) return null
  const rec: RegionalBrandRecord = { brandNames }
  if (atcCode) rec.atcCode = atcCode
  if (innName) rec.innName = innName
  if (market) rec.market = market
  if (source) rec.source = source
  return rec
}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, "" escapes, CRLF. */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else { field += c }
      continue
    }
    if (c === '"') { inQuotes = true }
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.length) || rows.length) rows.push(row)
      row = []
    } else { field += c }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim().length))
}

const HEADER_MAP: Record<string, keyof RegionalBrandRecord | 'brandSingle'> = {
  atc_code: 'atcCode', atccode: 'atcCode', atc: 'atcCode',
  inn_name: 'innName', innname: 'innName', inn: 'innName', generic: 'innName',
  brand_name: 'brandSingle', brand: 'brandSingle',
  brand_names: 'brandNames', brands: 'brandNames',
  market: 'market', country: 'market',
  source: 'source',
}

function parseCsvRecords(content: string): RegionalBrandRecord[] {
  const rows = parseCsv(content)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const out: RegionalBrandRecord[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const raw: Record<string, unknown> = {}
    header.forEach((h, c) => {
      const key = HEADER_MAP[h]
      if (!key) return
      const val = cells[c] ?? ''
      if (key === 'brandSingle') raw.brand_name = val
      else raw[key] = val
    })
    const rec = normalizeRecord(raw)
    if (rec) out.push(rec)
  }
  return out
}

/** Parse a regional brand dataset (JSON array or CSV-with-header). */
export function parseRegionalBrands(content: string, format: 'json' | 'csv'): RegionalBrandRecord[] {
  if (format === 'csv') return parseCsvRecords(content)
  const parsed = JSON.parse(content)
  if (!Array.isArray(parsed)) throw new Error('regional brands JSON must be an array of records')
  const out: RegionalBrandRecord[] = []
  for (const item of parsed) {
    if (item && typeof item === 'object') {
      const rec = normalizeRecord(item as Record<string, unknown>)
      if (rec) out.push(rec)
    }
  }
  return out
}

function push(map: Map<string, string[]>, key: string, brands: string[]) {
  const cur = map.get(key)
  if (cur) cur.push(...brands)
  else map.set(key, [...brands])
}

/** Index records for fast matching by ATC code and by (alias-expanded) INN. */
export function buildBrandIndex(records: RegionalBrandRecord[]): BrandIndex {
  const byAtc = new Map<string, string[]>()
  const byInn = new Map<string, string[]>()
  for (const rec of records) {
    if (rec.atcCode) push(byAtc, rec.atcCode.toUpperCase(), rec.brandNames)
    if (rec.innName) {
      for (const cand of candidateNamesFor(rec.innName.toLowerCase())) push(byInn, cand, rec.brandNames)
    }
  }
  return { byAtc, byInn }
}

/**
 * Brand names the dataset offers for a catalog drug, matched by ATC (exact)
 * then by INN (alias-expanded), deduped case-insensitively. [] if no match.
 */
export function matchRegionalBrands(atcCode: string | null | undefined, innName: string, index: BrandIndex): string[] {
  const collected: string[] = []
  if (atcCode?.trim()) {
    const hit = index.byAtc.get(atcCode.trim().toUpperCase())
    if (hit) collected.push(...hit)
  }
  for (const cand of candidateNamesFor((innName ?? '').trim().toLowerCase())) {
    const hit = index.byInn.get(cand)
    if (hit) collected.push(...hit)
  }
  return mergeBrandNames([], collected)
}
