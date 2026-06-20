# Pharmopedia openFDA Bulk Label Ingest (Plan 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Replace the rate-limited openFDA API path with a **local bulk ingest** of the openFDA `drug/label` dataset (already on disk). Complete `pregnancy_clinical` + `contraindications` (no rate limit, full coverage) AND add `administration_notes` (dosage) + `warnings_summary_plain` (boxed warning / warnings).

**Architecture:** Stream-parse the 13 local `drug-label-*-of-0013.json` partitions (each `{meta, results:[~20k labels]}`, ~8.5 GB total, ~259k records). For each label whose `openfda.generic_name` matches a catalog `inn_name` (case-insensitive), extract the four fields (reusing `cleanText`/`stripSectionHeader` from Plan 5), merge across the many labels per drug (first non-empty wins), then upsert onto catalog rows by `inn_name`. Bounded memory via `stream-json`.

**Tech Stack:** TypeScript, `@ultranos/drug-catalog-etl`, `stream-json` (streaming JSON array parse), Vitest, Supabase.

## Global Constraints

- **Data location:** `docs/datasets/opeFDA-datasets/` (gitignored). Partitions are nested: `drug-label-<NNNN>-of-0013.json/drug-label-<NNNN>-of-0013.json` for NNNN = 0001..0013. Each is a single JSON object `{ meta, results: [...] }`; `results[]` are label objects.
- **Stream, never `JSON.parse` whole file** (each ~620 MB). Use `stream-json` `parser` → `pick({filter:'results'})` → `streamArray()` to yield one label at a time. Memory bound = the accumulator (catalog drugs × 4 fields).
- **Match key:** `openfda.generic_name[]` (UPPERCASE in data) vs catalog `inn_name` — compare **lowercased, exact**. Combination labels (e.g. "BUDESONIDE AND FORMOTEROL FUMARATE") simply won't match single-ingredient catalog names (fine).
- **Reuse** `cleanText` + `stripSectionHeader` from `sources/openfda-label.ts` (already strip HTML + SPL headers like "4 CONTRAINDICATIONS", "8.1 Pregnancy Risk Summary", "2 DOSAGE AND ADMINISTRATION").
- **Field mapping:** `pregnancy_clinical` (pregnancy + nursing_mothers + legacy category) ; `contraindications` string[] (sentence-split, cap 8) ; `administration_notes` = `{ en: <cleaned dosage_and_administration, truncated 3000 chars> }` ; `warnings_summary_plain` = `{ en: <cleaned boxed_warning ?? warnings, truncated 3000 chars> }`. Each long field truncated to bound the synced payload.
- **Merge across labels** for the same generic name: first non-empty value per field wins (many products → one merged record).
- **Write ONLY** `{ atc_code, inn_name, pregnancy_clinical, contraindications, administration_notes, warnings_summary_plain, last_etl_refresh }` (inn_name for the NOT-NULL ON CONFLICT candidate). Never overwrite DrugBank/OnSIDES/MedlinePlus columns.
- Idempotent (overwrites these fields on re-run). FDA-label-sourced (not AI) → no physician gate. English only.
- **Git (CLAUDE.md):** no commits without explicit instruction.

---

### Task 1: bulk label extractor + streaming reader

**Files:**
- Create: `scripts/etl/drug-catalog/sources/openfda-bulk.ts`
- Create: `scripts/etl/drug-catalog/__tests__/fixtures/openfda-bulk/part.json`
- Create: `scripts/etl/drug-catalog/__tests__/openfda-bulk.test.ts`
- Modify: `scripts/etl/drug-catalog/package.json` (add `stream-json` + `@types/stream-json`)

**Interfaces:**
```typescript
export interface BulkLabelFields {
  pregnancyClinical?: { pregnancy?: string; lactation?: string; legacyCategory?: string }
  contraindications: string[]
  administrationNotes?: string
  warnings?: string
}
export function extractBulkLabel(result: unknown): BulkLabelFields | null   // null if no useful fields
export function streamPartition(filePath: string, onLabel: (genericNames: string[], r: unknown) => void): Promise<number>
export function buildOpenFdaBulk(dir: string, catalogNamesLower: Set<string>): Promise<Map<string, BulkLabelFields>>  // key = lowercased generic name
```

