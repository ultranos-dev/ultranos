# Procurement Overhaul — Phase 2b-i: Supplier Invoice + 3-Way Match

**Date:** 2026-09-11
**App:** `apps/pharmacy-lite`
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul. Phase 1 (PO→receipt loop) and Phase 2a (cost
model) are complete. Phase 2b (full buy-side AP) was split into **2b-i (this
spec — supplier invoice + 3-way match)** and **2b-ii (payments &
settlement)**, which depends on 2b-i. Phases 3 and 4 remain deferred.

## Context

After Phase 2a a PO carries correct totals (`subtotal`/`taxAmount`/`freight`/
`totalCost` grand total, per-line `netUnitCost` after discount) and goods
receipts track cumulative `quantityReceived`. There is no supplier-invoice
entity and no reconciliation: a supplier could over-bill quantity, bill for
un-received goods, add off-PO items, or creep unit prices, and nothing catches
it.

## Goal

Capture supplier invoices against a PO and reconcile them three ways
(PO ordered ↔ goods-receipt received ↔ invoice billed), flagging quantity and
price variances, with a human approve/dispute gate that Phase 2b-ii will settle
payments against.

## Locked Decisions

1. **One invoice ↔ one PO** (a PO may have several invoices); **line-level**
   match keyed by `catalogItemId`.
2. **Qty variance anchored on received** (`billedQty − quantityReceived`;
   `billedQty > received` is a hard flag); **price variance vs the PO line's
   `netUnitCost`** (after Phase-2a discount), flagged beyond a tolerance %.
   **Off-PO invoice lines** are always flagged.
3. **Tolerance % on price** (new `invoiceMatchTolerancePercent` setting);
   over-bill + off-PO always flag. Computed status `matched` | `variance`.
4. **Approve/dispute gate:** a `variance` invoice requires an override reason to
   approve; matched invoices approve in one click. 2b-ii pays only `approved`.
5. **Supplier-entered invoice number** with a duplicate warning on
   `(supplierId, invoiceNumber)`; **match computed on demand** (pure); only the
   invoice record + human decision are stored.

## Data Model (new synced store; Dexie **v18** bump)

### `supplierInvoices` store (`src/lib/db.ts` + `src/lib/procurement/types.ts`)
Index string: `id, purchaseOrderId, supplierId, status, invoiceNumber, [supplierId+invoiceNumber]`.

```ts
export type SupplierInvoiceStatus = 'pending' | 'approved' | 'disputed'

export interface SupplierInvoiceItem {
  catalogItemId: string
  catalogItemName: string
  billedQty: number
  unitPrice: number   // minor units
}

export interface SupplierInvoice {
  id: string
  invoiceNumber: string          // the supplier's own number (entered)
  purchaseOrderId: string
  supplierId: string
  supplierName: string
  items: SupplierInvoiceItem[]
  subtotal: number               // Σ(billedQty × unitPrice)
  taxRate: number                // percent
  taxAmount: number              // round(subtotal × taxRate/100)
  freight: number                // minor units
  total: number                  // subtotal + taxAmount + freight
  status: SupplierInvoiceStatus  // pending → approved | disputed
  approvedBy?: string
  approvedReason?: string        // required override reason when match = variance
  disputedBy?: string
  disputeReason?: string
  notes?: string
  createdBy: string
  createdAt: string
  hlcTimestamp: string
}
```

### `PharmacyInventorySettings`
Add `invoiceMatchTolerancePercent: number` (DEFAULT `0`).

## Pure Match Logic

### `computeInvoiceMatch(invoice, po, tolerancePercent)` (`src/lib/procurement/invoice-match.ts`, pure)
Reuses `computePoTotals(po.items, po.taxRate ?? 0, po.freight ?? 0)` to get each
PO line's `netUnitCost`. For each invoice line (matched to a PO line by
`catalogItemId`):
- `poLine` missing → `offPo = true` (always a flag).
- `receivedQty = poLine.quantityReceived`; `qtyVariance = billedQty − receivedQty`;
  `overBilled = billedQty > receivedQty` (hard flag).
