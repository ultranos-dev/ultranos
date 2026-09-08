# Transfers & Stock-Count Org-Scoped Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Register `StockTransfer` + `StockCount` on the org-scoped B1/B2 sync pattern (fixing the orphaned StockTransfer push and adding the missing StockCount enqueue), completing operational inventory sync.

**Architecture:** 2 Hub tables (migration, TEXT id columns from the start) + 2 flatteners + map/org-scoped/RBAC; client pull registration for both; a StockCount enqueue at create + complete. Reuses the prior Inventory/Procurement slice's live-verified recipe.

**Tech Stack:** Node/tRPC/Supabase (hub-api), Next.js/Dexie/Vitest (pharmacy-lite).

**Spec:** `docs/superpowers/specs/2026-09-08-transfers-stockcount-sync-design.md`

## Global Constraints

- **All client id/location-id columns are `TEXT`** (StockTransfer `id`/`from_location_id`/`to_location_id`; StockCount `id`) — client ids are `string`, seed/imported data uses non-UUID strings. `org_id` stays UUID (stamped from context); `hlc_timestamp` TEXT.
- **`items` = JSONB** for both; inner keys snake at rest, camel on pull (via `db.toRow`/`db.fromRows` recursion — flatteners pass `items` through).
- **No money columns** (quantity-based); **no column renames** (no reserved-word `timestamp` field → no pull `toClientRow` reversal).
- **StockCount enqueue** carries the FULL count row; never call the async `enqueuePharmacySyncEntry` inside a `db.transaction` zone (pre-build + `syncQueue.put` inside, or enqueue after the txn — mirror the adjacent movement enqueue). StockTransfer needs no client change (already enqueues create + update).
- **DB ops via Supabase MCP only.** Migration applied live (user-authorized standing directive).
- **NO-COMMIT mode.**

---

## File Structure

**Create:** `supabase/migrations/053_transfers_stockcount_sync.sql`.
**Modify:** `apps/hub-api/src/lib/resource-mappers.ts`, `apps/hub-api/src/trpc/routers/sync.ts`, `apps/hub-api/src/trpc/rbac.ts`, `apps/hub-api/src/__tests__/sync.test.ts`; `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts` (+ test); `apps/pharmacy-lite/src/lib/procurement/stock-count-service.ts` (+ test).

---

### Task 1: Migration `053` — `stock_transfers` + `stock_counts`

**Files:** Create `supabase/migrations/053_transfers_stockcount_sync.sql`

- [ ] **Step 1:** `list_migrations` (confirm `053` free; 048-052 used). Write the 2-table SQL from spec §4 (TEXT id columns; `org_id UUID NOT NULL`; `hlc_timestamp TEXT NOT NULL`; `created_at DEFAULT NOW()`; `idx_<t>_org`; `ENABLE ROW LEVEL SECURITY`; `CREATE POLICY "service_role_all_<t>" ... TO service_role USING(true) WITH CHECK(true)`).
- [ ] **Step 2:** `apply_migration` (name `053_transfers_stockcount_sync`).
- [ ] **Step 3: Verify** via `execute_sql`: both tables exist; `stock_transfers.id` + `stock_counts.id` are `text`; `items` = `jsonb`; `relrowsecurity=true`.
- [ ] **Step 4: Commit** (checkpoint — skip in NO-COMMIT).

**NOTE:** Controller may run this directly via Supabase MCP (as with 048-052).

---

### Task 2: Hub ingestion — 2 flatteners + map + org-scoped + RBAC

**Files:** Modify `resource-mappers.ts`, `sync.ts`, `rbac.ts`; Test `sync.test.ts`.

