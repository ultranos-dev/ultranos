# Pharmopedia OnSIDES Adverse Effects (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `drug_catalog.adverse_events` from OnSIDES v3.1.1 — label-derived adverse drug effects (MedDRA-coded), joined to catalog drugs by RxNorm ingredient.

**Architecture:** Load three small OnSIDES vocab/map CSVs into memory, stream the 400 MB `product_adverse_effect.csv`, resolve each row to a RxNorm ingredient (= catalog `rxnorm_cui`) and a MedDRA effect name, filter to the catalog + a confidence threshold, derive severity from the label section, dedupe + cap per drug, then update catalog rows by `rxnorm_cui`. Off-device build step; only the enriched column reaches the Hub.

**Tech Stack:** TypeScript, `@ultranos/drug-catalog-etl` (tsx + Vitest), `node:readline` streaming, `@supabase/supabase-js`.

## Global Constraints

- **Datasets:** `docs/datasets/onsides-v3.1.1/csv/` (gitignored). Files: `product_adverse_effect.csv` (product_label_id, effect_id, label_section, effect_meddra_id, match_method, pred0, **pred1**), `product_to_rxnorm.csv` (label_id, rxnorm_product_id), `vocab_rxnorm_ingredient_to_product.csv` (**product_id, ingredient_id**), `vocab_meddra_adverse_effect.csv` (meddra_id, meddra_name, meddra_term_type).
- **Confidence filter:** keep rows with `pred1 > 3.258` (OnSIDES BERT threshold).
- **Severity from `label_section`:** `BW` → `severe`, `WP` → `moderate`, `AR` (and any other) → `mild`. `frequency` is always `unknown` (OnSIDES does not grade frequency).
- **Cap `adverse_events` at 50/drug, severity-first** (severe → moderate → mild), deduped by effect name keeping the highest severity — bounds offline payload (consistent with the interaction cap, design D13).
- **Join key is the RxNorm INGREDIENT id** = catalog `rxnorm_cui`. Verified ~61% of catalog drugs match an OnSIDES ingredient; the rest get no OnSIDES effects (acceptable — noted).
- **Update path:** the runner UPSERTs only `{ atc_code, adverse_events, last_etl_refresh }` onto EXISTING rows (onConflict `atc_code`); it never touches curator columns or DrugBank-owned columns.
- **CSV parsing:** `product_adverse_effect.csv` and the map CSVs have no embedded commas in the columns we read EXCEPT `vocab_meddra_adverse_effect.csv` (names are quoted, may contain commas) — use a minimal quote-aware split for that file only.
- **Stream, never load** `product_adverse_effect.csv` (400 MB / ~7M rows) — `readline` line-by-line. Memory bound is the accumulator (catalog ingredients × ≤ effects).
- **Git (CLAUDE.md):** no `git add`/`commit` without explicit instruction — "Commit" steps are checkpoints.
- OnSIDES attribution (Tatonetti Lab) required in app credits.

## ⚠️ Open decisions — defaults chosen; confirm before executing tasks 2–4
1. **Severity mapping** (BW→severe / WP→moderate / AR→mild) — default above. Alternative: treat AR as moderate. Recommend the default.
2. **Confidence threshold** `pred1 > 3.258` — OnSIDES' own recommended cutoff. Keep.
3. **Cap 50/drug, severity-first** — mirrors interactions. Keep.

---

### Task 1: Severity + AdverseEvent mapping helpers

**Files:**
- Create: `scripts/etl/drug-catalog/transforms/onsides-severity.ts`
- Create: `scripts/etl/drug-catalog/__tests__/onsides-severity.test.ts`

**Interfaces:**
- Produces: `severityForSection(section: string): 'mild'|'moderate'|'severe'`; `SEVERITY_RANK` (severe=0, moderate=1, mild=2); `MAX_ADVERSE_EFFECTS = 50`.

