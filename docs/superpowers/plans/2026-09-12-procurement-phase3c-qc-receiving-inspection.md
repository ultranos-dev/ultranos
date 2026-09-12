# Procurement Phase 3c — QC / Receiving Inspection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a receiver hold suspect lines at goods receipt (per line, with a reason) so they land quarantined (unsellable) instead of active, and provide a Quarantine view to release held batches back to active or reject them via the existing disposal path — every decision audited via the 3a helper.

**Architecture:** Reuse the existing `quarantined` batch status (already excluded from sale/valuation, already disposable, already in wastage reports). Add per-line QC decision fields; set batch status from the decision in `processGoodsReceipt`; add `releaseFromQuarantine` (mirrors the expiry-watchdog quarantine write in reverse) + a `getQuarantinedBatches` query; reject reuses the existing `recordDisposal`. Additive enum verbs; a receive-form QC control; a Quarantine view. No Dexie bump.

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie/IndexedDB, `@ultranos/audit-logger`, `@ultranos/shared-types`, next-intl (en/ar/prs/ps), ShadCN via `@ultranos/ui-kit`, Vitest + fake-indexeddb + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-procurement-phase3c-qc-receiving-inspection-design.md`

## Global Constraints

- **Reuse the `quarantined` status — no new batch status.** Held = `quarantined` (unsellable via the existing `active`-only stock/valuation filters). No change to those filters.
- **Reject = the EXISTING `recordDisposal`** (`stock-movement.ts`, `recordDisposal({ stockBatchId, quantity, reasonCode: StockDisposalReason, note?, performedBy })`) — no new reject primitive/code.
- **Held goods still count as received:** `applyReceiptToPO` and the `received` movement are UNCHANGED — a held line is quarantined, not absent.
- **Default = Accept (non-breaking):** `item.qcDecision ?? 'accept'`; a receipt that holds nothing behaves exactly as today. Legacy receipts/items with no `qcDecision` read as accept.
- **Additive enum edits:** append `STOCK_BATCH` + `BATCH_QC_HELD`/`BATCH_QC_RELEASED`; never reorder/remove. Rebuild: `pnpm --filter @ultranos/shared-types build`.
- **No Dexie bump:** embedded `GoodsReceiptItem` fields, optional `StockBatch` fields, and a new `StockMovementType` value on the existing `type` index are all additive.
- **Encrypt sync entries BEFORE the Dexie transaction** (Web Crypto cannot run inside a tx zone) — mirror the expiry-watchdog / processGoodsReceipt idiom.
- **Audit fire-and-forget** via `auditProcurementEvent` (3a, never throws) AFTER the write; non-PHI metadata (batchNumber, catalogItemId, heldReason).
- **Design system (UI):** semantic oklch tokens only (no hex/raw oklch), money `font-numeric`, RTL logical props (`ms-*`/`me-*`, `text-start`/`text-end`), ShadCN from `@/components/ui/*`, icons from `@ultranos/ui-kit/icons`, `EmptyState` for empty/loading, OPD layout standards.
- **i18n:** all strings across `messages/{en,ar,prs,ps}.json`; identical key sets; genuine Pashto.
- **Known baseline:** 6 pre-existing typecheck errors in unrelated test files — reviewers judge only NEW errors in touched files.

---

## File Structure

**Modify:** `packages/shared-types/src/enums.ts`; `src/lib/inventory/types.ts` (GoodsReceiptItem + StockBatch + StockMovementType); `src/lib/inventory/goods-receipt-service.ts` (QC in processGoodsReceipt); `src/components/pharmacy/inventory/ReceiveStockItemRow.tsx` (+ ReceiveLineItem type + QC control); `src/components/pharmacy/inventory/ReceiveStockForm.tsx` (thread QC); `src/components/sidebar/nav-config.ts`; `messages/{en,ar,prs,ps}.json`.
**Create:** `src/lib/inventory/qc-service.ts`; `src/components/pharmacy/inventory/QuarantinePage.tsx`; `src/app/[locale]/(app)/inventory/quarantine/page.tsx`; tests under `src/__tests__/`.

**Test harness (service tests):**
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})
```
**Audit emit spy:**
```ts
import { emitClientAudit } from '@ultranos/audit-logger/client'
vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit) // beforeEach: emitMock.mockClear()
```

---

## Task 1: QC enum entries (shared-types)

**Files:**
- Modify: `packages/shared-types/src/enums.ts`
- Test: `apps/pharmacy-lite/src/__tests__/qc-enums.test.ts`

**Interfaces:**
- Produces: `AuditResourceType.STOCK_BATCH`; `AuditAction.{BATCH_QC_HELD, BATCH_QC_RELEASED}`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/qc-enums.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'

describe('QC audit enums', () => {
  it('defines the STOCK_BATCH resource type', () => {
    expect(AuditResourceType.STOCK_BATCH).toBe('STOCK_BATCH')
  })
  it('defines the two QC action verbs', () => {
    expect(AuditAction.BATCH_QC_HELD).toBe('BATCH_QC_HELD')
    expect(AuditAction.BATCH_QC_RELEASED).toBe('BATCH_QC_RELEASED')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run qc-enums`
Expected: FAIL — members undefined in stale `dist/`.

- [ ] **Step 3: Append the members**

In `packages/shared-types/src/enums.ts`, append to `AuditResourceType` (after its last member, before `}`):
```ts
  // Procurement Phase 3c — QC / receiving inspection
  STOCK_BATCH = 'STOCK_BATCH',
```
Append to `AuditAction` (after its last member, before `}`):
```ts
  // Procurement Phase 3c — QC / receiving inspection
  BATCH_QC_HELD = 'BATCH_QC_HELD',
  BATCH_QC_RELEASED = 'BATCH_QC_RELEASED',
```
Do NOT reorder/remove any existing member.

- [ ] **Step 4: Rebuild + run**

Run: `pnpm --filter @ultranos/shared-types build`
Then: `pnpm -F pharmacy-lite test run qc-enums`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared-types/src/enums.ts apps/pharmacy-lite/src/__tests__/qc-enums.test.ts
git commit -m "feat(shared-types): QC stock-batch audit resource + verbs"
```
(If `packages/shared-types/dist` is git-ignored — check `git status` — add only `enums.ts` + the test.)

---

## Task 2: Data model (QC fields + released movement type)

**Files:**
- Modify: `src/lib/inventory/types.ts`

**Interfaces:**
- Produces: `GoodsReceiptItem` gains `qcDecision?: 'accept' | 'hold'` + `heldReason?: string`; `StockBatch` gains optional `inspectedBy?`/`inspectedAt?`/`heldReason?`/`releasedBy?`/`releasedAt?`; `StockMovementType` includes `'released'`.

> This is a type-declaration task — its deliverable is a clean typecheck; it is exercised by Tasks 3/4's tests. No standalone unit test.

- [ ] **Step 1: Edit the types**

In `src/lib/inventory/types.ts`:
- Add to `GoodsReceiptItem` (after `sellingPrice`):
```ts
  /** QC decision at receipt (Phase 3c). Absent → 'accept'. */
  qcDecision?: 'accept' | 'hold'
  /** Required when qcDecision === 'hold'. */
  heldReason?: string
