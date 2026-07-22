import { db } from '@/lib/db'
import { buildEncryptedSyncEntry } from '@/lib/dexie-sync-adapter'
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

  // Build batches + movements, then encrypt all sync-queue entries BEFORE
  // opening the Dexie transaction (Web Crypto cannot run inside a tx zone).
  const batches: StockBatch[] = []
  const movements: StockMovement[] = []
  for (const item of items) {
    const batchId = crypto.randomUUID()
    const movementId = crypto.randomUUID()

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
      status: 'active',
      locationId,
      hlcTimestamp: now,
    })

    movements.push({
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
    })
  }

  const movementSyncEntries = await Promise.all(
    movements.map((movement) =>
      buildEncryptedSyncEntry({
        resourceType: 'StockMovement',
        resourceId: movement.id,
        action: 'create',
        payload: movement as unknown as Record<string, unknown>,
        hlcTimestamp: now,
        createdAt: now,
      }),
    ),
  )

  const receiptSyncEntry = await buildEncryptedSyncEntry({
    resourceType: 'GoodsReceipt',
    resourceId: receiptId,
    action: 'create',
    payload: receipt as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })

  await db.transaction('rw', [db.goodsReceipts, db.stockBatches, db.stockMovements, db.syncQueue], async () => {
    await db.goodsReceipts.put(receipt)

    for (let i = 0; i < movements.length; i++) {
      await db.stockBatches.put(batches[i]!)
      await db.stockMovements.put(movements[i]!)
      await db.syncQueue.put(movementSyncEntries[i]!)
    }

    await db.syncQueue.put(receiptSyncEntry)
  })

  return receipt
}
