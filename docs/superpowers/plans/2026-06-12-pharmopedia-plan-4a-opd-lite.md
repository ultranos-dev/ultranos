# Pharmopedia Plan 4a — OPD-Lite Drug Catalog Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire OPD-Lite prescription entry to the Hub drug catalog: switch medication search to the Hub API (with offline Dexie fallback), add a Pharmopedia deep link on selected drugs, and let clinicians submit local-name enrichments directly from the prescription form.

**Architecture:** Three additive changes to OPD-Lite, each in isolation. (1) Two new functions in `trpc.ts` call the existing `drugCatalog.search` and `drugCatalog.enrich` tRPC procedures. (2) `medication-search.ts` switches to Hub search when online, falling back to local Dexie + Fuse when offline or on Hub failure. (3) `PrescriptionEntry` gains a deep link button and an optional inline "Add local name" form.

**Tech Stack:** Vitest, @testing-library/react (jsdom), Next.js 15, Supabase browser client for auth tokens.

**Spec:** `docs/superpowers/specs/2026-06-12-pharmopedia-design.md` §8 (OPD-Lite changes)
**Requires:** Hub `drugCatalog` router present in `apps/hub-api/src/trpc/routers/_app.ts` — already deployed.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/opd-lite/src/lib/trpc.ts` | Modify | Add `searchDrugCatalog()` and `enrichDrug()` |
| `apps/opd-lite/src/lib/medication-search.ts` | Modify | Hybrid: Hub API when online, local Dexie fallback |
| `apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx` | Modify | Deep link + inline enrich form |
| `apps/opd-lite/src/__tests__/trpc-drug-catalog.test.ts` | Create | Unit tests for the two new trpc functions |
| `apps/opd-lite/src/__tests__/medication-search.test.ts` | Modify | Add hybrid-search tests |
| `apps/opd-lite/src/__tests__/prescription-entry.test.tsx` | Create | Component tests for deep link + enrich UI |

---

## Task 1: Hub API functions — `searchDrugCatalog` and `enrichDrug`

**Context:** `apps/opd-lite/src/lib/trpc.ts` already holds Hub API helpers (`searchPatientsOnHub`, etc.). All Hub calls follow the same pattern: GET queries pass `?input={"json":{…}}`, POST mutations send `body: JSON.stringify({json:{…}})`. The drug catalog router key is `drugCatalog` (camelCase) — endpoints are `drugCatalog.search` and `drugCatalog.enrich`. Auth token comes from `getSupabaseBrowserClient().auth.getSession()`.

`DrugSearchResult` is from `@ultranos/shared-types`:
```typescript
interface DrugSearchResult {
  atcCode: string
  innName: string
  brandNames: string[]
  therapeuticClass: string
  doseForms: string[]
  localName?: string
}
```

**Files:**
- Modify: `apps/opd-lite/src/lib/trpc.ts`
- Create: `apps/opd-lite/src/__tests__/trpc-drug-catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/opd-lite/src/__tests__/trpc-drug-catalog.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must mock supabase BEFORE importing trpc (module-level side effects)
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { searchDrugCatalog, enrichDrug } = await import('@/lib/trpc')

const MOCK_DRUG: import('@ultranos/shared-types').DrugSearchResult = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: ['Amoxil'],
  therapeuticClass: 'Antibacterials',
  doseForms: ['Capsule 500mg'],
  localName: undefined,
}

function mockSearchResponse(results: unknown[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ result: { data: { json: results } } }),
  })
}

describe('searchDrugCatalog', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('calls drugCatalog.search with correct URL and input', async () => {
    mockSearchResponse([MOCK_DRUG])
    const results = await searchDrugCatalog('amox')
    expect(results).toHaveLength(1)
    expect(results[0].atcCode).toBe('J01CA04')
    const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('drugCatalog.search')
    const inputParam = JSON.parse(new URL(calledUrl).searchParams.get('input')!)
    expect(inputParam.json.q).toBe('amox')
    expect(inputParam.json.lang).toBe('en')
  })

  it('passes lang and limit params', async () => {
    mockSearchResponse([])
    await searchDrugCatalog('para', 'prs', undefined)
    const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit]
    const inputParam = JSON.parse(new URL(calledUrl).searchParams.get('input')!)
    expect(inputParam.json.lang).toBe('prs')
    expect(inputParam.json.limit).toBe(20)
  })

  it('includes Authorization header when session exists', async () => {
    mockSearchResponse([])
    await searchDrugCatalog('amox')
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(searchDrugCatalog('amox')).rejects.toThrow('503')
  })
})

