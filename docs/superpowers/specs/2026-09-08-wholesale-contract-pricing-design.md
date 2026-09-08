# Wholesale Contract Pricing (Design)

**Date:** 2026-09-08
**Apps:** `apps/pharmacy-lite/` (model, resolution, UI, pull) + `apps/hub-api/` (ingestion) + `supabase/migrations/`
**Status:** Approved design — pending implementation plan
**Epic:** Wholesaler Pharmacy. Follows wholesale slice 1 (customers/orders/AR) and B1/B2 (Hub sync).

## 1. Overview

Today every wholesale order line is priced from a single per-item
`CatalogItem.wholesalePrice` (× `packSize` for pack units), resolved in
`NewOrderPage.computeUnitPriceMinor`. This slice adds **per-customer negotiated
prices**: a price set per (customer, catalog item) that order lines use in
preference to the default, and that syncs cross-device via the B1/B2 pattern.

**In scope:** `ContractPrice` model + Dexie table; a `contract-price-service`
(upsert/remove/list/resolve); the order-line resolution change (contract →
default → 0, manual override on top); a new **customer detail page** with a
"Contract prices" section; and full **Hub sync** (migration + `sync.push`
ingestion + `sync.pull` hydration on the B1/B2 recipe).

**Out of scope (later):** named/shared price lists; volume/quantity price breaks;
effective-date ranges; currency other than the pharmacy's configured one.

## 2. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Model | **Flat per-(customer, item) prices** | Directly answers "what does customer X pay for item Y"; simplest. Named lists are a later refinement. |
| D2 | Management UI | **New customer detail page** with a Contract-prices section | Prices live in the customer's record; natural place. Adds the detail page the app lacks today. |
| D3 | Sync | **Included this slice** (B1 push + B2 pull) | Consistent with the now-synced wholesale data; prices are useless on only one device. Reuses the proven recipe. |
| D4 | Resolution order | **contract → `wholesalePrice` → 0**, manual per-line override on top | Contract price is the negotiated override of the default; the operator can still override a single line. |
| D5 | Price basis | **Per base unit, integer minor units** (like `wholesalePrice`) | `× packSize` for pack units, mirroring existing pricing. |
| D6 | Uniqueness | **One price per (customer, item)** | Upsert by `[customerId+catalogItemId]` with a stable `id`; Hub `UNIQUE(org_id, customer_id, catalog_item_id)` is the safety net. |

## 3. Client data model (`apps/pharmacy-lite/`)

