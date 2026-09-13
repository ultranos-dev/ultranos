# Procurement Overhaul — Phase 4b: Reorder Report + Suggested POs

**Date:** 2026-09-13
**App:** `apps/pharmacy-lite`
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul. Phases 1, 2a, 2b-i, 2b-ii, 3a, 3b, 3c, 4a are
complete. Phase 4b (this spec) is the payoff of 4a: it consumes 4a's
`getPreferredSupplierItem` (per-supplier price/MOQ) + `CatalogItem.reorderQuantity`
to surface items due for reorder and draft POs. This is the FINAL planned phase of
the procurement overhaul.

## Context

Low stock is surfaced today only as a count: `getStockAlerts` (`stock-service.ts`)
sums active-batch on-hand per item and counts `onHand ≤ reorderPoint`. There is
NO reorder report/list and NO suggested-PO generator — the alert is a passive
table filter. Ground truth available:

- On-hand per item = sum of `stockBatches` with `status: 'active'`
  (`stockBatches` index: `'id, catalogItemId, expiryDate, status, locationId,
  [catalogItemId+status]'` — `catalogItemId` is a plain index).
- `CatalogItem` has `reorderPoint`, `minStock?`, `maxStock?`, and (from 4a)
  `reorderQuantity?`.
- 4a's `supplier-item-service` provides `getPreferredSupplierItem(catalogItemId)`
  → the preferred `SupplierItem` (with `unitPrice`/`minOrderQty`); `getActiveSuppliers`
  lists suppliers for manual assignment.
- `createPurchaseOrder({ supplierId, supplierName, items: [{catalogItemId,
  catalogItemName, quantityOrdered, unitCost, discountType?, discountValue?}],
  createdBy })` drafts a PO (status `draft`) and auto-emits the 3a `PO_CREATED`
  audit; a draft flows into the 3b approval/send gate.

## Goal

Give the pharmacy a reorder report — items at/below their reorder point with
on-hand, a suggested order quantity, and a supplier — and a one-action way to
draft purchase orders (grouped by supplier) from the selected lines.

## Locked Decisions

