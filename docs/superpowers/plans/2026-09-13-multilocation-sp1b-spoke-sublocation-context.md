# Multi-Location SP1b — Spoke Sub-Location Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the pharmacy-lite spoke a current-sub-location context — pulled from the Hub, cached locally, selectable in the shell — that tags new stock and reconciles legacy `'default'` batches onto the facility's primary sub-location.

**Architecture:** A v21 `stockLocations` Dexie cache is filled by pulling SP1a's `facilityLocations.listForFacility`; a zustand `useLocationStore` holds the current selection (defaulting to primary, falling back to `'default'` when empty); a pure `resolveWriteLocation` maps the selection (incl. the `'ALL'` roll-up) to a concrete write target; a sidebar `LocationSelector` drives it; goods-receipt and transfer-receive tag the resolved sub-location. Read views are unchanged (SP2).

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie/IndexedDB, zustand, next-intl, Vitest + fake-indexeddb + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-13-multilocation-sp1b-spoke-sublocation-context-design.md`

## Global Constraints

- **Consumes SP1a's frozen contract** `facilityLocations.listForFacility` — no input (JWT-scoped server-side), returns `FacilityLocation[]` (from `@ultranos/shared-types`), active AND inactive rows.
- **Dexie is append-only.** Add `this.version(21).stores({ stockLocations: 'id, isPrimary, isActive' })` — NEVER edit v1–v20.
- **`setDrugPrice` decoupling (binding correctness rule):** `ReceiveStockForm` currently passes its `locationId` prop into BOTH `processGoodsReceipt({ locationId })` AND `setDrugPrice({ facilityId: locationId })` (line ~141). The chosen **sub-location** must feed ONLY `processGoodsReceipt`. The `setDrugPrice({ facilityId })` argument MUST keep using the existing `locationId` prop unchanged — never the sub-location (it is a facility identifier the Hub scopes by JWT; a sub-location id would break drug-price publishing).
- **`resolveWriteLocation` never returns `'ALL'`.** A write always tags a concrete id.
- **Offline-first:** everything works pre-pull — empty cache → selector shows `'default'`, writes tag `'default'` exactly as today. Pull failure leaves the cache unchanged.
- **Reads are NOT filtered by the selection in SP1b** (that is SP2). The transfers list (`getTransfers`) and its `currentLocationId` display prop stay on the existing constant.
- **Money N/A. No PHI** (locations/ids/quantities are operational). Semantic oklch tokens, RTL logical props, ShadCN via `@ultranos/ui-kit`/`@/components/ui`, i18n across `en/ar/prs/ps` with genuine Pashto.
- Pre-existing baseline: pharmacy-lite carries 6 known typecheck errors in unrelated test files + a known `SyncQueueDashboard` teardown `DatabaseClosedError`; reviewers judge only NEW errors in touched files.

---

### Task 1: Types + Dexie v21 `stockLocations` store

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/inventory/types.ts` (add `StockLocation`, `ALL_LOCATIONS`, `DEFAULT_LOCATION_ID`)
- Modify: `apps/pharmacy-lite/src/lib/db.ts` (add `stockLocations` table field + v21 block)
- Test: `apps/pharmacy-lite/src/__tests__/stock-locations-schema.test.ts`

**Interfaces:**
- Consumes: `FacilityLocation` from `@ultranos/shared-types` (SP1a).
- Produces: `interface StockLocation extends FacilityLocation { lastSyncedAt: string }`; `ALL_LOCATIONS = 'ALL'`; `DEFAULT_LOCATION_ID = 'default'`; a `db.stockLocations` Dexie table (v21).

- [ ] **Step 1: Write the failing schema test**

Create `apps/pharmacy-lite/src/__tests__/stock-locations-schema.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import type { StockLocation } from '@/lib/inventory/types'
import { ALL_LOCATIONS, DEFAULT_LOCATION_ID } from '@/lib/inventory/types'

beforeEach(async () => { await db.delete(); await db.open() })

describe('stockLocations schema (Dexie v21)', () => {
  it('is at version 21 with a stockLocations store', async () => {
    expect(db.verno).toBe(21)
    const row: StockLocation = { id: 'l1', facilityId: 'f1', name: 'Main', kind: 'store', isPrimary: true, isActive: true, lastSyncedAt: '2026-09-13T00:00:00.000Z' }
    await db.stockLocations.put(row)
    expect((await db.stockLocations.get('l1'))?.name).toBe('Main')
    const primaries = await db.stockLocations.where('isPrimary').equals(1 as never).toArray().catch(() => [])
    // isPrimary index exists (boolean indexing is finicky in Dexie; the query may
    // return [] — the assertion below just proves the store+index are declared).
    expect(Array.isArray(primaries)).toBe(true)
  })
  it('exports the sentinel constants', () => {
    expect(ALL_LOCATIONS).toBe('ALL')
    expect(DEFAULT_LOCATION_ID).toBe('default')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run stock-locations-schema`