```
- Add to `StockBatch` (after `status`):
```ts
  /** QC inspection attribution (Phase 3c). */
  inspectedBy?: string
  inspectedAt?: string
  heldReason?: string
  releasedBy?: string
  releasedAt?: string
```
- Add `'released'` to the `StockMovementType` union (after `'quarantined'`):
```ts
  | 'released'
```

- [ ] **Step 2: Verify**

Run: `pnpm -F pharmacy-lite typecheck`
Expected: no NEW errors in `types.ts` (6 KNOWN pre-existing unrelated-file errors — ignore).

- [ ] **Step 3: Commit**
```bash
git add apps/pharmacy-lite/src/lib/inventory/types.ts
git commit -m "feat(pharmacy-lite): QC fields on receipt item + stock batch + released movement type"
```

---

## Task 3: QC decision in `processGoodsReceipt`

**Files:**
- Modify: `src/lib/inventory/goods-receipt-service.ts`
- Test: `src/__tests__/qc-receipt.test.ts`

**Interfaces:**
- Consumes: Task 2 (`GoodsReceiptItem.qcDecision`/`heldReason`, `StockBatch` QC fields); Task 1 (`AuditAction.BATCH_QC_HELD`, `AuditResourceType.STOCK_BATCH`); existing in-file `auditProcurementEvent`, `AuditAction`, `AuditResourceType` imports.

The batch-build loop (~lines 58–91) currently pushes each batch with `status: 'active'`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/qc-receipt.test.ts` (harness + emit-spy above):
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { getStockAlerts } from '@/lib/inventory/stock-service'

vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit)

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  emitMock.mockClear()
})

const line = (over = {}) => ({
  catalogItemId: 'c1', batchNumber: 'B1', expiryDate: '2027-01-01', quantity: 10, costPrice: 100, sellingPrice: 150, ...over,
})

describe('processGoodsReceipt QC decision', () => {
  it('hold → quarantined batch with inspection attribution, excluded from stock, audited', async () => {
    await processGoodsReceipt({ items: [line({ qcDecision: 'hold', heldReason: 'damaged packaging' })], receivedBy: 'u1', locationId: 'loc1' })
    const batches = await db.stockBatches.toArray()
    expect(batches).toHaveLength(1)
    expect(batches[0]!.status).toBe('quarantined')
    expect(batches[0]!.inspectedBy).toBe('u1')
    expect(batches[0]!.heldReason).toBe('damaged packaging')
    const alerts = await getStockAlerts(90)
    expect(alerts.quarantinedCount).toBe(1)
    expect(emitMock.mock.calls.some((c) => c[0].action === AuditAction.BATCH_QC_HELD && c[0].resourceId === batches[0]!.id)).toBe(true)
  })
  it('accept (or absent) → active batch (non-breaking default)', async () => {
    await processGoodsReceipt({ items: [line()], receivedBy: 'u1', locationId: 'loc1' })
    const batches = await db.stockBatches.toArray()
    expect(batches[0]!.status).toBe('active')
    expect(emitMock.mock.calls.some((c) => c[0].action === AuditAction.BATCH_QC_HELD)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run qc-receipt`
Expected: FAIL — batch is `active` regardless; no BATCH_QC_HELD.

- [ ] **Step 3: Implement**

In `goods-receipt-service.ts`, in the batch-build loop, replace the fixed `status: 'active'` with the QC-derived status + attribution:
```ts
    const held = item.qcDecision === 'hold'
    batches.push({
      id: batchId,
      catalogItemId: item.catalogItemId,
      batchNumber: item.batchNumber,
      lotNumber: item.lotNumber,
      expiryDate: item.expiryDate,
      quantityOnHand: item.quantity,
      costPrice: item.costPrice,
      sellingPrice: item.sellingPrice,
      supplierId,
      goodsReceiptId: receiptId,
      receivedAt: now,
      status: held ? 'quarantined' : 'active',
      inspectedBy: receivedBy,
      inspectedAt: now,
      heldReason: held ? (item.heldReason?.trim() || undefined) : undefined,
      locationId,
      hlcTimestamp: now,
    })
```
After the `db.transaction(...)` block (before `return receipt`), emit a held audit per held line (batches[i] aligns 1:1 with items[i]):
```ts
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.qcDecision === 'hold') {
      auditProcurementEvent(receivedBy, AuditAction.BATCH_QC_HELD, AuditResourceType.STOCK_BATCH, batches[i]!.id, {
        batchNumber: batches[i]!.batchNumber, catalogItemId: batches[i]!.catalogItemId, heldReason: batches[i]!.heldReason,
      })
    }
  }
```
Do NOT change the `received` movement, the PO reconciliation (`applyReceiptToPO`), or the existing `GOODS_RECEIVED` audit.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run qc-receipt`
Expected: PASS. Re-run existing receipt suites for no regression:
Run: `pnpm -F pharmacy-lite test run goods-receipt procurement-audit-po-receipt`
Expected: all pass. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/inventory/goods-receipt-service.ts apps/pharmacy-lite/src/__tests__/qc-receipt.test.ts
git commit -m "feat(pharmacy-lite): per-line QC hold at goods receipt"
```

---

## Task 4: QC service — release + quarantined query

**Files:**
- Create: `src/lib/inventory/qc-service.ts`
- Test: `src/__tests__/qc-service.test.ts`

**Interfaces:**
- Consumes: `db`, `buildEncryptedSyncEntry`; `auditProcurementEvent`, `AuditAction.BATCH_QC_RELEASED`, `AuditResourceType.STOCK_BATCH`; `StockBatch`, `StockMovement` types (Task 2 gives `'released'`).
- Produces:
  - `class BatchNotQuarantinedError extends Error`
  - `releaseFromQuarantine(batchId: string, releasedBy: string): Promise<void>`
  - `getQuarantinedBatches(): Promise<StockBatch[]>`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/qc-service.test.ts` (harness + emit-spy):
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { releaseFromQuarantine, getQuarantinedBatches, BatchNotQuarantinedError } from '@/lib/inventory/qc-service'
import type { StockBatch } from '@/lib/inventory/types'

vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit)

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  emitMock.mockClear()
})

