# Transfers & Stock-Count Org-Scoped Sync (Design)

**Date:** 2026-09-08
**Apps:** `apps/hub-api/` (ingestion) + `apps/pharmacy-lite/` (StockCount enqueue + pull) + `supabase/migrations/`
**Status:** Approved design — pending implementation plan
**Epic:** Hub Inventory/Order Backend. Completes the **operational** (non-PHI) inventory/procurement sync by registering the two resources deferred from the Inventory/Procurement slice: `StockTransfer` and `StockCount`. Reuses that slice's now-live-verified org-scoped B1/B2 recipe verbatim.

## 1. Overview

`StockTransfer` (inter-location stock movements) is **enqueued today but ORPHANED** on the Hub (misses `RESOURCE_TABLE_MAP`). `StockCount` (physical inventory audits) is **never enqueued** — only its variance `StockMovement`s are (those now sync). This slice registers both on the org-scoped pattern so multi-location transfers and reconciliation history sync cross-device, and adds the missing StockCount enqueue.

**In scope:** 2 Hub tables (migration) + 2 flatteners + `RESOURCE_TABLE_MAP`/`ORG_SCOPED_TABLES`/PHARMACIST-RBAC entries; client pull registration for both; a StockCount enqueue at its create + complete sites.

**Out of scope:** POS domain (`Invoice`/`Payment`/`LedgerEntry`) — PHI-bearing, a later slice with a data-minimization design; per-item transfer/count movement replay (the variance movements already sync via the prior slice).

## 2. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Which resources | **StockTransfer + StockCount** | The two remaining operational (non-PHI) inventory resources; completes the domain. |
| D2 | id columns | **All client id / location-id columns are `TEXT`** (id, from_location_id, to_location_id; count id) | Applies the lesson from the prior slice's live bug: client ids are `string` and seed/imported data uses non-UUID strings (e.g. `seed-batch-amox-1`). `org_id` stays UUID (stamped from context). |
| D3 | JSONB arrays | `StockTransfer.items` + `StockCount.items` stored as **JSONB** (inner keys snake_case at rest, camel on pull) | Identical to `SalesOrder.lines` / `PurchaseOrder.items`. Flatteners pass `items` through. |
| D4 | Money | **None** — transfers/counts are quantity-based (no price columns) | No BIGINT columns needed. |
| D5 | Column renames | **None** — no reserved-word/`timestamp` field (fields are requestedAt/approvedAt/startedAt/completedAt/etc.) | No pull `toClientRow` reversal needed (unlike `StockMovement.timestamp`). |
| D6 | StockCount enqueue | **Add** a `StockCount` enqueue at create (`startStockCount`) and complete (`completeStockCount`) — the full document as payload, `action:'create'`/`'update'` | The count document isn't enqueued today; without this it can't sync. StockTransfer already enqueues (no client change). |
| D7 | StockTransfer create+update | Both actions already enqueue (status transitions requested→…→received) → the Hub upsert handles both | No new client work for transfers. |

## 3. Client data shapes (ground truth)

- **StockTransfer** (`src/lib/transfers/types.ts`): `id, fromLocationId, fromLocationName, toLocationId, toLocationName, status, items[] {catalogItemId, catalogItemName, stockBatchId, batchNumber, quantity}, requestedBy, requestedAt, approvedBy?, approvedAt?, shippedAt?, receivedAt?, receivedBy?, cancelledReason?, hlcTimestamp`.
- **StockCount** (`src/lib/procurement/types.ts`): `id, type, status, countedBy, items[] {catalogItemId, catalogItemName, stockBatchId, batchNumber, expectedQty, actualQty, variance}, totalVarianceItems, startedAt, completedAt?, hlcTimestamp`.

Dexie tables `db.stockTransfers` / `db.stockCounts` already exist (no schema-version bump).

## 4. Hub migration `053_transfers_stockcount_sync.sql` (Supabase MCP; confirm next free number)

