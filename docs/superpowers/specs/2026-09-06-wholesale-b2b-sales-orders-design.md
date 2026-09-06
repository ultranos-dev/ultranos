# Wholesale — Slice 1: B2B Customers + Sales Orders (Design)

**Date:** 2026-09-06
**App:** `apps/pharmacy-lite/` (wholesale mode)
**Status:** Approved design — pending implementation plan
**Epic:** Wholesaler Pharmacy (net-new). This is the first of several slices.

## 1. Overview

Add a **wholesale mode** to Pharmacy-Lite so a pharmacy that also acts as a B2B
distributor can sell bulk stock to other pharmacies/clinics. This first slice
delivers the core sell-side revenue workflow end to end:

> manage B2B customers → create a sales order → pick against FEFO batches →
> fulfil (deduct shared stock) → post an outbound invoice charge to the
> customer's AR ledger → record payments.

Everything is offline-first and reuses existing Pharmacy-Lite substrate
(inventory, FEFO, ledger/aging, sync queue, ui-kit).

## 2. Locked decisions (with rationale)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Operating model | **Wholesale mode inside Pharmacy-Lite** | A retail pharmacy that also wholesales; reuse inventory/POS/procurement rather than a new app. |
| D2 | Customer types | **Mixed** — Ultranos-tenant-linked or external | Model an optional `ultranosOrgId`; external customers are standalone records. |
| D3 | First slice | **B2B customers + sales orders** | The core revenue workflow; leans on the existing (dead) PO/transfer/ledger substrate. |
| D4 | Stock & UOM | **Same stock pool + light pack UOM** (`each`/`pack`) | Wholesale sells from the same `StockBatch` inventory as retail; order lines are `each` or `pack` (using existing `CatalogItem.packSize`), deducting base units. No full UOM hierarchy yet. |
| D5 | Pricing | **Per-item wholesale price + per-line override** | Add `CatalogItem.wholesalePrice`; lines default to it, overridable. Per-customer contract price lists deferred. |
| D6 | Credit / AR | **Lightweight AR reusing the ledger pattern** | Wholesale is credit-based; mirror the POS `LedgerEntry`/account pattern for customers. |
| D7 | Cross-tenant sync | **Model the link, defer the sync** | Capture `ultranosOrgId` now; pushing orders into a buyer's install is its own slice. |
| D8 | Outbound invoice | **SalesOrder acts as the invoice** | The retail `Invoice` table is modelled around `dispenseIds`/patients; reusing it would overload retail POS semantics. The SalesOrder holds lines + totals; the AR charge references `salesOrderId`. |

## 3. Data model

All monetary values are integers in minor currency units (consistent with
existing `pos/types.ts` and `inventory/types.ts`).

### New entities (`src/lib/wholesale/types.ts`)

```ts
export type SalesOrderStatus = 'draft' | 'confirmed' | 'picking' | 'fulfilled' | 'cancelled'
export type OrderUnit = 'each' | 'pack'

export interface WholesaleCustomer {
  id: string
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  paymentTermsDays?: number     // e.g. 30 for net-30
  creditLimit?: number
  ultranosOrgId?: string         // D7: optional link to an Ultranos tenant; sync deferred
  isActive: boolean
  createdAt: string
}

export interface BatchAllocation {
  stockBatchId: string
  qty: number                    // base units drawn from this batch
}

export interface SalesOrderLine {
  catalogItemId: string
  description: string
  unit: OrderUnit                // D4
  quantity: number               // in `unit`
  unitPrice: number              // price for one `unit` (defaults from wholesalePrice; overridable)
  lineTotal: number              // quantity * unitPrice
  baseUnits: number              // unit==='pack' ? quantity*packSize : quantity
  batchAllocations: BatchAllocation[]  // filled at pick time (FEFO)
}

export interface SalesOrder {
  id: string
  orderNumber: string            // sequential, prefix from settings (e.g. SO-)
  customerId: string
  status: SalesOrderStatus
  lines: SalesOrderLine[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  notes?: string
  createdBy: string
  createdAt: string
  fulfilledAt?: string
  cancelledAt?: string
  hlcTimestamp: string
}

// AR — mirrors pos/types.ts PatientAccount + LedgerEntry
export interface CustomerAccount {
  id: string
  customerId: string
  balance: number
  creditLimit?: number
  lastActivityAt: string
}

export type CustomerLedgerEntryType = 'charge' | 'payment' | 'adjustment'

export interface CustomerLedgerEntry {
  id: string
  customerId: string
  type: CustomerLedgerEntryType
  amount: number                 // positive = charge (owed), payment reduces balance
  salesOrderId?: string
  note?: string
  createdBy: string
  timestamp: string
}
```

