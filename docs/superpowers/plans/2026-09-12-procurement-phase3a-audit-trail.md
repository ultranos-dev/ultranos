# Procurement Phase 3a — Procurement Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a durable, Hub-synced, hash-chained audit event for every procurement state-change and surface a read-only Procurement Audit view — reusing the existing `clientAuditLog` pipeline.

**Architecture:** Add procurement `AuditResourceType`/`AuditAction` members to `@ultranos/shared-types` (additive). A new `auditProcurementEvent` helper wraps `emitClientAudit` (never-throws, PHI-guarded, per-resource hash-chained, queued to `clientAuditLog`, Hub-drained). Instrument the 10 procurement state-changes across the four services (fire-and-forget, after each write, non-PHI metadata). A `getProcurementAuditEvents` query + `ProcurementAuditPage` render the ledger filtered to procurement resource types.

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie/IndexedDB, `@ultranos/audit-logger`, `@ultranos/shared-types`, next-intl (en/ar/prs/ps), ShadCN via `@ultranos/ui-kit`, Vitest + fake-indexeddb + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-procurement-phase3a-audit-trail-design.md`

## Global Constraints

- **Fire-and-forget, non-blocking:** `auditProcurementEvent` calls `emitClientAudit` which NEVER throws; a procurement operation must succeed even if the audit emit rejects. Emit AFTER the write completes.
- **Non-PHI metadata only:** audit metadata carries opaque ids, reference numbers (poNumber/invoiceNumber), money (integer minor units), status, method, counts, and operational reason strings — NEVER patient data. `emitClientAudit` additionally strips known PHI field names at runtime.
- **Unified ledger:** emit through `emitClientAudit` → `clientAuditLog` (the same store `auditPhiAccess` uses). Do NOT create a new store; do NOT use `pendingAuditEvents`.
- **Distinct action verbs:** one `AuditAction` per event (no reuse of generic CREATE/UPDATE).
- **Enum edits are additive:** append new members to `AuditResourceType`/`AuditAction`; never reorder or remove existing members. After editing, rebuild: `pnpm --filter @ultranos/shared-types build` (pharmacy-lite resolves through `dist/`).
- **`actorRole` = `UserRole.PHARMACIST`** for all procurement events (RBAC is Phase 3b; matches `auditPhiAccess`). No `patientId`.
- **Design system (view task):** semantic oklch tokens only (no hex/raw oklch), RTL logical props (`ms-*`/`me-*`, `text-start`/`text-end`), ShadCN from `@/components/ui/*`, icons from `@ultranos/ui-kit/icons`, `EmptyState` for empty/loading, OPD list-page layout standard.
- **i18n:** all strings across `messages/{en,ar,prs,ps}.json`; identical key sets across locales; genuine translations (Pashto must be real Pashto).
- **Known baseline:** pharmacy-lite carries 6 pre-existing typecheck errors in unrelated test files (drug-catalog-trpc, krl-sync-worker, phi-cleanup, prescription-verify, sync-provider-pull) — reviewers judge only NEW errors in touched files.

---

## File Structure

**Modify:**
- `packages/shared-types/src/enums.ts` — additive procurement enum members.
- `src/lib/procurement/purchase-order-service.ts` — 3 emit call sites.
- `src/lib/inventory/goods-receipt-service.ts` — 1 emit call site (`processGoodsReceipt`).
- `src/lib/inventory/goods-receipt-reversal.ts` — 1 emit call site (`reverseGoodsReceipt`).
- `src/lib/procurement/supplier-invoice-service.ts` — 3 emit call sites.
- `src/lib/procurement/supplier-payment-service.ts` — 2 emit call sites.
- `src/components/sidebar/nav-config.ts` — "Audit" nav item.
- `messages/{en,ar,prs,ps}.json` — audit namespace + labels.

**Create:**
- `src/lib/procurement/audit.ts` — `auditProcurementEvent`, `getProcurementAuditEvents`, `PROCUREMENT_RESOURCE_TYPES`.
- `src/components/pharmacy/procurement/ProcurementAuditPage.tsx` — the view.
- `src/app/[locale]/(app)/inventory/audit/page.tsx` — route.
- Tests under `src/__tests__/`.

**Test harness for service/query tests (fake-indexeddb):**
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
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

**Spying on the audit emit (instrumentation tests):** mock the emitter module so the service's audit call is observable and the store/drain are not needed:
```ts
import { emitClientAudit } from '@ultranos/audit-logger/client'
vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit)
// beforeEach: emitMock.mockClear()
```

---

## Task 1: Procurement enum members (shared-types)

**Files:**
- Modify: `packages/shared-types/src/enums.ts` (append to `AuditResourceType` ~line 106, and `AuditAction` ~line 64)
- Test: `apps/pharmacy-lite/src/__tests__/procurement-audit-enums.test.ts`

**Interfaces:**
- Produces: `AuditResourceType.{PURCHASE_ORDER, SUPPLIER_INVOICE, SUPPLIER_PAYMENT, GOODS_RECEIPT}`; `AuditAction.{PO_CREATED, PO_SENT, PO_CANCELLED, GOODS_RECEIVED, GOODS_RECEIPT_REVERSED, SUPPLIER_INVOICE_CREATED, SUPPLIER_INVOICE_APPROVED, SUPPLIER_INVOICE_DISPUTED, SUPPLIER_PAYMENT_RECORDED, SUPPLIER_PAYMENT_VOIDED}`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/procurement-audit-enums.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'

describe('procurement audit enums', () => {
  it('defines the four procurement resource types', () => {
    expect(AuditResourceType.PURCHASE_ORDER).toBe('PURCHASE_ORDER')
    expect(AuditResourceType.SUPPLIER_INVOICE).toBe('SUPPLIER_INVOICE')
    expect(AuditResourceType.SUPPLIER_PAYMENT).toBe('SUPPLIER_PAYMENT')
    expect(AuditResourceType.GOODS_RECEIPT).toBe('GOODS_RECEIPT')
  })
  it('defines the ten procurement action verbs', () => {
    expect(AuditAction.PO_CREATED).toBe('PO_CREATED')
    expect(AuditAction.PO_SENT).toBe('PO_SENT')
    expect(AuditAction.PO_CANCELLED).toBe('PO_CANCELLED')
    expect(AuditAction.GOODS_RECEIVED).toBe('GOODS_RECEIVED')
    expect(AuditAction.GOODS_RECEIPT_REVERSED).toBe('GOODS_RECEIPT_REVERSED')
    expect(AuditAction.SUPPLIER_INVOICE_CREATED).toBe('SUPPLIER_INVOICE_CREATED')
    expect(AuditAction.SUPPLIER_INVOICE_APPROVED).toBe('SUPPLIER_INVOICE_APPROVED')
    expect(AuditAction.SUPPLIER_INVOICE_DISPUTED).toBe('SUPPLIER_INVOICE_DISPUTED')
    expect(AuditAction.SUPPLIER_PAYMENT_RECORDED).toBe('SUPPLIER_PAYMENT_RECORDED')
    expect(AuditAction.SUPPLIER_PAYMENT_VOIDED).toBe('SUPPLIER_PAYMENT_VOIDED')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run procurement-audit-enums`
Expected: FAIL — the new members are `undefined` (built `dist/` doesn't have them yet).

- [ ] **Step 3: Append the members to `enums.ts`**

In `packages/shared-types/src/enums.ts`, append to `AuditAction` (after the last member `DRUG_CATALOG_ENRICH`, before the closing `}`):
```ts
  // Procurement Phase 3a — procurement lifecycle audit events
  PO_CREATED = 'PO_CREATED',
  PO_SENT = 'PO_SENT',
  PO_CANCELLED = 'PO_CANCELLED',
  GOODS_RECEIVED = 'GOODS_RECEIVED',
  GOODS_RECEIPT_REVERSED = 'GOODS_RECEIPT_REVERSED',
  SUPPLIER_INVOICE_CREATED = 'SUPPLIER_INVOICE_CREATED',
  SUPPLIER_INVOICE_APPROVED = 'SUPPLIER_INVOICE_APPROVED',
  SUPPLIER_INVOICE_DISPUTED = 'SUPPLIER_INVOICE_DISPUTED',
  SUPPLIER_PAYMENT_RECORDED = 'SUPPLIER_PAYMENT_RECORDED',
  SUPPLIER_PAYMENT_VOIDED = 'SUPPLIER_PAYMENT_VOIDED',
```
Append to `AuditResourceType` (after the last member `DRUG_CATALOG`, before the closing `}`):
```ts
  // Procurement Phase 3a
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  SUPPLIER_INVOICE = 'SUPPLIER_INVOICE',
  SUPPLIER_PAYMENT = 'SUPPLIER_PAYMENT',
  GOODS_RECEIPT = 'GOODS_RECEIPT',
```
Do NOT reorder or remove any existing member.

- [ ] **Step 4: Rebuild shared-types + run the test**

Run: `pnpm --filter @ultranos/shared-types build`
Then: `pnpm -F pharmacy-lite test run procurement-audit-enums`
Expected: PASS (2 tests). If the test still fails, the `dist/` didn't refresh — re-run the build.

- [ ] **Step 5: Commit**
```bash
git add packages/shared-types/src/enums.ts packages/shared-types/dist apps/pharmacy-lite/src/__tests__/procurement-audit-enums.test.ts
git commit -m "feat(shared-types): procurement audit resource types + action verbs"
```
(If `packages/shared-types/dist` is git-ignored, omit it from the add — the CI/other apps rebuild from source; only `enums.ts` + the test are tracked. Check `git status` and add what is tracked.)

---

## Task 2: Audit helper + query (`src/lib/procurement/audit.ts`)

**Files:**
- Create: `apps/pharmacy-lite/src/lib/procurement/audit.ts`
- Test: `apps/pharmacy-lite/src/__tests__/procurement-audit-service.test.ts`

**Interfaces:**
- Consumes: `AuditAction`, `AuditResourceType`, `UserRole` (Task 1 / shared-types); `emitClientAudit`, `ClientAuditEvent` (`@ultranos/audit-logger/client`); `hlc`, `serializeHlc` (`@/lib/hlc`); `db.clientAuditLog`.
- Produces:
  - `PROCUREMENT_RESOURCE_TYPES: readonly AuditResourceType[]`
  - `auditProcurementEvent(actorId: string, action: AuditAction, resourceType: AuditResourceType, resourceId: string, metadata?: Record<string, unknown>): void`
  - `getProcurementAuditEvents(filter?: { resourceType?: AuditResourceType; action?: AuditAction; search?: string }): Promise<ClientAuditEvent[]>`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/procurement-audit-service.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { auditProcurementEvent, getProcurementAuditEvents } from '@/lib/procurement/audit'

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

describe('auditProcurementEvent', () => {
  it('emits a client audit event with the given fields + procurement domain', () => {
    auditProcurementEvent('u1', AuditAction.PO_CREATED, AuditResourceType.PURCHASE_ORDER, 'po1', { poNumber: 'PO-2026-0001' })
    expect(emitMock).toHaveBeenCalledTimes(1)
    const input = emitMock.mock.calls[0]![0]
    expect(input).toMatchObject({
      actorId: 'u1', actorRole: UserRole.PHARMACIST,
      action: AuditAction.PO_CREATED, resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: 'po1',
    })
    expect(input.metadata).toMatchObject({ poNumber: 'PO-2026-0001', source: 'pharmacy-lite', domain: 'procurement' })
    expect(input.patientId).toBeUndefined()
    expect(typeof input.hlcTimestamp).toBe('string')
  })
  it('falls back to "unknown" actor and never throws', () => {
    expect(() => auditProcurementEvent('', AuditAction.PO_SENT, AuditResourceType.PURCHASE_ORDER, 'po1')).not.toThrow()
    expect(emitMock.mock.calls[0]![0].actorId).toBe('unknown')
  })
})

describe('getProcurementAuditEvents', () => {
  async function seed() {
    const base = { actorId: 'u1', actorRole: UserRole.PHARMACIST, patientId: undefined, metadata: {}, queuedAt: '', status: 'synced' as const }
    await db.clientAuditLog.bulkAdd([
      { ...base, id: '1', action: AuditAction.PO_CREATED, resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: 'po1', hlcTimestamp: '2026-01-01T00:00:00.000Z', metadata: { poNumber: 'PO-1' } },
      { ...base, id: '2', action: AuditAction.SUPPLIER_PAYMENT_RECORDED, resourceType: AuditResourceType.SUPPLIER_PAYMENT, resourceId: 'pay1', hlcTimestamp: '2026-01-03T00:00:00.000Z', metadata: {} },
      { ...base, id: '3', action: AuditAction.PHI_READ ?? AuditAction.READ, resourceType: AuditResourceType.PRESCRIPTION, resourceId: 'rx1', hlcTimestamp: '2026-01-02T00:00:00.000Z', metadata: {} },
    ] as never)
  }
  it('returns only procurement resource types, newest first', async () => {
    await seed()
    const rows = await getProcurementAuditEvents()
    expect(rows.map((r) => r.id)).toEqual(['2', '1']) // rx1 excluded; newest hlcTimestamp first
  })
  it('filters by resourceType', async () => {
    await seed()
    const rows = await getProcurementAuditEvents({ resourceType: AuditResourceType.PURCHASE_ORDER })
    expect(rows.map((r) => r.id)).toEqual(['1'])
  })
  it('search matches resourceId or a reference in metadata', async () => {
    await seed()
    expect((await getProcurementAuditEvents({ search: 'PO-1' })).map((r) => r.id)).toEqual(['1'])
    expect((await getProcurementAuditEvents({ search: 'pay1' })).map((r) => r.id)).toEqual(['2'])
  })
})
```
> Note: if `AuditAction.PHI_READ` exists, use it for the excluded PHI row; the `?? AuditAction.READ` keeps the test robust. Both are non-procurement.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run procurement-audit-service`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `audit.ts`**

Create `apps/pharmacy-lite/src/lib/procurement/audit.ts`:
```ts
import { emitClientAudit, type ClientAuditEvent } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { hlc, serializeHlc } from '@/lib/hlc'
import { db } from '@/lib/db'

export const PROCUREMENT_RESOURCE_TYPES: readonly AuditResourceType[] = [
  AuditResourceType.PURCHASE_ORDER,
  AuditResourceType.SUPPLIER_INVOICE,
  AuditResourceType.SUPPLIER_PAYMENT,
  AuditResourceType.GOODS_RECEIPT,
]

/**
 * Emit a procurement audit event to the unified client audit ledger.
 * Never throws (fire-and-forget). Metadata must be non-PHI (ids, money, status,
 * reference numbers, operational reasons) — emitClientAudit strips known PHI
 * field names as a backstop.
 */
