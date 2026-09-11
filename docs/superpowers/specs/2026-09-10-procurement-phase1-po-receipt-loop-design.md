# Procurement Overhaul — Phase 1: Close the PO → Receipt → Stock Loop

**Date:** 2026-09-10
**App:** `apps/pharmacy-lite`
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul (Phase 1 of 4). Later phases (financial
completeness; controls & workflow; supplier master & reorder automation) get
their own spec → plan cycles.

## Context

An audit of the ordering/receiving workflow found the two halves are
**disconnected**, forcing double data entry and guaranteed counter drift:

- Recording a receipt against a PO only bumps a `quantityReceived` counter and
  flips status — it creates **no** stock (`purchase-order-service.ts:46-69`).
  The PO detail page even documents this: *"recording a receipt updates PO
  tracking only; actual stock-in is done via Goods Receipt (out of scope
  here)"* (`PurchaseOrderDetailPage.tsx:454-455`).
- Receiving actual stock (`ReceiveStockForm` → `processGoodsReceipt`) never
  passes or updates a `purchaseOrderId` (`ReceiveStockForm.tsx:58-71`), even
  though the service accepts one (`goods-receipt-service.ts:8`).

Two independent verified bugs in the same area are folded into this phase:

- `updateSupplier` / `deactivateSupplier` do **not** enqueue a sync entry,
  unlike `createSupplier` (`supplier-service.ts:40-46`) — supplier edits never
  reach the Hub.
- `getActiveSuppliers` queries `.where('isActive').equals(1)` (number) but
  `createSupplier` stores `isActive: true` (boolean) (`supplier-service.ts:25,49`).
  IndexedDB does not index boolean keys, so this likely returns no rows.

## Goal

One **"Receive against PO"** action that pre-fills from the PO, atomically posts
stock **and** updates the PO's received counts/status, guards over-receipt,
records itemized receipt events, supports intact-only reversal, and attributes
every state change to a user.

## Locked Decisions

1. **Reuse `ReceiveStockForm`, pre-filled from the PO** — one atomic stock-in
   code path; ad-hoc (no-PO) receiving unchanged.
2. **Over-receipt:** soft block with a configurable tolerance % + override
   reason; **controlled substances hard-block** (no tolerance, no override).
3. **Reversal only while the receipt's stock is intact**; otherwise route to
   stock adjustment (Track 1). Append-only — never deletes movements.
4. **Reuse `GoodsReceipt` as the per-receipt event**; PO keeps a cumulative
   counter updated atomically; add actor attribution. Full `@ultranos/audit-logger`
   events deferred to Phase 3.

## Data-Model Changes (additive)

### `PurchaseOrder` (`src/lib/procurement/types.ts`)
- Add `sentBy?: string`, `cancelledBy?: string`, `cancelledReason?: string`.
- Keep per-line `quantityReceived` (now updated atomically with stock-in).

### `GoodsReceipt` (`src/lib/inventory/types.ts`)
- Add `overReceiptReason?: string`.
- Add reversal linkage: `reversalOf?: string` (id of the receipt this one
  reverses) on the reversing receipt; `reversedByReceiptId?: string` on the
  original once reversed.

### `PharmacyInventorySettings` (`src/lib/inventory/types.ts`)
- Add `overReceiptTolerancePercent: number` (default `0` in
  `DEFAULT_PHARMACY_SETTINGS`).

### No new object store
Receipt history for a PO = `db.goodsReceipts.where('purchaseOrderId').equals(poId)`.
Reversal reuses the existing `StockMovement` type `'void_reversal'` with
`referenceType: 'void'`, `referenceId = originalReceiptId`. The `goodsReceipts`
store is currently indexed `id, receivedAt, supplierId` — it has **no**
`purchaseOrderId` index, so add one (`goodsReceipts: 'id, receivedAt,
supplierId, purchaseOrderId'`). That is an indexed-schema change and **requires a
Dexie version bump**, unlike the non-indexed field additions above.

## Component / Module Design

### `processGoodsReceipt` — extended (the loop closure)
`src/lib/inventory/goods-receipt-service.ts`

When `purchaseOrderId` is present, the function additionally reconciles the PO
inside the **same** transaction:

1. **Before the tx:** read the PO (`getPurchaseOrderById`) and the catalog items
   for the received lines. Run `validateReceiptAgainstPO(...)` (below); throw a
   typed `OverReceiptError` if it fails and no override reason is supplied.
2. **Inside the tx** (tx tables now include `db.purchaseOrders`): build batches +
   movements + `GoodsReceipt` as today, then read-modify-write the PO —
   increment each matched line's `quantityReceived`, recompute status
   (`closed` if all lines fully received, else `partially_received`), set
   `closedAt` when closing. Applying increments inside the tx (not overwriting a
   stale snapshot) keeps it correct under the encryption-await gap.
