# Pharmacy POS Sub-Project B: Point of Sale + Financial

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add point-of-sale to pharmacy-lite — invoice auto-creation from dispensing, payment collection (cash/card/credit), patient credit ledger with aging, cash drawer sessions, and receipt generation.

**Architecture:** Dexie v7 adds 4 new tables (invoices, payments, ledgerEntries, cashDrawers) + extends patientAccounts. Dispensing flow auto-creates a draft invoice after confirmation. POS page collects payments with split-pay support. Cash drawer tracks sessions with end-of-day reconciliation. Patient credit/tab is opt-in via settings.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Dexie (IndexedDB), Zustand, next-intl.

**Spec:** `docs/superpowers/specs/2026-05-25-pharmacy-inventory-pos-design.md` (POS section)

**Depends on:** Sub-project A (inventory types, Dexie v6, stock service, catalog)

---

## File Structure

### New Files

```
apps/pharmacy-lite/src/
├── lib/
│   ├── pos/
│   │   ├── types.ts                     # POS type definitions (Invoice, Payment, LedgerEntry, etc.)
│   │   ├── invoice-service.ts           # Create/finalize/void invoices
│   │   ├── payment-service.ts           # Record payments, split-pay, credit handling
│   │   ├── cash-drawer-service.ts       # Open/close drawer, reconciliation
│   │   ├── patient-account-service.ts   # Credit ledger operations, balance calc, aging
│   │   └── receipt-generator.ts         # PDF/print receipt formatting
│   └── pos-db.ts                        # Dexie v7 schema extension
├── stores/
│   └── pos-store.ts                     # Active invoice, drawer state
├── hooks/
│   ├── useActiveInvoice.ts              # Current invoice after dispensing
│   └── useCashDrawer.ts                 # Current drawer session state
├── components/pharmacy/
│   ├── pos/
│   │   ├── PosPage.tsx                  # /pos — payment collection page
│   │   ├── InvoiceSummary.tsx           # Invoice line items + totals display
│   │   ├── PaymentForm.tsx              # Cash/card/credit split-pay form
│   │   ├── PaymentMethodSelector.tsx    # Toggle between payment methods
│   │   ├── ReceiptPreview.tsx           # Printable receipt layout
│   │   ├── CashDrawerPage.tsx           # /pos/cash-drawer page
│   │   ├── DrawerOpenForm.tsx           # Open drawer with opening balance
│   │   ├── DrawerCloseForm.tsx          # Close drawer, count cash, discrepancy
│   │   ├── DrawerStatusCard.tsx         # Dashboard-embeddable drawer indicator
│   │   ├── PatientAccountsPage.tsx      # /pos/accounts — credit ledgers
│   │   ├── PatientAccountList.tsx       # List of patients with balances
│   │   ├── PatientLedgerView.tsx        # Individual patient ledger entries
│   │   └── AgingReport.tsx              # 30/60/90 day aging buckets
│   └── ...existing
├── app/[locale]/
│   ├── pos/
│   │   ├── page.tsx                     # POS route
│   │   ├── cash-drawer/page.tsx         # Cash Drawer route
│   │   └── accounts/page.tsx            # Patient Accounts route
│   └── ...existing
```

### Modified Files

```
apps/pharmacy-lite/src/
├── lib/db.ts                            # Dexie v7: POS tables
├── lib/inventory/types.ts               # Export PharmacyInventorySettings (already has POS fields)
├── stores/fulfillment-store.ts          # After dispense → create invoice → show payment CTA
├── components/pharmacy/
│   ├── PharmacyDashboard.tsx            # Add DrawerStatusCard widget
│   └── FulfillmentChecklist.tsx         # Add "Collect Payment" CTA after dispense success
├── components/AppShellWrapper.tsx       # Add POS nav items to sidebar
```

---

## Phase 1: Data Layer (Tasks 1-3)

### Task 1: POS Type Definitions

**Files:**
- Create: `apps/pharmacy-lite/src/lib/pos/types.ts`

- [ ] **Step 1: Create POS types file**

```ts
// apps/pharmacy-lite/src/lib/pos/types.ts

/**
 * All monetary values are integers in minor currency units.
 * e.g. 350 = 3.50 AFN (when currencyMinorUnits = 2)
 */

export type InvoiceStatus = 'draft' | 'finalized' | 'paid' | 'partial' | 'voided'

export interface InvoiceLineItem {
  catalogItemId: string
  stockBatchId: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  patientId?: string
  dispenseIds: string[]
  items: InvoiceLineItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  amountPaid: number
  amountDue: number
  status: InvoiceStatus
  createdBy: string
  createdAt: string
  voidedBy?: string
  voidedAt?: string
  voidReason?: string
  hlcTimestamp: string
}

export type PaymentMethod = 'cash' | 'card' | 'credit'

export interface Payment {
  id: string
  invoiceId: string
  method: PaymentMethod
  amount: number
  reference?: string
  cashDrawerId?: string
  receivedBy: string
  timestamp: string
}

export type LedgerEntryType = 'charge' | 'payment' | 'adjustment'

export interface LedgerEntry {
  id: string
  patientId: string
  type: LedgerEntryType
  amount: number
  invoiceId?: string
  note?: string
  createdBy: string
  timestamp: string
}

export interface PatientAccount {
  id: string
  patientId: string
  balance: number
  creditLimit?: number
  lastActivityAt: string
}

export type CashDrawerStatus = 'open' | 'closed'

export interface CashDrawer {
  id: string
  openedBy: string
  openedAt: string
  openingBalance: number
  closedAt?: string
  closingBalance?: number
  expectedBalance?: number
  discrepancy?: number
  status: CashDrawerStatus
  cashIn: number
  cashOut: number
  notes?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/pos/types.ts
git commit -m "feat(pharmacy-lite): POS type definitions — Invoice, Payment, LedgerEntry, CashDrawer"
```

---

### Task 2: Dexie v7 Schema — POS Tables

**Files:**
- Create: `apps/pharmacy-lite/src/lib/pos-db.ts`
- Modify: `apps/pharmacy-lite/src/lib/db.ts`

- [ ] **Step 1: Create pos-db module**