export function auditProcurementEvent(
  actorId: string,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string,
  metadata?: Record<string, unknown>,
): void {
  void emitClientAudit({
    actorId: actorId || 'unknown',
    actorRole: UserRole.PHARMACIST, // RBAC is Phase 3b
    action,
    resourceType,
    resourceId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: { ...metadata, source: 'pharmacy-lite', domain: 'procurement' },
  })
}

function referenceOf(e: ClientAuditEvent): string {
  const m = (e.metadata ?? {}) as Record<string, unknown>
  return String(m.poNumber ?? m.invoiceNumber ?? e.resourceId ?? '')
}

export async function getProcurementAuditEvents(filter?: {
  resourceType?: AuditResourceType
  action?: AuditAction
  search?: string
}): Promise<ClientAuditEvent[]> {
  const all = await db.clientAuditLog.toArray()
  const procurementSet = new Set<string>(PROCUREMENT_RESOURCE_TYPES as readonly string[])
  const q = filter?.search?.trim().toLowerCase()
  return all
    .filter((e) => procurementSet.has(e.resourceType))
    .filter((e) => !filter?.resourceType || e.resourceType === filter.resourceType)
    .filter((e) => !filter?.action || e.action === filter.action)
    .filter((e) => {
      if (!q) return true
      return e.resourceId.toLowerCase().includes(q) || referenceOf(e).toLowerCase().includes(q)
    })
    .sort((a, b) => (b.hlcTimestamp ?? '').localeCompare(a.hlcTimestamp ?? '') || (b.queuedAt ?? '').localeCompare(a.queuedAt ?? ''))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run procurement-audit-service`
Expected: PASS (5 tests). Then `pnpm -F pharmacy-lite typecheck` — no new errors in the touched file.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/audit.ts apps/pharmacy-lite/src/__tests__/procurement-audit-service.test.ts
git commit -m "feat(pharmacy-lite): procurement audit helper + query"
```

---

## Task 3: Instrument PO + goods-receipt + reversal (5 call sites)

**Files:**
- Modify: `src/lib/procurement/purchase-order-service.ts` (`createPurchaseOrder`, `markPurchaseOrderSent`, `cancelPurchaseOrder`)
- Modify: `src/lib/inventory/goods-receipt-service.ts` (`processGoodsReceipt`, at the end before `return receipt`)
- Modify: `src/lib/inventory/goods-receipt-reversal.ts` (`reverseGoodsReceipt`, at the end before returning the reversal receipt)
- Test: `src/__tests__/procurement-audit-po-receipt.test.ts`

**Interfaces:**
- Consumes: `auditProcurementEvent` (Task 2); `AuditAction`, `AuditResourceType` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/procurement-audit-po-receipt.test.ts` (harness + emit-spy from the File Structure block). Exercise each state-change and assert the emitted event. Use the real services; seed via their own create functions:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { createPurchaseOrder, markPurchaseOrderSent, cancelPurchaseOrder } from '@/lib/procurement/purchase-order-service'

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

function lastEventFor(action: AuditAction) {
  const call = emitMock.mock.calls.map((c) => c[0]).reverse().find((i) => i.action === action)
  return call
}

async function makePo() {
  return createPurchaseOrder({
    supplierId: 's1', supplierName: 'Acme',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }],
    createdBy: 'u1',
  })
}

describe('PO audit instrumentation', () => {
  it('createPurchaseOrder emits PO_CREATED with poNumber + actor', async () => {
    const po = await makePo()
    const e = lastEventFor(AuditAction.PO_CREATED)!
    expect(e).toMatchObject({ resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: po.id, actorId: 'u1' })
    expect(e.metadata).toMatchObject({ poNumber: po.poNumber, supplierId: 's1' })
  })
  it('markPurchaseOrderSent emits PO_SENT', async () => {
    const po = await makePo()
    await markPurchaseOrderSent(po.id, 'u2')
    const e = lastEventFor(AuditAction.PO_SENT)!
    expect(e).toMatchObject({ resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: po.id, actorId: 'u2' })
  })
  it('cancelPurchaseOrder emits PO_CANCELLED with reason', async () => {
    const po = await makePo()
    await cancelPurchaseOrder(po.id, 'u3', 'duplicate order')
    const e = lastEventFor(AuditAction.PO_CANCELLED)!
    expect(e).toMatchObject({ resourceId: po.id, actorId: 'u3' })
    expect(e.metadata).toMatchObject({ reason: 'duplicate order' })
  })
  it('the operation still succeeds if the audit emit rejects', async () => {
    emitMock.mockRejectedValueOnce(new Error('audit down'))
    await expect(makePo()).resolves.toBeDefined()
  })
})
```
> The receipt + reversal sites are harder to seed end-to-end; the PO cases above are the required assertions. If you can cheaply drive `processGoodsReceipt`/`reverseGoodsReceipt` in this file, add `GOODS_RECEIVED`/`GOODS_RECEIPT_REVERSED` assertions too; otherwise the instrumentation is still added (Step 3) and covered by the emit-spy pattern.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run procurement-audit-po-receipt`
Expected: FAIL — no audit events emitted yet.

- [ ] **Step 3: Add the emit calls**

In `purchase-order-service.ts`, add the import at top:
```ts
import { auditProcurementEvent } from './audit'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
```
In `createPurchaseOrder`, immediately before `return po` (after the sync enqueue):
```ts
  auditProcurementEvent(po.createdBy, AuditAction.PO_CREATED, AuditResourceType.PURCHASE_ORDER, po.id, {
    poNumber: po.poNumber, supplierId: po.supplierId, totalCost: po.totalCost, lineCount: items.length,
  })
```
In `markPurchaseOrderSent`, after `enqueuePOUpdate`, load the PO for its number and emit:
```ts
  const po = await db.purchaseOrders.get(poId)
  auditProcurementEvent(sentBy ?? 'unknown', AuditAction.PO_SENT, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po?.poNumber, supplierId: po?.supplierId,
  })