describe('enrichDrug', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('POSTs to drugCatalog.enrich with correct body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await enrichDrug('J01CA04', { localNames: { prs: 'آموکسیسیلین', en: 'Amoxicillin (local)' } })
    const [calledUrl, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('drugCatalog.enrich')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body.json.atcCode).toBe('J01CA04')
    expect(body.json.fields.localNames.prs).toBe('آموکسیسیلین')
  })

  it('does nothing (no throw) when session is missing', async () => {
    // Override supabase mock for this test to return null session
    vi.doMock('@/lib/supabase', () => ({
      getSupabaseBrowserClient: () => ({
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        },
      }),
    }))
    await expect(enrichDrug('J01CA04', { localNames: { en: 'test' } })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/opd-lite
pnpm test src/__tests__/trpc-drug-catalog.test.ts
```

Expected: FAIL — `searchDrugCatalog is not a function` (or similar import error)

- [ ] **Step 3: Add `searchDrugCatalog` and `enrichDrug` to trpc.ts**

Open `apps/opd-lite/src/lib/trpc.ts` and add at the end of the file (after all existing exports):

```typescript
import type { DrugSearchResult } from '@ultranos/shared-types'

export type EnrichDrugFields = {
  localNames?: Record<string, string>
  dispensingNotes?: string
  formularyStatus?: 'on_formulary' | 'off_formulary' | 'restricted'
  unitCost?: number
}

/**
 * Search the Hub drug catalog by INN name, ATC code, brand name, or local name.
 * Returns identity fields only (no tier content).
 */
export async function searchDrugCatalog(
  q: string,
  lang: 'en' | 'prs' | 'ps' = 'en',
  signal?: AbortSignal,
): Promise<DrugSearchResult[]> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/drugCatalog.search'
  url.searchParams.set('input', JSON.stringify({ json: { q, lang, limit: 20 } }))

  const headers: Record<string, string> = {}
  if (typeof window !== 'undefined') {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data } = await getSupabaseBrowserClient().auth.getSession()
    if (data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
    }
  }

  const res = await fetch(url.toString(), { method: 'GET', headers, signal })
  if (!res.ok) throw new Error(`Drug catalog search failed: ${res.status}`)
  const body = await res.json() as { result: { data: { json: DrugSearchResult[] } } }
  return body.result.data.json
}

/**
 * Write local-name enrichment to the Hub drug catalog.
 * Clinician tier: localNames only. Pharmacist tier: all fields.
 * Best-effort: never throws on network failure — caller handles UI state.
 */
export async function enrichDrug(
  atcCode: string,
  fields: EnrichDrugFields,
): Promise<void> {
  if (typeof window === 'undefined') return
  const { getSupabaseBrowserClient } = await import('@/lib/supabase')
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
  if (!session?.access_token) return

  await fetch(`${getHubApiUrl()}/drugCatalog.enrich`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ json: { atcCode, fields } }),
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test src/__tests__/trpc-drug-catalog.test.ts
```

Expected: PASS — all `searchDrugCatalog` and `enrichDrug` tests green

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/lib/trpc.ts apps/opd-lite/src/__tests__/trpc-drug-catalog.test.ts
git commit -m "feat(opd-lite): add searchDrugCatalog and enrichDrug API functions"
```

---

## Task 2: Hybrid medication search (Hub when online, Dexie fallback)

**Context:** `searchMedications(query)` in `medication-search.ts` currently always searches Dexie. The update makes it call `searchDrugCatalog` when `navigator.onLine` is true, mapping `DrugSearchResult` → `MedicationSearchResult`. On network failure or when offline, it falls back to the existing Dexie+Fuse logic (extracted into `searchLocal`). The existing test file seeds Dexie and tests the local path — those tests continue to pass unchanged; we add new tests for the online path.