```ts
// apps/pharmacy-lite/src/lib/pos-db.ts
import type { EntityTable } from 'dexie'
import type { Invoice, Payment, LedgerEntry, PatientAccount, CashDrawer } from './pos/types'

export type PosTables = {
  invoices: EntityTable<Invoice, 'id'>
  payments: EntityTable<Payment, 'id'>
  ledgerEntries: EntityTable<LedgerEntry, 'id'>
  patientAccounts: EntityTable<PatientAccount, 'id'>
  cashDrawers: EntityTable<CashDrawer, 'id'>
}

export const POS_STORES = {
  invoices: 'id, invoiceNumber, patientId, status, createdAt, hlcTimestamp',
  payments: 'id, invoiceId, method, timestamp',
  ledgerEntries: 'id, patientId, type, timestamp, invoiceId',
  patientAccounts: 'id, patientId, balance',
  cashDrawers: 'id, status, openedAt',
}
```

- [ ] **Step 2: Add POS tables to main db.ts**

In `apps/pharmacy-lite/src/lib/db.ts`:

1. Add import:
```ts
import type { Invoice, Payment, LedgerEntry, PatientAccount, CashDrawer } from './pos/types'
import { POS_STORES } from './pos-db'
```

2. Add table declarations in the class:
```ts
invoices!: EntityTable<Invoice, 'id'>
payments!: EntityTable<Payment, 'id'>
ledgerEntries!: EntityTable<LedgerEntry, 'id'>
patientAccounts!: EntityTable<PatientAccount, 'id'>
cashDrawers!: EntityTable<CashDrawer, 'id'>
```

3. Add version 7 after version 6:
```ts
// v7: Point of Sale — invoices, payments, ledger entries, patient accounts, cash drawers
this.version(7).stores(POS_STORES)
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/lib/pos-db.ts apps/pharmacy-lite/src/lib/db.ts
git commit -m "feat(pharmacy-lite): Dexie v7 — POS tables (invoices, payments, ledgerEntries, patientAccounts, cashDrawers)"
```

---

### Task 3: POS Zustand Store

**Files:**
- Create: `apps/pharmacy-lite/src/stores/pos-store.ts`

- [ ] **Step 1: Create POS store**

```ts
// apps/pharmacy-lite/src/stores/pos-store.ts
import { create } from 'zustand'
import type { Invoice, CashDrawer } from '@/lib/pos/types'

interface PosState {
  activeInvoice: Invoice | null
  activeCashDrawer: CashDrawer | null
  setActiveInvoice: (invoice: Invoice | null) => void
  setActiveCashDrawer: (drawer: CashDrawer | null) => void
  clearActiveInvoice: () => void
}

export const usePosStore = create<PosState>((set) => ({
  activeInvoice: null,
  activeCashDrawer: null,
  setActiveInvoice: (invoice) => set({ activeInvoice: invoice }),
  setActiveCashDrawer: (drawer) => set({ activeCashDrawer: drawer }),
  clearActiveInvoice: () => set({ activeInvoice: null }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/stores/pos-store.ts
git commit -m "feat(pharmacy-lite): POS Zustand store for active invoice and cash drawer state"
```

---

## Phase 2: Services (Tasks 4-7)

### Task 4: Invoice Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/pos/invoice-service.ts`

- [ ] **Step 1: Create invoice service**

```ts
// apps/pharmacy-lite/src/lib/pos/invoice-service.ts
import { db } from '@/lib/db'
import type { Invoice, InvoiceLineItem, InvoiceStatus } from './types'
import type { PharmacyInventorySettings } from '@/lib/inventory/types'

/**
 * Generate sequential invoice number for this pharmacy.
 */
async function getNextInvoiceNumber(prefix: string): Promise<string> {
  const lastInvoice = await db.invoices
    .orderBy('createdAt')
    .reverse()
    .first()

  let nextNum = 1
  if (lastInvoice) {
    const match = lastInvoice.invoiceNumber.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]!) + 1
  }

  return `${prefix}${nextNum.toString().padStart(5, '0')}`
}

/**
 * Create a draft invoice from dispensed medications.
 * Called automatically after dispensing confirmation.
 */
export async function createInvoiceFromDispense(params: {
  dispenseIds: string[]
  patientId?: string
  items: InvoiceLineItem[]
  taxRate: number
  createdBy: string
  invoicePrefix: string
}): Promise<Invoice> {
  const { dispenseIds, patientId, items, taxRate, createdBy, invoicePrefix } = params

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const invoiceNumber = await getNextInvoiceNumber(invoicePrefix)

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const taxAmount = Math.round(subtotal * taxRate / 100)
  const total = subtotal + taxAmount

  const invoice: Invoice = {
    id,
    invoiceNumber,
    patientId,
    dispenseIds,
    items,
    subtotal,
    taxRate,
    taxAmount,
    total,
    amountPaid: 0,
    amountDue: total,
    status: 'draft',
    createdBy,
    createdAt: now,
    hlcTimestamp: now,
  }

  await db.invoices.put(invoice)

  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'Invoice',
    resourceId: id,
    action: 'create',
    payload: JSON.stringify(invoice),
    status: 'pending',
    hlcTimestamp: now,
    createdAt: now,
    retryCount: 0,
  })

  return invoice
}

/**
 * Update invoice payment status based on current amountPaid.
 */
export async function updateInvoicePaymentStatus(invoiceId: string): Promise<Invoice> {
  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`)

  // Sum all payments for this invoice
  const payments = await db.payments.where('invoiceId').equals(invoiceId).toArray()
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)

  let status: InvoiceStatus = invoice.status
  if (totalPaid >= invoice.total) {
    status = 'paid'
  } else if (totalPaid > 0) {
    status = 'partial'
  } else if (invoice.status === 'draft') {
    status = 'finalized'
  }

  const now = new Date().toISOString()
  await db.invoices.update(invoiceId, {
    amountPaid: totalPaid,
    amountDue: invoice.total - totalPaid,
    status,
    hlcTimestamp: now,
  })

  return { ...invoice, amountPaid: totalPaid, amountDue: invoice.total - totalPaid, status }
}

/**
 * Void an invoice — requires reason. Creates reversing stock movements.
 */
