# Pharmacy Lite: Inventory Management & Point of Sale

> **Status:** Approved design
> **Date:** 2026-05-25
> **Branch:** `ux-v1.0`
> **Scope:** Full enterprise pharmacy operations — inventory, procurement, transfers, POS, reporting

---

## Overview

Transform pharmacy-lite from a dispensing-only tool into a complete pharmacy operations platform: inventory management, procurement, inter-pharmacy transfers, point-of-sale with cash/card/credit, and operational reporting. Progressive complexity via settings toggles ensures corner pharmacies stay simple while hospital pharmacies get full capability.

**Target users:** Independent pharmacies (single-counter), small chains (2-5 locations), hospital-attached pharmacies. All in MENA/Central Asia markets.

**Core principle:** Offline-first. Every operation completes without network. Sync resolves conflicts on reconnect.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Stock deduction | Immediate local on dispense | Offline-first; pharmacist gets instant feedback |
| Conflict resolution | Movements=Tier1 (append-only), Quantities=Tier2 (timestamp merge) | Safety-critical ledger entries never lost |
| Catalog source | Hub-managed, locally cached | Consistency across network; offline-capable |
| Barcode | EAN-13 scan + manual fallback | Standard pharma packaging + real-world fallback |
| Expiry management | FEFO enforced + auto-quarantine expired | Patient safety; expired meds cannot be dispensed |
| Controlled substances | Running balance + discrepancy reports | Regulatory compliance |
| Payments | Cash + card + patient credit/tab | Regional reality — patients have running accounts |
| Money storage | Integer minor units (no floats) | Eliminates floating-point arithmetic bugs |
| POS flow | Configurable (mandatory vs flexible post-dispense) | Different pharmacies have different policies |
| Network visibility | Full cross-pharmacy + inter-pharmacy transfers | Hub-and-spoke enables org-level operations |
| Zones | Opt-in (nullable zone_id on stock) | Simple default, hospital-grade when needed |
| PO lifecycle | Opt-in (simple receiving by default) | Corner pharmacy stays lightweight |

---

## Data Model

### Core Inventory

#### CatalogItem
Hub-managed formulary, synced to local Dexie cache. Each pharmacy reads from this; only Hub admins can create/modify entries.

```typescript
interface CatalogItem {
  id: string                    // UUID
  name: string                  // e.g. "Amoxicillin"
  nameLocal?: string            // Arabic/Dari name
  form: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'inhaler' | 'other'
  strength: string              // e.g. "500mg"
  strengthUnit: string          // e.g. "mg"
  packSize: number              // units per pack
  barcode?: string              // EAN-13
  category: string              // e.g. "Antibiotic", "Analgesic"
  controlledSchedule?: 'II' | 'III' | 'IV' | 'V'
  defaultSellingPrice: number   // minor units; used when no batch-level override
  reorderPoint: number          // alert threshold
  minStock?: number
  maxStock?: number
  isActive: boolean
  lastSyncedAt: string          // ISO timestamp
}
// Dexie indexes: id, barcode, name, category, controlledSchedule
```

#### StockBatch
Individual batch/lot with per-batch pricing. FEFO ordering by expiryDate.

```typescript
interface StockBatch {
  id: string                    // UUID
  catalogItemId: string         // FK → CatalogItem
  batchNumber: string
  lotNumber?: string
  expiryDate: string            // ISO date (YYYY-MM-DD)
  quantityOnHand: number        // derived/cached from StockMovements
  costPrice: number             // minor units, per unit
  sellingPrice: number          // minor units, per unit (batch-level override)
  zoneId?: string               // FK → Zone (nullable, opt-in)
  supplierId?: string           // FK → Supplier
  goodsReceiptId?: string       // FK → GoodsReceipt
  receivedAt: string            // ISO timestamp
  status: 'active' | 'quarantined' | 'depleted'
  locationId: string            // this pharmacy's ID
  hlcTimestamp: string
}
// Dexie indexes: catalogItemId, expiryDate, status, locationId
// FEFO query: WHERE catalogItemId=X AND status='active' ORDER BY expiryDate ASC
```