function batch(over: Partial<StockBatch> = {}): StockBatch {
  return {
    id: 'b1', catalogItemId: 'c1', batchNumber: 'B1', expiryDate: '2027-01-01', quantityOnHand: 10,
    costPrice: 100, sellingPrice: 150, receivedAt: '2026-01-01T00:00:00.000Z', status: 'quarantined',
    locationId: 'loc1', hlcTimestamp: 'h', ...over,
  }
}

describe('releaseFromQuarantine', () => {
  it('moves quarantined → active with attribution + a released movement + audit', async () => {
    await db.stockBatches.put(batch())
    await releaseFromQuarantine('b1', 'u2')
    const after = await db.stockBatches.get('b1')
    expect(after?.status).toBe('active')
    expect(after?.releasedBy).toBe('u2')
    expect(after?.releasedAt).toBeDefined()
    const movements = await db.stockMovements.where('stockBatchId').equals('b1').toArray()
    expect(movements.some((m) => m.type === 'released')).toBe(true)
    expect(emitMock.mock.calls.some((c) => c[0].action === AuditAction.BATCH_QC_RELEASED && c[0].resourceId === 'b1')).toBe(true)
  })
  it('throws BatchNotQuarantinedError on a non-quarantined batch', async () => {
    await db.stockBatches.put(batch({ status: 'active' }))
    await expect(releaseFromQuarantine('b1', 'u2')).rejects.toBeInstanceOf(BatchNotQuarantinedError)
  })
})

