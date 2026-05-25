import { db } from '@/lib/db'
import type { GoodsReceipt, GoodsReceiptItem, StockBatch, StockMovement } from './types'

export async function processGoodsReceipt(params: {
  items: GoodsReceiptItem[]
  supplierId?: string
  purchaseOrderId?: string
  receivedBy: string
  locationId: string
  notes?: string
}): Promise<GoodsReceipt> {
  const { items, supplierId, purchaseOrderId, receivedBy, locationId, notes } = params

  const now = new Date().toISOString()
  const receiptId = crypto.randomUUID()
  const totalCost = items.reduce((sum, item) => sum + item.costPrice * item.quantity, 0)

  const receipt: GoodsReceipt = {
    id: receiptId,
    supplierId,
    purchaseOrderId,
    receivedBy,
    items,
    totalCost,
    notes,
    receivedAt: now,
    hlcTimestamp: now,
  }

  await db.transaction('rw', [db.goodsReceipts, db.stockBatches, db.stockMovements, db.syncQueue], async () => {
    await db.goodsReceipts.put(receipt)

    for (const item of items) {
      const batchId = crypto.randomUUID()
      const movementId = crypto.randomUUID()

      const batch: StockBatch = {
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
        status: 'active',
        locationId,
        hlcTimestamp: now,
      }

      const movement: StockMovement = {
        id: movementId,
        stockBatchId: batchId,
        catalogItemId: item.catalogItemId,
        type: 'received',
        quantity: item.quantity,
        referenceId: receiptId,
        referenceType: 'goods_receipt',
        performedBy: receivedBy,
        timestamp: now,
        hlcTimestamp: now,
      }

      await db.stockBatches.put(batch)
      await db.stockMovements.put(movement)

      await db.syncQueue.put({
        id: crypto.randomUUID(),
        resourceType: 'StockMovement',
        resourceId: movementId,
        action: 'create',
        payload: JSON.stringify(movement),
        status: 'pending',
        hlcTimestamp: now,
        createdAt: now,
        retryCount: 0,
      })
    }

    await db.syncQueue.put({
      id: crypto.randomUUID(),
      resourceType: 'GoodsReceipt',
      resourceId: receiptId,
      action: 'create',
      payload: JSON.stringify(receipt),
      status: 'pending',
      hlcTimestamp: now,
      createdAt: now,
      retryCount: 0,
    })
  })

  return receipt
}
