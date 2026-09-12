# Procurement Phase 3b — PO Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert an opt-in, threshold-gated PO approval workflow (submit → approve/reject with segregation-of-duties) before a PO can be sent, audited via the Phase 3a helper.

**Architecture:** A new `pending_approval` PO status + attribution fields + a `poApprovalThreshold` setting (all additive — no Dexie bump). A pure `requiresApproval` decides when the gate applies. Three service functions (submit/approve/reject) enforce status guards and segregation-of-duties (approver ≠ creator) and emit additive `PO_*` audit verbs; `markPurchaseOrderSent` hard-blocks any approval-required PO. UI branches the PO-detail actions by status, adds a list pill, and a settings threshold field.

**Tech Stack:** Next.js 15 PWA, TypeScript, Dexie/IndexedDB, `@ultranos/audit-logger`, `@ultranos/shared-types`, next-intl (en/ar/prs/ps), ShadCN via `@ultranos/ui-kit`, Vitest + fake-indexeddb + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-procurement-phase3b-po-approval-design.md`

## Global Constraints

- **Segregation-of-duties (SoD) enforced in the SERVICE, not just the UI:** `approvePurchaseOrder`/`rejectPurchaseOrder` throw `SelfApprovalError` when the actor `=== po.createdBy`. The UI additionally disables the buttons, but the service is the source of truth.
- **The gate cannot be bypassed:** `markPurchaseOrderSent` throws `ApprovalRequiredError` for ANY PO where `requiresApproval(po.totalCost, threshold)` — an approval-required PO reaches `sent` ONLY via `approvePurchaseOrder`.
- **Threshold 0 = off (non-breaking):** `requiresApproval` returns false when `threshold <= 0`, so with the default the entire workflow is dormant and existing draft→sent flows are unchanged. Settings reads default defensively: `settings?.poApprovalThreshold ?? 0`.
- **Money = integer minor units;** `poApprovalThreshold` and `totalCost` are minor units.
- **No Dexie bump:** the new `pending_approval` value is queryable on the existing `status` index; the new PO/settings fields are additive (existing rows read them as `undefined`/defaulted). Do NOT add a `this.version(...)` block.
- **Additive enum edits:** append the 3 `AuditAction` verbs; never reorder/remove existing members. Rebuild after: `pnpm --filter @ultranos/shared-types build`.
- **Audit is fire-and-forget** via the 3a `auditProcurementEvent` (never throws); non-PHI metadata only (poNumber, totalCost, reason).
- **Design system (UI tasks):** semantic oklch tokens only (no hex/raw oklch), money `font-numeric`, RTL logical props (`ms-*`/`me-*`, `text-start`/`text-end`), ShadCN from `@/components/ui/*`, icons from `@ultranos/ui-kit/icons`, OPD layout standards.
- **i18n:** all strings across `messages/{en,ar,prs,ps}.json`; identical key sets; genuine Pashto.
- **Known baseline:** 6 pre-existing typecheck errors in unrelated test files — reviewers judge only NEW errors in touched files.

---

## File Structure

**Modify:** `packages/shared-types/src/enums.ts` (3 verbs); `src/lib/procurement/types.ts` (status + PO fields); `src/lib/inventory/types.ts` (setting + default); `src/lib/procurement/purchase-order-service.ts` (submit/approve/reject + guard + errors); `src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx`; `src/components/pharmacy/procurement/PurchaseOrdersPage.tsx`; `src/components/pharmacy/PharmacySettingsView.tsx`; `messages/{en,ar,prs,ps}.json`.
**Create:** `src/lib/procurement/po-approval.ts`; tests under `src/__tests__/`.

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
**Audit emit spy (when asserting audit):**
```ts
import { emitClientAudit } from '@ultranos/audit-logger/client'
vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit) // beforeEach: emitMock.mockClear()
```

---

## Task 1: PO approval enum verbs (shared-types)

**Files:**
- Modify: `packages/shared-types/src/enums.ts` (append to `AuditAction`)
- Test: `apps/pharmacy-lite/src/__tests__/po-approval-enums.test.ts`

**Interfaces:**
- Produces: `AuditAction.{PO_SUBMITTED_FOR_APPROVAL, PO_APPROVED, PO_REJECTED}`.

- [ ] **Step 1: Write the failing test**

Create `apps/pharmacy-lite/src/__tests__/po-approval-enums.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { AuditAction } from '@ultranos/shared-types'

describe('PO approval audit verbs', () => {
  it('defines the three approval action verbs', () => {
    expect(AuditAction.PO_SUBMITTED_FOR_APPROVAL).toBe('PO_SUBMITTED_FOR_APPROVAL')
    expect(AuditAction.PO_APPROVED).toBe('PO_APPROVED')
    expect(AuditAction.PO_REJECTED).toBe('PO_REJECTED')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run po-approval-enums`
Expected: FAIL — members undefined in stale `dist/`.

- [ ] **Step 3: Append the members**

In `packages/shared-types/src/enums.ts`, append to `AuditAction` (after the last member, before the closing `}`):
```ts
  // Procurement Phase 3b — PO approval workflow
  PO_SUBMITTED_FOR_APPROVAL = 'PO_SUBMITTED_FOR_APPROVAL',
  PO_APPROVED = 'PO_APPROVED',
  PO_REJECTED = 'PO_REJECTED',
```
Do NOT reorder/remove any existing member.

- [ ] **Step 4: Rebuild + run**

Run: `pnpm --filter @ultranos/shared-types build`
Then: `pnpm -F pharmacy-lite test run po-approval-enums`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared-types/src/enums.ts apps/pharmacy-lite/src/__tests__/po-approval-enums.test.ts
git commit -m "feat(shared-types): PO approval audit verbs"
```
(If `packages/shared-types/dist` is git-ignored — check `git status` — add only `enums.ts` + the test.)

---

## Task 2: Data model — status + attribution fields + threshold setting

**Files:**
- Modify: `src/lib/procurement/types.ts` (`PurchaseOrderStatus`, `PurchaseOrder`)
- Modify: `src/lib/inventory/types.ts` (`PharmacyInventorySettings`, `DEFAULT_PHARMACY_SETTINGS`)
- Test: `src/__tests__/po-approval-settings.test.ts`

**Interfaces:**
- Produces: `PurchaseOrderStatus` includes `'pending_approval'`; `PurchaseOrder` has optional `submittedBy?/submittedAt?/approvedBy?/approvedAt?/rejectedBy?/rejectedReason?/rejectedAt?`; `PharmacyInventorySettings.poApprovalThreshold: number` (default `0`).

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/po-approval-settings.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

describe('poApprovalThreshold setting', () => {
  it('defaults to 0 (approval off)', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.poApprovalThreshold).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run po-approval-settings`
Expected: FAIL — property does not exist / undefined.

- [ ] **Step 3: Edit the types**

In `src/lib/procurement/types.ts`, change `PurchaseOrderStatus`:
```ts
export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'sent'
  | 'partially_received'
  | 'closed'
  | 'cancelled'
```
In the `PurchaseOrder` interface, add before `createdBy`:
```ts
  /** Submitted for approval (Phase 3b). */
  submittedBy?: string
  submittedAt?: string
  /** Approval decision (Phase 3b). */
  approvedBy?: string
  approvedAt?: string
  /** Rejection decision (Phase 3b) — PO returns to draft. */
  rejectedBy?: string
  rejectedReason?: string
  rejectedAt?: string