- [ ] **Step 1: Failing test** `__tests__/onsides-severity.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { severityForSection } from '../transforms/onsides-severity.js'

describe('severityForSection', () => {
  it('maps label sections to severity', () => {
    expect(severityForSection('BW')).toBe('severe')
    expect(severityForSection('WP')).toBe('moderate')
    expect(severityForSection('AR')).toBe('mild')
    expect(severityForSection('SP')).toBe('mild')
    expect(severityForSection('')).toBe('mild')
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `transforms/onsides-severity.ts`
```typescript
export type AdverseSeverity = 'mild' | 'moderate' | 'severe'

export const SEVERITY_RANK: Record<AdverseSeverity, number> = { severe: 0, moderate: 1, mild: 2 }
export const MAX_ADVERSE_EFFECTS = 50

/** OnSIDES label_section → clinical severity. BW=Boxed Warning, WP=Warnings/Precautions, AR=Adverse Reactions. */
export function severityForSection(section: string): AdverseSeverity {
  if (section === 'BW') return 'severe'
  if (section === 'WP') return 'moderate'
  return 'mild'
}
```

- [ ] **Step 4: Run, verify PASS.**

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/transforms/onsides-severity.ts scripts/etl/drug-catalog/__tests__/onsides-severity.test.ts
git commit -m "feat(etl): OnSIDES label-section severity mapping"
```

---

### Task 2: OnSIDES lookups + streaming adverse-effect extractor

**Files:**
- Create: `scripts/etl/drug-catalog/sources/onsides.ts`
- Create: `scripts/etl/drug-catalog/__tests__/fixtures/onsides/` (4 tiny CSVs)
- Create: `scripts/etl/drug-catalog/__tests__/onsides.test.ts`

**Interfaces:**
- Consumes: the 4 CSVs + a `Set<string>` of catalog ingredient RxCUIs.
- Produces:
```typescript
export interface AdverseEvent { effect: string; frequency: 'unknown'; severity: 'mild'|'moderate'|'severe' }
export function loadOnsidesLookups(dir: string): Promise<{
  labelToProducts: Map<string, string[]>      // product_to_rxnorm:  label_id -> rxnorm_product_id[]
  productToIngredients: Map<string, string[]>  // ingredient_to_product: product_id -> ingredient_id[]
  meddraName: Map<string, string>              // meddra_id -> name
}>
export function buildAdverseEventsByIngredient(
  dir: string, lookups: Awaited<ReturnType<typeof loadOnsidesLookups>>, catalogCuis: Set<string>
): Promise<Map<string, AdverseEvent[]>>        // ingredient rxcui -> capped, deduped AdverseEvent[]
```

- [ ] **Step 1: Create fixtures** under `scripts/etl/drug-catalog/__tests__/fixtures/onsides/`

`product_to_rxnorm.csv`:
```
label_id,rxnorm_product_id
500,9000
500,9001
```
`vocab_rxnorm_ingredient_to_product.csv`:
```
product_id,ingredient_id
9000,1191
9001,1191
```
`vocab_meddra_adverse_effect.csv`:
```
meddra_id,meddra_name,meddra_term_type
10002218,"Anaphylaxis",PT
10000496,Acne,PT
10006093,Bradycardia,PT
```
`product_adverse_effect.csv`:
```
product_label_id,effect_id,label_section,effect_meddra_id,match_method,pred0,pred1
500,1,BW,10002218,PMB,0.0,5.50
500,2,AR,10000496,PMB,0.0,5.20
500,3,WP,10006093,PMB,0.0,4.90
500,4,AR,10002218,PMB,0.0,4.10
500,5,AR,10000496,PMB,0.0,2.00
```
(Row 5 is below the 3.258 threshold → dropped. Row 4 is Anaphylaxis again at AR/mild but row 1 has it at BW/severe → dedupe keeps severe.)