#### StockMovement (APPEND-ONLY — Tier 1 Sync)
Every stock change is a ledger entry. Never updated, never deleted.

```typescript
interface StockMovement {
  id: string                    // UUID
  stockBatchId: string          // FK → StockBatch
  catalogItemId: string         // FK → CatalogItem
  type: 'received' | 'dispensed' | 'adjusted' | 'transferred_out' | 'transferred_in' | 'quarantined' | 'disposed' | 'returned' | 'void_reversal'
  quantity: number              // positive=in, negative=out
  reason?: string               // for adjustments, disposals, voids
  referenceId?: string          // dispenseId, PO id, transferId, invoiceId
  referenceType?: 'dispense' | 'purchase_order' | 'transfer' | 'count' | 'goods_receipt' | 'void'
  performedBy: string           // practitioner ID
  timestamp: string             // ISO
  hlcTimestamp: string
}
// Dexie indexes: stockBatchId, catalogItemId, type, timestamp
// NEVER updated, NEVER deleted
```

#### GoodsReceipt
Business document — "what came in the door." Creates StockBatches and StockMovements.

```typescript
interface GoodsReceipt {
  id: string
  supplierId?: string           // FK → Supplier
  purchaseOrderId?: string      // FK → PurchaseOrder (if PO mode)
  receivedBy: string            // practitioner ID
  items: GoodsReceiptItem[]
  totalCost: number             // minor units
  notes?: string
  receivedAt: string
  hlcTimestamp: string
}

interface GoodsReceiptItem {
  catalogItemId: string
  batchNumber: string
  lotNumber?: string
  expiryDate: string
  quantity: number
  costPrice: number             // minor units per unit
  sellingPrice: number          // minor units per unit
}
```

#### StockCount
Physical reconciliation. On completion, generates adjustment StockMovements for all variances.

```typescript
interface StockCount {
  id: string
  type: 'full' | 'spot' | 'controlled_only'
  status: 'in_progress' | 'completed'
  countedBy: string             // practitioner ID
  items: StockCountItem[]
  totalVarianceItems: number    // count of items with discrepancy
  startedAt: string
  completedAt?: string
  hlcTimestamp: string
}

interface StockCountItem {
  catalogItemId: string
  stockBatchId: string
  expectedQty: number
  actualQty: number
  variance: number              // actual - expected
}
```

### Procurement

#### Supplier

```typescript
interface Supplier {
  id: string
  name: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  leadTimeDays?: number
  paymentTerms?: string
  isActive: boolean
  createdAt: string
}
```

#### PurchaseOrder (PO mode only)

```typescript
interface PurchaseOrder {
  id: string
  supplierId: string            // FK → Supplier
  status: 'draft' | 'sent' | 'partially_received' | 'closed' | 'cancelled'
  items: PurchaseOrderItem[]
  totalCost: number             // minor units
  notes?: string
  createdBy: string
  createdAt: string
  sentAt?: string
  closedAt?: string
  hlcTimestamp: string
}

interface PurchaseOrderItem {
  catalogItemId: string
  quantityOrdered: number
  quantityReceived: number
  unitCost: number              // minor units
}
```

#### StockTransfer (transfers mode only)

```typescript
interface StockTransfer {
  id: string
  fromLocationId: string
  toLocationId: string
  status: 'requested' | 'approved' | 'shipped' | 'received' | 'cancelled'
  items: TransferItem[]
  requestedBy: string
  requestedAt: string
  approvedBy?: string
  shippedAt?: string
  receivedAt?: string
  receivedBy?: string
  hlcTimestamp: string
}

interface TransferItem {
  catalogItemId: string
  stockBatchId: string
  quantity: number
}
```

### Point of Sale

#### Invoice