```
In `src/lib/inventory/types.ts`, add `poApprovalThreshold: number` to `PharmacyInventorySettings` (after `invoiceMatchTolerancePercent`) and `poApprovalThreshold: 0,` to `DEFAULT_PHARMACY_SETTINGS` (after `invoiceMatchTolerancePercent: 0,`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run po-approval-settings`
Expected: PASS. `pnpm -F pharmacy-lite typecheck` — no NEW errors in touched files.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/types.ts apps/pharmacy-lite/src/lib/inventory/types.ts apps/pharmacy-lite/src/__tests__/po-approval-settings.test.ts
git commit -m "feat(pharmacy-lite): pending_approval status + PO approval fields + threshold setting"
```

---

## Task 3: Pure `requiresApproval` (`src/lib/procurement/po-approval.ts`)

**Files:**
- Create: `src/lib/procurement/po-approval.ts`
- Test: `src/__tests__/po-approval-logic.test.ts`

**Interfaces:**
- Produces: `requiresApproval(totalCost: number, threshold: number): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/po-approval-logic.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { requiresApproval } from '@/lib/procurement/po-approval'

describe('requiresApproval', () => {
  it('is off when threshold is 0 or negative', () => {
    expect(requiresApproval(100000, 0)).toBe(false)
    expect(requiresApproval(100000, -5)).toBe(false)
  })
  it('is false below the threshold, true at or above', () => {
    expect(requiresApproval(499, 500)).toBe(false)
    expect(requiresApproval(500, 500)).toBe(true)
    expect(requiresApproval(501, 500)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run po-approval-logic`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/procurement/po-approval.ts`:
```ts
/**
 * A PO requires approval only when a positive threshold is configured and the
 * PO total meets or exceeds it. threshold ≤ 0 → approval is off. Integer minor units.
 */
export function requiresApproval(totalCost: number, threshold: number): boolean {
  return threshold > 0 && totalCost >= threshold
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run po-approval-logic`
Expected: PASS (2 tests, 5 assertions).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/po-approval.ts apps/pharmacy-lite/src/__tests__/po-approval-logic.test.ts
git commit -m "feat(pharmacy-lite): pure requiresApproval threshold helper"
```

---

## Task 4: Approval service (submit/approve/reject + send guard)

**Files:**
- Modify: `src/lib/procurement/purchase-order-service.ts`
- Test: `src/__tests__/po-approval-service.test.ts`

**Interfaces:**
- Consumes: `db`, `enqueuePOUpdate` (existing, private in the file), `auditProcurementEvent`, `AuditAction`, `AuditResourceType` (already imported in the file); `requiresApproval` (Task 3); `PurchaseOrderStatus` (Task 2).
- Produces:
  - `class SelfApprovalError extends Error`
  - `class ApprovalRequiredError extends Error`
  - `submitPurchaseOrderForApproval(poId: string, submittedBy: string): Promise<void>`
  - `approvePurchaseOrder(poId: string, approvedBy: string): Promise<void>`
  - `rejectPurchaseOrder(poId: string, rejectedBy: string, reason: string): Promise<void>`
  - `markPurchaseOrderSent` now throws `ApprovalRequiredError` when the PO requires approval.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/po-approval-service.test.ts` (harness + emit-spy above):
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import {
  createPurchaseOrder, markPurchaseOrderSent,
  submitPurchaseOrderForApproval, approvePurchaseOrder, rejectPurchaseOrder,
  SelfApprovalError, ApprovalRequiredError,
} from '@/lib/procurement/purchase-order-service'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

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

// A PO with one line qty 10 × unitCost 100 = totalCost 1000 (taxRate 0).
async function draftPo(createdBy = 'u1') {
  return createPurchaseOrder({
    supplierId: 's1', supplierName: 'Acme',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }],
    createdBy,
  })
}
function lastEventFor(action: AuditAction) {
  return emitMock.mock.calls.map((c) => c[0]).reverse().find((i) => i.action === action)
}

describe('submitPurchaseOrderForApproval', () => {
  it('moves a draft to pending_approval with attribution + audit', async () => {
    const po = await draftPo()
    await submitPurchaseOrderForApproval(po.id, 'u1')
    const after = await db.purchaseOrders.get(po.id)
    expect(after?.status).toBe('pending_approval')
    expect(after?.submittedBy).toBe('u1')
    expect(after?.submittedAt).toBeDefined()
    expect(lastEventFor(AuditAction.PO_SUBMITTED_FOR_APPROVAL)?.resourceId).toBe(po.id)
  })
  it('rejects a non-draft', async () => {
    const po = await draftPo()
    await submitPurchaseOrderForApproval(po.id, 'u1')
    await expect(submitPurchaseOrderForApproval(po.id, 'u1')).rejects.toThrow()
  })
})

describe('approvePurchaseOrder', () => {
  it('approves (→ sent) when the approver differs from the creator', async () => {
    const po = await draftPo('u1')
    await submitPurchaseOrderForApproval(po.id, 'u1')
    await approvePurchaseOrder(po.id, 'u2')
    const after = await db.purchaseOrders.get(po.id)
    expect(after?.status).toBe('sent')
    expect(after?.approvedBy).toBe('u2')
    expect(after?.sentBy).toBe('u2')
    expect(after?.sentAt).toBeDefined()
    expect(lastEventFor(AuditAction.PO_APPROVED)?.resourceId).toBe(po.id)
  })
  it('throws SelfApprovalError when the creator approves their own PO', async () => {
    const po = await draftPo('u1')
    await submitPurchaseOrderForApproval(po.id, 'u1')
    await expect(approvePurchaseOrder(po.id, 'u1')).rejects.toBeInstanceOf(SelfApprovalError)
  })
  it('rejects a non-pending PO', async () => {
    const po = await draftPo('u1')
    await expect(approvePurchaseOrder(po.id, 'u2')).rejects.toThrow()
  })
})

describe('rejectPurchaseOrder', () => {
  it('returns the PO to draft with a reason + audit', async () => {
    const po = await draftPo('u1')
    await submitPurchaseOrderForApproval(po.id, 'u1')
    await rejectPurchaseOrder(po.id, 'u2', 'over budget')
    const after = await db.purchaseOrders.get(po.id)
    expect(after?.status).toBe('draft')
    expect(after?.rejectedBy).toBe('u2')
    expect(after?.rejectedReason).toBe('over budget')
    expect(lastEventFor(AuditAction.PO_REJECTED)?.resourceId).toBe(po.id)
  })
  it('throws SelfApprovalError when the creator rejects their own PO', async () => {
    const po = await draftPo('u1')
    await submitPurchaseOrderForApproval(po.id, 'u1')
    await expect(rejectPurchaseOrder(po.id, 'u1', 'x')).rejects.toBeInstanceOf(SelfApprovalError)
  })
})

describe('markPurchaseOrderSent gate', () => {
  it('throws ApprovalRequiredError when the PO total meets the threshold', async () => {
    await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS, poApprovalThreshold: 500 })
    const po = await draftPo('u1') // total 1000 ≥ 500
    await expect(markPurchaseOrderSent(po.id, 'u1')).rejects.toBeInstanceOf(ApprovalRequiredError)
    expect((await db.purchaseOrders.get(po.id))?.status).toBe('draft')
  })
  it('still sends when below the threshold', async () => {
    await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS, poApprovalThreshold: 5000 })
    const po = await draftPo('u1') // total 1000 < 5000
    await markPurchaseOrderSent(po.id, 'u1')
    expect((await db.purchaseOrders.get(po.id))?.status).toBe('sent')
  })
  it('still sends when approval is off (threshold 0)', async () => {
    const po = await draftPo('u1')
    await markPurchaseOrderSent(po.id, 'u1')
    expect((await db.purchaseOrders.get(po.id))?.status).toBe('sent')
  })
})
```
> `createPurchaseOrder` allocates a PO number from `pharmacySettings` (self-initializes if absent); the `markPurchaseOrderSent` tests seed a settings row explicitly to set the threshold.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run po-approval-service`
Expected: FAIL — the new functions/errors don't exist.

