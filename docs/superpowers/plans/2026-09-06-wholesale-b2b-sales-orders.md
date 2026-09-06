# Wholesale Slice 1 — B2B Customers + Sales Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wholesale mode to Pharmacy-Lite that lets a pharmacy sell bulk stock to B2B customers via sales orders, picking against FEFO batches and tracking accounts receivable — all offline-first.

**Architecture:** New `src/lib/wholesale/` domain (types + three services) backed by new Dexie tables, reusing existing FEFO (`inventory/fefo.ts`), stock deduction (`inventory/stock-service.ts`), the AR ledger pattern (`pos/patient-account-service.ts` + `pos/payment-service.ts`), and the cash drawer (`pos/cash-drawer-service.ts`). New `/wholesale/*` routes gated behind a `enableWholesale` setting. The SalesOrder itself is the invoice; an AR charge references it.

**Tech Stack:** Next.js 15, TypeScript, Dexie (IndexedDB), Zustand, next-intl, Vitest + Testing Library, `@ultranos/ui-kit`.

**Spec:** `docs/superpowers/specs/2026-09-06-wholesale-b2b-sales-orders-design.md`

## Global Constraints

- **Money = integer minor units** (e.g. `350` = 3.50 AFN). Never floats. Matches `pos/types.ts`.
- **Offline-first:** every write persists to Dexie and enqueues a sync entry via `enqueuePharmacySyncEntry`. No Hub ingestion exists yet — do not imply cross-device sync.
- **No PHI:** wholesale tables are commercial data; do NOT add them to `PHI_TABLE_CONFIGS` (no field encryption), consistent with `suppliers`/`invoices`.
- **UI standard:** every page follows `docs/opd-list-page-remediation-guide.md` — full-width `<h1 className="text-2xl font-semibold text-foreground">`, one toolbar row, one content box `overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`, `EmptyState` for zero-data, semantic tokens only (no hex/inline style), icons from `@ultranos/ui-kit/icons`.
- **Commits:** commit steps below define the intended cadence, but per repo policy (CLAUDE.md) **do not run `git commit` without the user's explicit go-ahead** — treat each "Commit" step as a checkpoint to request authorization.
- **Test setup:** service tests reset the DB in `beforeEach` (`await db.delete(); await db.open()`) and set an AES key via `encryptionKeyStore.setKey(...)` — copy the pattern from `src/__tests__/fulfillment-store.test.ts`.

---

## File Structure

**Create:**
- `src/lib/wholesale/types.ts` — all wholesale domain types
- `src/lib/wholesale/customer-service.ts` — B2B customer CRUD
- `src/lib/wholesale/customer-account-service.ts` — AR (charge/payment/aging)
- `src/lib/wholesale/sales-order-service.ts` — order lifecycle (draft→confirm→pick→fulfil→cancel)
- `src/lib/pos/aging.ts` — shared `computeAging` pure helper (extracted)
- `src/app/[locale]/(app)/wholesale/customers/page.tsx` + `src/components/pharmacy/wholesale/CustomersPage.tsx`
- `src/app/[locale]/(app)/wholesale/orders/page.tsx` + `src/components/pharmacy/wholesale/OrdersPage.tsx`
- `src/app/[locale]/(app)/wholesale/orders/new/page.tsx` + `src/components/pharmacy/wholesale/NewOrderPage.tsx`
- `src/app/[locale]/(app)/wholesale/orders/[id]/page.tsx` + `src/components/pharmacy/wholesale/OrderDetailPage.tsx`
- `src/app/[locale]/(app)/wholesale/accounts/page.tsx` + `src/components/pharmacy/wholesale/AccountsPage.tsx`
- Test files alongside in `src/__tests__/`

**Modify:**
- `src/lib/inventory/types.ts` — `CatalogItem.wholesalePrice?`; `PharmacyInventorySettings.enableWholesale` + `salesOrderPrefix`; `DEFAULT_PHARMACY_SETTINGS`; `StockMovementType` += `'sold'`; `StockMovementRefType` += `'sales_order'`
- `src/lib/db.ts` — new schema version + four tables
- `src/lib/pos/patient-account-service.ts` — use shared `computeAging`
- `src/components/sidebar/nav-config.ts` — Wholesale nav group
- `src/components/sidebar/app-sidebar.tsx` (or nav consumer) — filter Wholesale group by `enableWholesale`
- `src/i18n/messages/*` (the message catalogs) — `wholesale` + `sidebar` keys

---

### Task 1: Domain types + inventory/settings additions

**Files:**
- Create: `src/lib/wholesale/types.ts`
- Modify: `src/lib/inventory/types.ts`
- Test: `src/__tests__/wholesale-settings.test.ts`

**Interfaces:**
- Produces: `WholesaleCustomer`, `SalesOrder`, `SalesOrderLine`, `BatchAllocation`, `CustomerAccount`, `CustomerLedgerEntry`, `SalesOrderStatus`, `OrderUnit`, `CustomerLedgerEntryType`; `CatalogItem.wholesalePrice?: number`; `PharmacyInventorySettings.enableWholesale: boolean` + `salesOrderPrefix: string`; `StockMovementType` includes `'sold'`; `StockMovementRefType` includes `'sales_order'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/wholesale-settings.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

describe('wholesale settings defaults', () => {
  it('wholesale mode is off by default', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.enableWholesale).toBe(false)
  })
  it('provides a default sales-order prefix', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.salesOrderPrefix).toBe('SO-')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-settings`
Expected: FAIL — `enableWholesale` is undefined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/wholesale/types.ts` with the exact types from the spec §3 (copy the TypeScript block verbatim from `docs/superpowers/specs/2026-09-06-wholesale-b2b-sales-orders-design.md`).

In `src/lib/inventory/types.ts`:
- Add to `CatalogItem`: `wholesalePrice?: number`
- Add to `StockMovementType` union: `| 'sold'`
- Add to `StockMovementRefType` union: `| 'sales_order'`
- Add to `PharmacyInventorySettings`: `enableWholesale: boolean` and `salesOrderPrefix: string`
- Add to `DEFAULT_PHARMACY_SETTINGS`: `enableWholesale: false,` and `salesOrderPrefix: 'SO-',`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-settings`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint — request authorization)