- [ ] **Step 2: Failing test** `__tests__/onsides.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadOnsidesLookups, buildAdverseEventsByIngredient } from '../sources/onsides.js'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'onsides')

describe('onsides', () => {
  it('loads lookups', async () => {
    const lk = await loadOnsidesLookups(DIR)
    expect(lk.labelToProducts.get('500')).toEqual(['9000', '9001'])
    expect(lk.productToIngredients.get('9000')).toEqual(['1191'])
    expect(lk.meddraName.get('10002218')).toBe('Anaphylaxis')
  })
  it('builds capped, deduped, severity-ranked adverse events for catalog ingredients', async () => {
    const lk = await loadOnsidesLookups(DIR)
    const byIng = await buildAdverseEventsByIngredient(DIR, lk, new Set(['1191']))
    const evs = byIng.get('1191')!
    expect(evs).toBeTruthy()
    // Anaphylaxis(severe, deduped from BW+AR), Bradycardia(moderate), Acne(mild). Row5 dropped (low pred1).
    expect(evs.map((e) => e.effect)).toEqual(['Anaphylaxis', 'Bradycardia', 'Acne'])
    expect(evs[0]).toEqual({ effect: 'Anaphylaxis', frequency: 'unknown', severity: 'severe' })
    expect(evs.every((e) => e.frequency === 'unknown')).toBe(true)
  })
  it('ignores ingredients not in the catalog set', async () => {
    const lk = await loadOnsidesLookups(DIR)
    const byIng = await buildAdverseEventsByIngredient(DIR, lk, new Set(['999999']))
    expect(byIng.size).toBe(0)
  })
})
```

- [ ] **Step 3: Run, verify FAIL.**

- [ ] **Step 4: Implement** `sources/onsides.ts`
```typescript
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { severityForSection, SEVERITY_RANK, MAX_ADVERSE_EFFECTS, type AdverseSeverity } from '../transforms/onsides-severity.js'

export interface AdverseEvent { effect: string; frequency: 'unknown'; severity: AdverseSeverity }

const PRED1_THRESHOLD = 3.258

/** Minimal quote-aware CSV line split (handles "a,b" quoted fields). */
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out
}

async function eachLine(path: string, onLine: (cols: string[], idx: number) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  let idx = 0
  for await (const line of rl) { if (line.length) onLine(splitCsv(line), idx); idx++ }
}

function pushMulti(m: Map<string, string[]>, k: string, v: string) {
  const a = m.get(k); if (a) a.push(v); else m.set(k, [v])
}

export async function loadOnsidesLookups(dir: string) {
  const labelToProducts = new Map<string, string[]>()
  const productToIngredients = new Map<string, string[]>()
  const meddraName = new Map<string, string>()
  await eachLine(join(dir, 'product_to_rxnorm.csv'), (c, i) => { if (i) pushMulti(labelToProducts, c[0], c[1]) })
  await eachLine(join(dir, 'vocab_rxnorm_ingredient_to_product.csv'), (c, i) => { if (i) pushMulti(productToIngredients, c[0], c[1]) })
  await eachLine(join(dir, 'vocab_meddra_adverse_effect.csv'), (c, i) => { if (i) meddraName.set(c[0], c[1]) })
  return { labelToProducts, productToIngredients, meddraName }
}

export async function buildAdverseEventsByIngredient(
  dir: string,
  lookups: Awaited<ReturnType<typeof loadOnsidesLookups>>,
  catalogCuis: Set<string>
): Promise<Map<string, AdverseEvent[]>> {
  const { labelToProducts, productToIngredients, meddraName } = lookups
  // ingredient -> (effectName -> best severity rank)
  const acc = new Map<string, Map<string, AdverseSeverity>>()
  await eachLine(join(dir, 'product_adverse_effect.csv'), (c, i) => {
    if (!i) return
    const labelId = c[0], section = c[2], meddraId = c[3], pred1 = Number(c[6])
    if (!(pred1 > PRED1_THRESHOLD)) return
    const name = meddraName.get(meddraId); if (!name) return
    const sev = severityForSection(section)
    const products = labelToProducts.get(labelId); if (!products) return
    for (const p of products) {
      const ings = productToIngredients.get(p); if (!ings) continue
      for (const ing of ings) {
        if (!catalogCuis.has(ing)) continue
        let em = acc.get(ing); if (!em) { em = new Map(); acc.set(ing, em) }
        const prev = em.get(name)
        if (prev === undefined || SEVERITY_RANK[sev] < SEVERITY_RANK[prev]) em.set(name, sev)
      }
    }
  })
  const out = new Map<string, AdverseEvent[]>()
  for (const [ing, em] of acc) {
    const evs = [...em.entries()].map(([effect, severity]) => ({ effect, frequency: 'unknown' as const, severity }))
    evs.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    out.set(ing, evs.slice(0, MAX_ADVERSE_EFFECTS))
  }
  return out
}
```

