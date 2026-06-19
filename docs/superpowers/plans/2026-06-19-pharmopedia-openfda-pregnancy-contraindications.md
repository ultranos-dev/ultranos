# Pharmopedia openFDA Pregnancy + Contraindications (Plan 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Populate the two clean net-new clinical fields `pregnancy_clinical` (PLLR pregnancy/lactation + legacy category) and `contraindications` from openFDA drug labels (SPL-as-JSON). `pregnancy_clinical` lights up the PLLR monograph UI built in Plan 1 (currently 0%).

**Architecture:** Online per-drug ETL. For each distinct catalog `inn_name`, query openFDA `drug/label` by `openfda.generic_name`, extract `pregnancy`/`nursing_mothers` → `pregnancyClinical` and `contraindications` → `string[]`, then upsert onto rows sharing that `inn_name`. Bounded concurrency, fault-tolerant, optional API key.

**Tech Stack:** TypeScript, `@ultranos/drug-catalog-etl` (tsx + Vitest), Node `fetch`, Supabase.

## Global Constraints

- **openFDA endpoint:** `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"<NAME>"&limit=1` (+ `&api_key=<KEY>` when `OPENFDA_API_KEY` is set). Each section is an **array of long strings**; take `[0]`.
- **Rate limit:** without an API key, **1,000 requests/day** (and 240/min). We have ~2,500 distinct inn_names, so a keyless run enriches ~1,000 drugs and the rest return null (graceful, counted as failed). With `OPENFDA_API_KEY` (free, open.fda.gov) the full set completes. openFDA returns **HTTP 404 for an empty result set** — treat 404 as "no label" (null), not an error.
- **Only write the two net-new fields** (`pregnancy_clinical`, `contraindications`) + `inn_name` + `last_etl_refresh`. Do NOT write MOA/therapeutic_class/adverse_events/brands — those are already populated by DrugBank/OnSIDES and must not be overwritten.
- **pregnancyClinical shape** (matches shared-types `DrugPregnancyClinical`): `{ pregnancy?, lactation?, reproductivePotential?, legacyCategory? }`, plain strings, HTML/whitespace cleaned. `lactation` ← `nursing_mothers[0]`. `legacyCategory` ← `/Category ([A-DX])/` from the pregnancy text if present.
- **contraindications**: split the cleaned prose into sentences, keep meaningful ones (length > 15), cap at 8.
- **inn_name in payload** (Postgres NOT NULL on ON CONFLICT candidate). Fault-tolerant: a null/404 result is skipped (failed++), never aborts.
- Content is FDA-label-sourced (not AI) → no physician gate. English only (Dari/Pashto later).
- **Git (CLAUDE.md):** no commits without explicit instruction.

---

### Task 1: openFDA label fetch + parse module

**Files:**
- Create: `scripts/etl/drug-catalog/sources/openfda-label.ts`
- Create: `scripts/etl/drug-catalog/__tests__/openfda-label.test.ts`

**Interfaces:**
```typescript
export interface OpenFdaLabel {
  pregnancyClinical?: { pregnancy?: string; lactation?: string; legacyCategory?: string }
  contraindications: string[]
}
export function openFdaUrl(name: string, apiKey?: string): string
export function cleanText(s: string | undefined): string | undefined
export function parseOpenFdaLabel(json: unknown): OpenFdaLabel | null
export function fetchOpenFdaLabel(name: string, apiKey?: string, fetchImpl?: typeof fetch): Promise<OpenFdaLabel | null>
```

