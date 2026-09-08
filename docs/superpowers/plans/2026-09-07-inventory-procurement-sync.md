# Inventory & Procurement Org-Scoped Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Register `Supplier`, `PurchaseOrder`, `GoodsReceipt`, `StockBatch`, `StockMovement` on the org-scoped B1/B2 sync pattern so a pharmacy's inventory/procurement state syncs cross-device — fixing 4 silently-failing pushes and adding the missing StockBatch enqueue.

**Architecture:** 5 Hub tables (migration) + 5 flatteners + map/org-scoped/RBAC entries; client pull registration for all 5 (StockMovement `movement_timestamp↔timestamp` reversal); new StockBatch enqueue at its 6 mutation sites (materialized snapshot, LWW).

**Tech Stack:** Node/tRPC/Supabase (hub-api), Next.js/Dexie/Vitest (pharmacy-lite).

**Spec:** `docs/superpowers/specs/2026-09-07-inventory-procurement-sync-design.md`

## Global Constraints

- **Money = integer minor units → `BIGINT`** (costPrice/sellingPrice/totalCost/unitCost).
- **`StockMovement.timestamp` ↔ Hub `movement_timestamp`** — flatten maps `timestamp→movementTimestamp`; pull maps `movementTimestamp→timestamp` (mirrors CustomerLedgerEntry `entryTimestamp`).
- **`PurchaseOrder.items` + `GoodsReceipt.items` = JSONB**; inner keys snake_case at rest, camelCase on pull (via `db.toRow`/`db.fromRows` recursion — flattener passes `items` through, no per-key handling).
- **All 5 org-scoped + non-PHI:** each Hub table has `org_id NOT NULL` (stamped by the push loop from ctx), `hlc_timestamp TEXT NOT NULL` (stamped from `op.hlcTimestamp`); plaintext columns (no field encryption); in `ORG_SCOPED_TABLES`; PHARMACIST RBAC granted.
- **StockBatch snapshot sync:** enqueue the FULL batch row on mutation (`action:'update'`, LWW). The `update()` sites pass partial fields → read the batch back before enqueuing.
- **Client id types:** `catalog_item_id`/`zone_id`/`location_id`/`expiry_date` are TEXT on the Hub (client strings, not guaranteed UUIDs); real UUIDs (`supplier_id`/`goods_receipt_id`/`purchase_order_id`) are UUID but nullable where optional.
- **DB ops via Supabase MCP only.** Migration applied live (user-authorized standing directive).
- **NO-COMMIT mode:** implement + test, never `git add`/`git commit`.

---

## File Structure

**Create:** `supabase/migrations/050_inventory_procurement_sync.sql`; a StockBatch-enqueue helper (in an inventory lib module — implementer picks the idiomatic spot, e.g. `apps/pharmacy-lite/src/lib/inventory/stock-batch-sync.ts`).
**Modify:** `apps/hub-api/src/lib/resource-mappers.ts`, `apps/hub-api/src/trpc/routers/sync.ts`, `apps/hub-api/src/trpc/rbac.ts`, `apps/hub-api/src/__tests__/sync.test.ts`; `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts` (+ its test); the 5 StockBatch mutation-site files (+ their tests): `inventory/stock-service.ts`, `inventory/goods-receipt-service.ts`, `inventory/expiry-watchdog.ts`, `procurement/stock-count-service.ts`, `transfers/transfer-service.ts`.

---

### Task 1: Migration `050` — 5 inventory/procurement tables

**Files:** Create `supabase/migrations/050_inventory_procurement_sync.sql`

- [ ] **Step 1: Confirm** `list_migrations` → `050` free (047/048/049 used). Write the 5-table SQL from spec §4 verbatim (each: columns per §4, `org_id UUID NOT NULL`, `hlc_timestamp TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `idx_<table>_org ON (org_id)`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY "service_role_all_<table>" ... TO service_role USING (true) WITH CHECK (true)`).
- [ ] **Step 2: Apply** via `apply_migration` (name `050_inventory_procurement_sync`).
- [ ] **Step 3: Verify** via `execute_sql`: all 5 tables exist with expected columns (spot-check `stock_movements.movement_timestamp`, `purchase_orders.items` = jsonb, `stock_batches.quantity_on_hand`, money cols BIGINT); `relrowsecurity=true` for each.
- [ ] **Step 4: Commit** (checkpoint — skip in NO-COMMIT).

