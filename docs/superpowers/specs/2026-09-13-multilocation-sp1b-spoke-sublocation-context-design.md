# Multi-Location SP1b — Spoke Sub-Location Context, Tagging & Reconciliation

**Date:** 2026-09-13
**App:** `apps/pharmacy-lite`
**Status:** Design — awaiting review before implementation plan
**Program:** Track 2 — Multi-location stock/reorder. **SP1a** (Hub table +
`facilityLocations` router + admin management) is complete and merge-ready.
This is **SP1b**, the pharmacy-lite spoke half: pull sub-locations, add a
current-sub-location context + selector, tag stock-creating writes with the
selected sub-location, and reconcile legacy `'default'` batches. **SP2**
(location-scoped stock/alerts views) and **SP3** (location-aware reorder) build
on this.

## Context

Verified ground truth in `apps/pharmacy-lite`:

- **No sub-location concept exists on the spoke.** `ReceiveStockPage.tsx:12`
  hardcodes `locationId = 'default'`; `pharmacySettings` carries its own
  (empty) `locationId`; `stockBatches.locationId` is indexed but only ever
  holds `'default'` (goods receipt) or a transfer-passed id. `zoneId` is a
  vestigial stub (untouched).
- **Pull precedent** = `catalog-sync.ts` + `useCatalogSync.ts`: a raw `fetch`
  GET against the Hub with the bearer token from
  `useAuthSessionStore.getState().getAccessToken()`, parsing
  `body.result.data.json`, triggered by an on-mount, online-only,
  silent-on-failure hook.
- **SP1a's frozen contract:** `facilityLocations.listForFacility` — no input
  (JWT-scoped server-side), returns the caller-facility's sub-locations
  (active **and** inactive) as `FacilityLocation[]` (from
  `@ultranos/shared-types`).
- **Dexie is at v20** (`db.ts:315`). SP1b appends **v21**.
- **Batch-sync helper:** `enqueueStockBatchSync(batch: StockBatch): Promise<void>`
  (`stock-batch-sync.ts`) — must be called AFTER a Dexie transaction (Web
  Crypto can't run in a tx zone). `stockBatches.locationId` is indexed, so
  legacy batches can be found by `where('locationId')`.
- **Session has no `facilityId`** — the spoke never needs it; scoping is
  server-side in `listForFacility`.

## Goal

Make the spoke *aware* of its facility's sub-locations: cache them locally,
let the pharmacist choose a current sub-location (or an "All" roll-up), tag new
stock into the chosen sub-location instead of `'default'`, and migrate existing
`'default'` stock onto the facility's primary sub-location (re-syncing the
correction to the Hub). SP1b does **not** yet filter read views by the
selection — that is SP2. After SP1b the selector governs write defaults and
shows the working sub-location.

## Locked Decisions

1. **Writes under "All":** every stock-creating write form carries a
   sub-location field, prefilled via `resolveWriteLocation` (which resolves
   `'ALL'` and empties to the **primary**), overridable per write. `'ALL'` is a
   read-only view state — a write never tags `'ALL'`.
2. **Legacy reconcile:** after the first successful pull (once a primary
   exists), a one-time idempotent pass reassigns every batch with `locationId`
   `'default'` or `''` to the primary's id **and** `enqueueStockBatchSync`s each
   so the Hub's `stock_batches.location_id` is corrected.
3. **Empty/offline fallback:** with no cached sub-locations, the selector shows
   a single `'default'` pseudo-location and writes keep tagging `'default'`
   exactly as today. Once real sub-locations sync in, they take over and
   reconciliation runs. Nothing breaks pre-pull.

## Types (`src/lib/inventory/types.ts`)

Reuse SP1a's shared type; the local cache row adds a sync stamp.

```ts
import type { FacilityLocation } from '@ultranos/shared-types'

export interface StockLocation extends FacilityLocation {
  lastSyncedAt: string   // ISO 8601 — when this row was last pulled
}

/** Sentinel for the roll-up view state (never persisted on a batch). */
export const ALL_LOCATIONS = 'ALL' as const
/** Fallback id used before any sub-location is cached (matches legacy batches). */
export const DEFAULT_LOCATION_ID = 'default' as const
```

## Data model — Dexie **v21** (`src/lib/db.ts`)

Append-only new version block (never edit v1–v20):

```ts
this.version(21).stores({
  stockLocations: 'id, isPrimary, isActive',
})
```

