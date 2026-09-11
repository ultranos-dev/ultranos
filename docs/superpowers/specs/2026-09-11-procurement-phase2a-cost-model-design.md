# Procurement Overhaul — Phase 2a: Purchasing Cost Model

**Date:** 2026-09-11
**App:** `apps/pharmacy-lite`
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul. Phase 1 (PO→receipt→stock loop) is complete.
Phase 2 was split into **2a (this spec — cost model)** and **2b (supplier
invoice + 3-way match)**, which depends on 2a. Phases 3 (controls/approvals/QC)
and 4 (supplier master + reorder automation) remain deferred.

## Context

After Phase 1 the PO→receipt→stock loop is atomic and drift-free, but the
financial model is minimal:

- `PurchaseOrder.totalCost = Σ(unitCost × quantityOrdered)` only — no tax,
  discount, or freight (`purchase-order-service.ts`).
- PO identity is a UUID shown as a 6-char slice — no human-readable number
  (`PurchaseOrderDetailPage.tsx`).
- Inventory cost is per-batch **last cost** (`StockBatch.costPrice`); there is
  no weighted-average cost or inventory valuation.

## Goal

Give purchasing a correct cost model: human-readable PO numbers, line
discounts + document tax/freight with a proper total breakdown, net-cost flow
into received stock, and a derived weighted-average cost (WAC) + inventory
valuation.

## Locked Decisions

1. **PO number:** `{poNumberPrefix}{pharmacyCode}-{YYYY}-{seq4}` (e.g.
   `PO-KBL01-2026-0042`), from a **local monotonic counter** in
   `pharmacySettings`. Fully offline, stable after sync, unique via the code
   prefix. Monotonic (never resets); year embedded for readability only.
2. **Charges:** **line-level discount** (cost-affecting) + **document-level
   tax & freight** (total-only, NOT capitalized into unit cost — landed cost
   stays deferred).
3. **WAC:** **derived on demand** from on-hand active batches — no stored
   running counter (reversal/adjustment-safe).

## Data-Model Changes (additive; no Dexie version bump — all non-indexed)

### `PurchaseOrderItem` (`src/lib/procurement/types.ts`)
```ts
  discountType?: 'percent' | 'amount'
  discountValue?: number   // percent (0–100) or minor-unit amount off the line
```

### `PurchaseOrder` (`src/lib/procurement/types.ts`)
```ts
  poNumber: string         // human-readable, assigned at creation
  subtotal: number         // Σ lineNet (minor units)
  taxRate: number          // percent applied to subtotal
  taxAmount: number        // round(subtotal × taxRate/100)
  freight: number          // minor units
  // totalCost is REDEFINED to the grand total = subtotal + taxAmount + freight
```

### `PharmacyInventorySettings` (`src/lib/inventory/types.ts`)
```ts
  poNumberPrefix: string   // DEFAULT 'PO-'
  pharmacyCode: string     // DEFAULT '' (short facility code)
  poSequenceNext: number   // DEFAULT 1 (local monotonic counter)
```
Add all three to `DEFAULT_PHARMACY_SETTINGS`.

### WAC
No new field. Derived from `StockBatch.costPrice` over **active** batches.

## Line & Total Math (canonical, integer minor units)

Per line: `lineGross = unitCost × quantityOrdered`;
`lineDiscount = discountType === 'percent' ? round(lineGross × discountValue/100) : (discountValue ?? 0)`
(clamped to `0..lineGross`); `lineNet = lineGross − lineDiscount`;
`netUnitCost = round(lineNet / quantityOrdered)`.

Document: `subtotal = Σ lineNet`; `discountTotal = Σ lineDiscount`;
`taxAmount = round(subtotal × taxRate/100)`; `grandTotal = subtotal + taxAmount + freight`.

All rounding is `Math.round` on minor units (half-up). `netUnitCost` is the
batch-cost basis carried into receiving.

## Component / Module Design

### `po-totals.ts` (`src/lib/procurement/po-totals.ts`, new — pure)
- `computePoTotals(items, taxRate, freight): { items: ItemWithNet[], subtotal, discountTotal, taxAmount, freight, grandTotal }` where `ItemWithNet` adds `lineNet` and `netUnitCost` to each item.
- Pure, no DB. Consumed by `createPurchaseOrder` (authoritative) and the New-PO form's live preview (same math, no divergence).