**NOTE:** Controller may run this task directly via Supabase MCP (as with 047/048/049).

---

### Task 2: Hub ingestion — 5 flatteners + map + org-scoped + RBAC

**Files:** Modify `apps/hub-api/src/lib/resource-mappers.ts`, `apps/hub-api/src/trpc/routers/sync.ts`, `apps/hub-api/src/trpc/rbac.ts`; Test `apps/hub-api/src/__tests__/sync.test.ts`

**Interfaces:**
- Produces: `sync.push` ingests all 5 types into their tables with correct column mapping.

- [ ] **Step 1: Write failing tests** — add a `describe('sync.push — inventory/procurement ingestion')` block to `sync.test.ts` (reuse the existing ContractPrice/wholesale push caller + capture harness). One case per resource asserting `success:true`, the right table, org stamped, and the load-bearing column:
  - Supplier → `pharmacy_suppliers`, `name` present.
  - PurchaseOrder → `pharmacy_purchase_orders`, `items` JSONB length preserved, `total_cost` = the minor-unit value.
  - GoodsReceipt → `goods_receipts`, `items` preserved, `received_by` present.
  - StockBatch → `stock_batches`, `quantity_on_hand` = the value.
  - StockMovement → `stock_movements`, **`movement_timestamp` present (from client `timestamp`)**, `quantity` = value.
  (Row may be camelCase in the mock — assert `movementTimestamp`/`totalCost`/etc. per the wholesale precedent; the load-bearing fact is the mapping, esp. `timestamp→movementTimestamp`.)
- [ ] **Step 2: Run to verify it fails** — `pnpm -F hub-api test sync` → FAIL (`Unknown resource type: Supplier` etc.).
- [ ] **Step 3: Implement:**
  - `resource-mappers.ts`: add + register 5 flatteners:
```ts
function flattenSupplier(s: any): Record<string, unknown> {
  return { id: s.id, name: s.name, contactName: s.contactName, phone: s.phone, email: s.email, address: s.address, leadTimeDays: s.leadTimeDays, paymentTerms: s.paymentTerms, isActive: s.isActive ?? true, createdAt: s.createdAt }
}
function flattenPurchaseOrder(p: any): Record<string, unknown> {
  return { id: p.id, supplierId: p.supplierId, supplierName: p.supplierName, status: p.status, items: p.items ?? [], totalCost: p.totalCost ?? 0, notes: p.notes, createdBy: p.createdBy, sentAt: p.sentAt, closedAt: p.closedAt }
}
function flattenGoodsReceipt(g: any): Record<string, unknown> {
  return { id: g.id, supplierId: g.supplierId, purchaseOrderId: g.purchaseOrderId, receivedBy: g.receivedBy, items: g.items ?? [], totalCost: g.totalCost ?? 0, notes: g.notes, receivedAt: g.receivedAt }
}
function flattenStockBatch(b: any): Record<string, unknown> {
  return { id: b.id, catalogItemId: b.catalogItemId, batchNumber: b.batchNumber, lotNumber: b.lotNumber, expiryDate: b.expiryDate, quantityOnHand: b.quantityOnHand ?? 0, costPrice: b.costPrice ?? 0, sellingPrice: b.sellingPrice ?? 0, zoneId: b.zoneId, supplierId: b.supplierId, goodsReceiptId: b.goodsReceiptId, receivedAt: b.receivedAt, status: b.status, locationId: b.locationId }
}
function flattenStockMovement(m: any): Record<string, unknown> {
  return { id: m.id, stockBatchId: m.stockBatchId, catalogItemId: m.catalogItemId, type: m.type, quantity: m.quantity, reason: m.reason, referenceId: m.referenceId, referenceType: m.referenceType, performedBy: m.performedBy, movementTimestamp: m.timestamp }
}
// register: Supplier: flattenSupplier, PurchaseOrder: flattenPurchaseOrder, GoodsReceipt: flattenGoodsReceipt, StockBatch: flattenStockBatch, StockMovement: flattenStockMovement
```
  - `sync.ts`: `RESOURCE_TABLE_MAP` += `Supplier:'pharmacy_suppliers', PurchaseOrder:'pharmacy_purchase_orders', GoodsReceipt:'goods_receipts', StockBatch:'stock_batches', StockMovement:'stock_movements'`. `ORG_SCOPED_TABLES` += `'pharmacy_suppliers','pharmacy_purchase_orders','goods_receipts','stock_batches','stock_movements'`. **NOTE:** Supplier/PurchaseOrder map to `pharmacy_*` tables — bare `suppliers`/`purchase_orders` pre-exist on the Hub with an incompatible schema (no `hlc_timestamp`); do NOT map to those.
  - `rbac.ts`: `ROLE_PERMISSIONS.PHARMACIST` += `'Supplier','PurchaseOrder','GoodsReceipt','StockBatch','StockMovement'`.
