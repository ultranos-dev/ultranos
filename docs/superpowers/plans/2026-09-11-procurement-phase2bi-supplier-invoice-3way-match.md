# Procurement Phase 2b-i — Supplier Invoice + 3-Way Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture supplier invoices against a PO and reconcile them three ways (ordered ↔ received ↔ billed) with qty/price variance flags and a human approve/dispute gate.

**Architecture:** A pure `computeInvoiceMatch` (reusing Phase-2a `computePoTotals` for PO net cost) is unit-tested in isolation; a `supplier-invoice-service` handles create/duplicate-check/approve/dispute over a new synced `supplierInvoices` Dexie store; the match is derived on demand (reversal-safe). UI (list / capture / 3-way-match detail) follows the app's design system.

**Tech Stack:** Next.js 15 (`'use client'`), TypeScript, Dexie (IndexedDB), next-intl, ShadCN via `@ultranos/ui-kit`, Vitest + `fake-indexeddb`, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-11-procurement-phase2bi-supplier-invoice-3way-match-design.md`

## Global Constraints

- **Money is integer minor units.** Format only at the UI edge; `Math.round` for all rounding.
- **Derived match, not stored:** only the invoice record + human decision (`status`/`approvedBy`/`approvedReason`/`disputedBy`/`disputeReason`) persist. `computeInvoiceMatch` is pure and recomputed on demand from the live PO.
- **Match semantics:** qty variance = `billedQty − quantityReceived`; `billedQty > received` is a hard flag. price variance = `unitPrice − poNetUnitCost`; flagged when `|priceVariance| > round(poNetUnitCost × tolerancePercent/100)`. Off-PO lines always flag. `status = 'matched'` iff every line matched, else `'variance'`.
- **Approve gate:** a `variance` invoice requires a non-empty override reason to approve (else throw `InvoiceVarianceUnresolvedError`); matched invoices approve with no reason.
- **`invoiceMatchTolerancePercent`** is a REQUIRED setting (default `0`).
- **Sync idiom:** `enqueuePharmacySyncEntry({ resourceType: 'SupplierInvoice', resourceId, action, payload, hlcTimestamp, createdAt })` (`resourceType` is a plain string — nothing to extend).
- **Dexie v18** adds the `supplierInvoices` store (indexed → a version bump is required).
- **DESIGN SYSTEM (binding on every UI task):** ShadCN from `@/components/ui/*` / `@ultranos/ui-kit`, icons from `@ultranos/ui-kit/icons`; **semantic oklch tokens only** (`bg-card`, `text-foreground`, `text-muted-foreground`, `bg-success/10 text-success`, `bg-warning/10 text-warning`, `text-destructive`, `ring-border`, `shadow-card`) — **NO hardcoded hex or raw oklch**; money in `font-numeric`; RTL logical props (`ms-*`/`me-*`, `text-start`/`text-end`); `EmptyState` from ui-kit for empty/loading; follow the OPD list-page standard (standalone `<h1 text-2xl font-semibold text-foreground>`, one toolbar row, one content box `overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`) and the detail/form standard (`w-fit` ghost back button). Mirror the existing `PurchaseOrdersPage.tsx` / `PurchaseOrderDetailPage.tsx` idioms.
- **i18n:** every user-facing string via `useTranslations`; add keys to all four catalogs `messages/{en,ar,prs,ps}.json`.
- **No PHI in logs/errors** (money + ids only).
- **Commits are file-scoped** (`git add <exact paths>`, never `git add -A`). Unrelated WIP exists elsewhere.
- **Known pre-existing typecheck errors** in 5 unrelated test files (drug-catalog-trpc, krl-sync-worker, phi-cleanup, prescription-verify, sync-provider-pull) — ignore; touched files must be clean.

---

### Task 1: Data model + Dexie v18 + settings default

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/procurement/types.ts`
- Modify: `apps/pharmacy-lite/src/lib/inventory/types.ts`
- Modify: `apps/pharmacy-lite/src/lib/db.ts` (table decl + import + `version(18)`)
- Test: `apps/pharmacy-lite/src/__tests__/supplier-invoice-schema.test.ts` (create)

**Interfaces:**
- Produces: `SupplierInvoiceStatus`, `SupplierInvoiceItem`, `SupplierInvoice` (in procurement types); `PharmacyInventorySettings.invoiceMatchTolerancePercent: number` (+ default 0); `db.supplierInvoices` table indexed `id, purchaseOrderId, supplierId, status, invoiceNumber, [supplierId+invoiceNumber]`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/supplier-invoice-schema.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'
import type { SupplierInvoice } from '@/lib/procurement/types'

beforeEach(async () => { await db.supplierInvoices.clear() })

describe('supplier invoice schema v18', () => {
  it('DEFAULT_PHARMACY_SETTINGS includes invoiceMatchTolerancePercent = 0', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.invoiceMatchTolerancePercent).toBe(0)
  })
  it('supplierInvoices is queryable by purchaseOrderId and by [supplierId+invoiceNumber]', async () => {
    const inv: SupplierInvoice = {
      id: 'inv-1', invoiceNumber: 'SUP-77', purchaseOrderId: 'po-1', supplierId: 's1', supplierName: 'Acme',
      items: [], subtotal: 0, taxRate: 0, taxAmount: 0, freight: 0, total: 0, status: 'pending',
      createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    }
    await db.supplierInvoices.put(inv)
    expect((await db.supplierInvoices.where('purchaseOrderId').equals('po-1').toArray()).map((x) => x.id)).toEqual(['inv-1'])
    expect((await db.supplierInvoices.where('[supplierId+invoiceNumber]').equals(['s1', 'SUP-77']).first())?.id).toBe('inv-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test supplier-invoice-schema`
Expected: FAIL — `db.supplierInvoices` undefined; setting undefined.

- [ ] **Step 3: Add the invoice types**

In `apps/pharmacy-lite/src/lib/procurement/types.ts`, append:
```ts
export type SupplierInvoiceStatus = 'pending' | 'approved' | 'disputed'

export interface SupplierInvoiceItem {
  catalogItemId: string
  catalogItemName: string
  billedQty: number
  unitPrice: number
}

export interface SupplierInvoice {
  id: string
  invoiceNumber: string
  purchaseOrderId: string
  supplierId: string
  supplierName: string
  items: SupplierInvoiceItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  freight: number
  total: number
  status: SupplierInvoiceStatus
  approvedBy?: string
  approvedReason?: string
  disputedBy?: string
  disputeReason?: string
  notes?: string
  createdBy: string
  createdAt: string
  hlcTimestamp: string
}
```

- [ ] **Step 4: Add the settings field + default**

In `apps/pharmacy-lite/src/lib/inventory/types.ts`, inside `interface PharmacyInventorySettings` (after `poSequenceNext: number`), add:
```ts
  invoiceMatchTolerancePercent: number
```
In `DEFAULT_PHARMACY_SETTINGS` (after `poSequenceNext: 1,`), add:
```ts
  invoiceMatchTolerancePercent: 0,
```

- [ ] **Step 5: Add the Dexie table + v18 store**

In `apps/pharmacy-lite/src/lib/db.ts`:
Add the import of `SupplierInvoice` to the existing procurement-types import (find the line importing `PurchaseOrder`/`Supplier` from `./procurement/types` and add `SupplierInvoice`).
Add the table field after `purchaseOrders!: ...` (line 156):
```ts
  supplierInvoices!: EntityTable<SupplierInvoice, 'id'>
```
Add the version block after the `version(17)` block (ends line ~286):
```ts
    // v18: Procurement Phase 2b-i — supplier invoices for 3-way match.
    // Non-PHI operational data; not encrypted.
    this.version(18).stores({
      supplierInvoices: 'id, purchaseOrderId, supplierId, status, invoiceNumber, [supplierId+invoiceNumber]',
    })
```

- [ ] **Step 6: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test supplier-invoice-schema`
Run: `pnpm -F pharmacy-lite typecheck`
Expected: test passes; no new errors. If adding the required `invoiceMatchTolerancePercent` breaks any other full-settings constructor, add it there too (in Phase 1/2a this was only `DEFAULT_PHARMACY_SETTINGS`).

- [ ] **Step 7: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/types.ts apps/pharmacy-lite/src/lib/inventory/types.ts apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/__tests__/supplier-invoice-schema.test.ts
git commit -m "feat(pharmacy-lite): supplier invoice data model + v18 store (Phase 2b-i)"
```

---

### Task 2: Pure `computeInvoiceMatch`

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/invoice-match.ts`
- Test: `apps/pharmacy-lite/src/__tests__/invoice-match.test.ts` (create)

**Interfaces:**
- Consumes: `computePoTotals` (Phase 2a); `PurchaseOrder`, `SupplierInvoice` (Task 1).
- Produces:
  - `interface InvoiceMatchLine { catalogItemId; catalogItemName; billedQty; receivedQty; unitPrice; poNetUnitCost; qtyVariance; priceVariance; overBilled; offPo; priceOverTolerance; matched }`
  - `interface InvoiceMatchResult { status: 'matched'|'variance'; lines: InvoiceMatchLine[]; hasOverBill: boolean; hasOffPo: boolean; totalVariance: number }`
  - `computeInvoiceMatch(invoice: SupplierInvoice, po: PurchaseOrder, tolerancePercent: number): InvoiceMatchResult`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/invoice-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeInvoiceMatch } from '@/lib/procurement/invoice-match'
import type { PurchaseOrder, SupplierInvoice } from '@/lib/procurement/types'

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po-1', poNumber: 'PO-2026-0001', supplierId: 's1', supplierName: 'Acme', status: 'partially_received',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 8, unitCost: 100 }],
    subtotal: 1000, taxRate: 0, taxAmount: 0, freight: 0, totalCost: 1000,
    createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}
function inv(items: SupplierInvoice['items'], overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'inv-1', invoiceNumber: 'S1', purchaseOrderId: 'po-1', supplierId: 's1', supplierName: 'Acme',
    items, subtotal: 0, taxRate: 0, taxAmount: 0, freight: 0, total: 0, status: 'pending',
    createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}

describe('computeInvoiceMatch', () => {
  it('matched: billed = received, price = PO net cost', () => {
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }], { total: 800 }), po(), 0)
    expect(r.status).toBe('matched')
    expect(r.lines[0]!.matched).toBe(true)
    expect(r.lines[0]!.receivedQty).toBe(8)
    expect(r.lines[0]!.poNetUnitCost).toBe(100)
  })
  it('price within tolerance is matched; beyond tolerance is variance', () => {
    const within = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 104 }]), po(), 5) // tol 5 → allow ±5
    expect(within.status).toBe('matched')
    const beyond = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 110 }]), po(), 5)
    expect(beyond.status).toBe('variance')
    expect(beyond.lines[0]!.priceOverTolerance).toBe(true)
  })
  it('over-billing (billed > received) is a hard flag regardless of tolerance', () => {
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }]), po(), 50)
    expect(r.status).toBe('variance')
    expect(r.lines[0]!.overBilled).toBe(true)
    expect(r.hasOverBill).toBe(true)
    expect(r.lines[0]!.qtyVariance).toBe(2)
  })
  it('an off-PO invoice line is flagged', () => {
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'zzz', catalogItemName: 'Z', billedQty: 1, unitPrice: 50 }]), po(), 0)
    expect(r.status).toBe('variance')
    expect(r.lines[0]!.offPo).toBe(true)
    expect(r.hasOffPo).toBe(true)
  })
  it('price variance uses the PO net unit cost (after discount)', () => {
    const discountedPo = po({ items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 10, unitCost: 100, discountType: 'percent', discountValue: 10 }] })
    // net unit cost = 90; invoice at 90 → matched
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 90 }]), discountedPo, 0)
    expect(r.lines[0]!.poNetUnitCost).toBe(90)
    expect(r.status).toBe('matched')
  })
  it('totalVariance = invoice.total − expectedValue (min(billed,received) × net + tax + freight)', () => {
    // received 8, billed 8, net 100, tax 0, freight 0 → expected 800; invoice.total 850 → variance 50
    const r = computeInvoiceMatch(inv([{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }], { total: 850 }), po(), 0)
    expect(r.totalVariance).toBe(50)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test invoice-match`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `invoice-match.ts`**

Create `apps/pharmacy-lite/src/lib/procurement/invoice-match.ts`:

```ts
import { computePoTotals } from './po-totals'
import type { PurchaseOrder, SupplierInvoice } from './types'

export interface InvoiceMatchLine {
  catalogItemId: string
  catalogItemName: string
  billedQty: number
  receivedQty: number
  unitPrice: number
  poNetUnitCost: number
  qtyVariance: number
  priceVariance: number
  overBilled: boolean
  offPo: boolean
  priceOverTolerance: boolean
  matched: boolean
}

export interface InvoiceMatchResult {
  status: 'matched' | 'variance'
  lines: InvoiceMatchLine[]
  hasOverBill: boolean
  hasOffPo: boolean
  totalVariance: number
}

/**
 * Pure 3-way match: invoice billed ↔ PO received ↔ PO net cost. Reads the PO's
 * live quantityReceived, so it is reversal/adjustment-safe. No DB access.
 */
