# Pharmopedia Localization Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Machine-translate the patient Tier-1 drug prose into Arabic/Dari/Pashto via Gemini and display it under an "unverified machine translation" disclaimer (honoring CLAUDE.md rule #2).

**Architecture:** Add `ar` to the localized-text model + a `translation_status` column. A Hub-side, idempotent translation ETL calls Gemini to fill missing `ar/prs/ps` on the patient prose fields and marks them `machine`. The Hub API passes `translationStatus` through; Pharmopedia shows a page-level banner when a non-English user views machine-translated content. Implements [`2026-06-19-pharmopedia-localization-phase1-design.md`](../specs/2026-06-19-pharmopedia-localization-phase1-design.md).

**Tech Stack:** TypeScript, `@ultranos/drug-catalog-etl` (tsx + Vitest), Gemini `generateContent`, Supabase, Expo/React Native, shared-types.

## Global Constraints

- **Gemini:** model `gemini-2.0-flash`, `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=<GEMINI_API_KEY>`, body `{ contents:[{parts:[{text}]}], generationConfig:{ responseMimeType:"application/json" } }`, result at `candidates[0].content.parts[0].text` (a JSON string). `GEMINI_API_KEY` is in the repo `.env`.
- **Languages:** `ar`, `prs`, `ps`. **Target fields (patient Tier-1):** `summary_plain`/`summaryPlain`, `used_for`/`usedFor` (array), `warnings_summary_plain`/`warningsSummaryPlain`, `when_to_seek_help`/`whenToSeekHelp`, `storage_instructions`/`storageInstructions`.
- **Idempotent:** only translate a field/lang that is **missing**; never re-translate or overwrite an existing value (so a future `confirmed` value is never clobbered).
- **`translation_status`** JSONB shape: `{ "<entityFieldKey>": { "ar":"machine","prs":"machine","ps":"machine" } }` (camelCase keys). Phase 1 only writes `"machine"`.
- **Upsert** writes only `{ atc_code, inn_name, <changed target columns>, translation_status, last_etl_refresh }` (onConflict `atc_code`; `inn_name` for the NOT-NULL ON CONFLICT candidate). Never touches other columns.
- **Git (CLAUDE.md):** no `git add`/`commit` without explicit instruction — "Commit" steps are checkpoints.
- Content is machine-translated → the **always-on disclaimer** is the rule-#2 safeguard; the confirm workflow is Phase 2 (not in this plan).

---

### Task 1: shared-types — `ar` on DrugLocalizedText + `translationStatus` on Tier-1

**Files:**
- Modify: `packages/shared-types/src/fhir/drug-catalog.ts`

**Interfaces:**
- Produces: `DrugLocalizedText { en?; ar?; prs?; ps? }`; `DrugEntryTier1.translationStatus?: Record<string, Record<string, string>>`.

- [ ] **Step 1: Add `ar`** — in `DrugLocalizedText` (line 3), add `ar?: string` after `en?`:
```typescript
export interface DrugLocalizedText {
  en?: string
  ar?: string   // Arabic
  prs?: string  // Dari Persian
  ps?: string   // Pashto
}
```

- [ ] **Step 2: Add `translationStatus` to Tier-1** — in `DrugEntryTier1`, add before `version`:
```typescript
  /** Per-field, per-lang machine|confirmed status for displayed translations. Field keys are entity field names (e.g. "summaryPlain"). */
  translationStatus?: Record<string, Record<string, string>>
```

- [ ] **Step 3: Build** — `pnpm -F @ultranos/shared-types build` (tsc emits dist; the pre-existing `service-request.schema.test.ts` error is unrelated).

- [ ] **Step 4: Commit** *(checkpoint)*
```bash
git add packages/shared-types/src/fhir/drug-catalog.ts
git commit -m "feat(shared-types): add ar to DrugLocalizedText + translationStatus to Tier-1"
```

---

### Task 2: DB migration — `translation_status` column (controller-run)

**Files:**
- Create: `supabase/migrations/038_drug_catalog_translation_status.sql`

