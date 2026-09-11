# Procurement Phase 2a — Purchasing Cost Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give purchasing a correct cost model — human-readable PO numbers, line discounts + document tax/freight with a proper total breakdown, net-cost flow into received stock, and a derived weighted-average cost (WAC) + inventory valuation.

**Architecture:** Pure math (`po-totals.ts`) and derived valuation (`valuation.ts`) are unit-tested in isolation; PO numbering is an atomic counter in `pharmacySettings`; `createPurchaseOrder` composes them; the receive prefill carries net unit cost into batches so WAC (derived from batch cost) is correct. UI surfaces follow.

**Tech Stack:** Next.js 15 (`'use client'`), TypeScript, Dexie (IndexedDB), next-intl, ShadCN via `@ultranos/ui-kit`, Vitest + `fake-indexeddb`, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-11-procurement-phase2a-cost-model-design.md`

## Global Constraints

- **Money is integer minor units.** All amounts are ints; format only at the UI edge.
- **Rounding is `Math.round` (half-up) on minor units**, applied per the canonical math below.
- **New `PurchaseOrder` financial fields are OPTIONAL** (`poNumber?`, `subtotal?`, `taxRate?`, `taxAmount?`, `freight?`) — this satisfies the spec's legacy-PO fallback AND keeps each task build-green. `totalCost` stays required and is REDEFINED to the grand total for new POs.
- **No Dexie version bump** — every field added is non-indexed.
- **PO number:** `` `${poNumberPrefix}${pharmacyCode ? pharmacyCode + '-' : ''}${year}-${seq4}` `` from a local monotonic counter (`poSequenceNext`), incremented atomically.
- **WAC/valuation use ACTIVE batches only** (available stock); depleted + quarantined excluded. WAC is `null` when no active stock (render "—", never 0).
- **i18n:** every user-facing string via `useTranslations`; add new keys to all four catalogs `messages/{en,ar,prs,ps}.json`.
- **No PHI in logs/errors** (money + ids only).
- **Commits are file-scoped** (`git add <exact paths>`, never `git add -A`). Unrelated WIP exists elsewhere in the tree.
- **Known pre-existing typecheck errors** live in 5 unrelated test files (drug-catalog-trpc, krl-sync-worker, phi-cleanup, prescription-verify, sync-provider-pull) — ignore them; touched files must be clean.

## Canonical math (implement exactly)

Per line: `lineGross = unitCost × quantityOrdered`;
`lineDiscount = discountType==='percent' ? round(lineGross × (discountValue??0)/100) : (discountType==='amount' ? (discountValue??0) : 0)`, then clamped to `0..lineGross`;
`lineNet = lineGross − lineDiscount`; `netUnitCost = quantityOrdered>0 ? round(lineNet/quantityOrdered) : 0`.
Document: `subtotal = Σ lineNet`; `discountTotal = Σ lineDiscount`; `taxAmount = round(subtotal × taxRate/100)`; `grandTotal = subtotal + taxAmount + freight`.

---

### Task 1: Data model + settings defaults

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/procurement/types.ts`
- Modify: `apps/pharmacy-lite/src/lib/inventory/types.ts`
- Test: `apps/pharmacy-lite/src/__tests__/phase2a-schema.test.ts` (create)

**Interfaces:**
- Produces: `PurchaseOrderItem.discountType?: 'percent'|'amount'` + `discountValue?: number`; `PurchaseOrder.poNumber?/subtotal?/taxRate?/taxAmount?/freight?: number` (poNumber is string); `PharmacyInventorySettings.poNumberPrefix: string`, `pharmacyCode: string`, `poSequenceNext: number` (+ DEFAULT values `'PO-'`, `''`, `1`).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/phase2a-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