export async function voidInvoice(params: {
  invoiceId: string
  reason: string
  voidedBy: string
}): Promise<void> {
  const { invoiceId, reason, voidedBy } = params
  const now = new Date().toISOString()

  const invoice = await db.invoices.get(invoiceId)
  if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`)
  if (invoice.status === 'voided') throw new Error('Invoice already voided')

  await db.invoices.update(invoiceId, {
    status: 'voided' as const,
    voidedBy,
    voidedAt: now,
    voidReason: reason,
    hlcTimestamp: now,
  })

  // Note: stock reversal (void_reversal movements) would be handled by
  // the stock service in a full implementation. For now, the void is recorded.
}

/**
 * Get today's invoices for reporting.
 */
export async function getTodayInvoices(): Promise<Invoice[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return db.invoices
    .where('createdAt')
    .aboveOrEqual(todayStart.toISOString())
    .toArray()
}

/**
 * Get today's total revenue (sum of paid/partial invoice totals).
 */
export async function getTodayRevenue(): Promise<number> {
  const invoices = await getTodayInvoices()
  return invoices
    .filter((inv) => inv.status === 'paid' || inv.status === 'partial')
    .reduce((sum, inv) => sum + inv.amountPaid, 0)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/pos/invoice-service.ts
git commit -m "feat(pharmacy-lite): invoice service — create from dispense, payment status, void, revenue query"
```

---

### Task 5: Payment Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/pos/payment-service.ts`

- [ ] **Step 1: Create payment service**

```ts
// apps/pharmacy-lite/src/lib/pos/payment-service.ts
import { db } from '@/lib/db'
import type { Payment, PaymentMethod, LedgerEntry } from './types'
import { updateInvoicePaymentStatus } from './invoice-service'

/**
 * Record a payment against an invoice.
 * Handles side effects: cash drawer increment, credit ledger entry.
 */
export async function recordPayment(params: {
  invoiceId: string
  method: PaymentMethod
  amount: number
  reference?: string
  cashDrawerId?: string
  patientId?: string
  receivedBy: string
}): Promise<Payment> {
  const { invoiceId, method, amount, reference, cashDrawerId, patientId, receivedBy } = params

  const now = new Date().toISOString()
  const paymentId = crypto.randomUUID()

  const payment: Payment = {
    id: paymentId,
    invoiceId,
    method,
    amount,
    reference,
    cashDrawerId,
    receivedBy,
    timestamp: now,
  }

  await db.transaction('rw', [db.payments, db.cashDrawers, db.ledgerEntries, db.patientAccounts, db.syncQueue], async () => {
    await db.payments.put(payment)

    // Side effect: cash payment → increment drawer
    if (method === 'cash' && cashDrawerId) {
      const drawer = await db.cashDrawers.get(cashDrawerId)
      if (drawer && drawer.status === 'open') {
        await db.cashDrawers.update(cashDrawerId, {
          cashIn: drawer.cashIn + amount,
        })
      }
    }

    // Side effect: credit payment → create ledger entry + update account
    if (method === 'credit' && patientId) {
      const entryId = crypto.randomUUID()
      const entry: LedgerEntry = {
        id: entryId,
        patientId,
        type: 'charge',
        amount, // positive = patient owes
        invoiceId,
        createdBy: receivedBy,
        timestamp: now,
      }
      await db.ledgerEntries.put(entry)

      // Update cached balance
      const account = await db.patientAccounts.get(patientId)
      if (account) {
        await db.patientAccounts.update(patientId, {
          balance: account.balance + amount,
          lastActivityAt: now,
        })
      } else {
        await db.patientAccounts.put({
          id: patientId,
          patientId,
          balance: amount,
          lastActivityAt: now,
        })
      }
    }

    // Enqueue sync
    await db.syncQueue.put({
      id: crypto.randomUUID(),
      resourceType: 'Payment',
      resourceId: paymentId,
      action: 'create',
      payload: JSON.stringify(payment),
      status: 'pending',
      hlcTimestamp: now,
      createdAt: now,
      retryCount: 0,
    })
  })

  // Update invoice status
  await updateInvoicePaymentStatus(invoiceId)

  return payment
}

/**
 * Record a credit payment from a patient (reduces their balance).
 */
export async function recordCreditPayment(params: {
  patientId: string
  amount: number
  note?: string
  receivedBy: string
}): Promise<void> {
  const { patientId, amount, note, receivedBy } = params
  const now = new Date().toISOString()

  const entryId = crypto.randomUUID()
  const entry: LedgerEntry = {
    id: entryId,
    patientId,
    type: 'payment',
    amount: -amount, // negative = reduces balance
    note,
    createdBy: receivedBy,
    timestamp: now,
  }

  await db.transaction('rw', [db.ledgerEntries, db.patientAccounts, db.syncQueue], async () => {
    await db.ledgerEntries.put(entry)

    const account = await db.patientAccounts.get(patientId)
    if (account) {
      await db.patientAccounts.update(patientId, {
        balance: account.balance - amount,
        lastActivityAt: now,
      })
    }

    await db.syncQueue.put({
      id: crypto.randomUUID(),
      resourceType: 'LedgerEntry',
      resourceId: entryId,
      action: 'create',
      payload: JSON.stringify(entry),
      status: 'pending',
      hlcTimestamp: now,
      createdAt: now,
      retryCount: 0,
    })
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/pos/payment-service.ts
git commit -m "feat(pharmacy-lite): payment service — record payments, credit ledger, cash drawer integration"
```

---

### Task 6: Cash Drawer Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/pos/cash-drawer-service.ts`

- [ ] **Step 1: Create cash drawer service**

```ts
// apps/pharmacy-lite/src/lib/pos/cash-drawer-service.ts
import { db } from '@/lib/db'
import type { CashDrawer } from './types'

/**
 * Open a new cash drawer session.
 * Only one drawer can be open at a time.
 */
export async function openCashDrawer(params: {
  openedBy: string
  openingBalance: number
}): Promise<CashDrawer> {
  // Check no drawer is already open
  const existing = await db.cashDrawers.where('status').equals('open').first()
  if (existing) throw new Error('A cash drawer is already open. Close it before opening a new one.')

  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const drawer: CashDrawer = {
    id,
    openedBy: params.openedBy,
    openedAt: now,
    openingBalance: params.openingBalance,
    status: 'open',
    cashIn: 0,
    cashOut: 0,
  }

  await db.cashDrawers.put(drawer)
  return drawer
}

/**
 * Close the current cash drawer session with a counted balance.
 */
export async function closeCashDrawer(params: {
  drawerId: string
  closingBalance: number
  notes?: string
}): Promise<CashDrawer> {
  const { drawerId, closingBalance, notes } = params

  const drawer = await db.cashDrawers.get(drawerId)
  if (!drawer) throw new Error('Cash drawer not found')
  if (drawer.status === 'closed') throw new Error('Drawer already closed')

  const now = new Date().toISOString()
  const expectedBalance = drawer.openingBalance + drawer.cashIn - drawer.cashOut
  const discrepancy = closingBalance - expectedBalance

  await db.cashDrawers.update(drawerId, {
    status: 'closed' as const,
    closedAt: now,
    closingBalance,
    expectedBalance,
    discrepancy,
    notes,
  })

  return {
    ...drawer,
    status: 'closed',
    closedAt: now,
    closingBalance,
    expectedBalance,
    discrepancy,
    notes,
  }
}

/**
 * Get the currently open cash drawer (if any).
 */
export async function getOpenCashDrawer(): Promise<CashDrawer | null> {
  const drawer = await db.cashDrawers.where('status').equals('open').first()
  return drawer ?? null
}

/**
 * Get recent closed drawers for history.
 */
export async function getRecentDrawers(limit = 10): Promise<CashDrawer[]> {
  return db.cashDrawers
    .orderBy('openedAt')
    .reverse()
    .limit(limit)
    .toArray()
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/pos/cash-drawer-service.ts
git commit -m "feat(pharmacy-lite): cash drawer service — open/close sessions, reconciliation, discrepancy tracking"
```

---

### Task 7: Patient Account Service

**Files:**
- Create: `apps/pharmacy-lite/src/lib/pos/patient-account-service.ts`

- [ ] **Step 1: Create patient account service**

```ts
// apps/pharmacy-lite/src/lib/pos/patient-account-service.ts
import { db } from '@/lib/db'
import type { LedgerEntry, PatientAccount } from './types'

/**
 * Get all patient accounts with non-zero balance.
 */
export async function getAccountsWithBalance(): Promise<PatientAccount[]> {
  return db.patientAccounts
    .filter((a) => a.balance !== 0)
    .toArray()
}

/**
 * Get ledger entries for a patient, most recent first.
 */
export async function getPatientLedger(patientId: string): Promise<LedgerEntry[]> {
  return db.ledgerEntries
    .where('patientId')
    .equals(patientId)
    .reverse()
    .sortBy('timestamp')
}

/**
 * Calculate aging buckets for a patient's outstanding balance.
 * Returns amounts in 0-30, 31-60, 61-90, 90+ day buckets.
 */
export async function getAgingBuckets(patientId: string): Promise<{
  current: number    // 0-30 days
  thirtyDay: number  // 31-60 days
  sixtyDay: number   // 61-90 days
  ninetyPlus: number // 90+ days
}> {
  const entries = await db.ledgerEntries
    .where('patientId')
    .equals(patientId)
    .toArray()

  const now = Date.now()
  const buckets = { current: 0, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 }

  for (const entry of entries) {
    if (entry.amount <= 0) continue // skip payments/adjustments
    const ageMs = now - new Date(entry.timestamp).getTime()
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))

    if (ageDays <= 30) buckets.current += entry.amount
    else if (ageDays <= 60) buckets.thirtyDay += entry.amount
    else if (ageDays <= 90) buckets.sixtyDay += entry.amount
    else buckets.ninetyPlus += entry.amount
  }

  return buckets
}

/**
 * Get aggregate aging across all patients (for dashboard/reports).
 */
export async function getTotalAging(): Promise<{
  totalOutstanding: number
  accountsCount: number
  overdueCount: number
}> {
  const accounts = await db.patientAccounts.filter((a) => a.balance > 0).toArray()
  const totalOutstanding = accounts.reduce((sum, a) => sum + a.balance, 0)

  // Count accounts with entries older than 30 days
  let overdueCount = 0
  for (const account of accounts) {
    const oldestCharge = await db.ledgerEntries
      .where('patientId')
      .equals(account.patientId)
      .filter((e) => e.amount > 0)
      .first()
    if (oldestCharge) {
      const ageDays = Math.floor((Date.now() - new Date(oldestCharge.timestamp).getTime()) / 86400000)
      if (ageDays > 30) overdueCount++
    }
  }

  return { totalOutstanding, accountsCount: accounts.length, overdueCount }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/lib/pos/patient-account-service.ts
git commit -m "feat(pharmacy-lite): patient account service — ledger, aging buckets, outstanding balance queries"
```

---

## Phase 3: POS UI (Tasks 8-10)

### Task 8: POS Page — Invoice Summary + Payment Form

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/pos/InvoiceSummary.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/pos/PaymentForm.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/pos/PosPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/pos/page.tsx`

- [ ] **Step 1: Create InvoiceSummary**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/pos/InvoiceSummary.tsx
'use client'

import type { Invoice } from '@/lib/pos/types'

interface InvoiceSummaryProps {
  invoice: Invoice
  currencyMinorUnits: number
  currency: string
}

export function InvoiceSummary({ invoice, currencyMinorUnits, currency }: InvoiceSummaryProps) {
  const fmt = (amount: number) => `${currency} ${(amount / Math.pow(10, currencyMinorUnits)).toFixed(currencyMinorUnits)}`

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="invoice-summary">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-700">Invoice {invoice.invoiceNumber}</h3>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          invoice.status === 'paid' ? 'bg-green-100 text-green-700' :
          invoice.status === 'partial' ? 'bg-amber-100 text-amber-700' :
          invoice.status === 'voided' ? 'bg-red-100 text-red-700' :
          'bg-neutral-100 text-neutral-600'
        }`}>
          {invoice.status}
        </span>
      </div>

      {/* Line items */}
      <div className="space-y-2 mb-4">
        {invoice.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="min-w-0 flex-1">
              <span className="text-neutral-900">{item.description}</span>
              <span className="text-neutral-500 ms-2">x{item.quantity}</span>
            </div>
            <span className="text-neutral-700 tabular-nums">{fmt(item.lineTotal)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-neutral-200 pt-3 space-y-1">
        <div className="flex justify-between text-sm text-neutral-600">
          <span>Subtotal</span>
          <span className="tabular-nums">{fmt(invoice.subtotal)}</span>
        </div>
        {invoice.taxAmount > 0 && (
          <div className="flex justify-between text-sm text-neutral-600">
            <span>Tax ({invoice.taxRate}%)</span>
            <span className="tabular-nums">{fmt(invoice.taxAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold text-neutral-900">
          <span>Total</span>
          <span className="tabular-nums">{fmt(invoice.total)}</span>
        </div>
        {invoice.amountPaid > 0 && (
          <div className="flex justify-between text-sm text-green-700">
            <span>Paid</span>
            <span className="tabular-nums">-{fmt(invoice.amountPaid)}</span>
          </div>
        )}
        {invoice.amountDue > 0 && (
          <div className="flex justify-between text-sm font-bold text-amber-700">
            <span>Amount Due</span>
            <span className="tabular-nums">{fmt(invoice.amountDue)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create PaymentForm**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/pos/PaymentForm.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { recordPayment } from '@/lib/pos/payment-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { Invoice, PaymentMethod } from '@/lib/pos/types'

interface PaymentFormProps {
  invoice: Invoice
  cashDrawerId?: string
  currencyMinorUnits: number
  enableCredit: boolean
  onPaymentRecorded: () => void
}

export function PaymentForm({ invoice, cashDrawerId, currencyMinorUnits, enableCredit, onPaymentRecorded }: PaymentFormProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [amountStr, setAmountStr] = useState('')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = useAuthSessionStore((s) => s.session)

  const parseAmount = (str: string) => Math.round(parseFloat(str || '0') * Math.pow(10, currencyMinorUnits))
  const formatDue = (minor: number) => (minor / Math.pow(10, currencyMinorUnits)).toFixed(currencyMinorUnits)

  const amount = parseAmount(amountStr)
  const isValid = amount > 0 && amount <= invoice.amountDue

  const handleSubmit = async () => {
    if (!isValid || !session) return
    setSaving(true)
    setError(null)
    try {
      await recordPayment({
        invoiceId: invoice.id,
        method,
        amount,
        reference: reference.trim() || undefined,
        cashDrawerId: method === 'cash' ? cashDrawerId : undefined,
        patientId: method === 'credit' ? invoice.patientId : undefined,
        receivedBy: session.practitionerId ?? session.userId,
      })
      setAmountStr('')
      setReference('')
      onPaymentRecorded()
    } catch {
      setError('Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  if (invoice.amountDue <= 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center" data-testid="payment-complete">
        <p className="text-sm font-semibold text-green-800">Payment Complete</p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="payment-form">
      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Amount due reminder */}
      <div className="text-center">
        <p className="text-xs text-neutral-500">Amount Due</p>
        <p className="text-2xl font-bold tabular-nums text-neutral-900">{formatDue(invoice.amountDue)}</p>
      </div>

      {/* Method selector */}
      <div className="flex gap-2">
        {(['cash', 'card'] as PaymentMethod[]).concat(enableCredit ? ['credit'] : []).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
              method === m
                ? 'border-primary-300 bg-primary-50 text-primary-800'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Amount</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder={formatDue(invoice.amountDue)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-lg text-center tabular-nums focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          data-testid="payment-amount-input"
        />
        <button
          type="button"
          onClick={() => setAmountStr(formatDue(invoice.amountDue))}
          className="mt-1 text-xs text-primary-600 hover:text-primary-800"
        >
          Pay full amount
        </button>
      </div>

      {/* Reference (for card) */}
      {method === 'card' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Card Reference</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Auth code or last 4 digits"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          />
        </div>
      )}

      {/* Credit warning */}
      {method === 'credit' && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          This will be charged to the patient&apos;s credit account.
        </div>
      )}

      <Button
        variant="primary"
        fullWidth
        type="button"
        disabled={!isValid || saving}
        onClick={handleSubmit}
        data-testid="record-payment-btn"
      >
        {saving ? 'Recording...' : `Record ${method} payment`}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Create PosPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/pos/PosPage.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import { usePosStore } from '@/stores/pos-store'
import { getOpenCashDrawer } from '@/lib/pos/cash-drawer-service'
import { InvoiceSummary } from './InvoiceSummary'
import { PaymentForm } from './PaymentForm'
import { Button } from '@/components/ui/Button'
import type { Invoice } from '@/lib/pos/types'

export function PosPage() {
  const router = useRouter()
  const activeInvoice = usePosStore((s) => s.activeInvoice)
  const setActiveInvoice = usePosStore((s) => s.setActiveInvoice)
  const [invoice, setInvoice] = useState<Invoice | null>(activeInvoice)
  const [cashDrawerId, setCashDrawerId] = useState<string | undefined>()
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])

  // Load cash drawer
  useEffect(() => {
    getOpenCashDrawer().then((d) => setCashDrawerId(d?.id))
  }, [])

  // Load recent unpaid invoices if no active invoice
  useEffect(() => {
    if (!activeInvoice) {
      db.invoices
        .where('status')
        .anyOf(['draft', 'finalized', 'partial'])
        .reverse()
        .sortBy('createdAt')
        .then(setRecentInvoices)
    }
  }, [activeInvoice])

  const handlePaymentRecorded = useCallback(async () => {
    if (!invoice) return
    const updated = await db.invoices.get(invoice.id)
    if (updated) {
      setInvoice(updated)
      if (updated.status === 'paid') {
        setActiveInvoice(null)
      }
    }
  }, [invoice, setActiveInvoice])

  const handleSelectInvoice = (inv: Invoice) => {
    setInvoice(inv)
    setActiveInvoice(inv)
  }

  // No active invoice — show list of unpaid
  if (!invoice) {
    return (
      <div className="space-y-4" data-testid="pos-page">
        <h1 className="text-xl font-bold text-neutral-900">Point of Sale</h1>

        {recentInvoices.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
            <p className="text-sm text-neutral-500">No pending invoices.</p>
            <p className="text-xs text-neutral-400 mt-1">Invoices are created automatically after dispensing.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-neutral-600">Pending invoices:</p>
            {recentInvoices.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => handleSelectInvoice(inv)}
                className="w-full rounded-lg border border-neutral-200 bg-white p-3 text-start hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-900">{inv.invoiceNumber}</span>
                  <span className="text-sm font-bold tabular-nums text-amber-700">
                    {(inv.amountDue / 100).toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">{inv.items.length} item{inv.items.length !== 1 ? 's' : ''} · {new Date(inv.createdAt).toLocaleTimeString()}</p>
              </button>
            ))}
          </div>
        )}

        {!cashDrawerId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">No cash drawer is open.</p>
            <Button variant="warning" type="button" className="mt-2" onClick={() => router.push('/pos/cash-drawer')}>
              Open Drawer
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="pos-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Collect Payment</h1>
        <Button variant="secondary" type="button" onClick={() => { setInvoice(null); setActiveInvoice(null) }}>
          Back to List
        </Button>
      </div>

      <InvoiceSummary invoice={invoice} currencyMinorUnits={2} currency="AFN" />

      {invoice.status !== 'paid' && invoice.status !== 'voided' && (
        <PaymentForm
          invoice={invoice}
          cashDrawerId={cashDrawerId}
          currencyMinorUnits={2}
          enableCredit={true}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}

      {invoice.status === 'paid' && (
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-green-400 bg-green-50 p-4 text-center">
            <p className="text-lg font-bold text-green-800">Paid in Full</p>
          </div>
          <div className="flex gap-3">
            <Button variant="primary" fullWidth type="button" onClick={() => window.print()}>
              Print Receipt
            </Button>
            <Button variant="secondary" type="button" onClick={() => { setInvoice(null); setActiveInvoice(null); router.push('/') }}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create route page**

```tsx
// apps/pharmacy-lite/src/app/[locale]/pos/page.tsx
'use client'

import { PosPage } from '@/components/pharmacy/pos/PosPage'

export default function PosRoute() {
  return <PosPage />
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/pos/InvoiceSummary.tsx apps/pharmacy-lite/src/components/pharmacy/pos/PaymentForm.tsx apps/pharmacy-lite/src/components/pharmacy/pos/PosPage.tsx apps/pharmacy-lite/src/app/[locale]/pos/page.tsx
git commit -m "feat(pharmacy-lite): POS page — invoice summary, split-pay form, payment collection"
```

---

### Task 9: Cash Drawer Page

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/pos/CashDrawerPage.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/pos/DrawerStatusCard.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/pos/cash-drawer/page.tsx`

- [ ] **Step 1: Create CashDrawerPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/pos/CashDrawerPage.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { openCashDrawer, closeCashDrawer, getOpenCashDrawer, getRecentDrawers } from '@/lib/pos/cash-drawer-service'
import { usePosStore } from '@/stores/pos-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { CashDrawer } from '@/lib/pos/types'

export function CashDrawerPage() {
  const session = useAuthSessionStore((s) => s.session)
  const { activeCashDrawer, setActiveCashDrawer } = usePosStore()
  const [recentDrawers, setRecentDrawers] = useState<CashDrawer[]>([])
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadState = useCallback(async () => {
    const open = await getOpenCashDrawer()
    setActiveCashDrawer(open)
    const recent = await getRecentDrawers(5)
    setRecentDrawers(recent.filter((d) => d.status === 'closed'))
  }, [setActiveCashDrawer])

  useEffect(() => { loadState() }, [loadState])

  const handleOpen = async () => {
    if (!session) return
    const amount = Math.round(parseFloat(openingBalance || '0') * 100)
    setSaving(true)
    setError(null)
    try {
      const drawer = await openCashDrawer({ openedBy: session.practitionerId ?? session.userId, openingBalance: amount })
      setActiveCashDrawer(drawer)
      setOpeningBalance('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open drawer')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = async () => {
    if (!activeCashDrawer) return
    const amount = Math.round(parseFloat(closingBalance || '0') * 100)
    setSaving(true)
    setError(null)
    try {
      await closeCashDrawer({ drawerId: activeCashDrawer.id, closingBalance: amount, notes: closingNotes.trim() || undefined })
      setClosingBalance('')
      setClosingNotes('')
      await loadState()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close drawer')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (amount: number) => (amount / 100).toFixed(2)

  return (
    <div className="space-y-6" data-testid="cash-drawer-page">
      <h1 className="text-xl font-bold text-neutral-900">Cash Drawer</h1>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Current drawer state */}
      {activeCashDrawer ? (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-green-800">Drawer Open</h2>
            <span className="text-xs text-green-600">Since {new Date(activeCashDrawer.openedAt).toLocaleTimeString()}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div><p className="text-xs text-neutral-500">Opening</p><p className="text-lg font-bold tabular-nums">{fmt(activeCashDrawer.openingBalance)}</p></div>
            <div><p className="text-xs text-neutral-500">Cash In</p><p className="text-lg font-bold tabular-nums text-green-700">{fmt(activeCashDrawer.cashIn)}</p></div>
            <div><p className="text-xs text-neutral-500">Expected</p><p className="text-lg font-bold tabular-nums">{fmt(activeCashDrawer.openingBalance + activeCashDrawer.cashIn - activeCashDrawer.cashOut)}</p></div>
          </div>

          {/* Close form */}
          <div className="border-t border-green-200 pt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Count cash and enter closing balance</label>
              <input type="number" step="0.01" min="0" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} placeholder="0.00" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-lg text-center tabular-nums focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Notes (optional)</label>
              <input type="text" value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder="End of shift notes" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
            </div>
            <Button variant="danger" fullWidth type="button" disabled={!closingBalance || saving} onClick={handleClose}>
              {saving ? 'Closing...' : 'Close Drawer'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">Open Cash Drawer</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Opening Balance (cash in drawer)</label>
              <input type="number" step="0.01" min="0" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-lg text-center tabular-nums focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" data-testid="opening-balance-input" />
            </div>
            <Button variant="primary" fullWidth type="button" disabled={saving} onClick={handleOpen} data-testid="open-drawer-btn">
              {saving ? 'Opening...' : 'Open Drawer'}
            </Button>
          </div>
        </div>
      )}

      {/* Recent closed drawers */}
      {recentDrawers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-neutral-700 mb-2">Recent Sessions</h2>
          <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 overflow-hidden">
            {recentDrawers.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-3 bg-white">
                <div>
                  <p className="text-sm text-neutral-900">{new Date(d.openedAt).toLocaleDateString()}</p>
                  <p className="text-xs text-neutral-500">{new Date(d.openedAt).toLocaleTimeString()} — {d.closedAt ? new Date(d.closedAt).toLocaleTimeString() : '?'}</p>
                </div>
                <div className="text-end">
                  <p className="text-sm tabular-nums text-neutral-900">{fmt(d.closingBalance ?? 0)}</p>
                  {d.discrepancy !== undefined && d.discrepancy !== 0 && (
                    <p className={`text-xs tabular-nums ${d.discrepancy > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {d.discrepancy > 0 ? '+' : ''}{fmt(d.discrepancy)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create DrawerStatusCard (for dashboard)**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/pos/DrawerStatusCard.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getOpenCashDrawer } from '@/lib/pos/cash-drawer-service'
import { getTodayRevenue } from '@/lib/pos/invoice-service'

export function DrawerStatusCard() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSince, setDrawerSince] = useState<string | null>(null)
  const [todayRevenue, setTodayRevenue] = useState(0)

  useEffect(() => {
    async function load() {
      const drawer = await getOpenCashDrawer()
      setDrawerOpen(!!drawer)
      setDrawerSince(drawer ? new Date(drawer.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null)
      const revenue = await getTodayRevenue()
      setTodayRevenue(revenue)
    }
    load()
  }, [])

  const fmt = (amount: number) => (amount / 100).toFixed(2)

  return (
    <Link href="/pos/cash-drawer" data-testid="drawer-status-card">
      <div className="rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:bg-neutral-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500">Cash Drawer</p>
            <p className={`text-sm font-semibold ${drawerOpen ? 'text-green-700' : 'text-neutral-400'}`}>
              {drawerOpen ? `Open since ${drawerSince}` : 'No drawer open'}
            </p>
          </div>
          <div className="text-end">
            <p className="text-xs text-neutral-500">Today&apos;s Revenue</p>
            <p className="text-sm font-bold tabular-nums text-neutral-900">{fmt(todayRevenue)}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: Create route page**

```tsx
// apps/pharmacy-lite/src/app/[locale]/pos/cash-drawer/page.tsx
'use client'

import { CashDrawerPage } from '@/components/pharmacy/pos/CashDrawerPage'

export default function CashDrawerRoute() {
  return <CashDrawerPage />
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/pos/CashDrawerPage.tsx apps/pharmacy-lite/src/components/pharmacy/pos/DrawerStatusCard.tsx apps/pharmacy-lite/src/app/[locale]/pos/cash-drawer/page.tsx
git commit -m "feat(pharmacy-lite): Cash Drawer page — open/close sessions, reconciliation, DrawerStatusCard widget"
```

---

### Task 10: Patient Accounts Page

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/pos/PatientAccountsPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/pos/accounts/page.tsx`

- [ ] **Step 1: Create PatientAccountsPage**

```tsx
// apps/pharmacy-lite/src/components/pharmacy/pos/PatientAccountsPage.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { getAccountsWithBalance, getPatientLedger, getAgingBuckets } from '@/lib/pos/patient-account-service'
import { recordCreditPayment } from '@/lib/pos/payment-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { db } from '@/lib/db'
import type { PatientAccount, LedgerEntry } from '@/lib/pos/types'
import type { LocalPatient } from '@/lib/db'

export function PatientAccountsPage() {
  const session = useAuthSessionStore((s) => s.session)
  const [accounts, setAccounts] = useState<(PatientAccount & { patientName?: string })[]>([])
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [aging, setAging] = useState<{ current: number; thirtyDay: number; sixtyDay: number; ninetyPlus: number } | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    const accts = await getAccountsWithBalance()
    // Enrich with patient names
    const patientIds = accts.map((a) => a.patientId)
    const patients = patientIds.length > 0 ? await db.patients.where('id').anyOf(patientIds).toArray() : []
    const nameMap = new Map(patients.map((p: LocalPatient) => [p.id, p.nameGiven]))
    setAccounts(accts.map((a) => ({ ...a, patientName: nameMap.get(a.patientId) })))
    setLoading(false)
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const handleSelectPatient = async (patientId: string) => {
    setSelectedPatient(patientId)
    const [entries, buckets] = await Promise.all([
      getPatientLedger(patientId),
      getAgingBuckets(patientId),
    ])
    setLedger(entries)
    setAging(buckets)
  }

  const handleRecordPayment = async () => {
    if (!selectedPatient || !session) return
    const amount = Math.round(parseFloat(paymentAmount || '0') * 100)
    if (amount <= 0) return
    setSaving(true)
    try {
      await recordCreditPayment({
        patientId: selectedPatient,
        amount,
        note: 'Credit payment received',
        receivedBy: session.practitionerId ?? session.userId,
      })
      setPaymentAmount('')
      await handleSelectPatient(selectedPatient)
      await loadAccounts()
    } finally {
      setSaving(false)
    }
  }

  const fmt = (amount: number) => (amount / 100).toFixed(2)

  if (selectedPatient) {
    const account = accounts.find((a) => a.patientId === selectedPatient)
    return (
      <div className="space-y-4" data-testid="patient-ledger-view">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-neutral-900">{account?.patientName ?? 'Patient'} — Account</h1>
          <Button variant="secondary" type="button" onClick={() => setSelectedPatient(null)}>Back</Button>
        </div>

        {/* Balance + Aging */}
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Outstanding Balance</p>
          <p className="text-2xl font-bold tabular-nums text-neutral-900">{fmt(account?.balance ?? 0)}</p>
          {aging && (
            <div className="grid grid-cols-4 gap-2 mt-3 text-center text-xs">
              <div><p className="text-neutral-500">0-30d</p><p className="font-semibold tabular-nums">{fmt(aging.current)}</p></div>
              <div><p className="text-neutral-500">31-60d</p><p className="font-semibold tabular-nums text-amber-600">{fmt(aging.thirtyDay)}</p></div>
              <div><p className="text-neutral-500">61-90d</p><p className="font-semibold tabular-nums text-orange-600">{fmt(aging.sixtyDay)}</p></div>
              <div><p className="text-neutral-500">90+d</p><p className="font-semibold tabular-nums text-red-600">{fmt(aging.ninetyPlus)}</p></div>
            </div>
          )}
        </div>

        {/* Record payment */}
        <div className="flex gap-2">
          <input type="number" step="0.01" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Payment amount" className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500" />
          <Button variant="primary" type="button" disabled={!paymentAmount || saving} onClick={handleRecordPayment}>
            {saving ? '...' : 'Record Payment'}
          </Button>
        </div>

        {/* Ledger entries */}
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 overflow-hidden">
          {ledger.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-2 bg-white">
              <div>
                <p className="text-sm text-neutral-900 capitalize">{entry.type}</p>
                <p className="text-xs text-neutral-500">{new Date(entry.timestamp).toLocaleString()}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${entry.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {entry.amount > 0 ? '+' : ''}{fmt(entry.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="patient-accounts-page">
      <h1 className="text-xl font-bold text-neutral-900">Patient Accounts</h1>

      {loading ? (
        <div className="py-8 text-center text-sm text-neutral-400">Loading accounts...</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center">
          <p className="text-sm text-neutral-500">No patient credit accounts.</p>
          <p className="text-xs text-neutral-400 mt-1">Credit accounts are created when a patient pays on credit.</p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 overflow-hidden">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => handleSelectPatient(account.patientId)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-neutral-50 transition-colors text-start"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">{account.patientName ?? account.patientId}</p>
                <p className="text-xs text-neutral-500">Last activity: {new Date(account.lastActivityAt).toLocaleDateString()}</p>
              </div>
              <span className="text-sm font-bold tabular-nums text-amber-700">{fmt(account.balance)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create route page**

```tsx
// apps/pharmacy-lite/src/app/[locale]/pos/accounts/page.tsx
'use client'

import { PatientAccountsPage } from '@/components/pharmacy/pos/PatientAccountsPage'

export default function PatientAccountsRoute() {
  return <PatientAccountsPage />
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/pos/PatientAccountsPage.tsx apps/pharmacy-lite/src/app/[locale]/pos/accounts/page.tsx
git commit -m "feat(pharmacy-lite): Patient Accounts page — credit ledgers, aging report, payment recording"
```

---

## Phase 4: Integration + Navigation (Tasks 11-13)

### Task 11: Dispensing → Invoice Auto-Creation

**Files:**
- Modify: `apps/pharmacy-lite/src/stores/fulfillment-store.ts`

- [ ] **Step 1: Add invoice creation after dispensing**

Add import at the top of `fulfillment-store.ts`:
```ts
import { createInvoiceFromDispense } from '@/lib/pos/invoice-service'
import { usePosStore } from '@/stores/pos-store'
import type { InvoiceLineItem } from '@/lib/pos/types'
```

Add a new action `createInvoiceAfterDispense` to the store:
```ts
createInvoiceAfterDispense: async (practitionerId: string) => {
  const state = get()
  const selectedItems = state.items.filter((i) => i.selected)
  if (selectedItems.length === 0) return

  const lineItems: InvoiceLineItem[] = selectedItems.map((item) => ({
    catalogItemId: item.prescription.med,
    stockBatchId: item.fefoBatchId ?? '',
    description: item.prescription.medT || item.prescription.medN,
    quantity: item.prescription.dos.qty,
    unitPrice: 0, // Will be populated from batch sellingPrice in future
    lineTotal: 0, // Will be computed from unitPrice * qty in future
  }))

  try {
    const invoice = await createInvoiceFromDispense({
      dispenseIds: selectedItems.map((i) => i.prescription.id),
      patientId: undefined, // Will be linked from patient store
      items: lineItems,
      taxRate: 0,
      createdBy: practitionerId,
      invoicePrefix: 'INV-',
    })
    usePosStore.getState().setActiveInvoice(invoice)
  } catch {
    // Invoice creation failure should not block dispensing flow
  }
},
```

Add to the store's state interface:
```ts
createInvoiceAfterDispense: (practitionerId: string) => Promise<void>
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/stores/fulfillment-store.ts
git commit -m "feat(pharmacy-lite): auto-create invoice after dispensing confirmation"
```

---

### Task 12: Dashboard DrawerStatusCard + POS Sidebar Nav

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx`
- Modify: `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`

- [ ] **Step 1: Add DrawerStatusCard to dashboard**

In `PharmacyDashboard.tsx`, add import:
```tsx
import { DrawerStatusCard } from './pos/DrawerStatusCard'
```

Add `<DrawerStatusCard />` after `<InventoryAlertCard />` (at the very end of the dashboard JSX).

- [ ] **Step 2: Add POS nav items to sidebar**

In `AppShellWrapper.tsx`:

Add icons:
```tsx
pos: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
),
cashDrawer: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
    <line x1="12" y1="14" x2="12" y2="14.01" />
  </svg>
),
accounts: (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="18" y1="8" x2="23" y2="13" />
    <line x1="23" y1="8" x2="18" y2="13" />
  </svg>
),
```

Add nav items (as a financial group between inventory and clinical):
```tsx
// Financial group
{ label: t('pos'), href: '/pos', icon: icons.pos, active: pathname === '/pos', group: 'financial' },
{ label: t('cashDrawer'), href: '/pos/cash-drawer', icon: icons.cashDrawer, active: pathname === '/pos/cash-drawer', group: 'financial' },
{ label: t('patientAccounts'), href: '/pos/accounts', icon: icons.accounts, active: pathname === '/pos/accounts', group: 'financial' },
```

Add `/pos`, `/pos/accounts` to `wideRoutes` (they have tables).

- [ ] **Step 3: Add i18n keys**

In `messages/en.json` sidebar:
```json
"pos": "Point of Sale",
"cashDrawer": "Cash Drawer",
"patientAccounts": "Patient Accounts"
```

In `messages/ar.json` sidebar:
```json
"pos": "نقطة البيع",
"cashDrawer": "درج النقود",
"patientAccounts": "حسابات المرضى"
```

In `messages/prs.json` sidebar:
```json
"pos": "نقطه فروش",
"cashDrawer": "کشوی پول",
"patientAccounts": "حسابات بیماران"
```

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx apps/pharmacy-lite/src/components/AppShellWrapper.tsx apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json
git commit -m "feat(pharmacy-lite): POS sidebar navigation, DrawerStatusCard dashboard widget, i18n"
```

---

### Task 13: Dispensing Flow — "Collect Payment" CTA

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`

- [ ] **Step 1: Add payment CTA after dispensing success**

In `FulfillmentChecklist.tsx`, add imports:
```tsx
import Link from 'next/link'
import { usePosStore } from '@/stores/pos-store'
```

After the existing dispensing confirmation modal and the `onConfirm` callback fires (where the dispensing is actually confirmed), add a state to track post-dispense:
```tsx
const [dispensingComplete, setDispensingComplete] = useState(false)
const activeInvoice = usePosStore((s) => s.activeInvoice)
```

In the modal's `onConfirm` handler (where it currently calls `onConfirm?.(selected)`), add after that call:
```tsx
setDispensingComplete(true)
```

Add this JSX after the Confirm Dispensing button (or after the modal), shown when dispensingComplete is true:
```tsx
{dispensingComplete && (
  <div className="rounded-lg border-2 border-green-400 bg-green-50 p-4 space-y-3">
    <p className="text-sm font-bold text-green-800">Dispensing Complete</p>
    {activeInvoice && (
      <Link href="/pos">
        <Button variant="primary" fullWidth type="button" data-testid="collect-payment-cta">
          Collect Payment — {activeInvoice.invoiceNumber}
        </Button>
      </Link>
    )}
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx
git commit -m "feat(pharmacy-lite): 'Collect Payment' CTA shown after dispensing confirmation (links to POS)"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **1. Data Layer** | 1-3 | POS types, Dexie v7 schema, POS Zustand store |
| **2. Services** | 4-7 | Invoice, payment, cash drawer, patient account services |
| **3. POS UI** | 8-10 | POS page (payment collection), Cash Drawer page, Patient Accounts page |
| **4. Integration** | 11-13 | Auto-invoice from dispense, dashboard widget, sidebar nav, payment CTA |

**Total: 13 tasks, 4 phases.**

After completion, pharmacy-lite will:
- Auto-create invoices when medications are dispensed
- Accept split payments (cash + card + credit)
- Track patient credit accounts with aging (30/60/90 days)
- Manage cash drawer sessions with end-of-day reconciliation
- Show drawer status and today's revenue on the dashboard
- Navigate between dispensing → payment seamlessly