Two tables, each with `org_id UUID NOT NULL`, `hlc_timestamp TEXT NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `idx_<t>_org` on `org_id`, RLS + a `service_role` all policy. All client id columns `TEXT`.

```sql
CREATE TABLE IF NOT EXISTS stock_transfers (
  id                 TEXT PRIMARY KEY,
  from_location_id   TEXT NOT NULL,
  from_location_name TEXT NOT NULL,
  to_location_id     TEXT NOT NULL,
  to_location_name   TEXT NOT NULL,
  status             TEXT NOT NULL,
  items              JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_by       TEXT NOT NULL,
  requested_at       TIMESTAMPTZ NOT NULL,
  approved_by        TEXT,
  approved_at        TIMESTAMPTZ,
  shipped_at         TIMESTAMPTZ,
  received_at        TIMESTAMPTZ,
  received_by        TEXT,
  cancelled_reason   TEXT,
  org_id             UUID NOT NULL,
  hlc_timestamp      TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_counts (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL,
  status               TEXT NOT NULL,
  counted_by           TEXT NOT NULL,
  items                JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_variance_items INTEGER NOT NULL DEFAULT 0,
  started_at           TIMESTAMPTZ NOT NULL,
  completed_at         TIMESTAMPTZ,
  org_id               UUID NOT NULL,
  hlc_timestamp        TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- indexes + RLS + service_role policy for each (mirror the prior slice's tables).
```

## 5. Hub ingestion (`apps/hub-api/`) — same recipe

- `resource-mappers.ts`: add `flattenStockTransfer` and `flattenStockCount`; register in `mappers`. Each maps client camelCase → the flat shape `db.toRow` snake-cases; `items` passes through untouched (JSONB). No column renames.
- `sync.ts`: `RESOURCE_TABLE_MAP` += `StockTransfer:'stock_transfers'`, `StockCount:'stock_counts'`; `ORG_SCOPED_TABLES` += those two table names.
- `rbac.ts`: `ROLE_PERMISSIONS.PHARMACIST` += `'StockTransfer'`, `'StockCount'`.
- Pull: no change (generic org-scoped branch).

## 6. Client (`apps/pharmacy-lite/`)

### 6.1 Pull registration (`wholesale-pull.ts`)
- Add `'StockTransfer'`, `'StockCount'` to the pulled-types list; `tableFor`: `StockTransfer→db.stockTransfers`, `StockCount→db.stockCounts`. NO `toClientRow` branch (both already match the client camelCase shape from `db.fromRows`, incl. camelCased JSONB `items`).

### 6.2 StockCount enqueue (`procurement/stock-count-service.ts`)
- `startStockCount` (creates the count): after the count is persisted, enqueue `{ resourceType:'StockCount', resourceId:count.id, action:'create', payload: count, hlcTimestamp: count.hlcTimestamp }`.
- `completeStockCount` (updates status/completedAt/totalVarianceItems inside a txn — the same site that already builds the variance `StockMovement` entries and puts them inside the txn): enqueue the updated StockCount. Follow the site's idiom — the movement entries are pre-built and `db.syncQueue.put` inside the txn; do the same for the StockCount (pre-build + put inside), OR read the count back after the txn and enqueue via `enqueuePharmacySyncEntry`. Never call the async enqueue inside a `db.transaction` zone. The enqueued payload is the FULL count row.
- StockTransfer needs no client change (already enqueues create + update).

## 7. Testing

**Hub (`sync.test.ts`):** each of the 2 pushes lands in its table, org stamped, `items` JSONB preserved (StockTransfer inner key `stockBatchId`; StockCount inner key `expectedQty`).
**Client enqueue (`stock-count-service` test):** `startStockCount` enqueues a `StockCount`/`create` entry; `completeStockCount` enqueues a `StockCount`/`update` entry (alongside the existing variance-movement entries).
**Client pull (`wholesale-pull.test.ts`):** each of the 2 pulled rows lands in the right Dexie table with `items` camelCase.
**Typecheck + suites** clean for slice files.
**Live (optional, session available):** create a transfer + a stock count → Sync Now → confirm the rows land in `stock_transfers` / `stock_counts` (via DB query).

## 8. Reuse & note

Pure application of the prior slice's proven, live-verified recipe. TEXT id columns from the start (the prior slice's UUID→TEXT correction is baked in). The remaining orphaned domain after this is POS (`Invoice`/`Payment`/`LedgerEntry`) — PHI-bearing, a separate slice needing a data-minimization design (patient linkage must not leak to org-scoped tables without a decision).
