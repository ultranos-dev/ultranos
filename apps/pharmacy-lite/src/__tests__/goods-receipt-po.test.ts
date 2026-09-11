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
