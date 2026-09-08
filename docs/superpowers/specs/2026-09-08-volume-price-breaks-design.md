# Wholesale Volume / Quantity Price Breaks (Design)

**Date:** 2026-09-08
**Apps:** `apps/pharmacy-lite/` (model, resolution, UI) + `apps/hub-api/` (flatten passthrough) + `supabase/migrations/`
**Status:** Approved design — pending implementation plan
**Epic:** Wholesaler Pharmacy. Layers quantity-tiered pricing on top of the flat per-(customer, item) `ContractPrice` from the Contract Pricing slice. Reuses that resource's full sync (push/pull/delete) — no new resource type.

## 1. Overview

Today a contract price is a single flat `priceMinor` per (customer, item). This slice adds **volume price breaks**: a set of quantity tiers per (customer, item) so a larger order line auto-prices to a lower unit price (the defining B2B-wholesale mechanic). Tiers live as a JSONB array on the existing `ContractPrice`; order lines resolve the unit price from the line quantity.

**In scope:** a `tiers: PriceBreak[]` field on `ContractPrice`; `resolveContractPrice(customerId, itemId, quantity)` tier selection; `setContractPrice` accepting tiers; order-line re-resolution on quantity change; a tiers editor on the customer detail page; one JSONB column on `contract_prices` + flattener passthrough (pull already generic).

**Out of scope (later):** named/shared price lists; effective-date ranges; per-tier currency; tier overlap validation beyond basic sorting.

## 2. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Tier model | **`tiers: { minQuantity: number; priceMinor: number }[]`** stored as JSONB on `ContractPrice`; the flat `priceMinor` remains the **base price for quantities below the first break** | Backward compatible — existing contract prices (no tiers) behave exactly as today. Reuses ContractPrice sync wholesale. |
| D2 | Resolution | `resolveContractPrice(customerId, catalogItemId, quantity = 1)` → pick the tier with the **largest `minQuantity ≤ quantity`**; if none applies, return the base `priceMinor`; if no ContractPrice row at all, `null` | Standard volume-break semantics; `quantity` defaults to 1 so all existing callers stay valid. |
| D3 | Order-line integration | `NewOrderPage` resolves each line's unit price with its **line quantity**, and **re-resolves when the quantity changes** (in addition to the existing add / unit-change / customer-change re-resolution). Manual per-line override still wins. | Volume price depends on quantity; the price must update as the operator types the qty. |
| D4 | Sync | **Reuse `ContractPrice`** — add a `tiers JSONB` column to `contract_prices`; `flattenContractPrice` passes `tiers` through; pull's generic passthrough already keeps it (`tiers` rides in `...rest`). No new resource type, no new pull branch. | The prior slice already syncs ContractPrice create/update/delete; tiers are just more data on the row. |
| D5 | Money in JSONB | Tier `priceMinor` is an **integer minor unit inside the JSONB** (not a BIGINT column) | Tiers are nested; JSON integers are exact for money-as-minor-units. `db.toRow`/`db.fromRows` recurse (snake `min_quantity`/`price_minor` at rest, camel on pull) — same as `SalesOrder.lines`. |
| D6 | UI | The customer detail page's Contract-prices card gains a **per-item tiers editor**: below each contract-price row, add/remove break rows (minQuantity + major-unit price). Saving calls `setContractPrice` with the tiers array. | Tiers belong with the price they refine. |

## 3. Client data model (`apps/pharmacy-lite/`)

### 3.1 Type (`src/lib/wholesale/types.ts`)
```ts
export interface PriceBreak {
  minQuantity: number   // tier applies when line quantity >= minQuantity
  priceMinor: number    // per base unit, integer minor units
}
export interface ContractPrice {
  id: string
  customerId: string
  catalogItemId: string
  priceMinor: number          // base price (quantities below the first break)
  tiers?: PriceBreak[]         // NEW — volume breaks, ascending minQuantity
  createdBy: string
  createdAt: string
}
```
No Dexie schema-version bump needed — `tiers` is a non-indexed field on an existing table (Dexie stores arbitrary object fields).