### Changed entities

- `CatalogItem` (`inventory/types.ts`) gains **`wholesalePrice?: number`** (per base unit, minor units).
- `PharmacyInventorySettings` gains **`enableWholesale: boolean`**; `DEFAULT_PHARMACY_SETTINGS.enableWholesale = false`. Optional **`salesOrderPrefix: string`** (default `'SO-'`).

### Dexie schema (`src/lib/db.ts`)

One new schema version adding tables. Indexes:

- `wholesaleCustomers: 'id, name, isActive'`
- `salesOrders: 'id, customerId, status, createdAt, orderNumber'`
- `customerAccounts: 'id, customerId'`
- `customerLedgerEntries: 'id, customerId, salesOrderId, timestamp'`

**PHI note:** wholesale entities are operational/commercial data (no patient PHI),
so they are **not** added to `PHI_TABLE_CONFIGS` — consistent with how
`suppliers`, `stockBatches`, and `invoices` are treated today. Field-level
encryption is not applied.

## 4. Services (`src/lib/wholesale/`)

### `customer-service.ts` (mirror of `procurement/supplier-service.ts`)

```ts
createCustomer(params): Promise<WholesaleCustomer>       // Dexie put + enqueuePharmacySyncEntry('WholesaleCustomer')
updateCustomer(id, updates): Promise<void>
deactivateCustomer(id): Promise<void>
getActiveCustomers(): Promise<WholesaleCustomer[]>
getAllCustomers(): Promise<WholesaleCustomer[]>
getCustomerById(id): Promise<WholesaleCustomer | undefined>
```

### `sales-order-service.ts`

```ts
createDraft(params: { customerId; lines; taxRate; createdBy }): Promise<SalesOrder>
// Computes baseUnits + line/total math (like invoice-service). Status 'draft'.

confirm(orderId): Promise<void>                 // 'draft' -> 'confirmed'

pickOrder(orderId): Promise<SalesOrder>
// 'confirmed' -> 'picking'. For each line, FEFO-allocate baseUnits across
// batches via selectFefoBatch/getFefoBatches, writing batchAllocations.
// Does NOT deduct stock yet (allocation preview). Flags short-stock lines.

fulfill(orderId, performedBy): Promise<void>
// 'picking' -> 'fulfilled'. For each allocation, deductStock({ type:'dispensed'/
// 'sold', referenceType:'sales_order', referenceId: orderId }). Sets fulfilledAt.
// Posts an AR charge (= order.total) via customer-account-service.

cancel(orderId): Promise<void>                  // any non-fulfilled -> 'cancelled'
getOrders(filter?): Promise<SalesOrder[]>
getOrderById(id): Promise<SalesOrder | undefined>
```

Pricing default per line: `unitPrice = override ?? (unit==='pack' ? wholesalePrice*packSize : wholesalePrice) ?? 0`.

`StockMovementRefType` (`inventory/types.ts`) gains `'sales_order'`, and
`StockMovementType` gains `'sold'` — a distinct type (not reusing `'dispensed'`)
so consumption/wastage reports can separate wholesale sales from retail dispensing.

### `customer-account-service.ts` (mirror of `pos/patient-account-service.ts`)

```ts
getAccountsWithBalance(): Promise<CustomerAccount[]>
getCustomerLedger(customerId): Promise<CustomerLedgerEntry[]>
postCharge(customerId, amount, salesOrderId, createdBy): Promise<void>   // used by fulfill()
recordPayment(customerId, amount, createdBy, method?): Promise<void>
// posts 'payment' ledger entry, reduces balance, adds cash to the open drawer
// via existing cash-drawer-service (cashIn), like POS credit repayment.
getAgingBuckets(customerId): Promise<AgingBuckets>
getTotalAging(): Promise<TotalAging>
```

