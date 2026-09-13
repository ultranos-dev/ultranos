# Procurement Overhaul — Phase 4a: Supplier Master + Supplier↔Item Catalog

**Date:** 2026-09-13
**App:** `apps/pharmacy-lite`
**Status:** Design — awaiting review before implementation plan
**Part of:** Procurement overhaul. Phases 1, 2a, 2b-i, 2b-ii, 3a, 3b, 3c are
complete. Phase 4 (supplier master + reorder) is split into **4a (this spec —
supplier master + supplier↔item catalog)** and **4b (reorder report + suggested
POs)**, which depends on 4a. 4a is the sourcing data foundation; 4b's reorder
generator consumes the preferred supplier + reorder quantity 4a adds.

## Context

The supplier master is minimal and there is **no link between a supplier and a
catalog item**:

- `Supplier` (`src/lib/procurement/types.ts`) = `{ id, name, contactName?,
  phone?, email?, address?, leadTimeDays?, paymentTerms?, paymentTermsDays?,
  isActive, createdAt }`. No supplier code, tax id, min-order-value, rating, or
  notes. `supplier-service.ts` has create/update/deactivate/get.
- `CatalogItem` (`src/lib/inventory/types.ts`) has `reorderPoint`, `minStock?`,
  `maxStock?` — but **no `reorderQuantity`** (how much to order) and **no
  supplier link** (`defaultSupplierId` absent). It is Hub-synced: `source:
  'hub' | 'local'`, `locallyModified?`. `catalog-sync.ts` `mergeCatalogBatch`
  has a **dirty-guard** — a `locallyModified` row is SKIPPED on a Hub pull, so
  pharmacist edits survive re-sync. `catalog-item-service.ts` `updateCatalogItem`
  sets `locallyModified: true`, so any field it writes is sync-protected.
- There is no supplier↔item junction, no per-supplier pricing, and no
  suggested-PO generator (that is 4b).
- Latest Dexie version block is **v19** (2b-ii `supplierPayments`); 4a adds v20.

## Goal

Give the pharmacy a real sourcing layer: enrich the supplier master, and record
which supplier(s) supply each catalog item — with per-supplier price, MOQ, and
lead time, and a single preferred supplier per item — plus a per-item reorder
quantity, so Phase 4b can generate suggested POs to the right supplier.

## Locked Decisions

1. **Supplier↔item junction with `isPreferred`.** A new `supplierItems` store
   links many suppliers to an item, each with `unitPrice`/`minOrderQty`/
   `leadTimeDays`/`supplierSku`. The **preferred** source per item is the
   junction row with `isPreferred: true` — at most one per `catalogItemId`,
   enforced transactionally in the service. (No `defaultSupplierId` on the item.)
2. **Richer supplier master:** `Supplier` gains `supplierCode?`, `taxId?`,
   `minOrderValue?` (minor units), `rating?` (number), `notes?`.
