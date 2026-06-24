# Phase 2 — Foundation (QR ATC field + Pharmacy-Lite catalog mirror) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation the Phase 2 Pharmacy-Lite features (substitution, recall guard, PriceCard, interaction recheck) all depend on — (1) carry an explicit ATC code in the signed prescription QR so Pharmacy can reliably resolve a prescribed med to a generic; (2) make Pharmacy-Lite the second consumer of `@ultranos/drug-catalog-sync` with an on-device enriched-catalog + brands mirror.

**Architecture:** The QR `atc` field is added to OPD-Lite's `CompactRx` (populated only when the medication code is ATC-shaped) and Pharmacy-Lite's `VerifiedPrescription` type — it rides the existing signed JSON payload, so no signing or shared-types change. The Pharmacy mirror reuses the Phase 1 OPD pattern: non-PHI Dexie tables at schema **v13**, a Dexie-backed `DrugCatalogStore`, a wired `syncDrugCatalog` runner, and a mirror-backed `DrugDatabaseAdapter`.

**Tech Stack:** Next.js 15 PWAs, TypeScript, Dexie (IndexedDB), Vitest + `fake-indexeddb`, `@ultranos/drug-catalog-sync`, `@ultranos/drug-db`, `@ultranos/shared-types`.

## Decisions (locked this session)
- **D1 — explicit ATC in the QR** (user choice). Implemented as an app-local `atc?` field on both ends; rides the signed payload (no shared-types/signing change).
- **D2 — Pharmacy interaction recheck (later feature phase) will use Hub-fetched active meds + local allergies** (user choice). This Foundation only builds the on-device mirror + adapter the recheck will read; the Hub active-meds fetch lands in the Features plan.
- **D3 — flattening duplication:** the `entry.interactions → pairwise` flatten is duplicated in Pharmacy's adapter (≈12 lines, identical to OPD's `mirror-drug-adapter.ts`). A future DRY pass can lift it into `@ultranos/drug-catalog-sync`; not now, to avoid re-touching the committed package.

## Global Constraints
- New Pharmacy Dexie tables are **non-PHI reference data**: plaintext (NOT added to `PHI_TABLE_CONFIGS` in `db.ts`), and MUST be added to `PRESERVE_TABLES` in `apps/pharmacy-lite/src/lib/phi-cleanup.ts`.
- Pharmacy Dexie schema is append-only; current max is **v12**, new tables go at **`this.version(13)`**.
- **Rule #3 (safety):** the mirror-backed interaction adapter must never imply "no interactions" on missing data; an empty mirror yields zero rows (the consuming checker returns UNAVAILABLE — never CLEAR). The `@ultranos/drug-db` checker is not modified.
- **Rule #1 (PHI):** catalog/brands are non-PHI; log only counts. The QR `atc` is a non-PHI drug code (ATC), safe to carry.
- Pharmacy hub token: `useAuthSessionStore.getState().getAccessToken()`. Hub URL: `getHubApiUrl()` from `@/lib/trpc`.
- `@ultranos/drug-catalog-sync` is already built (`dist/`). If Pharmacy fails to resolve it at runtime, run `pnpm -F @ultranos/drug-catalog-sync build`.
- Tests: `pnpm -F pharmacy-lite test <pattern>` and `pnpm -F opd-lite test <pattern>` (both have `fake-indexeddb/auto` in setup).

---

### Task 1: QR `atc` field (OPD encode + Pharmacy decode type)

**Files:**
- Modify: `apps/opd-lite/src/lib/compress-prescription.ts`
- Modify: `apps/pharmacy-lite/src/lib/prescription-verify.ts:9-28` (the `VerifiedPrescription` interface)
- Test: `apps/opd-lite/src/__tests__/compress-prescription-atc.test.ts`

**Interfaces:**
- Produces: `CompactRx.atc?: string` (OPD) and `VerifiedPrescription.atc?: string` (Pharmacy), populated from the medication coding code when it is ATC-shaped.

- [ ] **Step 1: Write the failing test**