- [ ] **Step 5: Run tests, verify PASS** (3 tests), then full suite (no regressions).

- [ ] **Step 6: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/sources/onsides.ts scripts/etl/drug-catalog/__tests__/onsides.test.ts scripts/etl/drug-catalog/__tests__/fixtures/onsides/
git commit -m "feat(etl): OnSIDES adverse-effect extractor (vocab join, dedupe, severity cap)"
```

---

### Task 3: OnSIDES runner — write adverse_events to catalog by rxnorm_cui

**Files:**
- Create: `scripts/etl/drug-catalog/run-onsides.ts`
- Create: `scripts/etl/drug-catalog/__tests__/run-onsides.test.ts`
- Modify: `scripts/etl/drug-catalog/package.json` (add `"run-onsides": "tsx run-onsides.ts"`)

**Interfaces:**
- Consumes: `loadOnsidesLookups`, `buildAdverseEventsByIngredient`.
- Produces: `runOnsidesEtl(dir, deps): Promise<{ ingredientsWithEffects: number; rowsUpdated: number; upserts: number }>` where `deps` supplies `supabase` and a `catalogRows: Array<{ atc_code, rxnorm_cui }>` (injectable for tests; in prod fetched from drug_catalog).

The runner: (1) get catalog rows `(atc_code, rxnorm_cui)` with non-null cui; build `cui -> atc_code[]` + the `catalogCuis` Set; (2) `buildAdverseEventsByIngredient`; (3) for each cui with effects, for each of its atc_codes, push `{ atc_code, adverse_events, last_etl_refresh }`; (4) chunked upsert onConflict `atc_code` (ETL_CHUNK env, default 200). Only existing atc rows are targeted, so the UPDATE path runs (no NOT NULL violations) and only `adverse_events` + timestamp are touched.

- [ ] **Step 1: Failing test** `__tests__/run-onsides.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runOnsidesEtl } from '../run-onsides.js'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'onsides')

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert, from }
}