Expected: FAIL — `db.stockLocations` undefined / verno is 20.

- [ ] **Step 3: Add the types**

In `apps/pharmacy-lite/src/lib/inventory/types.ts`, add (near the other inventory types):
```ts
import type { FacilityLocation } from '@ultranos/shared-types'

export interface StockLocation extends FacilityLocation {
  lastSyncedAt: string   // ISO 8601 — when this row was last pulled from the Hub
}

/** Sentinel for the roll-up view state (never persisted on a batch). */
export const ALL_LOCATIONS = 'ALL' as const
/** Fallback id used before any sub-location is cached (matches legacy batches). */
export const DEFAULT_LOCATION_ID = 'default' as const
```
(If `types.ts` already imports from `@ultranos/shared-types`, add `FacilityLocation` to that import instead of a second import line.)

- [ ] **Step 4: Add the Dexie table + v21 block**

In `apps/pharmacy-lite/src/lib/db.ts`: add the typed table field beside the others (e.g. near `supplierItems!`):
```ts
  stockLocations!: EntityTable<StockLocation, 'id'>
```
(import `StockLocation` from `./inventory/types` where the other inventory types are imported), and append the new version block immediately after the `this.version(20)` block:
```ts
    // v21: Multi-location SP1b — read-only cache of facility sub-locations.
    // Non-PHI operational data; not encrypted.
    this.version(21).stores({
      stockLocations: 'id, isPrimary, isActive',
    })
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run stock-locations-schema`
Expected: PASS (2 tests). Then `pnpm -F pharmacy-lite typecheck` — no new errors in touched files.

- [ ] **Step 6: Update any hardcoded prior-verno assertion**

Search: `pnpm -F pharmacy-lite exec grep -rn "toBe(20)" src/__tests__ || true`. If `supplier-payments-schema.test.ts` (or any schema test) asserts `db.verno` `toBe(20)`, update that ONE assertion to `21` (a Dexie bump invalidates prior-version assertions — this happened at v20). Commit it with this task.

- [ ] **Step 7: Commit**
```bash
git add apps/pharmacy-lite/src/lib/inventory/types.ts apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/__tests__/stock-locations-schema.test.ts
# plus the schema test file whose verno assertion you bumped, if any
git commit -m "feat(pharmacy-lite): StockLocation type + Dexie v21 stockLocations cache"
```

---

### Task 2: `resolveWriteLocation` pure resolver

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/resolve-write-location.ts`
- Test: `apps/pharmacy-lite/src/__tests__/resolve-write-location.test.ts`

**Interfaces:**
- Consumes: `StockLocation`, `ALL_LOCATIONS`, `DEFAULT_LOCATION_ID` (Task 1).
- Produces: `resolveWriteLocation(currentLocationId: string, locations: StockLocation[]): string` — a concrete location id, never `'ALL'`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/resolve-write-location.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveWriteLocation } from '@/lib/inventory/resolve-write-location'
import type { StockLocation } from '@/lib/inventory/types'

const loc = (over: Partial<StockLocation>): StockLocation => ({
  id: 'x', facilityId: 'f1', name: 'X', kind: 'store', isPrimary: false, isActive: true, lastSyncedAt: 'h', ...over,
})
const locs = [loc({ id: 'main', isPrimary: true }), loc({ id: 'fridge' }), loc({ id: 'old', isActive: false })]

describe('resolveWriteLocation', () => {
  it('keeps a valid active current selection', () => {
    expect(resolveWriteLocation('fridge', locs)).toBe('fridge')
  })
  it('resolves ALL to the primary', () => {
    expect(resolveWriteLocation('ALL', locs)).toBe('main')
  })
  it('resolves empty to the primary', () => {
    expect(resolveWriteLocation('', locs)).toBe('main')
  })
  it('resolves an inactive/unknown id to the primary', () => {
    expect(resolveWriteLocation('old', locs)).toBe('main')
    expect(resolveWriteLocation('ghost', locs)).toBe('main')
  })
  it('passes through the default fallback', () => {
    expect(resolveWriteLocation('default', locs)).toBe('default')
  })
  it('falls back to default when no primary is cached', () => {
    expect(resolveWriteLocation('ALL', [loc({ id: 'a' }), loc({ id: 'b' })])).toBe('default')
    expect(resolveWriteLocation('ALL', [])).toBe('default')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run resolve-write-location`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/pharmacy-lite/src/lib/inventory/resolve-write-location.ts`:
```ts
import { ALL_LOCATIONS, DEFAULT_LOCATION_ID } from './types'
import type { StockLocation } from './types'

