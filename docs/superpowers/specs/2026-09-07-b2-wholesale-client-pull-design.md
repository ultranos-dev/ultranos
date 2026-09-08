# Hub Backend B2 — Wholesale Client Pull (Design)

**Date:** 2026-09-07
**Apps:** `apps/hub-api/` (org-scoped pull) + `apps/pharmacy-lite/` (client pull handler + trigger)
**Status:** Approved design — pending implementation plan
**Epic:** Hub Inventory/Order Backend. Second slice; follows **B1** (push/ingestion). Together B1+B2 give same-org cross-device sync for wholesale.

## 1. Overview

B1 made Pharmacy-Lite **push** `WholesaleCustomer`/`SalesOrder`/`CustomerLedgerEntry`
to the Hub (org-scoped tables). B2 makes a **second device of the same pharmacy
pull** those records and hydrate its local Dexie — completing the cross-device
story.

**Surfaced during investigation (scope note):** the Hub's `sync.pull` is
**patient-scoped** — wholesale tables aren't in its `PATIENT_COLUMN_MAP`, so pull
hits a data-minimization fallback and **skips them (returns zero rows)**. So B2 is
**not client-only**: it needs a focused Hub change (org-scoped pull) *plus* the
net-new client pull handler. Pharmacy-Lite has no pull path today; OPD-Lite's
`sync-pull.ts` is the pattern to mirror.

**In scope:** Hub `sync.pull` org-scoping for the 3 wholesale tables; a net-new
client pull handler + watermark cursor + `entryTimestamp→timestamp` reversal + LWW
conflict; trigger on app-open + `ultranos:sync-now`.

**Out of scope:** cross-tenant routing; other inventory/procurement resource pull
(later epic slices — they reuse this once registered); a periodic polling timer.

## 2. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Hub pull org-scoping | **Extend `sync.pull`** | Reuses the pull machinery + client contract; consistent with B1's "extend sync.push". Smallest change. |
| D2 | Trigger | **App-open + `ultranos:sync-now`** | Good-enough cross-device hydration with no new timer or extra Hub/data-budget cost. |
| D3 | Conflict | **Remote-wins unless local is dirty** | Local wholesale rows don't all carry an HLC (only `SalesOrder` does), so per-row HLC LWW isn't uniform. Rule: apply the remote row UNLESS a pending/failed/in-flight sync-queue entry exists for that `id` (local has an unpushed edit → keep it; it will push and win). This is the correct hydration semantics and needs no per-row HLC. |
| D4 | Watermark | **Single org-level `lastPulledHlc`** | Wholesale is org-wide, not per-patient; one cursor for the 3 types. |

## 3. Hub change (`apps/hub-api/src/trpc/routers/sync.ts`)

The `pull` procedure (input `{ patientId, sinceHlc, resourceTypes? }`) loops the
requested resource types, maps each to a table, and scopes by
`PATIENT_COLUMN_MAP`; org-scoped tables with no patient column currently `continue`
(skip). Change:

- **Make `patientId` optional** in the input schema.
- **In the pull loop, before the patient-column branch:** if the table is in
  `ORG_SCOPED_TABLES`, scope the query by **`org_id = ctx.user.orgId`** and
  `hlc_timestamp > sinceHlc` (ignore patient). If `ctx.user.orgId` is null →
  push an error for that type and `continue` (no cross-org leak; fail loud).
- Patient-scoped tables keep their existing behavior unchanged; if `patientId` is
  omitted, patient-scoped types are skipped (nothing to scope to).
- Return shape unchanged: `{ changes: [{ resourceType, resourceId, data, hlcTimestamp }] }`
  where `data` is `db.fromRows(row)` — already camelCased and with the JSONB
  `lines` inner keys un-snake-cased (`catalog_item_id → catalogItemId`,
  `batch_allocations → batchAllocations`).
- RBAC: the pull already checks resource access; PHARMACIST access to the 3 types
  was granted in B1.

## 4. Client pull handler (`apps/pharmacy-lite/`)

### 4.1 Watermark store
A dedicated Dexie table `wholesalePullMeta` (`key` PK: string, `lastPulledHlc`:
string), added in a new Dexie schema version. One row, `key = 'wholesale'`,
default `lastPulledHlc = '0'`. Not PHI — not added to `PHI_TABLE_CONFIGS`.