`stockLocations` is a **read-only local cache** (Hub is source of truth; the
spoke never edits it — only `syncLocationsFromHub` writes it). Non-PHI
(operational facility layout), so no field-level encryption. Primary key `id`;
`isPrimary`/`isActive` indexed for quick primary/active lookups.

## Sync (`src/lib/inventory/location-sync.ts`)

```ts
export interface LocationSyncResult { locationsSynced: number; lastSyncedAt: string }
export async function syncLocationsFromHub(signal?: AbortSignal): Promise<LocationSyncResult>
export async function reconcileLegacyLocations(primaryId: string): Promise<number>
```

- **`syncLocationsFromHub`** — token via `getAccessToken()` (throw if none);
  GET the `facilityLocations.listForFacility` query on the Hub base URL (bearer
  auth, no input) exactly as `catalog-sync` builds its URL; parse
  `body.result.data.json` = `FacilityLocation[]`. **Full-replace** the cache in
  one `rw` tx: `clear()` then `bulkPut` the rows stamped with `lastSyncedAt`
  (the list is small and read-only, so a full replace avoids stale/removed
  rows). After the tx, find the primary (`isPrimary && isActive`); if one
  exists, call `reconcileLegacyLocations(primary.id)`. Returns the count +
  timestamp. On any fetch error, propagate (the hook swallows it) — the cache
  is left unchanged.
- **`reconcileLegacyLocations`** — `db.stockBatches.where('locationId')
  .anyOf([DEFAULT_LOCATION_ID, '']).toArray()`. If none → return 0 (idempotent
  no-op). Otherwise, in an `rw` tx, `update` each to `{ locationId: primaryId,
  hlcTimestamp: <now> }`; **after** the tx, read each back and
  `enqueueStockBatchSync(updated)` so the Hub receives the corrected
  `location_id`. Returns the number reassigned.

## Sync trigger (`src/hooks/useLocationSync.ts`)

A hook mirroring `useCatalogSync`: **on mount it always calls
`useLocationStore.loadLocations()` first** (reads the local Dexie cache, so the
selector is populated even offline / before any pull). Then, if
`navigator.onLine`, it calls `syncLocationsFromHub(signal)` inside an
`AbortController` and, on success, calls `loadLocations()` again to reflect the
refreshed cache; errors are swallowed (offline/Hub-unavailable is
non-blocking). Mounted wherever `useCatalogSync` is mounted (the same app-shell
sync surface), so locations load from cache immediately and refresh alongside
the catalog.

## Current-location context (`src/stores/location-store.ts`)

```ts
interface LocationState {
  locations: StockLocation[]          // active cached sub-locations
  currentLocationId: string           // a real id, or ALL_LOCATIONS
  loadLocations: () => Promise<void>   // read Dexie; set default selection
  setCurrentLocation: (id: string) => void
}
export const useLocationStore = create<LocationState>(/* … */)
```

- **`loadLocations`** reads the active `stockLocations` into `locations`. If
  `currentLocationId` is unset or no longer a valid active id, it defaults to
  the primary's id; if the cache is empty, it defaults to `DEFAULT_LOCATION_ID`.
- **`setCurrentLocation(id)`** accepts any active id or `ALL_LOCATIONS`.
- Selection is in-memory (a sub-location id is not PHI, but persistence is
  YAGNI — every session re-auths and defaults to primary). No `localStorage`.

## Write-location resolution (`src/lib/inventory/resolve-write-location.ts`)

Pure, deterministic — the single source of "which concrete location does a
write tag":

```ts
export function resolveWriteLocation(currentLocationId: string, locations: StockLocation[]): string {
  if (currentLocationId && currentLocationId !== ALL_LOCATIONS) {
    if (currentLocationId === DEFAULT_LOCATION_ID) return DEFAULT_LOCATION_ID
    if (locations.some((l) => l.id === currentLocationId && l.isActive)) return currentLocationId
  }
  const primary = locations.find((l) => l.isPrimary && l.isActive)
  return primary?.id ?? DEFAULT_LOCATION_ID
}
```

Never returns `ALL_LOCATIONS`. Resolves `'ALL'`, empty, or an invalid/retired
id to the primary, and to `'default'` only when no primary is cached.

## UI

- **`LocationSelector` (`src/components/sidebar/LocationSelector.tsx`)** — a
  `<select>` rendered in the sidebar header (under the pharmacy name in
  `pharmacy-header.tsx`): options = active cached locations (by `name`) + an
  **"All sub-locations"** option (value `ALL_LOCATIONS`). Value =
  `currentLocationId`; `onChange` → `setCurrentLocation`. When the cache is
  empty, it renders a single disabled **"Default"** option. Semantic oklch
  tokens, RTL logical props, i18n labels.