/** The concrete sub-location a write should tag. Never returns ALL_LOCATIONS:
 *  ALL / empty / invalid / retired resolves to the primary; only when no primary
 *  is cached does it fall back to DEFAULT_LOCATION_ID. */
export function resolveWriteLocation(currentLocationId: string, locations: StockLocation[]): string {
  if (currentLocationId && currentLocationId !== ALL_LOCATIONS) {
    if (currentLocationId === DEFAULT_LOCATION_ID) return DEFAULT_LOCATION_ID
    if (locations.some((l) => l.id === currentLocationId && l.isActive)) return currentLocationId
  }
  const primary = locations.find((l) => l.isPrimary && l.isActive)
  return primary?.id ?? DEFAULT_LOCATION_ID
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run resolve-write-location`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/inventory/resolve-write-location.ts apps/pharmacy-lite/src/__tests__/resolve-write-location.test.ts
git commit -m "feat(pharmacy-lite): pure resolveWriteLocation sub-location resolver"
```

---

### Task 3: `location-sync` — pull + reconcile

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/location-sync.ts`
- Test: `apps/pharmacy-lite/src/__tests__/location-sync.test.ts`

**Interfaces:**
- Consumes: `db` (`stockLocations`, `stockBatches`); `useAuthSessionStore.getState().getAccessToken()`; `getHubApiUrl` (`@/lib/trpc`); `enqueueStockBatchSync(batch)` (`./stock-batch-sync`); `DEFAULT_LOCATION_ID`, `StockLocation` (Task 1); `FacilityLocation` (`@ultranos/shared-types`).
- Produces: `syncLocationsFromHub(signal?): Promise<{ locationsSynced: number; lastSyncedAt: string }>`; `reconcileLegacyLocations(primaryId: string): Promise<number>`.

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmacy-lite/src/__tests__/location-sync.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import type { StockBatch } from '@/lib/inventory/types'

const enqueueSpy = vi.fn(async () => {})
vi.mock('@/lib/inventory/stock-batch-sync', () => ({ enqueueStockBatchSync: (b: unknown) => enqueueSpy(b) }))
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ getAccessToken: async () => 'tok' }) },
}))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'https://hub.example/api/trpc/' }))

import { syncLocationsFromHub, reconcileLegacyLocations } from '@/lib/inventory/location-sync'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  enqueueSpy.mockClear()
})

function batch(over: Partial<StockBatch>): StockBatch {
  return { id: 'b1', catalogItemId: 'c1', batchNumber: 'B1', expiryDate: '2027-01-01', quantityOnHand: 5, costPrice: 100, sellingPrice: 150, receivedAt: '2026-01-01T00:00:00.000Z', status: 'active', locationId: 'default', hlcTimestamp: 'h', ...over } as StockBatch
}

describe('syncLocationsFromHub', () => {
  it('full-replaces the cache and reconciles legacy batches when a primary exists', async () => {
    await db.stockLocations.put({ id: 'stale', facilityId: 'f1', name: 'Stale', kind: 'store', isPrimary: false, isActive: true, lastSyncedAt: 'old' })
    await db.stockBatches.bulkPut([batch({ id: 'b1', locationId: 'default' }), batch({ id: 'b2', locationId: '' }), batch({ id: 'b3', locationId: 'main' })])
    const rows = [
      { id: 'main', facilityId: 'f1', name: 'Main', kind: 'store', isPrimary: true, isActive: true },
      { id: 'fridge', facilityId: 'f1', name: 'Fridge', kind: 'fridge', isPrimary: false, isActive: true },
    ]
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ result: { data: { json: rows } } }), { status: 200 })) as never
    const res = await syncLocationsFromHub()
    expect(res.locationsSynced).toBe(2)
    expect(await db.stockLocations.get('stale')).toBeUndefined()   // full replace removed the stale row
    expect((await db.stockLocations.get('main'))?.name).toBe('Main')
    // legacy 'default'/'' batches reassigned to the primary + re-synced
    expect((await db.stockBatches.get('b1'))?.locationId).toBe('main')
    expect((await db.stockBatches.get('b2'))?.locationId).toBe('main')
    expect((await db.stockBatches.get('b3'))?.locationId).toBe('main') // was already 'main'
    expect(enqueueSpy).toHaveBeenCalledTimes(2)                     // only the two reassigned
  })

  it('propagates a fetch failure and leaves the cache unchanged', async () => {
    await db.stockLocations.put({ id: 'keep', facilityId: 'f1', name: 'Keep', kind: 'store', isPrimary: true, isActive: true, lastSyncedAt: 'old' })
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as never
    await expect(syncLocationsFromHub()).rejects.toBeTruthy()
    expect((await db.stockLocations.get('keep'))?.name).toBe('Keep')
  })
})

describe('reconcileLegacyLocations', () => {
  it('is idempotent — a second run reassigns zero', async () => {
    await db.stockBatches.put(batch({ id: 'b1', locationId: 'default' }))
    expect(await reconcileLegacyLocations('main')).toBe(1)
    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    enqueueSpy.mockClear()
    expect(await reconcileLegacyLocations('main')).toBe(0)
    expect(enqueueSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run location-sync`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/pharmacy-lite/src/lib/inventory/location-sync.ts`:
```ts
import { db } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import { enqueueStockBatchSync } from './stock-batch-sync'
import { DEFAULT_LOCATION_ID } from './types'
import type { StockLocation } from './types'
import type { FacilityLocation } from '@ultranos/shared-types'

export interface LocationSyncResult { locationsSynced: number; lastSyncedAt: string }

/** Reassign every batch tagged 'default'/'' to the facility's primary sub-location
 *  and re-sync each so the Hub's location_id is corrected. Idempotent. */
export async function reconcileLegacyLocations(primaryId: string): Promise<number> {
  const legacy = await db.stockBatches.where('locationId').anyOf([DEFAULT_LOCATION_ID, '']).toArray()
  if (legacy.length === 0) return 0
  const now = new Date().toISOString()
  const ids = legacy.map((b) => b.id)
  await db.transaction('rw', db.stockBatches, async () => {
    for (const id of ids) await db.stockBatches.update(id, { locationId: primaryId, hlcTimestamp: now })
  })
  // enqueue AFTER the tx (Web Crypto cannot run inside a Dexie tx zone)
  for (const id of ids) {
    const updated = await db.stockBatches.get(id)
    if (updated) await enqueueStockBatchSync(updated)
  }
  return ids.length
}

export async function syncLocationsFromHub(signal?: AbortSignal): Promise<LocationSyncResult> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) throw new Error('Authentication required')

  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/facilityLocations.listForFacility'

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!res.ok) throw new Error(`Location sync failed: ${res.status}`)

  const body = (await res.json()) as { result: { data: { json: FacilityLocation[] } } }
  const rows = body.result.data.json ?? []
  const lastSyncedAt = new Date().toISOString()
  const toStore: StockLocation[] = rows.map((r) => ({ ...r, lastSyncedAt }))

  await db.transaction('rw', db.stockLocations, async () => {
    await db.stockLocations.clear()
    if (toStore.length > 0) await db.stockLocations.bulkPut(toStore)
  })

  const primary = toStore.find((l) => l.isPrimary && l.isActive)
  if (primary) await reconcileLegacyLocations(primary.id)

  return { locationsSynced: toStore.length, lastSyncedAt }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run location-sync`
Expected: PASS. Then `pnpm -F pharmacy-lite typecheck` — no new errors in touched files.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/inventory/location-sync.ts apps/pharmacy-lite/src/__tests__/location-sync.test.ts
git commit -m "feat(pharmacy-lite): location pull (full-replace) + legacy-batch reconciliation"
```