1. **Suggested qty** = `reorderQuantity ?? (maxStock − onHand) ?? (reorderPoint −
   onHand)`, clamped ≥ 0, then `max(…, moq ?? 0)` (the preferred supplier's MOQ).
2. **Manual supplier assignment:** each reorder line defaults to its preferred
   supplier; a line with no preferred supplier gets an inline supplier picker (from
   active suppliers). A line is includable only once it has an effective supplier.
3. **Editable quantity + unit cost:** both are prefilled (qty = suggested; unitCost
   = fallback chain) and editable per line before drafting.
4. **Unit cost fallback:** `preferred supplierItem.unitPrice ?? getLastPurchaseCost
   (last active/any batch cost) ?? 0`. (`CatalogItem` has no cost field — only
   selling prices — so "catalog cost" = last batch cost.)
5. **Draft-only generation:** group selected lines by effective supplier, draft ONE
   `createPurchaseOrder` per supplier (status `draft` → each auto-emits `PO_CREATED`
   and enters the 3b approval/send gate). No auto-send.
6. **No Dexie bump, no new audit verb** — reads existing stores; drafted POs use the
   existing `createPurchaseOrder` (its 3a `PO_CREATED` audit is the trail).

## Pure Logic (`src/lib/procurement/reorder.ts`)

```ts
export function computeSuggestedQty(
  item: { reorderQuantity?: number; maxStock?: number; reorderPoint: number },
  onHand: number,
  moq?: number,
): number {
  const base =
    item.reorderQuantity != null ? item.reorderQuantity
    : item.maxStock != null ? item.maxStock - onHand
    : item.reorderPoint - onHand
  return Math.max(base, moq ?? 0, 0)
}
```
Pure, integer units, deterministic.

## Services (`src/lib/procurement/reorder-service.ts`)

```ts
export interface ReorderLine {
  catalogItemId: string
  catalogItemName: string
  onHand: number
  reorderPoint: number
  suggestedQty: number
  preferredSupplierId?: string
  preferredSupplierName?: string
  unitCost: number          // minor units; preferred price ?? last batch cost ?? 0
}

export async function getLastPurchaseCost(catalogItemId: string): Promise<number | undefined>
export async function getReorderReport(): Promise<ReorderLine[]>
export async function generateReorderPurchaseOrders(
  selected: { catalogItemId: string; catalogItemName: string; quantity: number; unitCost: number; supplierId: string }[],
  createdBy: string,
): Promise<PurchaseOrder[]>
```

- **`getLastPurchaseCost`** — `db.stockBatches.where('catalogItemId').equals(id).toArray()`,
  newest by `receivedAt`, return its `costPrice` (or `undefined` if none).
- **`getReorderReport`** — build an on-hand map from active batches
  (`where('status').equals('active')` → sum `quantityOnHand` by `catalogItemId`);
  iterate all **active** catalog items; for each, `onHand = map.get(id) ?? 0`
  (so zero-stock items are included); keep those with **`reorderPoint > 0 && onHand ≤
  reorderPoint`**; join `getPreferredSupplierItem(id)` for the preferred supplier +
  its `unitPrice`/`minOrderQty`; `suggestedQty = computeSuggestedQty(item, onHand,
  preferred?.minOrderQty)`; `unitCost = preferred?.unitPrice ?? getLastPurchaseCost(id)
  ?? 0`; `preferredSupplierName` via `getSupplierById`. Sort by `catalogItemName`.
- **`generateReorderPurchaseOrders`** — filter out lines with `quantity ≤ 0`; group by
  `supplierId`; for each group resolve `supplierName` via `getSupplierById` and call
  `createPurchaseOrder({ supplierId, supplierName, items: group.map(l => ({
  catalogItemId, catalogItemName, quantityOrdered: l.quantity, unitCost: l.unitCost })),
  createdBy })`. Return the created POs. (Each auto-emits `PO_CREATED` via 3a.)

## UI (`ReorderReportPage.tsx`, route `/inventory/reorder`)

**Design-system rules (binding):** ShadCN from `@/components/ui/*`, icons from
`@ultranos/ui-kit/icons`; semantic oklch tokens only; money in `font-numeric`; RTL
logical props; `EmptyState` for empty/loading; OPD list-page layout standards.

- Standalone `<h1>` (`t('reorderTitle')`), one content box wrapping loading / empty
  (`EmptyState` — "Nothing needs reordering") / table.
- Table columns: **checkbox** (per line; default checked when the line has an
  effective supplier), item, on-hand (`font-numeric`), reorder point, **quantity**
  (editable number input, default `suggestedQty`), **supplier** (a `<select>` —
  default = `preferredSupplierId`; options = active suppliers; for a no-preferred row
  the user picks one), **unit cost** (editable number input in major units, default
  from the fallback chain, parsed to minor on submit), **line total**
  (`qty × unitCost`, `font-numeric`). A row's checkbox is disabled until an effective
  supplier is chosen (with a muted "no supplier" hint).
- A **"Generate draft PO(s)"** primary action (folded into the toolbar) →
  `generateReorderPurchaseOrders(selectedLines, performedBy)` → a success summary
  ("N draft purchase orders created", grouped-by-supplier count) with a link to
  `/inventory/orders`; then refresh the report. Disabled when no includable line is
  selected.
- Sidebar: `{ titleKey: 'reorder', url: '/inventory/reorder' }` in the Inventory group.
- `performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'` via
  `useAuthSessionStore`. Currency minor units from `db.pharmacySettings`.
- i18n: report title/columns/empty, supplier-picker placeholder, no-supplier hint,
  generate action + result summary, across `messages/{en,ar,prs,ps}.json`.

## Errors & Edge Cases

- **No preferred supplier:** the row shows the inline picker; the checkbox is disabled
  until a supplier is selected (it cannot be drafted without one).
- **Empty report:** `EmptyState` when no item is at/below its reorder point.
- **`reorderPoint === 0`:** excluded (0 = "not tracked").
- **`quantity ≤ 0`:** excluded from PO generation (guard in
  `generateReorderPurchaseOrders`); the UI also prevents submitting a 0-qty line.
- **Zero on-hand items** (no active batch) with `reorderPoint > 0` ARE included
  (`onHand = 0`).
- **Draft POs enter the 3b gate:** if `poApprovalThreshold` is set and a drafted PO
  meets it, it must be submitted/approved before sending — reorder does not bypass
  the gate (it only drafts).
- Money is integer minor units; `unitCost` entered in major units is parsed with
  `Math.round(parseFloat(v) * 10 ** minorUnits)`.
- No PHI (items, suppliers, quantities, prices are operational).

## Testing

- **Pure `computeSuggestedQty`:** reorderQuantity wins; maxStock−onHand fallback;
  reorderPoint−onHand fallback; clamp ≥ 0 (never negative when onHand > maxStock); MOQ
  raises the result.
- **`getLastPurchaseCost`:** newest batch's costPrice; undefined when no batch.
- **`getReorderReport`:** includes items with onHand ≤ reorderPoint (incl. zero-stock,
  no-batch items); excludes items above reorderPoint and reorderPoint 0; unitCost =
  preferred price when set, else last batch cost, else 0; preferred supplier joined;
  suggestedQty honors MOQ.
- **`generateReorderPurchaseOrders`:** groups by supplier → one PO per supplier with
  the right line items/quantities/costs; drops quantity ≤ 0 lines; returns the POs;
  each drafted PO is `status: 'draft'`.
- **UI:** report renders lines; a no-preferred row's checkbox is disabled until a
  supplier is picked; editing qty/cost updates the line total; "Generate draft PO(s)"
  calls the service with the selected lines; empty state when none. RTL/design-system.
- **Compliance:** no PHI; drafted POs carry `createdBy`; each emits `PO_CREATED` (3a).

## Out of Scope (later)

- Demand forecasting / consumption-rate-based reorder points.
- Auto-scheduling or recurring reorder runs.
- Consolidating multiple reorder runs / dedup against existing open POs for the same
  item (a drafted-but-not-sent PO does not suppress a later reorder suggestion).
- Editing existing draft POs from the reorder page (use the PO detail page).
- Multi-location reorder (uses the current location's stock).

## Affected Files (indicative)

- `src/lib/procurement/reorder.ts` (new) — pure `computeSuggestedQty`.
- `src/lib/procurement/reorder-service.ts` (new) — `getLastPurchaseCost`,
  `getReorderReport`, `generateReorderPurchaseOrders`.
- `src/components/pharmacy/inventory/ReorderReportPage.tsx` (new) — the view.
- `src/app/[locale]/(app)/inventory/reorder/page.tsx` (new) — route.
- `src/components/sidebar/nav-config.ts` — Reorder nav item.
- `messages/{en,ar,prs,ps}.json` — reorder strings.