- [ ] **Step 3: Implement**

In `src/lib/procurement/purchase-order-service.ts`:
- add the import: `import { requiresApproval } from './po-approval'`.
- add the two error classes (near the top, after the imports):
```ts
export class SelfApprovalError extends Error {
  constructor() { super('You cannot approve or reject your own purchase order'); this.name = 'SelfApprovalError' }
}
export class ApprovalRequiredError extends Error {
  constructor() { super('This purchase order requires approval before it can be sent'); this.name = 'ApprovalRequiredError' }
}
```
- REPLACE `markPurchaseOrderSent` with the guarded version:
```ts
export async function markPurchaseOrderSent(poId: string, sentBy?: string): Promise<void> {
  const existing = await db.purchaseOrders.get(poId)
  const settings = await db.pharmacySettings.toCollection().first()
  if (existing && requiresApproval(existing.totalCost, settings?.poApprovalThreshold ?? 0)) {
    throw new ApprovalRequiredError()
  }
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'sent' as PurchaseOrderStatus, sentAt: now, sentBy, hlcTimestamp: now })
  await enqueuePOUpdate(poId, now)
  const po = await db.purchaseOrders.get(poId)
  auditProcurementEvent(sentBy ?? 'unknown', AuditAction.PO_SENT, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po?.poNumber, supplierId: po?.supplierId,
  })
}
```
- add the three functions (after `cancelPurchaseOrder`, before the private `enqueuePOUpdate`):
```ts
export async function submitPurchaseOrderForApproval(poId: string, submittedBy: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status !== 'draft') throw new Error('Only a draft can be submitted for approval')
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, { status: 'pending_approval' as PurchaseOrderStatus, submittedBy, submittedAt: now, hlcTimestamp: now })
  await enqueuePOUpdate(poId, now)
  auditProcurementEvent(submittedBy, AuditAction.PO_SUBMITTED_FOR_APPROVAL, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po.poNumber, totalCost: po.totalCost,
  })
}

export async function approvePurchaseOrder(poId: string, approvedBy: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status !== 'pending_approval') throw new Error('Only a pending purchase order can be approved')
  if (approvedBy === po.createdBy) throw new SelfApprovalError()
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, {
    status: 'sent' as PurchaseOrderStatus, approvedBy, approvedAt: now, sentBy: approvedBy, sentAt: now, hlcTimestamp: now,
  })
  await enqueuePOUpdate(poId, now)
  auditProcurementEvent(approvedBy, AuditAction.PO_APPROVED, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po.poNumber, totalCost: po.totalCost,
  })
}

export async function rejectPurchaseOrder(poId: string, rejectedBy: string, reason: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) throw new Error('Purchase order not found')
  if (po.status !== 'pending_approval') throw new Error('Only a pending purchase order can be rejected')
  if (rejectedBy === po.createdBy) throw new SelfApprovalError()
  const now = new Date().toISOString()
  await db.purchaseOrders.update(poId, {
    status: 'draft' as PurchaseOrderStatus, rejectedBy, rejectedReason: reason.trim() || undefined, rejectedAt: now, hlcTimestamp: now,
  })
  await enqueuePOUpdate(poId, now)
  auditProcurementEvent(rejectedBy, AuditAction.PO_REJECTED, AuditResourceType.PURCHASE_ORDER, poId, {
    poNumber: po.poNumber, reason: reason.trim() || undefined,
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run po-approval-service`
Expected: PASS (all cases). Re-run the existing PO suites (regression):
Run: `pnpm -F pharmacy-lite test run purchase-order procurement-audit-po-receipt`
Expected: all pass. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/lib/procurement/purchase-order-service.ts apps/pharmacy-lite/src/__tests__/po-approval-service.test.ts
git commit -m "feat(pharmacy-lite): PO submit/approve/reject with SoD + send guard"
```

---

## Task 5: i18n (4 locales)

**Files:**
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`

