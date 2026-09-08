# Inventory & Procurement Org-Scoped Sync (Design)

**Date:** 2026-09-07
**Apps:** `apps/hub-api/` (ingestion + pull) + `apps/pharmacy-lite/` (StockBatch enqueue + pull) + `supabase/migrations/`
**Status:** Approved design — pending implementation plan
**Epic:** Hub Inventory/Order Backend. Generalizes the proven B1 (push) + B2 (pull) org-scoped recipe — and the delete-sync mechanism — to the pharmacy's operational inventory & procurement domain.

## 1. Overview

`Supplier`, `PurchaseOrder`, `GoodsReceipt`, and `StockMovement` are **enqueued today but ORPHANED** on the Hub: they hit `sync.push`, miss `RESOURCE_TABLE_MAP`, and fail `Unknown resource type` — their pushes silently never land. `StockBatch` (the on-hand stock level) is **never enqueued at all**. This slice registers all five on the org-scoped B1/B2 pattern so a pharmacy's inventory/procurement state syncs cross-device, and adds the missing StockBatch enqueue.

**In scope:** 5 Hub tables (migration) + 5 flatteners + `RESOURCE_TABLE_MAP`/`ORG_SCOPED_TABLES`/PHARMACIST-RBAC entries; client pull registration for all 5 (with `StockMovement.timestamp` reversal); new StockBatch enqueue at its 6 mutation sites.

**Out of scope (later/never here):** POS domain (`Invoice`/`Payment`/`LedgerEntry`) — PHI-bearing (patientId), heavier burden; `StockTransfer` + `StockCount` documents (movements already covered) — a later slice; delete-sync for these (only ContractPrice has a user delete today — the generic `deleted_at` mechanism exists but these tables get no `deleted_at` this slice); movement→batch replay/apply logic (StockBatch syncs as a materialized snapshot, LWW).

## 2. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Which resources | **Supplier, PurchaseOrder, GoodsReceipt, StockMovement, StockBatch** | The buy→receive→stock core. First four already enqueue (fixes broken pushes); StockBatch is the actual on-hand data. |
| D2 | StockBatch sync | **Materialized snapshot** — enqueue the full batch row on every mutation; LWW on the Hub via hlc_timestamp | Simpler + more robust than replaying StockMovement deltas (no movement-apply logic exists). |
| D3 | StockMovement.timestamp | **Hub column `movement_timestamp`**, reversed on pull (`movement_timestamp → timestamp`) | `timestamp` is a reserved word; mirrors the `CustomerLedgerEntry.entryTimestamp ↔ timestamp` precedent. |
| D4 | Money | **Integer minor units → `BIGINT`** for costPrice/sellingPrice/totalCost/unitCost | Matches the inventory types header + wholesale precedent. |
| D5 | JSONB arrays | `PurchaseOrder.items` + `GoodsReceipt.items` stored as **JSONB**; inner keys snake_case at rest, camelCase on pull (via `db.toRow`/`db.fromRows` recursion) | Identical to `SalesOrder.lines`. The flattener passes `items` through; no per-key handling. |
| D6 | Encryption | **Plaintext columns** (non-PHI operational) | Same as wholesale tables; no field-encryption config. |
| D7 | Pull | Extend the existing org-scoped pull list; add each type + `tableFor` + `toClientRow` | Reuses the B2 machinery + shared watermark. |
| D8 | PHI check | These 5 carry **no patient PHI** (`performedBy`/`receivedBy`/`createdBy` are practitioner refs; `referenceId` is an opaque UUID) | Data-minimization satisfied; org-scoped only. |

## 3. Client data shapes (ground truth — `apps/pharmacy-lite/src/lib/{inventory,procurement}/types.ts`)

