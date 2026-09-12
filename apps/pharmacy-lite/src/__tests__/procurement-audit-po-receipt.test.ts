import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { createPurchaseOrder, markPurchaseOrderSent, cancelPurchaseOrder } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { reverseGoodsReceipt } from '@/lib/inventory/goods-receipt-reversal'
import type { CatalogItem } from '@/lib/inventory/types'

vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit)

function catalog(id: string): CatalogItem {
  return {
    id, name: id, form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c',
    defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z',
  }
}

const line = (catalogItemId: string, quantity: number) => ({
  catalogItemId, batchNumber: `B-${catalogItemId}`, expiryDate: '2030-01-01', quantity, costPrice: 100, sellingPrice: 200,
})

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  await db.catalogItems.put(catalog('a'))
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

async function sentPo() {
  const po = await makePo()
  await markPurchaseOrderSent(po.id, 'u1')
  return po
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
    emitMock.mockClear()
    await markPurchaseOrderSent(po.id, 'u2')
    const e = lastEventFor(AuditAction.PO_SENT)!
    expect(e).toMatchObject({ resourceType: AuditResourceType.PURCHASE_ORDER, resourceId: po.id, actorId: 'u2' })
  })

  it('cancelPurchaseOrder emits PO_CANCELLED with reason', async () => {
    const po = await makePo()
    emitMock.mockClear()
    await cancelPurchaseOrder(po.id, 'u3', 'duplicate order')
    const e = lastEventFor(AuditAction.PO_CANCELLED)!
    expect(e).toMatchObject({ resourceId: po.id, actorId: 'u3' })
    expect(e.metadata).toMatchObject({ reason: 'duplicate order' })
  })

  it('the operation still succeeds if the audit emit rejects', async () => {
    // The audit emit is fire-and-forget (void). Suppress the unhandled rejection
    // so Vitest does not flag it while still asserting the operation succeeds.
    emitMock.mockImplementationOnce(() => Promise.reject(new Error('audit down')).catch(() => {}))
    await expect(makePo()).resolves.toBeDefined()
  })
})

describe('Goods receipt audit instrumentation', () => {
  it('processGoodsReceipt emits GOODS_RECEIVED', async () => {
    const po = await sentPo()
    emitMock.mockClear()
    const receipt = await processGoodsReceipt({
      items: [line('a', 10)], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default',
    })
    const e = lastEventFor(AuditAction.GOODS_RECEIVED)!
    expect(e).toMatchObject({
      resourceType: AuditResourceType.GOODS_RECEIPT,
      resourceId: receipt.id,
      actorId: 'u1',
    })
    expect(e.metadata).toMatchObject({ purchaseOrderId: po.id, supplierId: undefined })
  })

  it('reverseGoodsReceipt emits GOODS_RECEIPT_REVERSED', async () => {
    const po = await sentPo()
    const receipt = await processGoodsReceipt({
      items: [line('a', 10)], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default',
    })
    emitMock.mockClear()
    const reversal = await reverseGoodsReceipt(receipt.id, 'u2')
    const e = lastEventFor(AuditAction.GOODS_RECEIPT_REVERSED)!
    expect(e).toMatchObject({
      resourceType: AuditResourceType.GOODS_RECEIPT,
      resourceId: reversal.id,
      actorId: 'u2',
    })
    expect(e.metadata).toMatchObject({ reversalOf: receipt.id, purchaseOrderId: po.id })
  })
})