- [ ] **Step 4: Run to verify it passes** — `pnpm -F hub-api test sync` → PASS (+ existing sync green).
- [ ] **Step 5: Commit** (checkpoint — skip).

---

### Task 3: Client pull registration for the 5 types

**Files:** Modify `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts`; Test `apps/pharmacy-lite/src/__tests__/wholesale-pull.test.ts`

**Interfaces:**
- Consumes: the existing `pullWholesale` machinery + shared watermark.
- Produces: pulled Supplier/PurchaseOrder/GoodsReceipt/StockBatch/StockMovement land in their Dexie tables; StockMovement `movementTimestamp→timestamp`.

- [ ] **Step 1: Write failing tests** — add to `wholesale-pull.test.ts` (reuse `pullResponse`): a batch of pulled rows (one per new type) lands in the right table; assert esp. `StockMovement` stored with `timestamp` (not `movementTimestamp`) and `PurchaseOrder.items` inner key `catalogItemId` present; and the request input contains e.g. `'StockMovement'`.
- [ ] **Step 2: Run to verify it fails** — `pnpm -F pharmacy-lite test wholesale-pull` → FAIL (types not in the pulled list / no table route / no reversal).
- [ ] **Step 3: Implement** in `wholesale-pull.ts`:
  - Extend the pulled-types constant (`WHOLESALE_TYPES`) to include `'Supplier','PurchaseOrder','GoodsReceipt','StockBatch','StockMovement'` (optionally rename to `ORG_SYNC_TYPES`; keep the export/consumers consistent).
  - `tableFor`: add `Supplier→db.suppliers`, `PurchaseOrder→db.purchaseOrders`, `GoodsReceipt→db.goodsReceipts`, `StockBatch→db.stockBatches`, `StockMovement→db.stockMovements`.
  - `toClientRow`: add a `StockMovement` branch reversing `movementTimestamp→timestamp`: `if (resourceType === 'StockMovement') { const { movementTimestamp, ...rest } = data; return { ...rest, timestamp: movementTimestamp } }`. The other 4 already match the client shape from `db.fromRows`.
- [ ] **Step 4: Run to verify it passes** — green (+ existing pull tests, incl. the wholesale + tombstone cases).
- [ ] **Step 5: Commit** (checkpoint — skip).

---

### Task 4: StockBatch enqueue at mutation sites (materialized snapshot)

**Files:** Create the enqueue helper (e.g. `apps/pharmacy-lite/src/lib/inventory/stock-batch-sync.ts`); Modify `inventory/stock-service.ts`, `inventory/goods-receipt-service.ts`, `inventory/expiry-watchdog.ts`, `procurement/stock-count-service.ts`, `transfers/transfer-service.ts`; Tests alongside (extend `stock-service` + `goods-receipt-service` test files at minimum).

**Interfaces:**
- Consumes: `db.stockBatches`, `enqueuePharmacySyncEntry`, `StockBatch` type.
- Produces: every StockBatch mutation enqueues a `StockBatch`/`update` sync entry with the full row.