- [ ] **Step 1: Add deps.** In `scripts/etl/drug-catalog/package.json` add `dependencies`: `"stream-json": "^1.8.0"`; `devDependencies`: `"@types/stream-json": "^1.7.7"`. Run `pnpm install`.

- [ ] **Step 2: Fixture** `scripts/etl/drug-catalog/__tests__/fixtures/openfda-bulk/part.json`
```json
{ "meta": { "results": { "skip": 0, "limit": 20000, "total": 3 } }, "results": [
  { "openfda": { "generic_name": ["METRONIDAZOLE"] },
    "pregnancy": ["8.1 Pregnancy Risk Summary There are no adequate studies. Pregnancy Category B applies."],
    "nursing_mothers": ["Metronidazole is present in human milk."],
    "contraindications": ["4 CONTRAINDICATIONS Metronidazole is contraindicated in hypersensitivity. Avoid in first trimester."],
    "dosage_and_administration": ["2 DOSAGE AND ADMINISTRATION Trichomoniasis: two grams orally."],
    "boxed_warning": ["WARNING: CARCINOGENICITY Metronidazole has been shown to be carcinogenic in mice."] },
  { "openfda": { "generic_name": ["METRONIDAZOLE"] },
    "warnings": ["Some non-boxed warning text."] },
  { "openfda": { "generic_name": ["BUDESONIDE AND FORMOTEROL FUMARATE"] },
    "contraindications": ["Primary treatment of status asthmaticus."] }
] }
```

- [ ] **Step 3: Failing test** `__tests__/openfda-bulk.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractBulkLabel, streamPartition, buildOpenFdaBulk } from '../sources/openfda-bulk.js'

const DIRX = dirname(fileURLToPath(import.meta.url))
const PART = join(DIRX, 'fixtures', 'openfda-bulk', 'part.json')

describe('openfda-bulk', () => {
  it('extractBulkLabel pulls all four fields, headers stripped', () => {
    const f = extractBulkLabel({
      pregnancy: ['8.1 Pregnancy Risk Summary no adequate studies. Category B applies.'],
      nursing_mothers: ['present in milk.'],
      contraindications: ['4 CONTRAINDICATIONS Hypersensitivity to drug.'],
      dosage_and_administration: ['2 DOSAGE AND ADMINISTRATION Two grams orally.'],
      boxed_warning: ['WARNING: CARCINOGENICITY carcinogenic in mice.'],
    })!
    expect(f.pregnancyClinical?.pregnancy).toContain('no adequate studies')
    expect(f.pregnancyClinical?.lactation).toBe('present in milk.')
    expect(f.pregnancyClinical?.legacyCategory).toBe('B')
    expect(f.contraindications[0]).not.toMatch(/^4 CONTRAINDICATIONS/)
    expect(f.contraindications[0]).toContain('Hypersensitivity')
    expect(f.administrationNotes).toContain('Two grams orally')
    expect(f.administrationNotes).not.toMatch(/^2 DOSAGE/)
    expect(f.warnings).toContain('carcinogenic in mice')
  })
  it('extractBulkLabel returns null when nothing useful', () => {
    expect(extractBulkLabel({ openfda: { generic_name: ['X'] } })).toBeNull()
  })
  it('streamPartition yields each result with its generic names', async () => {
    const seen: string[] = []
    const n = await streamPartition(PART, (names) => seen.push(names.join('|')))
    expect(n).toBe(3)
    expect(seen).toContain('METRONIDAZOLE')
  })
  it('buildOpenFdaBulk matches catalog names (lowercased), merges across labels', async () => {
    const dir = join(DIRX, 'fixtures', 'openfda-bulk')
    const m = await buildOpenFdaBulk(dir, new Set(['metronidazole']))
    const f = m.get('metronidazole')!
    expect(f).toBeTruthy()
    expect(f.pregnancyClinical?.legacyCategory).toBe('B')   // from label 1
    expect(f.warnings).toContain('carcinogenic')            // boxed_warning from label 1 wins over label 2's warnings
    expect(f.administrationNotes).toContain('Two grams')
    expect(m.has('budesonide and formoterol fumarate')).toBe(false)  // not in catalog set
  })
})
```

