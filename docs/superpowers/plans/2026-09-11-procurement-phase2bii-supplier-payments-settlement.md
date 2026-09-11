# Procurement Phase 2b-ii — Supplier Payments & AP Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record payments against approved supplier invoices with invoice-level allocation, derive a per-supplier AP account (outstanding balance + aging), and allow voiding a mistaken payment — all in `apps/pharmacy-lite`.

**Architecture:** A new `supplierPayments` Dexie store (v19) holds payments with per-invoice `allocations[]`. Approved invoices gain optional settlement fields (`amountPaid`, `settlementStatus`, `dueDate`); `amountDue` is always derived (`total − amountPaid`), never stored. The supplier "AP account" (outstanding + aging) is a derived roll-up of unpaid approved invoices — there is **no** balance store. Pure FIFO allocation + pure settlement-status helpers back the services; aging reuses the existing `pos/aging.ts` `computeAging`. UI mirrors the existing wholesale AccountsPage and 2b-i invoice surfaces.

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie/IndexedDB, next-intl (en/ar/prs/ps), ShadCN via `@ultranos/ui-kit`, Vitest + fake-indexeddb + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-11-procurement-phase2bii-supplier-payments-settlement-design.md`

## Global Constraints

- **Money:** integer minor units everywhere; use `Math.round` for any derived money. Never floats in storage.
- **Derived, never stored:** `amountDue = total − amountPaid` is computed on read (helper `computeAmountDue`); it is never a stored field. There is **no** supplier balance/account store — outstanding + aging are recomputed from invoices every read.
- **Dexie versioning is append-only:** add a new `this.version(19)` block; NEVER edit the existing v1–v18 blocks (editing an old version block corrupts the DB).
- **Sync:** every new/updated record enqueues via `enqueuePharmacySyncEntry({ resourceType, resourceId, action, payload, hlcTimestamp, createdAt })`; `resourceType` is a plain string. Supplier AP data is **non-PHI operational** (money + ids) — not encrypted, consistent with `supplierInvoices`.
- **No PHI in logs/errors/comments:** log the shape, never content; `console.error` messages use `err instanceof Error ? err.message : 'unknown'`, never patient/clinical content. (Supplier/invoice/payment records are non-PHI, but keep the discipline.)
- **Design system (binding on every UI task):** ShadCN from `@/components/ui/*` / ui-kit; icons from `@ultranos/ui-kit/icons`; semantic oklch tokens only (`bg-card`, `text-foreground`, `text-muted-foreground`, `bg-success/10 text-success`, `bg-warning/10 text-warning`, `text-destructive`, `ring-border`) — **no hardcoded hex or raw oklch**; money in `font-numeric`; RTL logical properties (`ms-*`/`me-*`, `text-start`/`text-end`); `EmptyState` for empty/loading; OPD list-page and detail-page layout standards (standalone `<h1 className="text-2xl font-semibold text-foreground">`, page root `flex flex-col gap-4`, content box `overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`, table `<thead className="bg-muted">` + `th` `px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide`, `<tbody className="divide-y divide-border">`, rows `hover:bg-muted/50`).
- **i18n:** all user-facing strings across `messages/{en,ar,prs,ps}.json`; keys must exist in all four locales with identical key sets and preserved `{placeholders}`.
- **Only approved invoices are payable.** `pending`/`disputed` invoices never appear in payables and cannot receive a payment.

---

## File Structure

**Create:**
- `src/lib/procurement/ap-invoice.ts` — pure `computeAmountDue` / `computeSettlementStatus`.
- `src/lib/procurement/ap-allocation.ts` — pure `allocateFifo`.
- `src/lib/procurement/supplier-payment-service.ts` — record/void/query + typed errors.
- `src/lib/procurement/supplier-account-service.ts` — derived payables/account.
- `src/components/pharmacy/procurement/SupplierPayablesPage.tsx` — payables list.
- `src/components/pharmacy/procurement/SupplierAccountDetailPage.tsx` — account detail + record payment (FIFO) + void.
- `src/app/[locale]/(app)/inventory/payables/page.tsx` + `.../payables/[supplierId]/page.tsx` — routes.
- Tests under `src/__tests__/`.

**Modify:**
- `src/lib/procurement/types.ts` — `SupplierInvoice` settlement fields; `Supplier.paymentTermsDays`; `SupplierPayment` types.
- `src/lib/db.ts` — `supplierPayments` EntityTable + v19 store + upgrade.
- `src/lib/procurement/supplier-invoice-service.ts` — `createSupplierInvoice` gains `dueDate` + settlement init.
- `src/lib/procurement/supplier-service.ts` — `createSupplier`/`updateSupplier` accept `paymentTermsDays`.
- `src/components/pharmacy/procurement/SupplierInvoiceDetailPage.tsx` — settlement panel + single-invoice pay + payments list.
- `src/components/pharmacy/procurement/NewSupplierInvoicePage.tsx` — `dueDate` field.
- `src/components/pharmacy/procurement/SupplierForm.tsx` — `paymentTermsDays` field.
- `src/components/sidebar/nav-config.ts` — Payables nav item.
- `messages/{en,ar,prs,ps}.json` — new strings.

**Test harness (every service/DB test uses this exact `beforeEach`):**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

beforeEach(async () => {
  await db.delete()
  await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(
      await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    )
  }
})
```

---

## Task 1: Types + Dexie v19 store

**Files:**
- Modify: `src/lib/procurement/types.ts`
- Modify: `src/lib/db.ts`
- Test: `src/__tests__/supplier-payments-schema.test.ts`

**Interfaces:**
- Consumes: existing `SupplierInvoice`, `Supplier` (types.ts); `PharmacyLiteDatabase` (db.ts).
- Produces:
  - `SupplierInvoice` gains optional `dueDate?: string`, `amountPaid?: number`, `settlementStatus?: SettlementStatus`.
  - `Supplier` gains optional `paymentTermsDays?: number`.
  - `export type SettlementStatus = 'unpaid' | 'partial' | 'paid'`
  - `export type SupplierPaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'other'`
  - `export type SupplierPaymentStatus = 'active' | 'void'`
  - `export interface SupplierPaymentAllocation { supplierInvoiceId: string; invoiceNumber: string; amount: number }`
  - `export interface SupplierPayment { id; supplierId; supplierName; amount; method: SupplierPaymentMethod; reference?; allocations: SupplierPaymentAllocation[]; status: SupplierPaymentStatus; notes?; paidBy; paidAt; voidedBy?; voidReason?; voidedAt?; hlcTimestamp }` (all `string` except `amount: number` and the typed unions/array)
  - `db.supplierPayments: EntityTable<SupplierPayment, 'id'>`

- [ ] **Step 1: Add the new types to `types.ts`**

Append to `src/lib/procurement/types.ts` (after the existing `SupplierInvoice` interface):
```ts
export type SettlementStatus = 'unpaid' | 'partial' | 'paid'

export type SupplierPaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'other'
export type SupplierPaymentStatus = 'active' | 'void'

export interface SupplierPaymentAllocation {
  supplierInvoiceId: string
  invoiceNumber: string   // denormalized for display
  amount: number          // minor units applied to this invoice
}

export interface SupplierPayment {
  id: string
  supplierId: string
  supplierName: string          // denormalized for display
  amount: number                // total minor units == Σ allocations[].amount
  method: SupplierPaymentMethod
  reference?: string
  allocations: SupplierPaymentAllocation[]
  status: SupplierPaymentStatus // 'active' → 'void'
  notes?: string
  paidBy: string
  paidAt: string
  voidedBy?: string
  voidReason?: string
  voidedAt?: string
  hlcTimestamp: string
}
```

- [ ] **Step 2: Extend `SupplierInvoice` and `Supplier` (optional fields, legacy-safe)**

In `SupplierInvoice` (types.ts), add before `createdBy`:
```ts
  /** ISO date the invoice is due (Phase 2b-ii). Absent on legacy invoices → defaults to createdAt on read. */
  dueDate?: string
  /** Total minor units paid so far (Phase 2b-ii). Absent on legacy → treated as 0. */
  amountPaid?: number
  /** Settlement state (Phase 2b-ii). Absent on legacy → derived from amountPaid. */
  settlementStatus?: SettlementStatus