`apps/opd-lite/src/__tests__/compress-prescription-atc.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { compressPrescription } from '@/lib/compress-prescription'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'

function rx(code: string): FhirMedicationRequestZod {
  return {
    id: 'rx-1',
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:formulary', code, display: 'Amoxicillin' }],
      text: 'Amoxicillin 500mg (Capsule)',
    },
    subject: { reference: 'Patient/p-1' },
    requester: { reference: 'Practitioner/dr-1' },
    authoredOn: '2026-06-24T00:00:00.000Z',
    dosageInstruction: [{ sequence: 1, text: '1 capsule', doseAndRate: [{ doseQuantity: { value: 1, unit: 'capsule' } }] }],
    dispenseRequest: { expectedSupplyDuration: { value: 7, unit: 'd' } },
  } as unknown as FhirMedicationRequestZod
}

describe('compressPrescription — atc field', () => {
  it('populates atc when the code is ATC-shaped', () => {
    const compact = JSON.parse(compressPrescription([rx('J01CA04')]))
    expect(compact[0].atc).toBe('J01CA04')
    expect(compact[0].med).toBe('J01CA04')
  })

  it('omits atc when the code is not ATC-shaped (e.g. legacy RX code)', () => {
    const compact = JSON.parse(compressPrescription([rx('RX001')]))
    expect(compact[0].atc).toBeUndefined()
    expect(compact[0].med).toBe('RX001')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F opd-lite test compress-prescription-atc`
Expected: FAIL — `compact[0].atc` is undefined for the ATC case.

- [ ] **Step 3: Add `atc` to `CompactRx` and populate it**

In `apps/opd-lite/src/lib/compress-prescription.ts`, add the field to the interface (after `med: string` at line 21):
```typescript
  atc?: string      // ATC code when the medication code is ATC-shaped (Phase 2 — for pharmacy brand/recall/interaction lookups)
```

Add this helper above `compressPrescription`:
```typescript
/** ATC codes start with a letter followed by two digits (e.g. J01CA04, A12AA). */
function asAtcCode(code: string): string | undefined {
  return /^[A-Z]\d{2}/.test(code) ? code : undefined
}
```

In the `compact` map, after setting `med`, add `atc`:
```typescript
    const result: CompactRx = {
      id: rx.id,
      med: rx.medicationCodeableConcept.coding?.[0]?.code ?? '',
      medN: rx.medicationCodeableConcept.coding?.[0]?.display ?? '',
      medT: rx.medicationCodeableConcept.text ?? '',
      dos: compactDosage(rx),
      dur: rx.dispenseRequest?.expectedSupplyDuration?.value ?? 0,
      req: stripRef(rx.requester.reference),
      pat: stripRef(rx.subject.reference),
      at: rx.authoredOn,
    }

    const atc = asAtcCode(rx.medicationCodeableConcept.coding?.[0]?.code ?? '')
    if (atc) result.atc = atc
```
(Keep the existing `encRef` block after this.)

- [ ] **Step 4: Add `atc` to Pharmacy's `VerifiedPrescription` type**