- [ ] **Step 4: Run, verify FAIL.**

- [ ] **Step 5: Implement** `sources/openfda-bulk.ts`
```typescript
import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import StreamJson from 'stream-json'
import Pick from 'stream-json/filters/Pick.js'
import StreamArray from 'stream-json/streamers/StreamArray.js'
import { cleanText, stripSectionHeader } from './openfda-label.js'

const parser = (StreamJson as { parser: typeof import('stream-json').parser }).parser
const pick = (Pick as { pick: typeof import('stream-json/filters/Pick').pick }).pick
const streamArray = (StreamArray as { streamArray: typeof import('stream-json/streamers/StreamArray').streamArray }).streamArray

const MAX = 3000

export interface BulkLabelFields {
  pregnancyClinical?: { pregnancy?: string; lactation?: string; legacyCategory?: string }
  contraindications: string[]
  administrationNotes?: string
  warnings?: string
}

function clean3000(s: string | undefined): string | undefined {
  const c = stripHeaderClean(s)
  return c ? c.slice(0, MAX) : undefined
}
function stripHeaderClean(s: string | undefined): string | undefined {
  const c = cleanText(s)
  return c ? stripSectionHeader(c) : undefined
}
function splitContra(text: string | undefined): string[] {
  const c = stripHeaderClean(text)
  if (!c) return []
  return c.split(/(?<=\.)\s+/).map((x) => x.trim()).filter((x) => x.length > 15).slice(0, 8)
}

interface RawLabel {
  pregnancy?: string[]; nursing_mothers?: string[]; contraindications?: string[]
  dosage_and_administration?: string[]; boxed_warning?: string[]; warnings?: string[]
}

export function extractBulkLabel(result: unknown): BulkLabelFields | null {
  const r = result as RawLabel
  const pregnancy = stripHeaderClean(r.pregnancy?.[0])
  const lactation = stripHeaderClean(r.nursing_mothers?.[0])
  const legacyCategory = (r.pregnancy?.[0] ?? '').match(/Category ([A-DX])/)?.[1]
  const pregnancyClinical = pregnancy || lactation || legacyCategory
    ? { ...(pregnancy ? { pregnancy } : {}), ...(lactation ? { lactation } : {}), ...(legacyCategory ? { legacyCategory } : {}) }
    : undefined
  const contraindications = splitContra(r.contraindications?.[0])
  const administrationNotes = clean3000(r.dosage_and_administration?.[0])
  const warnings = clean3000(r.boxed_warning?.[0] ?? r.warnings?.[0])
  if (!pregnancyClinical && contraindications.length === 0 && !administrationNotes && !warnings) return null
  return { pregnancyClinical, contraindications, administrationNotes, warnings }
}

export function streamPartition(filePath: string, onLabel: (genericNames: string[], r: unknown) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0
    const pipeline = createReadStream(filePath).pipe(parser()).pipe(pick({ filter: 'results' })).pipe(streamArray())
    pipeline.on('data', ({ value }: { value: { openfda?: { generic_name?: string[] } } }) => {
      count++
      onLabel(value.openfda?.generic_name ?? [], value)
    })
    pipeline.on('end', () => resolve(count))
    pipeline.on('error', reject)
  })
}

function mergeInto(acc: BulkLabelFields, ext: BulkLabelFields): void {
  if (!acc.pregnancyClinical && ext.pregnancyClinical) acc.pregnancyClinical = ext.pregnancyClinical
  if (acc.contraindications.length === 0 && ext.contraindications.length) acc.contraindications = ext.contraindications
  if (!acc.administrationNotes && ext.administrationNotes) acc.administrationNotes = ext.administrationNotes
  if (!acc.warnings && ext.warnings) acc.warnings = ext.warnings
}

export async function buildOpenFdaBulk(dir: string, catalogNamesLower: Set<string>): Promise<Map<string, BulkLabelFields>> {
  const files = (await readdir(dir)).filter((f) => /^drug-label-\d{4}-of-\d{4}\.json$/.test(f))
  const partitionPaths = files.length
    ? files.map((f) => join(dir, f))
    // production layout: each partition is a folder containing a same-named json
    : (await readdir(dir, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && /^drug-label-\d{4}-of-\d{4}\.json$/.test(d.name))
        .map((d) => join(dir, d.name, d.name))

  const acc = new Map<string, BulkLabelFields>()
  for (const path of partitionPaths) {
    await streamPartition(path, (genericNames, r) => {
      const matched = genericNames.map((n) => n.toLowerCase()).filter((n) => catalogNamesLower.has(n))
      if (matched.length === 0) return
      const ext = extractBulkLabel(r)
      if (!ext) return
      for (const name of matched) {
        let cur = acc.get(name)
        if (!cur) { cur = { contraindications: [] }; acc.set(name, cur) }
        mergeInto(cur, ext)
      }
    })
  }
  return acc
}
```
> Note: the fixture test exercises the flat-file path (`part.json` directly in the dir). The real data uses the nested folder layout (`drug-label-0001-of-0013.json/drug-label-0001-of-0013.json`); `buildOpenFdaBulk` handles both. For the fixture, name the dir scan to also accept `part.json` — adjust the regex if needed so the test's `part.json` is picked up, OR have the test call `streamPartition` directly (the `buildOpenFdaBulk` fixture test may point at a dir containing a `drug-label-0001-of-0013.json` file instead of `part.json`; rename the fixture accordingly to `drug-label-0001-of-0013.json` so the production regex matches). **Implementer: rename the fixture file to `drug-label-0001-of-0013.json` inside `fixtures/openfda-bulk/` so `buildOpenFdaBulk` finds it via the production regex; keep the `streamPartition` test pointing at that same path.**