export function computeInvoiceMatch(
  invoice: SupplierInvoice,
  po: PurchaseOrder,
  tolerancePercent: number,
): InvoiceMatchResult {
  const poTotals = computePoTotals(
    po.items.map((i) => ({
      catalogItemId: i.catalogItemId,
      catalogItemName: i.catalogItemName,
      quantityOrdered: i.quantityOrdered,
      unitCost: i.unitCost,
      discountType: i.discountType,
      discountValue: i.discountValue,
    })),
    po.taxRate ?? 0,
    po.freight ?? 0,
  )
  const poByItem = new Map(
    po.items.map((p, idx) => [p.catalogItemId, { received: p.quantityReceived, net: poTotals.items[idx]!.netUnitCost }]),
  )

  const lines: InvoiceMatchLine[] = invoice.items.map((it) => {
    const poEntry = poByItem.get(it.catalogItemId)
    const offPo = !poEntry
    const receivedQty = poEntry?.received ?? 0
    const poNetUnitCost = poEntry?.net ?? 0
    const qtyVariance = it.billedQty - receivedQty
    const overBilled = it.billedQty > receivedQty
    const priceVariance = it.unitPrice - poNetUnitCost
    const priceOverTolerance = !offPo && Math.abs(priceVariance) > Math.round((poNetUnitCost * tolerancePercent) / 100)
    const matched = !offPo && !overBilled && !priceOverTolerance
    return {
      catalogItemId: it.catalogItemId,
      catalogItemName: it.catalogItemName,
      billedQty: it.billedQty,
      receivedQty,
      unitPrice: it.unitPrice,
      poNetUnitCost,
      qtyVariance,
      priceVariance,
      overBilled,
      offPo,
      priceOverTolerance,
      matched,
    }
  })

  const hasOverBill = lines.some((l) => l.overBilled)
  const hasOffPo = lines.some((l) => l.offPo)
  const status: 'matched' | 'variance' = lines.every((l) => l.matched) ? 'matched' : 'variance'
  const expectedValue =
    lines.reduce((s, l) => s + Math.min(l.billedQty, l.receivedQty) * l.poNetUnitCost, 0) + invoice.taxAmount + invoice.freight
  const totalVariance = invoice.total - expectedValue

  return { status, lines, hasOverBill, hasOffPo, totalVariance }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test invoice-match`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/invoice-match.ts apps/pharmacy-lite/src/__tests__/invoice-match.test.ts
git commit -m "feat(pharmacy-lite): pure 3-way supplier-invoice match"
```

---

### Task 3: Invoice service — create + duplicate check + queries

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/supplier-invoice-service.ts`
- Test: `apps/pharmacy-lite/src/__tests__/supplier-invoice-create.test.ts` (create)

**Interfaces:**
- Consumes: `computePoTotals` (2a); `getPurchaseOrderById` (existing); `enqueuePharmacySyncEntry`.
- Produces:
  - `createSupplierInvoice({ purchaseOrderId, invoiceNumber, items, taxRate?, freight?, notes?, createdBy }): Promise<SupplierInvoice>`
  - `findDuplicateInvoice(supplierId, invoiceNumber): Promise<SupplierInvoice | undefined>`
  - `getSupplierInvoices(statusFilter?): Promise<SupplierInvoice[]>`, `getSupplierInvoiceById(id)`, `getInvoicesForPO(purchaseOrderId)`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/supplier-invoice-create.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createSupplierInvoice, findDuplicateInvoice, getInvoicesForPO } from '@/lib/procurement/supplier-invoice-service'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.syncQueue]) await t.clear()
})

async function seedPO() {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  return po
}

describe('createSupplierInvoice', () => {
  it('computes totals, inherits supplier from PO, stores pending + enqueues sync', async () => {
    const po = await seedPO()
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'SUP-1', createdBy: 'u1', taxRate: 5, freight: 200,
      items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }] })
    expect(inv.supplierId).toBe('s1')
    expect(inv.subtotal).toBe(800)
    expect(inv.taxAmount).toBe(40)
    expect(inv.total).toBe(1040)
    expect(inv.status).toBe('pending')
    const entries = await db.syncQueue.where('resourceType').equals('SupplierInvoice').toArray()
    expect(entries.some((e) => e.resourceId === inv.id && e.action === 'create')).toBe(true)
  })

  it('findDuplicateInvoice detects a same-supplier same-number invoice', async () => {
    const po = await seedPO()
    await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'DUP-9', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 1, unitPrice: 100 }] })
    expect(await findDuplicateInvoice('s1', 'DUP-9')).toBeTruthy()
    expect(await findDuplicateInvoice('s1', 'OTHER')).toBeUndefined()
  })

  it('getInvoicesForPO returns invoices for that PO', async () => {
    const po = await seedPO()
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'X', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 1, unitPrice: 100 }] })
    expect((await getInvoicesForPO(po.id)).map((i) => i.id)).toContain(inv.id)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test supplier-invoice-create`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the create/query part of the service**

Create `apps/pharmacy-lite/src/lib/procurement/supplier-invoice-service.ts`:

```ts
import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { computePoTotals } from './po-totals'
import { getPurchaseOrderById } from './purchase-order-service'
import type { SupplierInvoice, SupplierInvoiceItem, SupplierInvoiceStatus } from './types'

export async function createSupplierInvoice(params: {
  purchaseOrderId: string
  invoiceNumber: string
  items: SupplierInvoiceItem[]
  taxRate?: number
  freight?: number
  notes?: string
  createdBy: string
}): Promise<SupplierInvoice> {
  const po = await getPurchaseOrderById(params.purchaseOrderId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status === 'cancelled') throw new Error('Cannot invoice a cancelled purchase order')

  const settings = await db.pharmacySettings.toCollection().first()
  const taxRate = params.taxRate ?? settings?.taxRate ?? 0
  const freight = params.freight ?? 0

  const totals = computePoTotals(
    params.items.map((i) => ({
      catalogItemId: i.catalogItemId,
      catalogItemName: i.catalogItemName,
      quantityOrdered: i.billedQty,
      unitCost: i.unitPrice,
    })),
    taxRate,
    freight,
  )

  const now = new Date().toISOString()
  const invoice: SupplierInvoice = {
    id: crypto.randomUUID(),
    invoiceNumber: params.invoiceNumber.trim(),
    purchaseOrderId: po.id,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    items: params.items,
    subtotal: totals.subtotal,
    taxRate,
    taxAmount: totals.taxAmount,
    freight,
    total: totals.grandTotal,
    status: 'pending',
    notes: params.notes?.trim() || undefined,
    createdBy: params.createdBy,
    createdAt: now,
    hlcTimestamp: now,
  }
  await db.supplierInvoices.put(invoice)
  await enqueuePharmacySyncEntry({
    resourceType: 'SupplierInvoice', resourceId: invoice.id, action: 'create',
    payload: invoice as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
  return invoice
}

export async function findDuplicateInvoice(supplierId: string, invoiceNumber: string): Promise<SupplierInvoice | undefined> {
  return db.supplierInvoices.where('[supplierId+invoiceNumber]').equals([supplierId, invoiceNumber.trim()]).first()
}

export async function getSupplierInvoices(statusFilter?: SupplierInvoiceStatus): Promise<SupplierInvoice[]> {
  if (statusFilter) return db.supplierInvoices.where('status').equals(statusFilter).reverse().sortBy('createdAt')
  return db.supplierInvoices.orderBy('createdAt').reverse().toArray()
}

export async function getSupplierInvoiceById(id: string): Promise<SupplierInvoice | undefined> {
  return db.supplierInvoices.get(id)
}

export async function getInvoicesForPO(purchaseOrderId: string): Promise<SupplierInvoice[]> {
  return db.supplierInvoices.where('purchaseOrderId').equals(purchaseOrderId).toArray()
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test supplier-invoice-create`
Run: `pnpm -F pharmacy-lite typecheck`
Expected: pass; no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-invoice-service.ts apps/pharmacy-lite/src/__tests__/supplier-invoice-create.test.ts
git commit -m "feat(pharmacy-lite): supplier invoice create + duplicate check + queries"
```

---

### Task 4: Invoice service — approve / dispute gate

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/procurement/supplier-invoice-service.ts`
- Test: `apps/pharmacy-lite/src/__tests__/supplier-invoice-approve.test.ts` (create)

**Interfaces:**
- Consumes: `computeInvoiceMatch` (Task 2), `getPurchaseOrderById`.
- Produces:
  - `class InvoiceVarianceUnresolvedError extends Error`
  - `approveSupplierInvoice(invoiceId, approvedBy, overrideReason?): Promise<void>`
  - `disputeSupplierInvoice(invoiceId, disputedBy, reason): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/supplier-invoice-approve.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createSupplierInvoice, approveSupplierInvoice, disputeSupplierInvoice, InvoiceVarianceUnresolvedError } from '@/lib/procurement/supplier-invoice-service'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import type { CatalogItem } from '@/lib/inventory/types'

const ITEM: CatalogItem = { id: 'a', name: 'A', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.catalogItems, db.stockBatches, db.stockMovements, db.goodsReceipts, db.syncQueue]) await t.clear()
  await db.catalogItems.put(ITEM)
})

async function poReceived(qty: number) {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: qty, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: qty, costPrice: 100, sellingPrice: 200 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  return po
}

describe('approve/dispute supplier invoice', () => {
  it('a matched invoice approves with no override reason', async () => {
    const po = await poReceived(8)
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'M1', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }] })
    await approveSupplierInvoice(inv.id, 'approver')
    expect((await db.supplierInvoices.get(inv.id))!.status).toBe('approved')
  })

  it('a variance invoice throws without an override reason, approves with one', async () => {
    const po = await poReceived(8)
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'V1', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }] }) // over-billed
    await expect(approveSupplierInvoice(inv.id, 'approver')).rejects.toBeInstanceOf(InvoiceVarianceUnresolvedError)
    await approveSupplierInvoice(inv.id, 'approver', 'accepted the extra 2 as a bonus')
    const stored = await db.supplierInvoices.get(inv.id)
    expect(stored!.status).toBe('approved')
    expect(stored!.approvedReason).toBe('accepted the extra 2 as a bonus')
  })

  it('dispute records status + reason', async () => {
    const po = await poReceived(8)
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'D1', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }] })
    await disputeSupplierInvoice(inv.id, 'disputer', 'price mismatch on paper copy')
    const stored = await db.supplierInvoices.get(inv.id)
    expect(stored!.status).toBe('disputed')
    expect(stored!.disputeReason).toBe('price mismatch on paper copy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test supplier-invoice-approve`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Add approve/dispute + the error**

Append to `apps/pharmacy-lite/src/lib/procurement/supplier-invoice-service.ts` (add imports `computeInvoiceMatch` from `./invoice-match`):

```ts
import { computeInvoiceMatch } from './invoice-match'

export class InvoiceVarianceUnresolvedError extends Error {
  constructor() {
    super('This invoice has a variance and needs an override reason to approve')
    this.name = 'InvoiceVarianceUnresolvedError'
  }
}

async function enqueueInvoiceUpdate(invoiceId: string, now: string): Promise<void> {
  const inv = await db.supplierInvoices.get(invoiceId)
  if (!inv) return
  await enqueuePharmacySyncEntry({
    resourceType: 'SupplierInvoice', resourceId: invoiceId, action: 'update',
    payload: inv as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
}

export async function approveSupplierInvoice(invoiceId: string, approvedBy: string, overrideReason?: string): Promise<void> {
  const inv = await db.supplierInvoices.get(invoiceId)
  if (!inv) throw new Error('Supplier invoice not found')
  const po = await getPurchaseOrderById(inv.purchaseOrderId)
  if (!po) throw new Error('Purchase order not found')
  const settings = await db.pharmacySettings.toCollection().first()
  const tolerance = settings?.invoiceMatchTolerancePercent ?? 0
  const match = computeInvoiceMatch(inv, po, tolerance)
  if (match.status === 'variance' && !overrideReason?.trim()) throw new InvoiceVarianceUnresolvedError()
  const now = new Date().toISOString()
  await db.supplierInvoices.update(invoiceId, {
    status: 'approved', approvedBy, approvedReason: overrideReason?.trim() || undefined, hlcTimestamp: now,
  })
  await enqueueInvoiceUpdate(invoiceId, now)
}

export async function disputeSupplierInvoice(invoiceId: string, disputedBy: string, reason: string): Promise<void> {
  const inv = await db.supplierInvoices.get(invoiceId)
  if (!inv) throw new Error('Supplier invoice not found')
  const now = new Date().toISOString()
  await db.supplierInvoices.update(invoiceId, {
    status: 'disputed', disputedBy, disputeReason: reason.trim() || undefined, hlcTimestamp: now,
  })
  await enqueueInvoiceUpdate(invoiceId, now)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test supplier-invoice-approve`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-invoice-service.ts apps/pharmacy-lite/src/__tests__/supplier-invoice-approve.test.ts
git commit -m "feat(pharmacy-lite): supplier invoice approve/dispute gate"
```

---

### Task 5: i18n keys

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: a `supplierInvoices` namespace + a `sidebar.invoices` key + a `settings.invoiceMatchToleranceLabel` key, consumed by Tasks 6–10.

- [ ] **Step 1: Add keys to `messages/en.json`**

Add a new top-level namespace `"supplierInvoices"`:
```json
"supplierInvoices": {
  "title": "Supplier invoices",
  "newInvoice": "Record invoice",
  "searchPlaceholder": "Search invoice # or supplier",
  "tabAll": "All", "tabPending": "Pending", "tabApproved": "Approved", "tabDisputed": "Disputed",
  "colInvoiceNo": "Invoice #", "colSupplier": "Supplier", "colPo": "PO", "colTotal": "Total", "colMatch": "Match", "colStatus": "Status", "colDate": "Date",
  "matchMatched": "Matched", "matchVariance": "Variance",
  "statusPending": "Pending", "statusApproved": "Approved", "statusDisputed": "Disputed",
  "empty": "No supplier invoices yet.", "emptyResults": "No invoices match your filters.",
  "newTitle": "Record supplier invoice",
  "fieldInvoiceNo": "Supplier invoice number", "fieldTaxRate": "Tax rate (%)", "fieldFreight": "Freight", "fieldNotes": "Notes",
  "duplicateWarning": "An invoice with this number already exists for this supplier.",
  "colBilledQty": "Billed", "colUnitPrice": "Unit price",
  "subtotal": "Subtotal", "tax": "Tax", "freight": "Freight", "grandTotal": "Total",
  "createError": "Could not record the invoice.", "selectPo": "Select a purchase order",
  "detailTitle": "Invoice {number}", "matchTitle": "3-way match",
  "colOrdered": "Ordered", "colReceived": "Received", "colPoCost": "PO cost", "colInvPrice": "Invoiced", "colQtyVar": "Qty var", "colPriceVar": "Price var",
  "flagOverBilled": "Billed above received", "flagOffPo": "Not on the PO", "flagPriceVar": "Price over tolerance",
  "approve": "Approve", "dispute": "Dispute",
  "overrideReasonLabel": "Reason to approve despite the variance", "overrideRequired": "A reason is required to approve an invoice with a variance.",
  "disputeReasonLabel": "Reason for dispute", "approveError": "Could not approve the invoice.", "disputeError": "Could not dispute the invoice.",
  "approvedBy": "Approved by {who}", "disputedBy": "Disputed by {who}", "recordedBy": "Recorded by {who}",
  "totalVariance": "Total variance"
}
```
Add to the `"sidebar"` namespace: `"invoices": "Invoices"`.
Add to the `"settings"` namespace: `"invoiceMatchToleranceLabel": "Invoice price-match tolerance (%)"`.

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the identical keys with accurate translations (preserve `{number}`/`{who}` placeholders). Where a confident translation is unavailable, use the English value as interim and list those keys per locale in your report. Every key must exist in all four files.

- [ ] **Step 3: Validate JSON**

Run: `node -e "['en','ar','prs','ps'].forEach(l=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+l+'.json','utf8')))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "i18n(pharmacy-lite): supplier invoice + 3-way match strings"
```

---

### Task 6: Supplier invoices list page + route

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierInvoicesPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/page.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/SupplierInvoicesPage.test.tsx` (create)

**Interfaces:**
- Consumes: `getSupplierInvoices` (Task 3), `getSupplierInvoiceById`→PO for match badge (via `computeInvoiceMatch`), i18n (Task 5).
- Produces: `SupplierInvoicesPage` component; `/inventory/invoices` route.

Follow `PurchaseOrdersPage.tsx` structure exactly (list-page standard: pill tabs by status, wide `SearchInput`, "Record invoice" `<Link href="/inventory/invoices/new">`, one content box table). The **match badge** column: on load, for each invoice fetch its PO (`getPurchaseOrderById`) + settings tolerance and derive `computeInvoiceMatch(...).status`; render `matched` → `bg-success/10 text-success` badge with `t('matchMatched')`, `variance` → `bg-warning/10 text-warning` with `t('matchVariance')`. Money via `font-numeric`. All tokens semantic.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/SupplierInvoicesPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { SupplierInvoicesPage } from '@/components/pharmacy/procurement/SupplierInvoicesPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { createSupplierInvoice } from '@/lib/procurement/supplier-invoice-service'
import type { CatalogItem } from '@/lib/inventory/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const ITEM: CatalogItem = { id: 'a', name: 'A', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.catalogItems, db.stockBatches, db.stockMovements, db.goodsReceipts, db.syncQueue]) await t.clear()
  await db.catalogItems.put(ITEM)
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: 8, costPrice: 100, sellingPrice: 200 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'SUP-100', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }] })
})