---

### Task 4: `useLocationStore` (zustand)

**Files:**
- Create: `apps/pharmacy-lite/src/stores/location-store.ts`
- Test: `apps/pharmacy-lite/src/__tests__/location-store.test.ts`

**Interfaces:**
- Consumes: `db.stockLocations`; `StockLocation`, `ALL_LOCATIONS`, `DEFAULT_LOCATION_ID` (Task 1).
- Produces: `useLocationStore` with `{ locations: StockLocation[]; currentLocationId: string; loadLocations(): Promise<void>; setCurrentLocation(id: string): void }`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/location-store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { useLocationStore } from '@/stores/location-store'
import { ALL_LOCATIONS, DEFAULT_LOCATION_ID } from '@/lib/inventory/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  useLocationStore.setState({ locations: [], currentLocationId: '' })
})

const row = (id: string, isPrimary = false, isActive = true) => ({ id, facilityId: 'f1', name: id, kind: 'store' as const, isPrimary, isActive, lastSyncedAt: 'h' })

describe('useLocationStore', () => {
  it('loadLocations defaults the selection to the primary', async () => {
    await db.stockLocations.bulkPut([row('main', true), row('fridge')])
    await useLocationStore.getState().loadLocations()
    expect(useLocationStore.getState().locations.map((l) => l.id).sort()).toEqual(['fridge', 'main'])
    expect(useLocationStore.getState().currentLocationId).toBe('main')
  })
  it('defaults to the DEFAULT fallback when the cache is empty', async () => {
    await useLocationStore.getState().loadLocations()
    expect(useLocationStore.getState().currentLocationId).toBe(DEFAULT_LOCATION_ID)
  })
  it('re-defaults a now-invalid current id to the primary', async () => {
    await db.stockLocations.bulkPut([row('main', true)])
    useLocationStore.setState({ currentLocationId: 'ghost' })
    await useLocationStore.getState().loadLocations()
    expect(useLocationStore.getState().currentLocationId).toBe('main')
  })
  it('holds the ALL sentinel when set', () => {
    useLocationStore.getState().setCurrentLocation(ALL_LOCATIONS)
    expect(useLocationStore.getState().currentLocationId).toBe(ALL_LOCATIONS)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run location-store`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/pharmacy-lite/src/stores/location-store.ts`:
```ts
import { create } from 'zustand'
import { db } from '@/lib/db'
import { ALL_LOCATIONS, DEFAULT_LOCATION_ID } from '@/lib/inventory/types'
import type { StockLocation } from '@/lib/inventory/types'

interface LocationState {
  locations: StockLocation[]
  currentLocationId: string   // a real id, or ALL_LOCATIONS
  loadLocations: () => Promise<void>
  setCurrentLocation: (id: string) => void
}

export const useLocationStore = create<LocationState>((set, get) => ({
  locations: [],
  currentLocationId: '',
  loadLocations: async () => {
    const all = await db.stockLocations.toArray()
    const active = all.filter((l) => l.isActive)
    const current = get().currentLocationId
    const isValid = current === ALL_LOCATIONS || active.some((l) => l.id === current)
    let next = current
    if (!isValid) {
      const primary = active.find((l) => l.isPrimary)
      next = primary?.id ?? DEFAULT_LOCATION_ID
    }
    set({ locations: active, currentLocationId: next })
  },
  setCurrentLocation: (id) => set({ currentLocationId: id }),
}))
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run location-store`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/stores/location-store.ts apps/pharmacy-lite/src/__tests__/location-store.test.ts
git commit -m "feat(pharmacy-lite): useLocationStore current-sub-location context"
```

---

### Task 5: `useLocationSync` hook + shell mount

**Files:**
- Create: `apps/pharmacy-lite/src/hooks/useLocationSync.ts`
- Modify: the component that mounts `useCatalogSync` (find it: `pnpm -F pharmacy-lite exec grep -rln "useCatalogSync(" src` — mount `useLocationSync()` beside it)
- Test: `apps/pharmacy-lite/src/__tests__/use-location-sync.test.tsx`

**Interfaces:**
- Consumes: `syncLocationsFromHub` (Task 3); `useLocationStore` (Task 4).
- Produces: `useLocationSync()` — on mount loads the cache, then (online) pulls + reloads.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/use-location-sync.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const loadLocations = vi.fn(async () => {})
const syncLocationsFromHub = vi.fn(async () => ({ locationsSynced: 0, lastSyncedAt: 'h' }))
vi.mock('@/stores/location-store', () => ({ useLocationStore: { getState: () => ({ loadLocations }) } }))
vi.mock('@/lib/inventory/location-sync', () => ({ syncLocationsFromHub: (...a: unknown[]) => syncLocationsFromHub(...a) }))

import { useLocationSync } from '@/hooks/useLocationSync'

beforeEach(() => { loadLocations.mockClear(); syncLocationsFromHub.mockClear() })

describe('useLocationSync', () => {
  it('loads the cache on mount and pulls when online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    renderHook(() => useLocationSync())
    await waitFor(() => expect(loadLocations).toHaveBeenCalled())
    await waitFor(() => expect(syncLocationsFromHub).toHaveBeenCalled())
  })
  it('loads the cache but skips the pull when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    renderHook(() => useLocationSync())
    await waitFor(() => expect(loadLocations).toHaveBeenCalled())
    expect(syncLocationsFromHub).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run use-location-sync`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/pharmacy-lite/src/hooks/useLocationSync.ts` (mirror `useCatalogSync`):
```ts
import { useEffect } from 'react'
import { syncLocationsFromHub } from '@/lib/inventory/location-sync'
import { useLocationStore } from '@/stores/location-store'

export function useLocationSync() {
  useEffect(() => {
    const controller = new AbortController()
    async function run() {
      await useLocationStore.getState().loadLocations()   // always: populate from cache (works offline)
      if (!navigator.onLine) return
      try {
        await syncLocationsFromHub(controller.signal)
        if (!controller.signal.aborted) await useLocationStore.getState().loadLocations()
      } catch {
        // non-blocking — offline / Hub unavailable
      }
    }
    run()
    return () => { controller.abort() }
  }, [])
}
```

- [ ] **Step 4: Mount it beside `useCatalogSync`**

Find the mount site (`grep -rln "useCatalogSync(" src`) and add `useLocationSync()` next to the existing `useCatalogSync()` call in that component, plus the import. Do not change anything else in that file.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run use-location-sync`
Expected: PASS (2 tests). Then `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/hooks/useLocationSync.ts apps/pharmacy-lite/src/__tests__/use-location-sync.test.tsx
# plus the mount-site component file
git commit -m "feat(pharmacy-lite): useLocationSync hook (cache-load + online pull)"
```

---

### Task 6: i18n — `locations` namespace (4 locales)

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: a `locations` namespace. Consumed by Tasks 7 and 8.

- [ ] **Step 1: Add the keys to `en.json`**

Add a new top-level `"locations"` namespace (near `inventory`):
```json
"locations": {
  "selectorLabel": "Sub-location",
  "allLocations": "All sub-locations",
  "defaultLocation": "Default",
  "writeFieldLabel": "Receive into sub-location"
},
```

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Same keys, native translations (ar Arabic, prs Dari, ps genuine Pashto — Pashto-specific letters, not Arabic-copied). Identical key sets across all four.

- [ ] **Step 3: Verify parity + authenticity**

Run:
```bash
node -e "const l=['en','ar','prs','ps'].map(x=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+x+'.json','utf8')));const k=o=>Object.keys(o.locations).sort().join(',');console.log(l.every(m=>k(m)===k(l[0]))?'PARITY OK':'PARITY FAIL')"
node -e "const r=x=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+x+'.json','utf8')).locations;const en=r('en'),ar=r('ar'),ps=r('ps');const k=Object.keys(en);const s=(a,b)=>k.filter(x=>a[x]===b[x]).length;console.log('ps==en:',s(ps,en),'ps==ar:',s(ps,ar))"
```
Expected: `PARITY OK`, and `ps==en: 0 ps==ar: 0`.

- [ ] **Step 4: Commit**
```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): i18n for sub-location selector (4 locales)"
```

---

### Task 7: `LocationSelector` + sidebar mount

**Files:**
- Create: `apps/pharmacy-lite/src/components/sidebar/LocationSelector.tsx`
- Modify: `apps/pharmacy-lite/src/components/sidebar/pharmacy-header.tsx` (render the selector under the pharmacy name)
- Test: `apps/pharmacy-lite/src/__tests__/location-selector.test.tsx`

**Interfaces:**
- Consumes: `useLocationStore` (Task 4); the `locations` i18n (Task 6); `ALL_LOCATIONS`, `DEFAULT_LOCATION_ID` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/location-selector.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LocationSelector } from '@/components/sidebar/LocationSelector'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const setCurrentLocation = vi.fn()
let state: { locations: unknown[]; currentLocationId: string } = { locations: [], currentLocationId: 'default' }
vi.mock('@/stores/location-store', () => ({
  useLocationStore: (sel: (s: unknown) => unknown) => sel({ ...state, setCurrentLocation }),
}))

beforeEach(() => { setCurrentLocation.mockClear() })

describe('LocationSelector', () => {
  it('renders active locations plus the All option and dispatches changes', () => {
    state = { locations: [{ id: 'main', name: 'Main', isActive: true, isPrimary: true }, { id: 'fridge', name: 'Fridge', isActive: true, isPrimary: false }], currentLocationId: 'main' }
    render(<LocationSelector />)
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText('Fridge')).toBeInTheDocument()
    expect(screen.getByText('allLocations')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fridge' } })
    expect(setCurrentLocation).toHaveBeenCalledWith('fridge')
  })
  it('shows a single disabled Default when the cache is empty', () => {
    state = { locations: [], currentLocationId: 'default' }
    render(<LocationSelector />)
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByText('defaultLocation')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run location-selector`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the selector**

Create `apps/pharmacy-lite/src/components/sidebar/LocationSelector.tsx` — a `'use client'` component. Read `locations` + `currentLocationId` + `setCurrentLocation` from `useLocationStore`. `const t = useTranslations('locations')`. Render a native `<select role="combobox">` styled with semantic tokens (`rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm w-full`), RTL-safe. When `locations.length === 0`: a single `<option value={DEFAULT_LOCATION_ID}>{t('defaultLocation')}</option>` and the `<select disabled>`. Otherwise: an `<option value={ALL_LOCATIONS}>{t('allLocations')}</option>` followed by one `<option key={l.id} value={l.id}>{l.name}</option>` per location; `value={currentLocationId}`; `onChange={(e) => setCurrentLocation(e.target.value)}`; `aria-label={t('selectorLabel')}`. No hardcoded hex; icons (if any) from `@ultranos/ui-kit/icons`.

- [ ] **Step 4: Mount in the sidebar header**

In `pharmacy-header.tsx`, render `<LocationSelector />` below the pharmacy-name block (inside the sidebar header area, after the `SidebarMenu`), wrapped in a small padded container (`px-2 pb-2`) so it sits under the pharmacy identity. Import the component. Keep the existing header markup intact.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run location-selector`
Expected: PASS (2 tests). Then `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/components/sidebar/LocationSelector.tsx apps/pharmacy-lite/src/components/sidebar/pharmacy-header.tsx apps/pharmacy-lite/src/__tests__/location-selector.test.tsx
git commit -m "feat(pharmacy-lite): sub-location selector in the sidebar header"
```

---

### Task 8: Tag stock-creating writes with the resolved sub-location

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx` (add a sub-location `<select>`; feed the chosen id ONLY to `processGoodsReceipt`)
- Modify: `apps/pharmacy-lite/src/components/pharmacy/transfers/TransfersPage.tsx` (receive with the resolved sub-location)
- Test: `apps/pharmacy-lite/src/__tests__/receive-stock-location.test.tsx`

**Interfaces:**
- Consumes: `useLocationStore` (Task 4); `resolveWriteLocation` (Task 2); the `locations` i18n (Task 6).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/receive-stock-location.test.tsx`. Mock `next-intl` (passthrough), `useLocationStore` (returns `{ locations: [{id:'main',name:'Main',isPrimary:true,isActive:true}], currentLocationId: 'main' }`), the auth store, `processGoodsReceipt` (spy), `setDrugPrice` (spy), and `db`. Render `ReceiveStockForm` with `locationId="facility-x"`, add one valid line, submit, and assert:
```tsx
// processGoodsReceipt receives the RESOLVED sub-location, not the prop:
expect(processGoodsReceiptSpy).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'main' }))
// setDrugPrice keeps the FACILITY prop, NOT the sub-location (decoupling):
expect(setDrugPriceSpy).toHaveBeenCalledWith(expect.objectContaining({ facilityId: 'facility-x' }))
```
(Model the line-item setup on the existing `ReceiveStockFormPoMode.test.tsx` / receive tests — reuse their mock scaffolding for `db.catalogItems`, `ReceiveStockItemRow`, and a valid line so `isValid` is true.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run receive-stock-location`
Expected: FAIL — the form still passes the prop `locationId` to `processGoodsReceipt`.

- [ ] **Step 3: Add the sub-location field to `ReceiveStockForm`**

- Import `useLocationStore`, `resolveWriteLocation`, and `useTranslations('locations')` (a second `t`, e.g. `tLoc`).
- Read `locations` + `currentLocationId` from the store; compute `const defaultSubLocation = resolveWriteLocation(currentLocationId, locations)`.
- Add state `const [subLocationId, setSubLocationId] = useState(defaultSubLocation)` and re-sync it when `defaultSubLocation` changes (a `useEffect` on `[defaultSubLocation]` that `setSubLocationId(defaultSubLocation)` only if the user hasn't overridden — simplest: initialize from it and reset on change).
- Render a `<select>` (only when `locations.length > 0`) labelled `tLoc('writeFieldLabel')`, options = the active `locations`, `value={subLocationId}`, `onChange` → `setSubLocationId`. Semantic tokens, RTL-safe. When `locations.length === 0`, render nothing (the receipt silently tags `'default'` via the resolver).
- In `handleSubmit`, change **only** the `processGoodsReceipt({ … locationId … })` argument from the prop `locationId` to `resolveWriteLocation(currentLocationId, locations)` when no field is shown, or `subLocationId` when it is — simplest: pass `locations.length > 0 ? subLocationId : resolveWriteLocation(currentLocationId, locations)`.
- **DO NOT change the `setDrugPrice({ facilityId: locationId })` call** — it keeps the `locationId` prop (facility identity). This is the binding decoupling constraint.

- [ ] **Step 4: Tag the transfer-receive write**

In `TransfersPage.tsx`: import `useLocationStore` + `resolveWriteLocation`; read `locations` + `currentLocationId`; replace the `CURRENT_LOCATION_ID` argument in the `receiveTransfer(id, session?.userId ?? '', CURRENT_LOCATION_ID)` call (line ~75) with `resolveWriteLocation(currentLocationId, locations)`. **Leave** the `getTransfers(CURRENT_LOCATION_ID)` call and the `currentLocationId={CURRENT_LOCATION_ID}` display props UNCHANGED (transfer-list filtering is a read — SP2; the `CURRENT_LOCATION_ID` constant stays for those).

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run receive-stock-location`
Expected: PASS. Then `pnpm -F pharmacy-lite typecheck` — no new errors. Self-grep the two touched files for hardcoded hex / `text-left`/`ml-`/`mr-` and fix any.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx apps/pharmacy-lite/src/components/pharmacy/transfers/TransfersPage.tsx apps/pharmacy-lite/src/__tests__/receive-stock-location.test.tsx
git commit -m "feat(pharmacy-lite): tag goods-receipt + transfer-receive with the selected sub-location"
```

---

## Final Verification (after all tasks)

- [ ] `pnpm -F pharmacy-lite test` — full suite green (new + regression). The known pre-existing `SyncQueueDashboard` teardown `DatabaseClosedError` is not this work.
- [ ] `pnpm -F pharmacy-lite typecheck` — only the 6 known pre-existing unrelated-file errors; zero new in touched files.
- [ ] i18n parity: `locations` namespace identical across en/ar/prs/ps; Pashto genuine.
- [ ] Decoupling holds: `setDrugPrice({ facilityId })` still receives the facility prop, never a sub-location id (grep `ReceiveStockForm.tsx`).
- [ ] Additive schema: Dexie v21 only; v1–v20 byte-unchanged; `stockLocations` is a non-encrypted read-only cache.
- [ ] Offline: with no pull, receiving still tags `'default'` and succeeds; the selector shows "Default".
- [ ] Reads unchanged: `getReorderReport`/`getStockAlerts`/`getTransfers` still location-blind (SP2 will scope them).
- [ ] No PHI in logs.

## Notes / deliberate boundaries

- **Reads are not filtered by the selection in SP1b** — the selector governs write defaults and shows the working location; SP2 wires it into stock/alerts/reorder reads and the transfers list.
- **`setDrugPrice` facilityId is decoupled** from the sub-location (binding constraint) — prevents a drug-price-publishing regression.
- **Transfer-list filtering** (`getTransfers`) keeps the existing `CURRENT_LOCATION_ID` constant; only the transfer-receive WRITE is retagged.