describe('getQuarantinedBatches', () => {
  it('returns only quarantined batches, newest received first', async () => {
    await db.stockBatches.bulkPut([
      batch({ id: 'a', status: 'quarantined', receivedAt: '2026-01-01T00:00:00.000Z' }),
      batch({ id: 'b', status: 'active', receivedAt: '2026-01-02T00:00:00.000Z' }),
      batch({ id: 'c', status: 'quarantined', receivedAt: '2026-01-03T00:00:00.000Z' }),
    ])
    const rows = await getQuarantinedBatches()
    expect(rows.map((r) => r.id)).toEqual(['c', 'a'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run qc-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/inventory/qc-service.ts` (mirrors `expiry-watchdog.ts`'s encrypt-before-tx idiom):
```ts
import { db } from '@/lib/db'
import { buildEncryptedSyncEntry } from '@/lib/dexie-sync-adapter'
import { auditProcurementEvent } from '@/lib/procurement/audit'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import type { StockBatch, StockMovement } from './types'

export class BatchNotQuarantinedError extends Error {
  constructor() {
    super('Only a quarantined batch can be released')
    this.name = 'BatchNotQuarantinedError'
  }
}

/** Release a quarantined batch back to active stock. Writes a 'released' movement
 *  and flips status to 'active'. Mirrors the expiry-watchdog quarantine write. */
export async function releaseFromQuarantine(batchId: string, releasedBy: string): Promise<void> {
  const batch = await db.stockBatches.get(batchId)
  if (!batch) throw new Error(`StockBatch not found: ${batchId}`)
  if (batch.status !== 'quarantined') throw new BatchNotQuarantinedError()

  const now = new Date().toISOString()
  const movement: StockMovement = {
    id: crypto.randomUUID(),
    stockBatchId: batchId,
    catalogItemId: batch.catalogItemId,
    type: 'released',
    quantity: batch.quantityOnHand,
    reason: 'Released from quarantine',
    performedBy: releasedBy,
    timestamp: now,
    hlcTimestamp: now,
  }

  // Encrypt sync entries BEFORE the tx (Web Crypto cannot run inside a Dexie tx zone).
  const movementSync = await buildEncryptedSyncEntry({
    resourceType: 'StockMovement', resourceId: movement.id, action: 'create',
    payload: movement as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
  const batchSync = await buildEncryptedSyncEntry({
    resourceType: 'StockBatch', resourceId: batchId, action: 'update',
    payload: { ...batch, status: 'active', releasedBy, releasedAt: now, hlcTimestamp: now } as unknown as Record<string, unknown>,
    hlcTimestamp: now, createdAt: now,
  })

  await db.transaction('rw', [db.stockBatches, db.stockMovements, db.syncQueue], async () => {
    await db.stockMovements.put(movement)
    await db.stockBatches.update(batchId, { status: 'active', releasedBy, releasedAt: now, hlcTimestamp: now })
    await db.syncQueue.put(movementSync)
    await db.syncQueue.put(batchSync)
  })

  auditProcurementEvent(releasedBy, AuditAction.BATCH_QC_RELEASED, AuditResourceType.STOCK_BATCH, batchId, {
    batchNumber: batch.batchNumber, catalogItemId: batch.catalogItemId,
  })
}

export async function getQuarantinedBatches(): Promise<StockBatch[]> {
  const batches = await db.stockBatches.where('status').equals('quarantined').toArray()
  return batches.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run qc-service`
Expected: PASS (3 tests). `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/inventory/qc-service.ts apps/pharmacy-lite/src/__tests__/qc-service.test.ts
git commit -m "feat(pharmacy-lite): releaseFromQuarantine + getQuarantinedBatches"
```

---

## Task 5: i18n (4 locales)

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: QC keys in the existing `inventory` namespace + `sidebar.quarantine`. Tasks 6–7 consume these.

- [ ] **Step 1: Add the keys to `en.json`**

Add to the existing `"inventory"` namespace:
```json
"qcDecisionLabel": "QC decision",
"qcAccept": "Accept",
"qcHold": "Hold (quarantine)",
"qcHeldReasonLabel": "Reason for hold",
"qcHeldReasonRequired": "A reason is required to hold a line.",
"quarantineTitle": "Quarantine",
"quarantineLoading": "Loading…",
"quarantineEmpty": "Nothing in quarantine",
"quarantineEmptyDescription": "Held or expired batches will appear here for release or disposal.",
"quarantineColItem": "Item",
"quarantineColBatch": "Batch #",
"quarantineColQty": "Qty",
"quarantineColExpiry": "Expiry",
"quarantineColReason": "Reason",
"quarantineColReceived": "Received",
"quarantineSourceHeld": "Held at receipt",
"quarantineSourceExpiry": "Expired",
"quarantineRelease": "Release",
"quarantineReleasing": "Releasing…",
"quarantineReleaseError": "Could not release the batch.",
"quarantineDispose": "Dispose",
"quarantineDisposing": "Disposing…",
"quarantineDisposeError": "Could not dispose the batch.",
"quarantineDisposeReasonLabel": "Disposal reason",
"disposalReasonDamaged": "Damaged",
"disposalReasonContaminated": "Contaminated",
"disposalReasonRecalled": "Recalled",
"quarantineConfirmDispose": "Confirm disposal"
```
Add to the existing `"sidebar"` namespace: `"quarantine": "Quarantine"`.

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the same key sets with accurate translations (ar Arabic, prs Dari, ps genuine Pashto — not Arabic-copied). Identical key sets across all four.

- [ ] **Step 3: Verify parity + JSON validity**

Run:
```bash
node -e "const l=['en','ar','prs','ps'].map(x=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+x+'.json','utf8')));const keys=o=>Object.keys(o).sort().join(',');const chk=(ns)=>l.every(m=>keys(m[ns])===keys(l[0][ns]))||ns;console.log(['inventory','sidebar'].map(chk).filter(x=>x!==true).length?'PARITY FAIL':'PARITY OK')"
```
Expected: `PARITY OK`.

- [ ] **Step 4: Commit**
```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): i18n for QC / quarantine (4 locales)"
```

---

## Task 6: Receive-form QC control

**Files:**
- Modify: `src/components/pharmacy/inventory/ReceiveStockItemRow.tsx` (`ReceiveLineItem` type + QC control)
- Modify: `src/components/pharmacy/inventory/ReceiveStockForm.tsx` (thread QC + validity + submit)
- Test: `src/__tests__/ReceiveStockQc.test.tsx` (new)

**Interfaces:**
- Consumes: Task 2 (`GoodsReceiptItem.qcDecision`/`heldReason`); Task 5 (`inventory` QC i18n keys). `t = useTranslations('inventory')` in both files.

**A) `ReceiveStockItemRow.tsx`:**
- Extend `ReceiveLineItem`:
```ts
  qcDecision?: 'accept' | 'hold'
  heldReason?: string
```
- Add a QC control to the fields grid (a `<select>` styled like the other inputs) bound to `item.qcDecision ?? 'accept'` → `onUpdate(index, { qcDecision: e.target.value as 'accept' | 'hold' })`, options `t('qcAccept')` / `t('qcHold')`, label `t('qcDecisionLabel')`, `data-testid={`qc-decision-${index}`}`. When `item.qcDecision === 'hold'`, render a required `heldReason` text input (`data-testid={`qc-held-reason-${index}`}`, label `t('qcHeldReasonLabel')`) bound to `item.heldReason` → `onUpdate(index, { heldReason: e.target.value })`, using the same input class string as the other row inputs. A held row is marked with a `text-warning` hint.

**B) `ReceiveStockForm.tsx`:**
- Default `qcDecision: 'accept'` on newly-created lines (in `handleAddItem` and the PO-prefill `lines.push`).
- Extend `isValid`: every line must additionally satisfy `(item.qcDecision !== 'hold' || !!item.heldReason?.trim())`.
- In `handleSubmit`, add to each mapped item: `qcDecision: item.qcDecision ?? 'accept'`, `heldReason: item.qcDecision === 'hold' ? (item.heldReason?.trim() || undefined) : undefined`.

DESIGN SYSTEM (binding): reuse the existing row input class strings (semantic tokens, no hex/oklch), RTL logical props, no bare `lucide-react`. Do NOT change the existing batch/expiry/qty/cost/sell/lot fields or the receipt submit flow beyond threading QC.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/ReceiveStockQc.test.tsx`. Render `ReceiveStockItemRow` (or the form with a seeded line) with a `hold` decision and assert the held-reason input appears; assert selecting Hold with no reason keeps the form invalid. Mock next-intl passthrough. Follow the existing ReceiveStock test patterns in `src/__tests__/` if present. Minimum assertions: `qc-decision-0` renders; switching it to `hold` reveals `qc-held-reason-0`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run ReceiveStockQc`
Expected: FAIL — control/testids absent.

- [ ] **Step 3: Implement** the A) + B) edits.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run ReceiveStockQc`
Expected: PASS. Re-run existing ReceiveStock tests for no regression. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockItemRow.tsx apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx apps/pharmacy-lite/src/__tests__/ReceiveStockQc.test.tsx
git commit -m "feat(pharmacy-lite): per-line QC accept/hold control on receive form"
```

---

## Task 7: Quarantine view + route + nav

**Files:**
- Create: `src/components/pharmacy/inventory/QuarantinePage.tsx`
- Create: `src/app/[locale]/(app)/inventory/quarantine/page.tsx`
- Modify: `src/components/sidebar/nav-config.ts` (add Quarantine item)
- Test: `src/__tests__/QuarantinePage.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`getQuarantinedBatches`, `releaseFromQuarantine`); existing `recordDisposal` from `@/lib/inventory/stock-movement`; the `inventory` QC i18n keys (Task 5).

- [ ] **Step 1: Add the nav item**

In `nav-config.ts`, add to the Inventory group (e.g. after `ledger`):
```ts
      { titleKey: 'quarantine',    url: '/inventory/quarantine' },
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/QuarantinePage.test.tsx`. Mock next-intl (passthrough), `getQuarantinedBatches` (→ one batch), `db` (catalogItems lookup + settings), `releaseFromQuarantine`, `recordDisposal`, auth store. Assert the batch renders (batch # + heldReason) and clicking Release calls `releaseFromQuarantine(batchId, ...)`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuarantinePage } from '@/components/pharmacy/inventory/QuarantinePage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const getQuarantinedBatches = vi.fn()
const releaseFromQuarantine = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/inventory/qc-service', () => ({
  getQuarantinedBatches: () => getQuarantinedBatches(),
  releaseFromQuarantine: (...a: unknown[]) => releaseFromQuarantine(...a),
  BatchNotQuarantinedError: class extends Error {},
}))
vi.mock('@/lib/inventory/stock-movement', () => ({ recordDisposal: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: Object.assign((sel: (s: unknown) => unknown) => sel({ session: { userId: 'u1', practitionerId: 'u1' } }), { getState: () => ({ session: { userId: 'u1', practitionerId: 'u1' } }) }) }))
vi.mock('@/lib/db', () => ({ db: {
  pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2 }) }) },
  catalogItems: { where: () => ({ anyOf: () => ({ toArray: async () => [{ id: 'c1', name: 'Amoxicillin' }] }) }) },
} }))