### 4.2 `src/lib/wholesale/wholesale-pull.ts` — `pullWholesale()`
Mirrors OPD-Lite's `sync-pull.ts`:
1. Read `lastPulledHlc` (default `'0'`).
2. Get an auth token; call the Hub `sync.pull` (raw fetch like the drain, tRPC
   envelope) with `{ resourceTypes: ['WholesaleCustomer','SalesOrder','CustomerLedgerEntry'], sinceHlc: lastPulledHlc }` (no `patientId`).
3. For each `change`:
   - **Transform** `change.data` to the client shape via a small per-type mapper.
     Only reversal needed: `CustomerLedgerEntry` — alias `entryTimestamp → timestamp`.
     `WholesaleCustomer` and `SalesOrder` (incl. `lines`) already match the client
     camelCase shape from `db.fromRows`.
   - **Conflict (remote-wins unless local dirty):** query the sync queue for a
     non-synced entry with this `id` — `db.syncQueue.where('resourceId').equals(id)`
     with any status in `{pending, failed, syncing, awaiting-key}`. If one exists,
     the local copy has an unpushed edit → **skip** the remote write (keep local).
     Otherwise → apply the remote row to the matching Dexie table
     (`db.wholesaleCustomers` / `db.salesOrders` / `db.customerLedgerEntries`) via `put`.
   - `hlc.receive(deserializeHlc(change.hlcTimestamp))` to advance the local clock.
   - Track the max HLC seen.
4. Persist the max HLC as the new `lastPulledHlc`.
5. Best-effort: offline / auth-expired / Hub error → return a soft failure; do not
   throw into the app (a subsequent trigger retries).

### 4.3 Trigger (`SyncProvider`)
Call `pullWholesale()` once on mount (alongside the drain worker start) and on the
`ultranos:sync-now` event. Guard against overlapping runs (a simple in-flight
flag). No polling timer.

## 5. Conflict / correctness notes

- **Local unsynced edit protection:** a local `WholesaleCustomer`/`SalesOrder`
  created or edited on this device but not yet pushed has a non-synced sync-queue
  entry for its `id` → pull skips it (keeps local). It later pushes and becomes
  authoritative. Correct without per-row HLC.
- **Idempotency:** re-pulling from the same `sinceHlc` re-applies the same rows;
  `put` by `id` (for clean rows) is idempotent.
- **CustomerLedgerEntry** is create-only; pull inserts missing entries. A clean
  local (already-synced) copy is simply overwritten with the identical remote —
  a no-op in practice.

## 6. Testing

**Hub (`sync.test.ts` harness):**
- `sync.pull` with `resourceTypes:['WholesaleCustomer']`, no `patientId`, org present
  → returns the org's wholesale rows filtered by `org_id` + `sinceHlc`.
- A row from a DIFFERENT org is NOT returned (tenant isolation).
- Missing `ctx.user.orgId` → error for that type, no rows.
- Patient-scoped pull behavior unchanged when `patientId` supplied.

**Client (`wholesale-pull.test.ts`):**
- Pull writes each type to the right Dexie table.
- `CustomerLedgerEntry`: `entryTimestamp` from the Hub → stored as `timestamp`.
- `SalesOrder.lines` inner keys land camelCase (`catalogItemId`, `batchAllocations`).
- Conflict: a row whose `id` has a non-synced sync-queue entry is NOT overwritten
  by pull (local dirty kept); a clean row IS overwritten with the remote.
- Watermark advances to the batch max HLC and is passed as `sinceHlc` next call.
- Offline / error → soft failure, watermark unchanged.

**Live (after build):** on the running app (pharmacist has `org_id`), the 2 orders
B1 pushed are on the Hub. Clear the local wholesale tables (or use a second
browser profile), run a pull (Sync Now), and confirm the customer + orders + AR
ledger reappear locally.

## 7. Reuse for later epic slices

Once other resources (inventory/procurement/transfers) are registered org-scoped
in B1-style push, this same `sync.pull` org-scoping + a per-resource client mapper
hydrates them too — the pull loop and watermark generalize.