describe('phase 2a settings defaults', () => {
  it('adds PO-number + WAC settings defaults', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.poNumberPrefix).toBe('PO-')
    expect(DEFAULT_PHARMACY_SETTINGS.pharmacyCode).toBe('')
    expect(DEFAULT_PHARMACY_SETTINGS.poSequenceNext).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test phase2a-schema`
Expected: FAIL — the three settings fields are undefined.

- [ ] **Step 3: Extend the procurement types**

In `apps/pharmacy-lite/src/lib/procurement/types.ts`, inside `interface PurchaseOrderItem` (after `unitCost: number`), add:
```ts
  discountType?: 'percent' | 'amount'
  discountValue?: number
```
Inside `interface PurchaseOrder`, after `totalCost: number`, add:
```ts
  /** Human-readable PO number (assigned at creation). Absent on legacy POs. */
  poNumber?: string
  /** Sum of line nets (minor units). Absent on legacy POs. */
  subtotal?: number
  /** Document tax rate (percent). Absent on legacy POs. */
  taxRate?: number
  /** round(subtotal * taxRate/100). Absent on legacy POs. */
  taxAmount?: number
  /** Freight/other charge (minor units). Absent on legacy POs. */
  freight?: number
```
(Leave `totalCost: number` as-is; its meaning becomes the grand total for POs created by the updated service in Task 4.)

- [ ] **Step 4: Extend settings type + defaults**

In `apps/pharmacy-lite/src/lib/inventory/types.ts`, inside `interface PharmacyInventorySettings` (after `overReceiptTolerancePercent: number`), add:
```ts
  poNumberPrefix: string
  pharmacyCode: string
  poSequenceNext: number
```
In `DEFAULT_PHARMACY_SETTINGS` (after `overReceiptTolerancePercent: 0,`), add:
```ts
  poNumberPrefix: 'PO-',
  pharmacyCode: '',
  poSequenceNext: 1,
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test phase2a-schema`
Run: `pnpm -F pharmacy-lite typecheck`
Expected: test passes; no new type errors (existing `createPurchaseOrder` still compiles because the new PO fields are optional).

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/types.ts apps/pharmacy-lite/src/lib/inventory/types.ts apps/pharmacy-lite/src/__tests__/phase2a-schema.test.ts
git commit -m "feat(pharmacy-lite): PO financial fields + PO-number settings (Phase 2a data model)"
```

---

### Task 2: `po-totals.ts` — pure line/total math

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/po-totals.ts`
- Test: `apps/pharmacy-lite/src/__tests__/po-totals.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface PoLineInput { catalogItemId: string; catalogItemName: string; quantityOrdered: number; unitCost: number; discountType?: 'percent'|'amount'; discountValue?: number }`
  - `interface PoLineComputed extends PoLineInput { lineGross: number; lineDiscount: number; lineNet: number; netUnitCost: number }`
  - `interface PoTotals { items: PoLineComputed[]; subtotal: number; discountTotal: number; taxRate: number; taxAmount: number; freight: number; grandTotal: number }`
  - `computePoTotals(items: PoLineInput[], taxRate: number, freight: number): PoTotals`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/po-totals.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computePoTotals, type PoLineInput } from '@/lib/procurement/po-totals'

const line = (o: Partial<PoLineInput> = {}): PoLineInput => ({
  catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100, ...o,
})

describe('computePoTotals', () => {
  it('no discount, no tax, no freight → subtotal = grandTotal', () => {
    const r = computePoTotals([line()], 0, 0)
    expect(r.subtotal).toBe(1000)
    expect(r.grandTotal).toBe(1000)
    expect(r.items[0]!.netUnitCost).toBe(100)
  })
  it('percent discount reduces line net and net unit cost', () => {
    const r = computePoTotals([line({ discountType: 'percent', discountValue: 10 })], 0, 0)
    expect(r.items[0]!.lineDiscount).toBe(100) // 10% of 1000
    expect(r.items[0]!.lineNet).toBe(900)
    expect(r.items[0]!.netUnitCost).toBe(90)
    expect(r.discountTotal).toBe(100)
  })
  it('amount discount is a flat minor-unit reduction off the line', () => {
    const r = computePoTotals([line({ discountType: 'amount', discountValue: 250 })], 0, 0)
    expect(r.items[0]!.lineNet).toBe(750)
    expect(r.items[0]!.netUnitCost).toBe(75)
  })
  it('discount clamps to the line gross (never negative net)', () => {
    const r = computePoTotals([line({ discountType: 'amount', discountValue: 99999 })], 0, 0)
    expect(r.items[0]!.lineDiscount).toBe(1000)
    expect(r.items[0]!.lineNet).toBe(0)
  })
  it('tax applies to subtotal; freight adds to grand total', () => {
    const r = computePoTotals([line()], 5, 300) // subtotal 1000, tax 50, freight 300
    expect(r.taxAmount).toBe(50)
    expect(r.grandTotal).toBe(1350)
  })
  it('zero quantity → no divide-by-zero, netUnitCost 0', () => {
    const r = computePoTotals([line({ quantityOrdered: 0 })], 0, 0)
    expect(r.items[0]!.netUnitCost).toBe(0)
    expect(r.subtotal).toBe(0)
  })
  it('multi-line subtotal sums line nets', () => {
    const r = computePoTotals([line(), line({ unitCost: 50, quantityOrdered: 4 })], 0, 0)
    expect(r.subtotal).toBe(1200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test po-totals`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `po-totals.ts`**

Create `apps/pharmacy-lite/src/lib/procurement/po-totals.ts`:

```ts
export interface PoLineInput {
  catalogItemId: string
  catalogItemName: string
  quantityOrdered: number
  unitCost: number
  discountType?: 'percent' | 'amount'
  discountValue?: number
}

export interface PoLineComputed extends PoLineInput {
  lineGross: number
  lineDiscount: number
  lineNet: number
  netUnitCost: number
}

export interface PoTotals {
  items: PoLineComputed[]
  subtotal: number
  discountTotal: number
  taxRate: number
  taxAmount: number
  freight: number
  grandTotal: number
}

/** Pure PO line + document totals. All amounts are integer minor units. */
export function computePoTotals(items: PoLineInput[], taxRate: number, freight: number): PoTotals {
  const computed: PoLineComputed[] = items.map((it) => {
    const qty = it.quantityOrdered > 0 ? it.quantityOrdered : 0
    const lineGross = it.unitCost * qty
    let lineDiscount = 0
    if (it.discountType === 'percent') {
      lineDiscount = Math.round((lineGross * (it.discountValue ?? 0)) / 100)
    } else if (it.discountType === 'amount') {
      lineDiscount = it.discountValue ?? 0
    }
    lineDiscount = Math.max(0, Math.min(lineDiscount, lineGross))
    const lineNet = lineGross - lineDiscount
    const netUnitCost = qty > 0 ? Math.round(lineNet / qty) : 0
    return { ...it, lineGross, lineDiscount, lineNet, netUnitCost }
  })

  const subtotal = computed.reduce((s, l) => s + l.lineNet, 0)
  const discountTotal = computed.reduce((s, l) => s + l.lineDiscount, 0)
  const taxAmount = Math.round((subtotal * taxRate) / 100)
  const grandTotal = subtotal + taxAmount + freight

  return { items: computed, subtotal, discountTotal, taxRate, taxAmount, freight, grandTotal }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test po-totals`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/po-totals.ts apps/pharmacy-lite/src/__tests__/po-totals.test.ts
git commit -m "feat(pharmacy-lite): pure PO totals math (discount/tax/freight)"
```

---

### Task 3: `generatePoNumber` — atomic local counter

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts`
- Test: `apps/pharmacy-lite/src/__tests__/po-number.test.ts` (create)

**Interfaces:**
- Consumes: `DEFAULT_PHARMACY_SETTINGS` (Task 1).
- Produces: `generatePoNumber(year: number): Promise<string>` — reads+increments `poSequenceNext` atomically; returns `` `${prefix}${code ? code+'-' : ''}${year}-${seq4}` ``.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/po-number.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { generatePoNumber } from '@/lib/procurement/purchase-order-service'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

beforeEach(async () => { await db.pharmacySettings.clear() })

describe('generatePoNumber', () => {
  it('seeds defaults when no settings row exists and returns PO-<year>-0001', async () => {
    const n = await generatePoNumber(2026)
    expect(n).toBe('PO-2026-0001')
    const s = await db.pharmacySettings.toCollection().first()
    expect(s!.poSequenceNext).toBe(2)
  })
  it('includes the pharmacy code segment when set', async () => {
    await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS, pharmacyCode: 'KBL01' })
    const n = await generatePoNumber(2026)
    expect(n).toBe('PO-KBL01-2026-0001')
  })
  it('is monotonic across sequential calls', async () => {
    await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS })
    const a = await generatePoNumber(2026)
    const b = await generatePoNumber(2026)
    expect(a).toBe('PO-2026-0001')
    expect(b).toBe('PO-2026-0002')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test po-number`
Expected: FAIL — `generatePoNumber` is not exported.

- [ ] **Step 3: Implement `generatePoNumber`**

In `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts`, add the import at the top:
```ts
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'
```
Add the function (after the imports, before `createPurchaseOrder`):
```ts
/**
 * Allocate the next human-readable PO number from a local monotonic counter.
 * Atomic read-increment-write on pharmacySettings so concurrent creates never
 * collide. `year` is supplied by the caller (services own timestamps).
 */
export async function generatePoNumber(year: number): Promise<string> {
  let poNumber = ''
  await db.transaction('rw', db.pharmacySettings, async () => {
    const existing = await db.pharmacySettings.toCollection().first()
    const settings = existing ?? { ...DEFAULT_PHARMACY_SETTINGS }
    const seq = settings.poSequenceNext ?? DEFAULT_PHARMACY_SETTINGS.poSequenceNext
    const prefix = settings.poNumberPrefix ?? DEFAULT_PHARMACY_SETTINGS.poNumberPrefix
    const code = settings.pharmacyCode ?? DEFAULT_PHARMACY_SETTINGS.pharmacyCode
    await db.pharmacySettings.put({ ...settings, poSequenceNext: seq + 1 })
    poNumber = `${prefix}${code ? `${code}-` : ''}${year}-${String(seq).padStart(4, '0')}`
  })
  return poNumber
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test po-number`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts apps/pharmacy-lite/src/__tests__/po-number.test.ts
git commit -m "feat(pharmacy-lite): atomic human-readable PO number generation"
```

---

### Task 4: `createPurchaseOrder` — totals + number + breakdown

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts:5-39`
- Test: `apps/pharmacy-lite/src/__tests__/create-po-financials.test.ts` (create)

**Interfaces:**
- Consumes: `computePoTotals` (Task 2), `generatePoNumber` (Task 3).
- Produces: `createPurchaseOrder` gains optional `taxRate?: number` and `freight?: number` params; each `items[]` entry may carry `discountType?`/`discountValue?`; the created PO has `poNumber`, `subtotal`, `taxRate`, `taxAmount`, `freight`, and `totalCost = grandTotal`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/create-po-financials.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createPurchaseOrder } from '@/lib/procurement/purchase-order-service'

beforeEach(async () => { await db.purchaseOrders.clear(); await db.pharmacySettings.clear(); await db.syncQueue.clear() })

describe('createPurchaseOrder financials', () => {
  it('assigns a poNumber and computes grand total with discount + tax + freight', async () => {
    const po = await createPurchaseOrder({
      supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', taxRate: 5, freight: 300,
      items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100, discountType: 'percent', discountValue: 10 }],
    })
    expect(po.poNumber).toBe('PO-2026-0001') // seeded counter; year from creation
    expect(po.subtotal).toBe(900)   // 1000 - 10%
    expect(po.taxAmount).toBe(45)   // 5% of 900
    expect(po.freight).toBe(300)
    expect(po.totalCost).toBe(1245) // grand total
    expect(po.items[0]!.discountType).toBe('percent')
  })

  it('sequential POs get incrementing numbers', async () => {
    const a = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 1, unitCost: 100 }] })
    const b = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 1, unitCost: 100 }] })
    expect(a.poNumber).not.toBe(b.poNumber)
  })

  it('defaults taxRate from settings and freight to 0', async () => {
    await db.pharmacySettings.clear()
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 2, unitCost: 100 }] })
    expect(po.taxAmount).toBe(0)
    expect(po.freight).toBe(0)
    expect(po.totalCost).toBe(200)
  })
})
```

> Note: the poNumber year in the first test assumes the test environment's current year is 2026. If the suite runs in a different year, assert `po.poNumber!.startsWith('PO-')` and `.endsWith('-0001')` instead of the exact year — adjust when you run it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test create-po-financials`
Expected: FAIL — `po.poNumber`/`subtotal`/`taxAmount` undefined.

- [ ] **Step 3: Rewrite `createPurchaseOrder`**

In `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts`, add the import:
```ts
import { computePoTotals } from './po-totals'
```
Replace `createPurchaseOrder` (lines 5-39) with:
```ts
export async function createPurchaseOrder(params: {
  supplierId: string
  supplierName: string
  items: Omit<PurchaseOrderItem, 'quantityReceived'>[]
  taxRate?: number
  freight?: number
  notes?: string
  createdBy: string
}): Promise<PurchaseOrder> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const year = new Date().getFullYear()

  const settings = await db.pharmacySettings.toCollection().first()
  const taxRate = params.taxRate ?? settings?.taxRate ?? 0
  const freight = params.freight ?? 0

  const totals = computePoTotals(
    params.items.map((i) => ({
      catalogItemId: i.catalogItemId,
      catalogItemName: i.catalogItemName,
      quantityOrdered: i.quantityOrdered,
      unitCost: i.unitCost,
      discountType: i.discountType,
      discountValue: i.discountValue,
    })),
    taxRate,
    freight,
  )

  const items: PurchaseOrderItem[] = params.items.map((item) => ({ ...item, quantityReceived: 0 }))
  const poNumber = await generatePoNumber(year)

  const po: PurchaseOrder = {
    id,
    poNumber,
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    status: 'draft',
    items,
    subtotal: totals.subtotal,
    taxRate,
    taxAmount: totals.taxAmount,
    freight,
    totalCost: totals.grandTotal,
    notes: params.notes?.trim() || undefined,
    createdBy: params.createdBy,
    createdAt: now,
    hlcTimestamp: now,
  }
  await db.purchaseOrders.put(po)
  await enqueuePharmacySyncEntry({
    resourceType: 'PurchaseOrder',
    resourceId: id,
    action: 'create',
    payload: po as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })
  return po
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test create-po-financials`
Run: `pnpm -F pharmacy-lite typecheck`
Expected: pass; no new type errors. (The existing `NewPurchaseOrderPage` caller still compiles — the new params are optional and item discounts are optional.)

- [ ] **Step 5: Run the existing PO tests (regression)**

Run: `pnpm -F pharmacy-lite test purchase-order-attribution goods-receipt-po`
Expected: still green (these create POs; `totalCost` is now the grand total, which equals the old sum when there's no tax/discount/freight).

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts apps/pharmacy-lite/src/__tests__/create-po-financials.test.ts
git commit -m "feat(pharmacy-lite): createPurchaseOrder computes totals + assigns PO number"
```

---

### Task 5: `valuation.ts` — derived WAC + inventory valuation

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/valuation.ts`
- Test: `apps/pharmacy-lite/src/__tests__/valuation.test.ts` (create)

**Interfaces:**
- Produces:
  - `getWac(catalogItemId: string): Promise<number | null>` — active batches only; `Σ(qty×costPrice)/Σqty` rounded; `null` when no active stock.
  - `getInventoryValuation(): Promise<{ totalValue: number; byItem: { catalogItemId: string; qty: number; wac: number; value: number }[] }>`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/valuation.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { getWac, getInventoryValuation } from '@/lib/inventory/valuation'
import type { StockBatch } from '@/lib/inventory/types'

function batch(o: Partial<StockBatch>): StockBatch {
  return { id: crypto.randomUUID(), catalogItemId: 'a', batchNumber: 'B', expiryDate: '2030-01-01',
    quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
    status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...o }
}

beforeEach(async () => { await db.stockBatches.clear() })

describe('getWac', () => {
  it('weights active batch costs by quantity', async () => {
    await db.stockBatches.bulkPut([
      batch({ quantityOnHand: 10, costPrice: 100 }),
      batch({ quantityOnHand: 30, costPrice: 200 }),
    ])
    // (10*100 + 30*200) / 40 = 7000/40 = 175
    expect(await getWac('a')).toBe(175)
  })
  it('ignores depleted and quarantined batches', async () => {
    await db.stockBatches.bulkPut([
      batch({ quantityOnHand: 10, costPrice: 100, status: 'active' }),
      batch({ quantityOnHand: 10, costPrice: 999, status: 'quarantined' }),
      batch({ quantityOnHand: 0, costPrice: 999, status: 'depleted' }),
    ])
    expect(await getWac('a')).toBe(100)
  })
  it('returns null when there is no active stock', async () => {
    expect(await getWac('a')).toBeNull()
  })
})

describe('getInventoryValuation', () => {
  it('totals active inventory value across items', async () => {
    await db.stockBatches.bulkPut([
      batch({ catalogItemId: 'a', quantityOnHand: 10, costPrice: 100 }),
      batch({ catalogItemId: 'b', quantityOnHand: 5, costPrice: 200 }),
      batch({ catalogItemId: 'b', quantityOnHand: 0, costPrice: 200, status: 'depleted' }),
    ])
    const v = await getInventoryValuation()
    expect(v.totalValue).toBe(2000) // 1000 + 1000
    expect(v.byItem.find((i) => i.catalogItemId === 'b')!.wac).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test valuation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `valuation.ts`**

Create `apps/pharmacy-lite/src/lib/inventory/valuation.ts`:

```ts
import { db } from '@/lib/db'

/** Weighted-average cost of ACTIVE on-hand stock for a product; null when none. */
export async function getWac(catalogItemId: string): Promise<number | null> {
  const batches = await db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .toArray()
  let qty = 0
  let value = 0
  for (const b of batches) {
    qty += b.quantityOnHand
    value += b.quantityOnHand * b.costPrice
  }
  if (qty <= 0) return null
  return Math.round(value / qty)
}

/** Inventory valuation across all products, ACTIVE batches only. */
export async function getInventoryValuation(): Promise<{
  totalValue: number
  byItem: { catalogItemId: string; qty: number; wac: number; value: number }[]
}> {
  const batches = await db.stockBatches.where('status').equals('active').toArray()
  const map = new Map<string, { qty: number; value: number }>()
  for (const b of batches) {
    const e = map.get(b.catalogItemId) ?? { qty: 0, value: 0 }
    e.qty += b.quantityOnHand
    e.value += b.quantityOnHand * b.costPrice
    map.set(b.catalogItemId, e)
  }
  const byItem = Array.from(map.entries()).map(([catalogItemId, { qty, value }]) => ({
    catalogItemId,
    qty,
    wac: qty > 0 ? Math.round(value / qty) : 0,
    value,
  }))
  const totalValue = byItem.reduce((s, i) => s + i.value, 0)
  return { totalValue, byItem }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test valuation`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/valuation.ts apps/pharmacy-lite/src/__tests__/valuation.test.ts
git commit -m "feat(pharmacy-lite): derived WAC + inventory valuation"
```

---

### Task 6: PO-mode receive carries net unit cost

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx:35-61`
- Test: `apps/pharmacy-lite/src/__tests__/receive-po-net-cost.test.tsx` (create)

**Interfaces:**
- Consumes: `computePoTotals` (Task 2); `PurchaseOrder` with `discountType`/`discountValue` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/receive-po-net-cost.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { ReceiveStockForm } from '@/components/pharmacy/inventory/ReceiveStockForm'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import type { CatalogItem } from '@/lib/inventory/types'

const ITEM: CatalogItem = { id: 'a', name: 'Paracetamol', form: 'tablet', strength: '500', strengthUnit: 'mg',
  packSize: 20, category: 'analgesic', defaultSellingPrice: 500, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => { for (const t of [db.catalogItems, db.purchaseOrders, db.pharmacySettings, db.syncQueue]) await t.clear(); await db.catalogItems.put(ITEM) })

describe('ReceiveStockForm PO-mode net unit cost', () => {
  it('prefills the line cost with the PO net unit cost (after line discount)', async () => {
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
      items: [{ catalogItemId: 'a', catalogItemName: 'Paracetamol', quantityOrdered: 10, unitCost: 100, discountType: 'percent', discountValue: 10 }] })
    await markPurchaseOrderSent(po.id, 'u1')

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ReceiveStockForm locationId="default" currencyMinorUnits={2} purchaseOrderId={po.id} onComplete={() => {}} />
      </NextIntlClientProvider>,
    )
    // net unit cost = (1000 - 10%) / 10 = 90 minor units = 0.90 major
    const costInput = await waitFor(() => screen.getByTestId('receive-item-0').querySelector('#cost-0') as HTMLInputElement)
    expect(costInput.value).toBe('0.90')
  })
})
```

> The receive row renders cost via `formatPrice(item.costPrice)` into input `#cost-<index>` (see `ReceiveStockItemRow.tsx`). If the id differs when you read the file, target the cost input by its label/testid accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test receive-po-net-cost`
Expected: FAIL — prefill uses raw `unitCost` (100 → `1.00`), not net (90 → `0.90`).

- [ ] **Step 3: Use net unit cost in the PO prefill**

In `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx`, add the import:
```ts
import { computePoTotals } from '@/lib/procurement/po-totals'
```
In the `purchaseOrderId` mount effect, compute net unit costs once from the PO's items, then use the matching line's `netUnitCost` for `costPrice`. Replace the effect body's line-building loop so it reads:
```ts
      setPoSupplierId(po.supplierId)
      const totals = computePoTotals(
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
      const netByItem = new Map(totals.items.map((c) => [c.catalogItemId, c.netUnitCost]))
      const lines: ReceiveLineItem[] = []
      for (const poItem of po.items) {
        const remaining = poItem.quantityOrdered - poItem.quantityReceived
        if (remaining <= 0) continue
        const catalogItem = await db.catalogItems.get(poItem.catalogItemId)
        if (!catalogItem) continue
        lines.push({
          catalogItem,
          batchNumber: '',
          lotNumber: '',
          expiryDate: '',
          quantity: remaining,
          costPrice: netByItem.get(poItem.catalogItemId) ?? poItem.unitCost,
          sellingPrice: catalogItem.defaultSellingPrice,
        })
      }
      if (!cancelled) setItems(lines)
```
(The `netByItem` fallback to `poItem.unitCost` covers a line whose computed entry is somehow missing.)

- [ ] **Step 4: Run test + regression**

Run: `pnpm -F pharmacy-lite test receive-po-net-cost ReceiveStockFormPoMode`
Expected: both pass (PO-mode prefill still renders one line per item; cost is now net).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx apps/pharmacy-lite/src/__tests__/receive-po-net-cost.test.tsx
git commit -m "feat(pharmacy-lite): PO-mode receive prefills net unit cost (feeds WAC)"
```

---

### Task 7: i18n keys

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: keys consumed by Tasks 8–11.

- [ ] **Step 1: Add keys to `messages/en.json`**

In the `"purchaseOrders"` namespace add:
```json
"newPoLineDiscount": "Discount",
"newPoDiscountPercent": "%",
"newPoDiscountAmount": "Amount",
"newPoTaxRate": "Tax rate (%)",
"newPoFreight": "Freight",
"newPoSubtotal": "Subtotal",
"newPoDiscountTotal": "Discount",
"newPoTax": "Tax",
"newPoGrandTotal": "Grand total",
"detailPoNumber": "PO number",
"detailSubtotal": "Subtotal",
"detailDiscount": "Discount",
"detailTax": "Tax",
"detailFreight": "Freight",
"detailGrandTotal": "Grand total"
```
In the `"inventory"` namespace add:
```json
"wacColumn": "Avg cost",
"inventoryValuation": "Inventory value",
"wacUnavailable": "—"
```
In the `"settings"` namespace add:
```json
"pharmacyCodeLabel": "Pharmacy code (PO prefix)",
"poNumberPrefixLabel": "PO number prefix"
```
(If a `"settings"` namespace does not exist in the file, add the two keys to whichever namespace `PharmacySettingsView` uses — confirm by reading that component in Task 10 — and adjust these key paths accordingly. Note the chosen namespace in your report.)

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the identical keys with accurate translations (preserve any interpolation). Where a confident translation is unavailable, use the English value as interim and list those keys per locale in your report. Every key must exist in all four files.

- [ ] **Step 3: Validate JSON + parity**

Run: `node -e "['en','ar','prs','ps'].forEach(l=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+l+'.json','utf8')))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "i18n(pharmacy-lite): PO financials + WAC/valuation + PO-number settings strings"
```

---

### Task 8: New PO form — discounts, tax, freight, live totals

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/procurement/NewPurchaseOrderPage.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/NewPurchaseOrderFinancials.test.tsx` (create)

**Interfaces:**
- Consumes: `computePoTotals` (Task 2); `createPurchaseOrder` with `taxRate`/`freight` + per-line discounts (Task 4); i18n (Task 7).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/NewPurchaseOrderFinancials.test.tsx`. Seed a supplier + catalog item, add a line, set a percent discount + tax + freight, and assert the live grand total and that `createPurchaseOrder` receives the financial params. Mock the service:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { NewPurchaseOrderPage } from '@/components/pharmacy/procurement/NewPurchaseOrderPage'

const createPO = vi.fn(async () => ({ id: 'po-1' }))
vi.mock('@/lib/procurement/purchase-order-service', () => ({ createPurchaseOrder: (...a: unknown[]) => createPO(...a) }))
vi.mock('@/lib/procurement/supplier-service', () => ({ getActiveSuppliers: async () => [{ id: 's1', name: 'Acme', isActive: true, createdAt: '2026-01-01' }] }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(async () => {
  createPO.mockClear()
  await db.catalogItems.clear()
  await db.catalogItems.put({ id: 'a', name: 'Paracetamol', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 20, category: 'c', defaultSellingPrice: 500, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' })
})

function renderPage() {
  return render(<NextIntlClientProvider locale="en" messages={en}><NewPurchaseOrderPage /></NextIntlClientProvider>)
}

describe('New PO financials', () => {
  it('passes taxRate, freight, and per-line discount to createPurchaseOrder', async () => {
    renderPage()
    // add a line via catalog search
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Para' } })
    fireEvent.click(await screen.findByTestId('catalog-result'))
    // set qty 10, unit cost 1.00
    const row = await screen.findByTestId(/^line-cost-/)
    fireEvent.change(row, { target: { value: '1.00' } })
    // set line discount 10% + tax 5 + freight 3.00 (data-testids added in impl)
    fireEvent.change(screen.getByTestId('po-tax-rate'), { target: { value: '5' } })
    fireEvent.change(screen.getByTestId('po-freight'), { target: { value: '3.00' } })
    fireEvent.click(screen.getByTestId('submit-po'))
    await waitFor(() => expect(createPO).toHaveBeenCalledWith(expect.objectContaining({ taxRate: 5, freight: 300 })))
  })
})
```

> This test is a guide: add the `data-testid`s referenced (`po-tax-rate`, `po-freight`, and per-line discount inputs) in the implementation, and adjust selectors to the markup you write. The load-bearing assertion is that `createPurchaseOrder` receives `taxRate`, `freight` (minor units), and per-line `discountType`/`discountValue`, and that a live grand-total reflects them.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test NewPurchaseOrderFinancials`
Expected: FAIL — no tax/freight inputs; `createPurchaseOrder` called without financial params.

- [ ] **Step 3: Implement the financial UI**

In `NewPurchaseOrderPage.tsx`:
1. Add to `POLineState`: `discountType: '' | 'percent' | 'amount'` and `discountDisplay: string` (raw input) — default `discountType: ''`, `discountDisplay: ''`.
2. Add component state: `const [taxRateInput, setTaxRateInput] = useState('')` and `const [freightDisplay, setFreightDisplay] = useState('')`. Default `taxRateInput` from settings once loaded: in `loadInitialData`, after reading settings, `setTaxRateInput(String(settings.taxRate ?? 0))`.
3. Import `computePoTotals`. Derive live totals from `lines` (map each line to a `PoLineInput` using `unitCostMinor`, `quantityOrdered`, and the line's discount) + `Number(taxRateInput)||0` + `parseMajorToMinor(freightDisplay, currencyMinorUnits)`. Replace the single-total summary (lines ~433-441) with a breakdown showing subtotal, discount total, tax, freight, grand total (each via `formatAmount`).
4. Add per-line discount cells to the lines table: a `<select data-testid="line-disc-type-<id>">` (None/%/Amount) and a value input (`data-testid="line-disc-val-<id>"`) — value interpreted as percent (0–100) when type is `percent`, or a major-unit amount converted to minor when type is `amount`. Store on the line.
5. Add a document-charges block (before the totals summary) with `data-testid="po-tax-rate"` (number, from `taxRateInput`) and `data-testid="po-freight"` (major-unit → minor).
6. In `handleSubmit`, pass the financial fields:
```ts
const po = await createPurchaseOrder({
  supplierId, supplierName,
  items: lines.map((l) => ({
    catalogItemId: l.catalogItemId || `manual-${l.id}`,
    catalogItemName: l.catalogItemName || t('newPoManualItem'),
    quantityOrdered: parseInt(l.quantityOrdered || '0', 10) || 0,
    unitCost: l.unitCostMinor,
    discountType: l.discountType || undefined,
    discountValue: l.discountType === 'amount'
      ? parseMajorToMinor(l.discountDisplay, currencyMinorUnits)
      : (l.discountType === 'percent' ? (parseFloat(l.discountDisplay || '0') || 0) : undefined),
  })),
  taxRate: Number(taxRateInput) || 0,
  freight: parseMajorToMinor(freightDisplay, currencyMinorUnits),
  notes: notes.trim() || undefined,
  createdBy: practitionerRef,
})
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test NewPurchaseOrderFinancials`
Run: `pnpm -F pharmacy-lite typecheck`
Expected: pass; no new type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/NewPurchaseOrderPage.tsx apps/pharmacy-lite/src/__tests__/NewPurchaseOrderFinancials.test.tsx
git commit -m "feat(pharmacy-lite): PO form line discounts + tax/freight + live totals"
```

---

### Task 9: PO number + breakdown on detail & list

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrdersPage.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/po-number-display.test.tsx` (create)

**Interfaces:**
- Consumes: `PurchaseOrder.poNumber/subtotal/taxAmount/freight` (Task 1); i18n (Task 7).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/po-number-display.test.tsx`. Seed a PO with a `poNumber` + breakdown, render the list, assert the poNumber shows; render the detail, assert poNumber + a breakdown row show:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PurchaseOrdersPage } from '@/components/pharmacy/procurement/PurchaseOrdersPage'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'
import type { PurchaseOrder } from '@/lib/procurement/types'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'po-1' }), useRouter: () => ({ push: vi.fn() }) }))