- [ ] **Step 1: Failing test** `__tests__/openfda-label.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import { openFdaUrl, cleanText, parseOpenFdaLabel, fetchOpenFdaLabel } from '../sources/openfda-label.js'

const RESP = {
  results: [{
    openfda: { generic_name: ['METRONIDAZOLE'] },
    contraindications: ['Metronidazole is contraindicated in patients with hypersensitivity. It is also contraindicated in the first trimester.'],
    pregnancy: ['Pregnancy Category B. There are no adequate studies in pregnant women.'],
    nursing_mothers: ['Metronidazole is present in human milk at concentrations similar to maternal serum.'],
  }],
}

describe('openfda-label', () => {
  it('builds the URL, adds api_key when provided', () => {
    expect(openFdaUrl('metronidazole')).toContain('openfda.generic_name')
    expect(openFdaUrl('metronidazole')).not.toContain('api_key')
    expect(openFdaUrl('metronidazole', 'K')).toContain('api_key=K')
  })
  it('cleanText strips html + collapses ws', () => {
    expect(cleanText('<p>a  b</p>')).toBe('a b')
    expect(cleanText(undefined)).toBeUndefined()
  })
  it('parses pregnancyClinical (pregnancy + lactation + legacy category) and contraindications', () => {
    const l = parseOpenFdaLabel(RESP)!
    expect(l.pregnancyClinical?.pregnancy).toContain('no adequate studies')
    expect(l.pregnancyClinical?.lactation).toContain('human milk')
    expect(l.pregnancyClinical?.legacyCategory).toBe('B')
    expect(l.contraindications.length).toBeGreaterThanOrEqual(2)
    expect(l.contraindications[0]).toContain('hypersensitivity')
  })
  it('returns null when results empty', () => {
    expect(parseOpenFdaLabel({ results: [] })).toBeNull()
    expect(parseOpenFdaLabel({})).toBeNull()
  })
  it('fetch returns parsed on 200, null on 404/500/throw', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => RESP } as Response)
    expect((await fetchOpenFdaLabel('metronidazole', undefined, ok as unknown as typeof fetch))!.contraindications.length).toBeGreaterThan(0)
    const notfound = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response)
    expect(await fetchOpenFdaLabel('x', undefined, notfound as unknown as typeof fetch)).toBeNull()
    const threw = vi.fn().mockRejectedValue(new Error('net'))
    expect(await fetchOpenFdaLabel('x', undefined, threw as unknown as typeof fetch)).toBeNull()
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `sources/openfda-label.ts`
```typescript
export interface OpenFdaLabel {
  pregnancyClinical?: { pregnancy?: string; lactation?: string; legacyCategory?: string }
  contraindications: string[]
}

const BASE = 'https://api.fda.gov/drug/label.json'

export function openFdaUrl(name: string, apiKey?: string): string {
  const search = encodeURIComponent(`openfda.generic_name:"${name}"`)
  return `${BASE}?search=${search}&limit=1${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`
}

export function cleanText(s: string | undefined): string | undefined {
  if (s == null) return undefined
  const out = s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  return out.length ? out : undefined
}

function splitContra(text: string | undefined): string[] {
  const clean = cleanText(text)
  if (!clean) return []
  return clean.split(/(?<=\.)\s+/).map((s) => s.trim()).filter((s) => s.length > 15).slice(0, 8)
}

interface Result {
  contraindications?: string[]
  pregnancy?: string[]
  nursing_mothers?: string[]
}

export function parseOpenFdaLabel(json: unknown): OpenFdaLabel | null {
  const r = (json as { results?: Result[] })?.results?.[0]
  if (!r) return null
  const pregnancy = cleanText(r.pregnancy?.[0])
  const lactation = cleanText(r.nursing_mothers?.[0])
  const legacyCategory = (r.pregnancy?.[0] ?? '').match(/Category ([A-DX])/)?.[1]
  const pregnancyClinical = pregnancy || lactation || legacyCategory
    ? { ...(pregnancy ? { pregnancy } : {}), ...(lactation ? { lactation } : {}), ...(legacyCategory ? { legacyCategory } : {}) }
    : undefined
  const contraindications = splitContra(r.contraindications?.[0])
  if (!pregnancyClinical && contraindications.length === 0) return null
  return { pregnancyClinical, contraindications }
}

export async function fetchOpenFdaLabel(name: string, apiKey?: string, fetchImpl: typeof fetch = fetch): Promise<OpenFdaLabel | null> {
  try {
    const res = await fetchImpl(openFdaUrl(name, apiKey))
    if (!res.ok) return null   // 404 = no label for this name
    return parseOpenFdaLabel(await res.json())
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests, verify PASS** (5 tests), then full suite.

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/sources/openfda-label.ts scripts/etl/drug-catalog/__tests__/openfda-label.test.ts
git commit -m "feat(etl): openFDA label fetch+parse (pregnancyClinical + contraindications)"
```

---

### Task 2: openFDA runner — write pregnancy_clinical + contraindications

**Files:**
- Create: `scripts/etl/drug-catalog/run-openfda-label.ts`
- Create: `scripts/etl/drug-catalog/__tests__/run-openfda-label.test.ts`
- Modify: `scripts/etl/drug-catalog/package.json` (add `"run-openfda-label": "tsx run-openfda-label.ts"`)

**Interfaces:**
- Produces: `runOpenFdaLabelEtl(deps): Promise<{ fetched, withLabel, rowsUpdated, failed, upserts }>` where `deps` supplies `supabase`, optional injectable `catalogRows: {atc_code, inn_name}[]`, and optional injectable `fetchLabel`.

Logic mirrors the MedlinePlus runner but keys on **`inn_name`** (openFDA is searched by generic name): fetch catalog (atc_code, inn_name); group rows by inn_name; fetch openFDA per distinct inn_name with bounded concurrency (`OPENFDA_CONCURRENCY`, default 4 — keep under the 240/min cap) passing `process.env.OPENFDA_API_KEY`; for each inn_name with a label, build `{ atc_code, inn_name, pregnancy_clinical, contraindications, last_etl_refresh }` for every row sharing that inn_name; chunked upsert onConflict atc_code. `pregnancy_clinical` = `label.pregnancyClinical ?? {}`; `contraindications` = `label.contraindications`.

- [ ] **Step 1: Failing test** `__tests__/run-openfda-label.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runOpenFdaLabelEtl } from '../run-openfda-label.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert, from }
}

