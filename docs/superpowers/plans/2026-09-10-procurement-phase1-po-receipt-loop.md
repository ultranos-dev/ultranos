# Procurement Phase 1 — PO→Receipt→Stock Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Receive against PO" one action that atomically posts stock and updates the PO's received counts/status, with over-receipt guards, itemized receipt events, intact-only reversal, and actor attribution — plus two folded supplier bug fixes.

**Architecture:** Pure reconciliation helpers (`po-receipt.ts`) are unit-tested in isolation; `processGoodsReceipt` gains a PO-aware branch that reconciles the PO inside its existing Dexie transaction (PO sync enqueued post-tx, per the `deductStock`→`enqueueStockBatchSync` idiom); `reverseGoodsReceipt` is a single self-contained transaction. UI reuses `ReceiveStockForm` in a pre-filled "PO mode".

**Tech Stack:** Next.js 15 (`'use client'`), TypeScript, Dexie (IndexedDB), next-intl, ShadCN via `@ultranos/ui-kit`, Vitest + `fake-indexeddb`, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-10-procurement-phase1-po-receipt-loop-design.md`

## Global Constraints

- **Money is integer minor units.** Costs/prices are ints; never format in the service layer.
- **Sync idiom:** mutations enqueue a `SyncQueueEntry` via `enqueuePharmacySyncEntry({ resourceType, resourceId, action, payload, hlcTimestamp, createdAt })`. Encryption cannot run inside a Dexie transaction — a read-modify-write record (the PO) is enqueued **after** the tx with the post-tx value; pre-buildable records may be encrypted before the tx and `put` inside it (mirror the existing `processGoodsReceipt`).
- **Append-only movements.** Reversal writes new `'void_reversal'` movements; never delete/modify existing movements.
- **Controlled substances hard-block over-receipt** (`catalogItem.controlledSchedule` set): no tolerance, no override.
- **Attribution:** UI supplies `session.practitionerId ?? session.userId` from `useAuthSessionStore((s) => s.session)` (pattern: `ReceiveStockForm.tsx:27,68`).
- **i18n:** every user-facing string via `useTranslations`; add each new key to all four catalogs `messages/{en,ar,prs,ps}.json`.
- **No PHI in logs/errors:** log only opaque ids / `err.message`.
- **Commits are file-scoped** (`git add <exact paths>`, never `git add -A`). Unrelated WIP exists elsewhere in the tree.
- **Known pre-existing typecheck errors** in 5 unrelated test files (drug-catalog-trpc, krl-sync-worker, phi-cleanup, prescription-verify, sync-provider-pull) are NOT this plan's — ignore them; touched files must be clean.

---

### Task 1: Supplier bug fixes (sync enqueue + isActive filter)

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/procurement/supplier-service.ts`
- Test: `apps/pharmacy-lite/src/__tests__/supplier-service-sync.test.ts` (create)

**Interfaces:**
- Produces: `updateSupplier`/`deactivateSupplier` now enqueue a `Supplier` `update` sync entry; `getActiveSuppliers` returns rows where `isActive` is truthy via in-memory filter.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/supplier-service-sync.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createSupplier, updateSupplier, deactivateSupplier, getActiveSuppliers } from '@/lib/procurement/supplier-service'

beforeEach(async () => {
  await db.suppliers.clear()
  await db.syncQueue.clear()
})