const PO: PurchaseOrder = {
  id: 'po-1', poNumber: 'PO-KBL01-2026-0007', supplierId: 's1', supplierName: 'Acme', status: 'draft',
  items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 0, unitCost: 100 }],
  subtotal: 900, taxRate: 5, taxAmount: 45, freight: 300, totalCost: 1245,
  createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => { await db.purchaseOrders.clear(); await db.pharmacySettings.clear(); await db.goodsReceipts.clear(); await db.purchaseOrders.put(PO) })

describe('PO number + breakdown display', () => {
  it('list shows the poNumber', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrdersPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByText('PO-KBL01-2026-0007')).toBeInTheDocument())
  })
  it('detail shows the poNumber and a grand-total breakdown row', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrderDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByText(/PO-KBL01-2026-0007/)).toBeInTheDocument())
    expect(screen.getByText(en.purchaseOrders.detailGrandTotal)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test po-number-display`
Expected: FAIL — list shows sliced UUID; detail has no poNumber/breakdown.

- [ ] **Step 3: Update the PO list**

In `PurchaseOrdersPage.tsx`:
- Replace the id cell render `{shortId(po.id)}` with `{po.poNumber ?? shortId(po.id)}` (keep `shortId` as the legacy fallback).
- Extend the search filter (line ~91) to also match poNumber:
```ts
      ? po.supplierName.toLowerCase().includes(query) || po.id.toLowerCase().includes(query) || (po.poNumber?.toLowerCase().includes(query) ?? false)
```

- [ ] **Step 4: Update the PO detail**

In `PurchaseOrderDetailPage.tsx`:
- In the heading, replace the `shortId` usage with `{po.poNumber ?? shortId}` (keep the existing `shortId` computation as fallback).
- In the info card (the `detailSectionInfo` grid), add breakdown rows shown only when `po.subtotal != null` (new POs): Subtotal (`fmt(po.subtotal)`), Discount if `po.subtotal! < Σ(unitCost×qty)` — simplest: show Tax (`fmt(po.taxAmount ?? 0)`), Freight (`fmt(po.freight ?? 0)`), and Grand total (`fmt(po.totalCost)`) using the `t('detail*')` labels. The existing `detailTotal` row can be relabeled to `detailGrandTotal` or kept; ensure `t('detailGrandTotal')` text renders. Keep the whole block behind `po.subtotal != null` so legacy POs (no breakdown) still render with just the existing total.

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test po-number-display PurchaseOrderDetailReceive PurchaseOrderReceiptHistory`
Run: `pnpm -F pharmacy-lite typecheck`
Expected: new test passes; the Phase-1 PO-detail tests still pass; no new type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrdersPage.tsx apps/pharmacy-lite/src/__tests__/po-number-display.test.tsx
git commit -m "feat(pharmacy-lite): show PO number + totals breakdown on detail and list"
```

---

### Task 10: Settings — pharmacy code + PO number prefix

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/settings-po-number.test.tsx` (create)

**Interfaces:**
- Consumes: settings fields (Task 1); i18n (Task 7).

- [ ] **Step 1: Read the component + write the failing test**

First read `PharmacySettingsView.tsx` to learn its edit idiom (it uses `db.pharmacySettings.put({ ...current, field: next })`) and its translations namespace. Then create `apps/pharmacy-lite/src/__tests__/settings-po-number.test.tsx` that renders the view, edits the pharmacy-code field, and asserts it persists to `db.pharmacySettings`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

beforeEach(async () => { await db.pharmacySettings.clear(); await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS, locationId: 'default' }) })