describe('runOpenFdaLabelEtl', () => {
  it('writes pregnancy_clinical + contraindications to all atc rows sharing inn_name', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'J01XD01', inn_name: 'Metronidazole' },
      { atc_code: 'P01AB01', inn_name: 'Metronidazole' },
      { atc_code: 'Z99ZZ99', inn_name: 'Nope' },
    ]
    const fetchLabel = vi.fn(async (name: string) =>
      name === 'Metronidazole'
        ? { pregnancyClinical: { pregnancy: 'no adequate studies', lactation: 'in milk', legacyCategory: 'B' }, contraindications: ['Hypersensitivity to metronidazole.'] }
        : null)
    const res = await runOpenFdaLabelEtl({ supabase: client, catalogRows, fetchLabel })
    expect(res.withLabel).toBe(1)
    expect(res.rowsUpdated).toBe(2)
    expect(res.failed).toBe(1)
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['J01XD01', 'P01AB01'])
    expect(rows[0].pregnancy_clinical).toMatchObject({ legacyCategory: 'B' })
    expect(rows[0].contraindications).toEqual(['Hypersensitivity to metronidazole.'])
  })
  it('upsert payload has only the intended columns', async () => {
    const { client, upsert } = makeSupabase()
    const fetchLabel = vi.fn(async () => ({ pregnancyClinical: { legacyCategory: 'B' }, contraindications: [] }))
    await runOpenFdaLabelEtl({ supabase: client, catalogRows: [{ atc_code: 'J01XD01', inn_name: 'M' }], fetchLabel })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(Object.keys(row).sort()).toEqual(['atc_code', 'contraindications', 'inn_name', 'last_etl_refresh', 'pregnancy_clinical'])
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `run-openfda-label.ts`
```typescript
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
```

- [ ] **Step 4: Run tests, verify PASS** (2 tests), then full suite.

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/run-openfda-label.ts scripts/etl/drug-catalog/__tests__/run-openfda-label.test.ts scripts/etl/drug-catalog/package.json
git commit -m "feat(etl): openFDA runner — write pregnancy_clinical + contraindications by inn_name"
```

---

### Task 3: Live openFDA run + verify (controller-run)

- [ ] **Step 1:** With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (and optionally `OPENFDA_API_KEY`) env, run `pnpm -F @ultranos/drug-catalog-etl run-openfda-label`. Without a key, expect ~1,000 successes then 429/404s (graceful). With a key, the full set.
- [ ] **Step 2:** Verify via Supabase MCP: `SELECT count(*) FILTER (WHERE pregnancy_clinical <> '{}') AS has_preg, count(*) FILTER (WHERE contraindications <> '[]') AS has_contra FROM drug_catalog;` and spot-check metronidazole `SELECT pregnancy_clinical, contraindications->0 FROM drug_catalog WHERE atc_code='J01XD01';`
- [ ] **Step 3:** Confirm pregnancy_clinical has pregnancy/lactation prose and contraindications are clean sentences. Note final coverage; if keyless-partial, note a keyed re-run completes it.

---

## Self-Review
- **Spec coverage:** fetch+parse (T1), inn_name-keyed runner writing only pregnancy_clinical + contraindications + inn_name (T2), live run (T3). Rate-limit/API-key, 404-as-null, no-overwrite-of-DrugBank-fields, inn_name-in-payload, fault tolerance — all in constraints.
- **Type consistency:** `pregnancy_clinical` matches `DrugPregnancyClinical`; `contraindications` is `string[]`; payload keys `atc_code, inn_name, pregnancy_clinical, contraindications, last_etl_refresh`.
- **Known limitation:** keyless run is partial (~1,000/day); reproductivePotential not in openFDA (stays undefined); English only.

## Execution Handoff
**(1) Subagent-Driven (recommended)** or **(2) Inline Execution**.