- [ ] **Step 6: Run tests, verify PASS** (4 tests), then full suite.

- [ ] **Step 7: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/sources/openfda-bulk.ts scripts/etl/drug-catalog/__tests__/openfda-bulk.test.ts scripts/etl/drug-catalog/__tests__/fixtures/openfda-bulk/ scripts/etl/drug-catalog/package.json
git commit -m "feat(etl): openFDA bulk label extractor + streaming reader"
```

---

### Task 2: openFDA bulk runner

**Files:**
- Create: `scripts/etl/drug-catalog/run-openfda-bulk.ts`
- Create: `scripts/etl/drug-catalog/__tests__/run-openfda-bulk.test.ts`
- Modify: `scripts/etl/drug-catalog/package.json` (add `"run-openfda-bulk": "tsx run-openfda-bulk.ts"`)

**Interfaces:**
- Produces: `runOpenFdaBulkEtl(deps): Promise<{ matched, rowsUpdated, upserts }>` with injectable `supabase`, `catalogRows: {atc_code, inn_name}[]`, and `bulk: Map<string, BulkLabelFields>` (lowercased name → fields). In production `bulk` is built via `buildOpenFdaBulk(ONFDA_DIR, namesLower)`.

Logic: fetch catalog (atc_code, inn_name) paginated; build `nameLower -> rows` map + `namesLower` Set; `bulk = buildOpenFdaBulk(dir, namesLower)`; for each catalog row whose `inn_name.toLowerCase()` is in bulk, push `{ atc_code, inn_name, pregnancy_clinical: f.pregnancyClinical ?? {}, contraindications: f.contraindications, administration_notes: f.administrationNotes ? { en: f.administrationNotes } : {}, warnings_summary_plain: f.warnings ? { en: f.warnings } : {}, last_etl_refresh }`; chunked upsert onConflict atc_code.

- [ ] **Step 1: Failing test** `__tests__/run-openfda-bulk.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runOpenFdaBulkEtl } from '../run-openfda-bulk.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert }
}