- [ ] **Step 1: Write failing tests** — in the existing `stock-service` test (and `goods-receipt-service` test), after a stock mutation, assert `db.syncQueue` now contains a `StockBatch` entry with the mutated batch's `id` (in addition to the existing StockMovement entry). READ those test files first to reuse their harness (db reset + encryption key setup + how they call the service).
```ts
// sketch (adapt to the real service API):
// perform a stock deduction on batch b1 → expect a syncQueue entry { resourceType:'StockBatch', resourceId:'b1', action:'update' }
```
- [ ] **Step 2: Run to verify it fails** — the relevant `pnpm -F pharmacy-lite test <stock-service|goods-receipt-service>` → FAIL (no StockBatch enqueue yet).
- [ ] **Step 3: Implement:**
  - Create `enqueueStockBatchSync(batch: StockBatch)` per spec §6.1 (enqueues `resourceType:'StockBatch', action:'update', payload: batch, hlcTimestamp: batch.hlcTimestamp, createdAt: now`).
  - At each of the 6 sites: after the `put`/`update`, obtain the FULL batch. For `update()` sites (partial fields), read it back: `const full = await db.stockBatches.get(id); if (full) await enqueueStockBatchSync(full)`. For `put(fullBatch)` sites (goods-receipt:96, transfer:128), pass the object directly. Place the enqueue OUTSIDE any Dexie transaction zone (encryption is async — same rule the existing enqueues follow; if a site is inside `db.transaction(...)`, enqueue after it commits, mirroring the existing StockMovement enqueue's placement at that site).
- [ ] **Step 4: Run to verify it passes** — the stock tests green (+ all existing inventory/procurement/transfer tests still green — these are hot paths; run the full inventory + procurement + transfers test set).
- [ ] **Step 5: Commit** (checkpoint — skip).

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Hub suite** — `pnpm -F hub-api test sync` → 5 new ingestion cases + existing green.
- [ ] **Step 2: Pharmacy suites** — `pnpm -F pharmacy-lite test wholesale-pull stock-service goods-receipt-service expiry-watchdog stock-count transfer` → new cases pass; existing inventory/procurement/transfer tests green (only the known `DatabaseClosedError` teardown flake tolerated).
- [ ] **Step 3: Typecheck** — `pnpm -F pharmacy-lite typecheck` (slice files clean) and `pnpm -F hub-api typecheck` (no NEW errors referencing `sync.ts`/`resource-mappers.ts`/`rbac.ts`; pre-existing unbuilt-`@ultranos/*`-dep + `TRPCContext` test-harness errors out of scope).
- [ ] **Step 4: Live (deferred)** — if a session is available: supplier + PO + receipt on device A → pull on B → appear; adjust stock on A → B sees new `quantityOnHand`. Else record deferred.

---

## Self-Review

**Spec coverage:** §4 migration → T1 (5 tables). §5 ingestion (5 flatteners + map + org-scoped + RBAC) → T2. §6.2 pull → T3. §6.1 StockBatch enqueue → T4. §7 tests → each task + T5.

**Placeholder scan:** no TBD/TODO. T4 defers the exact per-site placement + test harness to "the file's existing pattern" (real code the implementer reads) but gives the helper, the read-after-update rule, and the 6 exact sites — acceptable for modify-existing hot-path work.

**Type consistency:** `timestamp`(client) ↔ `movement_timestamp`(Hub column) ↔ `movementTimestamp`(flat/camel) symmetric across T2 (flatten `timestamp→movementTimestamp`) and T3 (pull `movementTimestamp→timestamp`). Table names consistent T1↔T2 (`suppliers`/`purchase_orders`/`goods_receipts`/`stock_batches`/`stock_movements`) ↔ T2 `RESOURCE_TABLE_MAP`/`ORG_SCOPED_TABLES` ↔ T3 `tableFor` Dexie tables (`db.suppliers`/`db.purchaseOrders`/`db.goodsReceipts`/`db.stockBatches`/`db.stockMovements`). Money BIGINT consistent. Migration `050`.