- [ ] **Step 1: Write the migration**
```sql
-- 038: per-field/per-lang machine|confirmed status for displayed translations.
ALTER TABLE drug_catalog ADD COLUMN IF NOT EXISTS translation_status JSONB NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Apply via Supabase MCP** — `apply_migration` name `drug_catalog_translation_status`, query = the SQL above.

- [ ] **Step 3: Verify** — `execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='drug_catalog' AND column_name='translation_status';
```
Expected: one row, `translation_status | jsonb`.

- [ ] **Step 4: Commit** *(checkpoint)*
```bash
git add supabase/migrations/038_drug_catalog_translation_status.sql
git commit -m "feat(db): add drug_catalog.translation_status"
```

---

### Task 3: ETL — Gemini translator

**Files:**
- Create: `scripts/etl/drug-catalog/sources/translator.ts`
- Create: `scripts/etl/drug-catalog/__tests__/translator.test.ts`

**Interfaces:**
- Produces: `translate(text: string, fetchImpl?: typeof fetch, apiKey?: string): Promise<{ ar?: string; prs?: string; ps?: string } | null>` (null on error/empty).

- [ ] **Step 1: Failing test** `__tests__/translator.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import { translate } from '../sources/translator.js'

function geminiResponse(obj: unknown) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) } as Response
}

