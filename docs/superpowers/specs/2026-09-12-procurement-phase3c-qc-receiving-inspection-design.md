# Procurement Overhaul — Phase 3c: QC / Receiving Inspection

**Date:** 2026-09-12
**App:** `apps/pharmacy-lite` (+ additive enum entries in `packages/shared-types`)
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul. Phases 1, 2a, 2b-i, 2b-ii, 3a (audit), and 3b
(PO approval) are complete. This is the **third and final** sub-phase of Phase 3
(governance): 3a (audit) → 3b (approval) → **3c (this spec — QC / receiving
inspection)**. Phase 4 (supplier master + reorder) remains deferred.

## Context

The receiving flow has no quality gate: `processGoodsReceipt`
(`src/lib/inventory/goods-receipt-service.ts`) hardcodes every created
`StockBatch` to `status: 'active'`, so all received goods are immediately
sellable. But the surrounding infrastructure for holding stock already exists
and is reused here:

- **`StockBatchStatus = 'active' | 'quarantined' | 'depleted'`** — the
  `quarantined` value already exists.
- **Quarantined stock is already unsellable / un-valued:** `getStockLevels`
  (`stock-service.ts`) and `valuation.ts` query
  `db.stockBatches.where('status').equals('active')`, so a quarantined batch is
  automatically excluded from available stock and valuation.
- **`expiry-watchdog.ts` already writes the quarantine pattern:**
  `quarantineExpiredBatches` moves expired active batches → `quarantined` with a
  `type: 'quarantined'` stock movement (encrypt sync entries before the tx, then
  put movement + `db.stockBatches.update(id, { status: 'quarantined', … })`
  inside the tx). The release step mirrors this in reverse.
- **Disposal already removes quarantined stock:** `recordDisposal({ stockBatchId,
  quantity, reasonCode: StockDisposalReason, note?, performedBy })`
  (`stock-movement.ts`) writes a `type: 'disposed'` movement; it operates on
  quarantined batches ("disposal is how quarantined stock leaves the books").
  `StockDisposalReason = 'expired' | 'damaged' | 'contaminated' | 'recalled' |
  'patient_return_unusable'`.
- **Reporting already counts quarantine/disposal:** `wastage-report.ts` +
  `getStockLevels().quarantinedCount`.
- The Phase-3a audit helper `auditProcurementEvent` is already imported in
  `goods-receipt-service.ts`.

**What is genuinely missing:** (1) a QC decision at receipt (hold suspect lines),
and (2) a **release** step (`quarantined → active`). Everything else is reuse.

## Goal

Let a receiver hold suspect lines at goods receipt (per line, with a reason) so
they land quarantined (unsellable) instead of active; and provide a Quarantine
view to later **release** held batches back to active or **reject** them via the
existing disposal path — every decision audited via the 3a helper.

## Locked Decisions

1. **Accept / Hold at receipt, then Release-or-Dispose.** Per line: **Accept**
   → batch `active` (as today); **Hold** → batch `quarantined` + a required
   `heldReason`. Held stock is later **Released** (`quarantined → active`) or
   **Rejected = the existing `recordDisposal`** with a QC reason. No new reject
   primitive; no new batch status.
2. **Per line/batch** QC decision (a receipt can mix accepted + held lines).
3. **Hold requires a reason** (`heldReason`, also in the audit trail).
4. **Held goods still count as received** — `applyReceiptToPO` is unchanged; a
   held batch is quarantined, not absent. **Default = Accept**, so a receipt that
   holds nothing behaves exactly as today (non-breaking).
5. **A dedicated Quarantine view** at `/inventory/quarantine` (new sidebar item),
   which also surfaces the expiry-watchdog auto-quarantines that currently have
   no management UI.

## Data Model (additive — no Dexie bump)

### `GoodsReceiptItem` (`src/lib/inventory/types.ts`)
Add:
```ts
  qcDecision?: 'accept' | 'hold'   // default 'accept'
  heldReason?: string              // required when qcDecision === 'hold'
```
(`GoodsReceiptItem` is embedded in `GoodsReceipt.items` — no store/index change.)

### `StockBatch` (`src/lib/inventory/types.ts`)
Add (all optional):
```ts
  inspectedBy?: string
  inspectedAt?: string
  heldReason?: string
  releasedBy?: string
  releasedAt?: string
```
The `status` field (`active`/`quarantined`) remains the QC state — no new status
value. The `status` index is unchanged.

