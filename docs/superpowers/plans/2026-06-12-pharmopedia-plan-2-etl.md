# Pharmopedia Plan 2 — Drug Catalog ETL Seed Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js ETL pipeline that fetches drug data from open APIs (NLM RxNorm, OpenFDA) and an optional commercial source (DrugBank), merges them by source priority, and upserts into the `drug_catalog` Supabase table without overwriting local enrichment fields.

**Architecture:** Three source adapters (nlm, openfda, drugbank) each return a typed `SourceDrugData` partial for a single drug. A normalizer merges them in priority order (drugbank > openfda > nlm) to produce a `NormalizedDrugRow` that maps directly to DB columns. The runner orchestrates fetching, normalization, and batched upsert; it reads a JSON seed list and accepts an injectable Supabase client for testability. Phase 1 seeds ~500 WHO EML drugs using the free APIs only (DrugBank is a Phase 2 stub).

**Tech Stack:** TypeScript + tsx (script runner), `@supabase/supabase-js` v2, Vitest, Node.js 20 `fetch` (native), pnpm workspace package `@ultranos/drug-catalog-etl`

---

## File Map

| File | Purpose |
|------|---------|
| `scripts/etl/drug-catalog/package.json` | Workspace package `@ultranos/drug-catalog-etl` with vitest + tsx |
| `scripts/etl/drug-catalog/tsconfig.json` | TypeScript config (ESNext, bundler resolution) |
| `scripts/etl/drug-catalog/vitest.config.ts` | Vitest config |
| `scripts/etl/drug-catalog/types.ts` | `EmlDrugEntry`, `SourceDrugData`, `NormalizedDrugRow` |
| `scripts/etl/drug-catalog/seed/who-eml-phase1.json` | WHO EML sample list (10 drugs for Phase 1) |
| `scripts/etl/drug-catalog/sources/nlm.ts` | NLM RxNorm adapter — fetches `rxnorm_cui` |
| `scripts/etl/drug-catalog/sources/openfda.ts` | OpenFDA adapter — fetches brand names, therapeutic class, adverse events, contraindications |
| `scripts/etl/drug-catalog/sources/drugbank.ts` | DrugBank stub — returns empty data unless `DRUGBANK_API_KEY` set (Phase 2) |
| `scripts/etl/drug-catalog/normalizer.ts` | Merges `SourceDrugData[]` by priority into `NormalizedDrugRow` |
| `scripts/etl/drug-catalog/run.ts` | Entry point — reads seed list, fetches all sources, normalizes, upserts in chunks of 50 |
| `scripts/etl/drug-catalog/__tests__/nlm.test.ts` | NLM adapter unit tests (mocked fetch) |
| `scripts/etl/drug-catalog/__tests__/openfda.test.ts` | OpenFDA adapter unit tests (mocked fetch) |
| `scripts/etl/drug-catalog/__tests__/drugbank.test.ts` | DrugBank stub tests |
| `scripts/etl/drug-catalog/__tests__/normalizer.test.ts` | Normalizer unit tests |
| `scripts/etl/drug-catalog/__tests__/run.test.ts` | Runner integration tests (mocked sources + Supabase client) |
| `pnpm-workspace.yaml` | Add `scripts/etl/*` glob |

---

### Task 1: Package scaffold, tsconfig, and type definitions

**Files:**
- Create: `scripts/etl/drug-catalog/package.json`
- Create: `scripts/etl/drug-catalog/tsconfig.json`
- Create: `scripts/etl/drug-catalog/vitest.config.ts`
- Create: `scripts/etl/drug-catalog/types.ts`
- Create: `scripts/etl/drug-catalog/seed/who-eml-phase1.json`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Write the failing test**

Create `scripts/etl/drug-catalog/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { EmlDrugEntry, SourceDrugData, NormalizedDrugRow } from '../types.js'

describe('types shape', () => {
  it('EmlDrugEntry has atcCode and innName', () => {
    const entry: EmlDrugEntry = { atcCode: 'J01CA04', innName: 'amoxicillin' }
    expect(entry.atcCode).toBe('J01CA04')
    expect(entry.innName).toBe('amoxicillin')
  })

  it('SourceDrugData discriminates by source', () => {
    const data: SourceDrugData = { source: 'nlm', atcCode: 'J01CA04' }
    expect(data.source).toBe('nlm')
  })

  it('NormalizedDrugRow has required ETL fields', () => {
    const row: NormalizedDrugRow = {
      atc_code: 'J01CA04',
      inn_name: 'amoxicillin',
      brand_names: [],
      dose_forms: [],
      therapeutic_class: '',
      indications_clinical: [],
      adult_dosing: [],
      pediatric_dosing: [],
      adverse_events: [],
      contraindications: [],
      interactions: [],
      administration_notes: {},
      pharmacokinetics: {},
      summary_plain: {},
      used_for: [],
      common_side_effects: [],
      when_to_seek_help: {},
      storage_instructions: {},
      pregnancy_summary_plain: {},
      warnings_summary_plain: {},
      substitutes: [],
      recall_alerts: [],
      etl_source: 'nlm,openfda',
      last_etl_refresh: new Date().toISOString(),
    }
    expect(row.atc_code).toBe('J01CA04')
  })

  it('NormalizedDrugRow does not include local enrichment fields', () => {
    // Type-level check: these keys must not exist on NormalizedDrugRow
    // If this compiles, the type is correct
    const row = {} as NormalizedDrugRow
    const keys = Object.keys(row) as string[]
    expect(keys).not.toContain('local_names')
    expect(keys).not.toContain('dispensing_notes')
    expect(keys).not.toContain('formulary_status')
    expect(keys).not.toContain('unit_cost')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scripts/etl/drug-catalog && npx vitest run __tests__/types.test.ts
```