```
In `cancelPurchaseOrder`, after `enqueuePOUpdate`:
```ts
  const po = await db.purchaseOrders.get(poId)
  auditProcurementEvent(cancelledBy ?? 'unknown', AuditAction.PO_CANCELLED, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po?.poNumber, reason: reason?.trim() || undefined,
  })
```

In `goods-receipt-service.ts` `processGoodsReceipt`, add the import (`import { auditProcurementEvent } from '@/lib/procurement/audit'` + the enum import) and immediately before `return receipt` (or wherever the fully-built `receipt` is returned):
```ts
  auditProcurementEvent(receipt.receivedBy, AuditAction.GOODS_RECEIVED, AuditResourceType.GOODS_RECEIPT, receipt.id, {
    purchaseOrderId: receipt.purchaseOrderId, supplierId: receipt.supplierId, totalCost: receipt.totalCost, lineCount: receipt.items.length,
  })
```

In `goods-receipt-reversal.ts` `reverseGoodsReceipt`, add the imports and emit before returning the reversal receipt (the function returns the reversing `GoodsReceipt` — call the returned value `reversal`):
```ts
  auditProcurementEvent(performedBy, AuditAction.GOODS_RECEIPT_REVERSED, AuditResourceType.GOODS_RECEIPT, reversal.id, {
    reversalOf: receiptId, purchaseOrderId: reversal.purchaseOrderId,
  })