### `StockMovementType` (`src/lib/inventory/types.ts`)
Add `'released'` to the union (for the release movement). `stockMovements.type` is
an existing index; a new value on it needs no schema change.

**No Dexie version block** — every change is additive (embedded fields, optional
batch fields, a new movement-type value on the existing index). Reads default
defensively (`item.qcDecision ?? 'accept'`).

## Enum Additions (`packages/shared-types/src/enums.ts`) — additive, then rebuild

```ts
// AuditResourceType +=
STOCK_BATCH = 'STOCK_BATCH',

// AuditAction += (QC — Phase 3c)
BATCH_QC_HELD = 'BATCH_QC_HELD',
BATCH_QC_RELEASED = 'BATCH_QC_RELEASED',
```
Append only. Rebuild: `pnpm --filter @ultranos/shared-types build`.

## Services

### Modify `processGoodsReceipt` (`goods-receipt-service.ts`)
In the batch-build loop, set each batch from its item's QC decision:
```ts
const held = item.qcDecision === 'hold'
// batch: status: held ? 'quarantined' : 'active',
//        inspectedBy: receivedBy, inspectedAt: now,
//        heldReason: held ? item.heldReason?.trim() || undefined : undefined,
```
The `received` movement and PO reconciliation (`applyReceiptToPO`) are UNCHANGED —
held quantities still count as received. After the transaction, for each held
line emit (fire-and-forget) `auditProcurementEvent(receivedBy, BATCH_QC_HELD,
STOCK_BATCH, batchId, { batchNumber, catalogItemId, heldReason })`. (Accept lines
are already covered by the existing 3a `GOODS_RECEIVED` receipt audit.)

### New `releaseFromQuarantine(batchId, releasedBy)` (new `src/lib/inventory/qc-service.ts`)
Mirrors the expiry-watchdog write in reverse:
```ts
export async function releaseFromQuarantine(batchId: string, releasedBy: string): Promise<void>
```
- Load the batch; if `status !== 'quarantined'` throw `BatchNotQuarantinedError`.
- Build a `type: 'released'` `StockMovement` (`quantity: +batch.quantityOnHand`,
  `performedBy: releasedBy`); encrypt the movement + batch-update sync entries
  BEFORE the tx (Web Crypto cannot run inside a Dexie tx zone).
- In one `db.transaction('rw', [db.stockBatches, db.stockMovements, db.syncQueue], …)`:
  put the movement; `db.stockBatches.update(batchId, { status: 'active',
  releasedBy, releasedAt: now, hlcTimestamp: now })`; put both sync entries.
- Emit (fire-and-forget) `auditProcurementEvent(releasedBy, BATCH_QC_RELEASED,
  STOCK_BATCH, batchId, { batchNumber, catalogItemId })`.

### Reject = existing `recordDisposal` (no new code)
The Quarantine view's **Dispose** action calls the existing
`recordDisposal({ stockBatchId, quantity: batch.quantityOnHand, reasonCode,
note?, performedBy })` with a QC reason (`damaged` / `contaminated` /
`recalled`). This is the reject path; it already writes a `disposed` movement and
depletes the batch.

### New `getQuarantinedBatches()` query (new `src/lib/inventory/qc-service.ts`)
```ts
export async function getQuarantinedBatches(): Promise<StockBatch[]>
```
`db.stockBatches.where('status').equals('quarantined').toArray()`, newest-received
first. The view resolves catalog item names (mirrors `StockOverviewPage`).

## UI (design-system, 4 locales)

**Design-system rules (binding):** ShadCN from `@/components/ui/*`, icons from
`@ultranos/ui-kit/icons`; semantic oklch tokens only; money `font-numeric`; RTL
logical props; `EmptyState` for empty/loading; OPD list/detail layout standards.

- **`ReceiveStockForm`** — add a per-line QC control: an Accept/Hold toggle
  (`<select>` or segmented control), defaulting to **Accept**. When **Hold** is
  selected, reveal a required `heldReason` input; block submit if any held line
  lacks a reason. Pass `qcDecision` + `heldReason` per line into
  `processGoodsReceipt`. A quarantined line is visually marked (`text-warning`).