describe('SupplierInvoicesPage', () => {
  it('lists the invoice with a matched badge', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><SupplierInvoicesPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByText('SUP-100')).toBeInTheDocument())
    expect(screen.getByText(en.supplierInvoices.matchMatched)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm -F pharmacy-lite test SupplierInvoicesPage` → FAIL (module not found).

- [ ] **Step 3: Implement `SupplierInvoicesPage.tsx`** mirroring `PurchaseOrdersPage.tsx` (read it first). Load invoices + settings; for each, derive the match status via `getPurchaseOrderById` + `computeInvoiceMatch`; render the table with the match + status badges using semantic tokens; `EmptyState` inside the content box; pill tabs (`all`/`pending`/`approved`/`disputed`); wide `SearchInput` matching `invoiceNumber`/`supplierName`; "Record invoice" `<Link href="/inventory/invoices/new">`. Rows link to `/inventory/invoices/<id>`.

- [ ] **Step 4: Create the route** `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/page.tsx`:
```tsx
'use client'
import { SupplierInvoicesPage } from '@/components/pharmacy/procurement/SupplierInvoicesPage'
export default function SupplierInvoicesRoute() { return <SupplierInvoicesPage /> }
```

- [ ] **Step 5: Run test + typecheck** — `pnpm -F pharmacy-lite test SupplierInvoicesPage` + `pnpm -F pharmacy-lite typecheck` → pass; no new type errors.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierInvoicesPage.tsx "apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/page.tsx" apps/pharmacy-lite/src/__tests__/SupplierInvoicesPage.test.tsx
git commit -m "feat(pharmacy-lite): supplier invoices list page"
```

---

### Task 7: New supplier-invoice page (PO prefill + duplicate warning) + route

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/procurement/NewSupplierInvoicePage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/new/page.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/NewSupplierInvoicePage.test.tsx` (create)

**Interfaces:**
- Consumes: `createSupplierInvoice`, `findDuplicateInvoice` (Task 3), `getPurchaseOrderById` + `computePoTotals` for prefill, i18n (Task 5), `useSearchParams` for `poId`.

Detail/form standard: `w-fit` ghost back button, PO context from `?poId=` (load the PO; if absent, a PO `<select>` of open POs), invoice-# input, lines pre-filled from the PO — one per line with `catalogItemName`, `billedQty` default = `quantityReceived`, `unitPrice` default = the PO line `netUnitCost` (from `computePoTotals`), tax/freight inputs, live total. On invoice-# blur, call `findDuplicateInvoice(po.supplierId, number)` and show `t('duplicateWarning')` in `text-warning` when found (non-blocking). Submit → `createSupplierInvoice(...)` → `router.push('/inventory/invoices/<id>')`. Semantic tokens, `font-numeric`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/NewSupplierInvoicePage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { NewSupplierInvoicePage } from '@/components/pharmacy/procurement/NewSupplierInvoicePage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import type { CatalogItem } from '@/lib/inventory/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(`poId=${globalThis.__poid}`) }))
const ITEM: CatalogItem = { id: 'a', name: 'Paracetamol', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 20, category: 'c', defaultSellingPrice: 500, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => {
  push.mockClear()
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.catalogItems, db.stockBatches, db.stockMovements, db.goodsReceipts, db.syncQueue]) await t.clear()
  await db.catalogItems.put(ITEM)
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'Paracetamol', quantityOrdered: 10, unitCost: 100, discountType: 'percent', discountValue: 10 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: 6, costPrice: 90, sellingPrice: 500 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  ;(globalThis as unknown as { __poid: string }).__poid = po.id
})

describe('NewSupplierInvoicePage', () => {
  it('prefills a line with billed = received and unit price = PO net cost, and submits', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><NewSupplierInvoicePage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByText('Paracetamol')).toBeInTheDocument())
    // billed qty default 6 (received); unit price default 0.90 (net of 10% off 1.00)
    expect((screen.getByTestId('inv-billed-a') as HTMLInputElement).value).toBe('6')
    expect((screen.getByTestId('inv-price-a') as HTMLInputElement).value).toBe('0.90')
    fireEvent.change(screen.getByTestId('inv-number'), { target: { value: 'SUP-501' } })
    fireEvent.click(screen.getByTestId('submit-invoice'))
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect((await db.supplierInvoices.toArray())[0]!.invoiceNumber).toBe('SUP-501')
  })
})
```

> Guide test — add the referenced `data-testid`s (`inv-billed-<catalogItemId>`, `inv-price-<catalogItemId>`, `inv-number`, `submit-invoice`) in the implementation and adjust selectors to your markup. Load-bearing: prefill (billed=received, price=net) and a successful create.

- [ ] **Step 2: Run test to verify it fails** — `pnpm -F pharmacy-lite test NewSupplierInvoicePage` → FAIL.

- [ ] **Step 3: Implement `NewSupplierInvoicePage.tsx`** per the description above (read `NewPurchaseOrderPage.tsx` for the money-input + line-table idiom; reuse its `parseMajorToMinor`/`formatAmount` pattern). Prefill line `unitPrice` from `computePoTotals(po.items, po.taxRate ?? 0, po.freight ?? 0).items[idx].netUnitCost`; `billedQty` from `quantityReceived`.

- [ ] **Step 4: Create the route** `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/new/page.tsx`:
```tsx
'use client'
import { NewSupplierInvoicePage } from '@/components/pharmacy/procurement/NewSupplierInvoicePage'
export default function NewSupplierInvoiceRoute() { return <NewSupplierInvoicePage /> }
```

- [ ] **Step 5: Run test + typecheck** → pass.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/NewSupplierInvoicePage.tsx "apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/new/page.tsx" apps/pharmacy-lite/src/__tests__/NewSupplierInvoicePage.test.tsx
git commit -m "feat(pharmacy-lite): record supplier invoice form (PO prefill + duplicate warning)"
```

---

### Task 8: Invoice detail — 3-way match table + approve/dispute + route

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierInvoiceDetailPage.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/[id]/page.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/SupplierInvoiceDetailPage.test.tsx` (create)

**Interfaces:**
- Consumes: `getSupplierInvoiceById`, `approveSupplierInvoice`, `disputeSupplierInvoice`, `InvoiceVarianceUnresolvedError` (Tasks 3–4); `getPurchaseOrderById` + `computeInvoiceMatch` (Task 2); `useAuthSessionStore`; i18n (Task 5); `useParams`.

Detail standard. Header: `t('detailTitle', { number })` + match badge + status badge. **3-way match table** built from `computeInvoiceMatch(inv, po, tolerance)`: columns Ordered / Received / Billed / PO cost / Invoiced / Qty var / Price var, with per-line flag coloring (`overBilled`||`offPo` → `text-destructive`, `priceOverTolerance` → `text-warning`, else `text-muted-foreground`). Actions when `status === 'pending'`: **Approve** (`data-testid="approve-invoice"`) — if match is `variance`, reveal an override-reason input (`data-testid="override-reason"`) and pass it; on `InvoiceVarianceUnresolvedError` show `t('overrideRequired')`. **Dispute** (`data-testid="dispute-invoice"`) — reveal a reason input, require it. `performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'`. Reload after. Semantic tokens; money `font-numeric`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/SupplierInvoiceDetailPage.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { SupplierInvoiceDetailPage } from '@/components/pharmacy/procurement/SupplierInvoiceDetailPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { createSupplierInvoice } from '@/lib/procurement/supplier-invoice-service'
import type { CatalogItem } from '@/lib/inventory/types'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: globalThis.__invid }), useRouter: () => ({ push: vi.fn() }) }))
const ITEM: CatalogItem = { id: 'a', name: 'A', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.catalogItems, db.stockBatches, db.stockMovements, db.goodsReceipts, db.syncQueue]) await t.clear()
  await db.catalogItems.put(ITEM)
})