**Interfaces:**
- Produces: new keys in the existing `purchaseOrders` namespace + a `settings.poApprovalThresholdLabel` key. Tasks 6–7 consume these.

- [ ] **Step 1: Add the keys to `en.json`**

Add to the existing `"purchaseOrders"` namespace:
```json
"statusPendingApproval": "Pending approval",
"tabPendingApproval": "Pending approval",
"detailSubmitForApproval": "Submit for approval",
"detailSubmitProgress": "Submitting…",
"detailSubmitError": "Could not submit for approval.",
"detailApprove": "Approve",
"detailApproveProgress": "Approving…",
"detailApproveError": "Could not approve.",
"detailReject": "Reject",
"detailRejectProgress": "Rejecting…",
"detailRejectError": "Could not reject.",
"detailRejectReasonLabel": "Reason for rejection",
"detailRejectReasonRequired": "A reason is required to reject.",
"detailSelfApprovalBlocked": "You cannot approve your own purchase order.",
"detailApprovalRequired": "This purchase order needs approval before it can be sent.",
"detailSubmittedBy": "Submitted by {who}",
"detailApprovedBy": "Approved by {who}",
"detailRejectedBy": "Rejected by {who}",
"detailRejectedReason": "Rejection reason: {reason}"
```
Add to the existing `"settings"` namespace: `"poApprovalThresholdLabel": "PO approval threshold (minor units, 0 = off)"`.