- **Write forms** (stock-CREATING writes only): `ReceiveStockForm` /
  `ReceiveStockPage` and the transfer **receive** action gain a sub-location
  `<select>` (active locations + the resolved default from
  `resolveWriteLocation(currentLocationId, locations)`); the chosen id is passed
  as `locationId` to `createGoodsReceipt` / `receiveTransfer` (both already take
  a `locationId` param — this replaces the hardcoded `'default'`).
  **Adjustments and dispenses are unchanged** — they mutate an existing batch,
  which keeps its own `locationId`; they never create a new location tag.

## Error handling & edge cases

- **Offline / pull fails:** cache unchanged; the selector falls back to
  `'default'` if empty; all writes keep working (`resolveWriteLocation` →
  `'default'`).
- **Facility has no sub-locations defined at the Hub:** pull returns `[]`,
  cache cleared to empty, selector shows "Default", writes tag `'default'` — no
  reconciliation (no primary). When sub-locations are later added and pulled,
  reconciliation runs then.
- **`'ALL'` active during a write:** `resolveWriteLocation` yields the primary;
  the write-form field shows the primary preselected and is overridable.
- **Retired (inactive) sub-location previously selected:** `loadLocations`
  re-defaults to the primary; existing batches tagged to the retired id are
  untouched (still visible under "All").
- **Reconciliation re-sync:** each reassigned batch enqueues a
  `StockBatch` sync entry (the existing offline-durable queue) — corrections
  reach the Hub on the next sync; failures are retried by the queue.
- **No PHI** anywhere (locations, ids, quantities are operational).

## Testing

- **`resolveWriteLocation`** (pure): current valid id wins; `'ALL'` → primary;
  empty → primary; invalid/inactive id → primary; no primary cached →
  `'default'`; `'default'` passthrough.
- **`syncLocationsFromHub`**: full-replace (removed Hub rows disappear from the
  cache); stamps `lastSyncedAt`; triggers reconciliation when a primary exists;
  propagates fetch errors (cache untouched).
- **`reconcileLegacyLocations`**: reassigns `'default'`/`''` batches to the
  primary + enqueues one sync per batch; idempotent (second run reassigns 0);
  leaves already-correct batches untouched.
- **`useLocationStore`**: `loadLocations` defaults to primary; empty cache →
  `'default'`; `setCurrentLocation('ALL')` holds the sentinel; a stale current
  id re-defaults to primary.
- **`LocationSelector`**: renders active locations + "All"; empty cache →
  disabled "Default"; change calls `setCurrentLocation`. RTL/design-system.
- **Write forms**: receive tags the resolved location; overriding the field
  tags the chosen id; under `'ALL'` the field defaults to primary.
- **Offline**: with no pull, receiving still tags `'default'` and succeeds.

## Out of scope (later)

- **SP2:** filtering stock table / alerts / on-hand / reorder by the current
  selection (the selector does not yet change read views).
- **SP3:** location-aware reorder.
- **Persisting the selection** across reloads; **per-user** default location.
- **Editing sub-locations** on the spoke (read-only cache; admin-only at the
  Hub, SP1a).
- **Adjustments/dispenses** gaining a location picker (they inherit the batch's
  location).
- **`zoneId`** (finer level) — untouched.

## Affected files (indicative)

- `src/lib/inventory/types.ts` — `StockLocation`, `ALL_LOCATIONS`,
  `DEFAULT_LOCATION_ID`.
- `src/lib/db.ts` — Dexie **v21** `stockLocations` store.
- `src/lib/inventory/location-sync.ts` (new) — `syncLocationsFromHub`,
  `reconcileLegacyLocations`.
- `src/hooks/useLocationSync.ts` (new) — on-mount pull.
- `src/stores/location-store.ts` (new) — `useLocationStore`.
- `src/lib/inventory/resolve-write-location.ts` (new) — pure resolver.
- `src/components/sidebar/LocationSelector.tsx` (new) + `pharmacy-header.tsx`
  (mount the selector).
- `src/components/pharmacy/inventory/ReceiveStockForm.tsx` /
  `ReceiveStockPage.tsx` — sub-location field (replaces hardcoded `'default'`).
- transfer receive UI — sub-location field into `receiveTransfer`.
- `messages/{en,ar,prs,ps}.json` — `locations` namespace (selector + field
  labels, "All sub-locations", "Default").