async function seedInvoice(billedQty: number) {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: 8, costPrice: 100, sellingPrice: 200 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'INV-1', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty, unitPrice: 100 }] })
  ;(globalThis as unknown as { __invid: string }).__invid = inv.id
  return inv
}

describe('SupplierInvoiceDetailPage', () => {
  it('a matched invoice approves in one click', async () => {
    await seedInvoice(8)
    render(<NextIntlClientProvider locale="en" messages={en}><SupplierInvoiceDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByTestId('approve-invoice')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('approve-invoice'))
    await waitFor(async () => expect((await db.supplierInvoices.toArray())[0]!.status).toBe('approved'))
  })

  it('a variance invoice requires an override reason to approve', async () => {
    await seedInvoice(10) // over-billed → variance
    render(<NextIntlClientProvider locale="en" messages={en}><SupplierInvoiceDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByTestId('approve-invoice')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('approve-invoice'))
    // still pending — an override reason is required
    await waitFor(() => expect(screen.getByText(en.supplierInvoices.overrideRequired)).toBeInTheDocument())
    expect((await db.supplierInvoices.toArray())[0]!.status).toBe('pending')
    fireEvent.change(screen.getByTestId('override-reason'), { target: { value: 'bonus units accepted' } })
    fireEvent.click(screen.getByTestId('approve-invoice'))
    await waitFor(async () => expect((await db.supplierInvoices.toArray())[0]!.status).toBe('approved'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm -F pharmacy-lite test SupplierInvoiceDetailPage` → FAIL.

- [ ] **Step 3: Implement `SupplierInvoiceDetailPage.tsx`** per the description (read `PurchaseOrderDetailPage.tsx` for the detail layout + action-button + reload idiom). Approve flow: if the derived match is `variance` and the override-reason field is empty, calling `approveSupplierInvoice` throws `InvoiceVarianceUnresolvedError` → catch and show `t('overrideRequired')` + reveal the field; when filled, pass it. Attribution via `useAuthSessionStore`.

- [ ] **Step 4: Create the route** `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/[id]/page.tsx`:
```tsx
'use client'
import { SupplierInvoiceDetailPage } from '@/components/pharmacy/procurement/SupplierInvoiceDetailPage'
export default function SupplierInvoiceDetailRoute() { return <SupplierInvoiceDetailPage /> }
```

- [ ] **Step 5: Run test + typecheck** → pass.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierInvoiceDetailPage.tsx "apps/pharmacy-lite/src/app/[locale]/(app)/inventory/invoices/[id]/page.tsx" apps/pharmacy-lite/src/__tests__/SupplierInvoiceDetailPage.test.tsx
git commit -m "feat(pharmacy-lite): supplier invoice 3-way match detail + approve/dispute"
```

---

### Task 9: Sidebar nav + PO-detail "Record invoice" entry

**Files:**
- Modify: `apps/pharmacy-lite/src/components/sidebar/nav-config.ts`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/po-record-invoice-link.test.tsx` (create)

**Interfaces:**
- Consumes: i18n `sidebar.invoices` + `supplierInvoices.newInvoice` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/po-record-invoice-link.test.tsx` — seed a `sent` PO, render `PurchaseOrderDetailPage`, assert a "Record invoice" link to `/inventory/invoices/new?poId=<id>` exists:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: globalThis.__poid }), useRouter: () => ({ push: vi.fn() }) }))

beforeEach(async () => { for (const t of [db.purchaseOrders, db.pharmacySettings, db.goodsReceipts, db.syncQueue]) await t.clear() })

describe('PO detail record-invoice link', () => {
  it('links to the new-invoice form for a sent PO', async () => {
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
    await markPurchaseOrderSent(po.id, 'u1')
    ;(globalThis as unknown as { __poid: string }).__poid = po.id
    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrderDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByTestId('record-invoice-link')).toBeInTheDocument())
    expect(screen.getByTestId('record-invoice-link').getAttribute('href')).toContain(`/inventory/invoices/new?poId=${po.id}`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Add the nav entry.** In `nav-config.ts`, after the `purchaseOrders` Inventory sub-item (line 76), add:
```ts
      { titleKey: 'invoices',      url: '/inventory/invoices' },
```
(Add `invoices` to the `sidebar` message namespace in Task 5 — already done.)

- [ ] **Step 4: Add the PO-detail "Record invoice" link.** In `PurchaseOrderDetailPage.tsx`, in the status-driven action row, for a PO whose status is `sent`/`partially_received`/`closed`, render (uses `t` from the `purchaseOrders` namespace — reuse an existing invoice label or add one; simplest: use a new `purchaseOrders.recordInvoice` key added in Task 5's `supplierInvoices`? No — add it to `purchaseOrders`. To avoid an extra i18n round, reuse `supplierInvoices.newInvoice` by adding a second `useTranslations('supplierInvoices')` in this component, or add `purchaseOrders.recordInvoice`. Pick one and note it):
```tsx
<Link href={`/inventory/invoices/new?poId=${po.id}`} data-testid="record-invoice-link" className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50">
  {tInvoice('newInvoice')}
</Link>
```
where `const tInvoice = useTranslations('supplierInvoices')`. Show it for statuses `sent`/`partially_received`/`closed`.

- [ ] **Step 5: Run test + regression + typecheck** — `pnpm -F pharmacy-lite test po-record-invoice-link PurchaseOrderDetailReceive PurchaseOrderReceiptHistory` + `typecheck`. If a `PurchaseOrderDetailPage` snapshot changes, regenerate + stage it (note in report).

- [ ] **Step 6: Commit**
```bash
git add apps/pharmacy-lite/src/components/sidebar/nav-config.ts apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx apps/pharmacy-lite/src/__tests__/po-record-invoice-link.test.tsx
git commit -m "feat(pharmacy-lite): Invoices nav + Record-invoice action on PO detail"
```

---

### Task 10: Settings — invoice match tolerance

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/settings-invoice-tolerance.test.tsx` (create)

**Interfaces:**
- Consumes: `invoiceMatchTolerancePercent` (Task 1); i18n `settings.invoiceMatchToleranceLabel` (Task 5).

Add a number input bound to `invoiceMatchTolerancePercent` (`data-testid="setting-invoice-tolerance"`) to the existing `ProcurementSettingsCard` (which already holds `setting-pharmacy-code`/`setting-po-prefix`), persisting via the same `db.pharmacySettings.put({ ...current, invoiceMatchTolerancePercent })` save-on-blur idiom the card uses. `poSequenceNext` and other fields must be preserved by the spread (do NOT drop them).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/settings-invoice-tolerance.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

beforeEach(async () => { await db.pharmacySettings.clear(); await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS, locationId: 'default', poSequenceNext: 7 }) })

describe('settings invoice match tolerance', () => {
  it('persists the tolerance and preserves poSequenceNext', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><PharmacySettingsView /></NextIntlClientProvider>)
    const input = await screen.findByTestId('setting-invoice-tolerance')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    await waitFor(async () => {
      const s = await db.pharmacySettings.get('default')
      expect(s!.invoiceMatchTolerancePercent).toBe(5)
      expect(s!.poSequenceNext).toBe(7) // counter preserved by the spread
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Add the field** to `ProcurementSettingsCard` in `PharmacySettingsView.tsx`, mirroring the existing two text fields but as a `type="number"` bound to `invoiceMatchTolerancePercent`, persisting on blur via the card's existing `db.pharmacySettings.put({ ...current, invoiceMatchTolerancePercent: Number(value) || 0 })` pattern. Label via `t('invoiceMatchToleranceLabel')`.

- [ ] **Step 4: Run test + regression + typecheck** — `pnpm -F pharmacy-lite test settings-invoice-tolerance settings-po-number PharmacySettingsView` + `typecheck` → all green.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx apps/pharmacy-lite/src/__tests__/settings-invoice-tolerance.test.tsx
git commit -m "feat(pharmacy-lite): settings for invoice price-match tolerance"
```

---

## Self-Review

**1. Spec coverage.**
- New synced `supplierInvoices` store (v18) + `invoiceMatchTolerancePercent` → Task 1. ✓
- Pure `computeInvoiceMatch` (received-anchored qty, net-cost price, over-bill/off-PO hard flags, tolerance, derived) → Task 2. ✓
- Services: create + duplicate check + queries → Task 3; approve gate (override-on-variance) + dispute → Task 4. ✓
- One invoice ↔ one PO; supplier inherited from PO; line-level match by catalogItemId → Tasks 2, 3. ✓
- Supplier-entered number + duplicate warning → Tasks 3 (service), 7 (UI). ✓
- UI list/new/detail with design-system tokens + RTL + font-numeric → Tasks 6, 7, 8. ✓
- Match/status badges, 3-way match table, approve/dispute → Tasks 6, 8. ✓
- Entry points (nav + PO-detail) → Task 9. ✓
- Settings tolerance → Tasks 1, 10. ✓
- i18n across 4 locales → Task 5. ✓

**2. Placeholder scan.** Logic tasks (1–4) carry complete code + tests. UI tasks (6–8) carry the load-bearing test + a precise component description that names the exact data-testids, tokens, and the existing component to mirror — with directed reads of `PurchaseOrdersPage`/`NewPurchaseOrderPage`/`PurchaseOrderDetailPage` (already read by the planner; cited idioms are real). Task 9's i18n-key choice for the PO-detail label is flagged as "pick one and note it" (a directed decision, not a vague requirement). No "TBD"/"handle edge cases".

**3. Type consistency.** `SupplierInvoice`/`SupplierInvoiceItem`/`SupplierInvoiceStatus` (Task 1) are used identically in Tasks 2–8. `computeInvoiceMatch(invoice, po, tolerancePercent)` + `InvoiceMatchResult`/`InvoiceMatchLine` (Task 2) are consumed in Tasks 4, 6, 8. `createSupplierInvoice`/`findDuplicateInvoice`/`getSupplierInvoices`/`getSupplierInvoiceById`/`getInvoicesForPO` (Task 3) and `approveSupplierInvoice`/`disputeSupplierInvoice`/`InvoiceVarianceUnresolvedError` (Task 4) match their UI callers (6–8). `invoiceMatchTolerancePercent` (Task 1) read in Task 4 and written in Task 10. `resourceType: 'SupplierInvoice'` consistent across create (Task 3) + updates (Task 4).

**Build-green ordering:** every new field/entity is additive; all consumers are new files (Tasks 2–8) or additive edits (Tasks 9–10). No signature change breaks an existing caller. No task leaves the tree red.
