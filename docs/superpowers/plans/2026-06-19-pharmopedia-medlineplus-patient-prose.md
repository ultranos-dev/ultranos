# Pharmopedia MedlinePlus Patient Prose (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Populate the patient-facing Tier-1 fields `summaryPlain` and `usedFor` from MedlinePlus Connect — closing the gap where patient-role users currently see an empty monograph.

**Architecture:** An ONLINE per-drug ETL. For each distinct catalog `rxnorm_cui`, call MedlinePlus Connect (free NLM web service, no key), take the primary entry, strip its HTML summary to plain text (→ `summaryPlain.en`) and extract its `<li>` "uses" items (→ `usedFor`), then upsert onto the catalog rows sharing that `rxnorm_cui`. Rate-limited, fault-tolerant (missing prose is acceptable — skip on error).

**Tech Stack:** TypeScript, `@ultranos/drug-catalog-etl` (tsx + Vitest), Node `fetch`, `@supabase/supabase-js`.

## Global Constraints

- **MedlinePlus Connect endpoint** (JSON): `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.88&mainSearchCriteria.v.c=<RXCUI>&knowledgeResponseType=application/json` (`2.16.840.1.113883.6.88` = the RxNorm code-system OID).
- **Response shape** (verified): `feed.entry[]`; each entry has `title._value`, `summary._value` (HTML, type=html), `link[].href`. `entry[0]` is the primary drug match. When only one result, `feed.entry` may be a single object, not an array — normalize to array.
- **Content is NLM-authoritative (not AI)** → no physician-confirmation gate required (CLAUDE.md rule #2 applies only to AI-generated clinical content).
- **Localization:** populate the `en` field only. Dari/Pashto translation is a separate future step (flagged).
- **Politeness/rate limit:** MedlinePlus Connect is free but asks callers not to hammer it — cap concurrency (≤ 5) and tolerate failures. Dedup by `rxnorm_cui` so each drug substance is fetched once.
- **Upsert payload** includes `inn_name` (Postgres enforces NOT NULL on the ON CONFLICT candidate tuple, even for existing rows — learned in Plan 3); writes only `{ atc_code, inn_name, summary_plain, used_for, last_etl_refresh }`, never curator/other clinical columns.
- **Fault tolerance:** a fetch/parse failure for one drug skips it (counts as failed) and never aborts the run.
- **Stream/scale:** ~2,500 distinct cuis; fetch with bounded concurrency.
- **Git (CLAUDE.md):** no `git add`/`commit` without explicit instruction.

---

### Task 1: MedlinePlus fetch + parse module

**Files:**
- Create: `scripts/etl/drug-catalog/sources/medlineplus.ts`
- Create: `scripts/etl/drug-catalog/__tests__/medlineplus.test.ts`

**Interfaces:**
- Produces:
```typescript
export interface MedlinePlusProse { summary: string; uses: string[]; url?: string }
export function stripHtml(s: string): string
export function extractUses(html: string): string[]
export function parseMedlinePlus(json: unknown): MedlinePlusProse | null   // null if no usable entry
export function medlinePlusUrl(rxcui: string): string
export function fetchMedlinePlusProse(rxcui: string, fetchImpl?: typeof fetch): Promise<MedlinePlusProse | null>
```

- [ ] **Step 1: Failing test** `__tests__/medlineplus.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import { stripHtml, extractUses, parseMedlinePlus, medlinePlusUrl, fetchMedlinePlusProse } from '../sources/medlineplus.js'

const FEED = {
  feed: {
    entry: [
      {
        title: { _value: 'Metronidazole' },
        summary: { _value: '<p>Metronidazole is used to treat infections.</p><p>It is used to:</p><ul><li>treat bacterial infections</li><li>treat parasites</li></ul>', _type: 'html' },
        link: [{ href: 'https://medlineplus.gov/druginfo/meds/a689011.html' }],
      },
      { title: { _value: 'Antibiotics' }, summary: { _value: '<p>other topic</p>' }, link: [{ href: 'x' }] },
    ],
  },
}

describe('medlineplus', () => {
  it('builds the Connect URL with the RxNorm OID', () => {
    expect(medlinePlusUrl('6922')).toContain('mainSearchCriteria.v.cs=2.16.840.1.113883.6.88')
    expect(medlinePlusUrl('6922')).toContain('mainSearchCriteria.v.c=6922')
    expect(medlinePlusUrl('6922')).toContain('knowledgeResponseType=application/json')
  })
  it('stripHtml removes tags and entities, collapses whitespace', () => {
    expect(stripHtml('<p>a&amp;b</p>  <b>c</b>')).toBe('a b c')
  })
  it('extractUses pulls <li> items', () => {
    expect(extractUses('<ul><li>treat infections</li><li>treat parasites</li></ul>')).toEqual(['treat infections', 'treat parasites'])
  })
  it('parseMedlinePlus uses entry[0], strips summary, extracts uses', () => {
    const p = parseMedlinePlus(FEED)!
    expect(p.summary).toContain('Metronidazole is used to treat infections')
    expect(p.summary).not.toContain('<')
    expect(p.uses).toEqual(['treat bacterial infections', 'treat parasites'])
    expect(p.url).toContain('a689011')
  })
  it('parseMedlinePlus returns null when no entries', () => {
    expect(parseMedlinePlus({ feed: {} })).toBeNull()
    expect(parseMedlinePlus({ feed: { entry: [] } })).toBeNull()
  })
  it('parseMedlinePlus normalizes a single-object entry', () => {
    const single = { feed: { entry: { title: { _value: 'X' }, summary: { _value: '<p>hi</p>' }, link: [{ href: 'u' }] } } }
    expect(parseMedlinePlus(single)!.summary).toBe('hi')
  })
  it('fetchMedlinePlusProse returns parsed prose on 200, null on error', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => FEED } as Response)
    expect((await fetchMedlinePlusProse('6922', ok as unknown as typeof fetch))!.uses.length).toBe(2)
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    expect(await fetchMedlinePlusProse('6922', bad as unknown as typeof fetch)).toBeNull()
    const threw = vi.fn().mockRejectedValue(new Error('net'))
    expect(await fetchMedlinePlusProse('6922', threw as unknown as typeof fetch)).toBeNull()
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `sources/medlineplus.ts`
```typescript
export interface MedlinePlusProse { summary: string; uses: string[]; url?: string }

const RXNORM_OID = '2.16.840.1.113883.6.88'

export function medlinePlusUrl(rxcui: string): string {
  return `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=${RXNORM_OID}` +
    `&mainSearchCriteria.v.c=${encodeURIComponent(rxcui)}&knowledgeResponseType=application/json`
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim()
}

export function extractUses(html: string): string[] {
  const out: string[] = []
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) { const t = stripHtml(m[1]); if (t) out.push(t) }
  return out
}