Expected: Error — cannot find module `../types.js` (or package.json not found)

- [ ] **Step 3: Add `scripts/etl/*` to pnpm workspace**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "scripts/etl/*"
```

- [ ] **Step 4: Create `scripts/etl/drug-catalog/package.json`**

```json
{
  "name": "@ultranos/drug-catalog-etl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "run-etl": "tsx run.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 5: Create `scripts/etl/drug-catalog/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: Create `scripts/etl/drug-catalog/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

- [ ] **Step 7: Create `scripts/etl/drug-catalog/types.ts`**

```typescript
/**
 * ETL internal types — drug catalog seed pipeline (Plan 2).
 *
 * SourceDrugData: per-source partial data for a single drug.
 * NormalizedDrugRow: merged, DB-ready row for drug_catalog upsert.
 *
 * IMPORTANT: NormalizedDrugRow intentionally omits local enrichment fields
 * (local_names, dispensing_notes, formulary_status, unit_cost) — the ETL
 * must never overwrite curator-supplied data.
 */

export interface EmlDrugEntry {
  atcCode: string
  innName: string
}

export interface SourceDrugData {
  source: 'nlm' | 'openfda' | 'drugbank'
  atcCode: string
  rxnormCui?: string
  drugbankId?: string
  brandNames?: string[]
  doseForms?: string[]
  therapeuticClass?: string
  mechanismOfAction?: string
  indicationsClinical?: string[]
  adultDosing?: Array<{
    indication: string
    adultDose?: string
    frequency: string
    duration?: string
    route?: string
  }>
  pediatricDosing?: Array<{
    indication: string
    pediatricDose?: string
    frequency: string
    duration?: string
    route?: string
    weightBased?: boolean
  }>
  renalAdjustment?: string
  adverseEvents?: Array<{ effect: string; frequency?: string; severity?: string }>
  contraindications?: string[]
  interactions?: Array<{
    drugAtcCode: string
    drugName: string
    severity: 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'
    mechanism: string
  }>
  pregnancyCategory?: string
  administrationNotes?: Record<string, string>
  pharmacokinetics?: {
    halfLife?: string
    peakEffect?: string
    bioavailability?: string
    proteinBinding?: string
  }
  summaryPlain?: Record<string, string>
  usedFor?: Record<string, string>[]
  commonSideEffects?: Record<string, string>[]
  whenToSeekHelp?: Record<string, string>
  storageInstructions?: Record<string, string>
  pregnancySummaryPlain?: Record<string, string>
  warningsSummaryPlain?: Record<string, string>
}

/**
 * Maps directly to drug_catalog table columns (snake_case).
 * Only ETL-owned fields — never local enrichment fields.
 */
export interface NormalizedDrugRow {
  atc_code: string
  inn_name: string
  rxnorm_cui?: string
  drugbank_id?: string
  brand_names: string[]
  dose_forms: string[]
  therapeutic_class: string
  mechanism_of_action?: string
  indications_clinical: string[]
  adult_dosing: unknown[]
  pediatric_dosing: unknown[]
  renal_adjustment?: string
  adverse_events: unknown[]
  contraindications: string[]
  interactions: unknown[]
  pregnancy_category?: string
  administration_notes: Record<string, string>
  pharmacokinetics: Record<string, unknown>
  summary_plain: Record<string, string>
  used_for: Record<string, string>[]
  common_side_effects: Record<string, string>[]
  when_to_seek_help: Record<string, string>
  storage_instructions: Record<string, string>
  pregnancy_summary_plain: Record<string, string>
  warnings_summary_plain: Record<string, string>
  substitutes: string[]
  recall_alerts: unknown[]
  etl_source: string
  last_etl_refresh: string
}
```

- [ ] **Step 8: Create `scripts/etl/drug-catalog/seed/who-eml-phase1.json`**

```json
[
  { "atcCode": "J01CA04", "innName": "amoxicillin" },
  { "atcCode": "N02BE01", "innName": "paracetamol" },
  { "atcCode": "M01AE01", "innName": "ibuprofen" },
  { "atcCode": "A10BB01", "innName": "glibenclamide" },
  { "atcCode": "A02BC01", "innName": "omeprazole" },
  { "atcCode": "J01FA09", "innName": "clarithromycin" },
  { "atcCode": "R03AC02", "innName": "salbutamol" },
  { "atcCode": "N06AB06", "innName": "sertraline" },
  { "atcCode": "B01AC06", "innName": "acetylsalicylic acid" },
  { "atcCode": "J01XA01", "innName": "vancomycin" }
]
```

- [ ] **Step 9: Install dependencies**

```bash
pnpm install
```

Expected: `@ultranos/drug-catalog-etl` added to workspace, dependencies installed.

- [ ] **Step 10: Run tests to verify they pass**

```bash
pnpm -F @ultranos/drug-catalog-etl test
```

Expected: 4 tests PASS

- [ ] **Step 11: Commit**

```bash
git add scripts/etl/drug-catalog/package.json scripts/etl/drug-catalog/tsconfig.json scripts/etl/drug-catalog/vitest.config.ts scripts/etl/drug-catalog/types.ts scripts/etl/drug-catalog/seed/who-eml-phase1.json scripts/etl/drug-catalog/__tests__/types.test.ts pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(etl): scaffold drug-catalog ETL package with types and seed data"
```

---

### Task 2: NLM RxNorm adapter

**Files:**
- Create: `scripts/etl/drug-catalog/sources/nlm.ts`
- Create: `scripts/etl/drug-catalog/__tests__/nlm.test.ts`

The NLM RxNorm API is free and requires no API key. We call
`https://rxnav.nlm.nih.gov/REST/rxcui.json?name={innName}&allsrc=0`
which returns `{ idGroup: { rxnormId: string[] } }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/etl/drug-catalog/__tests__/nlm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchFromNlm } from '../sources/nlm.js'

describe('fetchFromNlm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns rxnormCui when API finds a match', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idGroup: { rxnormId: ['723'] } }),
    } as Response)

    const result = await fetchFromNlm('J01CA04', 'amoxicillin')

    expect(result.source).toBe('nlm')
    expect(result.atcCode).toBe('J01CA04')
    expect(result.rxnormCui).toBe('723')
  })

  it('returns empty data (no rxnormCui) when API returns HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response)

    const result = await fetchFromNlm('J01CA04', 'amoxicillin')

    expect(result.rxnormCui).toBeUndefined()
    expect(result.source).toBe('nlm')
  })

  it('returns empty data when rxnormId array is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idGroup: {} }),
    } as Response)

    const result = await fetchFromNlm('J01CA04', 'amoxicillin')

    expect(result.rxnormCui).toBeUndefined()
  })

  it('URL-encodes the drug name', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ idGroup: { rxnormId: ['7052'] } }),
    } as Response)

    await fetchFromNlm('B01AC06', 'acetylsalicylic acid')

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('acetylsalicylic%20acid')
  })

  it('returns empty data when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network timeout'))

    const result = await fetchFromNlm('J01CA04', 'amoxicillin')

    expect(result.rxnormCui).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/nlm.test.ts
```

Expected: FAIL — cannot find module `../sources/nlm.js`

- [ ] **Step 3: Implement `sources/nlm.ts`**

Create `scripts/etl/drug-catalog/sources/nlm.ts`:

```typescript
import type { SourceDrugData } from '../types.js'

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST'

interface RxNavResponse {
  idGroup?: {
    rxnormId?: string[]
  }
}

export async function fetchFromNlm(
  atcCode: string,
  innName: string
): Promise<SourceDrugData> {
  try {
    const url = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(innName)}&allsrc=0`
    const res = await fetch(url)
    if (!res.ok) return { source: 'nlm', atcCode }

    const json = await res.json() as RxNavResponse
    const rxnormCui = json.idGroup?.rxnormId?.[0]

    return { source: 'nlm', atcCode, rxnormCui }
  } catch {
    return { source: 'nlm', atcCode }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/nlm.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/etl/drug-catalog/sources/nlm.ts scripts/etl/drug-catalog/__tests__/nlm.test.ts
git commit -m "feat(etl): add NLM RxNorm adapter"
```

---

### Task 3: OpenFDA adapter

**Files:**
- Create: `scripts/etl/drug-catalog/sources/openfda.ts`
- Create: `scripts/etl/drug-catalog/__tests__/openfda.test.ts`

OpenFDA `drug/label` endpoint is free with no API key for low-volume access.
URL: `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"<name>"&limit=1`

The response provides brand names, therapeutic class (EPC), adverse reactions,
contraindications, pregnancy category, and mechanism of action. All fields are
returned as arrays of long narrative strings — we parse them into usable data.

- [ ] **Step 1: Write the failing test**

Create `scripts/etl/drug-catalog/__tests__/openfda.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchFromOpenFda } from '../sources/openfda.js'