```typescript
interface Invoice {
  id: string
  invoiceNumber: string         // sequential, per-pharmacy (e.g. "INV-00042")
  patientId?: string            // FK → Patient
  dispenseIds: string[]         // linked MedicationDispenses
  items: InvoiceLineItem[]
  subtotal: number              // minor units
  taxRate: number               // percentage (e.g. 5)
  taxAmount: number             // minor units
  total: number                 // minor units
  amountPaid: number            // minor units
  amountDue: number             // total - amountPaid
  status: 'draft' | 'finalized' | 'paid' | 'partial' | 'voided'
  createdBy: string
  createdAt: string
  voidedBy?: string
  voidedAt?: string
  voidReason?: string
  hlcTimestamp: string
}

interface InvoiceLineItem {
  catalogItemId: string
  stockBatchId: string
  description: string
  quantity: number
  unitPrice: number             // minor units
  lineTotal: number             // minor units
}
```

#### Payment

```typescript
interface Payment {
  id: string
  invoiceId: string             // FK → Invoice
  method: 'cash' | 'card' | 'credit'
  amount: number                // minor units
  reference?: string            // card auth code
  cashDrawerId?: string         // FK → CashDrawer (if cash)
  receivedBy: string            // practitioner ID
  timestamp: string
}
// credit payment → creates LedgerEntry
// cash payment → increments CashDrawer.cashIn
```

#### LedgerEntry (APPEND-ONLY — Tier 1 Sync)
Patient credit ledger. Balance is derived as SUM(amount).

```typescript
interface LedgerEntry {
  id: string
  patientId: string             // FK → Patient
  type: 'charge' | 'payment' | 'adjustment'
  amount: number                // minor units (+charge, -payment)
  invoiceId?: string
  note?: string
  createdBy: string
  timestamp: string
}
// Dexie indexes: patientId, timestamp, type
// APPEND-ONLY — balance derived from entries
```

#### PatientAccount

```typescript
interface PatientAccount {
  id: string                    // = patientId
  patientId: string             // FK → Patient
  balance: number               // cached, derived from LedgerEntries
  creditLimit?: number          // minor units
  lastActivityAt: string
}
```

#### CashDrawer

```typescript
interface CashDrawer {
  id: string
  openedBy: string
  openedAt: string
  openingBalance: number        // minor units
  closedAt?: string
  closingBalance?: number       // manually counted
  expectedBalance?: number      // computed: opening + cashIn - cashOut
  discrepancy?: number          // closing - expected
  status: 'open' | 'closed'
  cashIn: number                // total cash received
  cashOut: number               // total cash paid out (refunds, petty cash)
  notes?: string
}
```

### Configuration

#### PharmacySettings

```typescript
interface PharmacySettings {
  // Feature toggles
  enablePurchaseOrders: boolean       // default: false
  enableZones: boolean                // default: false
  enablePatientCredit: boolean        // default: false
  enableTransfers: boolean            // default: false
  requirePaymentOnDispense: boolean   // default: false — controls auto-nav to /pos, NOT payment enforcement. Invoice stays 'draft' if pharmacist navigates away.

  // Operational config
  expiryAlertDays: number             // default: 90
  lowStockAlertEnabled: boolean       // default: true
  fefoEnforcement: 'suggest' | 'enforce'  // default: 'enforce'

  // Financial config
  currency: string                    // default: 'AFN' (ISO 4217)
  currencyMinorUnits: number          // default: 2
  taxRate: number                     // default: 0 (percentage)
  invoicePrefix: string               // default: 'INV-'

  // Location identity
  locationId: string
  locationName: string
  organizationId?: string
}
```

#### Zone (opt-in)

```typescript
interface Zone {
  id: string
  name: string                  // e.g. "Dispensary", "Storeroom", "Fridge"
  locationId: string
  isDefault: boolean
}
```

---

## Sync Tiers

