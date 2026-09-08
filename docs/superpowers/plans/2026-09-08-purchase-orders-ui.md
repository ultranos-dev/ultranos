# Purchase Orders UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the missing UI for the fully-scaffolded Purchase Orders feature so a pharmacist can create, send, receive-against, and cancel POs. The service layer (`purchase-order-service.ts`) + Hub sync (`PurchaseOrder` → `pharmacy_purchase_orders`, done in the inventory-sync slice) + Dexie table already exist and are unreachable from the UI (verified: no route/component imports the service).

**Design / current state (verified):**
- Service (`src/lib/procurement/purchase-order-service.ts`): `createPurchaseOrder({supplierId, supplierName, items: Omit<PurchaseOrderItem,'quantityReceived'>[], notes?, createdBy})`, `markPurchaseOrderSent(id)`, `recordReceiptAgainstPO(id, [{catalogItemId, quantityReceived}])` (updates received qty + auto-sets status partially_received/closed), `cancelPurchaseOrder(id)`, `getPurchaseOrders(statusFilter?)`, `getPurchaseOrderById(id)`.
- Types (`src/lib/procurement/types.ts`): `PurchaseOrder { id, supplierId, supplierName, status, items[], totalCost, notes?, createdBy, createdAt, sentAt?, closedAt?, hlcTimestamp }`; `PurchaseOrderItem { catalogItemId, catalogItemName, quantityOrdered, quantityReceived, unitCost }`; `PurchaseOrderStatus = 'draft'|'sent'|'partially_received'|'closed'|'cancelled'`.
- Suppliers dropdown: `getActiveSuppliers()` (`supplier-service.ts`). Catalog search: `db.catalogItems` (mirror the `NewOrderPage`/`ReceiveStockForm` pattern). Money: integer minor units; currency + `currencyMinorUnits` from `db.pharmacySettings`. Practitioner ref: `useAuthSessionStore.getState().getPractitionerRef()`.
- **Exact UI template:** the wholesale orders feature — `src/components/pharmacy/wholesale/OrdersPage.tsx` (list), `NewOrderPage.tsx` (create), `OrderDetailPage.tsx` (detail) + routes `wholesale/orders`, `/new`, `/[id]`. Mirror their structure + the OPD list-page/detail-page layout standard.