**`DrugSearchResult` → `MedicationItem` mapping:**
- `atcCode` → `item.code`
- `localName ?? innName` → `item.display`
- `doseForms[0] ?? ''` → `item.form`
- `''` → `item.strength` (not in search results — acceptable; shown as blank in dropdown)
- `matches: undefined` (no fuzzy indices from Hub results — no text highlighting)

**Files:**
- Modify: `apps/opd-lite/src/lib/medication-search.ts`
- Modify: `apps/opd-lite/src/__tests__/medication-search.test.ts`

- [ ] **Step 1: Add online-path tests to medication-search.test.ts**

Open `apps/opd-lite/src/__tests__/medication-search.test.ts` and add a new `describe` block after the existing ones:

```typescript
// Add these imports at the top (after existing imports):
import { vi } from 'vitest'

// Add these mocks before the existing describe block (module scope):
vi.mock('@/lib/trpc', () => ({
  searchDrugCatalog: vi.fn(),
}))

// At the END of the file, add:
import { searchDrugCatalog } from '@/lib/trpc'

describe('searchMedications — online (Hub API) path', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
    vi.mocked(searchDrugCatalog).mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses Hub results when online and Hub returns data', async () => {
    vi.mocked(searchDrugCatalog).mockResolvedValueOnce([
      {
        atcCode: 'J01CA04',
        innName: 'Amoxicillin',
        brandNames: ['Amoxil'],
        therapeuticClass: 'Antibacterials',
        doseForms: ['Capsule 500mg'],
        localName: undefined,
      },
    ])
    const results = await searchMedications('amox')
    expect(results).toHaveLength(1)
    expect(results[0].item.code).toBe('J01CA04')
    expect(results[0].item.display).toBe('Amoxicillin')
    expect(results[0].item.form).toBe('Capsule 500mg')
    expect(results[0].item.strength).toBe('')
    expect(results[0].matches).toBeUndefined()
  })

  it('uses localName as display when present', async () => {
    vi.mocked(searchDrugCatalog).mockResolvedValueOnce([
      {
        atcCode: 'N02BE01',
        innName: 'Paracetamol',
        brandNames: [],
        therapeuticClass: 'Analgesics',
        doseForms: ['Tablet'],
        localName: 'پاراستامول',
      },
    ])
    const results = await searchMedications('para')
    expect(results[0].item.display).toBe('پاراستامول')
  })

  it('falls back to local Dexie when Hub throws', async () => {
    vi.mocked(searchDrugCatalog).mockRejectedValueOnce(new Error('Network error'))
    const results = await searchMedications('Amoxicillin')
    // Local Dexie returns results (seeded in beforeAll)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].item.strength).toBeTruthy()  // local results have strength
  })

  it('falls back to local Dexie when offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    vi.mocked(searchDrugCatalog).mockResolvedValueOnce([])  // should not be called
    const results = await searchMedications('Amoxicillin')
    expect(searchDrugCatalog).not.toHaveBeenCalled()
    expect(results.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
pnpm test src/__tests__/medication-search.test.ts
```

Expected: FAIL — the new online-path tests fail because `searchMedications` always uses Dexie

- [ ] **Step 3: Rewrite medication-search.ts with hybrid logic**

Replace the full content of `apps/opd-lite/src/lib/medication-search.ts`:

