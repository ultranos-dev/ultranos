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
