# Pharmacy Inventory P0 — Track 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual stock adjustments, disposal/write-off, and a stock-movement ledger to the Pharmacy PWA, built on one shared movement module.

**Architecture:** A single new module `src/lib/inventory/stock-movement.ts` owns reason-code enums, `recordAdjustment()`, `recordDisposal()`, and `queryMovements()`. Both record functions reuse the existing `addStock`/`deductStock` (`stock-service.ts`); the ledger UI and per-item drill-down both call `queryMovements()`. Two dialogs (`AdjustStockDialog`, `DisposeStockDialog`) hang off `StockTable` rows; a new `/inventory/ledger` route renders the global log.

**Tech Stack:** Next.js 15 (App Router, `'use client'`), TypeScript, Dexie (IndexedDB), next-intl, ShadCN via `@ultranos/ui-kit`, Vitest + `fake-indexeddb`, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-10-pharmacy-inventory-p0-workflows-design.md`

## Global Constraints

- **Reason codes are structured enums + optional free-text note.** Adjustment: `miscount | damage | theft | expiry_correction | system_error`. Disposal: `expired | damaged | contaminated | recalled | patient_return_unusable`.
- **`reasonCode` is additive and non-indexed** — no Dexie version bump for Track 1.
- **Every stock mutation enqueues a `SyncQueueEntry`** — this already happens inside `addStock`/`deductStock`; do not add a second enqueue.
- **All monetary values are integer minor units** (not relevant to Track 1 — no prices captured here).
- **UI import rule:** components import ShadCN from `@/components/ui/*` (app re-export proxies to `@ultranos/ui-kit`) and icons from `@ultranos/ui-kit/icons`. Follow `CatalogItemFormDialog.tsx`.
- **i18n:** all user-facing strings come from the `inventory` (or `sidebar`) namespace via `useTranslations`. Add every new key to all four catalogs: `messages/en.json`, `messages/ar.json`, `messages/prs.json`, `messages/ps.json`.
- **Layout standard:** the ledger page follows the OPD list-page standard — root `<div className="flex flex-col gap-4">`, standalone `<h1 className="text-2xl font-semibold text-foreground">`, one toolbar row, one content box (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`). No `mx-auto`/`max-w-*` on the page root.
- **No autonomous commits by the executor beyond the commit step each task defines.** Each commit is an explicit plan step.

---

### Task 1: Reason-code data model + thread reason through stock-service

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/inventory/types.ts` (after line 83)
- Modify: `apps/pharmacy-lite/src/lib/inventory/stock-service.ts:6-120`
- Test: `apps/pharmacy-lite/src/__tests__/stock-service-reason.test.ts` (create)

**Interfaces:**
- Produces:
  - `StockAdjustmentReason = 'miscount' | 'damage' | 'theft' | 'expiry_correction' | 'system_error'`
  - `StockDisposalReason = 'expired' | 'damaged' | 'contaminated' | 'recalled' | 'patient_return_unusable'`
  - `StockMovementReason = StockAdjustmentReason | StockDisposalReason`
  - `StockMovement.reasonCode?: StockMovementReason`
  - `StockMovementRefType` additionally includes `'adjustment' | 'disposal'`
  - `deductStock` / `addStock` params gain optional `reason?: string` and `reasonCode?: StockMovementReason`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/stock-service-reason.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { addStock, deductStock } from '@/lib/inventory/stock-service'
import type { StockBatch } from '@/lib/inventory/types'

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2030-01-01',
  quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  await db.stockBatches.clear()
  await db.stockMovements.clear()
  await db.stockBatches.put({ ...BATCH })
})

describe('stock-service reason threading', () => {
  it('deductStock persists reasonCode + reason note on the movement', async () => {
    await deductStock({
      stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 3, type: 'adjusted',
      referenceType: 'adjustment', reason: 'shelf miscount', reasonCode: 'miscount',
      performedBy: 'user-1',
    })
    const moves = await db.stockMovements.where('stockBatchId').equals('batch-1').toArray()
    expect(moves).toHaveLength(1)
    expect(moves[0]!.reasonCode).toBe('miscount')
    expect(moves[0]!.reason).toBe('shelf miscount')
    expect(moves[0]!.referenceType).toBe('adjustment')
    expect(moves[0]!.quantity).toBe(-3)
  })

  it('addStock persists reasonCode on the movement', async () => {
    await addStock({
      stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 5, type: 'adjusted',
      referenceType: 'adjustment', reasonCode: 'system_error', performedBy: 'user-1',
    })
    const moves = await db.stockMovements.where('stockBatchId').equals('batch-1').toArray()
    expect(moves[0]!.reasonCode).toBe('system_error')
    expect(moves[0]!.quantity).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test stock-service-reason`
Expected: FAIL — TypeScript rejects `reason`/`reasonCode` params, or `reasonCode` is `undefined` on the stored movement.

- [ ] **Step 3: Extend the types**

In `apps/pharmacy-lite/src/lib/inventory/types.ts`, after the `StockMovementRefType` block (line 83), add the reason enums and extend the ref type. Replace lines 76-97 with:

```ts
export type StockMovementRefType =
  | 'dispense'
  | 'purchase_order'
  | 'transfer'
  | 'count'
  | 'goods_receipt'
  | 'void'
  | 'sales_order'
  | 'adjustment'
  | 'disposal'

export type StockAdjustmentReason =
  | 'miscount'
  | 'damage'
  | 'theft'
  | 'expiry_correction'
  | 'system_error'

export type StockDisposalReason =
  | 'expired'
  | 'damaged'
  | 'contaminated'
  | 'recalled'
  | 'patient_return_unusable'

export type StockMovementReason = StockAdjustmentReason | StockDisposalReason

export interface StockMovement {
  id: string
  stockBatchId: string
  catalogItemId: string
  type: StockMovementType
  quantity: number
  reason?: string
  reasonCode?: StockMovementReason
  referenceId?: string
  referenceType?: StockMovementRefType
  performedBy: string
  timestamp: string
  hlcTimestamp: string
}
```

- [ ] **Step 4: Thread reason/reasonCode through stock-service**

In `apps/pharmacy-lite/src/lib/inventory/stock-service.ts`:

Update the import on line 4:
```ts
import type { StockBatch, StockMovement, StockMovementType, StockMovementReason } from './types'
```

In `deductStock` — add two fields to the params object (after line 13) and destructure them (line 15):
```ts
export async function deductStock(params: {
  stockBatchId: string
  catalogItemId: string
  quantity: number
  type: StockMovementType
  reason?: string
  reasonCode?: StockMovementReason
  referenceId?: string
  referenceType?: StockMovement['referenceType']
  performedBy: string
}): Promise<StockBatch> {
  const { stockBatchId, catalogItemId, quantity, type, reason, reasonCode, referenceId, referenceType, performedBy } = params
```
Then in the `movement` object literal (lines 26-37) add `reason,` and `reasonCode,` after `type,`.

Apply the identical change to `addStock` (params at lines 66-74, destructure at line 75, movement literal at lines 80-91): add `reason?`, `reasonCode?` to the params type, add `reason, reasonCode` to the destructure, and add `reason,` `reasonCode,` to the movement literal.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test stock-service-reason`
Expected: PASS (both tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm -F pharmacy-lite typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/types.ts apps/pharmacy-lite/src/lib/inventory/stock-service.ts apps/pharmacy-lite/src/__tests__/stock-service-reason.test.ts
git commit -m "feat(pharmacy-lite): add structured reason codes to stock movements"
```

---

### Task 2: `stock-movement.ts` — recordAdjustment

**Files:**
- Create: `apps/pharmacy-lite/src/lib/inventory/stock-movement.ts`
- Test: `apps/pharmacy-lite/src/__tests__/stock-movement-adjustment.test.ts` (create)

**Interfaces:**
- Consumes: `addStock`, `deductStock` (Task 1); `StockAdjustmentReason` (Task 1).
- Produces:
  - `recordAdjustment(params: { stockBatchId: string; newQuantity: number; reasonCode: StockAdjustmentReason; note?: string; performedBy: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/stock-movement-adjustment.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { recordAdjustment } from '@/lib/inventory/stock-movement'
import type { StockBatch } from '@/lib/inventory/types'

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2030-01-01',
  quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  await db.stockBatches.clear()
  await db.stockMovements.clear()
  await db.syncQueue.clear()
  await db.stockBatches.put({ ...BATCH })
})

describe('recordAdjustment', () => {
  it('adjusts upward: sets on-hand and writes a positive adjusted movement', async () => {
    await recordAdjustment({ stockBatchId: 'batch-1', newQuantity: 14, reasonCode: 'system_error', performedBy: 'u1' })
    const b = await db.stockBatches.get('batch-1')
    expect(b!.quantityOnHand).toBe(14)
    const m = (await db.stockMovements.toArray())[0]!
    expect(m.type).toBe('adjusted')
    expect(m.referenceType).toBe('adjustment')
    expect(m.reasonCode).toBe('system_error')
    expect(m.quantity).toBe(4)
  })

  it('adjusts downward: writes a negative adjusted movement with note', async () => {
    await recordAdjustment({ stockBatchId: 'batch-1', newQuantity: 6, reasonCode: 'miscount', note: 'recount', performedBy: 'u1' })
    const b = await db.stockBatches.get('batch-1')
    expect(b!.quantityOnHand).toBe(6)
    const m = (await db.stockMovements.toArray())[0]!
    expect(m.quantity).toBe(-4)
    expect(m.reason).toBe('recount')
  })

  it('is a no-op when newQuantity equals current on-hand (no movement)', async () => {
    await recordAdjustment({ stockBatchId: 'batch-1', newQuantity: 10, reasonCode: 'miscount', performedBy: 'u1' })
    expect(await db.stockMovements.count()).toBe(0)
  })

  it('rejects a negative newQuantity', async () => {
    await expect(
      recordAdjustment({ stockBatchId: 'batch-1', newQuantity: -1, reasonCode: 'miscount', performedBy: 'u1' }),
    ).rejects.toThrow()
  })

  it('throws for an unknown batch', async () => {
    await expect(
      recordAdjustment({ stockBatchId: 'nope', newQuantity: 5, reasonCode: 'miscount', performedBy: 'u1' }),
    ).rejects.toThrow()
  })

  it('enqueues a sync entry for the movement', async () => {
    await recordAdjustment({ stockBatchId: 'batch-1', newQuantity: 12, reasonCode: 'system_error', performedBy: 'u1' })
    const entries = await db.syncQueue.where('resourceType').equals('StockMovement').toArray()
    expect(entries.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test stock-movement-adjustment`
Expected: FAIL — `recordAdjustment` is not defined.

- [ ] **Step 3: Write the module (recordAdjustment only)**

Create `apps/pharmacy-lite/src/lib/inventory/stock-movement.ts`:

```ts
import { db } from '@/lib/db'
import { addStock, deductStock } from './stock-service'
import type { StockAdjustmentReason, StockMovementType } from './types'

/**
 * Correct a batch's on-hand quantity to `newQuantity`, recording an
 * `adjusted` movement (refType `adjustment`) with a structured reason.
 * Reuses addStock/deductStock — no separate deduction logic, no extra sync enqueue.
 */