3. **After the tx:** enqueue the PO sync entry with the post-tx PO value via
   `enqueuePharmacySyncEntry` (encryption runs outside the tx zone — mirrors
   `deductStock` → `enqueueStockBatchSync`). Batch/movement/receipt sync entries
   remain pre-built and written inside the tx as today.

Ad-hoc path (no `purchaseOrderId`) is unchanged — the PO branch is skipped
entirely; a regression test locks this.

### `validateReceiptAgainstPO(po, catalogItems, receivedItems, tolerancePercent)`
`src/lib/procurement/po-receipt.ts` (new, pure/testable)

For each received line matched to a PO line:
- `remaining = quantityOrdered − quantityReceived`.
- If the catalog item has a `controlledSchedule`: allowed max = `remaining`
  exactly (**hard block**; over → throw regardless of override/tolerance).
- Else: allowed max = `floor(remaining × (1 + tolerancePercent/100))`. Over the
  allowed max → throw unless an `overReceiptReason` is supplied for the receipt.
Returns a validated result or throws `OverReceiptError` (carrying which lines
violated). Pure function — no DB access — so it is unit-tested directly.

### Retire `recordReceiptAgainstPO`
`src/lib/procurement/purchase-order-service.ts`
The counter-only `recordReceiptAgainstPO` is removed; its reconciliation logic
moves into `processGoodsReceipt`'s PO branch (via a small internal
`applyReceiptToPO(po, receivedItems)` pure helper in `po-receipt.ts` that
returns updated items + status, used inside the tx).

### Attribution on PO state changes
`src/lib/procurement/purchase-order-service.ts`
- `markPurchaseOrderSent(poId, sentBy)` — set `sentBy`.
- `cancelPurchaseOrder(poId, cancelledBy, reason?)` — set `cancelledBy`,
  `cancelledReason`.
- `createPurchaseOrder` already sets `createdBy`.
Callers pass `session.practitionerId ?? session.userId` from
`useAuthSessionStore` (the pattern established in `ReceiveStockForm.tsx:68`).

### `reverseGoodsReceipt(receiptId, performedBy)` — intact-only reversal
`src/lib/inventory/goods-receipt-reversal.ts` (new)

1. Load the `GoodsReceipt` and every `StockBatch` with
   `goodsReceiptId === receiptId`.
2. **Intact check:** for each such batch, require `status === 'active'` AND
   `quantityOnHand === (the receipt line's quantity)`. If any fails → throw
   `ReceiptNotReversibleError` (UI directs to stock adjustment / disposal). Also
   throw if the receipt is already reversed (`reversedByReceiptId` set) or is
   itself a reversal (`reversalOf` set).
3. **Effect (one Dexie transaction over `stockBatches`, `stockMovements`,
   `goodsReceipts`, `purchaseOrders`, `syncQueue`):** do NOT reuse `deductStock`
   (it opens its own per-batch tx, which would make an N-batch reversal
   non-atomic). Instead, mirroring `processGoodsReceipt`'s structure, pre-build
   the encrypted sync entries before the tx, then inside the tx: for each batch
   write a `'void_reversal'` movement of `−quantityOnHand`
   (`referenceType: 'void'`, `referenceId = receiptId`) and set the batch to
   `quantityOnHand: 0, status: 'depleted'`; write the reversing `GoodsReceipt`
   (`reversalOf = receiptId`, `receivedBy = performedBy`, negative-quantity
   items); set the original receipt's `reversedByReceiptId`; and if the receipt
   has a `purchaseOrderId`, read-modify-write the PO to decrement each matched
   line's `quantityReceived` by the reversed amount and recompute status
   **downward** (reopen `closed`→`partially_received`/`sent`, clear `closedAt`
   when no longer closed). Enqueue the PO sync entry **after** the tx (encryption
   idiom); the movement/batch/receipt sync entries are written inside the tx.
   Movements are appended, never deleted.

### UI

**`ReceiveStockForm` — PO mode** (`src/components/pharmacy/inventory/ReceiveStockForm.tsx`)
- New optional prop `purchaseOrderId?: string`. When set, on mount it loads the
  PO, pre-fills one `ReceiveLineItem` per PO line with `remaining > 0` (product
  from `db.catalogItems.get`, default qty = remaining, default cost = PO
  `unitCost`, selling price = catalog default), and passes `purchaseOrderId` +
  the PO's `supplierId` into `processGoodsReceipt`.