```
> Read the function to find the exact variable holding the reversing receipt (the object it returns) and use its `.id`/`.purchaseOrderId`. Emit AFTER the transaction commits, before `return`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run procurement-audit-po-receipt`
Expected: PASS. Then re-run the existing PO/receipt suites to confirm no regression:
Run: `pnpm -F pharmacy-lite test run purchase-order goods-receipt`
Expected: all pass. `pnpm -F pharmacy-lite typecheck` — no new errors in touched files.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts apps/pharmacy-lite/src/lib/inventory/goods-receipt-service.ts apps/pharmacy-lite/src/lib/inventory/goods-receipt-reversal.ts apps/pharmacy-lite/src/__tests__/procurement-audit-po-receipt.test.ts
git commit -m "feat(pharmacy-lite): audit PO lifecycle + goods receipt/reversal"
```

---

## Task 4: Instrument supplier invoice + payment (5 call sites)

**Files:**
- Modify: `src/lib/procurement/supplier-invoice-service.ts` (`createSupplierInvoice`, `approveSupplierInvoice`, `disputeSupplierInvoice`)
- Modify: `src/lib/procurement/supplier-payment-service.ts` (`recordSupplierPayment`, `voidSupplierPayment`)
- Test: `src/__tests__/procurement-audit-invoice-payment.test.ts`

**Interfaces:**
- Consumes: `auditProcurementEvent` (Task 2); `AuditAction`, `AuditResourceType` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/procurement-audit-invoice-payment.test.ts` (harness + emit-spy). Seed an approved invoice directly and exercise the services:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { recordSupplierPayment, voidSupplierPayment } from '@/lib/procurement/supplier-payment-service'
import type { SupplierInvoice } from '@/lib/procurement/types'

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
  await db.suppliers.put({ id: 's1', name: 'Acme', isActive: true, createdAt: 'h' })
})