### 3.2 Service (`src/lib/wholesale/contract-price-service.ts`)
- `setContractPrice(params: { customerId; catalogItemId; priceMinor; createdBy; tiers? })` — persists `tiers` (normalize: drop empties, sort ascending by `minQuantity`) on the row; the existing upsert-by-pair + sync enqueue is unchanged (the enqueued payload now carries `tiers`).
- `resolveContractPrice(customerId, catalogItemId, quantity = 1): Promise<number | null>`:
```ts
const row = await db.contractPrices.where('[customerId+catalogItemId]').equals([customerId, catalogItemId]).first()
if (!row) return null
const applicable = (row.tiers ?? [])
  .filter((t) => t.minQuantity <= quantity)
  .sort((a, b) => b.minQuantity - a.minQuantity)
return applicable.length > 0 ? applicable[0].priceMinor : row.priceMinor
```
- `getContractPrices` / `removeContractPrice` unchanged (tiers ride along on the row).

## 4. Order-line integration (`NewOrderPage.tsx`)

`resolveLineUnitPriceMinor(customerId, item, unit)` currently calls `resolveContractPrice(customerId, item.id)`. Change to pass the **line quantity**: `resolveContractPrice(customerId, item.id, quantity)` (× packSize for pack, unchanged). Because the price now depends on quantity:
- On **quantity change** (the qty `<input onChange>`), re-resolve that line's `unitPriceMinor` from the new quantity (unless the line was manually overridden — a manual price still wins).
- Add / unit-change / customer-change re-resolution: unchanged, but now pass the line's current quantity.
- The manual per-line price override path is unchanged (still wins).
Resolution is async; keep the existing pattern of resolving where the line mutates and storing the resolved `unitPriceMinor`.

## 5. UI — customer detail page tiers editor (`CustomerDetailPage.tsx`)

The Contract-prices card already lists rows (item · price · Remove) + an add row. Extend so each row can carry tiers:
- Under a contract-price row, render its `tiers` (minQuantity · unit price · Remove-tier) and an **add-tier** sub-row (minQuantity number + major-unit price → append to the row's tiers → `setContractPrice({ ...row, tiers })`).
- The tiers editor uses the same money major↔minor conversion (`parseMajorToMinor` / `formatAmount`) as the base price.
- Empty tiers → the row behaves as a flat price (no visual clutter; show tiers only when present or when the operator expands an "Add volume break" affordance).
- ui-kit components + layout standard as before (semantic tokens, logical RTL, icons from `@ultranos/ui-kit/icons`).

## 6. Hub (`apps/hub-api/`) + migration

### 6.1 Migration `051_contract_prices_tiers.sql` (Supabase MCP; confirm next free number)
```sql
ALTER TABLE contract_prices ADD COLUMN IF NOT EXISTS tiers JSONB NOT NULL DEFAULT '[]'::jsonb;
```
### 6.2 `resource-mappers.ts`
`flattenContractPrice` adds `tiers: p.tiers ?? []` to its returned object (so `db.toRow` writes the `tiers` JSONB, snake-casing inner keys `min_quantity`/`price_minor`). Everything else unchanged.
### 6.3 Pull
No change — `toClientRow('ContractPrice', …)` already does `{ price, ...rest } → { ...rest, priceMinor: price }`; `tiers` rides in `...rest` (camelCased inner keys via `db.fromRows`). The delete-sync tombstone path is unaffected.

## 7. Testing

**Service:** `resolveContractPrice` returns the base price when qty below all tiers, the correct tier at/above a break, the highest applicable tier when several qualify, and `null` when no row; `setContractPrice` persists + enqueues tiers (sorted).
**Order line:** a line at a break quantity prices to the tier; changing the quantity across a break re-prices the line; manual override still wins; pack unit still × packSize on the resolved base.
**UI:** the detail page renders tiers under a row; add-tier calls `setContractPrice` with the new tier; remove-tier updates. LTR+RTL snapshots.
**Hub:** `sync.push` of a ContractPrice with `tiers` lands them in the `tiers` JSONB (inner keys snake_cased); `sync.pull` returns them (camelCased) — assert round-trip.
**Live (deferred):** set a break (10+ @ lower price) for a customer/item, start an order, type qty 12 → the line auto-prices to the break.

## 8. Reuse

Everything leans on the Contract Pricing slice: the ContractPrice resource, its sync (push/pull/delete), the detail-page card, and `NewOrderPage` resolution. The only Hub change is one additive JSONB column + a one-line flattener passthrough; the pull is already generic. Backward compatible — tier-less contract prices are unchanged.