```typescript
import Fuse, { type IFuseOptions, type FuseResultMatch } from 'fuse.js'
import { db } from './db'
import type { VocabMedicationEntry } from './db'
import { searchDrugCatalog } from './trpc'
import type { DrugSearchResult } from '@ultranos/shared-types'

export interface MedicationItem {
  code: string
  display: string
  form: string
  strength: string
}

const fuseOptions: IFuseOptions<MedicationItem> = {
  keys: [
    { name: 'display', weight: 0.5 },
    { name: 'form', weight: 0.2 },
    { name: 'strength', weight: 0.15 },
    { name: 'code', weight: 0.15 },
  ],
  threshold: 0.4,
  includeMatches: true,
  minMatchCharLength: 2,
}

export interface MedicationSearchResult {
  item: MedicationItem
  matches: readonly FuseResultMatch[] | undefined
}

function toMedicationItem(entry: VocabMedicationEntry): MedicationItem {
  return {
    code: entry.code,
    display: entry.display,
    form: entry.form,
    strength: entry.strength,
  }
}

function drugResultToMedicationItem(r: DrugSearchResult): MedicationItem {
  return {
    code: r.atcCode,
    display: r.localName ?? r.innName,
    form: r.doseForms[0] ?? '',
    strength: '',
  }
}

async function searchLocal(trimmed: string): Promise<MedicationSearchResult[]> {
  const prefixCandidates = await db.vocabularyMedications
    .where('display')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()

  let candidates: VocabMedicationEntry[]
  if (prefixCandidates.length < 10) {
    candidates = await db.vocabularyMedications.toArray()
  } else {
    candidates = prefixCandidates
  }

  const items = candidates.map(toMedicationItem)
  const fuse = new Fuse(items, fuseOptions)
  return fuse.search(trimmed, { limit: 20 }).map((r) => ({ item: r.item, matches: r.matches }))
}

/**
 * Hybrid search: Hub drug catalog API when online (ATC-keyed results),
 * falls back to local Dexie + Fuse when offline or on Hub failure.
 */
export async function searchMedications(
  query: string,
  signal?: AbortSignal,
): Promise<MedicationSearchResult[]> {
  if (!query || query.trim().length < 2) return []

  const trimmed = query.trim()

  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      const results = await searchDrugCatalog(trimmed, 'en', signal)
      return results.map((r) => ({ item: drugResultToMedicationItem(r), matches: undefined }))
    } catch {
      // Network failure or Hub unavailable — fall through to local search
    }
  }

  return searchLocal(trimmed)
}
```

- [ ] **Step 4: Run all medication-search tests**

```bash
pnpm test src/__tests__/medication-search.test.ts
```