In `apps/pharmacy-lite/src/lib/prescription-verify.ts`, add to the interface (after `med: string` at line 11):
```typescript
  atc?: string      // ATC code carried from the QR (Phase 2) — used for brand/recall/interaction lookups
```
(No runtime change needed — `JSON.parse(bundle.payload)` already carries the field through.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -F opd-lite test compress-prescription-atc`
Expected: PASS (2 tests). Also confirm no regression: `pnpm -F opd-lite test compress prescription-signing` → PASS.
Run: `pnpm -F pharmacy-lite typecheck` → 0 new errors.

- [ ] **Step 6: Commit** — SKIP (leave in working tree).

---

### Task 2: Pharmacy Dexie v13 — mirror + cursor tables, registered non-PHI

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/db.ts`
- Modify: `apps/pharmacy-lite/src/lib/phi-cleanup.ts` (extend `PRESERVE_TABLES`)
- Modify: `apps/pharmacy-lite/package.json` (add `"@ultranos/drug-catalog-sync": "workspace:*"`)
- Test: `apps/pharmacy-lite/src/__tests__/drug-catalog-mirror-schema.test.ts`

**Interfaces:**
- Produces on `db`: `drugCatalogMirror!: EntityTable<DrugEntry, 'atcCode'>`, `drugBrandsMirror!: EntityTable<DrugBrand, 'id'>`, `drugBrandPresentationsMirror!: EntityTable<DrugBrandPresentation, 'id'>`, `drugCatalogSyncMeta!: EntityTable<CatalogSyncMetaEntry, 'key'>`; and `interface CatalogSyncMetaEntry { key: string; value: string }`.

- [ ] **Step 1: Add the dependency and install**

In `apps/pharmacy-lite/package.json` `dependencies`, add (alphabetical with other `@ultranos/*`):
```json
"@ultranos/drug-catalog-sync": "workspace:*",
```
Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

`apps/pharmacy-lite/src/__tests__/drug-catalog-mirror-schema.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { PHI_TABLES, PRESERVE_TABLES } from '@/lib/phi-cleanup'

describe('drug-catalog mirror schema (pharmacy v13)', () => {
  it('creates the mirror + cursor tables', async () => {
    await db.open()
    const names = db.tables.map((t) => t.name)
    expect(names).toContain('drugCatalogMirror')
    expect(names).toContain('drugBrandsMirror')
    expect(names).toContain('drugBrandPresentationsMirror')
    expect(names).toContain('drugCatalogSyncMeta')
  })

  it('round-trips a mirror drug keyed by atcCode (plaintext)', async () => {
    await db.drugCatalogMirror.put({
      atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: ['Amoxil'],
      doseForms: ['capsule'], therapeuticClass: 'Penicillins',
    } as never)
    const row = await db.drugCatalogMirror.get('J01CA04')
    expect(row?.innName).toBe('Amoxicillin')
  })

  it('classifies the new tables as non-PHI (PRESERVE_TABLES)', async () => {
    for (const t of ['drugCatalogMirror', 'drugBrandsMirror', 'drugBrandPresentationsMirror', 'drugCatalogSyncMeta']) {
      expect(PRESERVE_TABLES as readonly string[]).toContain(t)
      expect(PHI_TABLES as readonly string[]).not.toContain(t)
    }
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test drug-catalog-mirror-schema`
Expected: FAIL — tables missing / not in PRESERVE_TABLES.

- [ ] **Step 4: Add types + table declarations in `db.ts`**

Add imports near the top of `apps/pharmacy-lite/src/lib/db.ts`:
```typescript
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
```

Add the meta type near the other local interfaces:
```typescript
export interface CatalogSyncMetaEntry {
  key: string
  value: string
}
```

In the `PharmacyLiteDatabase` class field declarations (after `dataUsage!`), add:
```typescript
  drugCatalogMirror!: EntityTable<DrugEntry, 'atcCode'>
  drugBrandsMirror!: EntityTable<DrugBrand, 'id'>
  drugBrandPresentationsMirror!: EntityTable<DrugBrandPresentation, 'id'>
  drugCatalogSyncMeta!: EntityTable<CatalogSyncMetaEntry, 'key'>
```

After the `this.version(12)` block, add:
```typescript
    // v13: Phase 2 — enriched drug-catalog mirror + brands (non-PHI reference data).
    // Plaintext (not in PHI_TABLE_CONFIGS); preserved across logout.
    this.version(13).stores({
      drugCatalogMirror: '&atcCode, innName, *brandNames',
      drugBrandsMirror: '&id, genericAtcCode',
      drugBrandPresentationsMirror: '&id, brandId',
      drugCatalogSyncMeta: '&key',
    })
```

- [ ] **Step 5: Register the tables as non-PHI in `phi-cleanup.ts`**

Add to the end of the `PRESERVE_TABLES` array (before `] as const`):
```typescript
  // Phase 2: enriched drug-catalog mirror + brands (non-PHI reference data)
  'drugCatalogMirror',
  'drugBrandsMirror',
  'drugBrandPresentationsMirror',
  'drugCatalogSyncMeta',
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm -F pharmacy-lite test drug-catalog-mirror-schema`
Expected: PASS (3 tests). If Pharmacy has a phi-cleanup full-coverage test, run it too: `pnpm -F pharmacy-lite test phi-cleanup` → PASS (the 4 tables are now classified).

- [ ] **Step 7: Commit** — SKIP.

---

### Task 3: Pharmacy `DexieDrugCatalogStore`

**Files:**
- Create: `apps/pharmacy-lite/src/lib/drug-catalog-store.ts`
- Test: `apps/pharmacy-lite/src/__tests__/drug-catalog-store.test.ts`

**Interfaces:**
- Produces: `class DexieDrugCatalogStore implements DrugCatalogStore` + `createDexieDrugCatalogStore(): DrugCatalogStore` (identical contract to OPD's).

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/drug-catalog-store.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
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

describe('Pharmacy DexieDrugCatalogStore', () => {
  it('round-trips cursors', async () => {
    const store = createDexieDrugCatalogStore()
    expect(await store.getCursor('catalogVersion')).toBeNull()
    await store.setCursor('catalogVersion', '7')
    expect(await store.getCursor('catalogVersion')).toBe('7')
  })

  it('upserts drugs / brands / presentations', async () => {
    const store = createDexieDrugCatalogStore()
    await store.upsertDrugs([entry('A', 'Aspirin')])
    await store.upsertBrands([{ id: 'b1', genericAtcCode: 'A' } as never])
    await store.upsertPresentations([{ id: 'p1', brandId: 'b1' } as never])
    expect(await db.drugCatalogMirror.count()).toBe(1)
    expect(await db.drugBrandsMirror.count()).toBe(1)
    expect(await db.drugBrandPresentationsMirror.count()).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test drug-catalog-store`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`apps/pharmacy-lite/src/lib/drug-catalog-store.ts`:
```typescript
import type { DrugCatalogStore, CursorKey, DrugEntry } from '@ultranos/drug-catalog-sync'
import type { DrugBrand, DrugBrandPresentation } from '@ultranos/shared-types'
import { db } from './db'

/** Dexie-backed mirror store for the enriched drug catalog (non-PHI, plaintext). */
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

Run: `pnpm -F pharmacy-lite test drug-catalog-store`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 4: Pharmacy `syncDrugCatalog` runner

**Files:**
- Create: `apps/pharmacy-lite/src/lib/drug-catalog-sync.ts`
- Test: `apps/pharmacy-lite/src/__tests__/drug-catalog-sync.test.ts`

**Interfaces:**
- Produces: `runDrugCatalogSync(store, client): Promise<{ drugs; brands; presentations }>` (testable core) and `syncDrugCatalog(): Promise<void>` (wired, online-gated, single-flight, 15-min throttle).

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/drug-catalog-sync.test.ts`:
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

describe('Pharmacy runDrugCatalogSync', () => {
  it('drives catalog + brand sync into the store', async () => {
    const store = new InMemoryDrugCatalogStore()
    const result = await runDrugCatalogSync(store, fakeClient())
    expect(result.drugs).toBe(1)
    expect(store.drugs.get('A')?.innName).toBe('Aspirin')
    expect(await store.getCursor('catalogVersion')).toBe('1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test drug-catalog-sync`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`apps/pharmacy-lite/src/lib/drug-catalog-sync.ts`:
```typescript
import {
  createCatalogClient,
  runCatalogSync,
  runBrandSync,
  type CatalogClient,
  type DrugCatalogStore,
} from '@ultranos/drug-catalog-sync'
import { createDexieDrugCatalogStore } from './drug-catalog-store'
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export const CATALOG_SYNC_THROTTLE_MS = 15 * 60 * 1000

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
      getToken: async () => useAuthSessionStore.getState().getAccessToken(),
    })
    await runDrugCatalogSync(store, client)
  } catch {
    // Non-fatal — the mirror stays at its last version.
  } finally {
    running = false
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -F pharmacy-lite test drug-catalog-sync`
Expected: PASS (1 test).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 5: Pharmacy mirror-backed interaction adapter

**Files:**
- Create: `apps/pharmacy-lite/src/lib/mirror-drug-adapter.ts`
- Test: `apps/pharmacy-lite/src/__tests__/mirror-drug-adapter.test.ts`

**Interfaces:**
- Produces: `createMirrorDrugAdapter(): DrugDatabaseAdapter` and `resolveDrugAdapter(): Promise<DrugDatabaseAdapter | null>` (mirror adapter when populated, else `null` — the Features-phase recheck treats `null`/empty as UNAVAILABLE, never CLEAR).

Note: Pharmacy has no pre-existing vocab interaction table, so the empty-mirror fallback is `null` (not another adapter). The consuming checker returns UNAVAILABLE when given an adapter over an empty map; a `null` adapter means the caller must surface UNAVAILABLE itself. This preserves Rule #3.

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/mirror-drug-adapter.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '@/lib/db'
import { createMirrorDrugAdapter, resolveDrugAdapter } from '@/lib/mirror-drug-adapter'
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

describe('Pharmacy mirror-backed drug adapter', () => {
  it('flattens entry.interactions into pairwise rows', async () => {
    await db.drugCatalogMirror.put(withInteractions() as never)
    const adapter = createMirrorDrugAdapter()
    const rows = await adapter.getInteractions()
    expect(rows).toContainEqual({
      drugA: 'Warfarin', drugB: 'Aspirin', severity: 'MAJOR', description: 'Additive bleeding risk',
    })
  })

  it('resolveDrugAdapter returns null when the mirror is empty (caller surfaces UNAVAILABLE)', async () => {
    expect(await resolveDrugAdapter()).toBeNull()
  })

  it('resolveDrugAdapter returns an adapter once the mirror is populated', async () => {
    await db.drugCatalogMirror.put(withInteractions() as never)
    expect(await resolveDrugAdapter()).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test mirror-drug-adapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`apps/pharmacy-lite/src/lib/mirror-drug-adapter.ts`:
```typescript
import type { DrugDatabaseAdapter, VocabInteractionEntry } from '@ultranos/drug-db'
import type { DrugInteraction } from '@ultranos/shared-types'
import { db } from './db'

interface MaybeWithInteractions { innName: string; interactions?: DrugInteraction[] }

/**
 * DrugDatabaseAdapter backed by the enriched on-device catalog mirror.
 * Flattens each drug's structured interactions into the pairwise rows the
 * @ultranos/drug-db checker expects. Read-only; non-PHI.
 * (Flatten logic mirrors OPD-Lite's mirror-drug-adapter — see Decision D3.)
 */
export function createMirrorDrugAdapter(): DrugDatabaseAdapter {
  return {
    async getInteractions(): Promise<VocabInteractionEntry[]> {
      const entries = (await db.drugCatalogMirror.toArray()) as unknown as MaybeWithInteractions[]
      const rows: VocabInteractionEntry[] = []
      for (const e of entries) {
        for (const ix of e.interactions ?? []) {
          rows.push({ drugA: e.innName, drugB: ix.drugName, severity: ix.severity, description: ix.mechanism })
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

/** Mirror adapter when the catalog has synced; null otherwise (caller surfaces UNAVAILABLE — never CLEAR). */
export async function resolveDrugAdapter(): Promise<DrugDatabaseAdapter | null> {
  const count = await db.drugCatalogMirror.count()
  return count > 0 ? createMirrorDrugAdapter() : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -F pharmacy-lite test mirror-drug-adapter`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** — SKIP.

---

### Task 6: Sync trigger + phase verification

**Files:**
- Create: `apps/pharmacy-lite/src/hooks/useDrugCatalogSync.ts`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx` (invoke the hook alongside the existing `useCatalogSync`)
- Test: `apps/pharmacy-lite/src/__tests__/use-drug-catalog-sync.test.tsx`

**Interfaces:**
- Produces: `useDrugCatalogSync()` — fires `syncDrugCatalog()` on mount (online-gated/throttled inside).

- [ ] **Step 1: Write the failing test**

`apps/pharmacy-lite/src/__tests__/use-drug-catalog-sync.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const syncDrugCatalog = vi.fn(async () => {})
vi.mock('@/lib/drug-catalog-sync', () => ({ syncDrugCatalog }))

beforeEach(() => { syncDrugCatalog.mockClear() })

describe('useDrugCatalogSync', () => {
  it('fires syncDrugCatalog on mount', async () => {
    const { useDrugCatalogSync } = await import('@/hooks/useDrugCatalogSync')
    renderHook(() => useDrugCatalogSync())
    expect(syncDrugCatalog).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -F pharmacy-lite test use-drug-catalog-sync`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

`apps/pharmacy-lite/src/hooks/useDrugCatalogSync.ts`:
```typescript
import { useEffect } from 'react'
import { syncDrugCatalog } from '@/lib/drug-catalog-sync'

/** Fire-and-forget enriched drug-catalog mirror refresh on mount (online-gated/throttled inside). */
export function useDrugCatalogSync(): void {
  useEffect(() => {
    void syncDrugCatalog()
  }, [])
}
```

- [ ] **Step 4: Wire it into CatalogBrowsePage**

In `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx`, add the import:
```typescript
import { useDrugCatalogSync } from '@/hooks/useDrugCatalogSync'
```
And call it next to the existing `useCatalogSync()` call:
```typescript
  useCatalogSync()
  useDrugCatalogSync()
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -F pharmacy-lite test use-drug-catalog-sync`
Expected: PASS (1 test).

- [ ] **Step 6: Phase verification**

Run, in order:
```bash
pnpm -F @ultranos/drug-catalog-sync build
pnpm -F opd-lite test compress-prescription-atc
pnpm -F pharmacy-lite test drug-catalog-mirror-schema drug-catalog-store drug-catalog-sync mirror-drug-adapter use-drug-catalog-sync
pnpm -F pharmacy-lite test        # full suite — no new regressions
pnpm -F pharmacy-lite typecheck
```
Expected: all new tests green; no new regressions vs. the pre-existing baseline.

- [ ] **Step 7: Commit** — SKIP (leave all changes in the working tree for review/staging).

---

## Self-Review

**1. Spec coverage** (Foundation = QR ATC + Pharmacy mirror prerequisite):
- QR `atc` on both ends, gated on ATC shape → Task 1. ✓
- Pharmacy mirror tables (v13), non-PHI registration → Task 2. ✓
- Dexie store (2nd consumer of the package) → Task 3. ✓
- Wired sync runner (token + throttle/online-gate/single-flight) → Task 4. ✓
- Mirror-backed interaction adapter (Rule #3: empty → null/UNAVAILABLE, never CLEAR) → Task 5. ✓
- Sync trigger → Task 6. ✓
- Deferred to the Features plan: 2A substitution, 2B recall, 2C PriceCard, 2D recheck (incl. the Hub active-meds fetch from D2).

**2. Placeholder scan:** No TBD/TODO. Every code step is complete.

**3. Type consistency:** `DrugEntry`, `DrugCatalogStore`, `CursorKey`, `CatalogClient`, `InMemoryDrugCatalogStore` all from `@ultranos/drug-catalog-sync` (Phase 0). `CatalogSyncMetaEntry { key, value }` defined in Task 2, consumed by Tasks 3 & 5. Cursor keys (`catalogVersion`, `lastSyncAt`) match `CursorKey`. Adapter returns `VocabInteractionEntry { drugA, drugB, severity, description }`. `VerifiedPrescription.atc` (Pharmacy) mirrors `CompactRx.atc` (OPD).

---

## Execution Handoff

Foundation plan complete. Execution: **subagent-driven, no commits** (leave changes in the working tree). After this lands and is reviewed, the **Phase 2 Features** plan (2A substitution picker, 2B recall guard, 2C reference-price PriceCard, 2D interaction recheck with Hub active-meds + local allergies) builds on this mirror + the QR `atc`.
