# Phase 1 — OPD-Lite Enriched Catalog (interactions + offline search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OPD-Lite the first consumer of `@ultranos/drug-catalog-sync` — sync the enriched 3,883-drug catalog + brands into an on-device Dexie mirror, then power **1B** (comprehensive offline medication search incl. brand→generic) and **1A** (the safety-critical interaction check now reading the 91%-covered enriched interactions) from that mirror.

**Architecture:** Path B (client consumes `drugCatalog.sync`), full tiered mirror on device. New Dexie tables at schema **v24** (non-PHI, plaintext, registered in `PRESERVE_TABLES`). A Dexie-backed `DrugCatalogStore` adapter feeds the Phase 0 sync orchestrator. Search and the interaction adapter read the mirror, each with a graceful **fallback to the existing JSON-seeded vocab** when the mirror is empty (pre-first-sync cold start). `@ultranos/drug-db`'s checker is untouched — only its data source (a new mirror-backed adapter) changes.

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie (IndexedDB), Vitest + `fake-indexeddb`, `@ultranos/drug-catalog-sync` (Phase 0), `@ultranos/drug-db`, `@ultranos/shared-types`.

## Decisions (made during planning — flag if you disagree, do not silently re-decide)
- **D1 — Search reads the mirror directly** (innName + multiEntry `brandNames` index), Fuse over mirror-derived items; the existing `vocabularyMedications` path is kept only as the empty-mirror fallback.
- **D2 — Interaction check uses a new mirror-backed `DrugDatabaseAdapter`** that flattens `entry.interactions` into pairwise rows; the existing `createDexieDrugAdapter()` (vocab table) is the empty-mirror fallback. The checker and its UNAVAILABLE-on-stale/empty semantics are unchanged (Rule #3 preserved).
- **D3 — Sync triggers:** lazy (throttled, online-gated, single-flight) on sign-in via `SyncProvider`, and the existing `interactionService` `onStale` callback now also calls `syncDrugCatalog()`. No new app-wide bootstrap is introduced.

## Global Constraints
- New Dexie tables are **non-PHI reference data**: plaintext (NOT added to the encryption middleware config), and MUST be added to `PRESERVE_TABLES` in `apps/opd-lite/src/lib/phi-cleanup.ts` (an existing test asserts `PHI_TABLES + PRESERVE_TABLES` covers every table).
- **Rule #3 (safety):** the interaction check must NEVER imply "no interactions" on missing/stale data. Empty mirror → fall back to the existing vocab adapter; never return CLEAR from absence. Preserve the existing `UNAVAILABLE` behavior.
- **Rule #1 (PHI):** the catalog/brands are non-PHI, but log only counts/shapes — never entry contents.
- Dexie schema is append-only versioned: the new version is **`this.version(24)`** (current max is 23). Do not alter existing version blocks.
- ESM/TS throughout; tests run under Vitest with `fake-indexeddb/auto` (already configured in `src/__tests__/setup.ts`).
- Add dependency `"@ultranos/drug-catalog-sync": "workspace:*"` to `apps/opd-lite/package.json`; run `pnpm install` after.
- Hub base URL pattern (match existing code): `process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'`. Token: `getSupabaseBrowserClient().auth.getSession()` → `data.session?.access_token`.

---

### Task 1: Dexie v24 — mirror + cursor tables, registered as non-PHI

**Files:**
- Modify: `apps/opd-lite/src/lib/db.ts` (add types ~line 130; table props ~line 212; new `this.version(24)` after the v23 block at ~line 631)
- Modify: `apps/opd-lite/src/lib/phi-cleanup.ts:30-36` (extend `PRESERVE_TABLES`)
- Modify: `apps/opd-lite/package.json` (add the workspace dep)
- Test: `apps/opd-lite/src/__tests__/drug-catalog-mirror-schema.test.ts`

**Interfaces:**
- Consumes: `DrugEntry` (`@ultranos/drug-catalog-sync`), `DrugBrand`, `DrugBrandPresentation` (`@ultranos/shared-types`).
- Produces on `db`: `drugCatalogMirror!: EntityTable<DrugEntry, 'atcCode'>`, `drugBrandsMirror!: EntityTable<DrugBrand, 'id'>`, `drugBrandPresentationsMirror!: EntityTable<DrugBrandPresentation, 'id'>`, `drugCatalogSyncMeta!: EntityTable<CatalogSyncMetaEntry, 'key'>`; and `interface CatalogSyncMetaEntry { key: string; value: string }`.

- [ ] **Step 1: Add the workspace dependency and install**

In `apps/opd-lite/package.json`, add to `dependencies` (keep alphabetical with the other `@ultranos/*` entries):
```json
"@ultranos/drug-catalog-sync": "workspace:*",
```
Run: `pnpm install`
Expected: links the package; exits 0.

- [ ] **Step 2: Write the failing test**

`apps/opd-lite/src/__tests__/drug-catalog-mirror-schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { PHI_TABLES, PRESERVE_TABLES } from '@/lib/phi-cleanup'

describe('drug-catalog mirror schema (v24)', () => {
  it('creates the mirror + cursor tables', async () => {
    await db.open()
    const names = db.tables.map((t) => t.name)
    expect(names).toContain('drugCatalogMirror')
    expect(names).toContain('drugBrandsMirror')
    expect(names).toContain('drugBrandPresentationsMirror')
    expect(names).toContain('drugCatalogSyncMeta')
  })

  it('round-trips a mirror drug keyed by atcCode (plaintext, no encryption)', async () => {
    await db.drugCatalogMirror.put({
      atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil'],
      doseForms: ['capsule'], therapeuticClass: 'Penicillins',
    } as never)
    const row = await db.drugCatalogMirror.get('J01CA04')
    expect(row?.innName).toBe('Amoxicillin')
  })

  it('classifies the new tables as non-PHI (PRESERVE_TABLES), keeping full coverage', async () => {
    for (const t of ['drugCatalogMirror', 'drugBrandsMirror', 'drugBrandPresentationsMirror', 'drugCatalogSyncMeta']) {
      expect(PRESERVE_TABLES as readonly string[]).toContain(t)
      expect(PHI_TABLES as readonly string[]).not.toContain(t)
    }
    const all = [...PHI_TABLES, ...PRESERVE_TABLES].sort()
    const dexieTables = db.tables.map((t) => t.name).sort()
    for (const name of dexieTables) {
      expect(all).toContain(name)
    }
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F opd-lite test drug-catalog-mirror-schema`
Expected: FAIL — tables don't exist / `PRESERVE_TABLES` missing the names.

- [ ] **Step 4: Add the types and table declarations in `db.ts`**

Near the other vocabulary types (after `VocabInteractionEntry`, ~line 130), add:
```typescript
// --- Drug-catalog mirror (Phase 1 — enriched catalog/brands, non-PHI reference data) ---
export interface CatalogSyncMetaEntry {
  key: string   // primary key — e.g. 'catalogVersion'
  value: string
}
```

Add the imports near the top of `db.ts` (with the other type imports):
```typescript
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
```

In the `OpdLiteDatabase` class, after `encryptionMigrations!` (~line 212), add:
```typescript
  drugCatalogMirror!: EntityTable<DrugEntry, 'atcCode'>
  drugBrandsMirror!: EntityTable<DrugBrand, 'id'>
  drugBrandPresentationsMirror!: EntityTable<DrugBrandPresentation, 'id'>
  drugCatalogSyncMeta!: EntityTable<CatalogSyncMetaEntry, 'key'>
```

After the `this.version(23)` block (closes at ~line 631), add:
```typescript
    // v24: Phase 1 — enriched drug-catalog mirror + brands (non-PHI reference data).
    // Plaintext (not in the encryption middleware config); preserved across logout.
    // brandNames is a multiEntry index so a brand-name search finds the generic.
    this.version(24).stores({
      drugCatalogMirror: '&atcCode, innName, *brandNames',
      drugBrandsMirror: '&id, genericAtcCode',
      drugBrandPresentationsMirror: '&id, brandId',
      drugCatalogSyncMeta: '&key',
    })
```

- [ ] **Step 5: Register the tables as non-PHI in `phi-cleanup.ts`**

Replace the `PRESERVE_TABLES` array (lines 30-36) with:
```typescript
export const PRESERVE_TABLES = [
  'syncQueue',
  'clientAuditLog',
  'vocabularyMedications',
  'vocabularyIcd10',
  'vocabularyInteractions',
  'drugCatalogMirror',
  'drugBrandsMirror',
  'drugBrandPresentationsMirror',
  'drugCatalogSyncMeta',
] as const
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm -F opd-lite test drug-catalog-mirror-schema`
Expected: PASS (3 tests). Also run the existing guard: `pnpm -F opd-lite test phi-cleanup` → PASS.

- [ ] **Step 7: Commit** — SKIP (no commits this phase; leave changes in the working tree).

---

### Task 2: `DexieDrugCatalogStore` adapter

**Files:**
- Create: `apps/opd-lite/src/lib/drug-catalog-store.ts`
- Test: `apps/opd-lite/src/__tests__/drug-catalog-store.test.ts`

**Interfaces:**
- Consumes: `DrugCatalogStore`, `CursorKey`, `DrugEntry` (`@ultranos/drug-catalog-sync`); `DrugBrand`, `DrugBrandPresentation` (`@ultranos/shared-types`); `db` (`@/lib/db`).
- Produces: `class DexieDrugCatalogStore implements DrugCatalogStore` and `function createDexieDrugCatalogStore(): DrugCatalogStore`.

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/drug-catalog-store.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createDexieDrugCatalogStore } from '@/lib/drug-catalog-store'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const entry = (atcCode: string, innName: string): DrugEntry =>
  ({ atcCode, innName, brandNames: [], doseForms: [], therapeuticClass: '' }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  await db.drugBrandsMirror.clear()
  await db.drugBrandPresentationsMirror.clear()
  await db.drugCatalogSyncMeta.clear()
})