describe('settings pharmacy code', () => {
  it('persists an edited pharmacy code', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><PharmacySettingsView /></NextIntlClientProvider>)
    const input = await screen.findByTestId('setting-pharmacy-code')
    fireEvent.change(input, { target: { value: 'KBL01' } })
    fireEvent.blur(input)
    await waitFor(async () => {
      const s = await db.pharmacySettings.get('default')
      expect(s!.pharmacyCode).toBe('KBL01')
    })
  })
})
```

> Adjust the assertion mechanism (blur vs a Save button) to match how `PharmacySettingsView` persists other text fields — mirror the existing pattern in that file. If the view has no text-field-persist pattern yet, add a small "save on blur" handler for these two fields consistent with the existing toggle-persist idiom.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test settings-po-number`
Expected: FAIL — no `setting-pharmacy-code` field.

- [ ] **Step 3: Add the two settings fields**

In `PharmacySettingsView.tsx`, add a settings section (or extend an existing one) with two text inputs bound to `pharmacyCode` (`data-testid="setting-pharmacy-code"`) and `poNumberPrefix` (`data-testid="setting-po-prefix"`), persisting via the same `db.pharmacySettings.put({ ...current, pharmacyCode })` idiom the component already uses for toggles. Label them with `t('pharmacyCodeLabel')` / `t('poNumberPrefixLabel')` (from the namespace confirmed in Task 7). Do not alter `poSequenceNext` from the UI (it is machine-managed).

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test settings-po-number PharmacySettingsView`
Run: `pnpm -F pharmacy-lite typecheck`
Expected: pass; the existing PharmacySettingsView test still green.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx apps/pharmacy-lite/src/__tests__/settings-po-number.test.tsx
git commit -m "feat(pharmacy-lite): settings for pharmacy code + PO number prefix"
```