```
In `Supplier` (types.ts), add after `paymentTerms?: string`:
```ts
  /** Net payment-terms days for AP due-date defaulting (Phase 2b-ii). */
  paymentTermsDays?: number
```

- [ ] **Step 3: Declare the EntityTable + v19 store in `db.ts`**

In `db.ts`, add the field declaration right after the `supplierInvoices!` line (currently line ~157):
```ts
  supplierPayments!: EntityTable<SupplierPayment, 'id'>
```
Add `SupplierPayment` to the existing procurement type import (line ~12):
```ts
import type { Supplier, PurchaseOrder, StockCount, SupplierInvoice, SupplierPayment } from './procurement/types'
```
Append a v19 block immediately after the v18 block (line ~293), inside the constructor:
```ts
    // v19: Procurement Phase 2b-ii — supplier payments + AP settlement.
    // Non-PHI operational data (money + ids only); not encrypted.
    this.version(19)
      .stores({
        supplierInvoices:
          'id, purchaseOrderId, supplierId, status, invoiceNumber, settlementStatus, [supplierId+invoiceNumber], [supplierId+status]',
        supplierPayments: 'id, supplierId, status, paidAt, [supplierId+status]',
      })
      .upgrade(async (tx) => {
        await tx.table('supplierInvoices').toCollection().modify((inv: Record<string, unknown>) => {
          if (inv['amountPaid'] === undefined) inv['amountPaid'] = 0
          if (inv['settlementStatus'] === undefined) inv['settlementStatus'] = 'unpaid'
          if (inv['dueDate'] === undefined) inv['dueDate'] = inv['createdAt']
        })
      })
```
DO NOT touch the v18 or any earlier block.

- [ ] **Step 4: Write the schema test**

Create `src/__tests__/supplier-payments-schema.test.ts` (uses the harness above):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

beforeEach(async () => {
  await db.delete()
  await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(
      await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    )
  }
})

describe('supplierPayments schema (v19)', () => {
  it('opens at version 19 with the supplierPayments store', async () => {
    expect(db.verno).toBe(19)
    // A round-trip put/get proves the store + primary key work.
    await db.supplierPayments.put({
      id: 'p1', supplierId: 's1', supplierName: 'Acme', amount: 500, method: 'cash',
      allocations: [{ supplierInvoiceId: 'i1', invoiceNumber: 'S1', amount: 500 }],
      status: 'active', paidBy: 'u1', paidAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    })
    expect((await db.supplierPayments.get('p1'))?.amount).toBe(500)
  })

  it('queries supplierPayments by the [supplierId+status] index', async () => {
    await db.supplierPayments.bulkPut([
      { id: 'p1', supplierId: 's1', supplierName: 'A', amount: 100, method: 'cash', allocations: [], status: 'active', paidBy: 'u', paidAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'p2', supplierId: 's1', supplierName: 'A', amount: 200, method: 'cash', allocations: [], status: 'void', paidBy: 'u', paidAt: '2026-01-02T00:00:00.000Z', hlcTimestamp: '2026-01-02T00:00:00.000Z' },
    ])
    const active = await db.supplierPayments.where('[supplierId+status]').equals(['s1', 'active']).toArray()
    expect(active).toHaveLength(1)
    expect(active[0]!.id).toBe('p1')
  })
})
```

- [ ] **Step 5: Run the test**

Run: `pnpm -F pharmacy-lite test run supplier-payments-schema`
Expected: 2 pass. Also run `pnpm -F pharmacy-lite typecheck` — no NEW errors in `types.ts`/`db.ts`.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/types.ts apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/__tests__/supplier-payments-schema.test.ts
git commit -m "feat(pharmacy-lite): AP settlement types + supplierPayments store (Dexie v19)"
```

---

## Task 2: Pure settlement helpers (`ap-invoice.ts`)

**Files:**
- Create: `src/lib/procurement/ap-invoice.ts`
- Test: `src/__tests__/ap-invoice.test.ts`

**Interfaces:**
- Consumes: `SupplierInvoice`, `SettlementStatus` (Task 1).
- Produces:
  - `computeAmountDue(inv: { total: number; amountPaid?: number }): number`
  - `computeSettlementStatus(inv: { total: number; amountPaid?: number }): SettlementStatus`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/ap-invoice.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeAmountDue, computeSettlementStatus } from '@/lib/procurement/ap-invoice'

describe('computeAmountDue', () => {
  it('is total when nothing paid (amountPaid undefined → 0)', () => {
    expect(computeAmountDue({ total: 1000 })).toBe(1000)
  })
  it('is total − amountPaid', () => {
    expect(computeAmountDue({ total: 1000, amountPaid: 400 })).toBe(600)
  })
  it('clamps to 0 when overpaid', () => {
    expect(computeAmountDue({ total: 1000, amountPaid: 1200 })).toBe(0)
  })
})

describe('computeSettlementStatus', () => {
  it('unpaid when nothing paid', () => {
    expect(computeSettlementStatus({ total: 1000 })).toBe('unpaid')
    expect(computeSettlementStatus({ total: 1000, amountPaid: 0 })).toBe('unpaid')
  })
  it('partial when some but not all paid', () => {
    expect(computeSettlementStatus({ total: 1000, amountPaid: 400 })).toBe('partial')
  })
  it('paid when fully paid or overpaid', () => {
    expect(computeSettlementStatus({ total: 1000, amountPaid: 1000 })).toBe('paid')
    expect(computeSettlementStatus({ total: 1000, amountPaid: 1200 })).toBe('paid')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run ap-invoice`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/procurement/ap-invoice.ts`:
```ts
import type { SettlementStatus } from './types'

/** Remaining amount owed on an invoice (minor units), clamped ≥ 0. Derived — never stored. */
export function computeAmountDue(inv: { total: number; amountPaid?: number }): number {
  return Math.max(0, inv.total - (inv.amountPaid ?? 0))
}