**Architecture:** 3 routes under `/inventory/orders` (list, `/new`, `/[id]`) + 3 components + sidebar nav entry + i18n (4 locales). PO-tracking scope: create→send→record-receipt→close/cancel via the existing service. (Deliberately OUT of scope: creating StockBatch/GoodsReceipt from a PO receipt — `recordReceiptAgainstPO` only tracks received quantities on the PO; actual stock-in remains the separate Goods Receipt flow. Note this in the detail page's receipt action.)

**Tech Stack:** Next.js/Dexie/Zustand-free (service calls)/Vitest (pharmacy-lite).

## Global Constraints

- **Layout standard (MANDATORY):** list page = standalone full-width `<h1>` (`text-2xl font-semibold`), ONE toolbar row (`flex flex-wrap items-center gap-3`: status pill-tabs → wide `SearchInput` `min-w-[200px] flex-1` → New-PO action folded at the END), ONE content box (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`) wrapping loading/EmptyState/table. Detail + form pages = standalone `<h1>`, left back button `<Button variant="ghost" size="sm" className="w-fit px-0">`, boxed cards `rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50`. Root `<div className="flex flex-col gap-4">` — no `mx-auto`/`max-w-*`/nested `<main>`. Mirror the wholesale-orders components exactly.
- **Semantic tokens only** (no hex/oklch); **logical RTL props** (`me-*`/`ms-*`/`text-start`); **icons from `@ultranos/ui-kit/icons`**; **EmptyState** from ui-kit for empty/loading.
- **Money = integer minor units**; unit cost input major→minor (`Math.round(x*10^minorUnits)`), display via a `formatAmount` helper (mirror NewOrderPage). `totalCost` is computed by the service; the form previews it.
- **i18n:** new keys under the `purchaseOrders` (or reuse a suitable) namespace in ALL FOUR message files (`en`/`ar`/`prs`/`ps`) — native where straightforward, English fallback acceptable (note it). The i18n test-mock returns key literals — assert on keys/data values, per the existing view tests.
- **NO-COMMIT mode.**

---

### Task 1: PO list page + sidebar nav

**Files:** Create `src/app/[locale]/(app)/inventory/orders/page.tsx` + `src/components/pharmacy/procurement/PurchaseOrdersPage.tsx`; Modify `src/components/sidebar/nav-config.ts` (+ i18n); Test `src/__tests__/PurchaseOrdersPage.test.tsx`.

**Interfaces:** Consumes `getPurchaseOrders(statusFilter?)`.

- [ ] **Step 1: Write the failing test** — render `<PurchaseOrdersPage />` with `getPurchaseOrders` mocked to return 2 POs (one draft, one sent); assert the list renders both (by PO id/supplierName + status) and the "New" action links to `/inventory/orders/new`. (Mirror `WholesaleCustomersPage.test.tsx`/`OrdersPage` test harness; i18n mock returns key literals.)
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test PurchaseOrdersPage` → FAIL (module not found).
- [ ] **Step 3: Implement** — `PurchaseOrdersPage.tsx` mirroring `OrdersPage.tsx`: h1; toolbar with status pill-tabs (All/Draft/Sent/Partially received/Closed/Cancelled) → `SearchInput` (filter by supplierName/id) → a `Link`/Button "New purchase order" → `/inventory/orders/new` folded at the row end; ONE content box with a table (columns: PO id short / Supplier / Status badge / Total (formatAmount) / Created date), rows `Link` to `/inventory/orders/${po.id}`; `EmptyState` inside the box when none. `page.tsx` = `'use client'` → `<PurchaseOrdersPage />`. Add `{ titleKey: 'purchaseOrders', url: '/inventory/orders' }` to the Inventory section of `nav-config.ts` (after `stockCount`/`transfers`). Add the `purchaseOrders` list + status i18n keys to all 4 message files.
- [ ] **Step 4: Run to verify PASS** — green.
- [ ] **Step 5: Commit** (skip in NO-COMMIT).

---

### Task 2: New PO page (create draft)

**Files:** Create `src/app/[locale]/(app)/inventory/orders/new/page.tsx` + `src/components/pharmacy/procurement/NewPurchaseOrderPage.tsx`; Test `src/__tests__/NewPurchaseOrderPage.test.tsx`.

**Interfaces:** Consumes `getActiveSuppliers()`, `db.catalogItems`, `db.pharmacySettings`, `getPractitionerRef()`, `createPurchaseOrder(...)`.

- [ ] **Step 1: Write the failing test** — mock `getActiveSuppliers` (1 supplier) + `db.catalogItems.toArray` (1 item) + `createPurchaseOrder`; render; select the supplier, add a catalog line (qty + unit cost), submit; assert `createPurchaseOrder` was called with `{ supplierId, supplierName, items: [{catalogItemId, catalogItemName, quantityOrdered, unitCost}], createdBy }` (unitCost in minor units) and it navigates to the new PO's detail. (Mirror `WholesaleNewOrderPage.test.tsx` harness.)
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test NewPurchaseOrderPage` → FAIL.
- [ ] **Step 3: Implement** — `NewPurchaseOrderPage.tsx` mirroring `NewOrderPage.tsx`: back button; h1; a Supplier `<select>` (from `getActiveSuppliers`); a line-items section with catalog search (over `db.catalogItems`, add a line with `quantityOrdered` + major-unit `unitCost` inputs) → the line stores `catalogItemId`, `catalogItemName` (= item.name), `quantityOrdered`, `unitCost` (minor); a running total (Σ unitCost×qty) via `formatAmount`; notes textarea; Create button → `createPurchaseOrder({ supplierId, supplierName, items, notes, createdBy: getPractitionerRef() })` then `router.push('/inventory/orders/${po.id}')`. Reuse the money helpers from NewOrderPage (duplicate the tiny `formatAmount`/`parseMajorToMinor` — they're per-file in the codebase). Add the new-PO i18n keys to all 4 locales.
- [ ] **Step 4: Run to verify PASS** — green (+ existing green).
- [ ] **Step 5: Commit** (skip).

---

### Task 3: PO detail page (send / record receipt / cancel)

**Files:** Create `src/app/[locale]/(app)/inventory/orders/[id]/page.tsx` + `src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx`; Test `src/__tests__/PurchaseOrderDetailPage.test.tsx`.

**Interfaces:** Consumes `getPurchaseOrderById(id)`, `markPurchaseOrderSent(id)`, `recordReceiptAgainstPO(id, [...])`, `cancelPurchaseOrder(id)`; `useParams`.

- [ ] **Step 1: Write the failing test** — mock `getPurchaseOrderById` → a `draft` PO with 1 item; render; assert it shows the supplier, status, and the item (ordered/received/unit cost). Assert a "Mark sent" action calls `markPurchaseOrderSent(id)` (visible for `draft`). Then a case: a `sent` PO shows a "Record receipt" affordance whose submit calls `recordReceiptAgainstPO(id, [{catalogItemId, quantityReceived}])`. (Adapt to the file's harness; i18n key literals.)
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test PurchaseOrderDetailPage` → FAIL.
- [ ] **Step 3: Implement** — `PurchaseOrderDetailPage.tsx` mirroring `OrderDetailPage.tsx`: back button → `/inventory/orders`; h1 (PO id/supplier); info card (supplier, status badge, total, created/sent/closed dates, notes); items card table (item name · ordered · received · unit cost · line total). Status-driven actions:
  - `draft` → **Mark sent** (`markPurchaseOrderSent`) + **Cancel** (`cancelPurchaseOrder`).
  - `sent` / `partially_received` → **Record receipt**: a per-item `quantityReceived` number input + submit → `recordReceiptAgainstPO(id, items.filter(qty>0))` then reload; + **Cancel**.
  - `closed` / `cancelled` → read-only (no actions).
  After any action, reload the PO (re-`getPurchaseOrderById`) so the status/received update. NOTE (comment + small helper text): recording a receipt updates PO tracking only; actual stock-in is done via Goods Receipt (out of scope here). `page.tsx` = `'use client'` → `<PurchaseOrderDetailPage />`. Add detail/action i18n keys to all 4 locales.
- [ ] **Step 4: Run to verify PASS** — green.
- [ ] **Step 5: Add LTR+RTL snapshot (list or detail) + commit** (skip commit).

---

### Task 4: Verification

**Files:** none.

- [ ] **Step 1: Suites** — `pnpm -F pharmacy-lite test PurchaseOrder NewPurchaseOrder` (all 3 new suites) → green; run the broader `pnpm -F pharmacy-lite test` sidebar/nav test if one asserts the nav shape (update if needed) — only the known `DatabaseClosedError` flake tolerated.
- [ ] **Step 2: i18n parity** — all 4 message files have the same `purchaseOrders` keys (no missing-key warnings). Verify with a key-count/diff.
- [ ] **Step 3: Typecheck** — `pnpm -F pharmacy-lite typecheck` → no NEW errors in the 3 new components / nav-config (pre-existing noise out of scope).
- [ ] **Step 4: Live (optional)** — if a session is available: create a PO (supplier + item), mark sent, record a partial receipt → confirm status → partially_received and the list reflects it; confirm the PO synced to `pharmacy_purchase_orders` on the Hub. Else defer.
- [ ] **Step 5: Final review** — reachability (nav → list → new → detail), service wiring (create/send/receipt/cancel all call the real service + persist/enqueue), layout-standard compliance, i18n parity, money minor-units correctness, no PHI concerns (procurement is non-PHI).

---

## Self-Review

**Coverage:** list+nav → T1; create → T2; detail+actions → T3; verify → T4. Every service function is exercised (getPurchaseOrders T1; createPurchaseOrder/getActiveSuppliers T2; getPurchaseOrderById/markSent/recordReceipt/cancel T3). **Placeholder scan:** none — routes/components/handlers all concrete; the receipt-≠-stock-in boundary is explicit. **Type consistency:** `PurchaseOrderItem` create-shape `Omit<...,'quantityReceived'>` (T2) matches the service; `recordReceiptAgainstPO(id, [{catalogItemId, quantityReceived}])` (T3) matches. Routes `/inventory/orders`(+`/new`,`/[id]`) consistent across nav (T1) + create redirect (T2) + detail (T3). Money minor-units consistent. **Layout:** mirrors the verified wholesale-orders components.
