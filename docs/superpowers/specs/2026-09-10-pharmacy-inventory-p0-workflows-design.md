# Pharmacy PWA — Inventory Management P0 Workflows

**Date:** 2026-09-10
**App:** `apps/pharmacy-lite` (+ cross-app: `apps/hub-api`, `apps/admin-portal`)
**Status:** Design — awaiting review before implementation plan

## Context

A review of the Pharmacy PWA inventory stack found solid foundations (batch/lot
tracking, FEFO, expiry auto-quarantine, PO lifecycle, stock counts, suppliers,
transfer lifecycle) but several gaps — some *basic*, not merely enterprise:

- **No manual stock-adjustment UI.** `type: 'adjusted'` movements are only ever
  written by completing a full stock count
  (`src/lib/procurement/stock-count-service.ts`). A single wrong quantity cannot
  be corrected without running a count session.
- **No disposal / write-off UI.** Movement type `'disposed'` exists and
  `WastageCard` *reports* it, but nothing can *create* one — quarantined/expired
  stock never leaves the books and the wastage report can never populate.
- **No stock ledger / movement-history view.** The `stockMovements` table is
  fully populated but has no query UI — the audit trail is invisible to users.
- **No transfer-creation UI.** `createTransferRequest()` has zero UI callers; the
  Transfers page can only approve/ship/receive pre-existing transfers. There is
  also no location registry — `CURRENT_LOCATION_ID` is hard-coded to `'default'`
  (`src/components/pharmacy/transfers/TransfersPage.tsx:19`) and transfers store
  location *names* as free strings.

This spec covers the **P0** closure of these four gaps.

## Locked Decisions

1. **Stock Adjustments** — single-item quantity correction; structured reason
   codes `miscount | damage | theft | expiry_correction | system_error` + optional
   free-text note.
2. **Disposal / Write-off** — for active *and* quarantined/expired batches;
   reason codes `expired | damaged | contaminated | recalled | patient_return_unusable`
   + optional note; makes `WastageCard` live.
3. **Stock Ledger** — global filterable log page **and** per-item drill-down,
   over a single shared query layer.
4. **Location Registry** — **Hub-owned**, pulled read-only into the PWA
   (cross-app: hub-api + admin-portal + pharmacy-lite pull/cache).
5. **Transfer Creation** — destination picked from cached Hub locations; wires to
   the existing `createTransferRequest()`.

## Approach

**Unified movement layer + two-track sequencing.**

Centralize a single `stock-movement` module in pharmacy-lite that owns the
reason-code enums, `recordAdjustment()`, `recordDisposal()`, and
`queryMovements()`. Adjustments, disposal, and the ledger all consume it — one
source of truth for reason handling and querying, which keeps wastage/variance
reporting consistent and avoids re-implementing the query path three times.

Sequence as **two tracks**:

- **Track 1 (no external dependency):** adjustments, disposal, ledger. Ships
  independently of Hub/Admin work.
- **Track 2 (cross-app):** location registry → transfer creation. Transfer
  creation depends on the registry landing first.

## Track 1 — Data Model & Shared Movement Layer

### Movement reason codes (additive, backward-compatible)

`StockMovement` (`src/lib/inventory/types.ts:85`) today has free-text `reason?`
and no structured code. Changes:

- Add `reasonCode?: StockAdjustmentReason | StockDisposalReason`.
- Keep existing `reason?` as the **optional free-text note**.
- Extend `refType` (currently
  `'dispense' | 'purchase_order' | 'transfer' | 'count' | 'goods_receipt' | 'void' | 'sales_order'`)
  with `'adjustment'` and `'disposal'`, so the ledger and reports distinguish
  manual adjustments/disposals from count-driven adjustments.

```ts
export type StockAdjustmentReason =
  | 'miscount' | 'damage' | 'theft' | 'expiry_correction' | 'system_error'

export type StockDisposalReason =
  | 'expired' | 'damaged' | 'contaminated' | 'recalled' | 'patient_return_unusable'
```

`reasonCode` is a **non-indexed additive field** — no Dexie version bump
required. `stockMovements` is already indexed on
`id, stockBatchId, catalogItemId, type, timestamp, hlcTimestamp`, which covers
all ledger query paths.

### New module: `src/lib/inventory/stock-movement.ts`

The single source of truth Track 1 consumes. Reuses existing `addStock` /
`deductStock` (`src/lib/inventory/stock-service.ts`) rather than adding new
deduction logic.

- **`recordAdjustment({ batchId, newQuantity, reasonCode, note, performedBy })`**
  — reads current `quantityOnHand`, computes the signed delta, routes to
  `addStock`/`deductStock` with movement `type: 'adjusted'`,
  `refType: 'adjustment'`, carrying `reasonCode` + note. Guards against negative
  resulting stock.
- **`recordDisposal({ batchId, quantity, reasonCode, note, performedBy })`** —
  deducts via `deductStock` with `type: 'disposed'`, `refType: 'disposal'`; sets
  batch `status: 'depleted'` at zero. Operates on `active` **and** `quarantined`
  batches (disposal is how quarantined stock leaves the books).
- **`queryMovements({ catalogItemId?, batchId?, type?, from?, to?, limit })`** —
  the one read path used by both the ledger global log and the per-item
  drill-down. Uses existing Dexie indexes.

**Sync:** every adjustment/disposal enqueues a `SyncQueueEntry` exactly as
`addStock`/`deductStock` already do. No new object store for Track 1.