describe('runOnsidesEtl', () => {
  it('writes adverse_events to all atc rows sharing the ingredient cui', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [
      { atc_code: 'B01AC06', rxnorm_cui: '1191' }, // aspirin
      { atc_code: 'N02BA01', rxnorm_cui: '1191' }, // aspirin, 2nd ATC
      { atc_code: 'Z99ZZ99', rxnorm_cui: '999999' }, // no OnSIDES match
    ]
    const res = await runOnsidesEtl(DIR, { supabase: client, catalogRows })
    expect(res.ingredientsWithEffects).toBe(1)
    expect(res.rowsUpdated).toBe(2) // both aspirin ATCs
    const rows = upsert.mock.calls.flatMap((c) => c[0] as Array<{ atc_code: string; adverse_events: unknown[] }>)
    expect(rows.map((r) => r.atc_code).sort()).toEqual(['B01AC06', 'N02BA01'])
    expect(rows[0].adverse_events).toEqual(expect.arrayContaining([
      expect.objectContaining({ effect: 'Anaphylaxis', severity: 'severe' }),
    ]))
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ onConflict: 'atc_code' }))
  })
  it('upsert payload has only atc_code, adverse_events, last_etl_refresh', async () => {
    const { client, upsert } = makeSupabase()
    await runOnsidesEtl(DIR, { supabase: client, catalogRows: [{ atc_code: 'B01AC06', rxnorm_cui: '1191' }] })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(Object.keys(row).sort()).toEqual(['adverse_events', 'atc_code', 'last_etl_refresh'])
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `run-onsides.ts`
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadOnsidesLookups, buildAdverseEventsByIngredient, type AdverseEvent } from './sources/onsides.js'

const CHUNK = Number(process.env.ETL_CHUNK ?? 200)
const ONSIDES_DIR = process.env.ONSIDES_DIR ?? 'docs/datasets/onsides-v3.1.1/csv'

interface CatalogRow { atc_code: string; rxnorm_cui: string }
interface Deps { supabase?: SupabaseClient; catalogRows?: CatalogRow[] }

async function fetchCatalogRows(supabase: SupabaseClient): Promise<CatalogRow[]> {
  const { data, error } = await supabase.from('drug_catalog').select('atc_code, rxnorm_cui').not('rxnorm_cui', 'is', null)
  if (error) throw new Error(`fetch failed: ${error.message}`)
  return (data ?? []) as CatalogRow[]
}

export async function runOnsidesEtl(dir: string, deps: Deps = {}): Promise<{ ingredientsWithEffects: number; rowsUpdated: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const catalogRows = deps.catalogRows ?? await fetchCatalogRows(supabase)

  const cuiToAtc = new Map<string, string[]>()
  const cuis = new Set<string>()
  for (const r of catalogRows) {
    if (!r.rxnorm_cui) continue
    cuis.add(r.rxnorm_cui)
    const a = cuiToAtc.get(r.rxnorm_cui); if (a) a.push(r.atc_code); else cuiToAtc.set(r.rxnorm_cui, [r.atc_code])
  }

  const lookups = await loadOnsidesLookups(dir)
  const byIng = await buildAdverseEventsByIngredient(dir, lookups, cuis)

  const now = new Date().toISOString()
  const updates: Array<{ atc_code: string; adverse_events: AdverseEvent[]; last_etl_refresh: string }> = []
  for (const [cui, evs] of byIng) {
    for (const atc of cuiToAtc.get(cui) ?? []) updates.push({ atc_code: atc, adverse_events: evs, last_etl_refresh: now })
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
```

- [ ] **Step 4: Run tests, verify PASS** (2 tests), then full suite.

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/run-onsides.ts scripts/etl/drug-catalog/__tests__/run-onsides.test.ts scripts/etl/drug-catalog/package.json
git commit -m "feat(etl): OnSIDES runner — write adverse_events to catalog by rxnorm_cui"
```

---

### Task 4: Live OnSIDES run + verify (controller-run)

- [ ] **Step 1:** With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env, run `ONSIDES_DIR=<abs path> pnpm -F @ultranos/drug-catalog-etl run-onsides`. (Note: also raise `ETL_CHUNK` down if a statement timeout occurs.)
- [ ] **Step 2:** Verify via Supabase MCP: `SELECT count(*) FILTER (WHERE adverse_events <> '[]') AS has_ae, max(jsonb_array_length(adverse_events)) AS max_ae FROM drug_catalog;` and spot-check aspirin: `SELECT adverse_events->0 FROM drug_catalog WHERE atc_code='B01AC06';`
- [ ] **Step 3:** Confirm cap ≤ 50 and severity values are mild/moderate/severe.

---

## Self-Review

**Spec coverage:** severity mapping (T1) · vocab join + stream + dedupe + cap (T2) · runner writes by rxnorm_cui to all shared-ATC rows, payload limited to `adverse_events` (T3) · live run (T4). Confidence threshold `pred1 > 3.258`, frequency `unknown`, cap 50 severity-first — all per Global Constraints.

**Placeholder scan:** none. `match_method`/`pred0`/`effect_id` columns are intentionally unused.

**Type consistency:** `AdverseEvent { effect, frequency:'unknown', severity }` matches shared-types `AdverseEvent` (frequency union includes `'unknown'`; severity union is mild|moderate|severe). The runner upsert shape is `{ atc_code, adverse_events, last_etl_refresh }` only.

## Execution Handoff

Plan complete. Two options: **(1) Subagent-Driven (recommended)** or **(2) Inline Execution**.