| Tier | Entity | Strategy | Rationale |
|------|--------|----------|-----------|
| **Tier 1** | StockMovement | Append-only, both kept | Safety-critical ledger — never lose a record |
| **Tier 1** | LedgerEntry | Append-only, both kept | Financial ledger — never lose a transaction |
| **Tier 2** | StockBatch (quantityOnHand) | Timestamp merge | Derived value; can rebuild from movements |
| **Tier 2** | Invoice, Payment | Timestamp merge | Financial records with state transitions |
| **Tier 3** | CatalogItem | Last-Write-Wins | Hub-authoritative, pharmacy is consumer |
| **Tier 3** | Supplier, PurchaseOrder, GoodsReceipt | Last-Write-Wins | Operational data, low conflict risk |
| **Tier 3** | PharmacySettings | Last-Write-Wins | Configuration, rarely concurrent |

---

## Pages & Navigation

### Sidebar Structure (5 groups)

**Dispensing** (existing):
- Dashboard `/`
- Scan Rx `/scan`
- Paper Rx `/paper-rx`
- Queue `/queue`
- History `/history`

**Inventory** (new):
- Stock Overview `/inventory`
- Receive Stock `/inventory/receive`
- Catalog `/inventory/catalog`
- Suppliers `/inventory/suppliers` *(PO mode only)*
- Transfers `/inventory/transfers` *(transfers mode only)*

**Financial** (new):
- Point of Sale `/pos`
- Patient Accounts `/pos/accounts` *(credit mode only)*
- Cash Drawer `/pos/cash-drawer`

**Clinical** (extended):
- Controlled Substances `/controlled` *(upgraded with real data)*
- Unverified Dispenses `/unverified`
- Stock Counts `/inventory/count`

**System** (extended):
- Sync Queue `/sync`
- Reports `/reports` *(new)*
- Settings `/settings` *(extended with toggles)*

### Page Visibility Rules

**Always visible:** /inventory, /inventory/receive, /inventory/catalog, /inventory/count, /pos, /pos/cash-drawer, /reports

**Settings-gated:**
- `/inventory/suppliers` → `enablePurchaseOrders`
- `/inventory/transfers` → `enableTransfers`
- `/pos/accounts` → `enablePatientCredit`

**Conditional UI within pages:**
- Zone column in stock views → `enableZones`
- PO selection in Receive Stock → `enablePurchaseOrders`

---

## Core Workflows

### Modified Dispensing Flow

```
Scan Rx → Verify → Fulfill →
  FEFO batch auto-selected →
  Stock deducted (StockMovement 'dispensed') →
  Invoice(draft) auto-generated →
  Confirm →
  Success screen + "Collect Payment" CTA
  (or auto-nav to /pos if requirePaymentOnDispense=true)
```

### Receive Stock

```
Scan barcode / search catalog →
  Add items (batch, expiry, qty, cost, selling price) →
  [if PO mode: select PO first, auto-fill expected items] →
  Confirm receipt →
  GoodsReceipt created →
  StockBatches created →
  StockMovements('received') created →
  [if PO: update PO quantityReceived, check if closed]
```

### Collect Payment

```
Open invoice →
  Split payment (cash X + card Y + credit Z) →
  Record each Payment →
  [if credit: create LedgerEntry(charge), update PatientAccount.balance] →
  [if cash: increment CashDrawer.cashIn] →
  Update Invoice.amountPaid, status →
  Print/PDF receipt
```

### Stock Count

```
Start count (full / spot / controlled_only) →
  Scan/search items →
  Enter actual quantities →
  System shows expected vs actual + variance →
  Complete count →
  Auto-generate StockMovement('adjusted') for each variance ≠ 0 →
  Controlled substance variances flagged for pharmacist review
```

### Inter-Pharmacy Transfer

```
View network stock (via Hub) →
  Request items from sibling pharmacy →
  [sender approves] →
  Sender ships: deducts stock, StockMovement('transferred_out') →
  Receiver confirms: adds stock, StockMovement('transferred_in') →
  Both sync status updates to Hub
```

### Expiry Auto-Quarantine

```
Background check (on app load + hourly) →
  Query StockBatch WHERE expiryDate <= today AND status = 'active' →
  For each: set status = 'quarantined', create StockMovement('quarantined') →
  Dashboard alert count updates
```