describe('translate', () => {
  it('returns ar/prs/ps from the Gemini JSON response', async () => {
    const f = vi.fn().mockResolvedValue(geminiResponse({ ar: 'أسبرين', prs: 'اسپرین', ps: 'اسپرين' }))
    const r = await translate('Aspirin reduces fever.', f as unknown as typeof fetch, 'KEY')
    expect(r).toEqual({ ar: 'أسبرين', prs: 'اسپرین', ps: 'اسپرين' })
    const calledUrl = (f.mock.calls[0][0] as string)
    expect(calledUrl).toContain('gemini-2.0-flash:generateContent')
    expect(calledUrl).toContain('key=KEY')
  })
  it('returns null on HTTP error, throw, or unparseable body', async () => {
    expect(await translate('x', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response) as unknown as typeof fetch, 'K')).toBeNull()
    expect(await translate('x', vi.fn().mockRejectedValue(new Error('net')) as unknown as typeof fetch, 'K')).toBeNull()
    const bad = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) } as Response)
    expect(await translate('x', bad as unknown as typeof fetch, 'K')).toBeNull()
  })
  it('returns null for empty input', async () => {
    expect(await translate('   ', vi.fn() as unknown as typeof fetch, 'K')).toBeNull()
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `sources/translator.ts`
```typescript
const MODEL = 'gemini-2.0-flash'

export async function translate(
  text: string,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | undefined = process.env.GEMINI_API_KEY,
): Promise<{ ar?: string; prs?: string; ps?: string } | null> {
  const trimmed = text?.trim()
  if (!trimmed || !apiKey) return null
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
  const prompt =
    'Translate the following English drug-information text for patients into Modern Standard Arabic, Dari (Farsi), and Pashto. ' +
    'Preserve medical accuracy; translate the text only, no notes. ' +
    'Return a JSON object with exactly these keys: "ar" (Arabic), "prs" (Dari), "ps" (Pashto). ' +
    `Text:\n${trimmed}`
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) return null
    const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ar?: string; prs?: string; ps?: string }
    const out: { ar?: string; prs?: string; ps?: string } = {}
    if (parsed.ar?.trim()) out.ar = parsed.ar.trim()
    if (parsed.prs?.trim()) out.prs = parsed.prs.trim()
    if (parsed.ps?.trim()) out.ps = parsed.ps.trim()
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests, verify PASS** (3 tests), then full suite.

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/sources/translator.ts scripts/etl/drug-catalog/__tests__/translator.test.ts
git commit -m "feat(etl): Gemini translator (en -> ar/prs/ps)"
```

---

### Task 4: ETL — translation runner (idempotent)

**Files:**
- Create: `scripts/etl/drug-catalog/run-translate.ts`
- Create: `scripts/etl/drug-catalog/__tests__/run-translate.test.ts`
- Modify: `scripts/etl/drug-catalog/package.json` (add `"run-translate": "tsx run-translate.ts"`)

**Interfaces:**
- Consumes: `translate` (Task 3).
- Produces: `runTranslateEtl(deps): Promise<{ scanned: number; translated: number; rowsUpdated: number; upserts: number }>` with injectable `supabase`, `catalogRows`, and `translateImpl`.

The runner: fetch rows (atc_code, inn_name, the 5 target columns, translation_status), paginated; for each row build work items for each target field that has `en` and is missing ≥1 of ar/prs/ps; translate each work item once (bounded concurrency `TRANSLATE_CONCURRENCY`, default 4); merge new langs into the field JSONB + set `translation_status[entityKey][lang]='machine'`; chunked upsert of only the changed columns. Single fields are `DrugLocalizedText`; `used_for` is an array of them (translate each element; status key `usedFor`).

- [ ] **Step 1: Failing test** `__tests__/run-translate.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runTranslateEtl } from '../run-translate.js'

function makeSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ upsert })
  return { client: { from } as unknown as SupabaseClient, upsert }
}

describe('runTranslateEtl', () => {
  it('translates only missing langs and marks them machine', async () => {
    const { client, upsert } = makeSupabase()
    const catalogRows = [{
      atc_code: 'J01XD01', inn_name: 'Metronidazole',
      summary_plain: { en: 'Treats infections.', prs: 'موجود' },   // prs already present -> only ar+ps
      used_for: [], warnings_summary_plain: {}, when_to_seek_help: {}, storage_instructions: {},
      translation_status: {},
    }]
    const translateImpl = vi.fn(async () => ({ ar: 'AR', prs: 'PRS', ps: 'PS' }))
    const res = await runTranslateEtl({ supabase: client, catalogRows, translateImpl })
    expect(res.rowsUpdated).toBe(1)
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(row.summary_plain).toEqual({ en: 'Treats infections.', prs: 'موجود', ar: 'AR', ps: 'PS' }) // prs untouched
    expect(row.translation_status).toEqual({ summaryPlain: { ar: 'machine', ps: 'machine' } })
    expect(Object.keys(row).sort()).toEqual(['atc_code', 'inn_name', 'last_etl_refresh', 'summary_plain', 'translation_status'])
  })
  it('skips a row whose target fields are fully translated or empty', async () => {
    const { client } = makeSupabase()
    const translateImpl = vi.fn(async () => ({ ar: 'AR', prs: 'PRS', ps: 'PS' }))
    const res = await runTranslateEtl({ supabase: client, translateImpl, catalogRows: [
      { atc_code: 'X', inn_name: 'X', summary_plain: {}, used_for: [], warnings_summary_plain: {}, when_to_seek_help: {}, storage_instructions: {}, translation_status: {} },
      { atc_code: 'Y', inn_name: 'Y', summary_plain: { en: 'a', ar: 'a', prs: 'a', ps: 'a' }, used_for: [], warnings_summary_plain: {}, when_to_seek_help: {}, storage_instructions: {}, translation_status: {} },
    ] })
    expect(res.rowsUpdated).toBe(0)
    expect(translateImpl).not.toHaveBeenCalled()
  })
  it('translates each used_for array element and marks usedFor machine', async () => {
    const { client, upsert } = makeSupabase()
    const translateImpl = vi.fn(async () => ({ ar: 'AR', prs: 'PRS', ps: 'PS' }))
    await runTranslateEtl({ supabase: client, translateImpl, catalogRows: [
      { atc_code: 'Z', inn_name: 'Z', summary_plain: {}, used_for: [{ en: 'fever' }], warnings_summary_plain: {}, when_to_seek_help: {}, storage_instructions: {}, translation_status: {} },
    ] })
    const row = (upsert.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect((row.used_for as Array<Record<string,string>>)[0]).toEqual({ en: 'fever', ar: 'AR', prs: 'PRS', ps: 'PS' })
    expect(row.translation_status).toEqual({ usedFor: { ar: 'machine', prs: 'machine', ps: 'machine' } })
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** `run-translate.ts`
```typescript
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

// One unit of translation work: a single DrugLocalizedText needing langs.
interface Work { rowIdx: number; col: string; key: string; dlt: DLT; missing: Lang[]; isArray: boolean; arrIdx?: number }

export async function runTranslateEtl(deps: Deps = {}): Promise<{ scanned: number; translated: number; rowsUpdated: number; upserts: number }> {
  const supabase = deps.supabase ?? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const translateImpl = deps.translateImpl ?? ((text: string) => translate(text))
  const rows = deps.catalogRows ?? await fetchCatalogRows(supabase)

  const work: Work[] = []
  rows.forEach((row, rowIdx) => {
    for (const f of SINGLE) {
      const dlt = (row as unknown as Record<string, DLT>)[f.col] ?? {}
      const miss = missingLangs(dlt)
      if (miss.length) work.push({ rowIdx, col: f.col, key: f.key, dlt, missing: miss, isArray: false })
    }
    ;(row.used_for ?? []).forEach((dlt, arrIdx) => {
      const miss = missingLangs(dlt)
      if (miss.length) work.push({ rowIdx, col: 'used_for', key: 'usedFor', dlt, missing: miss, isArray: true, arrIdx })
    })
  })

  let translated = 0
  await mapWithConcurrency(work, CONCURRENCY, async (w) => {
    const got = await translateImpl(w.dlt.en as string)
    if (!got) return
    let any = false
    for (const l of w.missing) {
      if (got[l]) { w.dlt[l] = got[l]; any = true }
    }
    if (any) translated++
    ;(w as Work & { _wrote?: boolean })._wrote = any
  })

  // Assemble per-row updates + translation_status
  const now = new Date().toISOString()
  const changedCols = new Map<number, Set<string>>()
  const statusByRow = new Map<number, Record<string, Record<string, string>>>()
  for (const w of work) {
    if (!(w as Work & { _wrote?: boolean })._wrote) continue
    if (!changedCols.has(w.rowIdx)) changedCols.set(w.rowIdx, new Set())
    changedCols.get(w.rowIdx)!.add(w.col)
    if (!statusByRow.has(w.rowIdx)) statusByRow.set(w.rowIdx, structuredClone(rows[w.rowIdx].translation_status ?? {}))
    const st = statusByRow.get(w.rowIdx)!
    st[w.key] = st[w.key] ?? {}
    for (const l of w.missing) { if (w.dlt[l]) st[w.key][l] = 'machine' }
  }

  const updates: Array<Record<string, unknown>> = []
  for (const [rowIdx, cols] of changedCols) {
    const row = rows[rowIdx]
    const u: Record<string, unknown> = { atc_code: row.atc_code, inn_name: row.inn_name, translation_status: statusByRow.get(rowIdx), last_etl_refresh: now }
    for (const col of cols) u[col] = (row as unknown as Record<string, unknown>)[col]
    updates.push(u)
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
```

- [ ] **Step 4: Run tests, verify PASS** (3 tests), then full suite.

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add scripts/etl/drug-catalog/run-translate.ts scripts/etl/drug-catalog/__tests__/run-translate.test.ts scripts/etl/drug-catalog/package.json
git commit -m "feat(etl): idempotent translation runner (patient prose -> ar/prs/ps)"
```

---

### Task 5: hub-api — pass `translationStatus` through + protect the column

**Files:**
- Modify: `apps/hub-api/src/services/drug-catalog.service.ts`

**Interfaces:**
- Consumes: `row.translation_status`. Produces: `DrugEntryTier1.translationStatus`.

- [ ] **Step 1: Map the field** — in `scopeEntryToTier`'s `tier1` object (next to `localNames`), add:
```typescript
    translationStatus: (row.translation_status ?? {}) as Record<string, Record<string, string>>,
```

- [ ] **Step 2: Protect the column** — add `'translation_status'` to the `ETL_PROTECTED_FIELDS` set.

- [ ] **Step 3: Build + test** — `pnpm -F @ultranos/shared-types build` then `pnpm -F hub-api test -- src/__tests__/drug-catalog-service.test.ts` (existing scoping tests still pass; the FULL_ROW fixture may need `translation_status: {}` added — add it if the test references exhaustive keys).

- [ ] **Step 4: Commit** *(checkpoint)*
```bash
git add apps/hub-api/src/services/drug-catalog.service.ts
git commit -m "feat(hub-api): expose translationStatus on Tier-1 entity"
```

---

### Task 6: Pharmopedia — `hasMachineTranslatedContent` helper

**Files:**
- Modify: `apps/pharmopedia/src/lib/localized-text.ts`
- Create: `apps/pharmopedia/src/__tests__/has-machine-translation.test.ts`

**Interfaces:**
- Produces: `hasMachineTranslatedContent(status: Record<string, Record<string, string>> | undefined, lang: string): boolean`.

- [ ] **Step 1: Failing test** `__tests__/has-machine-translation.test.ts`
```typescript
import { describe, it, expect } from 'vitest'
import { hasMachineTranslatedContent } from '@/lib/localized-text'

describe('hasMachineTranslatedContent', () => {
  it('true when a field is machine-translated for the language', () => {
    expect(hasMachineTranslatedContent({ summaryPlain: { prs: 'machine' } }, 'prs')).toBe(true)
  })
  it('false for English, missing status, or confirmed-only', () => {
    expect(hasMachineTranslatedContent({ summaryPlain: { prs: 'machine' } }, 'en')).toBe(false)
    expect(hasMachineTranslatedContent(undefined, 'prs')).toBe(false)
    expect(hasMachineTranslatedContent({}, 'prs')).toBe(false)
    expect(hasMachineTranslatedContent({ summaryPlain: { prs: 'confirmed' } }, 'prs')).toBe(false)
    expect(hasMachineTranslatedContent({ summaryPlain: { ar: 'machine' } }, 'prs')).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** — append to `localized-text.ts`:
```typescript
/** True if any field carries a `machine` translation for the requested language (drives the unverified-translation banner). */
export function hasMachineTranslatedContent(
  status: Record<string, Record<string, string>> | undefined,
  lang: string,
): boolean {
  if (!status || lang === 'en') return false
  return Object.values(status).some((byLang) => byLang?.[lang] === 'machine')
}
```

- [ ] **Step 4: Run tests, verify PASS**, then `pnpm -F @ultranos/pharmopedia test src/__tests__/has-machine-translation.test.ts`.

- [ ] **Step 5: Commit** *(checkpoint)*
```bash
git add apps/pharmopedia/src/lib/localized-text.ts apps/pharmopedia/src/__tests__/has-machine-translation.test.ts
git commit -m "feat(pharmopedia): hasMachineTranslatedContent helper"
```

---

### Task 7: Pharmopedia — unverified-translation banner + i18n

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`, `ar.ts`, `prs.ts`, `ps.ts`
- Create: `apps/pharmopedia/src/__tests__/machine-translation-banner.test.tsx`

**Interfaces:**
- Consumes: `hasMachineTranslatedContent` (Task 6), `entry.translationStatus`.

- [ ] **Step 1: Add the i18n key** — in each locale's `drug` object add `machineTranslatedNotice`:
  - en: `machineTranslatedNotice: 'Some information here was machine-translated and has not been verified by a clinician.'`
  - ar: `machineTranslatedNotice: 'تُرجمت بعض المعلومات هنا آليًا ولم يتم التحقق منها من قبل طبيب.'`
  - prs: `machineTranslatedNotice: 'برخی از معلومات اینجا به‌صورت ماشینی ترجمه شده و توسط داکتر تأیید نشده است.'`
  - ps: `machineTranslatedNotice: 'ځینې معلومات دلته په ماشيني ډول ژباړل شوي او د ډاکټر لخوا نه دي تصدیق شوي.'`

- [ ] **Step 2: Failing test** `__tests__/machine-translation-banner.test.tsx`
  Test the small banner component (extract a `MachineTranslationBanner` inline component in the screen, or test the visibility predicate). Since the screen has heavy deps, test the predicate-driven visibility via `hasMachineTranslatedContent` + render the banner JSX in isolation:
```typescript
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { hasMachineTranslatedContent } from '@/lib/localized-text'
import { MachineTranslationBanner } from '@/components/DrugDetail/MachineTranslationBanner'

const t = (k: string) => (k === 'drug.machineTranslatedNotice' ? 'NOTICE' : k)

describe('MachineTranslationBanner', () => {
  it('shows when a non-English user has machine content', () => {
    const status = { summaryPlain: { prs: 'machine' } }
    expect(hasMachineTranslatedContent(status, 'prs')).toBe(true)
    const { getByText } = render(<MachineTranslationBanner t={t} />)
    expect(getByText('NOTICE')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Create the banner component** `apps/pharmopedia/src/components/DrugDetail/MachineTranslationBanner.tsx`
```typescript
import { View, Text, StyleSheet } from 'react-native'
import { Languages } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export function MachineTranslationBanner({ t }: { t: (k: string) => string }) {
  const colors = useThemeColors()
  return (
    <View testID="machine-translation-banner" style={[styles.banner, { backgroundColor: colors.warningLight }]}>
      <Languages size={16} color={colors.warning} />
      <Text style={[styles.text, { color: colors.warning }]}>{t('drug.machineTranslatedNotice')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], marginHorizontal: Spacing[4], marginTop: Spacing[2], padding: Spacing[3], borderRadius: Radius.md },
  text: { flex: 1, fontSize: FontSize.xs, fontFamily: FontFamily.sans },
})
```

- [ ] **Step 4: Render it in the screen** — in `apps/pharmopedia/app/drug/[atcCode].tsx`, import `hasMachineTranslatedContent` and `MachineTranslationBanner`, and render the banner immediately BEFORE `<SafetyZone … />` (line ~135):
```tsx
        {lang !== 'en' && hasMachineTranslatedContent((entry as DrugEntryTier1).translationStatus, lang) ? (
          <MachineTranslationBanner t={t} />
        ) : null}
        <SafetyZone entry={entry} lang={lang} isClinical={isClinical} />
```
(`t` from the existing `useTranslation`; `lang` already in scope.)

- [ ] **Step 5: Run tests, verify PASS**, then full pharmopedia suite + `pnpm -F @ultranos/pharmopedia typecheck`.

- [ ] **Step 6: Commit** *(checkpoint)*
```bash
git add apps/pharmopedia/app/drug/[atcCode].tsx apps/pharmopedia/src/components/DrugDetail/MachineTranslationBanner.tsx apps/pharmopedia/src/i18n/locales/en.ts apps/pharmopedia/src/i18n/locales/ar.ts apps/pharmopedia/src/i18n/locales/prs.ts apps/pharmopedia/src/i18n/locales/ps.ts apps/pharmopedia/src/__tests__/machine-translation-banner.test.tsx
git commit -m "feat(pharmopedia): unverified machine-translation banner on drug detail"
```

---

### Task 8: Live translation run + verify (controller-run)

- [ ] **Step 1:** With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `GEMINI_API_KEY` in env, run `pnpm -F @ultranos/drug-catalog-etl run-translate`. (Online Gemini calls; bounded concurrency; minutes. Idempotent — safe to re-run.)
- [ ] **Step 2:** Verify via Supabase MCP: `SELECT count(*) FILTER (WHERE summary_plain ? 'prs') AS prs, count(*) FILTER (WHERE summary_plain ? 'ar') AS ar, count(*) FILTER (WHERE translation_status <> '{}') AS has_status FROM drug_catalog;` and spot-check one: `SELECT summary_plain->>'prs', translation_status FROM drug_catalog WHERE atc_code='J01XD01';`
- [ ] **Step 3:** Confirm the prs/ar/ps values are non-empty translations and `translation_status` marks them `machine`.

---

## Self-Review

**Spec coverage:** §2 data model → Tasks 1, 2 (DrugLocalizedText +ar, translation_status). §3 ETL → Tasks 3, 4 (translator, idempotent runner). §4 hub-api → Task 5 (translationStatus + protected). §5 display → Tasks 6, 7 (helper + page-level banner + i18n). §6 testing → in each task. §8 idempotency → Task 4 tests. Live run → Task 8.

**Placeholder scan:** none. The per-field `resolveLocalized.machineTranslated` from spec §5 is realized at page granularity via `hasMachineTranslatedContent` (the gate's intent — show the disclaimer when machine content is displayed — is met); per-field badges are the Phase-2 refinement noted in the spec, not a gap.

**Type consistency:** `DrugLocalizedText {en,ar,prs,ps}` and `translationStatus: Record<string,Record<string,string>>` are consistent across shared-types (T1), hub-api map (T5), the helper (T6), and the runner's `translation_status` shape (T4). Status keys are camelCase entity field names (`summaryPlain`, `usedFor`, …) everywhere.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-pharmopedia-localization-phase1.md`. Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — batched with checkpoints.