describe('DexieDrugCatalogStore', () => {
  it('round-trips cursors via the meta table', async () => {
    const store = createDexieDrugCatalogStore()
    expect(await store.getCursor('catalogVersion')).toBeNull()
    await store.setCursor('catalogVersion', '42')
    expect(await store.getCursor('catalogVersion')).toBe('42')
  })

  it('upserts drugs keyed by atcCode', async () => {
    const store = createDexieDrugCatalogStore()
    await store.upsertDrugs([entry('A', 'Aspirin'), entry('B', 'Bisoprolol')])
    await store.upsertDrugs([entry('A', 'Aspirin (updated)')])
    expect(await db.drugCatalogMirror.count()).toBe(2)
    expect((await db.drugCatalogMirror.get('A'))?.innName).toBe('Aspirin (updated)')
  })

  it('upserts brands and presentations keyed by id', async () => {
    const store = createDexieDrugCatalogStore()
    await store.upsertBrands([{ id: 'b1', genericAtcCode: 'A' } as never])
    await store.upsertPresentations([{ id: 'p1', brandId: 'b1' } as never])
    expect(await db.drugBrandsMirror.count()).toBe(1)
    expect(await db.drugBrandPresentationsMirror.count()).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test drug-catalog-store`
Expected: FAIL — `Cannot find module '@/lib/drug-catalog-store'`.

- [ ] **Step 3: Write the implementation**

`apps/opd-lite/src/lib/drug-catalog-store.ts`:
```typescript
import type { DrugCatalogStore, CursorKey, DrugEntry } from '@ultranos/drug-catalog-sync'
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
import { db } from './db'

/**
 * Dexie-backed mirror store for the enriched drug catalog (non-PHI, plaintext).
 * Implements the @ultranos/drug-catalog-sync DrugCatalogStore contract so the
 * shared sync orchestrator can write into OPD-Lite's IndexedDB.
 */
export class DexieDrugCatalogStore implements DrugCatalogStore {
  async getCursor(key: CursorKey): Promise<string | null> {
    const row = await db.drugCatalogSyncMeta.get(key)
    return row?.value ?? null
  }

  async setCursor(key: CursorKey, value: string): Promise<void> {
    await db.drugCatalogSyncMeta.put({ key, value })
  }

  async upsertDrugs(entries: DrugEntry[]): Promise<void> {
    await db.drugCatalogMirror.bulkPut(entries)
  }

  async upsertBrands(brands: DrugBrand[]): Promise<void> {
    await db.drugBrandsMirror.bulkPut(brands)
  }

  async upsertPresentations(presentations: DrugBrandPresentation[]): Promise<void> {
    await db.drugBrandPresentationsMirror.bulkPut(presentations)
  }
}

export function createDexieDrugCatalogStore(): DrugCatalogStore {
  return new DexieDrugCatalogStore()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F opd-lite test drug-catalog-store`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 3: `syncDrugCatalog` runner (wired client + throttle/online-gate/single-flight)

**Files:**
- Create: `apps/opd-lite/src/lib/drug-catalog-sync.ts`
- Test: `apps/opd-lite/src/__tests__/drug-catalog-sync.test.ts`

**Interfaces:**
- Consumes: `createCatalogClient`, `runCatalogSync`, `runBrandSync`, `CatalogClient`, `DrugCatalogStore` (`@ultranos/drug-catalog-sync`); `createDexieDrugCatalogStore` (Task 2); `getSupabaseBrowserClient` (`@/lib/supabase`).
- Produces:
  - `function runDrugCatalogSync(store: DrugCatalogStore, client: CatalogClient): Promise<{ drugs: number; brands: number; presentations: number }>` — testable core.
  - `function syncDrugCatalog(): Promise<void>` — wired, online-gated (`navigator.onLine`), single-flight, throttled 15 min via the `lastSyncAt` cursor.
  - `const CATALOG_SYNC_THROTTLE_MS = 15 * 60 * 1000`

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/drug-catalog-sync.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { runDrugCatalogSync } from '@/lib/drug-catalog-sync'
import { InMemoryDrugCatalogStore } from '@ultranos/drug-catalog-sync'
import type { CatalogClient } from '@ultranos/drug-catalog-sync'

function fakeClient(): CatalogClient {
  let d = 0
  return {
    async syncDrugs() {
      d++
      return d === 1
        ? { entries: [{ atcCode: 'A', innName: 'Aspirin', brandNames: [], doseForms: [], therapeuticClass: '' } as never], latestVersion: 1 }
        : { entries: [], latestVersion: 1 }
    },
    async syncBrands() { return { brands: [], latestVersion: 0 } },
    async syncBrandPresentations() { return { presentations: [], latestVersion: 0 } },
  }
}

describe('runDrugCatalogSync', () => {
  it('drives catalog + brand sync into the store and reports counts', async () => {
    const store = new InMemoryDrugCatalogStore()
    const result = await runDrugCatalogSync(store, fakeClient())
    expect(result.drugs).toBe(1)
    expect(store.drugs.get('A')?.innName).toBe('Aspirin')
    expect(await store.getCursor('catalogVersion')).toBe('1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test drug-catalog-sync`
Expected: FAIL — `Cannot find module '@/lib/drug-catalog-sync'`.

- [ ] **Step 3: Write the implementation**

`apps/opd-lite/src/lib/drug-catalog-sync.ts`:
```typescript
import {
  createCatalogClient,
  runCatalogSync,
  runBrandSync,
  type CatalogClient,
  type DrugCatalogStore,
} from '@ultranos/drug-catalog-sync'
import { createDexieDrugCatalogStore } from './drug-catalog-store'
import { getSupabaseBrowserClient } from './supabase'

export const CATALOG_SYNC_THROTTLE_MS = 15 * 60 * 1000

function getHubApiUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}

/** Testable core: run catalog + brand delta sync into the given store. */
export async function runDrugCatalogSync(
  store: DrugCatalogStore,
  client: CatalogClient,
): Promise<{ drugs: number; brands: number; presentations: number }> {
  const catalog = await runCatalogSync(store, client)
  let brands = 0
  let presentations = 0
  try {
    const b = await runBrandSync(store, client)
    brands = b.brandsSynced
    presentations = b.presentationsSynced
  } catch {
    // Brand sync is best-effort — never block the catalog sync on it.
  }
  return { drugs: catalog.drugsSynced, brands, presentations }
}

let running = false

/** Wired entry point: online-gated, single-flight, throttled (15 min). */
export async function syncDrugCatalog(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return
  if (running) return
  running = true
  try {
    const store = createDexieDrugCatalogStore()
    const lastSyncAt = await store.getCursor('lastSyncAt')
    if (lastSyncAt && Date.now() - Date.parse(lastSyncAt) < CATALOG_SYNC_THROTTLE_MS) return

    const client = createCatalogClient({
      baseUrl: getHubApiUrl(),
      getToken: async () => {
        const { data } = await getSupabaseBrowserClient().auth.getSession()
        return data.session?.access_token ?? null
      },
    })
    await runDrugCatalogSync(store, client)
  } catch {
    // Sync failure is non-fatal — the mirror simply stays at its last version.
  } finally {
    running = false
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F opd-lite test drug-catalog-sync`
Expected: PASS (1 test).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 4: 1B — mirror-backed offline search (brand→generic), vocab fallback

**Files:**
- Modify: `apps/opd-lite/src/lib/medication-search.ts`
- Test: `apps/opd-lite/src/__tests__/medication-search-mirror.test.ts`

**Interfaces:**
- Consumes: `db.drugCatalogMirror`, `DrugEntry`; existing `MedicationItem`, `MedicationSearchResult`, `searchMedications`.
- Produces: unchanged public signature of `searchMedications`; internal `searchMirror` + `mirrorEntryToItems`.

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/medication-search-mirror.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { searchMedications } from '@/lib/medication-search'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const drug = (atcCode: string, innName: string, brandNames: string[]): DrugEntry =>
  ({ atcCode, innName, brandNames, doseForms: ['tablet'], therapeuticClass: '' }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  // Force the offline branch deterministically.
  vi.stubGlobal('navigator', { onLine: false })
})

describe('searchMedications (mirror-backed offline)', () => {
  it('finds a generic by its brand name from the mirror', async () => {
    await db.drugCatalogMirror.bulkPut([
      drug('J01CR02', 'Amoxicillin/clavulanate', ['Augmentin']),
      drug('C07AB07', 'Bisoprolol', ['Concor']),
    ] as never[])
    const results = await searchMedications('Augmentin')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.item.display).toContain('Amoxicillin')
  })

  it('finds a generic by INN from the mirror', async () => {
    await db.drugCatalogMirror.bulkPut([drug('C07AB07', 'Bisoprolol', ['Concor'])] as never[])
    const results = await searchMedications('Bisopro')
    expect(results[0]!.item.code).toBe('C07AB07')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test medication-search-mirror`
Expected: FAIL — offline search still reads only `vocabularyMedications` (empty) → no results.

- [ ] **Step 3: Modify `medication-search.ts`**

Add imports at the top (after the existing imports):
```typescript
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
```

Add these helpers above `searchLocal`:
```typescript
function mirrorEntryToItems(e: DrugEntry): MedicationItem[] {
  const form = e.doseForms[0] ?? ''
  const generic: MedicationItem = { code: e.atcCode, display: e.innName, form, strength: '' }
  // One item per brand name so a brand query surfaces (and labels) the generic.
  const brands: MedicationItem[] = (e.brandNames ?? []).map((b) => ({
    code: e.atcCode,
    display: `${e.innName} (${b})`,
    form,
    strength: '',
  }))
  return [generic, ...brands]
}

async function searchMirror(trimmed: string): Promise<MedicationSearchResult[] | null> {
  const total = await db.drugCatalogMirror.count()
  if (total === 0) return null // cold start — caller falls back to vocab seed

  const lower = trimmed.toLowerCase()
  const byName = await db.drugCatalogMirror
    .where('innName')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()
  const byBrand = await db.drugCatalogMirror
    .where('brandNames')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()

  let candidates = [...byName, ...byBrand]
  if (candidates.length < 10) {
    candidates = await db.drugCatalogMirror.limit(1000).toArray()
  }
  // De-dupe entries by atcCode before expanding to items.
  const seen = new Set<string>()
  const items: MedicationItem[] = []
  for (const e of candidates) {
    if (seen.has(e.atcCode)) continue
    seen.add(e.atcCode)
    items.push(...mirrorEntryToItems(e))
  }
  const fuse = new Fuse(items, fuseOptions)
  return fuse.search(lower, { limit: 20 }).map((r) => ({ item: r.item, matches: r.matches }))
}
```

Change `searchLocal` (the offline path) to prefer the mirror:
```typescript
async function searchLocal(trimmed: string): Promise<MedicationSearchResult[]> {
  const fromMirror = await searchMirror(trimmed)
  if (fromMirror !== null) return fromMirror

  // Fallback (pre-first-sync cold start): the JSON-seeded vocabulary.
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F opd-lite test medication-search-mirror`
Expected: PASS (2 tests). Then run the existing suites to confirm no regression (mirror empty → vocab fallback path unchanged):
Run: `pnpm -F opd-lite test medication-search vocab-search`
Expected: PASS.

- [ ] **Step 5: Commit** — SKIP.

---

### Task 5: 1A — mirror-backed interaction adapter (enriched interactions), vocab fallback

**Files:**
- Create: `apps/opd-lite/src/lib/mirror-drug-adapter.ts`
- Modify: `apps/opd-lite/src/services/interactionService.ts`
- Test: `apps/opd-lite/src/__tests__/mirror-drug-adapter.test.ts`

**Interfaces:**
- Consumes: `DrugDatabaseAdapter`, `VocabInteractionEntry` (`@ultranos/drug-db`); `DrugEntry` and `DrugInteraction` (via `@ultranos/shared-types`); `db.drugCatalogMirror`, `db.drugCatalogSyncMeta`; existing `createDexieDrugAdapter`, `syncDrugCatalog`.
- Produces: `function createMirrorDrugAdapter(): DrugDatabaseAdapter`; `function resolveDrugAdapter(): Promise<DrugDatabaseAdapter>` (mirror if populated, else the vocab adapter).

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/mirror-drug-adapter.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createMirrorDrugAdapter } from '@/lib/mirror-drug-adapter'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

const withInteractions = (): DrugEntry =>
  ({
    atcCode: 'B01AA03', innName: 'Warfarin', brandNames: [], doseForms: ['tablet'], therapeuticClass: '',
    interactions: [
      { drugAtcCode: 'N02BA01', drugName: 'Aspirin', severity: 'MAJOR', mechanism: 'Additive bleeding risk' },
    ],
  }) as unknown as DrugEntry

beforeEach(async () => {
  await db.open()
  await db.drugCatalogMirror.clear()
  await db.drugCatalogSyncMeta.clear()
})

describe('mirror-backed drug adapter', () => {
  it('flattens entry.interactions into pairwise vocab rows', async () => {
    await db.drugCatalogMirror.put(withInteractions() as never)
    const adapter = createMirrorDrugAdapter()
    const rows = await adapter.getInteractions()
    expect(rows).toContainEqual({
      drugA: 'Warfarin', drugB: 'Aspirin', severity: 'MAJOR', description: 'Additive bleeding risk',
    })
  })

  it('reports metadata from the catalog cursor', async () => {
    await db.drugCatalogSyncMeta.put({ key: 'lastSyncAt', value: '2026-06-23T00:00:00.000Z' })
    await db.drugCatalogSyncMeta.put({ key: 'catalogVersion', value: '99' })
    const adapter = createMirrorDrugAdapter()
    const meta = await adapter.getMetadata!()
    expect(meta?.version).toBe(99)
    expect(meta?.lastUpdatedAt).toBe('2026-06-23T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test mirror-drug-adapter`
Expected: FAIL — `Cannot find module '@/lib/mirror-drug-adapter'`.

- [ ] **Step 3: Write the adapter**

`apps/opd-lite/src/lib/mirror-drug-adapter.ts`:
```typescript
import type { DrugDatabaseAdapter, VocabInteractionEntry } from '@ultranos/drug-db'
import type { DrugInteraction } from '@ultranos/shared-types'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { db } from './db'
import { createDexieDrugAdapter } from './dexie-drug-adapter'

interface MaybeWithInteractions { innName: string; interactions?: DrugInteraction[] }

/**
 * DrugDatabaseAdapter backed by the enriched on-device catalog mirror.
 * Flattens each drug's structured interactions into the pairwise rows the
 * @ultranos/drug-db checker expects. Read-only; non-PHI.
 */
export function createMirrorDrugAdapter(): DrugDatabaseAdapter {
  return {
    async getInteractions(): Promise<VocabInteractionEntry[]> {
      const entries = (await db.drugCatalogMirror.toArray()) as unknown as MaybeWithInteractions[]
      const rows: VocabInteractionEntry[] = []
      for (const e of entries) {
        for (const ix of e.interactions ?? []) {
          rows.push({
            drugA: e.innName,
            drugB: ix.drugName,
            severity: ix.severity,
            description: ix.mechanism,
          })
        }
      }
      return rows
    },

    async getMetadata() {
      const last = await db.drugCatalogSyncMeta.get('lastSyncAt')
      if (!last?.value) return null
      const ver = await db.drugCatalogSyncMeta.get('catalogVersion')
      return { lastUpdatedAt: last.value, version: ver?.value ? parseInt(ver.value, 10) : 0 }
    },
  }
}

/** Use the mirror adapter once the catalog has synced; else the JSON-seeded vocab adapter. */
export async function resolveDrugAdapter(): Promise<DrugDatabaseAdapter> {
  const count = await db.drugCatalogMirror.count()
  return count > 0 ? createMirrorDrugAdapter() : createDexieDrugAdapter()
}
```

- [ ] **Step 4: Wire `interactionService.ts` to the mirror adapter (with fallback + sync trigger)**

In `apps/opd-lite/src/services/interactionService.ts`, replace the static singleton adapter and the `onStale` wiring:

Replace line 13 import and line 26 singleton:
```typescript
import { resolveDrugAdapter } from '@/lib/mirror-drug-adapter'
import { syncDrugCatalog } from '@/lib/drug-catalog-sync'
```
(remove the old `import { createDexieDrugAdapter } from '@/lib/dexie-drug-adapter'` and `import { syncAllVocabulary } from '@/lib/vocabulary-sync'` lines, and delete `const adapter = createDexieDrugAdapter()`).

In `checkInteractions`, resolve the adapter per call and point `onStale` at the catalog sync:
```typescript
  const adapter = await resolveDrugAdapter()

  let optionsWithStale: FhirAllergyIntolerance[] | InteractionCheckOptions | undefined = allergiesOrOptions
  if (allergiesOrOptions && !Array.isArray(allergiesOrOptions)) {
    optionsWithStale = {
      ...allergiesOrOptions,
      onStale: () => { syncDrugCatalog().catch(() => {}) },
    }
  } else if (!allergiesOrOptions || Array.isArray(allergiesOrOptions)) {
    optionsWithStale = {
      activeAllergies: Array.isArray(allergiesOrOptions) ? allergiesOrOptions : undefined,
      onStale: () => { syncDrugCatalog().catch(() => {}) },
    }
  }

  return _checkInteractions(newDrugDisplay, activeMedDisplayNames, optionsWithStale, adapter)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F opd-lite test mirror-drug-adapter`
Expected: PASS (2 tests).
Then confirm the existing interaction + allergy safety suites still pass (cold-start fallback path unchanged):
Run: `pnpm -F opd-lite test interaction-service allergy-interaction medication-statement-interaction`
Expected: PASS.

- [ ] **Step 6: Commit** — SKIP.

---

### Task 6: Sign-in sync trigger + phase verification

**Files:**
- Modify: `apps/opd-lite/src/components/providers/SyncProvider.tsx`
- Test: `apps/opd-lite/src/__tests__/sync-provider-catalog.test.tsx` (lightweight — asserts the trigger is invoked on auth)

**Interfaces:**
- Consumes: `syncDrugCatalog` (Task 3).

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/sync-provider-catalog.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const syncDrugCatalog = vi.fn(async () => {})
vi.mock('@/lib/drug-catalog-sync', () => ({ syncDrugCatalog }))

beforeEach(() => { syncDrugCatalog.mockClear() })

describe('SyncProvider catalog trigger', () => {
  it('calls syncDrugCatalog when authenticated', async () => {
    // Importing after the mock is registered; the provider effect calls the trigger.
    const { triggerCatalogSyncOnAuth } = await import('@/components/providers/SyncProvider')
    await triggerCatalogSyncOnAuth(true)
    expect(syncDrugCatalog).toHaveBeenCalledTimes(1)
  })

  it('does not call it when unauthenticated', async () => {
    const { triggerCatalogSyncOnAuth } = await import('@/components/providers/SyncProvider')
    await triggerCatalogSyncOnAuth(false)
    expect(syncDrugCatalog).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test sync-provider-catalog`
Expected: FAIL — `triggerCatalogSyncOnAuth` is not exported.

- [ ] **Step 3: Add the trigger to `SyncProvider.tsx`**

Add the import near the top:
```typescript
import { syncDrugCatalog } from '@/lib/drug-catalog-sync'
```

Add this exported helper above the `SyncProvider` component (so it is unit-testable and reused by the effect):
```typescript
/** Fire-and-forget enriched-catalog sync on sign-in (online-gated/throttled inside). */
export async function triggerCatalogSyncOnAuth(isAuthenticated: boolean): Promise<void> {
  if (!isAuthenticated) return
  await syncDrugCatalog()
}
```

Inside the `useEffect`, in the authenticated branch (after `startedRef.current = true`, near line 72), add:
```typescript
    // Phase 1: refresh the enriched drug-catalog mirror on sign-in (best-effort).
    void triggerCatalogSyncOnAuth(true)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F opd-lite test sync-provider-catalog`
Expected: PASS (2 tests).

- [ ] **Step 5: Phase verification**

Run, in order:
```bash
pnpm -F opd-lite test drug-catalog-mirror-schema drug-catalog-store drug-catalog-sync medication-search-mirror mirror-drug-adapter sync-provider-catalog
pnpm -F opd-lite test          # full OPD suite — no regressions
pnpm -F opd-lite typecheck
pnpm -F @ultranos/drug-catalog-sync build   # ensure the consumed package is built for resolution
```
Expected: all green. (If `opd-lite` resolves `@ultranos/drug-catalog-sync` from `dist`, the build step must run first; if it resolves from source via the workspace `exports`, it is already fine.)

- [ ] **Step 6: Commit** — SKIP (leave all changes in the working tree for the user to review/stage).

---

## Self-Review

**1. Spec coverage** (Phase 1 = 1A enriched interactions + 1B comprehensive offline search, Path B full mirror):
- Mirror tables + non-PHI registration → Task 1. ✓
- Dexie store adapter (Phase 0 consumer) → Task 2. ✓
- Sync runner (catalog + brands) + throttle/online-gate/single-flight → Task 3. ✓
- 1B brand→generic offline search from the mirror, vocab fallback → Task 4. ✓
- 1A enriched interactions via mirror-backed adapter, vocab fallback, checker untouched, Rule #3 preserved → Task 5. ✓
- Sign-in + onStale sync triggers → Tasks 5 & 6. ✓
- Full tiered mirror stored (Phase 3-ready) → Task 1 stores whole `DrugEntry`. ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling". Every code step is complete. The only conditional is Task 6 Step 5's build-order note, which is an explicit instruction, not a placeholder. ✓

**3. Type consistency:** `DrugEntry` (Phase 0) used identically across Tasks 1, 2, 4, 5. `CatalogSyncMetaEntry { key, value }` defined in Task 1, consumed by the store (Task 2) and adapter (Task 5). Cursor keys (`catalogVersion`, `lastSyncAt`) match Phase 0's `CursorKey`. `DrugInteraction` fields (`drugName`, `severity`, `mechanism`) match `@ultranos/shared-types`. Adapter returns `VocabInteractionEntry { drugA, drugB, severity, description }` exactly. ✓

**Risk noted (Minor, for the final review):** `getInteractions()` flattens all mirror interactions in memory per cache rebuild (~tens of thousands of rows at full catalog coverage). The checker caches via `invalidateCache`, so rebuilds are infrequent, but if profiling shows cost, index a dedicated interactions table in a later pass. Not a Phase-1 blocker.

---

## Execution Handoff

Plan complete. Execution will be **subagent-driven, no commits** (per the standing decision this session): an implementer builds the package consumer task-by-task via TDD leaving changes in the working tree, a task reviewer gates spec + quality, fixes loop, then a final review.