export function parseMedlinePlus(json: unknown): MedlinePlusProse | null {
  const feed = (json as { feed?: { entry?: unknown } })?.feed
  if (!feed || feed.entry == null) return null
  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry]
  const e0 = entries[0] as { summary?: { _value?: string }; link?: Array<{ href?: string }> } | undefined
  if (!e0) return null
  const html = e0.summary?._value ?? ''
  const summary = stripHtml(html)
  if (!summary) return null
  return { summary, uses: extractUses(html), url: e0.link?.[0]?.href }
}

export async function fetchMedlinePlusProse(rxcui: string, fetchImpl: typeof fetch = fetch): Promise<MedlinePlusProse | null> {
  try {
    const res = await fetchImpl(medlinePlusUrl(rxcui))
    if (!res.ok) return null
    return parseMedlinePlus(await res.json())
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests, verify PASS** (7 tests), then full suite (no regressions).

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/sources/medlineplus.ts scripts/etl/drug-catalog/__tests__/medlineplus.test.ts
git commit -m "feat(etl): MedlinePlus Connect fetch + parse (patient prose + uses)"
```

---

### Task 2: MedlinePlus runner — write summary_plain + used_for

**Files:**
- Create: `scripts/etl/drug-catalog/run-medlineplus.ts`
- Create: `scripts/etl/drug-catalog/__tests__/run-medlineplus.test.ts`
- Modify: `scripts/etl/drug-catalog/package.json` (add `"run-medlineplus": "tsx run-medlineplus.ts"`)

**Interfaces:**
- Consumes: `fetchMedlinePlusProse`.
- Produces: `runMedlinePlusEtl(deps): Promise<{ fetched: number; withProse: number; rowsUpdated: number; failed: number; upserts: number }>` where `deps` supplies `supabase`, an optional injectable `catalogRows: Array<{atc_code, rxnorm_cui, inn_name}>`, and an optional injectable `fetchProse` (defaults to the real `fetchMedlinePlusProse`).

Logic: fetch catalog rows (paginated, non-null cui); dedup distinct cuis; fetch MedlinePlus prose per cui with **bounded concurrency (5)**; build `cui -> { summary_plain: {en}, used_for: [{en}...] }`; for each catalog row whose cui has prose, push `{ atc_code, inn_name, summary_plain, used_for, last_etl_refresh }`; chunked upsert onConflict atc_code (ETL_CHUNK env, default 200). `used_for` is `summary.uses.map(u => ({ en: u }))`; `summary_plain` is `{ en: summary }`.

- [ ] **Step 1: Failing test** `__tests__/run-medlineplus.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runMedlinePlusEtl } from '../run-medlineplus.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert, from }
}