- [ ] **Step 2: Mirror into `ar.json`, `prs.json`, `ps.json`**

Add the same key sets with accurate translations (ar Arabic, prs Dari, ps genuine Pashto — not Arabic-copied). Preserve `{who}` / `{reason}` placeholders verbatim. Identical key sets across all four.

- [ ] **Step 3: Verify parity + JSON validity**

Run:
```bash
node -e "const l=['en','ar','prs','ps'].map(x=>JSON.parse(require('fs').readFileSync('apps/pharmacy-lite/messages/'+x+'.json','utf8')));const keys=o=>Object.keys(o).sort().join(',');const chk=(ns)=>l.every(m=>keys(m[ns])===keys(l[0][ns]))||ns;console.log(['purchaseOrders','settings'].map(chk).filter(x=>x!==true).length?'PARITY FAIL':'PARITY OK')"
```
Expected: `PARITY OK`.

- [ ] **Step 4: Commit**
```bash
git add apps/pharmacy-lite/messages/en.json apps/pharmacy-lite/messages/ar.json apps/pharmacy-lite/messages/prs.json apps/pharmacy-lite/messages/ps.json
git commit -m "feat(pharmacy-lite): i18n for PO approval workflow (4 locales)"
```

---

## Task 6: PO detail page — approval actions

**Files:**
- Modify: `src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx`
- Test: `src/__tests__/PurchaseOrderDetailApproval.test.tsx` (new file; the existing detail-page test, if any, stays intact)

**Interfaces:**
- Consumes: `submitPurchaseOrderForApproval`, `approvePurchaseOrder`, `rejectPurchaseOrder`, `SelfApprovalError`, `ApprovalRequiredError` (Task 4); `requiresApproval` (Task 3); the `purchaseOrders` i18n keys (Task 5).