describe('supplier-service sync + active filter', () => {
  it('getActiveSuppliers returns suppliers created with isActive:true', async () => {
    const s = await createSupplier({ name: 'Acme Pharma' })
    const active = await getActiveSuppliers()
    expect(active.map((x) => x.id)).toContain(s.id)
  })

  it('updateSupplier enqueues a Supplier update sync entry', async () => {
    const s = await createSupplier({ name: 'Acme' })
    await db.syncQueue.clear() // ignore the create entry
    await updateSupplier(s.id, { phone: '+100' })
    const entries = await db.syncQueue.where('resourceType').equals('Supplier').toArray()
    expect(entries.some((e) => e.resourceId === s.id && e.action === 'update')).toBe(true)
  })

  it('deactivateSupplier sets isActive false, drops it from active list, and enqueues sync', async () => {
    const s = await createSupplier({ name: 'Acme' })
    await db.syncQueue.clear()
    await deactivateSupplier(s.id)
    const active = await getActiveSuppliers()
    expect(active.map((x) => x.id)).not.toContain(s.id)
    const entries = await db.syncQueue.where('resourceType').equals('Supplier').toArray()
    expect(entries.some((e) => e.resourceId === s.id && e.action === 'update')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test supplier-service-sync`
Expected: FAIL — `getActiveSuppliers` returns `[]` (boolean-index mismatch) and no update sync entries exist.

- [ ] **Step 3: Implement the fixes**

In `apps/pharmacy-lite/src/lib/procurement/supplier-service.ts`, replace `updateSupplier`, `deactivateSupplier`, and `getActiveSuppliers` (lines 40-50) with:

```ts
export async function updateSupplier(id: string, updates: Partial<Omit<Supplier, 'id' | 'createdAt'>>): Promise<void> {
  await db.suppliers.update(id, updates)
  const supplier = await db.suppliers.get(id)
  if (supplier) {
    await enqueuePharmacySyncEntry({
      resourceType: 'Supplier',
      resourceId: id,
      action: 'update',
      payload: supplier as unknown as Record<string, unknown>,
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
  }
}

export async function deactivateSupplier(id: string): Promise<void> {
  await db.suppliers.update(id, { isActive: false })
  const supplier = await db.suppliers.get(id)
  if (supplier) {
    await enqueuePharmacySyncEntry({
      resourceType: 'Supplier',
      resourceId: id,
      action: 'update',
      payload: supplier as unknown as Record<string, unknown>,
      hlcTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })
  }
}

export async function getActiveSuppliers(): Promise<Supplier[]> {
  return db.suppliers.filter((s) => s.isActive).toArray()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test supplier-service-sync`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-service.ts apps/pharmacy-lite/src/__tests__/supplier-service-sync.test.ts
git commit -m "fix(pharmacy-lite): sync supplier edits + fix active-supplier query"
```

---

### Task 2: Data-model additions + Dexie v17 index

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/procurement/types.ts:24-37` (PurchaseOrder)
- Modify: `apps/pharmacy-lite/src/lib/inventory/types.ts` (GoodsReceipt + PharmacyInventorySettings + DEFAULT)
- Modify: `apps/pharmacy-lite/src/lib/db.ts:280` (add `version(17)`)
- Test: `apps/pharmacy-lite/src/__tests__/procurement-schema.test.ts` (create)

**Interfaces:**
- Produces: `PurchaseOrder.sentBy?/cancelledBy?/cancelledReason?`; `GoodsReceipt.overReceiptReason?/reversalOf?/reversedByReceiptId?`; `PharmacyInventorySettings.overReceiptTolerancePercent: number` (+ default `0`); `goodsReceipts` indexed on `purchaseOrderId`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/procurement-schema.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'
import type { GoodsReceipt } from '@/lib/inventory/types'

beforeEach(async () => { await db.goodsReceipts.clear() })

describe('procurement schema v17', () => {
  it('DEFAULT_PHARMACY_SETTINGS includes overReceiptTolerancePercent = 0', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.overReceiptTolerancePercent).toBe(0)
  })

  it('goodsReceipts is queryable by purchaseOrderId', async () => {
    const receipt: GoodsReceipt = {
      id: 'gr-1', purchaseOrderId: 'po-1', receivedBy: 'u1', items: [], totalCost: 0,
      receivedAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    }
    await db.goodsReceipts.put(receipt)
    const found = await db.goodsReceipts.where('purchaseOrderId').equals('po-1').toArray()
    expect(found.map((r) => r.id)).toEqual(['gr-1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test procurement-schema`
Expected: FAIL — `overReceiptTolerancePercent` undefined, and the `where('purchaseOrderId')` query throws (not indexed).

- [ ] **Step 3: Add the PurchaseOrder attribution fields**

In `apps/pharmacy-lite/src/lib/procurement/types.ts`, inside `interface PurchaseOrder` (after `closedAt?: string` at line 35), add:
```ts
  sentBy?: string
  cancelledBy?: string
  cancelledReason?: string
```

- [ ] **Step 4: Add GoodsReceipt reversal fields + settings tolerance**

In `apps/pharmacy-lite/src/lib/inventory/types.ts`:

Inside `interface GoodsReceipt` (after `notes?: string` at line 116), add:
```ts
  overReceiptReason?: string
  /** Set on a reversing receipt: the id of the receipt it reverses. */
  reversalOf?: string
  /** Set on an original receipt once reversed: the id of the reversing receipt. */
  reversedByReceiptId?: string
```

Inside `interface PharmacyInventorySettings` (after `salesOrderPrefix: string` at line 135), add:
```ts
  overReceiptTolerancePercent: number
```

In `DEFAULT_PHARMACY_SETTINGS` (after `salesOrderPrefix: 'SO-',` at line 155), add:
```ts
  overReceiptTolerancePercent: 0,
```

- [ ] **Step 5: Add the Dexie v17 index bump**

In `apps/pharmacy-lite/src/lib/db.ts`, immediately after the `this.version(16)` block (ends line 280), add:
```ts
    // v17: Procurement Phase 1 — index goodsReceipts by purchaseOrderId so a PO's
    // receipt history is queryable. Non-PHI operational data.
    this.version(17).stores({
      goodsReceipts: 'id, receivedAt, supplierId, purchaseOrderId',
    })
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test procurement-schema`
Expected: PASS (2/2).

- [ ] **Step 7: Typecheck**

Run: `pnpm -F pharmacy-lite typecheck`
Expected: no new errors in touched files.

- [ ] **Step 8: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/types.ts apps/pharmacy-lite/src/lib/inventory/types.ts apps/pharmacy-lite/src/lib/db.ts apps/pharmacy-lite/src/__tests__/procurement-schema.test.ts
git commit -m "feat(pharmacy-lite): procurement data model + goodsReceipts.purchaseOrderId index (v17)"
```

---

### Task 3: Pure PO-reconciliation helpers (`po-receipt.ts`)

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/po-receipt.ts`
- Test: `apps/pharmacy-lite/src/__tests__/po-receipt.test.ts` (create)

**Interfaces:**
- Consumes: `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseOrderStatus` (Task 2 types).
- Produces:
  - `class OverReceiptError extends Error` with `violations: { catalogItemId; catalogItemName; allowed; attempted; controlled }[]`
  - `interface ReceivedLine { catalogItemId: string; quantity: number }`
  - `validateReceiptAgainstPO({ po, received, controlledIds, tolerancePercent, overrideReason? }): void` — throws `OverReceiptError`
  - `applyReceiptToPO(po, received, now): { items, status, closedAt }`
  - `reverseReceiptFromPO(po, reversed): { items, status, closedAt }`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/po-receipt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  validateReceiptAgainstPO, applyReceiptToPO, reverseReceiptFromPO, OverReceiptError,
} from '@/lib/procurement/po-receipt'
import type { PurchaseOrder } from '@/lib/procurement/types'

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po-1', supplierId: 's1', supplierName: 'Acme', status: 'sent',
    items: [
      { catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 0, unitCost: 100 },
      { catalogItemId: 'b', catalogItemName: 'B', quantityOrdered: 5, quantityReceived: 0, unitCost: 50 },
    ],
    totalCost: 1250, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
const noControlled = new Set<string>()

describe('validateReceiptAgainstPO', () => {
  it('passes when within remaining', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 10 }], controlledIds: noControlled, tolerancePercent: 0 })).not.toThrow()
  })
  it('passes over-remaining within tolerance', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 11 }], controlledIds: noControlled, tolerancePercent: 10 })).not.toThrow()
  })
  it('throws over-tolerance without override reason', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 12 }], controlledIds: noControlled, tolerancePercent: 10 })).toThrow(OverReceiptError)
  })
  it('passes over-tolerance WITH override reason', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 12 }], controlledIds: noControlled, tolerancePercent: 10, overrideReason: 'bonus units' })).not.toThrow()
  })
  it('hard-blocks a controlled item over remaining regardless of tolerance + reason', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 11 }], controlledIds: new Set(['a']), tolerancePercent: 50, overrideReason: 'whatever' })).toThrow(OverReceiptError)
  })
})

describe('applyReceiptToPO', () => {
  const now = '2026-02-01T00:00:00.000Z'
  it('partial receipt → partially_received', () => {
    const r = applyReceiptToPO(po(), [{ catalogItemId: 'a', quantity: 4 }], now)
    expect(r.status).toBe('partially_received')
    expect(r.items.find((i) => i.catalogItemId === 'a')!.quantityReceived).toBe(4)
    expect(r.closedAt).toBeUndefined()
  })
  it('full receipt of all lines → closed with closedAt', () => {
    const r = applyReceiptToPO(po(), [{ catalogItemId: 'a', quantity: 10 }, { catalogItemId: 'b', quantity: 5 }], now)
    expect(r.status).toBe('closed')
    expect(r.closedAt).toBe(now)
  })
})