describe('runMedlinePlusEtl', () => {
  it('writes summary_plain + used_for to all atc rows sharing the cui', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01XD01', rxnorm_cui: '6922', inn_name: 'Metronidazole' },
      { atc_code: 'P01AB01', rxnorm_cui: '6922', inn_name: 'Metronidazole' },
      { atc_code: 'Z99ZZ99', rxnorm_cui: '404', inn_name: 'Nope' },
    ]
    const fetchProse = vi.fn(async (cui: string) =>
      cui === '6922' ? { summary: 'Metronidazole treats infections.', uses: ['treat infections'], url: 'u' } : null)
    const res = await runMedlinePlusEtl({ supabase: client, catalogRows, fetchProse })
    expect(res.withProse).toBe(1)     // only cui 6922 had prose
    expect(res.rowsUpdated).toBe(2)   // both metronidazole ATCs
    expect(res.failed).toBe(1)        // cui 404 returned null
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['J01XD01', 'P01AB01'])
    expect(rows[0].summary_plain).toEqual({ en: 'Metronidazole treats infections.' })
    expect(rows[0].used_for).toEqual([{ en: 'treat infections' }])
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ onConflict: 'atc_code' }))
  })
  it('upsert payload has only the intended columns', async () => {
    const { client, upsert } = makeSupabase()
    const fetchProse = vi.fn(async () => ({ summary: 's', uses: [], url: undefined }))
    await runMedlinePlusEtl({ supabase: client, catalogRows: [{ atc_code: 'J01XD01', rxnorm_cui: '6922', inn_name: 'M' }], fetchProse })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(Object.keys(row).sort()).toEqual(['atc_code', 'inn_name', 'last_etl_refresh', 'summary_plain', 'used_for'])
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `run-medlineplus.ts`
```typescript
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
```

- [ ] **Step 4: Run tests, verify PASS** (2 tests), then full suite.

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/run-medlineplus.ts scripts/etl/drug-catalog/__tests__/run-medlineplus.test.ts scripts/etl/drug-catalog/package.json
git commit -m "feat(etl): MedlinePlus runner — write summary_plain + used_for by rxnorm_cui"
```

---

### Task 3: Live MedlinePlus run + verify (controller-run)

- [ ] **Step 1:** With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env, run `pnpm -F @ultranos/drug-catalog-etl run-medlineplus`. (Online, ~2,500 distinct cuis at concurrency 5 — a few minutes. If MedlinePlus rate-limits, lower `MLP_CONCURRENCY`.)
- [ ] **Step 2:** Verify via Supabase MCP: `SELECT count(*) FILTER (WHERE summary_plain <> '{}') AS has_summary, count(*) FILTER (WHERE used_for <> '[]') AS has_uses FROM drug_catalog;` and spot-check aspirin: `SELECT summary_plain->>'en', used_for FROM drug_catalog WHERE atc_code='B01AC06';`
- [ ] **Step 3:** Confirm the summary is clean plain text (no HTML) and `used_for` has list items where present.

---

## Self-Review

**Spec coverage:** fetch+parse (T1) · concurrency-bounded runner writing summary_plain + used_for by cui (T2) · live run (T3). entry[0] primary match, single-entry normalization, HTML strip, `<li>` uses extraction, fault tolerance, inn_name-in-payload, pagination — all in Global Constraints/tasks.

**Placeholder scan:** none. The MedlinePlus `link`/`title` beyond entry[0] and other entries (related topics) are intentionally unused.

**Type consistency:** `summary_plain = { en }` and `used_for = [{ en }]` match shared-types `DrugLocalizedText` / `DrugLocalizedText[]`. Upsert payload keys: `atc_code, inn_name, summary_plain, used_for, last_etl_refresh`.

**Known limitation (noted, not a defect):** English only; Dari/Pashto translation is a future step. `whenToSeekHelp`/`storageInstructions`/`warningsSummaryPlain`/`pregnancyClinical`/dosing remain empty (DailyMed = a later plan).

## Execution Handoff
Plan complete. **(1) Subagent-Driven (recommended)** or **(2) Inline Execution**.