The page (READ IT FIRST) has: `statusBadgeClass(status)` + `statusKey(status)` switches (lines ~35–65), `performedBy = session?.practitionerId ?? session?.userId ?? 'unknown'`, a `load()` that reads `db.pharmacySettings.toCollection().first()` (currently only for currency), derived flags `isReceiptable`/`isCancellable`/`isInvoiceable` (~line 238), and a status-driven action block (~line 267) whose draft branch renders **Mark sent**.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/PurchaseOrderDetailApproval.test.tsx`. Mock next-intl (passthrough), next/navigation (`useParams`→{id:'po1'}), the auth store, the services, and `db` (settings). Assert: a `pending_approval` PO whose `createdBy !== performedBy` shows an Approve button that calls `approvePurchaseOrder`; a `draft` PO over threshold shows a **Submit for approval** button. Follow the existing detail-page test's mock structure. Example core:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: 'po1' }) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: Object.assign((sel: (s: unknown) => unknown) => sel({ session: { userId: 'approver', practitionerId: 'approver' } }), { getState: () => ({ session: { userId: 'approver', practitionerId: 'approver' } }) }) }))
const getPurchaseOrderById = vi.fn()
const approvePurchaseOrder = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/procurement/purchase-order-service', () => ({
  getPurchaseOrderById: () => getPurchaseOrderById(),
  markPurchaseOrderSent: vi.fn(), cancelPurchaseOrder: vi.fn(),
  submitPurchaseOrderForApproval: vi.fn().mockResolvedValue(undefined),
  approvePurchaseOrder: (...a: unknown[]) => approvePurchaseOrder(...a),
  rejectPurchaseOrder: vi.fn().mockResolvedValue(undefined),
  SelfApprovalError: class extends Error {}, ApprovalRequiredError: class extends Error {},
}))
vi.mock('@/lib/inventory/goods-receipt-reversal', () => ({ reverseGoodsReceipt: vi.fn(), ReceiptNotReversibleError: class extends Error {} }))
vi.mock('@/lib/db', () => ({ db: {
  pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2, poApprovalThreshold: 500 }) }) },
  goodsReceipts: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
} }))

beforeEach(() => { getPurchaseOrderById.mockReset(); approvePurchaseOrder.mockClear() })

const basePo = { id: 'po1', poNumber: 'PO-1', supplierId: 's1', supplierName: 'Acme', items: [], totalCost: 1000, createdBy: 'creator', createdAt: 'h', hlcTimestamp: 'h' }

describe('PO detail approval actions', () => {
  it('pending_approval + not creator → Approve calls the service', async () => {
    getPurchaseOrderById.mockResolvedValue({ ...basePo, status: 'pending_approval' })
    render(<PurchaseOrderDetailPage />)
    const btn = await screen.findByTestId('approve-po-btn')
    fireEvent.click(btn)
    await waitFor(() => expect(approvePurchaseOrder).toHaveBeenCalledWith('po1', 'approver'))
  })
  it('draft over threshold → shows Submit for approval', async () => {
    getPurchaseOrderById.mockResolvedValue({ ...basePo, status: 'draft' })
    render(<PurchaseOrderDetailPage />)
    expect(await screen.findByTestId('submit-approval-btn')).toBeInTheDocument()
  })
})
```
> Adapt the auth-store mock to the file's real `useAuthSessionStore` usage (it uses both the selector form and possibly `getState`). If the existing detail test already establishes a working mock shape, copy it.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run PurchaseOrderDetailApproval`
Expected: FAIL — the buttons/testids don't exist.

- [ ] **Step 3: Implement**