- **Supplier**: `id, name, contactName?, phone?, email?, address?, leadTimeDays?, paymentTerms?, isActive, createdAt` (flat; like WholesaleCustomer). NOTE: no `hlcTimestamp` on the row — the enqueue supplies the HLC.
- **PurchaseOrder**: `id, supplierId, supplierName, status, items[] {catalogItemId, catalogItemName, quantityOrdered, quantityReceived, unitCost}, totalCost, notes?, createdBy, createdAt, sentAt?, closedAt?, hlcTimestamp`.
- **GoodsReceipt**: `id, supplierId?, purchaseOrderId?, receivedBy, items[] {catalogItemId, batchNumber, lotNumber?, expiryDate, quantity, costPrice, sellingPrice}, totalCost, notes?, receivedAt, hlcTimestamp`.
- **StockBatch**: `id, catalogItemId, batchNumber, lotNumber?, expiryDate, quantityOnHand, costPrice, sellingPrice, zoneId?, supplierId?, goodsReceiptId?, receivedAt, status, locationId, hlcTimestamp`.
- **StockMovement**: `id, stockBatchId, catalogItemId, type, quantity, reason?, referenceId?, referenceType?, performedBy, timestamp, hlcTimestamp`.

## 4. Hub migration `050_inventory_procurement_sync.sql` (Supabase MCP; confirm next free number)

Five tables, each with `org_id UUID NOT NULL`, `hlc_timestamp TEXT NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`, RLS enabled + a `service_role` all policy, and `idx_<t>_org` on `org_id`. Money columns `BIGINT`. Nullable client-optional fields nullable.

```sql
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT, phone TEXT, email TEXT,
  address TEXT, lead_time_days INTEGER, payment_terms TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  org_id UUID NOT NULL, hlc_timestamp TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY, supplier_id UUID NOT NULL, supplier_name TEXT NOT NULL, status TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb, total_cost BIGINT NOT NULL DEFAULT 0, notes TEXT,
  created_by TEXT NOT NULL, sent_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
  org_id UUID NOT NULL, hlc_timestamp TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS goods_receipts (
  id UUID PRIMARY KEY, supplier_id UUID, purchase_order_id UUID, received_by TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb, total_cost BIGINT NOT NULL DEFAULT 0, notes TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  org_id UUID NOT NULL, hlc_timestamp TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_batches (
  id UUID PRIMARY KEY, catalog_item_id TEXT NOT NULL, batch_number TEXT NOT NULL, lot_number TEXT,
  expiry_date TEXT NOT NULL, quantity_on_hand INTEGER NOT NULL DEFAULT 0, cost_price BIGINT NOT NULL DEFAULT 0,
  selling_price BIGINT NOT NULL DEFAULT 0, zone_id TEXT, supplier_id UUID, goods_receipt_id UUID,
  received_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, location_id TEXT NOT NULL,
  org_id UUID NOT NULL, hlc_timestamp TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY, stock_batch_id UUID NOT NULL, catalog_item_id TEXT NOT NULL, type TEXT NOT NULL,
  quantity INTEGER NOT NULL, reason TEXT, reference_id TEXT, reference_type TEXT, performed_by TEXT NOT NULL,
  movement_timestamp TIMESTAMPTZ NOT NULL,
  org_id UUID NOT NULL, hlc_timestamp TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- indexes + RLS + service_role policy for each (mirror 047/048).
```
`catalog_item_id`/`zone_id`/`location_id` are TEXT (client uses string ids that may not be UUIDs). `expiry_date` TEXT (client stores an ISO/date string). `supplier_id`/`goods_receipt_id`/`purchase_order_id` UUID (real UUIDs) but nullable where the client marks them optional.

## 5. Hub ingestion (`apps/hub-api/`) — B1 recipe

- `resource-mappers.ts`: add `flattenSupplier`, `flattenPurchaseOrder`, `flattenGoodsReceipt`, `flattenStockBatch`, `flattenStockMovement`; register all in `mappers`. Each maps client camelCase → the flat shape `db.toRow` snake-cases. Special: **`flattenStockMovement` maps `m.timestamp → movementTimestamp`** (so `db.toRow` yields `movement_timestamp`) and passes the rest. `items` arrays pass through untouched (JSONB). Supplier has no `hlcTimestamp` field — that's fine (the push loop stamps `hlc_timestamp` from `op.hlcTimestamp`, as for WholesaleCustomer).
- `sync.ts`: `RESOURCE_TABLE_MAP` += `Supplier:'suppliers'`, `PurchaseOrder:'purchase_orders'`, `GoodsReceipt:'goods_receipts'`, `StockBatch:'stock_batches'`, `StockMovement:'stock_movements'`. `ORG_SCOPED_TABLES` += those 5 table names.
- `rbac.ts`: `ROLE_PERMISSIONS.PHARMACIST` += the 5 resource types.
- Pull: NO code change — the generic org-scoped branch handles any `ORG_SCOPED_TABLES` member with `hlc_timestamp`.