### PO number generation (`src/lib/procurement/purchase-order-service.ts`)
- `generatePoNumber(): Promise<string>` — inside a Dexie `rw` transaction on `pharmacySettings`, read the settings row, take `seq = poSequenceNext`, write `poSequenceNext = seq + 1`, and return `` `${poNumberPrefix}${pharmacyCode}-${year}-${String(seq).padStart(4,'0')}` ``. The atomic read-increment-write prevents duplicate numbers across concurrent creates. `year` is passed in by the caller (services take timestamps as inputs — do not call `new Date()` inside the number formatter's pure part; the service supplies `now`). If no settings row exists, fall back to `DEFAULT_PHARMACY_SETTINGS` values and create the row.

### `createPurchaseOrder` (extended)
- New params: per-line `discountType?`/`discountValue?`, document `taxRate?` (defaults to `settings.taxRate`), `freight?` (default 0).
- Computes the breakdown via `computePoTotals`, assigns `poNumber` via
  `generatePoNumber`, and stores `poNumber`, `subtotal`, `taxRate`, `taxAmount`,
  `freight`, and `totalCost = grandTotal`, plus the per-line `discountType`/`discountValue`.

### `valuation.ts` (`src/lib/inventory/valuation.ts`, new)
- `getWac(catalogItemId): Promise<number | null>` — over **active** batches:
  `Σ(qty × costPrice) / Σ qty`, `Math.round`; `null` when total qty is 0.
- `getInventoryValuation(): Promise<{ totalValue: number; byItem: { catalogItemId; qty; wac; value }[] }>` — active batches only; `value = Σ(qty × costPrice)` per item, `totalValue` = Σ.
- **Valuation scope decision:** active batches only (available/sellable stock).
  Quarantined and depleted are excluded (quarantined is pending
  review/disposal). Stated here to remove ambiguity.

### Receiving integration
- **PO-mode prefill** (`ReceiveStockForm`, Phase 1 Task 8 set default cost =
  PO `unitCost`): change the default batch `costPrice` to the PO line's
  **`netUnitCost`** (from `computePoTotals`), so WAC reflects true purchase
  cost. Ad-hoc receiving unchanged.
- No change to the Phase-1 atomic transaction or over-receipt guard.

### UI
- **New PO form** (`NewPurchaseOrderPage.tsx`): per-line discount (type select
  + value), document tax-rate (prefilled from settings) + freight inputs, and a
  live totals breakdown (subtotal → discount → tax → freight → grand total) via
  `computePoTotals`.
- **PO detail** (`PurchaseOrderDetailPage.tsx`): show `poNumber` in the heading
  (replacing the sliced UUID) and the totals breakdown on the info card.
- **PO list** (`PurchaseOrdersPage.tsx`): show `poNumber` in place of the
  sliced id; search matches `poNumber`.
- **WAC + valuation:** a WAC value on catalog/stock rows and an inventory-value
  summary on the stock overview (or reports) from `valuation.ts`.
- **Settings**: fields for `pharmacyCode` + `poNumberPrefix`.
- i18n keys across all four locale catalogs.

## Errors & Edge Cases

- Zero/absent `quantityOrdered` on a line → `netUnitCost` guarded (no divide by
  zero; treat as 0). Discount clamped to `0..lineGross`.
- Legacy POs created before 2a lack `poNumber`/breakdown fields: the detail/list
  UI falls back to the sliced-UUID display and `totalCost` when `poNumber` is
  absent, so historical POs still render.
- `generatePoNumber` on a missing settings row seeds defaults and persists the
  incremented counter.
- WAC `null` (no stock) renders as "—", never `0` (0 would misprice).
- No PHI in logs/errors (money + ids only).

## Testing

- **Pure — `computePoTotals`:** percent vs amount discount; discount clamp;
  tax rounding; freight; multi-line subtotal; zero-qty guard; grandTotal.
- **Pure/DB — `generatePoNumber`:** correct format; atomic increment; monotonic
  across sequential calls; seeds defaults when settings absent.
- **DB — `valuation`:** mixed-cost active batches → correct WAC; no-stock →
  null; ignores depleted + quarantined; `getInventoryValuation` totals.
- **Integration:** `createPurchaseOrder` assigns a unique incrementing
  `poNumber` and the correct `totalCost` (grand total) + breakdown; PO-mode
  receive posts batches at `netUnitCost` → `getWac` reflects it; WAC still
  correct after a Phase-1 receipt reversal (derived → auto-correct).
- **Regression:** existing PO/receipt tests pass with `totalCost` now the grand
  total; legacy-PO fallback renders.
- **RTL:** snapshot the new PO-form financial section LTR + RTL.

## Out of Scope (later)

- Supplier invoice + 3-way match (**Phase 2b** — next).
- Landed-cost allocation (tax/freight capitalized into unit cost); per-line tax
  categories; per-issue COGS ledger; multi-currency/FX.
- Approvals, amendment, backorder, QC hold (Phase 3); supplier master + reorder
  automation (Phase 4).

## Affected Files (indicative)

- `src/lib/procurement/types.ts` — PO/PO-item financial fields + `poNumber`.
- `src/lib/inventory/types.ts` — settings fields + defaults.
- `src/lib/procurement/po-totals.ts` — new pure math.
- `src/lib/procurement/purchase-order-service.ts` — `generatePoNumber`,
  extended `createPurchaseOrder`.
- `src/lib/inventory/valuation.ts` — new WAC/valuation.
- `src/components/pharmacy/procurement/NewPurchaseOrderPage.tsx` — discounts,
  tax, freight, live totals.
- `src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx` — poNumber
  + breakdown.
- `src/components/pharmacy/procurement/PurchaseOrdersPage.tsx` — poNumber in
  list + search.
- `src/components/pharmacy/inventory/ReceiveStockForm.tsx` — net-unit-cost
  prefill.
- WAC/valuation UI (stock overview/catalog/reports) + settings fields.
- `messages/{en,ar,prs,ps}.json` — new strings.