In `PurchaseOrderDetailPage.tsx`:
- **Status helpers:** add a `case 'pending_approval':` to `statusBadgeClass` returning `'inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning'`, and to `statusKey` returning `'statusPendingApproval'`.
- **State:** add `const [poApprovalThreshold, setPoApprovalThreshold] = useState(0)`, `const [submitting, setSubmitting] = useState(false)`, `const [approving, setApproving] = useState(false)`, `const [rejecting, setRejecting] = useState(false)`, `const [showRejectInput, setShowRejectInput] = useState(false)`, `const [rejectReason, setRejectReason] = useState('')`.
- **Load:** in the settings block of `load()`, also `setPoApprovalThreshold(settings.poApprovalThreshold ?? 0)`.
- **Import:** `import { requiresApproval } from '@/lib/procurement/po-approval'` and add `submitPurchaseOrderForApproval, approvePurchaseOrder, rejectPurchaseOrder, SelfApprovalError, ApprovalRequiredError` to the existing `purchase-order-service` import.
- **Derived (after the existing derived flags):** `const needsApproval = requiresApproval(po.totalCost, poApprovalThreshold)`; `const isSelf = performedBy === po.createdBy`. Add `'pending_approval'` to `isCancellable` (`po.status === 'draft' || po.status === 'pending_approval' || po.status === 'sent' || po.status === 'partially_received'`).
- **Handlers:** add `handleSubmitForApproval` (calls `submitPurchaseOrderForApproval(po.id, performedBy)`, sets `submitting`, on error `setActionError(t('detailSubmitError'))`, then `setLoading(true); await load()`), `handleApprove` (calls `approvePurchaseOrder(po.id, performedBy)`; catch: `if (err instanceof SelfApprovalError) setActionError(t('detailSelfApprovalBlocked')) else if (err instanceof ApprovalRequiredError) setActionError(t('detailApprovalRequired')) else setActionError(t('detailApproveError'))`), and `handleRejectConfirm` (guards `rejectReason.trim()` else `setActionError(t('detailRejectReasonRequired'))`; calls `rejectPurchaseOrder(po.id, performedBy, rejectReason)`; on `SelfApprovalError` → `t('detailSelfApprovalBlocked')`). All follow the existing `handleMarkSent`/`handleCancel` shape (setLoading + await load on success; console.error non-PHI on failure).
- **Action block:** replace the draft `{po.status === 'draft' && <Mark sent>}` with:
```tsx
{po.status === 'draft' && needsApproval && (
  <Button data-testid="submit-approval-btn" onClick={handleSubmitForApproval} disabled={submitting}>
    <Send size={16} className="me-2" />
    {submitting ? t('detailSubmitProgress') : t('detailSubmitForApproval')}
  </Button>
)}
{po.status === 'draft' && !needsApproval && (
  <Button data-testid="mark-sent-btn" onClick={handleMarkSent} disabled={sending}>
    <Send size={16} className="me-2" />
    {sending ? t('detailMarkSentProgress') : t('detailMarkSent')}
  </Button>
)}
{po.status === 'pending_approval' && (
  <>
    <Button data-testid="approve-po-btn" onClick={handleApprove} disabled={approving || isSelf}>
      {approving ? t('detailApproveProgress') : t('detailApprove')}
    </Button>
    <Button
      data-testid="reject-po-btn" variant="outline"
      className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
      onClick={() => setShowRejectInput(true)} disabled={rejecting || isSelf}
    >
      {t('detailReject')}
    </Button>
    {isSelf && <span className="text-xs text-muted-foreground">{t('detailSelfApprovalBlocked')}</span>}
  </>
)}
```
  Add `'pending_approval'` to the outer `{(po.status === 'draft' || isReceiptable || isCancellable || isInvoiceable) && (` guard if pending_approval isn't already covered by `isCancellable` (it now is, since you added it there).
- **Reject reason input** (below the action row, only when `showRejectInput`): a text input `data-testid="reject-reason-input"` bound to `rejectReason`, a confirm button `data-testid="reject-confirm-btn"` calling `handleRejectConfirm` (disabled while `rejecting` or empty), and a cancel/ghost button hiding the input — mirror the dispute-reason reveal in `SupplierInvoiceDetailPage.tsx`. Use `t('detailRejectReasonLabel')` as placeholder and `t('detailRejectReasonRequired')` for the empty-guard message.
- **Attribution:** wherever the details card shows `createdBy`/`sentBy`, also render, when present, `t('detailSubmittedBy', { who: po.submittedBy })`, `t('detailApprovedBy', { who: po.approvedBy })`, `t('detailRejectedBy', { who: po.rejectedBy })`, and `t('detailRejectedReason', { reason: po.rejectedReason })` (each guarded on the field being set), using the existing muted attribution styling.
- Design system: semantic tokens, `me-2`/`ms-*` logical props, no hardcoded hex.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run PurchaseOrderDetailApproval`
Expected: PASS. Re-run any existing detail-page test to confirm no regression. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrderDetailPage.tsx apps/pharmacy-lite/src/__tests__/PurchaseOrderDetailApproval.test.tsx
git commit -m "feat(pharmacy-lite): PO detail approval actions (submit/approve/reject + SoD)"
```

---

## Task 7: PO list pending pill + settings threshold field

**Files:**
- Modify: `src/components/pharmacy/procurement/PurchaseOrdersPage.tsx`
- Modify: `src/components/pharmacy/PharmacySettingsView.tsx`
- Test: `src/__tests__/po-approval-list-settings.test.tsx` (new)

**Interfaces:**
- Consumes: the `purchaseOrders` (`statusPendingApproval`/`tabPendingApproval`) + `settings` (`poApprovalThresholdLabel`) i18n keys (Task 5); `DEFAULT_PHARMACY_SETTINGS.poApprovalThreshold` (Task 2).