**Reuse:** generalize the aging bucket helper currently in
`patient-account-service` into a shared pure function `computeAging(entries)` so
both patient and customer AR share one implementation (refactor, not duplicate).

## 5. UI / routes / nav

New **"Wholesale"** `NavGroup` in `nav-config.ts`, rendered only when
`settings.enableWholesale` is true (nav-main filters it). Pages under
`src/app/[locale]/(app)/wholesale/`:

| Route | Purpose |
|-------|---------|
| `/wholesale/customers` | List + create/edit B2B customers |
| `/wholesale/orders` | Sales-order list (status pills, search) |
| `/wholesale/orders/new` | Build order: customer picker → add lines (catalog search, each/pack, qty, auto-price, override) → confirm |
| `/wholesale/orders/[id]` | Detail: pick (FEFO preview) → fulfil → shows totals + AR posting |
| `/wholesale/accounts` | Customer AR: balances, aging, record payment |

All pages follow the CLAUDE.md page-layout standard: full-width `<h1 class="text-2xl font-semibold">`,
one toolbar row (`flex flex-wrap items-center gap-3`, primary action folded into the end),
one content box (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`),
`EmptyState` for zero-data, semantic tokens only. New icons added to `packages/ui-kit/src/icons.ts`.

## 6. Sync & offline

New resource types (`WholesaleCustomer`, `SalesOrder`, `CustomerLedgerEntry`)
enqueue through the existing `enqueuePharmacySyncEntry`. **Known constraint,
stated honestly:** as with all current inventory/procurement resources, **no Hub
router ingests these yet**, so wholesale is offline-first and single-device in
this slice. The Hub landing zone is the future backend slice. This is documented
in code comments and surfaced to the user (not implied to sync cross-device).

## 7. Mode gating

- `enableWholesale` setting (default off) gates the nav group and the
  `/wholesale/*` routes (a lightweight guard redirects to `/` when off).
- Role/entitlement: reuse the existing `useEntitlementCheck` pattern; a dedicated
  wholesale entitlement/role is deferred — the settings flag is sufficient for
  this slice.

## 8. Reuse map

| Need | Reuse |
|------|-------|
| Customer CRUD + sync enqueue | `procurement/supplier-service.ts` (template) + `dexie-sync-adapter.enqueuePharmacySyncEntry` |
| FEFO allocation | `inventory/fefo.ts` (`selectFefoBatch`, `getFefoBatches`) |
| Stock deduction | `inventory/stock-service.ts` (`deductStock`) |
| Totals math | `pos/invoice-service.ts` pattern |
| AR ledger + aging | `pos/patient-account-service.ts` (generalize `computeAging`) |
| Cash reconciliation on payment | `pos/cash-drawer-service.ts` |
| HLC stamps | `lib/hlc.ts` |
| Page layout / components | `@ultranos/ui-kit` + CLAUDE.md page standard |

## 9. Testing strategy (TDD)

- **customer-service**: create persists + enqueues sync; active/all/byId queries.
- **sales-order-service**: draft totals; each-vs-pack `baseUnits` math; `pickOrder`
  FEFO allocation (earliest expiry, multi-batch split, short-stock flag);
  `fulfill` deducts correct base units per allocation and posts AR charge = total;
  cancel guards (cannot cancel fulfilled).
- **customer-account-service**: charge increases balance; payment reduces balance
  and adds drawer cash; aging buckets; shared `computeAging` parity with patient AR.
- **UI**: order build → confirm → pick → fulfil happy path; RTL snapshots for each
  new page (LTR + RTL per CLAUDE.md).
- **mode gating**: nav group hidden and `/wholesale/*` guarded when
  `enableWholesale` is false.

## 10. Deferred to later slices (explicit non-goals)

1. Per-customer contract price lists / volume tiers.
2. Cross-tenant order sync (order → buyer's Ultranos install).
3. Multi-warehouse / location model.
4. Supplier catalogs + procurement (buy-side).
5. Full UOM hierarchy (case/inner/each conversions beyond each/pack).
6. Hub-side ingestion of wholesale resources (the "#5 backend" slice).
