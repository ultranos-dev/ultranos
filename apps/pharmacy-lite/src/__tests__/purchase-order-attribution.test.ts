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