## 6. Client (`apps/pharmacy-lite/`)

### 6.1 StockBatch enqueue (the only client-behavior change)
StockBatch mutates at 6 sites, each already adjacent to a StockMovement enqueue:
`inventory/stock-service.ts:43`, `:94`; `inventory/goods-receipt-service.ts:96`; `inventory/expiry-watchdog.ts:50`; `procurement/stock-count-service.ts:88`; `transfers/transfer-service.ts:128`.
Add a shared helper in a suitable inventory lib module:
```ts
export async function enqueueStockBatchSync(batch: StockBatch): Promise<void> {
  await enqueuePharmacySyncEntry({
    resourceType: 'StockBatch', resourceId: batch.id, action: 'update',
    payload: batch as unknown as Record<string, unknown>,
    hlcTimestamp: batch.hlcTimestamp, createdAt: new Date().toISOString(),
  })
}
```
At each site: after the `put`/`update` completes, read back the full batch (`db.stockBatches.get(id)`) — needed because the `update()` sites pass only partial fields — and call `enqueueStockBatchSync(fullBatch)`. The `goods-receipt-service:96` and `transfer-service:128` sites `put` a full batch object, so they can enqueue it directly. Each mutation already sets a fresh `hlcTimestamp`; reuse it. (These are non-PHI, so `enqueuePharmacySyncEntry` is correct — not the encrypted builder.)

### 6.2 Pull registration (`wholesale-pull.ts` or a shared inventory-pull — reuse `pullWholesale`'s machinery)
Add the 5 types to the pulled-types list, `tableFor`, and `toClientRow`:
- `tableFor`: `Supplier→db.suppliers`, `PurchaseOrder→db.purchaseOrders`, `GoodsReceipt→db.goodsReceipts`, `StockBatch→db.stockBatches`, `StockMovement→db.stockMovements`.
- `toClientRow`: for `StockMovement`, reverse `movementTimestamp → timestamp` (mirror the CustomerLedgerEntry `entryTimestamp` reversal). The others already match the client camelCase shape from `db.fromRows` (incl. camelCased JSONB `items` inner keys). The dirty-check + delete-on-tombstone rules apply unchanged (no deletes for these today, but the tombstone branch is harmless).
- The pulled-types constant is currently `WHOLESALE_TYPES`; either extend it (rename to `ORG_SYNC_TYPES`) or add the 5 alongside. Extend the same request + watermark (one org-level cursor).

## 7. Testing

**Hub (`sync.test.ts`):** each of the 5 pushes lands in its table, org stamped, with the right column mapping — esp. `StockMovement` `timestamp→movement_timestamp`, and `PurchaseOrder`/`GoodsReceipt` `items` JSONB preserved. (Batch these into a small describe block; assert the load-bearing column for each.)
**Client enqueue (`stock-service`/`goods-receipt-service` tests):** a stock mutation now enqueues a `StockBatch` sync entry (in addition to the existing StockMovement one) carrying the batch's `id` + `quantityOnHand`.
**Client pull (`wholesale-pull.test.ts`):** each of the 5 pulled rows lands in the right Dexie table; `StockMovement.movementTimestamp` → `timestamp`; `PurchaseOrder.items` inner keys camelCase.
**Typecheck + suites** clean for slice files; pre-existing hub unbuilt-dep/TRPCContext noise out of scope.
**Live (deferred, needs session):** create a supplier + PO + receive stock on device A → pull on device B → they appear; adjust stock on A → B sees the new `quantityOnHand`.

## 8. Reuse & risk

Everything but the StockBatch enqueue is additive Hub-side (zero client-hot-path risk) and immediately fixes 4 silently-failing pushes. The StockBatch enqueue touches 6 inventory mutation sites — isolated as its own task with dedicated review; the read-after-update adds one Dexie read per stock mutation (acceptable). The mechanism defined here is the template for the remaining orphaned resources (Transfers, StockCount, and eventually the PHI-gated POS domain).