/** Settlement state derived from amountPaid vs total. */
export function computeSettlementStatus(inv: { total: number; amountPaid?: number }): SettlementStatus {
  if (computeAmountDue(inv) <= 0) return 'paid'
  if ((inv.amountPaid ?? 0) > 0) return 'partial'
  return 'unpaid'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run ap-invoice`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/ap-invoice.ts apps/pharmacy-lite/src/__tests__/ap-invoice.test.ts
git commit -m "feat(pharmacy-lite): pure AP settlement helpers (amountDue, settlementStatus)"
```

---

## Task 3: Pure FIFO allocator (`ap-allocation.ts`)

**Files:**
- Create: `src/lib/procurement/ap-allocation.ts`
- Test: `src/__tests__/ap-allocation.test.ts`

**Interfaces:**
- Produces:
  - `interface AllocatableInvoice { id: string; invoiceNumber: string; amountDue: number; dueDate: string }`
  - `interface AllocationLine { supplierInvoiceId: string; invoiceNumber: string; amount: number }`
  - `allocateFifo(invoices: AllocatableInvoice[], paymentAmount: number): { allocations: AllocationLine[]; unapplied: number }`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/ap-allocation.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { allocateFifo, type AllocatableInvoice } from '@/lib/procurement/ap-allocation'

const invs: AllocatableInvoice[] = [
  { id: 'b', invoiceNumber: 'B', amountDue: 300, dueDate: '2026-02-01' },
  { id: 'a', invoiceNumber: 'A', amountDue: 500, dueDate: '2026-01-01' }, // oldest due
  { id: 'c', invoiceNumber: 'C', amountDue: 200, dueDate: '2026-03-01' },
]

describe('allocateFifo', () => {
  it('applies oldest-dueDate-first and fills exactly', () => {
    const r = allocateFifo(invs, 800) // fills A(500) then B(300)
    expect(r.allocations).toEqual([
      { supplierInvoiceId: 'a', invoiceNumber: 'A', amount: 500 },
      { supplierInvoiceId: 'b', invoiceNumber: 'B', amount: 300 },
    ])
    expect(r.unapplied).toBe(0)
  })
  it('partially fills the last invoice', () => {
    const r = allocateFifo(invs, 600) // A(500) + B(100)
    expect(r.allocations).toEqual([
      { supplierInvoiceId: 'a', invoiceNumber: 'A', amount: 500 },
      { supplierInvoiceId: 'b', invoiceNumber: 'B', amount: 100 },
    ])
    expect(r.unapplied).toBe(0)
  })
  it('reports leftover when payment exceeds total outstanding', () => {
    const r = allocateFifo(invs, 1200) // total due = 1000
    expect(r.allocations.reduce((s, a) => s + a.amount, 0)).toBe(1000)
    expect(r.unapplied).toBe(200)
  })
  it('skips invoices with no amount due and single-invoice fill', () => {
    const r = allocateFifo([{ id: 'x', invoiceNumber: 'X', amountDue: 0, dueDate: '2026-01-01' }, invs[1]!], 500)
    expect(r.allocations).toEqual([{ supplierInvoiceId: 'a', invoiceNumber: 'A', amount: 500 }])
  })
  it('returns empty allocations for a zero payment', () => {
    expect(allocateFifo(invs, 0)).toEqual({ allocations: [], unapplied: 0 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run ap-allocation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/procurement/ap-allocation.ts`:
```ts
export interface AllocatableInvoice {
  id: string
  invoiceNumber: string
  amountDue: number
  dueDate: string
}

export interface AllocationLine {
  supplierInvoiceId: string
  invoiceNumber: string
  amount: number
}

/**
 * Allocate a payment across invoices oldest-dueDate-first (tie-break by invoiceNumber),
 * applying min(remaining, amountDue) to each. Returns the allocation lines and any
 * `unapplied` leftover once every invoice is full (payment exceeds total outstanding).
 * Pure — integer minor units, deterministic.
 */
export function allocateFifo(
  invoices: AllocatableInvoice[],
  paymentAmount: number,
): { allocations: AllocationLine[]; unapplied: number } {
  const sorted = [...invoices]
    .filter((i) => i.amountDue > 0)
    .sort((x, y) => (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : x.invoiceNumber.localeCompare(y.invoiceNumber)))
  const allocations: AllocationLine[] = []
  let remaining = Math.max(0, paymentAmount)
  for (const inv of sorted) {
    if (remaining <= 0) break
    const amount = Math.min(remaining, inv.amountDue)
    if (amount > 0) {
      allocations.push({ supplierInvoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount })
      remaining -= amount
    }
  }
  return { allocations, unapplied: remaining }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run ap-allocation`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/ap-allocation.ts apps/pharmacy-lite/src/__tests__/ap-allocation.test.ts
git commit -m "feat(pharmacy-lite): pure FIFO payment allocator for supplier AP"
```

---

## Task 4: Supplier payment service (record / void / query)

**Files:**
- Create: `src/lib/procurement/supplier-payment-service.ts`
- Test: `src/__tests__/supplier-payment-service.test.ts`

**Interfaces:**
- Consumes: `db` (Task 1); `computeAmountDue`, `computeSettlementStatus` (Task 2); `SupplierPayment`, `SupplierPaymentMethod` (Task 1); `enqueuePharmacySyncEntry`; `getSupplierById` from `./supplier-service`.
- Produces:
  - `class InvoiceNotApprovedError extends Error`
  - `class OverpaymentError extends Error`
  - `recordSupplierPayment(params: { supplierId; allocations: { supplierInvoiceId: string; amount: number }[]; method: SupplierPaymentMethod; reference?; notes?; paidBy: string; hlcTimestamp: string }): Promise<SupplierPayment>`
  - `voidSupplierPayment(paymentId: string, voidedBy: string, reason: string, hlcTimestamp: string): Promise<void>`
  - `getSupplierPayments(supplierId?: string): Promise<SupplierPayment[]>`
  - `getSupplierPaymentById(id: string): Promise<SupplierPayment | undefined>`
  - `getPaymentsForInvoice(supplierInvoiceId: string): Promise<SupplierPayment[]>`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/supplier-payment-service.test.ts` (harness `beforeEach` as above). Seed helper builds an approved invoice directly via `db.supplierInvoices.put`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import {
  recordSupplierPayment, voidSupplierPayment, getSupplierPayments,
  getPaymentsForInvoice, InvoiceNotApprovedError, OverpaymentError,
} from '@/lib/procurement/supplier-payment-service'
import type { SupplierInvoice } from '@/lib/procurement/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  await db.suppliers.put({ id: 's1', name: 'Acme', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' })
})

function seedInvoice(over: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'i1', invoiceNumber: 'S1', purchaseOrderId: 'po1', supplierId: 's1', supplierName: 'Acme',
    items: [], subtotal: 1000, taxRate: 0, taxAmount: 0, freight: 0, total: 1000, status: 'approved',
    dueDate: '2026-01-10', amountPaid: 0, settlementStatus: 'unpaid',
    createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...over,
  }
}

describe('recordSupplierPayment', () => {
  it('settles a single approved invoice and updates amountPaid + status', async () => {
    await db.supplierInvoices.put(seedInvoice())
    const p = await recordSupplierPayment({
      supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 1000 }],
      method: 'cash', paidBy: 'u1', hlcTimestamp: '2026-01-05T00:00:00.000Z',
    })
    expect(p.amount).toBe(1000)
    expect(p.supplierName).toBe('Acme')
    expect(p.allocations[0]).toMatchObject({ supplierInvoiceId: 'i1', invoiceNumber: 'S1', amount: 1000 })
    const inv = await db.supplierInvoices.get('i1')
    expect(inv?.amountPaid).toBe(1000)
    expect(inv?.settlementStatus).toBe('paid')
  })

  it('records a partial payment leaving status partial', async () => {
    await db.supplierInvoices.put(seedInvoice())
    await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 400 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    const inv = await db.supplierInvoices.get('i1')
    expect(inv?.amountPaid).toBe(400)
    expect(inv?.settlementStatus).toBe('partial')
  })

  it('enqueues SupplierPayment + SupplierInvoice sync entries', async () => {
    await db.supplierInvoices.put(seedInvoice())
    await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 400 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    const q = await db.syncQueue.toArray()
    expect(q.some((e) => e.resourceType === 'SupplierPayment' && e.action === 'create')).toBe(true)
    expect(q.some((e) => e.resourceType === 'SupplierInvoice' && e.action === 'update')).toBe(true)
  })

  it('throws InvoiceNotApprovedError for a pending invoice', async () => {
    await db.supplierInvoices.put(seedInvoice({ status: 'pending' }))
    await expect(recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 100 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' }))
      .rejects.toBeInstanceOf(InvoiceNotApprovedError)
  })

  it('throws OverpaymentError when amount exceeds amountDue', async () => {
    await db.supplierInvoices.put(seedInvoice({ amountPaid: 800 })) // due = 200
    await expect(recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 300 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' }))
      .rejects.toBeInstanceOf(OverpaymentError)
  })
})

describe('voidSupplierPayment', () => {
  it('restores amountPaid + settlementStatus and marks the payment void', async () => {
    await db.supplierInvoices.put(seedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 1000 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    await voidSupplierPayment(p.id, 'u2', 'wrong amount', 'h2')
    const inv = await db.supplierInvoices.get('i1')
    expect(inv?.amountPaid).toBe(0)
    expect(inv?.settlementStatus).toBe('unpaid')
    const voided = (await getSupplierPayments('s1')).find((x) => x.id === p.id)
    expect(voided?.status).toBe('void')
    expect(voided?.voidedBy).toBe('u2')
  })

  it('throws when voiding an already-void payment', async () => {
    await db.supplierInvoices.put(seedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 500 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    await voidSupplierPayment(p.id, 'u2', 'x', 'h2')
    await expect(voidSupplierPayment(p.id, 'u2', 'again', 'h3')).rejects.toThrow()
  })
})

describe('getPaymentsForInvoice', () => {
  it('returns payments whose allocations reference the invoice', async () => {
    await db.supplierInvoices.put(seedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 500 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    const list = await getPaymentsForInvoice('i1')
    expect(list.map((x) => x.id)).toContain(p.id)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run supplier-payment-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/procurement/supplier-payment-service.ts`:
```ts
import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { computeAmountDue, computeSettlementStatus } from './ap-invoice'
import { getSupplierById } from './supplier-service'
import type { SupplierPayment, SupplierPaymentAllocation, SupplierPaymentMethod } from './types'

export class InvoiceNotApprovedError extends Error {
  constructor() {
    super('Only approved invoices can receive a payment')
    this.name = 'InvoiceNotApprovedError'
  }
}

export class OverpaymentError extends Error {
  constructor() {
    super('Payment allocation exceeds the amount due on an invoice')
    this.name = 'OverpaymentError'
  }
}

export async function recordSupplierPayment(params: {
  supplierId: string
  allocations: { supplierInvoiceId: string; amount: number }[]
  method: SupplierPaymentMethod
  reference?: string
  notes?: string
  paidBy: string
  hlcTimestamp: string
}): Promise<SupplierPayment> {
  const supplier = await getSupplierById(params.supplierId)
  const supplierName = supplier?.name ?? params.supplierId
  const clean = params.allocations.filter((a) => a.amount > 0)
  if (clean.length === 0) throw new Error('No allocations to record')

  const payment: SupplierPayment = {
    id: crypto.randomUUID(),
    supplierId: params.supplierId,
    supplierName,
    amount: 0, // filled below
    method: params.method,
    reference: params.reference?.trim() || undefined,
    allocations: [],
    status: 'active',
    notes: params.notes?.trim() || undefined,
    paidBy: params.paidBy,
    paidAt: params.hlcTimestamp,
    hlcTimestamp: params.hlcTimestamp,
  }

  const built: SupplierPaymentAllocation[] = []
  await db.transaction('rw', [db.supplierInvoices, db.supplierPayments], async () => {
    for (const a of clean) {
      const inv = await db.supplierInvoices.get(a.supplierInvoiceId)
      if (!inv) throw new Error('Supplier invoice not found')
      if (inv.status !== 'approved') throw new InvoiceNotApprovedError()
      if (a.amount > computeAmountDue(inv)) throw new OverpaymentError()
      const nextPaid = (inv.amountPaid ?? 0) + a.amount
      await db.supplierInvoices.update(inv.id, {
        amountPaid: nextPaid,
        settlementStatus: computeSettlementStatus({ total: inv.total, amountPaid: nextPaid }),
        hlcTimestamp: params.hlcTimestamp,
      })
      built.push({ supplierInvoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amount: a.amount })
    }
    payment.allocations = built
    payment.amount = built.reduce((s, x) => s + x.amount, 0)
    await db.supplierPayments.add(payment)
  })

  await enqueuePharmacySyncEntry({
    resourceType: 'SupplierPayment', resourceId: payment.id, action: 'create',
    payload: payment as unknown as Record<string, unknown>, hlcTimestamp: params.hlcTimestamp, createdAt: params.hlcTimestamp,
  })
  for (const a of built) {
    const inv = await db.supplierInvoices.get(a.supplierInvoiceId)
    if (inv) {
      await enqueuePharmacySyncEntry({
        resourceType: 'SupplierInvoice', resourceId: inv.id, action: 'update',
        payload: inv as unknown as Record<string, unknown>, hlcTimestamp: params.hlcTimestamp, createdAt: params.hlcTimestamp,
      })
    }
  }
  return payment
}

export async function voidSupplierPayment(
  paymentId: string, voidedBy: string, reason: string, hlcTimestamp: string,
): Promise<void> {
  const payment = await db.supplierPayments.get(paymentId)
  if (!payment) throw new Error('Supplier payment not found')
  if (payment.status === 'void') throw new Error('Payment is already void')

  await db.transaction('rw', [db.supplierInvoices, db.supplierPayments], async () => {
    for (const a of payment.allocations) {
      const inv = await db.supplierInvoices.get(a.supplierInvoiceId)
      if (!inv) continue
      const nextPaid = Math.max(0, (inv.amountPaid ?? 0) - a.amount)
      await db.supplierInvoices.update(inv.id, {
        amountPaid: nextPaid,
        settlementStatus: computeSettlementStatus({ total: inv.total, amountPaid: nextPaid }),
        hlcTimestamp,
      })
    }
    await db.supplierPayments.update(paymentId, {
      status: 'void', voidedBy, voidReason: reason.trim() || undefined, voidedAt: hlcTimestamp, hlcTimestamp,
    })
  })

  const updated = await db.supplierPayments.get(paymentId)
  if (updated) {
    await enqueuePharmacySyncEntry({
      resourceType: 'SupplierPayment', resourceId: paymentId, action: 'update',
      payload: updated as unknown as Record<string, unknown>, hlcTimestamp, createdAt: hlcTimestamp,
    })
  }
  for (const a of payment.allocations) {
    const inv = await db.supplierInvoices.get(a.supplierInvoiceId)
    if (inv) {
      await enqueuePharmacySyncEntry({
        resourceType: 'SupplierInvoice', resourceId: inv.id, action: 'update',
        payload: inv as unknown as Record<string, unknown>, hlcTimestamp, createdAt: hlcTimestamp,
      })
    }
  }
}

export async function getSupplierPayments(supplierId?: string): Promise<SupplierPayment[]> {
  const list = supplierId
    ? await db.supplierPayments.where('supplierId').equals(supplierId).toArray()
    : await db.supplierPayments.toArray()
  return list.sort((a, b) => b.paidAt.localeCompare(a.paidAt))
}

export async function getSupplierPaymentById(id: string): Promise<SupplierPayment | undefined> {
  return db.supplierPayments.get(id)
}

export async function getPaymentsForInvoice(supplierInvoiceId: string): Promise<SupplierPayment[]> {
  const all = await db.supplierPayments.toArray()
  return all
    .filter((p) => p.allocations.some((a) => a.supplierInvoiceId === supplierInvoiceId))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run supplier-payment-service`
Expected: PASS (9 tests). Run `pnpm -F pharmacy-lite typecheck` — no new errors in the touched file.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-payment-service.ts apps/pharmacy-lite/src/__tests__/supplier-payment-service.test.ts
git commit -m "feat(pharmacy-lite): supplier payment service (record/void/query) with invoice-level allocation"
```

---

## Task 5: Derived AP account service (`supplier-account-service.ts`)

**Files:**
- Create: `src/lib/procurement/supplier-account-service.ts`
- Test: `src/__tests__/supplier-account-service.test.ts`

**Interfaces:**
- Consumes: `db` (Task 1); `computeAmountDue` (Task 2); `computeAging`, `AgingBuckets` from `@/lib/pos/aging`; `getSupplierPayments` (Task 4); `SupplierInvoice`, `SupplierPayment` (Task 1).
- Produces:
  - `interface SupplierPayableSummary { supplierId: string; supplierName: string; outstanding: number; aging: AgingBuckets; oldestDueDate: string | null; invoiceCount: number }`
  - `interface SupplierAccountDetail { supplierId: string; supplierName: string; outstanding: number; aging: AgingBuckets; invoices: SupplierInvoice[]; payments: SupplierPayment[] }`
  - `getSupplierPayables(): Promise<SupplierPayableSummary[]>`
  - `getSupplierAccount(supplierId: string): Promise<SupplierAccountDetail>`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/supplier-account-service.test.ts` (harness `beforeEach` as above):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { getSupplierPayables, getSupplierAccount } from '@/lib/procurement/supplier-account-service'
import type { SupplierInvoice } from '@/lib/procurement/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

function inv(over: Partial<SupplierInvoice>): SupplierInvoice {
  return {
    id: 'x', invoiceNumber: 'S', purchaseOrderId: 'po', supplierId: 's1', supplierName: 'Acme',
    items: [], subtotal: 0, taxRate: 0, taxAmount: 0, freight: 0, total: 1000, status: 'approved',
    dueDate: '2026-01-01', amountPaid: 0, settlementStatus: 'unpaid',
    createdBy: 'u', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: 'h', ...over,
  }
}

describe('getSupplierPayables', () => {
  it('rolls up outstanding across a supplier’s approved-unpaid invoices, excludes paid + disputed', async () => {
    await db.supplierInvoices.bulkPut([
      inv({ id: 'a', supplierId: 's1', total: 1000, amountPaid: 0 }),
      inv({ id: 'b', supplierId: 's1', total: 500, amountPaid: 500, settlementStatus: 'paid' }), // fully paid → excluded
      inv({ id: 'c', supplierId: 's1', total: 300, status: 'disputed' }),                        // disputed → excluded
      inv({ id: 'd', supplierId: 's2', total: 700, amountPaid: 200 }),
    ])
    const payables = await getSupplierPayables()
    const s1 = payables.find((p) => p.supplierId === 's1')
    expect(s1?.outstanding).toBe(1000)
    expect(s1?.invoiceCount).toBe(1)
    const s2 = payables.find((p) => p.supplierId === 's2')
    expect(s2?.outstanding).toBe(500)
  })

  it('ages a not-yet-due invoice into the current bucket', async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    await db.supplierInvoices.put(inv({ id: 'a', dueDate: future, total: 1000, amountPaid: 0 }))
    const s1 = (await getSupplierPayables()).find((p) => p.supplierId === 's1')
    expect(s1?.aging.current).toBe(1000)
    expect(s1?.aging.ninetyPlus).toBe(0)
  })
})

describe('getSupplierAccount', () => {
  it('returns unpaid approved invoices sorted by dueDate + this supplier’s payments', async () => {
    await db.suppliers.put({ id: 's1', name: 'Acme', isActive: true, createdAt: 'h' })
    await db.supplierInvoices.bulkPut([
      inv({ id: 'a', dueDate: '2026-03-01', total: 300, amountPaid: 0 }),
      inv({ id: 'b', dueDate: '2026-01-01', total: 700, amountPaid: 0 }),
    ])
    const acct = await getSupplierAccount('s1')
    expect(acct.outstanding).toBe(1000)
    expect(acct.invoices.map((i) => i.id)).toEqual(['b', 'a']) // dueDate asc
    expect(acct.supplierName).toBe('Acme')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run supplier-account-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/procurement/supplier-account-service.ts`:
```ts
import { db } from '@/lib/db'
import { computeAmountDue } from './ap-invoice'
import { getSupplierPayments } from './supplier-payment-service'
import { computeAging, type AgingBuckets } from '@/lib/pos/aging'
import type { SupplierInvoice, SupplierPayment } from './types'

export interface SupplierPayableSummary {
  supplierId: string
  supplierName: string
  outstanding: number
  aging: AgingBuckets
  oldestDueDate: string | null
  invoiceCount: number
}

export interface SupplierAccountDetail {
  supplierId: string
  supplierName: string
  outstanding: number
  aging: AgingBuckets
  invoices: SupplierInvoice[]
  payments: SupplierPayment[]
}

/** Approved invoices with a positive amountDue — the only payable invoices. */
async function getUnpaidApproved(supplierId?: string): Promise<SupplierInvoice[]> {
  const rows = supplierId
    ? await db.supplierInvoices.where('supplierId').equals(supplierId).toArray()
    : await db.supplierInvoices.where('status').equals('approved').toArray()
  return rows.filter((i) => i.status === 'approved' && computeAmountDue(i) > 0)
}

function agingFor(invoices: SupplierInvoice[]): AgingBuckets {
  return computeAging(invoices.map((i) => ({ amount: computeAmountDue(i), timestamp: i.dueDate ?? i.createdAt })))
}

export async function getSupplierPayables(): Promise<SupplierPayableSummary[]> {
  const invoices = await getUnpaidApproved()
  const bySupplier = new Map<string, SupplierInvoice[]>()
  for (const inv of invoices) {
    const list = bySupplier.get(inv.supplierId) ?? []
    list.push(inv)
    bySupplier.set(inv.supplierId, list)
  }
  const out: SupplierPayableSummary[] = []
  for (const [supplierId, list] of bySupplier) {
    const dueDates = list.map((i) => i.dueDate ?? i.createdAt).sort()
    out.push({
      supplierId,
      supplierName: list[0]!.supplierName,
      outstanding: list.reduce((s, i) => s + computeAmountDue(i), 0),
      aging: agingFor(list),
      oldestDueDate: dueDates[0] ?? null,
      invoiceCount: list.length,
    })
  }
  return out.sort((a, b) => b.outstanding - a.outstanding)
}

export async function getSupplierAccount(supplierId: string): Promise<SupplierAccountDetail> {
  const [invoices, payments, supplier] = await Promise.all([
    getUnpaidApproved(supplierId),
    getSupplierPayments(supplierId),
    db.suppliers.get(supplierId),
  ])
  invoices.sort((a, b) => (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt))
  return {
    supplierId,
    supplierName: supplier?.name ?? invoices[0]?.supplierName ?? supplierId,
    outstanding: invoices.reduce((s, i) => s + computeAmountDue(i), 0),
    aging: agingFor(invoices),
    invoices,
    payments,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run supplier-account-service`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-account-service.ts apps/pharmacy-lite/src/__tests__/supplier-account-service.test.ts
git commit -m "feat(pharmacy-lite): derived supplier AP account service (payables roll-up + aging)"
```

---

## Task 6: Due-date on invoice creation + supplier payment-terms plumbing

**Files:**
- Modify: `src/lib/procurement/supplier-invoice-service.ts:8-61` (`createSupplierInvoice`)
- Modify: `src/lib/procurement/supplier-service.ts:5-53` (`createSupplier`, `updateSupplier`)
- Test: `src/__tests__/supplier-invoice-duedate.test.ts`

**Interfaces:**
- Consumes: `getSupplierById` (supplier-service); `computeSettlementStatus` (Task 2).
- Produces: `createSupplierInvoice` now accepts optional `dueDate?: string` and sets `dueDate`, `amountPaid: 0`, `settlementStatus: 'unpaid'`; `createSupplier`/`updateSupplier` accept `paymentTermsDays?: number`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/supplier-invoice-duedate.test.ts` (harness `beforeEach`):
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { createSupplierInvoice } from '@/lib/procurement/supplier-invoice-service'
import { createPurchaseOrder } from '@/lib/procurement/purchase-order-service'
import { createSupplier } from '@/lib/procurement/supplier-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

async function seedPo(supplierId: string) {
  return createPurchaseOrder({
    supplierId, supplierName: 'Acme',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }],
    createdBy: 'u1',
  })
}

describe('createSupplierInvoice settlement defaults', () => {
  it('initializes amountPaid=0 and settlementStatus=unpaid', async () => {
    const supplier = await createSupplier({ name: 'Acme' })
    const po = await seedPo(supplier.id)
    const inv = await createSupplierInvoice({
      purchaseOrderId: po.id, invoiceNumber: 'S1',
      items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }],
      createdBy: 'u1',
    })
    expect(inv.amountPaid).toBe(0)
    expect(inv.settlementStatus).toBe('unpaid')
    expect(inv.dueDate).toBeDefined()
  })

  it('defaults dueDate to createdAt + supplier.paymentTermsDays', async () => {
    const supplier = await createSupplier({ name: 'Acme', paymentTermsDays: 30 })
    const po = await seedPo(supplier.id)
    const inv = await createSupplierInvoice({
      purchaseOrderId: po.id, invoiceNumber: 'S2',
      items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }],
      createdBy: 'u1',
    })
    const expected = new Date(new Date(inv.createdAt).getTime() + 30 * 86_400_000).toISOString()
    expect(inv.dueDate).toBe(expected)
  })

  it('honours an explicit dueDate param', async () => {
    const supplier = await createSupplier({ name: 'Acme', paymentTermsDays: 30 })
    const po = await seedPo(supplier.id)
    const inv = await createSupplierInvoice({
      purchaseOrderId: po.id, invoiceNumber: 'S3', dueDate: '2026-05-01T00:00:00.000Z',
      items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }],
      createdBy: 'u1',
    })
    expect(inv.dueDate).toBe('2026-05-01T00:00:00.000Z')
  })
})
```
> Note: if `createPurchaseOrder`'s signature differs, adapt the seed to the real signature (read `purchase-order-service.ts`); the assertions on the invoice are what matter.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run supplier-invoice-duedate`
Expected: FAIL — `dueDate`/`amountPaid` undefined.

- [ ] **Step 3a: Add `paymentTermsDays` to supplier service**

In `src/lib/procurement/supplier-service.ts`, add `paymentTermsDays?: number` to the `createSupplier` params type and to the constructed `supplier` object:
```ts
    paymentTermsDays: params.paymentTermsDays,
```
`updateSupplier` already takes `Partial<Omit<Supplier, 'id' | 'createdAt'>>`, so `paymentTermsDays` flows through with no change.

- [ ] **Step 3b: Set settlement fields + dueDate in `createSupplierInvoice`**

In `src/lib/procurement/supplier-invoice-service.ts`:
- add `dueDate?: string` to the params type;
- import the supplier lookup at the top: `import { getSupplierById } from './supplier-service'`;
- after resolving `po` and before building `invoice`, compute the due date:
```ts
  const supplier = await getSupplierById(po.supplierId)
  const termsDays = supplier?.paymentTermsDays ?? 0
  const dueDate = params.dueDate ?? new Date(new Date(now).getTime() + termsDays * 86_400_000).toISOString()
```
  (Move the `const now = new Date().toISOString()` line above this block so `now` is in scope.)
- add these three fields to the `invoice` object literal:
```ts
    dueDate,
    amountPaid: 0,
    settlementStatus: 'unpaid',
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run supplier-invoice-duedate`
Expected: PASS (3 tests). Also re-run the existing invoice-service tests to confirm no regression:
Run: `pnpm -F pharmacy-lite test run supplier-invoice`
Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-invoice-service.ts apps/pharmacy-lite/src/lib/procurement/supplier-service.ts apps/pharmacy-lite/src/__tests__/supplier-invoice-duedate.test.ts
git commit -m "feat(pharmacy-lite): default invoice dueDate from supplier terms + settlement init"
```

---

## Task 7: i18n keys (4 locales)

**Files:**
- Modify: `apps/pharmacy-lite/messages/en.json`, `ar.json`, `prs.json`, `ps.json`

**Interfaces:**
- Produces: a new `supplierPayments` namespace + `sidebar.payables` + additions to the existing `supplierInvoices` namespace (settlement panel) + `procurement.paymentTermsDays` (SupplierForm) + `supplierInvoices.fieldDueDate` (capture form). All UI tasks (8–11) consume these.

- [ ] **Step 1: Add the keys to `en.json`**

Add a new top-level `"supplierPayments"` namespace (place near `supplierInvoices`):
```json
"supplierPayments": {
  "title": "Payables",
  "loading": "Loading…",
  "noBalances": "No outstanding payables",
  "noBalancesDescription": "Approved supplier invoices with a balance will appear here.",
  "colSupplier": "Supplier",
  "colOutstanding": "Outstanding",
  "colOldestDue": "Oldest due",
  "colInvoiceCount": "Invoices",
  "colAging": "Aging",
  "agingCurrent": "Current",
  "agingThirty": "31–60",
  "agingSixty": "61–90",
  "agingNinety": "90+",
  "searchPlaceholder": "Search suppliers…",
  "backToPayables": "Payables",
  "outstanding": "Outstanding",
  "recordPayment": "Record payment",
  "paymentAmountLabel": "Amount",
  "paymentMethodLabel": "Method",
  "paymentReferenceLabel": "Reference (optional)",
  "methodCash": "Cash",
  "methodBankTransfer": "Bank transfer",
  "methodCheque": "Cheque",
  "methodOther": "Other",
  "allocationPreview": "This payment will settle:",
  "allocationExceeds": "Amount exceeds total outstanding.",
  "confirm": "Confirm payment",
  "recording": "Recording…",
  "cancel": "Cancel",
  "unpaidInvoices": "Unpaid invoices",
  "colInvoiceNo": "Invoice #",
  "colDue": "Due",
  "colAmountDue": "Amount due",
  "overdue": "Overdue",
  "payments": "Payments",
  "colDate": "Date",
  "colAmount": "Amount",
  "colMethod": "Method",
  "colStatus": "Status",
  "statusActive": "Active",
  "statusVoid": "Void",
  "void": "Void",
  "voidReasonLabel": "Reason for voiding",
  "voidReasonRequired": "A reason is required to void a payment.",
  "confirmVoid": "Confirm void",
  "paidBy": "Paid by {who}",
  "voidedBy": "Voided by {who}",
  "empty": "Supplier not found"
},
```
Add to the existing `"sidebar"` namespace: `"payables": "Payables"`.
Add to the existing `"supplierInvoices"` namespace:
```json
"settlementSection": "Settlement",
"amountPaid": "Amount paid",
"amountDue": "Amount due",
"settlementUnpaid": "Unpaid",
"settlementPartial": "Partial",
"settlementPaid": "Paid",
"recordPayment": "Record payment",
"paymentAmountLabel": "Amount",
"paymentMethodLabel": "Method",
"methodCash": "Cash",
"methodBankTransfer": "Bank transfer",
"methodCheque": "Cheque",
"methodOther": "Other",
"confirmPayment": "Confirm payment",
"paymentsHistory": "Payments",
"fieldDueDate": "Due date"
```
Add to the existing `"procurement"` namespace: `"paymentTermsDays": "Payment terms (days)"`.

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the same key sets with accurate translations for Arabic (`ar`), Dari (`prs`), and Pashto (`ps`). Every key present in `en.json` above must exist in all three, with `{who}` placeholders preserved verbatim. Do NOT copy English/Arabic text into the Pashto file — use real Pashto (this was a real defect in 2b-i).

- [ ] **Step 3: Verify parity + JSON validity**

Run:
```bash
node -e "const l=['en','ar','prs','ps'].map(x=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+x+'.json','utf8')));const keys=o=>Object.keys(o).sort().join(',');const chk=(ns)=>l.every(m=>keys(m[ns])===keys(l[0][ns]))||ns;console.log(['supplierPayments','supplierInvoices','sidebar','procurement'].map(chk).filter(x=>x!==true).length?'PARITY FAIL':'PARITY OK')"
```
Expected: `PARITY OK`. (If it prints FAIL, a namespace's key set differs across locales — fix before committing.)

- [ ] **Step 4: Commit**
```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): i18n for supplier payments / AP settlement (4 locales)"
```

---

## Task 8: Supplier Payables list page + route + nav

**Files:**
- Create: `src/components/pharmacy/procurement/SupplierPayablesPage.tsx`
- Create: `src/app/[locale]/(app)/inventory/payables/page.tsx`
- Modify: `src/components/sidebar/nav-config.ts:77` (add Payables item)
- Test: `src/__tests__/SupplierPayablesPage.test.tsx`

**Interfaces:**
- Consumes: `getSupplierPayables`, `SupplierPayableSummary` (Task 5); `supplierPayments` i18n (Task 7).

- [ ] **Step 1: Add the nav item**

In `nav-config.ts`, add directly after the `invoices` line (line 77):
```ts
      { titleKey: 'payables',      url: '/inventory/payables' },
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/SupplierPayablesPage.test.tsx`. Mock the service + next-intl (mirror the 2b-i page tests — `vi.mock('next-intl', ...)` returning a passthrough `useTranslations` that returns the key, and `vi.mock` the service). Assert the page lists a supplier's outstanding and shows the empty state when there are none:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SupplierPayablesPage } from '@/components/pharmacy/procurement/SupplierPayablesPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const getSupplierPayables = vi.fn()
vi.mock('@/lib/procurement/supplier-account-service', () => ({ getSupplierPayables: () => getSupplierPayables() }))
vi.mock('@/lib/db', () => ({ db: { pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2 }) }) } } }))

beforeEach(() => getSupplierPayables.mockReset())

describe('SupplierPayablesPage', () => {
  it('renders a supplier row with outstanding', async () => {
    getSupplierPayables.mockResolvedValue([
      { supplierId: 's1', supplierName: 'Acme', outstanding: 150000, aging: { current: 150000, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 }, oldestDueDate: '2026-01-01', invoiceCount: 2 },
    ])
    render(<SupplierPayablesPage />)
    expect(await screen.findByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('AFN 1500.00')).toBeInTheDocument()
  })

  it('shows the empty state when nothing is owed', async () => {
    getSupplierPayables.mockResolvedValue([])
    render(<SupplierPayablesPage />)
    expect(await screen.findByText('noBalances')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run SupplierPayablesPage`
Expected: FAIL — component not found.

- [ ] **Step 4: Implement the page**

Create `src/components/pharmacy/procurement/SupplierPayablesPage.tsx` following the OPD list-page standard and the wholesale `AccountsPage` pattern (local `formatAmount`, currency from `pharmacySettings`, one content box with loading/empty/table states). Columns: supplier, outstanding (`font-numeric text-warning`), oldest due, invoice count, and an aging summary (render the four buckets, using `text-destructive` when `ninetyPlus > 0`, else `text-warning` when `sixtyDay > 0`). Toolbar: a wide `SearchInput` (`min-w-[200px] flex-1`, from `@ultranos/ui-kit/components/ui/search-input`) filtering supplier name in memory. Each row links to `/inventory/payables/${supplierId}` via `useRouter().push`. Use `EmptyState` (icon `Wallet` from `@ultranos/ui-kit/icons`) inside the box for loading (`title={t('loading')}`) and empty (`title={t('noBalances')} description={t('noBalancesDescription')}`). `t = useTranslations('supplierPayments')`.

- [ ] **Step 5: Create the route**

Create `src/app/[locale]/(app)/inventory/payables/page.tsx`:
```tsx
import { SupplierPayablesPage } from '@/components/pharmacy/procurement/SupplierPayablesPage'
export default function Page() {
  return <SupplierPayablesPage />
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run SupplierPayablesPage`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierPayablesPage.tsx apps/pharmacy-lite/src/app/[locale]/\(app\)/inventory/payables/page.tsx apps/pharmacy-lite/src/components/sidebar/nav-config.ts apps/pharmacy-lite/src/__tests__/SupplierPayablesPage.test.tsx
git commit -m "feat(pharmacy-lite): supplier payables list page + nav"
```

---

## Task 9: Supplier Account Detail page (record payment FIFO + void)

**Files:**
- Create: `src/components/pharmacy/procurement/SupplierAccountDetailPage.tsx`
- Create: `src/app/[locale]/(app)/inventory/payables/[supplierId]/page.tsx`
- Test: `src/__tests__/SupplierAccountDetailPage.test.tsx`

**Interfaces:**
- Consumes: `getSupplierAccount`, `SupplierAccountDetail` (Task 5); `recordSupplierPayment`, `voidSupplierPayment` (Task 4); `allocateFifo` (Task 3); `computeAmountDue` (Task 2); `supplierPayments` i18n (Task 7).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/SupplierAccountDetailPage.test.tsx`. Mock next-intl, next/navigation (`useParams` returns `{ supplierId: 's1' }`), the account + payment services, and `db` (settings). Assert the outstanding renders, the record-payment dialog shows a FIFO allocation preview for an entered amount, and confirming calls `recordSupplierPayment`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SupplierAccountDetailPage } from '@/components/pharmacy/procurement/SupplierAccountDetailPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ supplierId: 's1' }) }))
const getSupplierAccount = vi.fn()
const recordSupplierPayment = vi.fn().mockResolvedValue({ id: 'p1' })
const voidSupplierPayment = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/procurement/supplier-account-service', () => ({ getSupplierAccount: () => getSupplierAccount() }))
vi.mock('@/lib/procurement/supplier-payment-service', () => ({
  recordSupplierPayment: (...a: unknown[]) => recordSupplierPayment(...a),
  voidSupplierPayment: (...a: unknown[]) => voidSupplierPayment(...a),
}))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: { getState: () => ({ session: { userId: 'u1', practitionerId: 'pr1' } }) } }))
vi.mock('@/lib/db', () => ({ db: { pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2 }) }) } } }))

beforeEach(() => {
  getSupplierAccount.mockReset(); recordSupplierPayment.mockClear()
  getSupplierAccount.mockResolvedValue({
    supplierId: 's1', supplierName: 'Acme', outstanding: 100000,
    aging: { current: 100000, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 },
    invoices: [{ id: 'i1', invoiceNumber: 'S1', total: 100000, amountPaid: 0, settlementStatus: 'unpaid', dueDate: '2026-01-01', supplierId: 's1', supplierName: 'Acme', status: 'approved', items: [], subtotal: 100000, taxRate: 0, taxAmount: 0, freight: 0, createdBy: 'u', createdAt: 'h', hlcTimestamp: 'h' }],
    payments: [],
  })
})

describe('SupplierAccountDetailPage', () => {
  it('renders outstanding and opens a payment dialog with a FIFO preview', async () => {
    render(<SupplierAccountDetailPage />)
    expect(await screen.findByText('Acme')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('open-record-payment'))
    fireEvent.change(screen.getByTestId('payment-amount'), { target: { value: '500' } })
    // 50000 minor units allocated to S1 → preview shows the invoice number
    expect(await screen.findByText(/S1/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('confirm-payment'))
    await waitFor(() => expect(recordSupplierPayment).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run SupplierAccountDetailPage`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the page**

Create `src/components/pharmacy/procurement/SupplierAccountDetailPage.tsx` (detail-page standard). Structure:
- `t = useTranslations('supplierPayments')`; `useParams()` → `supplierId`; `useRouter()`.
- Load `getSupplierAccount(supplierId)` into state; load currency from `db.pharmacySettings` (like `AccountsPage`). Local `formatAmount` + `parseToMinor` helpers (copy from `AccountsPage`).
- `w-fit` ghost back button (`ChevronLeft`, label `t('backToPayables')`) → `router.push('/inventory/payables')`.
- Header card: supplier name `<h1>`, total outstanding (`font-numeric`), the four aging buckets.
- **Record payment** button (`data-testid="open-record-payment"`) opens a `Dialog`: amount `Input` (`data-testid="payment-amount"`, minor via `parseToMinor`), a method `<select>` (`cash`/`bank_transfer`/`cheque`/`other`, labelled via `t('methodCash')` etc.), optional reference `Input`. On amount change, compute `allocateFifo(account.invoices.map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber, amountDue: computeAmountDue(i), dueDate: i.dueDate ?? i.createdAt })), amountMinor)`; render `t('allocationPreview')` + the allocation lines (invoice # + `fmt(amount)`); if `unapplied > 0`, show `t('allocationExceeds')` in `text-warning` and disable confirm. Confirm (`data-testid="confirm-payment"`) calls `recordSupplierPayment({ supplierId, allocations: preview.allocations.map(a => ({ supplierInvoiceId: a.supplierInvoiceId, amount: a.amount })), method, reference, paidBy, hlcTimestamp: new Date().toISOString() })`, then reloads. `paidBy = session?.practitionerId ?? session?.userId ?? 'unknown'` via `useAuthSessionStore.getState()`.
- Unpaid-invoice table (box idiom): invoice #, due date, amountDue (`font-numeric`), an `t('overdue')` chip (`text-destructive`) when `new Date(dueDate) < new Date()`.
- Payments table: date, amount, method, status badge (`active`→muted, `void`→`text-muted-foreground line-through`), and a **Void** button (`data-testid={`void-payment-${p.id}`}`) for `active` payments → a small reason dialog (`voidReasonLabel`, required → `voidReasonRequired`) calling `voidSupplierPayment(p.id, voidedBy, reason, new Date().toISOString())` then reload. Show `paidBy`/`voidedBy` attribution.
- `EmptyState` for loading (`title={t('loading')}`) and not-found (`title={t('empty')}`).

- [ ] **Step 4: Create the route**

Create `src/app/[locale]/(app)/inventory/payables/[supplierId]/page.tsx`:
```tsx
import { SupplierAccountDetailPage } from '@/components/pharmacy/procurement/SupplierAccountDetailPage'
export default function Page() {
  return <SupplierAccountDetailPage />
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run SupplierAccountDetailPage`
Expected: PASS. Also `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierAccountDetailPage.tsx apps/pharmacy-lite/src/app/[locale]/\(app\)/inventory/payables/\[supplierId\]/page.tsx apps/pharmacy-lite/src/__tests__/SupplierAccountDetailPage.test.tsx
git commit -m "feat(pharmacy-lite): supplier AP account detail — record payment (FIFO) + void"
```

---

## Task 10: Settlement panel + single-invoice pay on Invoice Detail

**Files:**
- Modify: `src/components/pharmacy/procurement/SupplierInvoiceDetailPage.tsx`
- Test: `src/__tests__/SupplierInvoiceDetailPage.test.tsx` (extend the existing file)

**Interfaces:**
- Consumes: `recordSupplierPayment` (Task 4); `getPaymentsForInvoice` (Task 4); `computeAmountDue`, `computeSettlementStatus` (Task 2); `supplierInvoices` settlement i18n (Task 7).

- [ ] **Step 1: Extend the test**

In `src/__tests__/SupplierInvoiceDetailPage.test.tsx`, add a case: an `approved`, unpaid invoice shows a settlement panel with an amount-due figure and a **Record payment** action that, when used, calls `recordSupplierPayment` with the invoice's amountDue. Mock `recordSupplierPayment`/`getPaymentsForInvoice` alongside the existing mocks. Assert the settlement section renders (`screen.getByText('settlementSection')`) and confirming a payment calls the service. (Follow the file's existing mock structure.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run SupplierInvoiceDetailPage`
Expected: FAIL — new assertions unmet.

- [ ] **Step 3: Implement**

In `SupplierInvoiceDetailPage.tsx`:
- import `recordSupplierPayment` from `@/lib/procurement/supplier-payment-service`, `getPaymentsForInvoice` from the same, and `computeAmountDue`, `computeSettlementStatus` from `@/lib/procurement/ap-invoice`; import the `SupplierPayment` type.
- in `load()`, also fetch `getPaymentsForInvoice(id)` into a `payments` state.
- after the Invoice details card, render a **Settlement** card (`rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50`) with `t('amountPaid')` = `fmt(invoice.amountPaid ?? 0)`, `t('amountDue')` = `fmt(computeAmountDue(invoice))`, and a settlement badge (`computeSettlementStatus(invoice)` → `settlementUnpaid`/`settlementPartial`/`settlementPaid`, reuse the success/warning/muted badge classes).
- when `invoice.status === 'approved'` and `computeAmountDue(invoice) > 0`, show a **Record payment** button that opens a small dialog: amount `Input` defaulting to the major-unit string of `computeAmountDue(invoice)` (editable, capped so `parseToMinor(...) ≤ computeAmountDue(invoice)`), method `<select>`. Confirm calls `recordSupplierPayment({ supplierId: invoice.supplierId, allocations: [{ supplierInvoiceId: invoice.id, amount }], method, paidBy: performedBy, hlcTimestamp: new Date().toISOString() })`, then `await load()`.
- render a payments-for-this-invoice list (date, amount, method, status) below the settlement card.
- Use existing tokens/`font-numeric`; keep the existing approve/dispute UI unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run SupplierInvoiceDetailPage`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierInvoiceDetailPage.tsx apps/pharmacy-lite/src/__tests__/SupplierInvoiceDetailPage.test.tsx
git commit -m "feat(pharmacy-lite): settlement panel + single-invoice payment on invoice detail"
```

---

## Task 11: Due-date field on capture form + payment-terms field on Supplier form

**Files:**
- Modify: `src/components/pharmacy/procurement/NewSupplierInvoicePage.tsx`
- Modify: `src/components/pharmacy/procurement/SupplierForm.tsx`
- Test: `src/__tests__/NewSupplierInvoicePage.test.tsx` (extend) — assert the due-date field renders.

**Interfaces:**
- Consumes: `createSupplierInvoice` `dueDate` param (Task 6); `supplierInvoices.fieldDueDate`, `procurement.paymentTermsDays` i18n (Task 7).

- [ ] **Step 1: Add `paymentTermsDays` to `SupplierForm.tsx`**

Mirror the existing `leadTimeDays` field. Add state:
```ts
  const [paymentTermsDays, setPaymentTermsDays] = useState(supplier?.paymentTermsDays?.toString() ?? '')
```
Add to the `params` object in `handleSubmit`:
```ts
        paymentTermsDays: paymentTermsDays ? parseInt(paymentTermsDays, 10) : undefined,
```
Add a numeric field next to `paymentTerms` (inside the last `grid grid-cols-1 gap-4 sm:grid-cols-2`, making it a 3-up or a new row — keep the existing `inputClasses`):
```tsx
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">{t('paymentTermsDays')}</label>
          <input
            type="number"
            value={paymentTermsDays}
            onChange={(e) => setPaymentTermsDays(e.target.value)}
            placeholder="e.g. 30"
            min={0}
            className={inputClasses}
          />
        </div>
```

- [ ] **Step 2: Add the due-date field to `NewSupplierInvoicePage.tsx`**

Read the file first. Add a `dueDate` state (`useState('')`); when a PO/supplier is selected, default it from the supplier's `paymentTermsDays` (fetch the supplier via `getSupplierById`, or if the page already loads the supplier, reuse it) as an ISO date string for an `<input type="date">`. Place a **Due date** field in the details/Section-1 card following the existing field markup, labelled `t('fieldDueDate')` (`t = useTranslations('supplierInvoices')`), `data-testid="invoice-due-date"`. Pass it through on submit: add `dueDate: dueDate ? new Date(dueDate).toISOString() : undefined` to the `createSupplierInvoice({ ... })` call.

- [ ] **Step 3: Extend the capture-form test**

In `src/__tests__/NewSupplierInvoicePage.test.tsx`, assert the due-date field renders (`screen.getByTestId('invoice-due-date')`). Keep existing assertions intact.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run NewSupplierInvoicePage`
Expected: PASS. Also `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/NewSupplierInvoicePage.tsx apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierForm.tsx apps/pharmacy-lite/src/__tests__/NewSupplierInvoicePage.test.tsx
git commit -m "feat(pharmacy-lite): invoice due-date capture + supplier payment-terms-days field"
```

---

## Final Verification (after all tasks)

- [ ] Run the full pharmacy-lite suite: `pnpm -F pharmacy-lite test run` — all green (new + regression). The 5 known pre-existing typecheck errors in unrelated test files (drug-catalog-trpc, krl-sync-worker, phi-cleanup, prescription-verify, sync-provider-pull) are NOT introduced by this work — reviewers judge only NEW errors in touched files.
- [ ] `pnpm -F pharmacy-lite typecheck` — no new errors in any file this plan touched.
- [ ] Manually confirm the money chain end-to-end in one service test path: approve → record partial → amountDue drops → void → amountDue restored.
- [ ] Confirm no PHI in any `console.*` or thrown message added by this plan.
- [ ] RTL: these AP surfaces are back-office (non-patient-facing), so CLAUDE.md's per-component RTL-snapshot mandate does not bind; RTL correctness is instead guaranteed by the Global-Constraint requirement that every new surface use logical properties (`ms-*`/`me-*`, `text-start`/`text-end`) and semantic tokens — the reviewer verifies no physical-direction classes (`ml-*`/`mr-*`/`text-left`/`text-right`) were introduced.
