import { db } from '@/lib/db'
import { buildEncryptedSyncEntry, enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { getPurchaseOrderById } from '@/lib/procurement/purchase-order-service'
import { validateReceiptAgainstPO, applyReceiptToPO } from '@/lib/procurement/po-receipt'
import type { GoodsReceipt, GoodsReceiptItem, StockBatch, StockMovement } from './types'
import { DEFAULT_PHARMACY_SETTINGS } from './types'

export async function processGoodsReceipt(params: {
  items: GoodsReceiptItem[]
  supplierId?: string
  purchaseOrderId?: string
  receivedBy: string
  locationId: string
  notes?: string
  overReceiptReason?: string
}): Promise<GoodsReceipt> {
  const { items, supplierId, purchaseOrderId, receivedBy, locationId, notes, overReceiptReason } = params

  const now = new Date().toISOString()
  const receiptId = crypto.randomUUID()
  const totalCost = items.reduce((sum, item) => sum + item.costPrice * item.quantity, 0)

  // PO reconciliation guard (only when receiving against a PO)
  let po = purchaseOrderId ? await getPurchaseOrderById(purchaseOrderId) : undefined
  if (purchaseOrderId && !po) throw new Error('Purchase order not found')
  if (po && po.status !== 'sent' && po.status !== 'partially_received') {
    throw new Error(`Purchase order is not receivable (status: ${po.status})`)
  }
  if (po) {
    const received = items.map((i) => ({ catalogItemId: i.catalogItemId, quantity: i.quantity }))
    const catalogIds = [...new Set(received.map((r) => r.catalogItemId))]
    const catalogItems = await db.catalogItems.where('id').anyOf(catalogIds).toArray()
    const controlledIds = new Set(catalogItems.filter((c) => c.controlledSchedule).map((c) => c.id))
    const settings = await db.pharmacySettings.toCollection().first()
    const tolerancePercent = settings?.overReceiptTolerancePercent ?? DEFAULT_PHARMACY_SETTINGS.overReceiptTolerancePercent
    validateReceiptAgainstPO({ po, received, controlledIds, tolerancePercent, overrideReason: overReceiptReason })
  }

  const receipt: GoodsReceipt = {
    id: receiptId,
    supplierId,
    purchaseOrderId,
    receivedBy,
    items,
    totalCost,
    notes,
    overReceiptReason,
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

  // Site #3: pre-build StockBatch sync entries before the txn (mirrors movementSyncEntries idiom)
  const batchSyncEntries = await Promise.all(
    batches.map((batch) =>
      buildEncryptedSyncEntry({
        resourceType: 'StockBatch',
        resourceId: batch.id,
        action: 'update',
        payload: batch as unknown as Record<string, unknown>,
        hlcTimestamp: batch.hlcTimestamp,
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

  await db.transaction('rw', [db.goodsReceipts, db.stockBatches, db.stockMovements, db.syncQueue, db.purchaseOrders], async () => {
    await db.goodsReceipts.put(receipt)

    for (let i = 0; i < movements.length; i++) {
      await db.stockBatches.put(batches[i]!)
      await db.stockMovements.put(movements[i]!)
      await db.syncQueue.put(movementSyncEntries[i]!)
      await db.syncQueue.put(batchSyncEntries[i]!)
    }

    await db.syncQueue.put(receiptSyncEntry)

    if (purchaseOrderId) {
      const current = await db.purchaseOrders.get(purchaseOrderId)
      if (!current) throw new Error('Purchase order not found')
      const received = items.map((i) => ({ catalogItemId: i.catalogItemId, quantity: i.quantity }))
      const applied = applyReceiptToPO(current, received, now)
      await db.purchaseOrders.update(purchaseOrderId, {
        items: applied.items, status: applied.status, closedAt: applied.closedAt, hlcTimestamp: now,
      })
    }
  })

  if (purchaseOrderId) {
    const updatedPO = await db.purchaseOrders.get(purchaseOrderId)
    if (updatedPO) {
      await enqueuePharmacySyncEntry({
        resourceType: 'PurchaseOrder', resourceId: purchaseOrderId, action: 'update',
        payload: updatedPO as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
      })
    }
  }

  return receipt
}