describe('runOpenFdaBulkEtl', () => {
  it('writes the 4 fields to rows whose inn_name matches the bulk map (case-insensitive)', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01XD01', inn_name: 'Metronidazole' },
      { atc_code: 'P01AB01', inn_name: 'Metronidazole' },
      { atc_code: 'Z99ZZ99', inn_name: 'Nope' },
    ]
    const bulk = new Map([['metronidazole', { pregnancyClinical: { legacyCategory: 'B' }, contraindications: ['Hypersensitivity.'], administrationNotes: 'Two grams.', warnings: 'Carcinogenic in mice.' }]])
    const res = await runOpenFdaBulkEtl({ supabase: client, catalogRows, bulk })
    expect(res.matched).toBe(1)
    expect(res.rowsUpdated).toBe(2)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['J01XD01', 'P01AB01'])
    expect(rows[0].pregnancy_clinical).toMatchObject({ legacyCategory: 'B' })
    expect(rows[0].administration_notes).toEqual({ en: 'Two grams.' })
    expect(rows[0].warnings_summary_plain).toEqual({ en: 'Carcinogenic in mice.' })
    expect(Object.keys(rows[0]).sort()).toEqual(['administration_notes', 'atc_code', 'contraindications', 'inn_name', 'last_etl_refresh', 'pregnancy_clinical', 'warnings_summary_plain'])
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `run-openfda-bulk.ts`
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildOpenFdaBulk, type BulkLabelFields } from './sources/openfda-bulk.js'

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
  const namesLower = new Set(catalogRows.map((r) => r.inn_name?.toLowerCase()).filter(Boolean) as string[])
  const bulk = deps.bulk ?? await buildOpenFdaBulk(ONFDA_DIR, namesLower)

  const now = new Date().toISOString()
  const updates: Array<Record<string, unknown>> = []
  for (const r of catalogRows) {
    const f = r.inn_name ? bulk.get(r.inn_name.toLowerCase()) : undefined
    if (!f) continue
    updates.push({
      atc_code: r.atc_code, inn_name: r.inn_name,
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
```

- [ ] **Step 4: Run tests, verify PASS, then full suite.**

- [ ] **Step 5: Commit** *(checkpoint)*

---

### Task 3: Live bulk run + verify (controller-run)

- [ ] **Step 1:** With Supabase env, run `pnpm -F @ultranos/drug-catalog-etl run-openfda-bulk` (streams the 13 local partitions; a few minutes; bounded memory). If memory pressure, run node with `--max-old-space-size` is NOT needed (stream-json keeps it bounded).
- [ ] **Step 2:** Verify via Supabase MCP: `SELECT count(*) FILTER (WHERE pregnancy_clinical<>'{}') has_preg, count(*) FILTER (WHERE contraindications<>'[]') has_contra, count(*) FILTER (WHERE administration_notes<>'{}') has_admin, count(*) FILTER (WHERE warnings_summary_plain<>'{}') has_warn FROM drug_catalog;` and spot-check metronidazole.
- [ ] **Step 3:** Confirm coverage rose vs the API run (pregnancy/contra) and the two new fields are populated + clean.

## Self-Review
- Streams (no whole-file parse); matches by lowercased generic_name; merges across products; writes 4 fields by inn_name; reuses Plan 5 cleaners. Memory bounded. Payload keys exact. No overwrite of other sources.
- Type consistency: pregnancy_clinical ~ DrugPregnancyClinical; administration_notes/warnings_summary_plain ~ DrugLocalizedText {en}; contraindications string[].

## Execution Handoff
**(1) Subagent-Driven (recommended)** or **(2) Inline Execution**.