---

### Task 11: WAC on stock + inventory-valuation summary

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockOverviewPage.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/wac-display.test.tsx` (create)

**Interfaces:**
- Consumes: `getWac`, `getInventoryValuation` (Task 5); i18n (Task 7).

- [ ] **Step 1: Read the components + write the failing test**

Read `StockTable.tsx` and `StockOverviewPage.tsx` to learn how rows/currency are loaded. Create `apps/pharmacy-lite/src/__tests__/wac-display.test.tsx` that seeds two active batches of a product at different costs, renders `StockOverviewPage` (or `StockTable`), and asserts the WAC value renders for the product and an inventory-value summary shows:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { StockOverviewPage } from '@/components/pharmacy/inventory/StockOverviewPage'
import type { CatalogItem, StockBatch } from '@/lib/inventory/types'

const ITEM: CatalogItem = { id: 'a', name: 'Paracetamol', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 20, category: 'c', defaultSellingPrice: 500, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }
const b = (o: Partial<StockBatch>): StockBatch => ({ id: crypto.randomUUID(), catalogItemId: 'a', batchNumber: 'B', expiryDate: '2030-01-01', quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z', status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...o })

beforeEach(async () => {
  for (const t of [db.catalogItems, db.stockBatches, db.pharmacySettings]) await t.clear()
  await db.catalogItems.put(ITEM)
  await db.stockBatches.bulkPut([b({ quantityOnHand: 10, costPrice: 100 }), b({ quantityOnHand: 30, costPrice: 200 })])
})

describe('WAC + valuation display', () => {
  it('shows an inventory-value summary', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><StockOverviewPage /></NextIntlClientProvider>)
    // total value = 10*100 + 30*200 = 7000 minor = 70.00
    await waitFor(() => expect(screen.getByTestId('inventory-valuation')).toBeInTheDocument())
    expect(screen.getByTestId('inventory-valuation').textContent).toMatch(/70\.00/)
  })
})
```