Expected: PASS — all existing Dexie tests pass (they run with `navigator.onLine` undefined / falsy in the test environment, falling back to local), plus the new online-path tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/lib/medication-search.ts apps/opd-lite/src/__tests__/medication-search.test.ts
git commit -m "feat(opd-lite): hybrid drug search — Hub API when online, Dexie fallback"
```

---

## Task 3: PrescriptionEntry — Pharmopedia deep link + local name enrich form

**Context:** `PrescriptionEntry` is in `apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx`. It already has `hasMedication` (true when a drug is selected). The `form.medicationCode` now holds an ATC code for Hub-sourced results (e.g. `J01CA04`). Two additions:

1. **"Open in Pharmopedia"** — rendered whenever `hasMedication` is true. A simple anchor tag: `<a href="pharmopedia://drug/{form.medicationCode}">`. Silent no-op on devices without Pharmopedia installed.

2. **Enrich form** — rendered only when the new `canEnrich` prop is `true`. Shows two `<input>` fields (English name override, Dari name), a "Save name" button. Calls `enrichDrug(form.medicationCode, { localNames })`. On success: shows a brief "Saved" confirmation, clears the inputs. On error: shows "Failed to save local name". State is reset when `handleClearMedication` is called.

**Props added:** `canEnrich?: boolean` (default `false` — backward-compatible)

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx`
- Create: `apps/opd-lite/src/__tests__/prescription-entry.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/opd-lite/src/__tests__/prescription-entry.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PrescriptionEntry } from '@/components/clinical/PrescriptionEntry'

// Mock medication search to return an ATC-coded result
vi.mock('@/lib/medication-search', () => ({
  searchMedications: vi.fn().mockResolvedValue([
    {
      item: { code: 'J01CA04', display: 'Amoxicillin', form: 'Capsule 500mg', strength: '' },
      matches: undefined,
    },
  ]),
}))

const mockEnrichDrug = vi.fn()
vi.mock('@/lib/trpc', () => ({
  searchDrugCatalog: vi.fn(),
  enrichDrug: mockEnrichDrug,
}))

async function selectAmoxicillin() {
  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'amox' } })
  // Wait for debounced search + result render
  await waitFor(() => screen.getByText('Amoxicillin'))
  fireEvent.mouseDown(screen.getByText('Amoxicillin'))
}

describe('PrescriptionEntry — Pharmopedia deep link', () => {
  it('shows "Open in Pharmopedia" link after drug selection', async () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    await selectAmoxicillin()
    const link = screen.getByRole('link', { name: /pharmopedia/i })
    expect(link).toHaveAttribute('href', 'pharmopedia://drug/J01CA04')
  })

  it('does not show "Open in Pharmopedia" before drug selection', () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /pharmopedia/i })).toBeNull()
  })
})

describe('PrescriptionEntry — enrich form', () => {
  beforeEach(() => { mockEnrichDrug.mockReset() })

  it('does not show enrich form when canEnrich is false (default)', async () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} />)
    await selectAmoxicillin()
    expect(screen.queryByPlaceholderText(/english name override/i)).toBeNull()
  })

  it('shows enrich form when canEnrich is true', async () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()
    expect(screen.getByPlaceholderText(/english name override/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/dari name/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /save name/i })).toBeTruthy()
  })

  it('calls enrichDrug with correct ATC code and localNames on submit', async () => {
    mockEnrichDrug.mockResolvedValueOnce(undefined)
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()

    fireEvent.change(screen.getByPlaceholderText(/english name override/i), {
      target: { value: 'Amox local' },
    })
    fireEvent.change(screen.getByPlaceholderText(/dari name/i), {
      target: { value: 'آموکسیسیلین' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => expect(mockEnrichDrug).toHaveBeenCalledWith('J01CA04', {
      localNames: { en: 'Amox local', prs: 'آموکسیسیلین' },
    }))
  })

  it('shows "Saved" confirmation after successful enrich', async () => {
    mockEnrichDrug.mockResolvedValueOnce(undefined)
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()

    fireEvent.change(screen.getByPlaceholderText(/english name override/i), {
      target: { value: 'Amox local' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => screen.getByText(/saved/i))
  })

  it('shows error message when enrichDrug throws', async () => {
    mockEnrichDrug.mockRejectedValueOnce(new Error('Network error'))
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()

    fireEvent.change(screen.getByPlaceholderText(/dari name/i), {
      target: { value: 'آموکسیسیلین' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => screen.getByText(/failed to save local name/i))
  })

  it('clears enrich form when medication is cleared', async () => {
    render(<PrescriptionEntry onSubmit={vi.fn()} canEnrich />)
    await selectAmoxicillin()

    fireEvent.change(screen.getByPlaceholderText(/english name override/i), {
      target: { value: 'Some name' },
    })

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    // After clearing, the drug is deselected — enrich form gone
    expect(screen.queryByPlaceholderText(/english name override/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test src/__tests__/prescription-entry.test.tsx
```

Expected: FAIL — link and enrich form don't exist yet in the component

- [ ] **Step 3: Update PrescriptionEntry.tsx**

Open `apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx`.

**a) Add new import and prop:**

At the top, add import:
```typescript
import { enrichDrug } from '@/lib/trpc'
```

Change the props interface:
```typescript
interface PrescriptionEntryProps {
  onSubmit: (form: PrescriptionFormData) => void | Promise<void>
  disabled?: boolean
  canEnrich?: boolean  // add this
}
```

Update function signature:
```typescript
export function PrescriptionEntry({ onSubmit, disabled, canEnrich = false }: PrescriptionEntryProps) {
```

**b) Add enrich state (after existing state declarations, before `hasMedication`):**
```typescript
const [localNameEn, setLocalNameEn] = useState('')
const [localNamePrs, setLocalNamePrs] = useState('')
const [isEnriching, setIsEnriching] = useState(false)
const [enrichSuccess, setEnrichSuccess] = useState(false)
const [enrichError, setEnrichError] = useState<string | null>(null)
```