function lastEventFor(action: AuditAction) {
  return emitMock.mock.calls.map((c) => c[0]).reverse().find((i) => i.action === action)
}
function approvedInvoice(over: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'i1', invoiceNumber: 'S1', purchaseOrderId: 'po1', supplierId: 's1', supplierName: 'Acme',
    items: [], subtotal: 1000, taxRate: 0, taxAmount: 0, freight: 0, total: 1000, status: 'approved',
    dueDate: '2026-01-10', amountPaid: 0, settlementStatus: 'unpaid',
    createdBy: 'u1', createdAt: 'h', hlcTimestamp: 'h', ...over,
  }
}

describe('supplier payment audit instrumentation', () => {
  it('recordSupplierPayment emits SUPPLIER_PAYMENT_RECORDED', async () => {
    await db.supplierInvoices.put(approvedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 1000 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    const e = lastEventFor(AuditAction.SUPPLIER_PAYMENT_RECORDED)!
    expect(e).toMatchObject({ resourceType: AuditResourceType.SUPPLIER_PAYMENT, resourceId: p.id, actorId: 'u1' })
    expect(e.metadata).toMatchObject({ supplierId: 's1', amount: 1000, method: 'cash' })
  })
  it('voidSupplierPayment emits SUPPLIER_PAYMENT_VOIDED with reason', async () => {
    await db.supplierInvoices.put(approvedInvoice())
    const p = await recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 500 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })
    await voidSupplierPayment(p.id, 'u2', 'wrong amount', 'h2')
    const e = lastEventFor(AuditAction.SUPPLIER_PAYMENT_VOIDED)!
    expect(e).toMatchObject({ resourceId: p.id, actorId: 'u2' })
    expect(e.metadata).toMatchObject({ reason: 'wrong amount' })
  })
  it('the payment still records if the audit emit rejects', async () => {
    await db.supplierInvoices.put(approvedInvoice())
    emitMock.mockRejectedValueOnce(new Error('audit down'))
    await expect(recordSupplierPayment({ supplierId: 's1', allocations: [{ supplierInvoiceId: 'i1', amount: 100 }], method: 'cash', paidBy: 'u1', hlcTimestamp: 'h' })).resolves.toBeDefined()
  })
})
```
> Invoice create/approve/dispute assertions may be added similarly if cheap to seed (createSupplierInvoice needs a PO). The two payment cases + the fire-and-forget case are the required assertions; the invoice emits are still added in Step 3.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run procurement-audit-invoice-payment`
Expected: FAIL — no events emitted.