- `poNetUnitCost = netUnitCost` for that line; `priceVariance = unitPrice − poNetUnitCost`;
  `priceOverTolerance = Math.abs(priceVariance) > Math.round(poNetUnitCost × tolerancePercent / 100)`.
- `lineMatched = !offPo && !overBilled && !priceOverTolerance`.

Returns:
```ts
{
  status: 'matched' | 'variance',   // 'matched' iff every line matched
  lines: Array<{ catalogItemId; catalogItemName; billedQty; receivedQty;
    unitPrice; poNetUnitCost; qtyVariance; priceVariance; overBilled; offPo;
    priceOverTolerance; matched }>,
  hasOverBill: boolean,
  hasOffPo: boolean,
  totalVariance: number,            // invoice.total − expectedValue (informational)
}
```
`expectedValue = Σ(min(billedQty, receivedQty) × poNetUnitCost) + invoice.taxAmount + invoice.freight`.
Pure — no DB. Reversal/adjustment-safe because it reads the PO's live
`quantityReceived`.

## Services (`src/lib/procurement/supplier-invoice-service.ts`)

- `createSupplierInvoice({ purchaseOrderId, invoiceNumber, items, taxRate?, freight?, notes?, createdBy }): Promise<SupplierInvoice>`
  — resolves the PO for `supplierId`/`supplierName`; computes `subtotal`/
  `taxAmount`/`total` via `computePoTotals` math (billedQty→quantity,
  unitPrice→unitCost, no discount); `taxRate` defaults from `settings.taxRate`;
  stores `status: 'pending'`; enqueues a `SupplierInvoice` `create` sync entry.
- `findDuplicateInvoice(supplierId, invoiceNumber): Promise<SupplierInvoice | undefined>`
  — the UI calls this to warn (non-blocking) before save. Uses the
  `[supplierId+invoiceNumber]` index.
- `approveSupplierInvoice(invoiceId, approvedBy, overrideReason?): Promise<void>`
  — loads the invoice + its PO, runs `computeInvoiceMatch`; if the result is
  `variance` and `overrideReason` is empty → throw `InvoiceVarianceUnresolvedError`;
  else set `status: 'approved'`, `approvedBy`, `approvedReason = overrideReason`.
  Enqueue update.
- `disputeSupplierInvoice(invoiceId, disputedBy, reason): Promise<void>`
  — set `status: 'disputed'`, `disputedBy`, `disputeReason`. Enqueue update.
- Queries: `getSupplierInvoices(statusFilter?)`, `getSupplierInvoiceById(id)`,
  `getInvoicesForPO(purchaseOrderId)`.

## UI (all surfaces held to the design system)

**Design-system rules (binding on every component):** import ShadCN from
`@/components/ui/*` / ui-kit and icons from `@ultranos/ui-kit/icons`; semantic
oklch tokens only (`bg-card`, `text-foreground`, `text-muted-foreground`,
`bg-success/10 text-success`, `bg-warning/10 text-warning`,
`text-destructive`, `ring-border`) — **no hardcoded hex or raw oklch**; money
in `font-numeric`; RTL logical properties (`ms-*`/`me-*`, `text-start`/`text-end`);
`EmptyState` for empty/loading; the OPD list-page and detail-page layout
standards.