### 3.1 Type (`src/lib/wholesale/types.ts`)
```ts
export interface ContractPrice {
  id: string
  customerId: string
  catalogItemId: string
  priceMinor: number      // per base unit, integer minor units
  createdBy: string
  createdAt: string
}
```
No stored `hlcTimestamp` on the row (like `WholesaleCustomer` — the sync enqueue
supplies the HLC; B2 pull's dirty-check uses the sync queue, not a per-row HLC).

### 3.2 Dexie table (`src/lib/db.ts`, new schema version 16)
`contractPrices: 'id, customerId, [customerId+catalogItemId]'`. Field declaration
on `PharmacyLiteDatabase`. NOT added to `PHI_TABLE_CONFIGS`.

## 4. Service — `src/lib/wholesale/contract-price-service.ts`

```ts
setContractPrice(params: { customerId; catalogItemId; priceMinor; createdBy }): Promise<ContractPrice>
// Upsert by pair: find existing via [customerId+catalogItemId]; if found, reuse its id + update priceMinor;
// else create with a new id. Persist to db.contractPrices, then enqueuePharmacySyncEntry('ContractPrice').
removeContractPrice(id: string): Promise<void>          // delete locally (+ enqueue a delete/tombstone — see §7 note)
getContractPrices(customerId: string): Promise<ContractPrice[]>   // where('customerId').equals(customerId)
resolveContractPrice(customerId: string, catalogItemId: string): Promise<number | null>
// where('[customerId+catalogItemId]').equals([customerId, catalogItemId]).first()?.priceMinor ?? null
```

Mirrors `customer-service.ts` for the create + enqueue pattern.

## 5. Resolution integration (`NewOrderPage.tsx`)

`computeUnitPriceMinor(unit, item)` currently returns
`unit==='pack' ? wholesalePrice*packSize : wholesalePrice`. Change so the per-base
price is resolved as **`(await resolveContractPrice(customerId, item.id)) ??
item.wholesalePrice ?? 0`** before the `× packSize` step. Because resolution is
async, resolve it where a line is added (`addCatalogLine`) and on unit change,
storing the resolved `unitPriceMinor` (as today). The selected `customerId` is
already in the form state. The manual per-line price input still overrides the
resolved value (unchanged). If the customer changes after lines exist, re-resolve
each line's price from the new customer (or clear — see §8 test).

## 6. Customer detail page — `src/app/[locale]/(app)/wholesale/customers/[id]/page.tsx` + `CustomerDetailPage.tsx`

New detail/form page (standalone `<h1>`, left back button `w-fit px-0`, boxed
cards `rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50`):
- **Customer info card:** name/contact/phone/email/address/paymentTermsDays/creditLimit,
  editable via `updateCustomer`.
- **Contract prices card:** a table of `getContractPrices(id)` rows (item name ·
  price via the minor-unit formatter · Remove), plus an add row — catalog search
  (`db.catalogItems`, like `NewOrderPage`) → major-unit price input → `setContractPrice`.
  Empty → ui-kit `EmptyState`.
Customers-list rows (`CustomersPage`) link to `/wholesale/customers/[id]`.

## 7. Hub sync (B1 push + B2 pull recipe)

### 7.1 Migration `048_contract_prices.sql` (via Supabase MCP)
```sql
CREATE TABLE IF NOT EXISTS contract_prices (
  id              UUID PRIMARY KEY,
  customer_id     UUID NOT NULL,
  catalog_item_id TEXT NOT NULL,
  price           BIGINT NOT NULL,
  created_by      TEXT NOT NULL,
  org_id          UUID NOT NULL,
  hlc_timestamp   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, customer_id, catalog_item_id)
);
CREATE INDEX IF NOT EXISTS idx_contract_prices_org ON contract_prices(org_id);
CREATE INDEX IF NOT EXISTS idx_contract_prices_customer ON contract_prices(customer_id);
ALTER TABLE contract_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_contract_prices" ON contract_prices TO service_role USING (true) WITH CHECK (true);
```
(B1 added `047`; B2 added no migration, so `048` is the next free number. The
implementer confirms via `list_migrations` before applying and uses the next free
`NNN_contract_prices.sql` if `048` is somehow taken.)

### 7.2 `apps/hub-api/`
- `sync.ts`: `RESOURCE_TABLE_MAP` += `ContractPrice: 'contract_prices'`;
  `ORG_SCOPED_TABLES` += `'contract_prices'`.
- `rbac.ts`: `ROLE_PERMISSIONS.PHARMACIST` += `'ContractPrice'`.
- `resource-mappers.ts`: `flattenContractPrice(p)` → `{ id, customerId,
  catalogItemId, price: p.priceMinor, createdBy, createdAt }` (maps client
  `priceMinor` → column `price`; register in `mappers`).

### 7.3 Drain (`drain-sync-fn.ts`)
No change — non-dispense resources already route to `sync.push`.

### 7.4 B2 pull (`wholesale-pull.ts`)
- Add `'ContractPrice'` to `WHOLESALE_TYPES` and `tableFor` (→ `db.contractPrices`).
- `toClientRow`: `ContractPrice` needs the reverse of the flatten — the Hub column
  is `price`, `db.fromRows` yields `price`, but the client type uses `priceMinor`.
  So `toClientRow('ContractPrice', data)` maps `price → priceMinor`. (Analogous to
  the `entryTimestamp → timestamp` reversal already there.)

**Removal note:** local `removeContractPrice` deletes the Dexie row; a full
cross-device delete would need a tombstone/delete op through sync. This slice
keeps removal **local-only** (deletes locally + does not push a delete) — a
re-pull could re-hydrate a deleted price. Documented as a known limitation; a
delete-sync is a small follow-up. (Set/update fully syncs.)

## 8. Testing

**Service:** `setContractPrice` new pair creates + enqueues; same pair updates
(reuses id, no duplicate row); `resolveContractPrice` returns the contract price
when set and `null` when not; `getContractPrices` filters by customer.
**Resolution (NewOrderPage):** a line for a customer WITH a contract price uses it;
WITHOUT → falls back to `wholesalePrice`; pack unit → `× packSize`; manual override
still wins; changing the customer re-resolves.
**UI:** detail page renders customer info + contract-prices table; add sets a price
(major→minor); remove deletes; customers-list row links to `/wholesale/customers/[id]`.
LTR+RTL snapshots.
**Hub:** `sync.push` lands a `ContractPrice` in `contract_prices` with `org_id` +
`price` from `priceMinor`; `sync.pull` returns it org-scoped; `price → priceMinor`
on pull.
**Live:** set a contract price for a customer, start a new order for them → the
line auto-prices to the contract price (not the default `wholesalePrice`).

## 9. Reuse

Everything leans on existing patterns: `customer-service` (CRUD+enqueue),
`NewOrderPage` catalog search + money format, the B1 ingestion recipe (table →
map → RBAC → flattener) and B2 pull (types list + `tableFor` + `toClientRow`
reversal). The drain needs no change.