- In PO mode the `CatalogSearchInput` "add item" is **hidden** (closed-set: no
  off-PO lines). A catalog item missing for a PO line renders the line read-only
  with a "product unavailable" note (rare; can't build a full receive row).
- An `overReceiptReason` input appears only when a line's qty exceeds its
  remaining (non-controlled). Submit surfaces `OverReceiptError` inline.

**Receive route** (`src/app/[locale]/(app)/inventory/receive/page.tsx`)
- Read `poId` from search params and pass it as `purchaseOrderId` to
  `ReceiveStockForm`.

**PO detail** (`src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx`)
- Replace the inline counter inputs + `recordReceiptAgainstPO` call with a
  **"Receive against PO"** button (status `sent`/`partially_received`) linking to
  `/inventory/receive?poId=<id>`.
- Add a **Receipt history** section: list `GoodsReceipts` for this PO (date,
  receivedBy, per-line qtys, over-receipt reason, reversal state) with a
  **"Reverse"** action per intact receipt → confirms → `reverseGoodsReceipt`.
- `Mark sent` / `Cancel` pass the authenticated user (and cancel captures an
  optional reason).

### Bug fixes (`src/lib/procurement/supplier-service.ts`)
- `updateSupplier`: after `db.suppliers.update`, read the updated row and
  `enqueuePharmacySyncEntry({ resourceType: 'Supplier', action: 'update', ... })`.
- `deactivateSupplier`: same enqueue after setting `isActive: false`.
- `getActiveSuppliers`: `return db.suppliers.filter((s) => s.isActive).toArray()`
  (in-memory filter; no boolean-index dependency; no data migration).

## Errors & Edge Cases

- `OverReceiptError` (typed) — carries violating lines; UI maps to inline copy.
- `ReceiptNotReversibleError` (typed) — UI shows which batches were drawn down
  and links to adjustment/disposal.
- PO not found / already closed / cancelled at receive time → the receive submit
  fails with a clear message; the pre-fill screen refuses to load for a
  `closed`/`cancelled` PO.
- Cost entered at receipt may differ from PO `unitCost` (actual invoice price);
  the batch stores the entered cost. PO `unitCost` is unchanged (cost-variance
  tracking is Phase 2).
- No PHI in logs/errors: continue logging only opaque ids / `err.message`.

## Testing

- **Unit — `validateReceiptAgainstPO`:** within remaining; within tolerance;
  over tolerance without reason (throws); over tolerance with reason (passes);
  controlled-substance over remaining (throws regardless of reason/tolerance).
- **Unit — `applyReceiptToPO`:** partial → `partially_received`; final →
  `closed` + `closedAt`; reversal decrement → reopen + `closedAt` cleared.
- **Unit — `reverseGoodsReceipt`:** intact reversal (batch depleted, movement
  appended, PO counts roll back); blocked when a batch was drawn down; blocked
  when already reversed.
- **Integration — the loop:** create PO → `markPurchaseOrderSent(…, user)` →
  receive partial via `processGoodsReceipt({ purchaseOrderId })` → PO
  `partially_received`, `quantityReceived` matches, batches + movements posted,
  PO sync enqueued → receive remainder → `closed`.
- **Regression:** `processGoodsReceipt` with no `purchaseOrderId` behaves exactly
  as today (no PO touched).
- **Compliance:** controlled-substance hard-block covered; `sentBy`/`cancelledBy`/
  `receivedBy` attribution asserted.
- **Bug fixes:** `updateSupplier`/`deactivateSupplier` enqueue a sync entry;
  `getActiveSuppliers` returns rows created with `isActive: true`.

## Out of Scope (later phases)

- PO numbering, tax/discount/freight, landed cost, WAC, supplier invoice + 3-way
  match (Phase 2).
- Approval workflow / segregation of duties, PO amendment, line cancel /
  backorder, QC/inspection hold on receipt, `@ultranos/audit-logger` events
  (Phase 3).
- Supplier master-data enrichment, reorder-point → draft-PO automation,
  `leadTimeDays` usage (Phase 4).

## Affected Files (indicative)

- `src/lib/procurement/types.ts` — PO attribution fields.
- `src/lib/inventory/types.ts` — GoodsReceipt reversal fields; settings tolerance.
- `src/lib/procurement/po-receipt.ts` — new: `validateReceiptAgainstPO`,
  `applyReceiptToPO`, `OverReceiptError`.
- `src/lib/inventory/goods-receipt-service.ts` — PO-aware atomic path.
- `src/lib/inventory/goods-receipt-reversal.ts` — new: `reverseGoodsReceipt`,
  `ReceiptNotReversibleError`.
- `src/lib/procurement/purchase-order-service.ts` — attribution params; retire
  `recordReceiptAgainstPO`.
- `src/lib/procurement/supplier-service.ts` — two bug fixes.
- `src/lib/db.ts` — `goodsReceipts.purchaseOrderId` index (version bump) if absent.
- `src/components/pharmacy/inventory/ReceiveStockForm.tsx` — PO mode.
- `src/app/[locale]/(app)/inventory/receive/page.tsx` — read `poId`.
- `src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx` — Receive
  button, receipt history, reverse action, attribution.
- i18n: `messages/{en,ar,prs,ps}.json` — new procurement/receiving strings.