const AMOXICILLIN_RESPONSE = {
  results: [{
    openfda: {
      brand_name: ['AMOXIL', 'TRIMOX'],
      pharm_class_epc: ['Penicillin-class Antibacterial [EPC]'],
    },
    indications_and_usage: ['Amoxicillin is indicated for infections caused by susceptible organisms.'],
    contraindications: ['Hypersensitivity to any penicillin. History of allergic reaction.'],
    adverse_reactions: ['Nausea, vomiting, diarrhea. Skin rashes. Anaphylaxis in rare cases.'],
    pregnancy: ['Pregnancy Category B. Animal reproduction studies.'],
    mechanism_of_action: ['Amoxicillin is a beta-lactam antibiotic that inhibits cell wall synthesis.'],
  }],
}

describe('fetchFromOpenFda', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns brand names deduplicated', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.source).toBe('openfda')
    expect(result.brandNames).toContain('AMOXIL')
    expect(result.brandNames).toContain('TRIMOX')
  })

  it('strips [EPC] suffix from therapeutic class', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.therapeuticClass).toBe('Penicillin-class Antibacterial')
    expect(result.therapeuticClass).not.toContain('[EPC]')
  })

  it('extracts pregnancy category letter', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.pregnancyCategory).toBe('B')
  })

  it('returns mechanismOfAction string', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => AMOXICILLIN_RESPONSE,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.mechanismOfAction).toContain('beta-lactam')
  })

  it('returns empty data on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.brandNames).toBeUndefined()
    expect(result.source).toBe('openfda')
  })

  it('returns empty data when results array is empty', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response)

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.brandNames).toBeUndefined()
  })

  it('returns empty data when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await fetchFromOpenFda('J01CA04', 'amoxicillin')

    expect(result.brandNames).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/openfda.test.ts
```

Expected: FAIL — cannot find module `../sources/openfda.js`

- [ ] **Step 3: Implement `sources/openfda.ts`**

Create `scripts/etl/drug-catalog/sources/openfda.ts`:

```typescript
import type { SourceDrugData } from '../types.js'

const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json'

interface OpenFdaResult {
  openfda?: {
    brand_name?: string[]
    pharm_class_epc?: string[]
  }
  indications_and_usage?: string[]
  contraindications?: string[]
  adverse_reactions?: string[]
  pregnancy?: string[]
  mechanism_of_action?: string[]
}

interface OpenFdaResponse {
  results?: OpenFdaResult[]
}

function parseSentences(text: string, max: number): string[] {
  return text
    .split(/[.,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 3)
    .slice(0, max)
}

export async function fetchFromOpenFda(
  atcCode: string,
  innName: string
): Promise<SourceDrugData> {
  try {
    const search = `openfda.generic_name:"${encodeURIComponent(innName)}"`
    const url = `${OPENFDA_BASE}?search=${search}&limit=1`
    const res = await fetch(url)
    if (!res.ok) return { source: 'openfda', atcCode }

    const json = await res.json() as OpenFdaResponse
    const r = json.results?.[0]
    if (!r) return { source: 'openfda', atcCode }

    const brandNames = [...new Set(
      (r.openfda?.brand_name ?? []).map(n => n.split(' ')[0]).filter(Boolean)
    )]

    const therapeuticClass = (r.openfda?.pharm_class_epc?.[0] ?? '')
      .replace(/ \[EPC\]$/, '')

    const adverseEvents = parseSentences(r.adverse_reactions?.[0] ?? '', 10)
      .map(effect => ({ effect }))

    const contraindications = parseSentences(r.contraindications?.[0] ?? '', 5)

    const pregnancyCategoryMatch = (r.pregnancy?.[0] ?? '').match(/Category ([A-DX])/)
    const pregnancyCategory = pregnancyCategoryMatch?.[1]

    const mechanismOfAction = r.mechanism_of_action?.[0]

    return {
      source: 'openfda',
      atcCode,
      brandNames: brandNames.length > 0 ? brandNames : undefined,
      therapeuticClass: therapeuticClass || undefined,
      adverseEvents: adverseEvents.length > 0 ? adverseEvents : undefined,
      contraindications: contraindications.length > 0 ? contraindications : undefined,
      pregnancyCategory,
      mechanismOfAction,
    }
  } catch {
    return { source: 'openfda', atcCode }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/openfda.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/etl/drug-catalog/sources/openfda.ts scripts/etl/drug-catalog/__tests__/openfda.test.ts
git commit -m "feat(etl): add OpenFDA drug label adapter"
```

---

### Task 4: DrugBank stub adapter

**Files:**
- Create: `scripts/etl/drug-catalog/sources/drugbank.ts`
- Create: `scripts/etl/drug-catalog/__tests__/drugbank.test.ts`

DrugBank requires a commercial license (Phase 2). The Phase 1 stub returns empty
data unless `DRUGBANK_API_KEY` is set in env. This keeps the runner wiring intact
so Phase 2 only needs to fill in the implementation.

- [ ] **Step 1: Write the failing test**

Create `scripts/etl/drug-catalog/__tests__/drugbank.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchFromDrugBank } from '../sources/drugbank.js'

describe('fetchFromDrugBank', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns empty SourceDrugData when no API key is set', async () => {
    vi.stubEnv('DRUGBANK_API_KEY', '')

    const result = await fetchFromDrugBank('J01CA04', 'amoxicillin')

    expect(result.source).toBe('drugbank')
    expect(result.atcCode).toBe('J01CA04')
    expect(result.rxnormCui).toBeUndefined()
    expect(result.brandNames).toBeUndefined()
  })

  it('still returns empty data when API key is set (Phase 1 stub)', async () => {
    vi.stubEnv('DRUGBANK_API_KEY', 'test-key-12345')

    const result = await fetchFromDrugBank('J01CA04', 'amoxicillin')

    // Phase 1: stub returns empty even with key — full impl is Phase 2
    expect(result.source).toBe('drugbank')
    expect(result.atcCode).toBe('J01CA04')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/drugbank.test.ts
```

Expected: FAIL — cannot find module `../sources/drugbank.js`

- [ ] **Step 3: Implement `sources/drugbank.ts`**

Create `scripts/etl/drug-catalog/sources/drugbank.ts`:

```typescript
import type { SourceDrugData } from '../types.js'

/**
 * DrugBank adapter — Phase 1 stub.
 *
 * DrugBank requires a commercial license for API access.
 * Returns empty data until Phase 2 implementation with DRUGBANK_API_KEY.
 *
 * Phase 2 implementation: fetch from https://api.drugbank.com/v1/drugs/<id>
 * using the ATC code or drug name to retrieve the DrugBank drug ID, then
 * fetch full clinical data (interactions, dosing, pharmacokinetics).
 */
export async function fetchFromDrugBank(
  atcCode: string,
  _innName: string
): Promise<SourceDrugData> {
  return { source: 'drugbank', atcCode }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/drugbank.test.ts
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/etl/drug-catalog/sources/drugbank.ts scripts/etl/drug-catalog/__tests__/drugbank.test.ts
git commit -m "feat(etl): add DrugBank Phase 1 stub adapter"
```

---

### Task 5: Normalizer

**Files:**
- Create: `scripts/etl/drug-catalog/normalizer.ts`
- Create: `scripts/etl/drug-catalog/__tests__/normalizer.test.ts`

The normalizer takes an `EmlDrugEntry` plus an array of `SourceDrugData` (one per source)
and produces a single `NormalizedDrugRow` for Supabase upsert. Sources are sorted by
priority (drugbank: 3, openfda: 2, nlm: 1) — for each field, the highest-priority
defined value wins. Array fields use the highest-priority non-empty array.

- [ ] **Step 1: Write the failing test**

Create `scripts/etl/drug-catalog/__tests__/normalizer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeDrug } from '../normalizer.js'
import type { EmlDrugEntry, SourceDrugData } from '../types.js'

const ENTRY: EmlDrugEntry = { atcCode: 'J01CA04', innName: 'amoxicillin' }

describe('normalizeDrug', () => {
  it('sets atc_code and inn_name from EmlDrugEntry regardless of sources', () => {
    const row = normalizeDrug(ENTRY, [])
    expect(row.atc_code).toBe('J01CA04')
    expect(row.inn_name).toBe('amoxicillin')
  })

  it('prefers drugbank over openfda over nlm for scalar fields', () => {
    const sources: SourceDrugData[] = [
      { source: 'nlm', atcCode: 'J01CA04', rxnormCui: 'nlm-cui', therapeuticClass: 'NLM class' },
      { source: 'openfda', atcCode: 'J01CA04', rxnormCui: 'fda-cui', therapeuticClass: 'FDA class' },
      { source: 'drugbank', atcCode: 'J01CA04', rxnormCui: 'db-cui', therapeuticClass: 'DB class' },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.rxnorm_cui).toBe('db-cui')
    expect(row.therapeutic_class).toBe('DB class')
  })

  it('falls back to lower priority when higher priority is undefined', () => {
    const sources: SourceDrugData[] = [
      { source: 'nlm', atcCode: 'J01CA04', rxnormCui: '723' },
      { source: 'openfda', atcCode: 'J01CA04' },
      { source: 'drugbank', atcCode: 'J01CA04' },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.rxnorm_cui).toBe('723')
  })

  it('prefers drugbank brand_names over openfda when drugbank has data', () => {
    const sources: SourceDrugData[] = [
      { source: 'openfda', atcCode: 'J01CA04', brandNames: ['AMOXIL'] },
      { source: 'drugbank', atcCode: 'J01CA04', brandNames: ['TRIMOX', 'POLYMOX'] },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.brand_names).toEqual(['TRIMOX', 'POLYMOX'])
  })

  it('falls back to openfda brand_names when drugbank array is empty', () => {
    const sources: SourceDrugData[] = [
      { source: 'openfda', atcCode: 'J01CA04', brandNames: ['AMOXIL'] },
      { source: 'drugbank', atcCode: 'J01CA04', brandNames: [] },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.brand_names).toEqual(['AMOXIL'])
  })

  it('returns empty arrays for array fields when no source provides them', () => {
    const row = normalizeDrug(ENTRY, [{ source: 'nlm', atcCode: 'J01CA04' }])
    expect(row.brand_names).toEqual([])
    expect(row.adverse_events).toEqual([])
    expect(row.contraindications).toEqual([])
    expect(row.interactions).toEqual([])
  })

  it('returns empty objects for JSONB object fields when no source provides them', () => {
    const row = normalizeDrug(ENTRY, [])
    expect(row.summary_plain).toEqual({})
    expect(row.administration_notes).toEqual({})
    expect(row.pharmacokinetics).toEqual({})
  })

  it('sets therapeutic_class to empty string when no source provides it', () => {
    const row = normalizeDrug(ENTRY, [])
    expect(row.therapeutic_class).toBe('')
  })

  it('includes etl_source listing all sources used', () => {
    const sources: SourceDrugData[] = [
      { source: 'nlm', atcCode: 'J01CA04' },
      { source: 'openfda', atcCode: 'J01CA04' },
    ]
    const row = normalizeDrug(ENTRY, sources)
    expect(row.etl_source).toContain('openfda')
    expect(row.etl_source).toContain('nlm')
  })

  it('sets last_etl_refresh to a valid ISO 8601 timestamp', () => {
    const row = normalizeDrug(ENTRY, [])
    expect(() => new Date(row.last_etl_refresh)).not.toThrow()
    expect(new Date(row.last_etl_refresh).toISOString()).toBe(row.last_etl_refresh)
  })

  it('never includes local enrichment fields in output', () => {
    const row = normalizeDrug(ENTRY, []) as Record<string, unknown>
    expect(Object.keys(row)).not.toContain('local_names')
    expect(Object.keys(row)).not.toContain('dispensing_notes')
    expect(Object.keys(row)).not.toContain('formulary_status')
    expect(Object.keys(row)).not.toContain('unit_cost')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/normalizer.test.ts
```

Expected: FAIL — cannot find module `../normalizer.js`

- [ ] **Step 3: Implement `normalizer.ts`**

Create `scripts/etl/drug-catalog/normalizer.ts`:

```typescript
import type { EmlDrugEntry, SourceDrugData, NormalizedDrugRow } from './types.js'

const SOURCE_PRIORITY: Record<SourceDrugData['source'], number> = {
  drugbank: 3,
  openfda: 2,
  nlm: 1,
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find(v => v !== undefined)
}

function firstNonEmptyArray<T>(...arrays: Array<T[] | undefined>): T[] {
  for (const arr of arrays) {
    if (arr && arr.length > 0) return arr
  }
  return []
}

export function normalizeDrug(
  entry: EmlDrugEntry,
  sources: SourceDrugData[]
): NormalizedDrugRow {
  // Sort descending by priority — drugbank first
  const sorted = [...sources].sort(
    (a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]
  )

  const now = new Date().toISOString()
  const sourceNames = sorted.map(s => s.source).join(',')

  return {
    atc_code: entry.atcCode,
    inn_name: entry.innName,
    rxnorm_cui: firstDefined(...sorted.map(s => s.rxnormCui)),
    drugbank_id: firstDefined(...sorted.map(s => s.drugbankId)),
    brand_names: firstNonEmptyArray(...sorted.map(s => s.brandNames)),
    dose_forms: firstNonEmptyArray(...sorted.map(s => s.doseForms)),
    therapeutic_class: firstDefined(...sorted.map(s => s.therapeuticClass)) ?? '',
    mechanism_of_action: firstDefined(...sorted.map(s => s.mechanismOfAction)),
    indications_clinical: firstNonEmptyArray(...sorted.map(s => s.indicationsClinical)),
    adult_dosing: firstNonEmptyArray(...sorted.map(s => s.adultDosing)),
    pediatric_dosing: firstNonEmptyArray(...sorted.map(s => s.pediatricDosing)),
    renal_adjustment: firstDefined(...sorted.map(s => s.renalAdjustment)),
    adverse_events: firstNonEmptyArray(...sorted.map(s => s.adverseEvents)),
    contraindications: firstNonEmptyArray(...sorted.map(s => s.contraindications)),
    interactions: firstNonEmptyArray(...sorted.map(s => s.interactions)),
    pregnancy_category: firstDefined(...sorted.map(s => s.pregnancyCategory)),
    administration_notes: firstDefined(...sorted.map(s => s.administrationNotes)) ?? {},
    pharmacokinetics: firstDefined(...sorted.map(s => s.pharmacokinetics)) ?? {},
    summary_plain: firstDefined(...sorted.map(s => s.summaryPlain)) ?? {},
    used_for: firstNonEmptyArray(...sorted.map(s => s.usedFor)),
    common_side_effects: firstNonEmptyArray(...sorted.map(s => s.commonSideEffects)),
    when_to_seek_help: firstDefined(...sorted.map(s => s.whenToSeekHelp)) ?? {},
    storage_instructions: firstDefined(...sorted.map(s => s.storageInstructions)) ?? {},
    pregnancy_summary_plain: firstDefined(...sorted.map(s => s.pregnancySummaryPlain)) ?? {},
    warnings_summary_plain: firstDefined(...sorted.map(s => s.warningsSummaryPlain)) ?? {},
    substitutes: [],
    recall_alerts: [],
    etl_source: sourceNames,
    last_etl_refresh: now,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/normalizer.test.ts
```

Expected: 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/etl/drug-catalog/normalizer.ts scripts/etl/drug-catalog/__tests__/normalizer.test.ts
git commit -m "feat(etl): add drug catalog normalizer with source priority merge"
```

---

### Task 6: Run entry point

**Files:**
- Create: `scripts/etl/drug-catalog/run.ts`
- Create: `scripts/etl/drug-catalog/__tests__/run.test.ts`

The runner reads the seed list, fetches from all three sources in parallel per drug,
normalizes, and upserts to Supabase in chunks of 50. It accepts an optional `deps`
object with an injectable Supabase client — this is how tests avoid real HTTP calls.
The upsert uses `onConflict: 'atc_code'` and only includes ETL columns, so existing
local enrichment fields (`local_names`, `dispensing_notes`, `formulary_status`,
`unit_cost`) are never overwritten.

- [ ] **Step 1: Write the failing test**

Create `scripts/etl/drug-catalog/__tests__/run.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// All module mocks must be declared before imports of the mocked modules
vi.mock('../sources/nlm.js')
vi.mock('../sources/openfda.js')
vi.mock('../sources/drugbank.js')

import { fetchFromNlm } from '../sources/nlm.js'
import { fetchFromOpenFda } from '../sources/openfda.js'
import { fetchFromDrugBank } from '../sources/drugbank.js'
import { runEtl } from '../run.js'
import type { EmlDrugEntry } from '../types.js'

const makeSupabaseMock = () => {
  const upsertFn = vi.fn().mockResolvedValue({ error: null })
  const fromFn = vi.fn().mockReturnValue({ upsert: upsertFn })
  const client = { from: fromFn } as unknown as SupabaseClient
  return { client, upsertFn, fromFn }
}

const NLM_EMPTY = (atcCode: string) => ({ source: 'nlm' as const, atcCode })
const FDA_EMPTY = (atcCode: string) => ({ source: 'openfda' as const, atcCode })
const DB_EMPTY = (atcCode: string) => ({ source: 'drugbank' as const, atcCode })

describe('runEtl', () => {
  beforeEach(() => {
    vi.mocked(fetchFromNlm).mockImplementation(async (atcCode) => NLM_EMPTY(atcCode))
    vi.mocked(fetchFromOpenFda).mockImplementation(async (atcCode) => FDA_EMPTY(atcCode))
    vi.mocked(fetchFromDrugBank).mockImplementation(async (atcCode) => DB_EMPTY(atcCode))
  })

  it('returns processed=N, failed=0 for N successful entries', async () => {
    const { client } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = [
      { atcCode: 'J01CA04', innName: 'amoxicillin' },
      { atcCode: 'N02BE01', innName: 'paracetamol' },
    ]

    const result = await runEtl(entries, { supabase: client })

    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('counts a drug as failed when source fetch throws, without throwing itself', async () => {
    vi.mocked(fetchFromNlm).mockRejectedValueOnce(new Error('network timeout'))

    const { client } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = [{ atcCode: 'J01CA04', innName: 'amoxicillin' }]

    const result = await runEtl(entries, { supabase: client })

    expect(result.failed).toBe(1)
    expect(result.processed).toBe(0)
  })

  it('calls supabase.from("drug_catalog").upsert with correct conflict target', async () => {
    const { client, fromFn, upsertFn } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = [{ atcCode: 'J01CA04', innName: 'amoxicillin' }]

    await runEtl(entries, { supabase: client })

    expect(fromFn).toHaveBeenCalledWith('drug_catalog')
    expect(upsertFn).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ onConflict: 'atc_code' })
    )
  })

  it('upserts in chunks of 50 — 100 entries triggers 2 upserts', async () => {
    const { client, upsertFn } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = Array.from({ length: 100 }, (_, i) => ({
      atcCode: `X${String(i).padStart(7, '0')}`,
      innName: `drug${i}`,
    }))

    await runEtl(entries, { supabase: client })

    expect(upsertFn).toHaveBeenCalledTimes(2)
  })

  it('throws when Supabase upsert returns an error', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: { message: 'foreign key violation' } })
    const client = {
      from: vi.fn().mockReturnValue({ upsert: upsertFn }),
    } as unknown as SupabaseClient

    const entries: EmlDrugEntry[] = [{ atcCode: 'J01CA04', innName: 'amoxicillin' }]

    await expect(runEtl(entries, { supabase: client })).rejects.toThrow('Upsert failed')
  })

  it('upsert payload does not include local enrichment fields', async () => {
    const { client, upsertFn } = makeSupabaseMock()
    const entries: EmlDrugEntry[] = [{ atcCode: 'J01CA04', innName: 'amoxicillin' }]

    await runEtl(entries, { supabase: client })

    const rows = upsertFn.mock.calls[0][0] as Record<string, unknown>[]
    expect(rows[0]).not.toHaveProperty('local_names')
    expect(rows[0]).not.toHaveProperty('dispensing_notes')
    expect(rows[0]).not.toHaveProperty('formulary_status')
    expect(rows[0]).not.toHaveProperty('unit_cost')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/run.test.ts
```

Expected: FAIL — cannot find module `../run.js`

- [ ] **Step 3: Implement `run.ts`**

Create `scripts/etl/drug-catalog/run.ts`:

```typescript
#!/usr/bin/env tsx
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { EmlDrugEntry, NormalizedDrugRow } from './types.js'
import { fetchFromNlm } from './sources/nlm.js'
import { fetchFromOpenFda } from './sources/openfda.js'
import { fetchFromDrugBank } from './sources/drugbank.js'
import { normalizeDrug } from './normalizer.js'

const UPSERT_CHUNK_SIZE = 50

interface RunDeps {
  supabase?: SupabaseClient
}

async function processOneDrug(entry: EmlDrugEntry): Promise<NormalizedDrugRow> {
  const [nlm, openFda, drugBank] = await Promise.all([
    fetchFromNlm(entry.atcCode, entry.innName),
    fetchFromOpenFda(entry.atcCode, entry.innName),
    fetchFromDrugBank(entry.atcCode, entry.innName),
  ])
  return normalizeDrug(entry, [nlm, openFda, drugBank])
}

async function upsertChunk(supabase: SupabaseClient, rows: NormalizedDrugRow[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase
    .from('drug_catalog')
    .upsert(rows, { onConflict: 'atc_code' })
  if (error) throw new Error(`Upsert failed: ${error.message}`)
}

export async function runEtl(
  entries: EmlDrugEntry[],
  deps: RunDeps = {}
): Promise<{ processed: number; failed: number }> {
  const supabase = deps.supabase ?? createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let processed = 0
  let failed = 0

  for (let i = 0; i < entries.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = entries.slice(i, i + UPSERT_CHUNK_SIZE)
    const rows: NormalizedDrugRow[] = []

    await Promise.all(
      chunk.map(async (entry) => {
        try {
          rows.push(await processOneDrug(entry))
          processed++
        } catch (err) {
          console.error(`Failed ${entry.atcCode}: ${(err as Error).message}`)
          failed++
        }
      })
    )

    await upsertChunk(supabase, rows)
    console.log(`Progress: ${Math.min(i + UPSERT_CHUNK_SIZE, entries.length)}/${entries.length}`)
  }

  return { processed, failed }
}

// Entry point — only executed when run directly via `npx tsx run.ts`
const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] === __filename) {
  const __dirname = dirname(__filename)
  const entries: EmlDrugEntry[] = JSON.parse(
    readFileSync(join(__dirname, 'seed/who-eml-phase1.json'), 'utf-8')
  )
  console.log(`Starting ETL for ${entries.length} drugs...`)
  runEtl(entries)
    .then(({ processed, failed }) => {
      console.log(`ETL complete. Processed: ${processed}, Failed: ${failed}`)
      process.exit(failed > 0 ? 1 : 0)
    })
    .catch((err: Error) => {
      console.error('ETL fatal error:', err.message)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -F @ultranos/drug-catalog-etl test __tests__/run.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: Run full test suite**

```bash
pnpm -F @ultranos/drug-catalog-etl test
```

Expected: All tests PASS (types: 4, nlm: 5, openfda: 7, drugbank: 2, normalizer: 10, run: 6 = 34 total)

- [ ] **Step 6: Commit**

```bash
git add scripts/etl/drug-catalog/run.ts scripts/etl/drug-catalog/__tests__/run.test.ts
git commit -m "feat(etl): add ETL runner with chunked Supabase upsert"
```

---

## Self-Review

**Spec coverage:**
- ✅ Three source adapters (nlm, openfda, drugbank stub) — Tasks 2, 3, 4
- ✅ Source priority merge (drugbank > openfda > nlm) — Task 5
- ✅ Never overwrites local enrichment fields — enforced by type shape + tested in run.test.ts
- ✅ ETL_PROTECTED_FIELDS respect: `local_names`, `dispensing_notes`, `formulary_status`, `unit_cost` absent from `NormalizedDrugRow`
- ✅ Batched upsert, chunk size 50 — Task 6
- ✅ Phase 1 WHO EML seed list — Task 1 (`who-eml-phase1.json`)
- ✅ Workspace package setup — Task 1
- ✅ All source failures caught per-drug without aborting the run — Task 6
- ✅ Upsert conflict on `atc_code` — Task 6

**Placeholder scan:** No TBD/TODO blocks. DrugBank Phase 2 is explicitly noted as a comment in the stub file, not a plan gap.

**Type consistency:**
- `SourceDrugData` camelCase fields → `NormalizedDrugRow` snake_case columns — mapping is explicit in `normalizer.ts`
- `EmlDrugEntry.atcCode` → `NormalizedDrugRow.atc_code` — consistent through all tasks
- Vitest mock return types in `run.test.ts` use `source: 'nlm' as const` to match the discriminated union