describe('reverseReceiptFromPO', () => {
  it('reversing a closed PO reopens it and clears closedAt', () => {
    const closed = po({ status: 'closed', closedAt: '2026-02-01T00:00:00.000Z', items: [
      { catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 10, unitCost: 100 },
      { catalogItemId: 'b', catalogItemName: 'B', quantityOrdered: 5, quantityReceived: 5, unitCost: 50 },
    ] })
    const r = reverseReceiptFromPO(closed, [{ catalogItemId: 'a', quantity: 10 }])
    expect(r.status).toBe('partially_received')
    expect(r.closedAt).toBeUndefined()
    expect(r.items.find((i) => i.catalogItemId === 'a')!.quantityReceived).toBe(0)
  })
  it('reversing all received qty returns status to sent', () => {
    const partial = po({ status: 'partially_received', items: [
      { catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 3, unitCost: 100 },
      { catalogItemId: 'b', catalogItemName: 'B', quantityOrdered: 5, quantityReceived: 0, unitCost: 50 },
    ] })
    const r = reverseReceiptFromPO(partial, [{ catalogItemId: 'a', quantity: 3 }])
    expect(r.status).toBe('sent')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test po-receipt`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `po-receipt.ts`**

Create `apps/pharmacy-lite/src/lib/procurement/po-receipt.ts`:

```ts
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from './types'

export interface ReceivedLine {
  catalogItemId: string
  quantity: number
}

export interface OverReceiptViolation {
  catalogItemId: string
  catalogItemName: string
  allowed: number
  attempted: number
  controlled: boolean
}

export class OverReceiptError extends Error {
  violations: OverReceiptViolation[]
  constructor(violations: OverReceiptViolation[]) {
    super('Received quantity exceeds the allowed maximum')
    this.name = 'OverReceiptError'
    this.violations = violations
  }
}

/**
 * Validate received quantities against a PO. Non-controlled lines may exceed the
 * remaining quantity up to `tolerancePercent`, or beyond it only if an
 * `overrideReason` is supplied. Controlled lines (in `controlledIds`) may never
 * exceed the remaining quantity. Off-PO lines are ignored (the UI prevents them).
 * Throws OverReceiptError listing all violations.
 */
export function validateReceiptAgainstPO(params: {
  po: PurchaseOrder
  received: ReceivedLine[]
  controlledIds: Set<string>
  tolerancePercent: number
  overrideReason?: string
}): void {
  const { po, received, controlledIds, tolerancePercent, overrideReason } = params
  const hasReason = !!overrideReason?.trim()
  const violations: OverReceiptViolation[] = []

  for (const line of received) {
    const poItem = po.items.find((i) => i.catalogItemId === line.catalogItemId)
    if (!poItem) continue
    const remaining = poItem.quantityOrdered - poItem.quantityReceived
    const controlled = controlledIds.has(line.catalogItemId)
    const allowed = controlled ? remaining : Math.floor(remaining * (1 + tolerancePercent / 100))
    if (line.quantity > allowed && (controlled || !hasReason)) {
      violations.push({
        catalogItemId: line.catalogItemId,
        catalogItemName: poItem.catalogItemName,
        allowed,
        attempted: line.quantity,
        controlled,
      })
    }
  }

  if (violations.length > 0) throw new OverReceiptError(violations)
}

function recomputeStatus(items: PurchaseOrderItem[], fallbackWhenNone: PurchaseOrderStatus): PurchaseOrderStatus {
  const allFully = items.every((i) => i.quantityReceived >= i.quantityOrdered)
  const anyReceived = items.some((i) => i.quantityReceived > 0)
  if (allFully) return 'closed'
  if (anyReceived) return 'partially_received'
  return fallbackWhenNone
}

/** Apply received quantities to a PO (upward). Returns updated items + status + closedAt. */
export function applyReceiptToPO(
  po: PurchaseOrder,
  received: ReceivedLine[],
  now: string,
): { items: PurchaseOrderItem[]; status: PurchaseOrderStatus; closedAt: string | undefined } {
  const items = po.items.map((item) => {
    const r = received.find((x) => x.catalogItemId === item.catalogItemId)
    return r ? { ...item, quantityReceived: item.quantityReceived + r.quantity } : item
  })
  const status = recomputeStatus(items, po.status)
  return { items, status, closedAt: status === 'closed' ? now : po.closedAt }
}

/** Reverse received quantities off a PO (downward). Reopens closed POs; clears closedAt. */
export function reverseReceiptFromPO(
  po: PurchaseOrder,
  reversed: ReceivedLine[],
): { items: PurchaseOrderItem[]; status: PurchaseOrderStatus; closedAt: string | undefined } {
  const items = po.items.map((item) => {
    const r = reversed.find((x) => x.catalogItemId === item.catalogItemId)
    return r ? { ...item, quantityReceived: Math.max(0, item.quantityReceived - r.quantity) } : item
  })
  // When nothing remains received, a PO that was being received returns to 'sent'.
  const status = recomputeStatus(items, 'sent')
  return { items, status, closedAt: status === 'closed' ? po.closedAt : undefined }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test po-receipt`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/po-receipt.ts apps/pharmacy-lite/src/__tests__/po-receipt.test.ts
git commit -m "feat(pharmacy-lite): pure PO receipt reconciliation helpers"
```

---

### Task 4: PO service attribution + sync-on-status-change

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts:41-74`
- Test: `apps/pharmacy-lite/src/__tests__/purchase-order-attribution.test.ts` (create)

**Interfaces:**
- Consumes: `enqueuePharmacySyncEntry` (already imported in the file).
- Produces:
  - `markPurchaseOrderSent(poId: string, sentBy?: string): Promise<void>` — sets `status:'sent'`, `sentAt`, `sentBy`; enqueues `PurchaseOrder` `update`.
  - `cancelPurchaseOrder(poId: string, cancelledBy?: string, reason?: string): Promise<void>` — sets `status:'cancelled'`, `cancelledBy`, `cancelledReason`; enqueues update.
  - `recordReceiptAgainstPO` remains for now (removed in Task 10).

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/purchase-order-attribution.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createPurchaseOrder, markPurchaseOrderSent, cancelPurchaseOrder } from '@/lib/procurement/purchase-order-service'

beforeEach(async () => { await db.purchaseOrders.clear(); await db.syncQueue.clear() })

async function newPO() {
  return createPurchaseOrder({
    supplierId: 's1', supplierName: 'Acme', createdBy: 'creator',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }],
  })
}

describe('PO attribution + sync', () => {
  it('markPurchaseOrderSent records sentBy + sentAt and enqueues update', async () => {
    const po = await newPO()
    await db.syncQueue.clear()
    await markPurchaseOrderSent(po.id, 'sender-1')
    const updated = await db.purchaseOrders.get(po.id)
    expect(updated!.status).toBe('sent')
    expect(updated!.sentBy).toBe('sender-1')
    expect(updated!.sentAt).toBeTruthy()
    const entries = await db.syncQueue.where('resourceType').equals('PurchaseOrder').toArray()
    expect(entries.some((e) => e.resourceId === po.id && e.action === 'update')).toBe(true)
  })

  it('cancelPurchaseOrder records cancelledBy + reason and enqueues update', async () => {
    const po = await newPO()
    await db.syncQueue.clear()
    await cancelPurchaseOrder(po.id, 'canceller-1', 'supplier closed')
    const updated = await db.purchaseOrders.get(po.id)
    expect(updated!.status).toBe('cancelled')
    expect(updated!.cancelledBy).toBe('canceller-1')
    expect(updated!.cancelledReason).toBe('supplier closed')
    const entries = await db.syncQueue.where('resourceType').equals('PurchaseOrder').toArray()
    expect(entries.some((e) => e.resourceId === po.id && e.action === 'update')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test purchase-order-attribution`
Expected: FAIL — `sentBy`/`cancelledBy` undefined and no update sync entries.

- [ ] **Step 3: Implement attribution + sync**

In `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts`, replace `markPurchaseOrderSent` (lines 41-44) and `cancelPurchaseOrder` (lines 71-74) with:

```ts
export async function markPurchaseOrderSent(poId: string, sentBy?: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'sent' as PurchaseOrderStatus, sentAt: now, sentBy, hlcTimestamp: now })
  await enqueuePOUpdate(poId, now)
}

export async function cancelPurchaseOrder(poId: string, cancelledBy?: string, reason?: string): Promise<void> {
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, {
    status: 'cancelled' as PurchaseOrderStatus,
    cancelledBy,
    cancelledReason: reason?.trim() || undefined,
    hlcTimestamp: now,
  })
  await enqueuePOUpdate(poId, now)
}

async function enqueuePOUpdate(poId: string, now: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) return
  await enqueuePharmacySyncEntry({
    resourceType: 'PurchaseOrder',
    resourceId: poId,
    action: 'update',
    payload: po as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test purchase-order-attribution`
Expected: PASS (2/2).

- [ ] **Step 5: Typecheck**

Run: `pnpm -F pharmacy-lite typecheck`
Expected: no new errors. (The two existing callers in `PurchaseOrderDetailPage.tsx` still compile — the new params are optional.)

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts apps/pharmacy-lite/src/__tests__/purchase-order-attribution.test.ts
git commit -m "feat(pharmacy-lite): attribute + sync PO send/cancel"
```

---

### Task 5: PO-aware atomic `processGoodsReceipt`

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/inventory/goods-receipt-service.ts`
- Test: `apps/pharmacy-lite/src/__tests__/goods-receipt-po.test.ts` (create)

**Interfaces:**
- Consumes: `validateReceiptAgainstPO`, `applyReceiptToPO`, `OverReceiptError` (Task 3); `getPurchaseOrderById` (existing).
- Produces: `processGoodsReceipt` gains an optional `overReceiptReason?: string` param and, when `purchaseOrderId` is set, atomically updates the PO (received counts + status) inside its transaction and enqueues the PO sync entry after the tx. Throws `OverReceiptError` when the guard fails.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/goods-receipt-po.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { OverReceiptError } from '@/lib/procurement/po-receipt'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import type { CatalogItem } from '@/lib/inventory/types'

function catalog(id: string, over: Partial<CatalogItem> = {}): CatalogItem {
  return { id, name: id, form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c',
    defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z', ...over }
}

beforeEach(async () => {
  await db.purchaseOrders.clear(); await db.goodsReceipts.clear()
  await db.stockBatches.clear(); await db.stockMovements.clear()
  await db.catalogItems.clear(); await db.pharmacySettings.clear(); await db.syncQueue.clear()
  await db.catalogItems.bulkPut([catalog('a'), catalog('ctrl', { controlledSchedule: 'II' })])
})

async function sentPO(items: { catalogItemId: string; quantityOrdered: number }[]) {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
    items: items.map((i) => ({ catalogItemId: i.catalogItemId, catalogItemName: i.catalogItemId, quantityOrdered: i.quantityOrdered, unitCost: 100 })) })
  await markPurchaseOrderSent(po.id, 'u1')
  return po
}

const line = (catalogItemId: string, quantity: number) => ({
  catalogItemId, batchNumber: `B-${catalogItemId}`, expiryDate: '2030-01-01', quantity, costPrice: 100, sellingPrice: 200,
})

describe('processGoodsReceipt PO-aware path', () => {
  it('posts stock AND updates PO counts/status atomically', async () => {
    const po = await sentPO([{ catalogItemId: 'a', quantityOrdered: 10 }])
    await processGoodsReceipt({ items: [line('a', 4)], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
    const updated = await db.purchaseOrders.get(po.id)
    expect(updated!.items[0]!.quantityReceived).toBe(4)
    expect(updated!.status).toBe('partially_received')
    const batches = await db.stockBatches.where('catalogItemId').equals('a').toArray()
    expect(batches.reduce((s, b) => s + b.quantityOnHand, 0)).toBe(4)
    const poSync = await db.syncQueue.where('resourceType').equals('PurchaseOrder').toArray()
    expect(poSync.some((e) => e.resourceId === po.id && e.action === 'update')).toBe(true)
  })

  it('closes the PO when fully received', async () => {
    const po = await sentPO([{ catalogItemId: 'a', quantityOrdered: 4 }])
    await processGoodsReceipt({ items: [line('a', 4)], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
    expect((await db.purchaseOrders.get(po.id))!.status).toBe('closed')
  })

  it('throws OverReceiptError over remaining with no tolerance/override', async () => {
    const po = await sentPO([{ catalogItemId: 'a', quantityOrdered: 4 }])
    await expect(processGoodsReceipt({ items: [line('a', 5)], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })).rejects.toBeInstanceOf(OverReceiptError)
    expect(await db.stockBatches.count()).toBe(0) // nothing posted on rejection
  })

  it('hard-blocks over-receipt of a controlled item even with override reason', async () => {
    const po = await sentPO([{ catalogItemId: 'ctrl', quantityOrdered: 4 }])
    await expect(processGoodsReceipt({ items: [line('ctrl', 5)], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default', overReceiptReason: 'bonus' })).rejects.toBeInstanceOf(OverReceiptError)
  })

  it('ad-hoc receipt (no purchaseOrderId) still posts stock and touches no PO', async () => {
    await processGoodsReceipt({ items: [line('a', 3)], receivedBy: 'u1', locationId: 'default' })
    expect(await db.stockBatches.count()).toBe(1)
    expect(await db.purchaseOrders.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test goods-receipt-po`
Expected: FAIL — PO not updated; `overReceiptReason` param unknown; no PO guard.

- [ ] **Step 3: Implement the PO-aware path**

In `apps/pharmacy-lite/src/lib/inventory/goods-receipt-service.ts`:

Add imports at the top (after line 3):
```ts
import { getPurchaseOrderById } from '@/lib/procurement/purchase-order-service'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { validateReceiptAgainstPO, applyReceiptToPO } from '@/lib/procurement/po-receipt'
import { DEFAULT_PHARMACY_SETTINGS } from './types'
```

Change the `processGoodsReceipt` params type to add `overReceiptReason?: string` (after `notes?: string` at line 11).

Persist the reason onto the receipt object (line 26 area): add `overReceiptReason,` to the `receipt` literal.

Immediately after computing `totalCost` (line 17), before building batches, add the PO guard:
```ts
  // PO reconciliation guard (only when receiving against a PO)
  let po = purchaseOrderId ? await getPurchaseOrderById(purchaseOrderId) : undefined
  if (purchaseOrderId && !po) throw new Error('Purchase order not found')
  if (po && po.status !== 'sent' && po.status !== 'partially_received') {
    throw new Error(`Purchase order is not receivable (status: ${po.status})`)
  }
  if (po) {
    const received = items.map((i) => ({ catalogItemId: i.catalogItemId, quantity: i.quantity }))
    const catalogIds = [...new Set(received.map((r) => r.catalogItemId))]
    const catalogItems = await db.catalogItems.where('id').anyOf(catalogIds).toArray()
    const controlledIds = new Set(catalogItems.filter((c) => c.controlledSchedule).map((c) => c.id))
    const settings = await db.pharmacySettings.toCollection().first()
    const tolerancePercent = settings?.overReceiptTolerancePercent ?? DEFAULT_PHARMACY_SETTINGS.overReceiptTolerancePercent
    validateReceiptAgainstPO({ po, received, controlledIds, tolerancePercent, overrideReason: overReceiptReason })
  }
```

Add `db.purchaseOrders` to the transaction table list (line 106):
```ts
  await db.transaction('rw', [db.goodsReceipts, db.stockBatches, db.stockMovements, db.syncQueue, db.purchaseOrders], async () => {
```

Inside the transaction, after `await db.syncQueue.put(receiptSyncEntry)` (line 116), add the PO read-modify-write:
```ts
    if (purchaseOrderId) {
      const current = await db.purchaseOrders.get(purchaseOrderId)
      if (current) {
        const received = items.map((i) => ({ catalogItemId: i.catalogItemId, quantity: i.quantity }))
        const applied = applyReceiptToPO(current, received, now)
        await db.purchaseOrders.update(purchaseOrderId, {
          items: applied.items, status: applied.status, closedAt: applied.closedAt, hlcTimestamp: now,
        })
      }
    }
```

After the transaction (after line 117, before `return receipt`), enqueue the PO sync with the post-tx value:
```ts
  if (purchaseOrderId) {
    const updatedPO = await db.purchaseOrders.get(purchaseOrderId)
    if (updatedPO) {
      await enqueuePharmacySyncEntry({
        resourceType: 'PurchaseOrder', resourceId: purchaseOrderId, action: 'update',
        payload: updatedPO as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
      })
    }
  }
```

> Note the guard runs and throws BEFORE any encryption/transaction work, so a rejected over-receipt posts nothing (asserted by the test). The `po` variable read pre-tx is only used for the guard; the authoritative update re-reads inside the tx.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test goods-receipt-po`
Expected: PASS (5/5).

- [ ] **Step 5: Run the existing goods-receipt tests (regression)**

Run: `pnpm -F pharmacy-lite test goods-receipt`
Expected: any pre-existing goods-receipt tests still pass (ad-hoc path unchanged).

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/goods-receipt-service.ts apps/pharmacy-lite/src/__tests__/goods-receipt-po.test.ts
git commit -m "feat(pharmacy-lite): atomic PO reconciliation in processGoodsReceipt + over-receipt guard"
```

---

### Task 6: Intact-only `reverseGoodsReceipt`

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/goods-receipt-reversal.ts`
- Test: `apps/pharmacy-lite/src/__tests__/goods-receipt-reversal.test.ts` (create)

**Interfaces:**
- Consumes: `reverseReceiptFromPO` (Task 3); `buildEncryptedSyncEntry` (existing in `goods-receipt-service.ts`'s import source `@/lib/dexie-sync-adapter`); `enqueuePharmacySyncEntry`.
- Produces:
  - `class ReceiptNotReversibleError extends Error` with `reason: 'already_reversed' | 'is_reversal' | 'stock_not_intact'` and `drawnDownBatchIds?: string[]`
  - `reverseGoodsReceipt(receiptId: string, performedBy: string): Promise<GoodsReceipt>` (the reversing receipt)

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/goods-receipt-reversal.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { reverseGoodsReceipt, ReceiptNotReversibleError } from '@/lib/inventory/goods-receipt-reversal'
import { recordDisposal } from '@/lib/inventory/stock-movement'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import type { CatalogItem } from '@/lib/inventory/types'

function catalog(id: string): CatalogItem {
  return { id, name: id, form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c',
    defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }
}
const line = (catalogItemId: string, quantity: number) => ({
  catalogItemId, batchNumber: `B-${catalogItemId}`, expiryDate: '2030-01-01', quantity, costPrice: 100, sellingPrice: 200,
})

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.goodsReceipts, db.stockBatches, db.stockMovements, db.catalogItems, db.pharmacySettings, db.syncQueue]) await t.clear()
  await db.catalogItems.put(catalog('a'))
})

async function receiveAgainstFreshPO(qty: number) {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
    items: [{ catalogItemId: 'a', catalogItemName: 'a', quantityOrdered: qty, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  const receipt = await processGoodsReceipt({ items: [line('a', qty)], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  return { po, receipt }
}

describe('reverseGoodsReceipt', () => {
  it('reverses an intact receipt: depletes batches, appends void_reversal, rolls back PO counts', async () => {
    const { po, receipt } = await receiveAgainstFreshPO(5)
    expect((await db.purchaseOrders.get(po.id))!.status).toBe('closed')

    const reversal = await reverseGoodsReceipt(receipt.id, 'u2')
    expect(reversal.reversalOf).toBe(receipt.id)

    const batches = await db.stockBatches.filter((b) => b.goodsReceiptId === receipt.id).toArray()
    expect(batches.every((b) => b.quantityOnHand === 0 && b.status === 'depleted')).toBe(true)

    const voids = await db.stockMovements.where('type').equals('void_reversal').toArray()
    expect(voids.length).toBe(1)
    expect(voids[0]!.quantity).toBe(-5)

    const reopened = await db.purchaseOrders.get(po.id)
    expect(reopened!.items[0]!.quantityReceived).toBe(0)
    expect(reopened!.status).toBe('sent')

    const original = await db.goodsReceipts.get(receipt.id)
    expect(original!.reversedByReceiptId).toBe(reversal.id)
  })

  it('blocks reversal when the received stock was drawn down', async () => {
    const { receipt } = await receiveAgainstFreshPO(5)
    const batch = (await db.stockBatches.filter((b) => b.goodsReceiptId === receipt.id).toArray())[0]!
    await recordDisposal({ stockBatchId: batch.id, quantity: 2, reasonCode: 'damaged', performedBy: 'u1' })
    await expect(reverseGoodsReceipt(receipt.id, 'u2')).rejects.toBeInstanceOf(ReceiptNotReversibleError)
  })

  it('blocks reversing an already-reversed receipt', async () => {
    const { receipt } = await receiveAgainstFreshPO(5)
    await reverseGoodsReceipt(receipt.id, 'u2')
    await expect(reverseGoodsReceipt(receipt.id, 'u2')).rejects.toBeInstanceOf(ReceiptNotReversibleError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test goods-receipt-reversal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `goods-receipt-reversal.ts`**

Create `apps/pharmacy-lite/src/lib/inventory/goods-receipt-reversal.ts`:

```ts
import { db } from '@/lib/db'
import { buildEncryptedSyncEntry, enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { reverseReceiptFromPO } from '@/lib/procurement/po-receipt'
import type { GoodsReceipt, StockBatch, StockMovement } from './types'

export class ReceiptNotReversibleError extends Error {
  reason: 'already_reversed' | 'is_reversal' | 'stock_not_intact'
  drawnDownBatchIds?: string[]
  constructor(reason: ReceiptNotReversibleError['reason'], drawnDownBatchIds?: string[]) {
    super(`Goods receipt is not reversible: ${reason}`)
    this.name = 'ReceiptNotReversibleError'
    this.reason = reason
    this.drawnDownBatchIds = drawnDownBatchIds
  }
}

/**
 * Reverse a goods receipt only while every batch it created is intact
 * (status 'active' and quantityOnHand equal to the received quantity). Writes
 * one 'void_reversal' movement per batch (append-only), depletes the batches,
 * writes a reversing GoodsReceipt, marks the original reversed, and — if the
 * receipt was against a PO — rolls the PO's received counts back. All inside a
 * single transaction; the PO sync entry is enqueued after the tx.
 */
export async function reverseGoodsReceipt(receiptId: string, performedBy: string): Promise<GoodsReceipt> {
  const receipt = await db.goodsReceipts.get(receiptId)
  if (!receipt) throw new Error(`GoodsReceipt not found: ${receiptId}`)
  if (receipt.reversalOf) throw new ReceiptNotReversibleError('is_reversal')
  if (receipt.reversedByReceiptId) throw new ReceiptNotReversibleError('already_reversed')

  // Batches this receipt created (goodsReceiptId is not indexed — filter in memory).
  const batches = await db.stockBatches.filter((b) => b.goodsReceiptId === receiptId).toArray()

  // Intact check: each batch must still hold exactly its received quantity and be active.
  const qtyByBatchNumber = new Map(receipt.items.map((it) => [it.batchNumber, it.quantity]))
  const drawnDown: string[] = []
  for (const b of batches) {
    const received = qtyByBatchNumber.get(b.batchNumber)
    if (b.status !== 'active' || received === undefined || b.quantityOnHand !== received) {
      drawnDown.push(b.id)
    }
  }
  if (drawnDown.length > 0) throw new ReceiptNotReversibleError('stock_not_intact', drawnDown)

  const now = new Date().toISOString()
  const reversalId = crypto.randomUUID()

  // Build reversing movements (append-only) + the reversing receipt record.
  const movements: StockMovement[] = batches.map((b) => ({
    id: crypto.randomUUID(),
    stockBatchId: b.id,
    catalogItemId: b.catalogItemId,
    type: 'void_reversal',
    quantity: -b.quantityOnHand,
    reason: undefined,
    referenceId: receiptId,
    referenceType: 'void',
    performedBy,
    timestamp: now,
    hlcTimestamp: now,
  }))

  const reversalReceipt: GoodsReceipt = {
    id: reversalId,
    supplierId: receipt.supplierId,
    purchaseOrderId: receipt.purchaseOrderId,
    receivedBy: performedBy,
    items: receipt.items.map((it) => ({ ...it, quantity: -it.quantity })),
    totalCost: -receipt.totalCost,
    notes: undefined,
    reversalOf: receiptId,
    receivedAt: now,
    hlcTimestamp: now,
  }

  // Pre-build encrypted sync entries (encryption cannot run inside a tx zone).
  const movementSyncEntries = await Promise.all(movements.map((m) =>
    buildEncryptedSyncEntry({ resourceType: 'StockMovement', resourceId: m.id, action: 'create', payload: m as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })))
  const batchSyncEntries = await Promise.all(batches.map((b) =>
    buildEncryptedSyncEntry({ resourceType: 'StockBatch', resourceId: b.id, action: 'update', payload: { ...b, quantityOnHand: 0, status: 'depleted' as const, hlcTimestamp: now } as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })))
  const reversalReceiptSyncEntry = await buildEncryptedSyncEntry({ resourceType: 'GoodsReceipt', resourceId: reversalId, action: 'create', payload: reversalReceipt as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })
  const originalReceiptSyncEntry = await buildEncryptedSyncEntry({ resourceType: 'GoodsReceipt', resourceId: receiptId, action: 'update', payload: { ...receipt, reversedByReceiptId: reversalId } as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })

  await db.transaction('rw', [db.stockBatches, db.stockMovements, db.goodsReceipts, db.purchaseOrders, db.syncQueue], async () => {
    for (let i = 0; i < batches.length; i++) {
      await db.stockMovements.put(movements[i]!)
      await db.stockBatches.update(batches[i]!.id, { quantityOnHand: 0, status: 'depleted', hlcTimestamp: now })
      await db.syncQueue.put(movementSyncEntries[i]!)
      await db.syncQueue.put(batchSyncEntries[i]!)
    }
    await db.goodsReceipts.put(reversalReceipt)
    await db.goodsReceipts.update(receiptId, { reversedByReceiptId: reversalId })
    await db.syncQueue.put(reversalReceiptSyncEntry)
    await db.syncQueue.put(originalReceiptSyncEntry)

    if (receipt.purchaseOrderId) {
      const po = await db.purchaseOrders.get(receipt.purchaseOrderId)
      if (po) {
        const reversed = receipt.items.map((it) => ({ catalogItemId: it.catalogItemId, quantity: it.quantity }))
        const rolled = reverseReceiptFromPO(po, reversed)
        await db.purchaseOrders.update(po.id, { items: rolled.items, status: rolled.status, closedAt: rolled.closedAt, hlcTimestamp: now })
      }
    }
  })

  // Enqueue the PO sync entry after the tx (post-tx value; encryption idiom).
  if (receipt.purchaseOrderId) {
    const updatedPO = await db.purchaseOrders.get(receipt.purchaseOrderId)
    if (updatedPO) {
      await enqueuePharmacySyncEntry({ resourceType: 'PurchaseOrder', resourceId: updatedPO.id, action: 'update', payload: updatedPO as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })
    }
  }

  return reversalReceipt
}
```

> If `buildEncryptedSyncEntry` / `enqueuePharmacySyncEntry` are not both exported from `@/lib/dexie-sync-adapter`, check that module for the exact export names (the goods-receipt-service imports `buildEncryptedSyncEntry` from it; the supplier-service imports `enqueuePharmacySyncEntry` from it) and use those.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test goods-receipt-reversal`
Expected: PASS (3/3).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm -F pharmacy-lite typecheck` (no new errors in touched files)
```bash
git add apps/pharmacy-lite/src/lib/inventory/goods-receipt-reversal.ts apps/pharmacy-lite/src/__tests__/goods-receipt-reversal.test.ts
git commit -m "feat(pharmacy-lite): intact-only goods receipt reversal"
```

---

### Task 7: i18n keys for receive-against-PO + reversal

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: keys under `inventory` and `purchaseOrders` namespaces consumed by Tasks 8–10.

- [ ] **Step 1: Add keys to `messages/en.json`**

In the `"purchaseOrders"` namespace add:
```json
"receiveAgainstPo": "Receive against PO",
"receiptHistory": "Receipt history",
"receiptHistoryEmpty": "No receipts recorded yet.",
"receiptReceivedBy": "Received by {who}",
"reverseReceipt": "Reverse",
"reverseReceiptConfirm": "Reverse this receipt? Stock from it will be removed and the PO counts rolled back.",
"reverseReceiptBlocked": "This receipt can't be reversed because some of its stock has already been used. Use a stock adjustment instead.",
"reverseReceiptError": "Could not reverse the receipt.",
"receiptReversed": "Reversed",
"cancelReasonPrompt": "Reason for cancelling (optional)"
```
In the `"inventory"` namespace add:
```json
"receivingAgainstPo": "Receiving against PO {po}",
"overReceiptReason": "Reason for receiving more than ordered",
"overReceiptBlocked": "{item}: cannot receive {attempted} — only {allowed} remaining.",
"overReceiptControlledBlocked": "{item} is a controlled substance — you cannot receive more than the {allowed} ordered.",
"poNotReceivable": "This purchase order can no longer be received.",
"poLineRemaining": "{remaining} remaining"
```

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the same keys with accurate translations; where a confident translation is unavailable, use the English value as interim and list those keys in your report. Every key must exist in all four files (a missing key throws at render).

- [ ] **Step 3: Validate JSON**

Run: `node -e "['en','ar','prs','ps'].forEach(l=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+l+'.json','utf8')))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "i18n(pharmacy-lite): receive-against-PO + reversal strings"
```

---

### Task 8: `ReceiveStockForm` PO mode + route/page `poId` threading

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockPage.tsx`
- Modify: `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/receive/page.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/ReceiveStockFormPoMode.test.tsx` (create)

**Interfaces:**
- Consumes: `processGoodsReceipt` (Task 5, now accepts `overReceiptReason`); `getPurchaseOrderById`; `OverReceiptError` (Task 3).
- Produces: `ReceiveStockForm` accepts `purchaseOrderId?: string`; `ReceiveStockPage` accepts `purchaseOrderId?: string`; the receive route reads `?poId=`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/ReceiveStockFormPoMode.test.tsx`. It seeds a PO + catalog item, renders the form in PO mode, and asserts lines pre-fill and the add-item search is hidden:

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

async function seedPO() {
  await db.catalogItems.put(ITEM)
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
    items: [{ catalogItemId: 'a', catalogItemName: 'Paracetamol', quantityOrdered: 10, unitCost: 300 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  return po
}

beforeEach(async () => { for (const t of [db.catalogItems, db.purchaseOrders, db.syncQueue]) await t.clear() })

describe('ReceiveStockForm PO mode', () => {
  it('pre-fills a line per PO item and hides the add-item search', async () => {
    const po = await seedPO()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ReceiveStockForm locationId="default" currencyMinorUnits={2} purchaseOrderId={po.id} onComplete={() => {}} />
      </NextIntlClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('Paracetamol')).toBeInTheDocument())
    expect(screen.getByTestId('receive-item-0')).toBeInTheDocument()
    // Add-item search hidden in PO mode
    expect(screen.queryByTestId('catalog-search-input')).not.toBeInTheDocument()
  })
})
```

> If `CatalogSearchInput`'s root has no `data-testid`, add `data-testid="catalog-search-input"` to it as part of this task so the "hidden in PO mode" assertion is meaningful.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test ReceiveStockFormPoMode`
Expected: FAIL — `purchaseOrderId` prop unknown; no pre-fill.

- [ ] **Step 3: Implement PO mode in `ReceiveStockForm.tsx`**

Add `purchaseOrderId?: string` to `ReceiveStockFormProps`. Add imports:
```ts
import { useEffect } from 'react'
import { getPurchaseOrderById } from '@/lib/procurement/purchase-order-service'
import { OverReceiptError } from '@/lib/procurement/po-receipt'
```
Add state for the override reason and PO supplier:
```ts
const [overReceiptReason, setOverReceiptReason] = useState('')
const [poSupplierId, setPoSupplierId] = useState<string | undefined>(undefined)
```
Add a mount effect that pre-fills from the PO when `purchaseOrderId` is set:
```ts
useEffect(() => {
  if (!purchaseOrderId) return
  let cancelled = false
  ;(async () => {
    const po = await getPurchaseOrderById(purchaseOrderId)
    if (!po || cancelled) return
    setPoSupplierId(po.supplierId)
    const lines: ReceiveLineItem[] = []
    for (const poItem of po.items) {
      const remaining = poItem.quantityOrdered - poItem.quantityReceived
      if (remaining <= 0) continue
      const catalogItem = await db.catalogItems.get(poItem.catalogItemId)
      if (!catalogItem) continue
      lines.push({ catalogItem, batchNumber: '', lotNumber: '', expiryDate: '', quantity: remaining, costPrice: poItem.unitCost, sellingPrice: catalogItem.defaultSellingPrice })
    }
    if (!cancelled) setItems(lines)
  })()
  return () => { cancelled = true }
}, [purchaseOrderId])
```
(add `import { db } from '@/lib/db'` if not already imported.)

In `handleSubmit`, pass PO context and the override reason, and map `OverReceiptError` to inline copy:
```ts
await processGoodsReceipt({
  items: items.map((item) => ({ catalogItemId: item.catalogItem.id, batchNumber: item.batchNumber.trim(), lotNumber: item.lotNumber.trim() || undefined, expiryDate: item.expiryDate, quantity: item.quantity, costPrice: item.costPrice, sellingPrice: item.sellingPrice })),
  receivedBy: session.practitionerId ?? session.userId,
  locationId,
  purchaseOrderId,
  supplierId: poSupplierId,
  overReceiptReason: overReceiptReason.trim() || undefined,
  notes: notes.trim() || undefined,
})
```
Wrap the call so an `OverReceiptError` sets a specific message:
```ts
} catch (err) {
  if (err instanceof OverReceiptError) {
    const v = err.violations[0]
    setError(v?.controlled ? t('overReceiptControlledBlocked', { item: v.catalogItemName, allowed: v.allowed }) : t('overReceiptBlocked', { item: v?.catalogItemName ?? '', attempted: v?.attempted ?? 0, allowed: v?.allowed ?? 0 }))
  } else {
    setError(t('failedProcessReceipt'))
  }
}
```
Render, in PO mode only: hide `CatalogSearchInput` (`{!purchaseOrderId && <CatalogSearchInput ... />}`), and show the override-reason input when any line's qty exceeds its (implicit) remaining — simplest: always show the optional reason field in PO mode above the submit button:
```tsx
{purchaseOrderId && (
  <div>
    <label htmlFor="over-receipt-reason" className="mb-1 block text-xs font-medium text-muted-foreground">{t('overReceiptReason')}</label>
    <input id="over-receipt-reason" type="text" value={overReceiptReason} onChange={(e) => setOverReceiptReason(e.target.value)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
  </div>
)}
```

- [ ] **Step 4: Thread `purchaseOrderId` through `ReceiveStockPage` + the route**

In `ReceiveStockPage.tsx`: add a prop `{ purchaseOrderId }: { purchaseOrderId?: string }`, pass it to `<ReceiveStockForm ... purchaseOrderId={purchaseOrderId} />`. In PO mode use `t('receivingAgainstPo', { po: purchaseOrderId!.slice(0, 6) })` as the heading when set (else the existing `t('receiveStock')`).

In `src/app/[locale]/(app)/inventory/receive/page.tsx`, read the search param and pass it:
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { ReceiveStockPage } from '@/components/pharmacy/inventory/ReceiveStockPage'

export default function ReceiveStockRoute() {
  const poId = useSearchParams().get('poId') ?? undefined
  return <ReceiveStockPage purchaseOrderId={poId} />
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test ReceiveStockFormPoMode`
Run: `pnpm -F pharmacy-lite test ReceiveStock` (existing receive tests still green)
Run: `pnpm -F pharmacy-lite typecheck`
Expected: all pass; no new type errors in touched files.

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockPage.tsx "apps/pharmacy-lite/src/app/[locale]/(app)/inventory/receive/page.tsx" apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogSearchInput.tsx apps/pharmacy-lite/src/__tests__/ReceiveStockFormPoMode.test.tsx
git commit -m "feat(pharmacy-lite): receive-against-PO mode in ReceiveStockForm"
```

---

### Task 9: PO detail — "Receive against PO" button + send/cancel attribution

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/PurchaseOrderDetailReceive.test.tsx` (create)

**Interfaces:**
- Consumes: `markPurchaseOrderSent(poId, sentBy)`, `cancelPurchaseOrder(poId, cancelledBy, reason?)` (Task 4); `useAuthSessionStore`.
- Produces: PO detail links to `/inventory/receive?poId=<id>` for receiving; the inline counter-only receipt inputs are removed; send/cancel pass the authenticated user.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/PurchaseOrderDetailReceive.test.tsx`. Seed a `sent` PO, render the detail page, assert a "Receive against PO" link to `/inventory/receive?poId=…` exists and the old per-item receipt-qty inputs are gone:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: globalThis.__poid }),
  useRouter: () => ({ push: vi.fn() }),
}))

beforeEach(async () => { for (const t of [db.purchaseOrders, db.pharmacySettings, db.goodsReceipts, db.syncQueue]) await t.clear() })

describe('PurchaseOrderDetailPage receive flow', () => {
  it('shows a Receive-against-PO link and no inline receipt-qty inputs', async () => {
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
      items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
    await markPurchaseOrderSent(po.id, 'u1')
    ;(globalThis as unknown as { __poid: string }).__poid = po.id

    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrderDetailPage /></NextIntlClientProvider>)

    await waitFor(() => expect(screen.getByTestId('receive-against-po-link')).toBeInTheDocument())
    expect(screen.getByTestId('receive-against-po-link').getAttribute('href')).toContain(`/inventory/receive?poId=${po.id}`)
    expect(screen.queryByTestId(`receipt-qty-a`)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test PurchaseOrderDetailReceive`
Expected: FAIL — no `receive-against-po-link`; old `receipt-qty-a` input still present.

- [ ] **Step 3: Replace the receipt inputs with a Receive link + wire attribution**

In `PurchaseOrderDetailPage.tsx`:
- Add `import Link from 'next/link'` and `import { useAuthSessionStore } from '@/stores/auth-session-store'`; read `const session = useAuthSessionStore((s) => s.session)` and `const performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'`.
- Delete the `receiptQtys` state, `handleRecordReceipt`, the `record-receipt-btn` button, and the per-item `Qty to receive` `<th>`/`<td>` input column (the `isReceiptable && (...)` input blocks). Remove the now-unused `recordReceiptAgainstPO` import.
- In the action row, for `isReceiptable`, render instead:
```tsx
<Link
  href={`/inventory/receive?poId=${po.id}`}
  data-testid="receive-against-po-link"
  className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
>
  <ClipboardCheck size={16} className="me-2" />
  {t('receiveAgainstPo')}
</Link>
```
- Change `handleMarkSent` to `await markPurchaseOrderSent(po.id, performedBy)` and `handleCancel` to `await cancelPurchaseOrder(po.id, performedBy)`.
- Keep the items table's Ordered / Received / Unit cost / Line total columns (read-only) — only the receipt-qty input column is removed.

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm -F pharmacy-lite test PurchaseOrderDetailReceive`
Run: `pnpm -F pharmacy-lite typecheck`
Expected: pass; no new type errors. (`recordReceiptAgainstPO` still exists in the service; it's removed in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx apps/pharmacy-lite/src/__tests__/PurchaseOrderDetailReceive.test.tsx
git commit -m "feat(pharmacy-lite): PO detail receives via shared form + attributes send/cancel"
```

---

### Task 10: PO detail — receipt history + reverse action; retire `recordReceiptAgainstPO`

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx`
- Modify: `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts` (remove `recordReceiptAgainstPO`)
- Test: `apps/pharmacy-lite/src/__tests__/PurchaseOrderReceiptHistory.test.tsx` (create)

**Interfaces:**
- Consumes: `reverseGoodsReceipt`, `ReceiptNotReversibleError` (Task 6); `db.goodsReceipts`.
- Produces: a Receipt-history section listing the PO's `GoodsReceipts` with a Reverse action per reversible receipt.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/PurchaseOrderReceiptHistory.test.tsx`. Seed a PO with one posted receipt (via `processGoodsReceipt`), render the detail page, assert the receipt appears with a Reverse button:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import type { CatalogItem } from '@/lib/inventory/types'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: globalThis.__poid }), useRouter: () => ({ push: vi.fn() }) }))

const ITEM: CatalogItem = { id: 'a', name: 'A', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => { for (const t of [db.purchaseOrders, db.goodsReceipts, db.stockBatches, db.stockMovements, db.catalogItems, db.pharmacySettings, db.syncQueue]) await t.clear(); await db.catalogItems.put(ITEM) })

describe('PO detail receipt history', () => {
  it('lists a posted receipt with a Reverse action', async () => {
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 5, unitCost: 100 }] })
    await markPurchaseOrderSent(po.id, 'u1')
    await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: 5, costPrice: 100, sellingPrice: 200 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
    ;(globalThis as unknown as { __poid: string }).__poid = po.id

    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrderDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByTestId('receipt-history')).toBeInTheDocument())
    expect(screen.getAllByTestId(/^reverse-receipt-/).length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test PurchaseOrderReceiptHistory`
Expected: FAIL — no `receipt-history` section.

- [ ] **Step 3: Add the receipt-history section + reverse action**

In `PurchaseOrderDetailPage.tsx`:
- Add `import { reverseGoodsReceipt, ReceiptNotReversibleError } from '@/lib/inventory/goods-receipt-reversal'` and `import type { GoodsReceipt } from '@/lib/inventory/types'`.
- Add state `const [receipts, setReceipts] = useState<GoodsReceipt[]>([])` and `const [reversing, setReversing] = useState<string | null>(null)`.
- In `load()`, after setting the PO, load receipts:
```ts
const rs = await db.goodsReceipts.where('purchaseOrderId').equals(id).toArray()
setReceipts(rs.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)))
```
- Add a reverse handler:
```ts
const handleReverse = async (receiptId: string) => {
  if (!window.confirm(t('reverseReceiptConfirm'))) return
  setReversing(receiptId); setActionError(null)
  try {
    await reverseGoodsReceipt(receiptId, performedBy)
    setLoading(true); await load()
  } catch (err) {
    setActionError(err instanceof ReceiptNotReversibleError ? t('reverseReceiptBlocked') : t('reverseReceiptError'))
    console.error('[PurchaseOrderDetailPage] reverse failed:', err instanceof Error ? err.message : 'unknown')
  } finally { setReversing(null) }
}
```
- Render a Receipt-history card below the items card:
```tsx
<div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50" data-testid="receipt-history">
  <div className="p-5 pb-0"><h2 className="mb-4 text-base font-semibold text-foreground">{t('receiptHistory')}</h2></div>
  {receipts.length === 0 ? (
    <div className="p-5 pt-0 text-sm text-muted-foreground">{t('receiptHistoryEmpty')}</div>
  ) : (
    <ul className="divide-y divide-border">
      {receipts.map((r) => {
        const isReversal = !!r.reversalOf
        const reversed = !!r.reversedByReceiptId
        const totalQty = r.items.reduce((s, it) => s + it.quantity, 0)
        return (
          <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
            <div>
              <span className="text-foreground">{new Date(r.receivedAt).toLocaleDateString()} · {totalQty > 0 ? '+' : ''}{totalQty}</span>
              <span className="ms-2 text-xs text-muted-foreground">{t('receiptReceivedBy', { who: r.receivedBy })}</span>
              {reversed && <span className="ms-2 text-xs text-destructive">{t('receiptReversed')}</span>}
            </div>
            {!isReversal && !reversed && (
              <Button variant="ghost" size="sm" className="text-destructive" data-testid={`reverse-receipt-${r.id}`} disabled={reversing === r.id} onClick={() => handleReverse(r.id)}>
                {t('reverseReceipt')}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )}
</div>
```

- [ ] **Step 4: Retire `recordReceiptAgainstPO`**

In `apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts`, delete the `recordReceiptAgainstPO` function (lines 46-69). Confirm no remaining references:
Run: `grep -rn "recordReceiptAgainstPO" apps/pharmacy-lite/src` → expected: no matches.

- [ ] **Step 5: Run test + typecheck + full procurement sweep**

Run: `pnpm -F pharmacy-lite test PurchaseOrderReceiptHistory`
Run: `pnpm -F pharmacy-lite typecheck`
Run: `pnpm -F pharmacy-lite test supplier-service-sync procurement-schema po-receipt purchase-order-attribution goods-receipt-po goods-receipt-reversal ReceiveStockFormPoMode PurchaseOrderDetailReceive PurchaseOrderReceiptHistory`
Expected: all pass; no new type errors in touched files.

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts apps/pharmacy-lite/src/__tests__/PurchaseOrderReceiptHistory.test.tsx
git commit -m "feat(pharmacy-lite): PO receipt history + reversal UI; retire counter-only recordReceiptAgainstPO"
```

---

## Self-Review

**1. Spec coverage.**
- Reuse `ReceiveStockForm` pre-filled from PO → Task 8. ✓
- Atomic PO update inside the goods-receipt tx + post-tx PO sync → Task 5. ✓
- Over-receipt soft block + tolerance + override; controlled hard-block → Tasks 3 (pure) + 5 (enforced). ✓
- Intact-only reversal, append-only, single tx, PO rollback → Task 6. ✓
- Reuse `GoodsReceipt` as per-receipt event; receipt history by `purchaseOrderId` → Tasks 2 (index) + 10 (history). ✓
- Attribution (`sentBy`/`cancelledBy`/`receivedBy`) → Tasks 2 (fields) + 4 (service) + 9 (UI wiring). ✓
- Data model additions + tolerance setting + v17 index → Task 2. ✓
- Two supplier bug fixes → Task 1. ✓
- i18n across four locales → Task 7. ✓
- Retire `recordReceiptAgainstPO` → Task 10 (after its UI caller is removed in Task 9 — build stays green throughout). ✓

**2. Placeholder scan.** No "TBD"/"handle edge cases"/"similar to Task N" — each task carries its own code. Two directed lookups are intentional, not placeholders: confirm `buildEncryptedSyncEntry`/`enqueuePharmacySyncEntry` export names (Task 6) and add a `data-testid` to `CatalogSearchInput` if absent (Task 8).

**3. Type consistency.** `ReceivedLine`, `OverReceiptError`, `validateReceiptAgainstPO`, `applyReceiptToPO`, `reverseReceiptFromPO` (Task 3) are used with identical signatures in Tasks 5–6. `processGoodsReceipt`'s new `overReceiptReason?` (Task 5) matches its caller in Task 8. `markPurchaseOrderSent(poId, sentBy?)` / `cancelPurchaseOrder(poId, cancelledBy?, reason?)` (Task 4) match the callers in Task 9. `GoodsReceipt.reversalOf/reversedByReceiptId/overReceiptReason` (Task 2) are the fields written in Tasks 5–6 and read in Task 10. `overReceiptTolerancePercent` (Task 2) is read in Task 5.

**Build-green ordering note:** service signature changes (Tasks 4, 5) are additive/optional so existing callers keep compiling; the only removal (`recordReceiptAgainstPO`) happens in Task 10, one task after its sole UI caller is removed (Task 9).