- [ ] **Step 1: Write failing tests** — add a `describe('sync.push — transfers/stock-count ingestion')` block to `sync.test.ts` (reuse the existing push caller + capture harness). One case each:
  - StockTransfer → `stock_transfers`, org stamped, `items` preserved (inner `stockBatchId`), `fromLocationId`/`from_location_id` present.
  - StockCount → `stock_counts`, org stamped, `items` preserved (inner `expectedQty`), `countedBy`/`counted_by` present.
  (Mock row may be camelCase pre-`db.toRow`; assert accordingly, per precedent.)
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F hub-api test sync` → FAIL (`Unknown resource type: StockTransfer`).
- [ ] **Step 3: Implement:**
  - `resource-mappers.ts`:
```ts
function flattenStockTransfer(t: any): Record<string, unknown> {
  return { id: t.id, fromLocationId: t.fromLocationId, fromLocationName: t.fromLocationName, toLocationId: t.toLocationId, toLocationName: t.toLocationName, status: t.status, items: t.items ?? [], requestedBy: t.requestedBy, requestedAt: t.requestedAt, approvedBy: t.approvedBy, approvedAt: t.approvedAt, shippedAt: t.shippedAt, receivedAt: t.receivedAt, receivedBy: t.receivedBy, cancelledReason: t.cancelledReason }
}
function flattenStockCount(c: any): Record<string, unknown> {
  return { id: c.id, type: c.type, status: c.status, countedBy: c.countedBy, items: c.items ?? [], totalVarianceItems: c.totalVarianceItems ?? 0, startedAt: c.startedAt, completedAt: c.completedAt }
}
// register: StockTransfer: flattenStockTransfer, StockCount: flattenStockCount
```
  - `sync.ts`: `RESOURCE_TABLE_MAP` += `StockTransfer:'stock_transfers', StockCount:'stock_counts'`; `ORG_SCOPED_TABLES` += `'stock_transfers','stock_counts'`.
  - `rbac.ts`: `ROLE_PERMISSIONS.PHARMACIST` += `'StockTransfer','StockCount'`.
- [ ] **Step 4: Run to verify PASS** — `pnpm -F hub-api test sync` → PASS (+ existing green).
- [ ] **Step 5: Commit** (skip).

---

### Task 3: Client pull registration

**Files:** Modify `wholesale-pull.ts`; Test `wholesale-pull.test.ts`.

- [ ] **Step 1: Write failing tests** — add to `wholesale-pull.test.ts` (reuse `pullResponse`): a pulled StockTransfer lands in `db.stockTransfers` with `items[0].stockBatchId` present; a pulled StockCount lands in `db.stockCounts` with `items[0].expectedQty`; the request input contains `'StockTransfer'`.
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test wholesale-pull` → FAIL (types not routed).
- [ ] **Step 3: Implement** in `wholesale-pull.ts`: add `'StockTransfer'`,`'StockCount'` to the pulled-types list; `tableFor`: `StockTransfer→db.stockTransfers`, `StockCount→db.stockCounts`. NO `toClientRow` branch.
- [ ] **Step 4: Run to verify PASS** — green (+ existing pull tests).
- [ ] **Step 5: Commit** (skip).

---

### Task 4: StockCount enqueue at create + complete

**Files:** Modify `procurement/stock-count-service.ts`; Test its existing test (or a focused new one).

**Interfaces:** Consumes `enqueuePharmacySyncEntry` / the encrypted builder; `StockCount`.

- [ ] **Step 1: Write failing tests** — READ `stock-count-service.ts` + its test first. Assert: after `startStockCount(...)` a `StockCount`/`create` sync-queue entry exists with the count id; after `completeStockCount(id)` a `StockCount`/`update` entry exists (alongside the existing variance StockMovement entries).
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test stock-count` → FAIL (no StockCount enqueue).
- [ ] **Step 3: Implement:**
  - `startStockCount`: after the count is persisted, `await enqueuePharmacySyncEntry({ resourceType:'StockCount', resourceId:count.id, action:'create', payload: count as unknown as Record<string,unknown>, hlcTimestamp: count.hlcTimestamp, createdAt: new Date().toISOString() })`. (If the persist is inside a txn, enqueue after it commits; the count object is in scope.)
  - `completeStockCount`: the txn updates the count + puts variance-movement sync entries INSIDE the txn. Mirror that idiom for the StockCount: pre-build a `StockCount`/`update` entry (same builder the movements use, full updated count row as payload) + `db.syncQueue.put` inside the txn; OR after the txn read the count back and `enqueuePharmacySyncEntry`. NEVER call the async enqueue inside the `db.transaction` zone. The updated count = `{ ...count, status:'completed', completedAt:now, totalVarianceItems, hlcTimestamp:now }` (build the full row you already write to the table).
- [ ] **Step 4: Run to verify PASS** — `pnpm -F pharmacy-lite test stock-count` → PASS (+ existing green; the variance-movement enqueues + stock math unchanged).
- [ ] **Step 5: Commit** (skip).

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Hub** — `pnpm -F hub-api test sync` → 2 new cases + existing green.
- [ ] **Step 2: Pharmacy** — `pnpm -F pharmacy-lite test wholesale-pull stock-count` → new cases pass; existing green (only the known `DatabaseClosedError` flake tolerated).
- [ ] **Step 3: Typecheck** — `pnpm -F pharmacy-lite typecheck` (slice files clean) + `pnpm -F hub-api typecheck` (no NEW `resource-mappers.ts`/`sync.ts`/`rbac.ts` errors; pre-existing noise out of scope).
- [ ] **Step 4: Live (optional)** — create a transfer + a stock count → Sync Now → confirm rows in `stock_transfers`/`stock_counts` (DB query). Else record deferred.

---

## Self-Review

**Spec coverage:** §4 migration → T1. §5 ingestion → T2. §6.1 pull → T3. §6.2 StockCount enqueue → T4. §7 tests → each task + T5. StockTransfer needs no client change (already enqueues) — noted.

**Placeholder scan:** no TBD/TODO. T4 defers exact per-site idiom to "the file's existing pattern" (real code the implementer reads) but gives the enqueue shape + the never-async-in-txn rule + the full-row payload.

**Type consistency:** table names `stock_transfers`/`stock_counts` consistent T1 ↔ T2 (`RESOURCE_TABLE_MAP`/`ORG_SCOPED_TABLES`) ↔ T3 (`tableFor` → `db.stockTransfers`/`db.stockCounts`). `items` JSONB both. TEXT id columns. No renames → no pull reversal. Migration `053`.