**c) Add `handleEnrich` callback (after `handleClearMedication`):**
```typescript
const handleEnrich = useCallback(async () => {
  if (!localNameEn && !localNamePrs) return
  setIsEnriching(true)
  setEnrichError(null)
  setEnrichSuccess(false)
  try {
    const localNames: Record<string, string> = {}
    if (localNameEn) localNames.en = localNameEn
    if (localNamePrs) localNames.prs = localNamePrs
    await enrichDrug(form.medicationCode, { localNames })
    setEnrichSuccess(true)
    setLocalNameEn('')
    setLocalNamePrs('')
  } catch {
    setEnrichError('Failed to save local name')
  }
  setIsEnriching(false)
}, [form.medicationCode, localNameEn, localNamePrs])
```

**d) Update `handleClearMedication` to reset enrich state:**
```typescript
const handleClearMedication = useCallback(() => {
  setForm(EMPTY_PRESCRIPTION_FORM)
  setQuery('')
  setResults([])
  setValidationError(null)
  setLocalNameEn('')
  setLocalNamePrs('')
  setEnrichSuccess(false)
  setEnrichError(null)
  inputRef.current?.focus()
}, [])
```

**e) In the JSX, add the deep link + enrich form block.** Find the `{hasMedication && (` block that renders the dosage form. Directly before that block (but still inside the outer `<div className="space-y-4">`), add:

```tsx
{hasMedication && (
  <div className="flex flex-wrap items-center gap-3">
    <a
      href={`pharmopedia://drug/${form.medicationCode}`}
      className="text-sm font-medium text-primary-700 underline underline-offset-2"
      aria-label="Open in Pharmopedia"
    >
      Open in Pharmopedia
    </a>
  </div>
)}

{hasMedication && canEnrich && (
  <div className="rounded-xl ring-[0.65px] ring-border/50 bg-muted p-4 space-y-3">
    <h4 className="text-sm font-semibold text-foreground">Add local name</h4>
    <input
      type="text"
      placeholder="English name override"
      value={localNameEn}
      onChange={(e) => setLocalNameEn(e.target.value)}
      disabled={isEnriching}
      className={inputClasses}
    />
    <input
      type="text"
      placeholder="Dari name (دری)"
      value={localNamePrs}
      onChange={(e) => setLocalNamePrs(e.target.value)}
      disabled={isEnriching}
      dir="rtl"
      className={inputClasses}
    />
    {enrichError && (
      <p className="text-sm font-semibold text-destructive">{enrichError}</p>
    )}
    {enrichSuccess && (
      <p className="text-sm font-semibold text-success">Saved</p>
    )}
    <Button
      variant="outline"
      onClick={handleEnrich}
      disabled={isEnriching || (!localNameEn && !localNamePrs)}
    >
      {isEnriching ? 'Saving...' : 'Save name'}
    </Button>
  </div>
)}
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test src/__tests__/prescription-entry.test.tsx
```

Expected: PASS — all 7 component tests green

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
pnpm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/opd-lite/src/components/clinical/PrescriptionEntry.tsx apps/opd-lite/src/__tests__/prescription-entry.test.tsx
git commit -m "feat(opd-lite): Pharmopedia deep link and local-name enrich form in PrescriptionEntry"
```

---

## Self-Review

### 1. Spec coverage

| Spec requirement | Task |
|---|---|
| "switch prescription search to GET /drug-catalog/search" | Task 2 |
| "when clinician adds Dari/Pashto name, call PATCH /drug-catalog/:atcCode/enrich" | Tasks 1 + 3 |
| "Add deep-link button on prescription entry drug detail → opens Pharmopedia" | Task 3 |

All three OPD-Lite spec requirements are covered. ✅

### 2. Placeholder scan

No TBD, no incomplete steps, no "add appropriate error handling" — every step has code. ✅

### 3. Type consistency

- `MedicationItem.code` = ATC code from Hub → `form.medicationCode` → `enrichDrug(form.medicationCode, ...)` → consistent throughout Tasks 2 and 3.
- `EnrichDrugFields` defined in `trpc.ts` → used in `handleEnrich` → consistent.
- `DrugSearchResult` from `@ultranos/shared-types` → imported in both `trpc.ts` and `medication-search.ts` → consistent. ✅