**A) PurchaseOrdersPage.tsx** (READ FIRST — `TABS` array ~line 15, `statusBadgeClass` switch ~line 35, `tabLabel`/`statusLabel` ~line 96):
- Add `'pending_approval'` to the `TABS` array, right after `'draft'`.
- Add a `case 'pending_approval':` to `statusBadgeClass` returning `'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'`.
- Add to `tabLabel`: `if (tab === 'pending_approval') return t('tabPendingApproval')`.
- Add to `statusLabel`: `if (status === 'pending_approval') return t('statusPendingApproval')`.
- (If `TabValue` is a named type rather than `'all' | PurchaseOrderStatus`, ensure `'pending_approval'` is a valid member — it will be once `PurchaseOrderStatus` includes it from Task 2.)

**B) PharmacySettingsView.tsx** (`ProcurementSettingsCard`, mirror the `invoiceMatchTolerancePercent` field ~lines 325–415):
- Add state: `const [poApprovalThreshold, setPoApprovalThreshold] = useState<number>(DEFAULT_PHARMACY_SETTINGS.poApprovalThreshold)`.
- In the load effect, add: `setPoApprovalThreshold(rows[0]?.poApprovalThreshold ?? DEFAULT_PHARMACY_SETTINGS.poApprovalThreshold)`.
- Add a blur handler mirroring `handleToleranceBlur`:
```ts
const handleApprovalThresholdBlur = useCallback(async (value: string) => {
  const rows = await db.pharmacySettings.toArray()
  const current = rows[0] ?? { ...DEFAULT_PHARMACY_SETTINGS }
  await db.pharmacySettings.put({ ...current, poApprovalThreshold: Number(value) || 0 })
}, [])
```
- Add the input field after the invoice-tolerance field (same markup):
```tsx
<div className="flex flex-col gap-1">
  <label htmlFor="setting-po-approval-threshold" className="text-xs font-medium text-muted-foreground">
    {t('poApprovalThresholdLabel')}
  </label>
  <input
    id="setting-po-approval-threshold"
    data-testid="setting-po-approval-threshold"
    type="number"
    value={poApprovalThreshold}
    disabled={loading}
    onChange={(e) => setPoApprovalThreshold(Number(e.target.value) || 0)}
    onBlur={(e) => { void handleApprovalThresholdBlur(e.target.value) }}
    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    min={0}
  />
</div>
```
The `{ ...current, poApprovalThreshold }` spread preserves `poSequenceNext` and all other settings.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/po-approval-list-settings.test.tsx`. Two lightweight render tests (mock next-intl passthrough + the data deps):
- `PurchaseOrdersPage` renders a `pending_approval` pill: mock `getPurchaseOrders` → `[]` and `db.pharmacySettings`; assert `screen.getByText('tabPendingApproval')` is present (the pill tab always renders).
- `ProcurementSettingsCard`/`PharmacySettingsView` renders `setting-po-approval-threshold`: mock `db.pharmacySettings.toArray` → `[{ ...settings, poApprovalThreshold: 0 }]`; assert `screen.findByTestId('setting-po-approval-threshold')`.
Follow the existing `PurchaseOrdersPage`/settings test mock patterns already in `src/__tests__/`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -F pharmacy-lite test run po-approval-list-settings`
Expected: FAIL — pill/field absent.

- [ ] **Step 3: Implement** the A) and B) edits above.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -F pharmacy-lite test run po-approval-list-settings`
Expected: PASS. Re-run existing list/settings suites for no regression. `pnpm -F pharmacy-lite typecheck` — no new errors.

- [ ] **Step 5: Commit**
```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/PurchaseOrdersPage.tsx apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx apps/pharmacy-lite/src/__tests__/po-approval-list-settings.test.tsx
git commit -m "feat(pharmacy-lite): PO list pending pill + approval-threshold setting"
```

---

## Final Verification (after all tasks)

- [ ] `pnpm -F pharmacy-lite test` — full suite green (new + regression). The pre-existing unrelated `SyncQueueDashboard.test.tsx` `DatabaseClosedError` teardown flake is not this work.
- [ ] `pnpm -F pharmacy-lite typecheck` — only the 6 known pre-existing unrelated-file errors; zero new in touched files.
- [ ] `pnpm --filter @ultranos/shared-types build` ran after the enum edit (Task 1).
- [ ] End-to-end sanity in one service test path: create (u1) → submit (u1) → approve by u1 throws SelfApprovalError → approve by u2 → sent; and markPurchaseOrderSent on an over-threshold PO throws ApprovalRequiredError.
- [ ] No PHI in any audit metadata or `console.*` added by this plan; RTL logical props only on touched UI.