- [ ] **Step 3: Add the emit calls**

In `supplier-invoice-service.ts` add imports (`import { auditProcurementEvent } from './audit'`, `import { AuditAction, AuditResourceType } from '@ultranos/shared-types'`) and:
- in `createSupplierInvoice`, before `return invoice`:
```ts
  auditProcurementEvent(invoice.createdBy, AuditAction.SUPPLIER_INVOICE_CREATED, AuditResourceType.SUPPLIER_INVOICE, invoice.id, {
    invoiceNumber: invoice.invoiceNumber, supplierId: invoice.supplierId, purchaseOrderId: invoice.purchaseOrderId, total: invoice.total,
  })
```
- in `approveSupplierInvoice`, after `enqueueInvoiceUpdate(invoiceId, now)` (the `inv` loaded earlier is in scope):
```ts
  auditProcurementEvent(approvedBy, AuditAction.SUPPLIER_INVOICE_APPROVED, AuditResourceType.SUPPLIER_INVOICE, invoiceId, {
    invoiceNumber: inv.invoiceNumber, overrideReason: overrideReason?.trim() || undefined,
  })
```
- in `disputeSupplierInvoice`, after `enqueueInvoiceUpdate(invoiceId, now)`:
```ts
  auditProcurementEvent(disputedBy, AuditAction.SUPPLIER_INVOICE_DISPUTED, AuditResourceType.SUPPLIER_INVOICE, invoiceId, {
    invoiceNumber: inv.invoiceNumber, reason: reason.trim() || undefined,
  })
```