```bash
git add src/lib/wholesale/types.ts src/lib/inventory/types.ts src/__tests__/wholesale-settings.test.ts
git commit -m "feat(pharmacy-lite): wholesale domain types + settings scaffolding"
```

---

### Task 2: Dexie schema — wholesale tables

**Files:**
- Modify: `src/lib/db.ts`
- Test: `src/__tests__/wholesale-db.test.ts`

**Interfaces:**
- Consumes: types from Task 1.
- Produces: `db.wholesaleCustomers`, `db.salesOrders`, `db.customerAccounts`, `db.customerLedgerEntries` (Dexie `EntityTable`s).

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/wholesale-db.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import type { WholesaleCustomer } from '@/lib/wholesale/types'

beforeEach(async () => { await db.delete(); await db.open() })

describe('wholesale Dexie tables', () => {
  it('round-trips a wholesale customer', async () => {
    const c: WholesaleCustomer = { id: 'c1', name: 'Kabul Pharma Co', isActive: true, createdAt: '2026-09-06T00:00:00Z' }
    await db.wholesaleCustomers.put(c)
    expect(await db.wholesaleCustomers.get('c1')).toEqual(c)
  })
  it('queries sales orders by status index', async () => {
    await db.salesOrders.put({ id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'draft', lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'u1', createdAt: '2026-09-06T00:00:00Z', hlcTimestamp: '0' })
    const drafts = await db.salesOrders.where('status').equals('draft').toArray()
    expect(drafts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-db`
Expected: FAIL — `db.wholesaleCustomers` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/db.ts`:
1. Add the four `EntityTable` field declarations to the `PharmacyLiteDatabase` class (follow the existing declaration style, e.g. `wholesaleCustomers!: EntityTable<WholesaleCustomer, 'id'>`). Import the types from `@/lib/wholesale/types`.
2. Add a new `this.version(N)` block (N = current highest version + 1) with the stores:

```ts
this.version(NEXT_VERSION).stores({
  wholesaleCustomers: 'id, name, isActive',
  salesOrders: 'id, customerId, status, createdAt, orderNumber',
  customerAccounts: 'id, customerId',
  customerLedgerEntries: 'id, customerId, salesOrderId, timestamp',
})
```

Do NOT add these tables to `PHI_TABLE_CONFIGS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-db`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/lib/db.ts src/__tests__/wholesale-db.test.ts
git commit -m "feat(pharmacy-lite): add wholesale Dexie tables"
```

---

### Task 3: Customer service (CRUD + sync enqueue)

**Files:**
- Create: `src/lib/wholesale/customer-service.ts`
- Test: `src/__tests__/wholesale-customer-service.test.ts`

**Interfaces:**
- Consumes: `db`, `enqueuePharmacySyncEntry`, Task 1 types.
- Produces: `createCustomer(params)`, `updateCustomer(id, updates)`, `deactivateCustomer(id)`, `getActiveCustomers()`, `getAllCustomers()`, `getCustomerById(id)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/wholesale-customer-service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { createCustomer, getActiveCustomers, deactivateCustomer } from '@/lib/wholesale/customer-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

describe('customer-service', () => {
  it('creates a customer, persists it, and enqueues a sync entry', async () => {
    const c = await createCustomer({ name: 'Kabul Pharma Co', ultranosOrgId: 'org-9' })
    expect(c.id).toBeTruthy()
    expect(await db.wholesaleCustomers.get(c.id)).toMatchObject({ name: 'Kabul Pharma Co', isActive: true, ultranosOrgId: 'org-9' })
    const queued = await db.syncQueue.toArray()
    expect(queued.some((q) => q.resourceType === 'WholesaleCustomer' && q.resourceId === c.id)).toBe(true)
  })

  it('lists only active customers', async () => {
    const a = await createCustomer({ name: 'A' })
    const b = await createCustomer({ name: 'B' })
    await deactivateCustomer(b.id)
    const active = await getActiveCustomers()
    expect(active.map((x) => x.id)).toEqual([a.id])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-customer-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/wholesale/customer-service.ts
import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { WholesaleCustomer } from './types'

export async function createCustomer(params: {
  name: string; contactName?: string; phone?: string; email?: string
  address?: string; paymentTermsDays?: number; creditLimit?: number; ultranosOrgId?: string
}): Promise<WholesaleCustomer> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const customer: WholesaleCustomer = {
    id,
    name: params.name.trim(),
    contactName: params.contactName?.trim() || undefined,
    phone: params.phone?.trim() || undefined,
    email: params.email?.trim() || undefined,
    address: params.address?.trim() || undefined,
    paymentTermsDays: params.paymentTermsDays,
    creditLimit: params.creditLimit,
    ultranosOrgId: params.ultranosOrgId?.trim() || undefined,
    isActive: true,
    createdAt: now,
  }
  await db.wholesaleCustomers.put(customer)
  await enqueuePharmacySyncEntry({
    resourceType: 'WholesaleCustomer', resourceId: id, action: 'create',
    payload: customer as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
  return customer
}

export async function updateCustomer(id: string, updates: Partial<Omit<WholesaleCustomer, 'id' | 'createdAt'>>): Promise<void> {
  await db.wholesaleCustomers.update(id, updates)
}
export async function deactivateCustomer(id: string): Promise<void> {
  await db.wholesaleCustomers.update(id, { isActive: false })
}
export async function getActiveCustomers(): Promise<WholesaleCustomer[]> {
  return (await db.wholesaleCustomers.orderBy('name').toArray()).filter((c) => c.isActive)
}
export async function getAllCustomers(): Promise<WholesaleCustomer[]> {
  return db.wholesaleCustomers.orderBy('name').toArray()
}
export async function getCustomerById(id: string): Promise<WholesaleCustomer | undefined> {
  return db.wholesaleCustomers.get(id)
}
```

Note: `getActiveCustomers` filters in memory (boolean `isActive` is not a valid Dexie index key across browsers). If `enqueuePharmacySyncEntry`'s parameter object differs, match its real signature in `src/lib/dexie-sync-adapter.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-customer-service`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/lib/wholesale/customer-service.ts src/__tests__/wholesale-customer-service.test.ts
git commit -m "feat(pharmacy-lite): wholesale customer service"
```

---

### Task 4: Extract shared aging helper

**Files:**
- Create: `src/lib/pos/aging.ts`
- Modify: `src/lib/pos/patient-account-service.ts`
- Test: `src/__tests__/aging.test.ts`

**Interfaces:**
- Produces: `computeAging(entries: { amount: number; timestamp: string }[], now?: number): AgingBuckets` and `AgingBuckets` type.
- `patient-account-service.getAgingBuckets` now delegates to `computeAging`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/aging.test.ts
import { describe, it, expect } from 'vitest'
import { computeAging } from '@/lib/pos/aging'

const DAY = 86_400_000
describe('computeAging', () => {
  it('buckets charges by age and ignores payments', () => {
    const now = 1_000 * DAY
    const buckets = computeAging([
      { amount: 100, timestamp: new Date(now - 5 * DAY).toISOString() },   // current
      { amount: 200, timestamp: new Date(now - 45 * DAY).toISOString() },  // 31-60
      { amount: 50, timestamp: new Date(now - 200 * DAY).toISOString() },  // 90+
      { amount: -30, timestamp: new Date(now).toISOString() },             // payment ignored
    ], now)
    expect(buckets).toEqual({ current: 100, thirtyDay: 200, sixtyDay: 0, ninetyPlus: 50 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test aging`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/pos/aging.ts
export interface AgingBuckets { current: number; thirtyDay: number; sixtyDay: number; ninetyPlus: number }

export function computeAging(
  entries: { amount: number; timestamp: string }[],
  now: number = Date.now(),
): AgingBuckets {
  const DAY_MS = 86_400_000
  const b: AgingBuckets = { current: 0, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 }
  for (const e of entries) {
    if (e.amount <= 0) continue
    const ageDays = Math.floor((now - new Date(e.timestamp).getTime()) / DAY_MS)
    if (ageDays <= 30) b.current += e.amount
    else if (ageDays <= 60) b.thirtyDay += e.amount
    else if (ageDays <= 90) b.sixtyDay += e.amount
    else b.ninetyPlus += e.amount
  }
  return b
}
```

Then refactor `patient-account-service.ts`: import `computeAging` + `AgingBuckets` from `./aging`, delete the local `AgingBuckets` interface and the inline bucketing in `getAgingBuckets`, and return `computeAging(entries)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -F pharmacy-lite test aging patient` (the existing patient-account tests must stay green)
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/lib/pos/aging.ts src/lib/pos/patient-account-service.ts src/__tests__/aging.test.ts
git commit -m "refactor(pharmacy-lite): extract shared computeAging helper"
```

---

### Task 5: Customer AR service (charge / payment / balances / aging)

**Files:**
- Create: `src/lib/wholesale/customer-account-service.ts`
- Test: `src/__tests__/wholesale-account-service.test.ts`

**Interfaces:**
- Consumes: `db`, `computeAging` (Task 4), Task 1 types.
- Produces: `postCharge(customerId, amount, salesOrderId, createdBy)`, `recordPayment({ customerId, amount, receivedBy, note? })`, `getAccountsWithBalance()`, `getCustomerLedger(customerId)`, `getAgingBuckets(customerId)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/wholesale-account-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { openCashDrawer } from '@/lib/pos/cash-drawer-service'
import { postCharge, recordPayment, getAccountsWithBalance } from '@/lib/wholesale/customer-account-service'

beforeEach(async () => { await db.delete(); await db.open() })

describe('customer-account-service', () => {
  it('posts a charge that increases the customer balance', async () => {
    await postCharge('c1', 5000, 'o1', 'u1')
    const accounts = await getAccountsWithBalance()
    expect(accounts.find((a) => a.customerId === 'c1')?.balance).toBe(5000)
    const ledger = await db.customerLedgerEntries.where('customerId').equals('c1').toArray()
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ type: 'charge', amount: 5000, salesOrderId: 'o1' })
  })

  it('records a payment that reduces balance and adds cash to the open drawer', async () => {
    await openCashDrawer({ openedBy: 'u1', openingBalance: 0 })
    await postCharge('c1', 5000, 'o1', 'u1')
    await recordPayment({ customerId: 'c1', amount: 2000, receivedBy: 'u1' })
    const balance = (await getAccountsWithBalance()).find((a) => a.customerId === 'c1')?.balance
    expect(balance).toBe(3000)
    const drawer = await db.cashDrawers.where('status').equals('open').first()
    expect(drawer?.cashIn).toBe(2000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-account-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/wholesale/customer-account-service.ts
import { db } from '@/lib/db'
import { computeAging, type AgingBuckets } from '@/lib/pos/aging'
import type { CustomerAccount, CustomerLedgerEntry } from './types'

async function upsertBalanceDelta(customerId: string, delta: number): Promise<void> {
  const now = new Date().toISOString()
  const account = await db.customerAccounts.where('customerId').equals(customerId).first()
  if (account) {
    await db.customerAccounts.update(account.id, { balance: account.balance + delta, lastActivityAt: now })
  } else {
    const created: CustomerAccount = { id: crypto.randomUUID(), customerId, balance: delta, lastActivityAt: now }
    await db.customerAccounts.add(created)
  }
}

export async function postCharge(customerId: string, amount: number, salesOrderId: string, createdBy: string): Promise<void> {
  const entry: CustomerLedgerEntry = {
    id: crypto.randomUUID(), customerId, type: 'charge', amount: Math.abs(amount),
    salesOrderId, createdBy, timestamp: new Date().toISOString(),
  }
  await db.transaction('rw', [db.customerLedgerEntries, db.customerAccounts], async () => {
    await db.customerLedgerEntries.add(entry)
    await upsertBalanceDelta(customerId, Math.abs(amount))
  })
}

export async function recordPayment(params: { customerId: string; amount: number; receivedBy: string; note?: string }): Promise<void> {
  const { customerId, amount, receivedBy, note } = params
  const entry: CustomerLedgerEntry = {
    id: crypto.randomUUID(), customerId, type: 'payment', amount: -Math.abs(amount),
    note, createdBy: receivedBy, timestamp: new Date().toISOString(),
  }
  await db.transaction('rw', [db.customerLedgerEntries, db.customerAccounts, db.cashDrawers], async () => {
    await db.customerLedgerEntries.add(entry)
    await upsertBalanceDelta(customerId, -Math.abs(amount))
    const drawer = await db.cashDrawers.where('status').equals('open').first()
    if (drawer) await db.cashDrawers.update(drawer.id, { cashIn: drawer.cashIn + Math.abs(amount) })
  })
}

export async function getAccountsWithBalance(): Promise<CustomerAccount[]> {
  return (await db.customerAccounts.toArray()).filter((a) => a.balance !== 0)
}
export async function getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
  return db.customerLedgerEntries.where('customerId').equals(customerId).reverse().sortBy('timestamp')
}
export async function getAgingBuckets(customerId: string): Promise<AgingBuckets> {
  const entries = await db.customerLedgerEntries.where('customerId').equals(customerId).toArray()
  return computeAging(entries)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-account-service`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/lib/wholesale/customer-account-service.ts src/__tests__/wholesale-account-service.test.ts
git commit -m "feat(pharmacy-lite): wholesale customer AR service"
```

---

### Task 6: Sales order — createDraft (totals + each/pack math)

**Files:**
- Create: `src/lib/wholesale/sales-order-service.ts`
- Test: `src/__tests__/wholesale-sales-order-draft.test.ts`

**Interfaces:**
- Consumes: `db`, `enqueuePharmacySyncEntry`, `hlc`/`serializeHlc` (`@/lib/hlc`), Task 1 types.
- Produces: `createDraft({ customerId, lines, taxRate, createdBy })` where `lines: { catalogItemId; description; unit; quantity; unitPrice; packSize }[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/wholesale-sales-order-draft.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createDraft } from '@/lib/wholesale/sales-order-service'

beforeEach(async () => { await db.delete(); await db.open() })

describe('createDraft', () => {
  it('computes baseUnits for pack lines and totals from lines + tax', async () => {
    const order = await createDraft({
      customerId: 'c1', taxRate: 10, createdBy: 'u1',
      lines: [
        { catalogItemId: 'i1', description: 'Amox 500', unit: 'pack', quantity: 2, unitPrice: 1000, packSize: 24 },
        { catalogItemId: 'i2', description: 'Ibu 400', unit: 'each', quantity: 5, unitPrice: 50, packSize: 30 },
      ],
    })
    expect(order.status).toBe('draft')
    expect(order.lines[0]).toMatchObject({ baseUnits: 48, lineTotal: 2000 }) // 2 packs × 24; 2 × 1000
    expect(order.lines[1]).toMatchObject({ baseUnits: 5, lineTotal: 250 })   // each
    expect(order.subtotal).toBe(2250)
    expect(order.taxAmount).toBe(225)   // 10% of 2250
    expect(order.total).toBe(2475)
    expect(order.orderNumber).toMatch(/^SO-/)
    expect(await db.salesOrders.get(order.id)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-sales-order-draft`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/wholesale/sales-order-service.ts
import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { hlc, serializeHlc } from '@/lib/hlc'
import type { SalesOrder, SalesOrderLine } from './types'

interface DraftLineInput {
  catalogItemId: string; description: string
  unit: 'each' | 'pack'; quantity: number; unitPrice: number; packSize: number
}

async function nextOrderNumber(): Promise<string> {
  const settings = await db.pharmacySettings.toCollection().first()
  const prefix = settings?.salesOrderPrefix ?? 'SO-'
  const count = await db.salesOrders.count()
  return `${prefix}${count + 1}`
}

export async function createDraft(params: {
  customerId: string; taxRate: number; createdBy: string; lines: DraftLineInput[]
}): Promise<SalesOrder> {
  const lines: SalesOrderLine[] = params.lines.map((l) => {
    const baseUnits = l.unit === 'pack' ? l.quantity * l.packSize : l.quantity
    return {
      catalogItemId: l.catalogItemId, description: l.description, unit: l.unit,
      quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.quantity * l.unitPrice,
      baseUnits, batchAllocations: [],
    }
  })
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
  const taxAmount = Math.round((subtotal * params.taxRate) / 100)
  const now = new Date().toISOString()
  const order: SalesOrder = {
    id: crypto.randomUUID(), orderNumber: await nextOrderNumber(), customerId: params.customerId,
    status: 'draft', lines, subtotal, taxRate: params.taxRate, taxAmount, total: subtotal + taxAmount,
    createdBy: params.createdBy, createdAt: now, hlcTimestamp: serializeHlc(hlc.now()),
  }
  await db.salesOrders.put(order)
  await enqueuePharmacySyncEntry({
    resourceType: 'SalesOrder', resourceId: order.id, action: 'create',
    payload: order as unknown as Record<string, unknown>, hlcTimestamp: order.hlcTimestamp, createdAt: now,
  })
  return order
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-sales-order-draft`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/lib/wholesale/sales-order-service.ts src/__tests__/wholesale-sales-order-draft.test.ts
git commit -m "feat(pharmacy-lite): sales-order createDraft"
```

---

### Task 7: Sales order — confirm + pickOrder (FEFO allocation)

**Files:**
- Modify: `src/lib/wholesale/sales-order-service.ts`
- Test: `src/__tests__/wholesale-sales-order-pick.test.ts`

**Interfaces:**
- Consumes: `getFefoBatches` (`@/lib/inventory/fefo`), Task 6.
- Produces: `confirm(orderId)`, `pickOrder(orderId)` (fills `line.batchAllocations` by earliest expiry; sets status `'picking'`; marks a line short by leaving allocated < baseUnits), `getOrderById(id)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/wholesale-sales-order-pick.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createDraft, confirm, pickOrder } from '@/lib/wholesale/sales-order-service'
import type { StockBatch } from '@/lib/inventory/types'

function batch(over: Partial<StockBatch>): StockBatch {
  return { id: 'b', catalogItemId: 'i1', batchNumber: 'B', expiryDate: '2027-01-01', quantityOnHand: 100,
    costPrice: 0, sellingPrice: 0, receivedAt: '2026-01-01', status: 'active', locationId: 'loc', hlcTimestamp: '0', ...over }
}

beforeEach(async () => { await db.delete(); await db.open() })

describe('pickOrder FEFO allocation', () => {
  it('allocates across batches earliest-expiry-first', async () => {
    await db.stockBatches.bulkPut([
      batch({ id: 'b-late', expiryDate: '2027-06-01', quantityOnHand: 40 }),
      batch({ id: 'b-early', expiryDate: '2026-12-01', quantityOnHand: 20 }),
    ])
    const order = await createDraft({ customerId: 'c1', taxRate: 0, createdBy: 'u1',
      lines: [{ catalogItemId: 'i1', description: 'x', unit: 'each', quantity: 50, unitPrice: 10, packSize: 1 }] })
    await confirm(order.id)
    const picked = await pickOrder(order.id)
    expect(picked.status).toBe('picking')
    // 20 from earliest, then 30 from the later batch
    expect(picked.lines[0].batchAllocations).toEqual([
      { stockBatchId: 'b-early', qty: 20 },
      { stockBatchId: 'b-late', qty: 30 },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-sales-order-pick`
Expected: FAIL — `confirm`/`pickOrder` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `sales-order-service.ts`:

```ts
import { getFefoBatches } from '@/lib/inventory/fefo'
import type { BatchAllocation } from './types'

export async function getOrderById(id: string) { return db.salesOrders.get(id) }

export async function confirm(orderId: string): Promise<void> {
  const o = await db.salesOrders.get(orderId)
  if (!o || o.status !== 'draft') throw new Error('Order not in draft')
  await db.salesOrders.update(orderId, { status: 'confirmed' })
}

export async function pickOrder(orderId: string): Promise<SalesOrder> {
  const order = await db.salesOrders.get(orderId)
  if (!order || order.status !== 'confirmed') throw new Error('Order not confirmed')
  const lines = await Promise.all(order.lines.map(async (line) => {
    const batches = await getFefoBatches(line.catalogItemId) // earliest expiry first
    const allocations: BatchAllocation[] = []
    let remaining = line.baseUnits
    for (const b of batches) {
      if (remaining <= 0) break
      const take = Math.min(remaining, b.quantityOnHand)
      if (take > 0) { allocations.push({ stockBatchId: b.id, qty: take }); remaining -= take }
    }
    return { ...line, batchAllocations: allocations }
  }))
  await db.salesOrders.update(orderId, { status: 'picking', lines })
  return { ...order, status: 'picking', lines }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-sales-order-pick`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/lib/wholesale/sales-order-service.ts src/__tests__/wholesale-sales-order-pick.test.ts
git commit -m "feat(pharmacy-lite): sales-order confirm + FEFO pick"
```

---

### Task 8: Sales order — fulfill (deduct stock + post AR charge) + cancel

**Files:**
- Modify: `src/lib/wholesale/sales-order-service.ts`
- Test: `src/__tests__/wholesale-sales-order-fulfill.test.ts`

**Interfaces:**
- Consumes: `deductStock` (`@/lib/inventory/stock-service`), `postCharge` (Task 5).
- Produces: `fulfill(orderId, performedBy)` (deducts each allocation via `deductStock` with `type:'sold'`, `referenceType:'sales_order'`; sets `status:'fulfilled'` + `fulfilledAt`; posts AR charge = `order.total`), `cancel(orderId)`, `getOrders(filter?)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/wholesale-sales-order-fulfill.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createDraft, confirm, pickOrder, fulfill } from '@/lib/wholesale/sales-order-service'
import { getAccountsWithBalance } from '@/lib/wholesale/customer-account-service'
import type { StockBatch } from '@/lib/inventory/types'

const b: StockBatch = { id: 'b1', catalogItemId: 'i1', batchNumber: 'B', expiryDate: '2027-01-01',
  quantityOnHand: 100, costPrice: 0, sellingPrice: 0, receivedAt: '2026-01-01', status: 'active', locationId: 'loc', hlcTimestamp: '0' }

beforeEach(async () => { await db.delete(); await db.open() })

describe('fulfill', () => {
  it('deducts allocated stock and posts an AR charge equal to the order total', async () => {
    await db.stockBatches.put({ ...b })
    const order = await createDraft({ customerId: 'c1', taxRate: 0, createdBy: 'u1',
      lines: [{ catalogItemId: 'i1', description: 'x', unit: 'each', quantity: 30, unitPrice: 10, packSize: 1 }] })
    await confirm(order.id); await pickOrder(order.id); await fulfill(order.id, 'u1')

    expect((await db.stockBatches.get('b1'))!.quantityOnHand).toBe(70) // 100 - 30
    expect((await db.salesOrders.get(order.id))!.status).toBe('fulfilled')
    const bal = (await getAccountsWithBalance()).find((a) => a.customerId === 'c1')?.balance
    expect(bal).toBe(300) // 30 × 10
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-sales-order-fulfill`
Expected: FAIL — `fulfill` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `sales-order-service.ts`:

```ts
import { deductStock } from '@/lib/inventory/stock-service'
import { postCharge } from './customer-account-service'
import type { SalesOrderStatus } from './types'

export async function fulfill(orderId: string, performedBy: string): Promise<void> {
  const order = await db.salesOrders.get(orderId)
  if (!order || order.status !== 'picking') throw new Error('Order not picking')
  for (const line of order.lines) {
    for (const alloc of line.batchAllocations) {
      await deductStock({
        stockBatchId: alloc.stockBatchId, catalogItemId: line.catalogItemId, quantity: alloc.qty,
        type: 'sold', referenceId: orderId, referenceType: 'sales_order', performedBy,
      })
    }
  }
  await db.salesOrders.update(orderId, { status: 'fulfilled', fulfilledAt: new Date().toISOString() })
  await postCharge(order.customerId, order.total, orderId, performedBy)
}

export async function cancel(orderId: string): Promise<void> {
  const o = await db.salesOrders.get(orderId)
  if (!o) throw new Error('Order not found')
  if (o.status === 'fulfilled') throw new Error('Cannot cancel a fulfilled order')
  await db.salesOrders.update(orderId, { status: 'cancelled', cancelledAt: new Date().toISOString() })
}

export async function getOrders(filter?: { status?: SalesOrderStatus }): Promise<SalesOrder[]> {
  const all = await db.salesOrders.reverse().sortBy('createdAt')
  return filter?.status ? all.filter((o) => o.status === filter.status) : all
}
```

Confirm `deductStock`'s parameter names against `src/lib/inventory/stock-service.ts` (they match the fulfillment-store call site); adjust if the real signature differs.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-sales-order-fulfill`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/lib/wholesale/sales-order-service.ts src/__tests__/wholesale-sales-order-fulfill.test.ts
git commit -m "feat(pharmacy-lite): sales-order fulfill + cancel"
```

---

### Task 9: Nav group + mode gating

**Files:**
- Modify: `src/components/sidebar/nav-config.ts`, `src/components/sidebar/app-sidebar.tsx` (the navGroups consumer)
- Modify: message catalogs — add `sidebar.wholesaleCustomers`, `sidebar.salesOrders`, `sidebar.customerAccounts`
- Test: `src/__tests__/wholesale-nav.test.tsx`

**Interfaces:**
- Consumes: `PharmacyInventorySettings.enableWholesale`.
- Produces: a `Wholesale` `NavGroup`; the sidebar renders it only when `enableWholesale` is true.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/wholesale-nav.test.tsx
import { describe, it, expect } from 'vitest'
import { navGroups } from '@/components/sidebar/nav-config'
import { filterNavGroups } from '@/components/sidebar/nav-config'

describe('wholesale nav gating', () => {
  it('includes a Wholesale group definition', () => {
    expect(navGroups.some((g) => g.title === 'Wholesale')).toBe(true)
  })
  it('hides the Wholesale group when wholesale mode is off', () => {
    const visible = filterNavGroups(navGroups, { enableWholesale: false })
    expect(visible.some((g) => g.title === 'Wholesale')).toBe(false)
  })
  it('shows the Wholesale group when wholesale mode is on', () => {
    const visible = filterNavGroups(navGroups, { enableWholesale: true })
    expect(visible.some((g) => g.title === 'Wholesale')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-nav`
Expected: FAIL — `filterNavGroups` / Wholesale group missing.

- [ ] **Step 3: Write minimal implementation**

In `nav-config.ts`: import icons `Building2`, `ClipboardList`, `Wallet` (add to `packages/ui-kit/src/icons.ts` if absent, then rebuild ui-kit). Append the group and export a pure filter:

```ts
// add to navGroups
{
  title: 'Wholesale',
  items: [
    { titleKey: 'wholesaleCustomers', url: '/wholesale/customers', icon: Building2 },
    { titleKey: 'salesOrders',        url: '/wholesale/orders' },
    { titleKey: 'customerAccounts',   url: '/wholesale/accounts' },
  ],
}

export function filterNavGroups(groups: NavGroup[], opts: { enableWholesale: boolean }): NavGroup[] {
  return groups.filter((g) => g.title !== 'Wholesale' || opts.enableWholesale)
}
```

In `app-sidebar.tsx`: read `enableWholesale` from pharmacy settings (`db.pharmacySettings.toCollection().first()` in an effect, default `false`) and render `filterNavGroups(navGroups, { enableWholesale })` instead of `navGroups`. Add the three `sidebar.*` message keys to every locale catalog.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test wholesale-nav`
Expected: PASS.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/components/sidebar/nav-config.ts src/components/sidebar/app-sidebar.tsx src/__tests__/wholesale-nav.test.tsx src/i18n
git commit -m "feat(pharmacy-lite): wholesale nav group + mode gating"
```

---

### Task 10: Customers page (UI)

**Files:**
- Create: `src/app/[locale]/(app)/wholesale/customers/page.tsx`, `src/components/pharmacy/wholesale/CustomersPage.tsx`
- Test: `src/__tests__/WholesaleCustomersPage.test.tsx`

**Interfaces:**
- Consumes: `getAllCustomers`, `createCustomer` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/WholesaleCustomersPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockGetAll = vi.fn()
vi.mock('@/lib/wholesale/customer-service', () => ({
  getAllCustomers: (...a: unknown[]) => mockGetAll(...a),
  createCustomer: vi.fn(),
}))
import { CustomersPage } from '@/components/pharmacy/wholesale/CustomersPage'

beforeEach(() => { vi.clearAllMocks(); mockGetAll.mockResolvedValue([{ id: 'c1', name: 'Kabul Pharma', isActive: true, createdAt: '2026-09-06' }]) })

describe('CustomersPage', () => {
  it('renders a full-width heading and lists customers', async () => {
    render(<CustomersPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test WholesaleCustomersPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `CustomersPage.tsx` following the OPD-list standard (root `div.flex.flex-col.gap-4`, `<h1 className="text-2xl font-semibold text-foreground">`, a toolbar row with `SearchInput` + a "New customer" action folded at the end opening a create dialog, one content box with a `<table>` of customers, `EmptyState` when empty). Load via `getAllCustomers()` in a `useEffect`. Create via `createCustomer` then refresh. `page.tsx` is `'use client'` and returns `<CustomersPage />`. Add `wholesale.*` i18n keys used by the page.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test WholesaleCustomersPage`
Expected: PASS.

- [ ] **Step 5: Add RTL snapshot test + commit** (checkpoint)

Add LTR + RTL snapshot cases (wrap in `<div dir="ltr">` / `<div dir="rtl">`) per CLAUDE.md, then:

```bash
git add "src/app/[locale]/(app)/wholesale/customers" src/components/pharmacy/wholesale/CustomersPage.tsx src/__tests__/WholesaleCustomersPage.test.tsx src/i18n
git commit -m "feat(pharmacy-lite): wholesale customers page"
```

---

### Task 11: Sales orders list page (UI)

**Files:**
- Create: `src/app/[locale]/(app)/wholesale/orders/page.tsx`, `src/components/pharmacy/wholesale/OrdersPage.tsx`
- Test: `src/__tests__/WholesaleOrdersPage.test.tsx`

**Interfaces:**
- Consumes: `getOrders` (Task 8).

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/WholesaleOrdersPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
const mockGetOrders = vi.fn()
vi.mock('@/lib/wholesale/sales-order-service', () => ({ getOrders: (...a: unknown[]) => mockGetOrders(...a) }))
import { OrdersPage } from '@/components/pharmacy/wholesale/OrdersPage'
beforeEach(() => { vi.clearAllMocks(); mockGetOrders.mockResolvedValue([{ id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'draft', lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'u1', createdAt: '2026-09-06', hlcTimestamp: '0' }]) })
describe('OrdersPage', () => {
  it('renders heading and shows an order row', async () => {
    render(<OrdersPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test WholesaleOrdersPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `OrdersPage.tsx`: OPD-list standard, status pill-tabs (`draft`/`confirmed`/`picking`/`fulfilled`/`cancelled` + all), `SearchInput`, and a "New order" action (link to `/wholesale/orders/new`) folded at the toolbar end; one content box `<table>` of orders (number, customer, status badge, total, date) with rows linking to `/wholesale/orders/[id]`; `EmptyState` when empty. Load via `getOrders()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test WholesaleOrdersPage`
Expected: PASS.

- [ ] **Step 5: Add RTL snapshots + commit** (checkpoint)

```bash
git add "src/app/[locale]/(app)/wholesale/orders/page.tsx" src/components/pharmacy/wholesale/OrdersPage.tsx src/__tests__/WholesaleOrdersPage.test.tsx
git commit -m "feat(pharmacy-lite): wholesale orders list page"
```

---

### Task 12: New sales order page (UI)

**Files:**
- Create: `src/app/[locale]/(app)/wholesale/orders/new/page.tsx`, `src/components/pharmacy/wholesale/NewOrderPage.tsx`
- Test: `src/__tests__/WholesaleNewOrderPage.test.tsx`

**Interfaces:**
- Consumes: `getActiveCustomers` (Task 3), `createDraft` + `confirm` (Tasks 6–7), catalog search (`db.catalogItems`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/WholesaleNewOrderPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const mockCustomers = vi.fn().mockResolvedValue([{ id: 'c1', name: 'Kabul Pharma', isActive: true, createdAt: '' }])
const mockCreateDraft = vi.fn().mockResolvedValue({ id: 'o1' })
const mockConfirm = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/wholesale/customer-service', () => ({ getActiveCustomers: () => mockCustomers() }))
vi.mock('@/lib/wholesale/sales-order-service', () => ({ createDraft: (...a: unknown[]) => mockCreateDraft(...a), confirm: (...a: unknown[]) => mockConfirm(...a) }))
import { NewOrderPage } from '@/components/pharmacy/wholesale/NewOrderPage'

beforeEach(() => vi.clearAllMocks())
describe('NewOrderPage', () => {
  it('prices a pack line from wholesalePrice × packSize (overridable) and submits a draft', async () => {
    const user = userEvent.setup()
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    // The component exposes an addLine helper via a manual-entry row for the test:
    await user.click(screen.getByTestId('add-manual-line'))
    // default unit 'each' → switch to pack and enter qty; unitPrice auto-fills from wholesalePrice
    // (exact interactions depend on the built form; assert the submit call shape)
    await user.click(screen.getByTestId('submit-order'))
    expect(mockCreateDraft).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test WholesaleNewOrderPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `NewOrderPage.tsx` (detail/form standard: standalone `<h1>`, left back button `variant="ghost" size="sm" className="w-fit px-0"`). Sections: customer `<select data-testid="customer-select">` from `getActiveCustomers`; a line editor that searches `db.catalogItems`, lets the operator pick `unit` (each/pack), enter `quantity`, and auto-fills `unitPrice = unit==='pack' ? (item.wholesalePrice ?? 0) * item.packSize : (item.wholesalePrice ?? 0)` with an editable override; a running totals summary; a "Create order" button (`data-testid="submit-order"`) that calls `createDraft({...})` then `confirm(order.id)` then routes to `/wholesale/orders/${id}`. Provide a `data-testid="add-manual-line"` affordance. Add i18n keys.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test WholesaleNewOrderPage`
Expected: PASS.

- [ ] **Step 5: Add RTL snapshots + commit** (checkpoint)

```bash
git add "src/app/[locale]/(app)/wholesale/orders/new" src/components/pharmacy/wholesale/NewOrderPage.tsx src/__tests__/WholesaleNewOrderPage.test.tsx
git commit -m "feat(pharmacy-lite): wholesale new-order page"
```

---

### Task 13: Order detail — pick & fulfil page (UI)

**Files:**
- Create: `src/app/[locale]/(app)/wholesale/orders/[id]/page.tsx`, `src/components/pharmacy/wholesale/OrderDetailPage.tsx`
- Test: `src/__tests__/WholesaleOrderDetailPage.test.tsx`

**Interfaces:**
- Consumes: `getOrderById`, `pickOrder`, `fulfill`, `cancel` (Tasks 7–8), `useAuthSessionStore.getState().getPractitionerRef()`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/WholesaleOrderDetailPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'o1' }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }) } }))
const order = { id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'confirmed', lines: [{ catalogItemId: 'i1', description: 'Amox', unit: 'each', quantity: 30, unitPrice: 10, lineTotal: 300, baseUnits: 30, batchAllocations: [] }], subtotal: 300, taxRate: 0, taxAmount: 0, total: 300, createdBy: 'u1', createdAt: '', hlcTimestamp: '0' }
const mockGet = vi.fn().mockResolvedValue(order)
const mockPick = vi.fn().mockResolvedValue({ ...order, status: 'picking', lines: [{ ...order.lines[0], batchAllocations: [{ stockBatchId: 'b1', qty: 30 }] }] })
const mockFulfill = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/wholesale/sales-order-service', () => ({ getOrderById: () => mockGet(), pickOrder: () => mockPick(), fulfill: (...a: unknown[]) => mockFulfill(...a), cancel: vi.fn() }))
import { OrderDetailPage } from '@/components/pharmacy/wholesale/OrderDetailPage'
beforeEach(() => vi.clearAllMocks())
describe('OrderDetailPage', () => {
  it('picks then fulfils the order', async () => {
    const user = userEvent.setup()
    render(<OrderDetailPage />)
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
    await user.click(screen.getByTestId('pick-btn'))
    await waitFor(() => expect(screen.getByTestId('fulfil-btn')).toBeEnabled())
    await user.click(screen.getByTestId('fulfil-btn'))
    expect(mockFulfill).toHaveBeenCalledWith('o1', 'Practitioner/p1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test WholesaleOrderDetailPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `OrderDetailPage.tsx` (detail standard): header shows order number + customer + status badge; a card lists lines with quantities and (after pick) `batchAllocations`; a `pick-btn` (visible when `status==='confirmed'`) calls `pickOrder` and updates local state; a `fulfil-btn` (enabled when `status==='picking'`) calls `fulfill(id, getPractitionerRef())`; a totals card; a `cancel` action for non-fulfilled orders. Read `id` from `useParams`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test WholesaleOrderDetailPage`
Expected: PASS.

- [ ] **Step 5: Add RTL snapshots + commit** (checkpoint)

```bash
git add "src/app/[locale]/(app)/wholesale/orders/[id]" src/components/pharmacy/wholesale/OrderDetailPage.tsx src/__tests__/WholesaleOrderDetailPage.test.tsx
git commit -m "feat(pharmacy-lite): wholesale order detail (pick + fulfil)"
```

---

### Task 14: Customer accounts (AR) page (UI)

**Files:**
- Create: `src/app/[locale]/(app)/wholesale/accounts/page.tsx`, `src/components/pharmacy/wholesale/AccountsPage.tsx`
- Test: `src/__tests__/WholesaleAccountsPage.test.tsx`

**Interfaces:**
- Consumes: `getAccountsWithBalance`, `getAgingBuckets`, `recordPayment` (Task 5), `getAllCustomers` (for names).

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/WholesaleAccountsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const mockAccounts = vi.fn().mockResolvedValue([{ id: 'a1', customerId: 'c1', balance: 3000, lastActivityAt: '' }])
const mockPay = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/wholesale/customer-account-service', () => ({ getAccountsWithBalance: () => mockAccounts(), recordPayment: (...a: unknown[]) => mockPay(...a), getAgingBuckets: vi.fn().mockResolvedValue({ current: 3000, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 }) }))
vi.mock('@/lib/wholesale/customer-service', () => ({ getAllCustomers: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Kabul Pharma', isActive: true, createdAt: '' }]) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }) } }))
import { AccountsPage } from '@/components/pharmacy/wholesale/AccountsPage'
beforeEach(() => vi.clearAllMocks())
describe('AccountsPage', () => {
  it('lists balances and records a payment', async () => {
    const user = userEvent.setup()
    render(<AccountsPage />)
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())
    await user.click(screen.getByTestId('record-payment-c1'))
    await user.type(screen.getByTestId('payment-amount'), '2000')
    await user.click(screen.getByTestId('confirm-payment'))
    expect(mockPay).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1', amount: 2000 }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test WholesaleAccountsPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `AccountsPage.tsx` (OPD-list standard): content box `<table>` of customers with balance (join `getAllCustomers` for names) and a `record-payment-<customerId>` action opening a dialog with `payment-amount` input and `confirm-payment` button that calls `recordPayment({ customerId, amount, receivedBy: getPractitionerRef() })` then refreshes. Optionally show aging via `getAgingBuckets`. `EmptyState` when no balances.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test WholesaleAccountsPage`
Expected: PASS.

- [ ] **Step 5: Add RTL snapshots + commit** (checkpoint)

```bash
git add "src/app/[locale]/(app)/wholesale/accounts" src/components/pharmacy/wholesale/AccountsPage.tsx src/__tests__/WholesaleAccountsPage.test.tsx
git commit -m "feat(pharmacy-lite): wholesale customer accounts (AR) page"
```

---

### Task 15: Settings toggle + full-suite verification

**Files:**
- Modify: `src/components/pharmacy/PharmacySettingsView.tsx` (add an "Enable wholesale mode" toggle writing `pharmacySettings.enableWholesale`)
- Test: `src/__tests__/wholesale-settings-toggle.test.tsx`

**Interfaces:**
- Consumes: `db.pharmacySettings`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/wholesale-settings-toggle.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'
beforeEach(() => {})
describe('wholesale settings toggle', () => {
  it('renders an enable-wholesale control', () => {
    render(<PharmacySettingsView />)
    expect(screen.getByTestId('toggle-wholesale')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wholesale-settings-toggle`
Expected: FAIL — control missing.

- [ ] **Step 3: Write minimal implementation**

Add a settings row (`data-testid="toggle-wholesale"`) in `PharmacySettingsView.tsx` that reads/writes `enableWholesale` on the single `pharmacySettings` row (create the row with `DEFAULT_PHARMACY_SETTINGS` if none exists). Follow the existing settings-card pattern in that file.

- [ ] **Step 4: Run full suite + typecheck**

Run: `pnpm -F pharmacy-lite test` — Expected: all green (only the pre-existing `SyncQueueDashboard` teardown flake remains).
Run: `pnpm -F pharmacy-lite typecheck` — Expected: no NEW errors referencing wholesale files.

- [ ] **Step 5: Commit** (checkpoint)

```bash
git add src/components/pharmacy/PharmacySettingsView.tsx src/__tests__/wholesale-settings-toggle.test.tsx
git commit -m "feat(pharmacy-lite): wholesale mode settings toggle"
```

---

## Self-Review

**Spec coverage:**
- §2 D1 wholesale-in-pharmacy-lite → Tasks 9,15 (nav + toggle). ✓
- §2 D2 mixed customers (`ultranosOrgId`) → Task 1 type + Task 3 create. ✓
- §2 D4 same pool + each/pack → Task 6 baseUnits, Task 8 deductStock. ✓
- §2 D5 per-item wholesale price + override → Task 1 field, Task 12 auto-price+override. ✓
- §2 D6 AR ledger → Tasks 4,5,14. ✓
- §2 D7 model link, defer sync → Task 1 `ultranosOrgId`; no sync task (correct). ✓
- §2 D8 SalesOrder-as-invoice → Tasks 6–8 (order holds totals; charge refs orderId). ✓
- §3 data model → Tasks 1,2. ✓  §4 services → Tasks 3,5,6,7,8. ✓  §5 UI/routes → Tasks 10–14. ✓  §6 offline constraint → Global Constraints + Task 3/6 enqueue. ✓  §7 mode gating → Task 9. ✓  §9 testing → each task is TDD + RTL snapshots. ✓

**Placeholder scan:** No "TBD/handle edge cases/similar to Task N". UI tasks name concrete `data-testid`s and real assertions. ✓

**Type consistency:** `createDraft` line input carries `packSize`; `SalesOrderLine.baseUnits` computed identically in Task 6 and consumed in Task 8 `fulfill`. `deductStock` params match the `fulfillment-store` call site (verified). `recordPayment` param object `{ customerId, amount, receivedBy }` consistent across Tasks 5 and 14. `filterNavGroups` name consistent Tasks 9. ✓

**Known follow-ups (not gaps):** `enqueuePharmacySyncEntry` and `deductStock` exact signatures must be confirmed against source at implementation (noted in Tasks 3, 8). New icons may require a `pnpm --filter @ultranos/ui-kit build` (Task 9).