> Adjust to the real components: if `StockOverviewPage` doesn't currently load currency/settings, add that read (mirror `PurchaseOrdersPage`'s settings read). The load-bearing assertions: an inventory-value figure renders (`data-testid="inventory-valuation"`) and each stock row shows a WAC value (add a WAC column to `StockTable` using `getWac` per catalog item, rendering `t('wacUnavailable')` when null).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test wac-display`
Expected: FAIL — no valuation summary / WAC column.

- [ ] **Step 3: Implement WAC column + valuation summary**

- In `StockTable.tsx`: after loading rows, compute WAC per catalog item via `getWac(catalogItemId)` (batch the calls; dedupe by catalogItemId), store in a `Map<string, number|null>`, and add an "Avg cost" column (`t('wacColumn')`) rendering `formatAmount(wac)` or `t('wacUnavailable')` when null. Follow the existing currency-format pattern in the file.
- In `StockOverviewPage.tsx`: load `getInventoryValuation()` + settings currency, and render an `data-testid="inventory-valuation"` summary (e.g. a small stat near the alerts) showing `t('inventoryValuation')` + the formatted `totalValue`.

- [ ] **Step 4: Run test + typecheck + full Phase-2a sweep**

Run: `pnpm -F pharmacy-lite test wac-display`
Run: `pnpm -F pharmacy-lite typecheck`
Run: `pnpm -F pharmacy-lite test phase2a-schema po-totals po-number create-po-financials valuation receive-po-net-cost NewPurchaseOrderFinancials po-number-display settings-po-number wac-display`
Expected: all pass; no new type errors in touched files.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/StockOverviewPage.tsx apps/pharmacy-lite/src/__tests__/wac-display.test.tsx
git commit -m "feat(pharmacy-lite): WAC column + inventory-valuation summary"
```