beforeEach(() => { getQuarantinedBatches.mockReset(); releaseFromQuarantine.mockClear() })

describe('QuarantinePage', () => {
  it('lists a quarantined batch and releases it', async () => {
    getQuarantinedBatches.mockResolvedValue([{ id: 'b1', catalogItemId: 'c1', batchNumber: 'B1', quantityOnHand: 10, expiryDate: '2027-01-01', heldReason: 'damaged', receivedAt: '2026-01-01T00:00:00.000Z', status: 'quarantined' }])
    render(<QuarantinePage />)
    expect(await screen.findByText('B1')).toBeInTheDocument()
    expect(screen.getByText('damaged')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('release-batch-b1'))
    await waitFor(() => expect(releaseFromQuarantine).toHaveBeenCalledWith('b1', 'u1'))
  })
  it('shows the empty state when nothing is quarantined', async () => {
    getQuarantinedBatches.mockResolvedValue([])
    render(<QuarantinePage />)
    expect(await screen.findByText('quarantineEmpty')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run QuarantinePage`
Expected: FAIL — component not found.

- [ ] **Step 4: Implement the page**

Create `src/components/pharmacy/inventory/QuarantinePage.tsx`, `t = useTranslations('inventory')`, OPD list-page standard (mirror `SupplierPayablesPage.tsx` structure):
- Load `getQuarantinedBatches()` + resolve catalog names (`db.catalogItems.where('id').anyOf(catalogIds).toArray()` → id→name map) + currency from settings, into state.
- `performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'` via `useAuthSessionStore`.
- Standalone `<h1>{t('quarantineTitle')}</h1>`; one content box (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`) with loading / empty (`EmptyState` icon e.g. `ShieldAlert`/`PackageX`, `title={t('quarantineEmpty')} description={t('quarantineEmptyDescription')}`) / table.
- Table columns: item (name), batch # (`data-cell`), qty, expiry, reason (`heldReason` if present else `t('quarantineSourceExpiry')`), received date, and an actions cell with **Release** (`data-testid={`release-batch-${b.id}`}` → `releaseFromQuarantine(b.id, performedBy)` then reload; catch `BatchNotQuarantinedError`/generic → an inline alert `t('quarantineReleaseError')`) and **Dispose** (`data-testid={`dispose-batch-${b.id}`}` → reveal a disposal-reason `<select>` [`disposalReasonDamaged`/`Contaminated`/`Recalled` → reasonCode `'damaged'`/`'contaminated'`/`'recalled'`] + a confirm → `recordDisposal({ stockBatchId: b.id, quantity: b.quantityOnHand, reasonCode, performedBy })` then reload).
- Design system: semantic tokens, `font-numeric` on qty, RTL logical props, ui-kit imports.

- [ ] **Step 5: Create the route**

Create `src/app/[locale]/(app)/inventory/quarantine/page.tsx`:
```tsx
import { QuarantinePage } from '@/components/pharmacy/inventory/QuarantinePage'
export default function Page() {
  return <QuarantinePage />
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run QuarantinePage`
Expected: PASS (2 tests). `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 7: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/QuarantinePage.tsx apps/pharmacy-lite/src/app/[locale]/\(app\)/inventory/quarantine/page.tsx apps/pharmacy-lite/src/components/sidebar/nav-config.ts apps/pharmacy-lite/src/__tests__/QuarantinePage.test.tsx
git commit -m "feat(pharmacy-lite): quarantine view — release + dispose + nav"
```

---

## Final Verification (after all tasks)

- [ ] `pnpm -F pharmacy-lite test` — full suite green (new + regression). Pre-existing unrelated errors (jsdom canvas-getContext; SyncQueueDashboard DatabaseClosedError teardown) are not this work.
- [ ] `pnpm -F pharmacy-lite typecheck` — only the 6 known pre-existing unrelated-file errors; zero new in touched files.
- [ ] `pnpm --filter @ultranos/shared-types build` ran after the enum edit (Task 1).
- [ ] End-to-end sanity: hold at receipt → quarantined (excluded from stock) → release → active (back in stock); and dispose a quarantined batch → depleted/off the quarantine list.
- [ ] No PHI in audit metadata or `console.*`; RTL logical props only on touched UI.