- **Invoices list** `/inventory/invoices` — list-page standard: standalone
  `<h1>` (`text-2xl font-semibold text-foreground`), one toolbar row
  (status pill-tabs → wide `SearchInput` `min-w-[200px] flex-1` → "Record
  invoice" primary action), one content box
  (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`).
  Columns: invoice #, supplier, PO #, total, **match badge** (derived on load —
  `matched`→success token, `variance`→warning token), status badge, date.
  `EmptyState` inside the box.
- **New invoice** `/inventory/invoices/new?poId=` — detail/form standard:
  `w-fit` ghost back button, PO picker (prefilled from `poId`), invoice-# input
  with an inline duplicate warning (`text-warning`), lines pre-filled from the
  PO (billed qty default = `quantityReceived`, unit price default =
  `netUnitCost`), tax/freight inputs, live total via the shared totals math.
- **Invoice detail** `/inventory/invoices/[id]` — the 3-way match table
  (Ordered / Received / Billed qty, PO net cost / Invoiced price, qty & price
  variances color-coded: over-bill/off-PO → `text-destructive`, price-over-
  tolerance → `text-warning`, matched → `text-success`/muted), the match badge +
  status, and **Approve / Dispute** actions (variance → an override-reason
  field is required to approve; dispute → a reason). Attribution shown
  (`createdBy`/`approvedBy`/`disputedBy`).
- **Entry points:** a "Record invoice" action on the PO detail page (for
  `sent`/`partially_received`/`closed`) linking to
  `/inventory/invoices/new?poId=<id>`; a sidebar "Invoices" sub-item under
  Inventory.
- **Settings:** `invoiceMatchTolerancePercent` field in the Procurement
  settings card (added in 2a).
- i18n: all strings across `messages/{en,ar,prs,ps}.json`.

## Errors & Edge Cases

- `InvoiceVarianceUnresolvedError` (typed) — approve blocked on a variance
  invoice with no override reason; UI maps to inline copy on the detail page.
- Duplicate invoice — `findDuplicateInvoice` returns the existing record; the
  New-invoice form shows a non-blocking warning (the user may still save, e.g. a
  legitimately re-issued invoice).
- PO not found / cancelled at create time → the create fails with a clear
  message; the New-invoice screen refuses to load for a `cancelled` PO.
- Off-PO / over-billed lines never silently pass — they force `status: variance`
  and require an override reason to approve.
- No PHI in logs/errors (money + ids only).

## Testing

- **Pure `computeInvoiceMatch`:** matched line; price within tolerance (matched)
  vs over tolerance (variance); over-billed (`billedQty > received`) hard flag;
  off-PO line flag; `totalVariance`; overall status matched vs variance.
- **Services:** `createSupplierInvoice` (totals, `status: pending`, sync
  enqueue); `findDuplicateInvoice` hit/miss; `approveSupplierInvoice` (matched →
  approved with no reason; variance with no reason → throws
  `InvoiceVarianceUnresolvedError`; variance with reason → approved +
  `approvedReason`); `disputeSupplierInvoice` (status + reason).
- **UI:** list renders the derived match badge; New-invoice PO prefill +
  duplicate warning; detail 3-way table + approve/dispute flow; **RTL snapshot**
  of the match table; a design-system check in review (semantic tokens, no
  hardcoded hex).
- **Compliance:** attribution recorded; no PHI in logs.

## Out of Scope (later)

- **Phase 2b-ii:** payments/settlement against approved invoices, supplier AP
  account + outstanding balance + aging (mirrors the POS-side AR pattern).
- Invoice ↔ multiple POs (consolidated billing); credit notes; landed cost;
  multi-currency; per-issue COGS.
- Approvals workflow beyond the single approve/dispute gate (Phase 3).

## Affected Files (indicative)

- `src/lib/procurement/types.ts` — `SupplierInvoice`/`SupplierInvoiceItem`/status.
- `src/lib/inventory/types.ts` — `invoiceMatchTolerancePercent` + default.
- `src/lib/db.ts` — `supplierInvoices` store + `version(18)`.
- `src/lib/procurement/invoice-match.ts` — pure `computeInvoiceMatch`.
- `src/lib/procurement/supplier-invoice-service.ts` — CRUD + approve/dispute +
  duplicate check + `InvoiceVarianceUnresolvedError`.
- `src/components/pharmacy/procurement/SupplierInvoicesPage.tsx` — list.
- `src/components/pharmacy/procurement/NewSupplierInvoicePage.tsx` — capture form.
- `src/components/pharmacy/procurement/SupplierInvoiceDetailPage.tsx` — 3-way
  match + approve/dispute.
- `src/app/[locale]/(app)/inventory/invoices/{page,new/page,[id]/page}.tsx` — routes.
- `src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx` — "Record
  invoice" action.
- `src/components/sidebar/nav-config.ts` — Invoices nav item.
- `src/components/pharmacy/PharmacySettingsView.tsx` — tolerance field.
- `messages/{en,ar,prs,ps}.json` — new strings.