---

## Self-Review

**1. Spec coverage.**
- PO number (prefix+code+year+seq, atomic counter) → Tasks 1, 3; assigned in 4; displayed 9; configured 10. ✓
- Line discount (cost-affecting) + doc tax/freight (total-only) → Tasks 1, 2; applied in 4; UI 8. ✓
- `totalCost` redefined to grand total → Task 4 (+ legacy fallback in 9). ✓
- Net unit cost into received stock → Task 6. ✓
- Derived WAC + valuation (active-only, null when empty) → Tasks 5, 11. ✓
- Settings fields → Tasks 1, 10. ✓
- i18n across 4 locales → Task 7. ✓
- Legacy-PO fallback → Task 9 (`po.poNumber ?? shortId`, breakdown behind `po.subtotal != null`); enabled by optional fields (Task 1). ✓
- No Dexie bump (all non-indexed) → Task 1. ✓

**2. Placeholder scan.** No "TBD"/"handle edge cases"/"similar to Task N". UI tasks (8, 10, 11) carry explicit new code + the load-bearing test assertions; each names a directed read of the current file to match its idiom (not a placeholder — the files were already read by the planner and the exact idioms cited). The i18n namespace for settings is flagged as "confirm in Task 10 and adjust" because `PharmacySettingsView`'s namespace must be verified at implementation — that is a directed verification, not a vague requirement.

**3. Type consistency.** `computePoTotals(items, taxRate, freight)` + `PoLineInput`/`PoLineComputed` (Task 2) are used identically in Tasks 4 and 6. `generatePoNumber(year)` (Task 3) is called in Task 4. `getWac`/`getInventoryValuation` (Task 5) are used in Task 11. `PurchaseOrder` optional financial fields (Task 1) are written in Task 4 and read in Tasks 6, 9. Settings fields (Task 1) are read in Tasks 3, 4 and written in Task 10. `discountType`/`discountValue` names match across Tasks 1, 2, 4, 6, 8.

**Build-green ordering:** the new PO financial fields are optional (Task 1), so `createPurchaseOrder` compiles before Task 4 rewrites it; `createPurchaseOrder`'s new params are optional, so the `NewPurchaseOrderPage` caller compiles before Task 8 updates it. No task leaves the tree red.