export async function recordAdjustment(params: {
  stockBatchId: string
  newQuantity: number
  reasonCode: StockAdjustmentReason
  note?: string
  performedBy: string
}): Promise<void> {
  const { stockBatchId, newQuantity, reasonCode, note, performedBy } = params
  if (newQuantity < 0) throw new Error('newQuantity must be >= 0')

  const batch = await db.stockBatches.get(stockBatchId)
  if (!batch) throw new Error(`StockBatch not found: ${stockBatchId}`)

  const delta = newQuantity - batch.quantityOnHand
  if (delta === 0) return

  const common = {
    stockBatchId,
    catalogItemId: batch.catalogItemId,
    type: 'adjusted' as StockMovementType,
    referenceType: 'adjustment' as const,
    reason: note,
    reasonCode,
    performedBy,
  }

  if (delta > 0) {
    await addStock({ ...common, quantity: delta })
  } else {
    await deductStock({ ...common, quantity: -delta })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test stock-movement-adjustment`
Expected: PASS (all six).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/stock-movement.ts apps/pharmacy-lite/src/__tests__/stock-movement-adjustment.test.ts
git commit -m "feat(pharmacy-lite): add recordAdjustment to stock-movement module"
```

---

### Task 3: `stock-movement.ts` — recordDisposal

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/inventory/stock-movement.ts`
- Test: `apps/pharmacy-lite/src/__tests__/stock-movement-disposal.test.ts` (create)

**Interfaces:**
- Consumes: `deductStock` (Task 1); `StockDisposalReason` (Task 1).
- Produces:
  - `recordDisposal(params: { stockBatchId: string; quantity: number; reasonCode: StockDisposalReason; note?: string; performedBy: string }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/stock-movement-disposal.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { recordDisposal } from '@/lib/inventory/stock-movement'
import type { StockBatch } from '@/lib/inventory/types'

function batch(overrides: Partial<StockBatch> = {}): StockBatch {
  return {
    id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2020-01-01',
    quantityOnHand: 8, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
    status: 'quarantined', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.stockBatches.clear()
  await db.stockMovements.clear()
  await db.syncQueue.clear()
})

describe('recordDisposal', () => {
  it('disposes a partial quantity from a quarantined batch', async () => {
    await db.stockBatches.put(batch())
    await recordDisposal({ stockBatchId: 'batch-1', quantity: 3, reasonCode: 'expired', performedBy: 'u1' })
    const b = await db.stockBatches.get('batch-1')
    expect(b!.quantityOnHand).toBe(5)
    const m = (await db.stockMovements.toArray())[0]!
    expect(m.type).toBe('disposed')
    expect(m.referenceType).toBe('disposal')
    expect(m.reasonCode).toBe('expired')
    expect(m.quantity).toBe(-3)
  })

  it('disposing the full quantity depletes the batch', async () => {
    await db.stockBatches.put(batch({ quantityOnHand: 4 }))
    await recordDisposal({ stockBatchId: 'batch-1', quantity: 4, reasonCode: 'damaged', performedBy: 'u1' })
    const b = await db.stockBatches.get('batch-1')
    expect(b!.quantityOnHand).toBe(0)
    expect(b!.status).toBe('depleted')
  })

  it('works on an active batch (damage/recall before expiry)', async () => {
    await db.stockBatches.put(batch({ status: 'active', expiryDate: '2030-01-01' }))
    await recordDisposal({ stockBatchId: 'batch-1', quantity: 2, reasonCode: 'recalled', performedBy: 'u1' })
    expect((await db.stockBatches.get('batch-1'))!.quantityOnHand).toBe(6)
  })

  it('rejects a non-positive quantity', async () => {
    await db.stockBatches.put(batch())
    await expect(
      recordDisposal({ stockBatchId: 'batch-1', quantity: 0, reasonCode: 'expired', performedBy: 'u1' }),
    ).rejects.toThrow()
  })

  it('rejects disposing more than on-hand', async () => {
    await db.stockBatches.put(batch({ quantityOnHand: 2 }))
    await expect(
      recordDisposal({ stockBatchId: 'batch-1', quantity: 5, reasonCode: 'expired', performedBy: 'u1' }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test stock-movement-disposal`
Expected: FAIL — `recordDisposal` is not defined.

- [ ] **Step 3: Add recordDisposal to the module**

Append to `apps/pharmacy-lite/src/lib/inventory/stock-movement.ts` (add `StockDisposalReason` to the type import):

```ts
/**
 * Remove `quantity` units from a batch as disposal/write-off, recording a
 * `disposed` movement (refType `disposal`). Operates on active AND quarantined
 * batches — disposal is how quarantined stock leaves the books. deductStock
 * already flips the batch to `depleted` at zero and enqueues sync.
 */
export async function recordDisposal(params: {
  stockBatchId: string
  quantity: number
  reasonCode: StockDisposalReason
  note?: string
  performedBy: string
}): Promise<void> {
  const { stockBatchId, quantity, reasonCode, note, performedBy } = params
  if (quantity <= 0) throw new Error('quantity must be > 0')

  const batch = await db.stockBatches.get(stockBatchId)
  if (!batch) throw new Error(`StockBatch not found: ${stockBatchId}`)

  await deductStock({
    stockBatchId,
    catalogItemId: batch.catalogItemId,
    quantity,
    type: 'disposed',
    referenceType: 'disposal',
    reason: note,
    reasonCode,
    performedBy,
  })
}
```

Update the import line at the top of the file to:
```ts
import type { StockAdjustmentReason, StockDisposalReason, StockMovementType } from './types'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test stock-movement-disposal`
Expected: PASS (all five).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/stock-movement.ts apps/pharmacy-lite/src/__tests__/stock-movement-disposal.test.ts
git commit -m "feat(pharmacy-lite): add recordDisposal to stock-movement module"
```

---

### Task 4: `stock-movement.ts` — queryMovements

**Files:**
- Modify: `apps/pharmacy-lite/src/lib/inventory/stock-movement.ts`
- Test: `apps/pharmacy-lite/src/__tests__/stock-movement-query.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface MovementQuery { catalogItemId?: string; stockBatchId?: string; type?: StockMovementType; from?: string; to?: string; limit?: number }`
  - `queryMovements(q?: MovementQuery): Promise<StockMovement[]>` — sorted newest-first.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/stock-movement-query.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { queryMovements } from '@/lib/inventory/stock-movement'
import type { StockMovement } from '@/lib/inventory/types'

function mv(id: string, o: Partial<StockMovement>): StockMovement {
  return {
    id, stockBatchId: 'b1', catalogItemId: 'cat-1', type: 'adjusted', quantity: 1,
    performedBy: 'u1', timestamp: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    ...o,
  }
}

beforeEach(async () => {
  await db.stockMovements.clear()
  await db.stockMovements.bulkPut([
    mv('m1', { catalogItemId: 'cat-1', type: 'received', timestamp: '2026-01-01T00:00:00.000Z' }),
    mv('m2', { catalogItemId: 'cat-1', type: 'disposed', timestamp: '2026-03-01T00:00:00.000Z' }),
    mv('m3', { catalogItemId: 'cat-2', type: 'adjusted', timestamp: '2026-02-01T00:00:00.000Z' }),
  ])
})

describe('queryMovements', () => {
  it('returns all movements newest-first when no filter', async () => {
    const r = await queryMovements()
    expect(r.map((m) => m.id)).toEqual(['m2', 'm3', 'm1'])
  })
  it('filters by catalogItemId', async () => {
    const r = await queryMovements({ catalogItemId: 'cat-1' })
    expect(r.map((m) => m.id)).toEqual(['m2', 'm1'])
  })
  it('filters by type', async () => {
    const r = await queryMovements({ type: 'disposed' })
    expect(r.map((m) => m.id)).toEqual(['m2'])
  })
  it('filters by date range (inclusive)', async () => {
    const r = await queryMovements({ from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T00:00:00.000Z' })
    expect(r.map((m) => m.id)).toEqual(['m3'])
  })
  it('applies limit after sorting', async () => {
    const r = await queryMovements({ limit: 1 })
    expect(r.map((m) => m.id)).toEqual(['m2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test stock-movement-query`
Expected: FAIL — `queryMovements` is not defined.

- [ ] **Step 3: Add queryMovements to the module**

Append to `apps/pharmacy-lite/src/lib/inventory/stock-movement.ts` (extend the type import to include `StockMovement`):

```ts
export interface MovementQuery {
  catalogItemId?: string
  stockBatchId?: string
  type?: StockMovementType
  from?: string // ISO instant, inclusive lower bound on timestamp
  to?: string   // ISO instant, inclusive upper bound on timestamp
  limit?: number
}

/** Read stock movements for the ledger + per-item history. Newest-first. */
export async function queryMovements(q: MovementQuery = {}): Promise<StockMovement[]> {
  let arr: StockMovement[]
  if (q.catalogItemId) {
    arr = await db.stockMovements.where('catalogItemId').equals(q.catalogItemId).toArray()
  } else if (q.stockBatchId) {
    arr = await db.stockMovements.where('stockBatchId').equals(q.stockBatchId).toArray()
  } else if (q.type) {
    arr = await db.stockMovements.where('type').equals(q.type).toArray()
  } else {
    arr = await db.stockMovements.toArray()
  }

  if (q.type) arr = arr.filter((m) => m.type === q.type)
  if (q.from) arr = arr.filter((m) => m.timestamp >= q.from!)
  if (q.to) arr = arr.filter((m) => m.timestamp <= q.to!)

  arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  if (q.limit != null) arr = arr.slice(0, q.limit)
  return arr
}
```

The final import line at the top of the module is:
```ts
import type { StockAdjustmentReason, StockDisposalReason, StockMovement, StockMovementType } from './types'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test stock-movement-query`
Expected: PASS (all five).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/src/lib/inventory/stock-movement.ts apps/pharmacy-lite/src/__tests__/stock-movement-query.test.ts
git commit -m "feat(pharmacy-lite): add queryMovements to stock-movement module"
```

---

### Task 5: i18n keys for adjustment, disposal, and ledger

**Files:**
- Modify: `apps/pharmacy-lite/messages/en.json`
- Modify: `apps/pharmacy-lite/messages/ar.json`
- Modify: `apps/pharmacy-lite/messages/prs.json`
- Modify: `apps/pharmacy-lite/messages/ps.json`

**Interfaces:**
- Produces: `inventory` namespace keys consumed by Tasks 6-8, and one `sidebar` key `ledger`.

This task has no automated test; verification is that the app compiles and the keys resolve (checked at the end of Task 8). Fold it into the same commit if you prefer, but keeping it separate keeps the string additions reviewable.

- [ ] **Step 1: Add keys to the `inventory` namespace in `messages/en.json`**

Add these keys inside the existing `"inventory": { ... }` object:

```json
"actionsCol": "Actions",
"adjust": "Adjust",
"dispose": "Dispose",
"viewHistory": "History",
"adjustTitle": "Adjust stock",
"adjustCurrentQty": "Current on-hand",
"adjustNewQty": "New counted quantity",
"adjustReason": "Reason",
"adjustNote": "Note (optional)",
"adjustControlledWarning": "This is a controlled substance. The adjustment is logged with your name and reason.",
"adjustConfirmLarge": "This changes on-hand by {delta}. Confirm the adjustment?",
"disposeTitle": "Dispose / write off",
"disposeQty": "Quantity to dispose",
"disposeReason": "Reason",
"disposeNote": "Note (optional)",
"reason_miscount": "Miscount",
"reason_damage": "Damage",
"reason_theft": "Theft / loss",
"reason_expiry_correction": "Expiry correction",
"reason_system_error": "System error",
"reason_expired": "Expired",
"reason_damaged": "Damaged",
"reason_contaminated": "Contaminated",
"reason_recalled": "Recalled",
"reason_patient_return_unusable": "Patient return (unusable)",
"selectReason": "Select a reason",
"ledgerTitle": "Stock ledger",
"ledgerSearchPlaceholder": "Search product or batch",
"ledgerTypeAll": "All movements",
"ledgerFrom": "From",
"ledgerTo": "To",
"ledgerTimeCol": "Date / time",
"ledgerTypeCol": "Type",
"ledgerReasonCol": "Reason",
"ledgerQtyCol": "Qty",
"ledgerByCol": "By",
"ledgerEmptyTitle": "No stock movements",
"ledgerEmptyDescription": "Adjustments, disposals, receipts and dispenses will appear here.",
"ledgerHistoryFor": "History — {name}",
"movement_received": "Received",
"movement_dispensed": "Dispensed",
"movement_adjusted": "Adjusted",
"movement_transferred_out": "Transferred out",
"movement_transferred_in": "Transferred in",
"movement_quarantined": "Quarantined",
"movement_disposed": "Disposed",
"movement_returned": "Returned",
"movement_void_reversal": "Void reversal",
"movement_sold": "Sold"
```

- [ ] **Step 2: Add the `ledger` key to the `sidebar` namespace in `messages/en.json`**

Inside the existing `"sidebar": { ... }` object add:
```json
"ledger": "Stock Ledger"
```

- [ ] **Step 3: Mirror the same keys into the RTL/Dari/Pashto catalogs**

Add the identical key set to `messages/ar.json`, `messages/prs.json`, and `messages/ps.json` with translated values. If a vetted translation is not available for a given string, use the English value as the interim value so the key resolves (do NOT leave any key absent — a missing key throws at render). Track un-translated strings for a follow-up localization pass.

- [ ] **Step 4: Verify JSON validity**

Run: `node -e "['en','ar','prs','ps'].forEach(l=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+l+'.json','utf8')))" && echo OK`
Expected: `OK` (no JSON parse errors).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "i18n(pharmacy-lite): add adjustment, disposal, and ledger strings"
```

---

### Task 6: AdjustStockDialog + wire into StockTable rows

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/AdjustStockDialog.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/AdjustStockDialog.test.tsx` (create)

**Interfaces:**
- Consumes: `recordAdjustment` (Task 2); reason i18n keys (Task 5).
- Produces:
  - `AdjustStockDialog` props: `{ open: boolean; onOpenChange: (o: boolean) => void; batch: StockBatch; catalogItem?: CatalogItem; performedBy: string; onSaved: () => void }`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/AdjustStockDialog.test.tsx`. It renders the dialog, submits a new quantity + reason, and asserts `recordAdjustment` is called with the right args. Mock the service:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { AdjustStockDialog } from '@/components/pharmacy/inventory/AdjustStockDialog'
import type { StockBatch } from '@/lib/inventory/types'

const recordAdjustment = vi.fn()
vi.mock('@/lib/inventory/stock-movement', () => ({
  recordAdjustment: (...a: unknown[]) => recordAdjustment(...a),
}))

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2030-01-01',
  quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AdjustStockDialog open onOpenChange={() => {}} batch={BATCH} performedBy="u1" onSaved={() => {}} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => recordAdjustment.mockReset())

describe('AdjustStockDialog', () => {
  it('submits a new quantity + reason to recordAdjustment', async () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('adjust-new-qty'), { target: { value: '7' } })
    fireEvent.change(screen.getByTestId('adjust-reason'), { target: { value: 'miscount' } })
    fireEvent.click(screen.getByTestId('adjust-submit'))
    await waitFor(() =>
      expect(recordAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ stockBatchId: 'batch-1', newQuantity: 7, reasonCode: 'miscount', performedBy: 'u1' }),
      ),
    )
  })

  it('blocks submit until a reason is chosen', async () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('adjust-new-qty'), { target: { value: '7' } })
    fireEvent.click(screen.getByTestId('adjust-submit'))
    await waitFor(() => expect(recordAdjustment).not.toHaveBeenCalled())
  })
})
```

> Note: the test drives the reason with a native `<select>` (`data-testid="adjust-reason"`). Use a native `<select>` element in the component (not the ShadCN `Select` popover) so the field is directly settable in jsdom and keyboard/RTL accessible; this matches the filter-select idiom in the layout standard.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test AdjustStockDialog`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the dialog**

Create `apps/pharmacy-lite/src/components/pharmacy/inventory/AdjustStockDialog.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { recordAdjustment } from '@/lib/inventory/stock-movement'
import type { CatalogItem, StockAdjustmentReason, StockBatch } from '@/lib/inventory/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const ADJUST_REASONS: StockAdjustmentReason[] = [
  'miscount', 'damage', 'theft', 'expiry_correction', 'system_error',
]

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  batch: StockBatch
  catalogItem?: CatalogItem
  performedBy: string
  onSaved: () => void
}

export function AdjustStockDialog({ open, onOpenChange, batch, catalogItem, performedBy, onSaved }: Props) {
  const t = useTranslations('inventory')
  const [newQty, setNewQty] = useState(String(batch.quantityOnHand))
  const [reason, setReason] = useState<StockAdjustmentReason | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNewQty(String(batch.quantityOnHand))
    setReason('')
    setNote('')
    setError(null)
  }, [open, batch.quantityOnHand])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const qty = parseInt(newQty, 10)
    if (Number.isNaN(qty) || qty < 0) { setError(t('adjustNewQty')); return }
    if (!reason) { setError(t('selectReason')); return }
    setSaving(true)
    try {
      await recordAdjustment({ stockBatchId: batch.id, newQuantity: qty, reasonCode: reason, note: note.trim() || undefined, performedBy })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adjustNewQty'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('adjustTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('adjustTitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="mb-3 rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
          )}
          {catalogItem?.controlledSchedule && (
            <div className="mb-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {t('adjustControlledWarning')}
            </div>
          )}
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>{t('adjustCurrentQty')}</Label>
              <div className="font-numeric text-sm text-muted-foreground">{batch.quantityOnHand}</div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="adjust-new-qty">{t('adjustNewQty')} <span className="text-destructive">*</span></Label>
              <Input id="adjust-new-qty" data-testid="adjust-new-qty" type="number" min={0}
                value={newQty} onChange={(e) => setNewQty(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="adjust-reason">{t('adjustReason')} <span className="text-destructive">*</span></Label>
              <select id="adjust-reason" data-testid="adjust-reason" value={reason}
                onChange={(e) => setReason(e.target.value as StockAdjustmentReason)}
                className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm">
                <option value="">{t('selectReason')}</option>
                {ADJUST_REASONS.map((r) => (
                  <option key={r} value={r}>{t(`reason_${r}`)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="adjust-note">{t('adjustNote')}</Label>
              <Input id="adjust-note" dir="auto" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button type="submit" data-testid="adjust-submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Wire an "Adjust" action into StockTable rows**

In `StockTable.tsx`:
1. Add imports: `useState` is already imported; add `import { AdjustStockDialog } from './AdjustStockDialog'` and `import { Button } from '@/components/ui/button'`.
2. Add state near the top of the component body (after line 35): `const [adjustRow, setAdjustRow] = useState<StockRow | null>(null)`.
3. Add an actions header cell after the status `<th>` (after line 131):
```tsx
<th className="px-4 py-3 text-end font-medium text-muted-foreground text-xs uppercase tracking-wide">
  {t('actionsCol')}
</th>
```
4. Add an actions cell as the last `<td>` in each row (after line 160):
```tsx
<td className="px-4 py-3 text-end">
  <Button variant="ghost" size="sm" onClick={() => setAdjustRow(r)}>{t('adjust')}</Button>
</td>
```
5. Before the closing `</div>` of the outer content box (before line 167), render the dialog:
```tsx
{adjustRow && (
  <AdjustStockDialog
    open={!!adjustRow}
    onOpenChange={(o) => { if (!o) setAdjustRow(null) }}
    batch={adjustRow.batch}
    catalogItem={adjustRow.catalogItem}
    performedBy="local"
    onSaved={() => { setAdjustRow(null); /* reload */ location.reload() }}
  />
)}
```
> The `location.reload()` is a deliberate minimal refresh to keep this task focused; Task 8's self-review notes a follow-up to lift `load()` into a re-callable function. If `StockTable` already exposes a reload, call that instead.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test AdjustStockDialog`
Expected: PASS (both).

- [ ] **Step 6: Typecheck**

Run: `pnpm -F pharmacy-lite typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/AdjustStockDialog.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx apps/pharmacy-lite/src/__tests__/AdjustStockDialog.test.tsx
git commit -m "feat(pharmacy-lite): stock adjustment dialog wired into stock table"
```

---

### Task 7: DisposeStockDialog + wire into StockTable rows

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/DisposeStockDialog.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx`
- Test: `apps/pharmacy-lite/src/__tests__/DisposeStockDialog.test.tsx` (create)

**Interfaces:**
- Consumes: `recordDisposal` (Task 3); reason i18n keys (Task 5).
- Produces:
  - `DisposeStockDialog` props: `{ open: boolean; onOpenChange: (o: boolean) => void; batch: StockBatch; performedBy: string; onSaved: () => void }`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/DisposeStockDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { DisposeStockDialog } from '@/components/pharmacy/inventory/DisposeStockDialog'
import type { StockBatch } from '@/lib/inventory/types'

const recordDisposal = vi.fn()
vi.mock('@/lib/inventory/stock-movement', () => ({
  recordDisposal: (...a: unknown[]) => recordDisposal(...a),
}))

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2020-01-01',
  quantityOnHand: 8, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'quarantined', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DisposeStockDialog open onOpenChange={() => {}} batch={BATCH} performedBy="u1" onSaved={() => {}} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => recordDisposal.mockReset())

describe('DisposeStockDialog', () => {
  it('defaults quantity to full batch and submits reason', async () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('dispose-reason'), { target: { value: 'expired' } })
    fireEvent.click(screen.getByTestId('dispose-submit'))
    await waitFor(() =>
      expect(recordDisposal).toHaveBeenCalledWith(
        expect.objectContaining({ stockBatchId: 'batch-1', quantity: 8, reasonCode: 'expired', performedBy: 'u1' }),
      ),
    )
  })

  it('rejects disposing more than on-hand', async () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('dispose-qty'), { target: { value: '99' } })
    fireEvent.change(screen.getByTestId('dispose-reason'), { target: { value: 'expired' } })
    fireEvent.click(screen.getByTestId('dispose-submit'))
    await waitFor(() => expect(recordDisposal).not.toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test DisposeStockDialog`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the dialog**

Create `apps/pharmacy-lite/src/components/pharmacy/inventory/DisposeStockDialog.tsx` (same structure as AdjustStockDialog; disposal reasons; quantity defaults to full batch, validated `1..quantityOnHand`):

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { recordDisposal } from '@/lib/inventory/stock-movement'
import type { StockBatch, StockDisposalReason } from '@/lib/inventory/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const DISPOSE_REASONS: StockDisposalReason[] = [
  'expired', 'damaged', 'contaminated', 'recalled', 'patient_return_unusable',
]

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  batch: StockBatch
  performedBy: string
  onSaved: () => void
}

export function DisposeStockDialog({ open, onOpenChange, batch, performedBy, onSaved }: Props) {
  const t = useTranslations('inventory')
  const [qty, setQty] = useState(String(batch.quantityOnHand))
  const [reason, setReason] = useState<StockDisposalReason | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQty(String(batch.quantityOnHand))
    setReason('')
    setNote('')
    setError(null)
  }, [open, batch.quantityOnHand])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const q = parseInt(qty, 10)
    if (Number.isNaN(q) || q <= 0 || q > batch.quantityOnHand) { setError(t('disposeQty')); return }
    if (!reason) { setError(t('selectReason')); return }
    setSaving(true)
    try {
      await recordDisposal({ stockBatchId: batch.id, quantity: q, reasonCode: reason, note: note.trim() || undefined, performedBy })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('disposeQty'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('disposeTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('disposeTitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="mb-3 rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
          )}
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="dispose-qty">{t('disposeQty')} <span className="text-destructive">*</span></Label>
              <Input id="dispose-qty" data-testid="dispose-qty" type="number" min={1} max={batch.quantityOnHand}
                value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dispose-reason">{t('disposeReason')} <span className="text-destructive">*</span></Label>
              <select id="dispose-reason" data-testid="dispose-reason" value={reason}
                onChange={(e) => setReason(e.target.value as StockDisposalReason)}
                className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm">
                <option value="">{t('selectReason')}</option>
                {DISPOSE_REASONS.map((r) => (
                  <option key={r} value={r}>{t(`reason_${r}`)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dispose-note">{t('disposeNote')}</Label>
              <Input id="dispose-note" dir="auto" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
            <Button type="submit" data-testid="dispose-submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Wire a "Dispose" action into StockTable rows**

In `StockTable.tsx`:
1. Add `import { DisposeStockDialog } from './DisposeStockDialog'`.
2. Add state: `const [disposeRow, setDisposeRow] = useState<StockRow | null>(null)`.
3. In the actions `<td>` (added in Task 6), add a second button — only for batches with stock:
```tsx
{r.batch.quantityOnHand > 0 && (
  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDisposeRow(r)}>
    {t('dispose')}
  </Button>
)}
```
4. Render the dialog next to the adjust dialog:
```tsx
{disposeRow && (
  <DisposeStockDialog
    open={!!disposeRow}
    onOpenChange={(o) => { if (!o) setDisposeRow(null) }}
    batch={disposeRow.batch}
    performedBy="local"
    onSaved={() => { setDisposeRow(null); location.reload() }}
  />
)}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test DisposeStockDialog`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/DisposeStockDialog.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx apps/pharmacy-lite/src/__tests__/DisposeStockDialog.test.tsx
git commit -m "feat(pharmacy-lite): stock disposal dialog wired into stock table"
```

---

### Task 8: Stock ledger page, route, per-item drill-down, and nav entry

**Files:**
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockLedgerPage.tsx`
- Create: `apps/pharmacy-lite/src/components/pharmacy/inventory/StockHistorySheet.tsx`
- Create: `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/ledger/page.tsx`
- Modify: `apps/pharmacy-lite/src/components/sidebar/nav-config.ts:64-77`
- Test: `apps/pharmacy-lite/src/__tests__/StockLedgerPage.test.tsx` (create)

**Interfaces:**
- Consumes: `queryMovements`, `MovementQuery` (Task 4); movement/reason i18n keys (Task 5).
- Produces:
  - `StockLedgerPage` — default-exported-free named component rendered by the route.
  - `StockHistorySheet` props: `{ catalogItemId: string; productName: string; open: boolean; onOpenChange: (o: boolean) => void }`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/StockLedgerPage.test.tsx`. Seed movements + catalog items in `db`, render, and assert rows appear and the type filter narrows them:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { StockLedgerPage } from '@/components/pharmacy/inventory/StockLedgerPage'
import type { StockMovement, CatalogItem } from '@/lib/inventory/types'

const ITEM: CatalogItem = {
  id: 'cat-1', name: 'Paracetamol', form: 'tablet', strength: '500', strengthUnit: 'mg',
  packSize: 20, category: 'analgesic', defaultSellingPrice: 500, reorderPoint: 10,
  isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z',
}
function mv(id: string, o: Partial<StockMovement>): StockMovement {
  return { id, stockBatchId: 'b1', catalogItemId: 'cat-1', type: 'adjusted', quantity: -2,
    performedBy: 'u1', timestamp: '2026-03-01T00:00:00.000Z', hlcTimestamp: '2026-03-01T00:00:00.000Z', ...o }
}

beforeEach(async () => {
  await db.stockMovements.clear(); await db.catalogItems.clear()
  await db.catalogItems.put(ITEM)
  await db.stockMovements.bulkPut([
    mv('m1', { type: 'disposed', reasonCode: 'expired' }),
    mv('m2', { type: 'received', quantity: 50, timestamp: '2026-02-01T00:00:00.000Z' }),
  ])
})

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}><StockLedgerPage /></NextIntlClientProvider>,
  )
}

describe('StockLedgerPage', () => {
  it('lists movements with product name resolved', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Paracetamol').length).toBeGreaterThan(0))
    expect(screen.getByText('Disposed')).toBeInTheDocument()
    expect(screen.getByText('Received')).toBeInTheDocument()
  })

  it('filters by movement type', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Received')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('ledger-type-filter'), { target: { value: 'disposed' } })
    await waitFor(() => expect(screen.queryByText('Received')).not.toBeInTheDocument())
    expect(screen.getByText('Disposed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F pharmacy-lite test StockLedgerPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the ledger page**

Create `apps/pharmacy-lite/src/components/pharmacy/inventory/StockLedgerPage.tsx`. Follow the OPD list-page standard exactly (root `flex flex-col gap-4`, standalone `<h1>`, one toolbar row, one content box). Resolve product names from `db.catalogItems`, render `queryMovements` results:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { FileSearch } from '@ultranos/ui-kit/icons'
import { db } from '@/lib/db'
import { queryMovements } from '@/lib/inventory/stock-movement'
import type { CatalogItem, StockMovement, StockMovementType } from '@/lib/inventory/types'

const MOVEMENT_TYPES: StockMovementType[] = [
  'received', 'dispensed', 'adjusted', 'transferred_out', 'transferred_in',
  'quarantined', 'disposed', 'returned', 'void_reversal', 'sold',
]

export function StockLedgerPage() {
  const t = useTranslations('inventory')
  const [moves, setMoves] = useState<StockMovement[]>([])
  const [items, setItems] = useState<Map<string, CatalogItem>>(new Map())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<StockMovementType | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    async function load() {
      const [m, cat] = await Promise.all([
        queryMovements({ type: typeFilter || undefined, from: from || undefined, to: to ? `${to}T23:59:59.999Z` : undefined, limit: 500 }),
        db.catalogItems.toArray(),
      ])
      setMoves(m)
      setItems(new Map(cat.map((c) => [c.id, c])))
    }
    load()
  }, [typeFilter, from, to])

  const filtered = useMemo(() => {
    if (!search.trim()) return moves
    const q = search.toLowerCase()
    return moves.filter((m) => (items.get(m.catalogItemId)?.name ?? '').toLowerCase().includes(q))
  }, [moves, search, items])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('ledgerTitle')}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ledgerSearchPlaceholder')}
          className="min-w-[200px] flex-1 rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
        />
        <select data-testid="ledger-type-filter" value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as StockMovementType | '')}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm">
          <option value="">{t('ledgerTypeAll')}</option>
          {MOVEMENT_TYPES.map((mt) => <option key={mt} value={mt}>{t(`movement_${mt}`)}</option>)}
        </select>
        <input type="date" aria-label={t('ledgerFrom')} value={from} onChange={(e) => setFrom(e.target.value)}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm" />
        <input type="date" aria-label={t('ledgerTo')} value={to} onChange={(e) => setTo(e.target.value)}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm" />
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={FileSearch} title={t('ledgerEmptyTitle')} description={t('ledgerEmptyDescription')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  {[t('ledgerTimeCol'), t('productCol'), t('batchCol'), t('ledgerTypeCol'), t('ledgerReasonCol'), t('ledgerQtyCol'), t('ledgerByCol')].map((h) => (
                    <th key={h} className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 text-muted-foreground font-numeric">{m.timestamp.slice(0, 16).replace('T', ' ')}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{items.get(m.catalogItemId)?.name ?? t('unknown')}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.stockBatchId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t(`movement_${m.type}`)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.reasonCode ? t(`reason_${m.reasonCode}`) : '—'}</td>
                    <td className={`px-4 py-3 font-numeric ${m.quantity < 0 ? 'text-destructive' : 'text-success'}`}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.performedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write the per-item history Sheet**

Create `apps/pharmacy-lite/src/components/pharmacy/inventory/StockHistorySheet.tsx` — a `Sheet` rendering the same rows filtered to one `catalogItemId` via `queryMovements({ catalogItemId })`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { queryMovements } from '@/lib/inventory/stock-movement'
import type { StockMovement } from '@/lib/inventory/types'

interface Props {
  catalogItemId: string
  productName: string
  open: boolean
  onOpenChange: (o: boolean) => void
}

export function StockHistorySheet({ catalogItemId, productName, open, onOpenChange }: Props) {
  const t = useTranslations('inventory')
  const [moves, setMoves] = useState<StockMovement[]>([])

  useEffect(() => {
    if (!open) return
    queryMovements({ catalogItemId, limit: 200 }).then(setMoves)
  }, [open, catalogItemId])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('ledgerHistoryFor', { name: productName })}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 divide-y divide-border">
          {moves.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2 text-sm">
              <div className="flex flex-col">
                <span className="text-foreground">{t(`movement_${m.type}`)}</span>
                <span className="text-xs text-muted-foreground font-numeric">{m.timestamp.slice(0, 16).replace('T', ' ')}</span>
              </div>
              <span className={`font-numeric ${m.quantity < 0 ? 'text-destructive' : 'text-success'}`}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 5: Create the route**

Create `apps/pharmacy-lite/src/app/[locale]/(app)/inventory/ledger/page.tsx`:

```tsx
'use client'

import { StockLedgerPage } from '@/components/pharmacy/inventory/StockLedgerPage'

export default function StockLedgerRoute() {
  return <StockLedgerPage />
}
```

- [ ] **Step 6: Add the sidebar nav entry**

In `apps/pharmacy-lite/src/components/sidebar/nav-config.ts`, add a sub-item to the Inventory group (after the `stockCount` entry, line 73):
```ts
      { titleKey: 'ledger',        url: '/inventory/ledger' },
```

- [ ] **Step 7: Wire the per-item history into StockTable**

In `StockTable.tsx`: add `import { StockHistorySheet } from './StockHistorySheet'`, add state `const [historyRow, setHistoryRow] = useState<StockRow | null>(null)`, add a `t('viewHistory')` ghost button in the actions `<td>`, and render:
```tsx
{historyRow && (
  <StockHistorySheet
    open={!!historyRow}
    onOpenChange={(o) => { if (!o) setHistoryRow(null) }}
    catalogItemId={historyRow.batch.catalogItemId}
    productName={historyRow.catalogItem?.name ?? ''}
  />
)}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm -F pharmacy-lite test StockLedgerPage`
Expected: PASS (both).

- [ ] **Step 9: Typecheck + full inventory test sweep**

Run: `pnpm -F pharmacy-lite typecheck`
Run: `pnpm -F pharmacy-lite test stock-movement stock-service-reason AdjustStockDialog DisposeStockDialog StockLedgerPage`
Expected: all pass, no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/StockLedgerPage.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/StockHistorySheet.tsx "apps/pharmacy-lite/src/app/[locale]/(app)/inventory/ledger/page.tsx" apps/pharmacy-lite/src/components/sidebar/nav-config.ts apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx apps/pharmacy-lite/src/__tests__/StockLedgerPage.test.tsx
git commit -m "feat(pharmacy-lite): stock ledger page, per-item history sheet, and nav entry"
```

---

### Task 9: Verify WastageCard reflects disposals (integration)

**Files:**
- Read: `apps/pharmacy-lite/src/components/pharmacy/reports/WastageCard.tsx`
- Read: `apps/pharmacy-lite/src/lib/reports/wastage-report.ts` (the report query WastageCard consumes)
- Test: `apps/pharmacy-lite/src/__tests__/wastage-after-disposal.test.ts` (create)

**Interfaces:**
- Consumes: `recordDisposal` (Task 3), and the existing wastage-report query function.

- [ ] **Step 1: Read the wastage-report query to learn its exported function name and return shape**

Run: `sed -n '1,60p' apps/pharmacy-lite/src/lib/reports/wastage-report.ts`
Note the exported function (e.g. `getWastageReport`) and what it counts (`disposed` movements and/or `quarantined` batches).

- [ ] **Step 2: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/wastage-after-disposal.test.ts`. Seed a quarantined batch, call `recordDisposal`, then call the wastage-report function and assert the disposed quantity/count is reflected. Use the real exported name discovered in Step 1:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { recordDisposal } from '@/lib/inventory/stock-movement'
// import { getWastageReport } from '@/lib/reports/wastage-report' // ← use real name from Step 1
import type { StockBatch } from '@/lib/inventory/types'

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2020-01-01',
  quantityOnHand: 5, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'quarantined', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  await db.stockBatches.clear(); await db.stockMovements.clear()
  await db.stockBatches.put({ ...BATCH })
})

describe('wastage report after disposal', () => {
  it('counts disposed units as wastage', async () => {
    await recordDisposal({ stockBatchId: 'batch-1', quantity: 5, reasonCode: 'expired', performedBy: 'u1' })
    const disposed = await db.stockMovements.where('type').equals('disposed').toArray()
    expect(disposed).toHaveLength(1)
    expect(disposed[0]!.quantity).toBe(-5)
    // Replace the two lines above with an assertion on getWastageReport(...) per Step 1's signature.
  })
})
```

- [ ] **Step 3: Run the test**

Run: `pnpm -F pharmacy-lite test wastage-after-disposal`
Expected: PASS. If the wastage-report function does NOT surface `disposed` movements (only `quarantined` batches), that is a real gap — extend the report query to include `disposed` movement quantities, re-run, and note the change in the commit message.

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/__tests__/wastage-after-disposal.test.ts
git commit -m "test(pharmacy-lite): verify disposal flows into wastage report"
```

---

## Self-Review

**1. Spec coverage.**
- Spec "reasonCode additive field + refType extension" → Task 1. ✓
- Spec "single `stock-movement.ts` module (recordAdjustment / recordDisposal / queryMovements)" → Tasks 2, 3, 4. ✓
- Spec "AdjustStockDialog from StockTable rows; confirmation for controlled/large delta" → Task 6 (controlled warning banner; large-delta confirmation copy key `adjustConfirmLarge` is present in i18n — if a modal confirm step is desired beyond the inline banner, it is a small follow-up, noted here so it is not silently dropped). ✓ (partial: inline warning shipped; explicit large-delta confirm dialog deferred)
- Spec "DisposeStockDialog reachable from stock rows and the quarantined filter; makes WastageCard live" → Task 7 (row action, works on quarantined batches) + Task 9 (wastage verification). ✓
- Spec "Stock Ledger global log + per-item drill-down over shared query layer" → Task 8 (`StockLedgerPage` + `StockHistorySheet`, both call `queryMovements`). ✓
- Spec "Sidebar Ledger entry under Inventory" → Task 8 Step 6. ✓
- Spec testing: unit (Tasks 2-4), compliance/controlled (Task 6 controlled warning; adjustment records `performedBy` + `reasonCode` asserted in Task 2/coverage), integration wastage (Task 9), component (Tasks 6-8). ✓
  - **RTL snapshot gap:** the spec calls for LTR+RTL dialog snapshots. Tasks 6-7 test behavior but not RTL rendering. Add an RTL snapshot only if the repo has an established RTL snapshot harness (the CLAUDE.md references RTL CI snapshots); wire into the existing harness rather than inventing one. Flagged as a known partial.

**2. Placeholder scan.** No "TBD"/"handle edge cases"/"similar to Task N" — each task repeats its own code. Task 9 intentionally requires reading one real function name first (the report's export) rather than guessing it; that is a directed lookup, not a placeholder.

**3. Type consistency.** `recordAdjustment`/`recordDisposal`/`queryMovements` signatures are identical across the module definition (Tasks 2-4) and every consumer (Tasks 6-8). `reasonCode` / `reason` param names match `StockMovement` fields (Task 1). `StockAdjustmentReason`/`StockDisposalReason` enum members match the i18n `reason_*` keys (Task 5) one-to-one. `StockMovementType` members match the `movement_*` keys (Task 5) one-to-one.

**Known deferrals (not silent):** explicit large-delta confirm dialog (inline warning shipped instead); RTL snapshot tests (pending confirmation of the shared harness); the `location.reload()` refresh in `StockTable` wiring (a follow-up should lift `load()` into a re-callable ref). None block Track 1 function.