## Track 1 — UI

### Stock Adjustment — `AdjustStockDialog`

- Entry points: each `StockTable` row (stock overview) and catalog stock rows.
- Fields: current on-hand (read-only), "new counted quantity" input (delta shown
  to the user), required reason-code `<select>`, optional note.
- Submit → `recordAdjustment()`.
- Confirmation step when `|delta|` is large **or** the item is
  `controlledSchedule` (reason + performer are compliance-relevant).

### Disposal / Write-off — `DisposeStockDialog`

- Entry points: stock rows, and prominently from the **quarantined** filter (the
  natural exit path for expired/quarantined stock).
- Fields: quantity (defaults to full batch qty), required reason-code `<select>`,
  optional note.
- Submit → `recordDisposal()`. Populates `WastageCard`
  (`src/components/pharmacy/reports/WastageCard.tsx:44`).

### Stock Ledger — route `/inventory/ledger`

- Follows the OPD list-page standard: standalone `<h1>`, **one** toolbar row
  (wide `SearchInput` + movement-type filter `<select>` + date-range), **one**
  content box.
- Columns: timestamp, product, batch, movement type, reason code, signed qty
  (colored), performedBy, reference.
- **Per-item drill-down:** a "History" action on catalog/stock rows opens a
  `Sheet` rendering the same table pre-filtered to that `catalogItemId` — reuses
  `queryMovements()`.
- Sidebar: add a **Ledger** entry under Inventory.

## Track 2 — Location Registry + Transfer Creation

### Location registry (Hub-owned)

- **hub-api:** `locations` table (`id, org_id, name, code, address?, is_active,
  created_at, updated_at`) via Supabase MCP migration; `GET /locations.list`
  (pull) + admin CRUD endpoints.
- **admin-portal:** Locations management page (CRUD) under the org/settings area.
- **pharmacy-lite:** `src/lib/inventory/location-sync.ts` mirroring `catalog-sync`
  (paginated pull, watermark) into a **read-only** local `locations` cache store
  (Dexie version bump); `useLocations` hook; `'default'` seeded so existing
  batches/transfers keep resolving.

### Transfer creation — route `/inventory/transfers/new`

- Pick destination from cached locations (excluding current location).
- Add line items via catalog + FEFO-aware batch search; quantity per line
  validated against on-hand.
- Submit → existing `createTransferRequest()`.
- "New Transfer" action added to the Transfers page.

## Testing

- **Unit (Vitest):**
  - `recordAdjustment` — delta up/down, insufficient-stock guard, sync enqueued.
  - `recordDisposal` — active + quarantined batches, depletes to zero, sync
    enqueued.
  - `queryMovements` — each filter (catalogItemId, batchId, type, date range).
  - Reason-code enum coverage.
- **Compliance:** adjustment/disposal on a `controlledSchedule` item asserts
  `reasonCode` + `performedBy` are recorded.
- **Integration:** `WastageCard` reflects a disposal; expiry-quarantined batch →
  disposed end-to-end.
- **Component / RTL:** dialog snapshots in LTR + RTL; reason-code required-field
  validation; ledger filter behavior.
- **Track 2:** `location-sync` pull-merge + `'default'` seed; transfer-creation
  on-hand validation + `createTransferRequest` called + sync enqueued.

## Out of Scope (later priorities)

- Reorder suggestions / auto-PO; use of `leadTimeDays`; par-level
  (`minStock`/`maxStock`) enforcement — these fields are currently dead
  (`src/lib/inventory/types.ts:33-34`).
- Returns (supplier RMA / customer return) beyond the `patient_return_unusable`
  disposal reason.
- Receiving hardening (PO→receipt pre-fill, over-receipt guard, 3-way match,
  backorders).
- Stock-count approval / variance sign-off.
- Inventory valuation (WAC/FIFO), landed cost, ABC analysis.
- Barcode/label printing, multi-UoM.

## Affected Files (indicative)

**pharmacy-lite — Track 1**
- `src/lib/inventory/types.ts` — add `reasonCode`, extend `refType`, reason enums.
- `src/lib/inventory/stock-movement.ts` — new module.
- `src/lib/inventory/stock-service.ts` — thread `reasonCode` through
  `addStock`/`deductStock` (verify exact signatures during planning).
- `src/components/pharmacy/inventory/AdjustStockDialog.tsx` — new.
- `src/components/pharmacy/inventory/DisposeStockDialog.tsx` — new.
- `src/components/pharmacy/inventory/StockTable.tsx` — row actions.
- `src/components/pharmacy/inventory/StockLedgerPage.tsx` — new.
- `src/app/[locale]/(app)/inventory/ledger/page.tsx` — new route.
- Sidebar nav + i18n message catalogs.

**pharmacy-lite — Track 2**
- `src/lib/inventory/location-sync.ts` — new.
- `src/lib/inventory-db.ts` / `src/lib/db.ts` — `locations` store (version bump).
- `src/hooks/useLocations.ts` — new.
- `src/components/pharmacy/transfers/NewTransferPage.tsx` — new.
- `src/app/[locale]/(app)/inventory/transfers/new/page.tsx` — new route.
- `src/components/pharmacy/transfers/TransfersPage.tsx` — "New Transfer" action.

**hub-api**
- `locations` migration (Supabase MCP) + `locations.list` / admin CRUD endpoints.

**admin-portal**
- Locations management page.