### Invoice Void

```
Select invoice → Void (requires reason) →
  Invoice.status = 'voided', voidedBy, voidedAt, voidReason set →
  For each line item: StockMovement('void_reversal') created (stock returned) →
  [if credit was used: reversing LedgerEntry created] →
  [if cash: CashDrawer.cashOut incremented]
```

---

## Dashboard Widgets (appended below existing)

1. **Inventory Alerts Card** — counts of: low-stock items, near-expiry items (within threshold), quarantined items. Each tappable to /inventory with filter.
2. **Cash Drawer Indicator** — "Drawer open since HH:MM" or "No drawer open" with CTA.
3. **Today's Revenue** — total amount invoiced today (minor units → formatted).

---

## Integration with Existing Systems

### FulfillmentChecklist Modifications

After `confirmDispense()`:
1. Determine FEFO batch for each medication (query StockBatch by catalogItemId, status='active', ORDER BY expiryDate ASC)
2. Deduct quantity from selected batch (update quantityOnHand)
3. Create StockMovement(type='dispensed') for each deduction
4. Create Invoice(draft) with line items from dispensed medications
5. Show success with "Collect Payment" CTA (or auto-nav if configured)

### ControlledSubstancesView Upgrade

- Read `controlledSchedule` from CatalogItem (via join on medicationCode)
- Show running balance: SUM(StockMovements WHERE catalogItem.controlledSchedule IS NOT NULL) grouped by batch
- Discrepancy column: last StockCount variance for that item

### Catalog Sync (Hub → Local)

- On authenticated Hub connection: fetch CatalogItem changes since `lastSyncedAt`
- Bulk-put into local Dexie
- Used by: dispense flow (FEFO batch lookup), receive stock (product search), barcode scan (lookup by barcode)

---

## Decomposition for Implementation

This spec covers 4 sub-projects, built sequentially. Each produces working, shippable software.

### Sub-project A: Catalog + Stock Core
- CatalogItem sync from Hub
- StockBatch, StockMovement entities
- Receive Stock page (simple mode, no PO)
- Stock Overview page with search/filter
- FEFO batch selection during dispensing
- Auto-quarantine expired stock
- Dashboard inventory widgets
- Dispense integration (stock deduction + StockMovement creation)

### Sub-project B: POS + Financial
- Invoice, Payment, CashDrawer, LedgerEntry, PatientAccount
- POS page (payment collection after dispense)
- Cash Drawer page (open/close/reconcile)
- Patient Accounts page (credit ledgers, aging)
- Invoice auto-creation from dispense
- Receipt printing (PDF)
- `requirePaymentOnDispense` setting

### Sub-project C: Procurement + Counts
- Supplier, PurchaseOrder, GoodsReceipt (full PO mode)
- StockCount entity and workflow
- Suppliers page (CRUD)
- Stock Count page (full/spot/controlled)
- Controlled Substances view upgrade (real schedule + running balance)
- `enablePurchaseOrders` toggle

### Sub-project D: Network + Reports
- StockTransfer entity and Hub sync
- Cross-pharmacy stock visibility (query Hub)
- Transfer request/ship/receive workflow
- Transfers page
- Reports page (consumption, margins, wastage, aging, controlled discrepancy)
- `enableTransfers` toggle

**Build order:** A → B → C → D

---

## Safety & Compliance

- **FEFO enforcement** prevents dispensing from longer-dated batch when shorter-dated is available (configurable: suggest vs enforce)
- **Auto-quarantine** makes it impossible to dispense expired medication
- **Controlled substance running balance** — append-only StockMovements provide tamper-evident audit trail
- **Stock count variances on controlled substances** are auto-flagged for pharmacist review (cannot be silently dismissed)
- **Invoice void** creates reversing entries (not deletion) — full audit trail preserved
- **All financial amounts as integers** — eliminates floating-point errors in money calculations
- **PHI rules apply** — patient names in invoices/ledgers are encrypted in Dexie (PHI tables)