- **Quarantine view** `/inventory/quarantine` (list-page standard) — lists
  quarantined batches: item name, batch #, quantity, expiry, `heldReason`, source
  (receipt hold vs. expiry auto-quarantine — inferable from `heldReason`/movement
  type), received/quarantined date. Per-row actions: **Release**
  (`releaseFromQuarantine`) and **Dispose** (opens a reason select →
  `recordDisposal`). `EmptyState` when nothing is quarantined. New sidebar
  "Quarantine" item under Inventory (`nav-config.ts`).
- i18n: QC decision labels, hold-reason label + required message, release/dispose
  labels, disposal-reason labels, quarantine list columns/empty, `sidebar.quarantine`,
  across `messages/{en,ar,prs,ps}.json`.

## Errors & Edge Cases

- `BatchNotQuarantinedError` — `releaseFromQuarantine` on a non-quarantined batch
  (already released / active / depleted) throws; the UI maps to an inline message.
- Hold with a blank `heldReason` — blocked at the `ReceiveStockForm` (required);
  the service defensively coerces `heldReason?.trim() || undefined`.
- Default `qcDecision` absent → treated as `accept` (non-breaking for existing
  callers and legacy receipts).
- A held batch is unsellable the instant it is created (the `active`-only stock
  filter needs no change).
- Reject (dispose) depletes the batch via the existing disposal path; a disposed
  batch cannot then be released (it is no longer `quarantined`).
- No PHI in audit metadata (batchNumber, catalogItemId, heldReason — operational).

## Testing

- **`processGoodsReceipt` QC:** an item with `qcDecision: 'hold'` creates a
  `quarantined` batch with `inspectedBy`/`heldReason` set, and it is EXCLUDED from
  `getStockLevels`/available stock; an `accept` (or absent) decision creates an
  `active` batch (non-breaking default); `BATCH_QC_HELD` emitted per held line;
  `applyReceiptToPO` still counts held quantities as received.
- **`releaseFromQuarantine`:** quarantined → active + `releasedBy`/`releasedAt` +
  a `released` movement + `BATCH_QC_RELEASED` audit; throws
  `BatchNotQuarantinedError` on a non-quarantined batch; the released batch then
  appears in available stock.
- **Reject:** disposing a quarantined batch via `recordDisposal` depletes it and
  it leaves the quarantine list (existing behavior — one integration assertion).
- **`getQuarantinedBatches`:** returns only quarantined batches (incl. an
  expiry-watchdog one), newest-first.
- **UI:** `ReceiveStockForm` Hold reveals + requires a reason and passes the
  decision through; Quarantine view lists held batches and Release/Dispose call
  the services; RTL/design-system on touched surfaces.
- **Compliance:** attribution (`inspectedBy`/`releasedBy`) recorded; no PHI in
  logs/metadata.

## Out of Scope (later)

- COA / certificate-of-analysis document attachments.
- Supplier-return workflow (reject = dispose only here).
- QC sampling plans / AQL, per-item or per-supplier QC rules.
- Multi-level QC sign-off / second-inspector approval.
- A distinct `rejected` batch status (reject reuses disposal).

## Affected Files (indicative)

- `packages/shared-types/src/enums.ts` — `STOCK_BATCH` resource + `BATCH_QC_HELD`/
  `BATCH_QC_RELEASED` verbs (rebuild).
- `src/lib/inventory/types.ts` — `GoodsReceiptItem` QC fields; `StockBatch` QC
  attribution fields; `StockMovementType` += `'released'`.
- `src/lib/inventory/goods-receipt-service.ts` — QC decision in
  `processGoodsReceipt` + `BATCH_QC_HELD` emits.
- `src/lib/inventory/qc-service.ts` (new) — `releaseFromQuarantine` +
  `getQuarantinedBatches` + `BatchNotQuarantinedError` (or extend an existing
  inventory service).
- `src/components/pharmacy/inventory/ReceiveStockForm.tsx` — per-line QC control.
- `src/components/pharmacy/inventory/QuarantinePage.tsx` (new) — the view.
- `src/app/[locale]/(app)/inventory/quarantine/page.tsx` (new) — route.
- `src/components/sidebar/nav-config.ts` — Quarantine nav item.
- `messages/{en,ar,prs,ps}.json` — QC strings.