In `supplier-payment-service.ts` add the imports and:
- in `recordSupplierPayment`, before `return payment` (after the sync enqueues):
```ts
  auditProcurementEvent(payment.paidBy, AuditAction.SUPPLIER_PAYMENT_RECORDED, AuditResourceType.SUPPLIER_PAYMENT, payment.id, {
    supplierId: payment.supplierId, amount: payment.amount, method: payment.method, allocationCount: payment.allocations.length,
  })
```
- in `voidSupplierPayment`, at the end (after the sync enqueues; `payment` is the pre-void record loaded at the top):
```ts
  auditProcurementEvent(voidedBy, AuditAction.SUPPLIER_PAYMENT_VOIDED, AuditResourceType.SUPPLIER_PAYMENT, paymentId, {
    supplierId: payment.supplierId, reason: reason.trim() || undefined,
  })
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run procurement-audit-invoice-payment`
Expected: PASS. Then confirm no regression:
Run: `pnpm -F pharmacy-lite test run supplier-invoice supplier-payment`
Expected: all pass. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/supplier-invoice-service.ts apps/pharmacy-lite/src/lib/procurement/supplier-payment-service.ts apps/pharmacy-lite/src/__tests__/procurement-audit-invoice-payment.test.ts
git commit -m "feat(pharmacy-lite): audit supplier invoice + payment lifecycle"
```

---

## Task 5: i18n (4 locales)

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: an `audit` namespace + `sidebar.audit`. The view (Task 6) consumes these.

- [ ] **Step 1: Add the keys to `en.json`**

Add a new top-level `"audit"` namespace (near `supplierPayments`):
```json
"audit": {
  "title": "Procurement audit",
  "loading": "Loading…",
  "empty": "No audit events",
  "emptyDescription": "Procurement actions (orders, receipts, invoices, payments) will appear here.",
  "searchPlaceholder": "Search reference or id…",
  "filterAllResources": "All resources",
  "filterAllActions": "All actions",
  "colWhen": "When",
  "colAction": "Action",
  "colResource": "Resource",
  "colReference": "Reference",
  "colActor": "Actor",
  "resourcePurchaseOrder": "Purchase order",
  "resourceSupplierInvoice": "Supplier invoice",
  "resourceSupplierPayment": "Supplier payment",
  "resourceGoodsReceipt": "Goods receipt",
  "actionPoCreated": "PO created",
  "actionPoSent": "PO sent",
  "actionPoCancelled": "PO cancelled",
  "actionGoodsReceived": "Goods received",
  "actionGoodsReceiptReversed": "Receipt reversed",
  "actionInvoiceCreated": "Invoice recorded",
  "actionInvoiceApproved": "Invoice approved",
  "actionInvoiceDisputed": "Invoice disputed",
  "actionPaymentRecorded": "Payment recorded",
  "actionPaymentVoided": "Payment voided"
},
```
Add `"audit": "Audit"` to the existing `"sidebar"` namespace.

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the same key sets with accurate translations for Arabic (ar), Dari (prs), Pashto (ps). Every key present in `en.json` above must exist in all three with identical key names. Pashto must be genuine Pashto (not Arabic/Dari copied).

- [ ] **Step 3: Verify parity + JSON validity**

Run:
```bash
node -e "const l=['en','ar','prs','ps'].map(x=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+x+'.json','utf8')));const keys=o=>Object.keys(o).sort().join(',');const chk=(ns)=>l.every(m=>keys(m[ns])===keys(l[0][ns]))||ns;console.log(['audit','sidebar'].map(chk).filter(x=>x!==true).length?'PARITY FAIL':'PARITY OK')"
```
Expected: `PARITY OK`.

- [ ] **Step 4: Commit**
```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): i18n for procurement audit view (4 locales)"
```

---

## Task 6: Procurement Audit view + route + nav

**Files:**
- Create: `src/components/pharmacy/procurement/ProcurementAuditPage.tsx`
- Create: `src/app/[locale]/(app)/inventory/audit/page.tsx`
- Modify: `src/components/sidebar/nav-config.ts` (add Audit item after `payables`)
- Test: `src/__tests__/ProcurementAuditPage.test.tsx`

**Interfaces:**
- Consumes: `getProcurementAuditEvents`, `PROCUREMENT_RESOURCE_TYPES` (Task 2); `AuditAction`, `AuditResourceType` (Task 1); the `audit` i18n namespace (Task 5).

- [ ] **Step 1: Add the nav item**

In `nav-config.ts`, add after the `{ titleKey: 'payables', url: '/inventory/payables' }` line:
```ts
      { titleKey: 'audit',         url: '/inventory/audit' },
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/ProcurementAuditPage.test.tsx`. Mock next-intl (passthrough), the query service, and settings db. Assert a seeded event renders (its reference + an action label) and the empty state shows when none:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { ProcurementAuditPage } from '@/components/pharmacy/procurement/ProcurementAuditPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const getProcurementAuditEvents = vi.fn()
vi.mock('@/lib/procurement/audit', async (orig) => ({
  ...(await orig<typeof import('@/lib/procurement/audit')>()),
  getProcurementAuditEvents: () => getProcurementAuditEvents(),
}))

beforeEach(() => getProcurementAuditEvents.mockReset())

describe('ProcurementAuditPage', () => {
  it('renders an audit row with its reference + action label', async () => {
    getProcurementAuditEvents.mockResolvedValue([
      { id: '1', actorId: 'u1', action: AuditAction.PO_CREATED, resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: 'po1', hlcTimestamp: '2026-01-01T00:00:00.000Z', metadata: { poNumber: 'PO-2026-0001' }, queuedAt: '', status: 'synced' },
    ])
    render(<ProcurementAuditPage />)
    expect(await screen.findByText('PO-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('actionPoCreated')).toBeInTheDocument()
  })
  it('shows the empty state when there are no events', async () => {
    getProcurementAuditEvents.mockResolvedValue([])
    render(<ProcurementAuditPage />)
    expect(await screen.findByText('empty')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run ProcurementAuditPage`