3. **`reorderQuantity?` on `CatalogItem`** (item reorder policy; a stock concept,
   distinct from a supplier's `minOrderQty`). Pharmacy-local, sync-protected via
   the dirty-guard. 4b's suggested qty falls back to `maxStock − onHand` when
   unset.
4. **Dexie v20** for the new `supplierItems` store. `Supplier`/`CatalogItem`
   field additions are additive (no store/index change for them).
5. **Config edits are not audited** (they are not procurement state-transitions);
   reorder *actions* get audited in 4b.

## Data Model

### `Supplier` (`src/lib/procurement/types.ts`) — additive
```ts
  supplierCode?: string
  taxId?: string
  minOrderValue?: number   // minor units
  rating?: number          // e.g. 1–5
  notes?: string
```

### `CatalogItem` (`src/lib/inventory/types.ts`) — additive
```ts
  reorderQuantity?: number  // pharmacy-local; sync-protected by the dirty-guard once set
```
Add `reorderQuantity?: number` to `CatalogItemInput` too, with validation
(`reorderQuantity >= 0` when provided).

### New `supplierItems` store (`src/lib/procurement/types.ts` + `src/lib/db.ts`, **v20**)
```ts
export interface SupplierItem {
  id: string
  supplierId: string
  catalogItemId: string
  supplierSku?: string
  unitPrice?: number       // minor units
  minOrderQty?: number
  leadTimeDays?: number
  isPreferred?: boolean     // ≤ 1 true per catalogItemId (service-enforced)
  createdBy: string
  createdAt: string
  hlcTimestamp: string
}
```
`db.ts`: `supplierItems!: EntityTable<SupplierItem, 'id'>` and
```ts
this.version(20).stores({
  supplierItems: 'id, supplierId, catalogItemId, [supplierId+catalogItemId], [catalogItemId+isPreferred]',
})
```
(No `upgrade()` — a brand-new store needs no backfill. Do NOT edit the v1–v19
blocks.) Non-PHI operational data; not encrypted, consistent with the other
procurement stores.

## Services

### Supplier / catalog input plumbing
- `createSupplier`/`updateSupplier` (`supplier-service.ts`) accept the 5 new
  fields (`updateSupplier` already takes `Partial<Omit<Supplier,'id'|'createdAt'>>`,
  so only `createSupplier`'s params type + object literal change).
- `createCatalogItem`/`updateCatalogItem` (`catalog-item-service.ts`) accept
  `reorderQuantity` via `CatalogItemInput` + `validate`.

### New `src/lib/procurement/supplier-item-service.ts`
```ts
export async function upsertSupplierItem(params: {
  id?: string           // present → update, absent → create
  supplierId: string
  catalogItemId: string
  supplierSku?: string
  unitPrice?: number
  minOrderQty?: number
  leadTimeDays?: number
  isPreferred?: boolean
  createdBy: string
}): Promise<SupplierItem>

export async function setPreferredSupplier(catalogItemId: string, supplierItemId: string): Promise<void>
export async function getSupplierItemsForCatalogItem(catalogItemId: string): Promise<SupplierItem[]>
export async function getPreferredSupplierItem(catalogItemId: string): Promise<SupplierItem | undefined>
export async function getSupplierItemsForSupplier(supplierId: string): Promise<SupplierItem[]>
export async function removeSupplierItem(id: string): Promise<void>
```
- `upsertSupplierItem`: create (new id) or update by id; if `isPreferred: true`,
  clear `isPreferred` on all OTHER rows for that `catalogItemId` in the same
  transaction (the one-preferred invariant). Enqueue a `SupplierItem` sync entry
  (`create`/`update`). A duplicate `(supplierId, catalogItemId)` should update the
  existing row (upsert semantics via the `[supplierId+catalogItemId]` index).
- `setPreferredSupplier(catalogItemId, supplierItemId)`: in a transaction, set the
  target row `isPreferred: true` and clear it on every other row for that
  `catalogItemId`; enqueue updates.
- `getPreferredSupplierItem`: the row with `isPreferred: true` for the item (what
  4b's reorder generator calls). `removeSupplierItem`: delete + enqueue.

## UI (design-system, 4 locales)

**Design-system rules (binding):** ShadCN from `@/components/ui/*`, icons from
`@ultranos/ui-kit/icons`; semantic oklch tokens only; money in `font-numeric`;
RTL logical props; `EmptyState` for empty lists; OPD layout standards.

- **`SupplierForm.tsx`** — add fields: `supplierCode` (text), `taxId` (text),
  `minOrderValue` (money/number, minor-units parse), `rating` (number, 1–5),
  `notes` (textarea). Plumb through `createSupplier`/`updateSupplier`.
- **`CatalogItemFormDialog.tsx`** — add a `reorderQuantity` number field
  (alongside `reorderPoint`), AND a **"Suppliers for this item"** section (shown
  when editing an existing item, i.e. an id exists):
  - lists this item's `SupplierItem` rows (supplier name via `getSupplierById`,
    unit price `font-numeric`, MOQ, lead time, a preferred indicator);
  - an add/edit row: supplier `<select>` (from `getActiveSuppliers`), price, MOQ,
    lead time, `supplierSku`, and a **Set preferred** control → `upsertSupplierItem`
    / `setPreferredSupplier`;
  - a remove action per row → `removeSupplierItem`.
  `EmptyState` when the item has no linked suppliers.
- i18n: supplier-master field labels, supplier-item section labels
  (add/price/MOQ/lead-time/preferred/remove/empty), `reorderQuantity` label, across
  `messages/{en,ar,prs,ps}.json`.

## Errors & Edge Cases

- **One preferred per item:** setting a new preferred clears the previous one in
  the same transaction; there is never more than one `isPreferred: true` per
  `catalogItemId`.
- Upsert on a duplicate `(supplierId, catalogItemId)` updates the existing link
  rather than creating a second.
- `reorderQuantity` / `minOrderQty` / `minOrderValue` / `rating` validate as
  non-negative when provided; money fields are integer minor units.
- Setting `reorderQuantity` (or any catalog-item field) marks the item
  `locallyModified` → protected from Hub catalog re-sync (existing behavior).
- Deleting a supplier does not cascade-delete its `supplierItems` in 4a (a
  dangling link resolves to an inactive/missing supplier in the UI); a cleanup
  pass is a later concern. Removing an item's preferred link leaves the item with
  no preferred supplier (4b falls back to manual supplier choice).
- No PHI anywhere (suppliers, items, prices are operational).

## Testing

- **Supplier fields:** `createSupplier` persists the 5 new fields; `updateSupplier`
  updates them.
- **CatalogItem:** `createCatalogItem`/`updateCatalogItem` persist
  `reorderQuantity`; `validate` rejects a negative `reorderQuantity`; a set
  `reorderQuantity` marks `locallyModified` (survives a simulated `mergeCatalogBatch`).
- **`supplier-item-service`:** `upsertSupplierItem` creates a link + enqueues sync;
  updating by id edits in place; a duplicate `(supplierId, catalogItemId)` upserts
  (no second row); `setPreferredSupplier` / `upsertSupplierItem({isPreferred:true})`
  leaves exactly ONE `isPreferred` row for the item (clears the prior one);
  `getPreferredSupplierItem` returns it; `getSupplierItemsForCatalogItem` /
  `ForSupplier` filter correctly; `removeSupplierItem` deletes + enqueues.
- **v20 schema:** DB opens at v20 with the `supplierItems` store; the
  `[catalogItemId+isPreferred]` index queries.
- **UI:** `SupplierForm` renders + saves the new fields; `CatalogItemFormDialog`
  renders `reorderQuantity` + the suppliers section, adds a link, and sets
  preferred (asserts `upsertSupplierItem`/`setPreferredSupplier` called). RTL /
  design-system on touched surfaces.
- **Compliance:** no PHI in logs; sync entries emitted for supplierItems.

## Out of Scope (later)

- **Phase 4b:** reorder report (items ≤ reorderPoint with on-hand + suggested qty +
  preferred supplier) and suggested-PO generation grouped by supplier.
- Supplier performance analytics / auto-rating from receipt history.
- Per-supplier multi-currency; contract-price effective dating.
- Cascade cleanup of `supplierItems` on supplier/item deletion.
- Bulk import of supplier catalogs.

## Affected Files (indicative)

- `src/lib/procurement/types.ts` — `Supplier` fields + `SupplierItem` interface.
- `src/lib/inventory/types.ts` — `CatalogItem.reorderQuantity` + `CatalogItemInput`.
- `src/lib/db.ts` — `supplierItems` store + `version(20)`.
- `src/lib/procurement/supplier-service.ts` — 5 new create/update fields.
- `src/lib/inventory/catalog-item-service.ts` — `reorderQuantity` input + validate.
- `src/lib/procurement/supplier-item-service.ts` (new) — junction CRUD + preferred.
- `src/components/pharmacy/procurement/SupplierForm.tsx` — master fields.
- `src/components/pharmacy/inventory/CatalogItemFormDialog.tsx` — reorderQuantity +
  suppliers-for-item section.
- `messages/{en,ar,prs,ps}.json` — new strings.