Expected: FAIL — component not found.

- [ ] **Step 4: Implement the page**

Create `src/components/pharmacy/procurement/ProcurementAuditPage.tsx`, `t = useTranslations('audit')`, OPD list-page standard:
- Page root `<div className="flex flex-col gap-4">`; standalone `<h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>`.
- Load into state via `getProcurementAuditEvents(filter)` in a `useCallback` + `useEffect`; keep `filter` state `{ resourceType?, action?, search }` and re-query on change (or query once and filter in memory — either is fine; prefer re-query so the service filter is exercised).
- Toolbar row (`flex flex-wrap items-center gap-3`): a resource-type `<select>` (`rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm`) with an "all" option (`t('filterAllResources')`) + one option per `PROCUREMENT_RESOURCE_TYPES` (label via a `resourceLabel(rt)` map to `t('resourcePurchaseOrder')` etc.) → an action `<select>` (`t('filterAllActions')` + the 10 verbs via an `actionLabel(a)` map) → a wide `SearchInput` (`className="min-w-[200px] flex-1"`, from `@ultranos/ui-kit/components/ui/search-input`).
- One content box (`overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50`) wrapping loading / empty / table. `EmptyState` (icon `ScrollText` from `@ultranos/ui-kit/icons`) inside for loading (`title={t('loading')}`) and empty (`title={t('empty')} description={t('emptyDescription')}`).
- Table: `<thead className="bg-muted">` with th = `px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide`; columns `colWhen` (`new Date(e.hlcTimestamp).toLocaleString()`), `colAction` (`t(actionLabel(e.action))`), `colResource` (`t(resourceLabel(e.resourceType))`), `colReference` (`e.metadata?.poNumber ?? e.metadata?.invoiceNumber ?? e.resourceId`), `colActor` (`e.actorId`). `<tbody className="divide-y divide-border">`, rows `hover:bg-muted/50`, `key={e.id}`. Read-only.
- Provide two small pure maps in the file: `actionLabel(a: AuditAction): string` (PO_CREATED→'actionPoCreated', … all 10) and `resourceLabel(rt: AuditResourceType): string` (PURCHASE_ORDER→'resourcePurchaseOrder', …). Unknown → the raw value (defensive).

- [ ] **Step 5: Create the route**

Create `src/app/[locale]/(app)/inventory/audit/page.tsx`:
```tsx
import { ProcurementAuditPage } from '@/components/pharmacy/procurement/ProcurementAuditPage'
export default function Page() {
  return <ProcurementAuditPage />
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run ProcurementAuditPage`
Expected: PASS (2 tests). `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 7: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/ProcurementAuditPage.tsx apps/pharmacy-lite/src/app/[locale]/\(app\)/inventory/audit/page.tsx apps/pharmacy-lite/src/components/sidebar/nav-config.ts apps/pharmacy-lite/src/__tests__/ProcurementAuditPage.test.tsx
git commit -m "feat(pharmacy-lite): procurement audit view + nav"
```

---

## Final Verification (after all tasks)

- [ ] `pnpm -F pharmacy-lite test` — full suite green (new + regression). The pre-existing unrelated `SyncQueueDashboard.test.tsx` `DatabaseClosedError` teardown flake is not this work.
- [ ] `pnpm -F pharmacy-lite typecheck` — only the 6 known pre-existing unrelated-file errors; zero new in touched files.
- [ ] `pnpm --filter @ultranos/shared-types build` ran after the enum edit (Task 1) so pharmacy-lite resolves the new members.
- [ ] Spot-check: every procurement audit metadata object contains only ids/reference/money/status/method/reason — no PHI.
- [ ] RTL: the audit view uses logical properties only (no `ml-*`/`mr-*`/`text-left`/`text-right`).
