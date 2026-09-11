import { db } from '@/lib/db'
import { buildEncryptedSyncEntry, enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { reverseReceiptFromPO } from '@/lib/procurement/po-receipt'
import type { GoodsReceipt, StockBatch, StockMovement } from './types'

export class ReceiptNotReversibleError extends Error {
  reason: 'already_reversed' | 'is_reversal' | 'stock_not_intact'
  drawnDownBatchIds?: string[]
  constructor(reason: ReceiptNotReversibleError['reason'], drawnDownBatchIds?: string[]) {
    super(`Goods receipt is not reversible: ${reason}`)
    this.name = 'ReceiptNotReversibleError'
    this.reason = reason
    this.drawnDownBatchIds = drawnDownBatchIds
  }
}

/**
 * Reverse a goods receipt only while every batch it created is intact
 * (status 'active' and quantityOnHand equal to the received quantity). Writes
 * one 'void_reversal' movement per batch (append-only), depletes the batches,
 * writes a reversing GoodsReceipt, marks the original reversed, and — if the
 * receipt was against a PO — rolls the PO's received counts back. All inside a
 * single transaction; the PO sync entry is enqueued after the tx.
 */
export async function reverseGoodsReceipt(receiptId: string, performedBy: string): Promise<GoodsReceipt> {
  const receipt = await db.goodsReceipts.get(receiptId)
  if (!receipt) throw new Error(`GoodsReceipt not found: ${receiptId}`)
  if (receipt.reversalOf) throw new ReceiptNotReversibleError('is_reversal')
  if (receipt.reversedByReceiptId) throw new ReceiptNotReversibleError('already_reversed')

  // Batches this receipt created (goodsReceiptId is not indexed — filter in memory).
  const batches = await db.stockBatches.filter((b) => b.goodsReceiptId === receiptId).toArray()

  // Intact check: each batch must still hold exactly its received quantity and be active.
  const qtyByBatchNumber = new Map(receipt.items.map((it) => [it.batchNumber, it.quantity]))
  const drawnDown: string[] = []
  for (const b of batches) {
    const received = qtyByBatchNumber.get(b.batchNumber)
    if (b.status !== 'active' || received === undefined || b.quantityOnHand !== received) {
      drawnDown.push(b.id)
    }
  }
  if (drawnDown.length > 0) throw new ReceiptNotReversibleError('stock_not_intact', drawnDown)

  const now = new Date().toISOString()
  const reversalId = crypto.randomUUID()

  // Build reversing movements (append-only) + the reversing receipt record.
  const movements: StockMovement[] = batches.map((b) => ({
    id: crypto.randomUUID(),
    stockBatchId: b.id,
    catalogItemId: b.catalogItemId,
    type: 'void_reversal',
    quantity: -b.quantityOnHand,
    reason: undefined,
    referenceId: receiptId,
    referenceType: 'void',
    performedBy,
    timestamp: now,
    hlcTimestamp: now,
  }))

  const reversalReceipt: GoodsReceipt = {
    id: reversalId,
    supplierId: receipt.supplierId,
    purchaseOrderId: receipt.purchaseOrderId,
    receivedBy: performedBy,
    items: receipt.items.map((it) => ({ ...it, quantity: -it.quantity })),
    totalCost: -receipt.totalCost,
    notes: undefined,
    reversalOf: receiptId,
    receivedAt: now,
    hlcTimestamp: now,
  }

  // Pre-build encrypted sync entries (encryption cannot run inside a tx zone).
  const movementSyncEntries = await Promise.all(movements.map((m) =>
    buildEncryptedSyncEntry({ resourceType: 'StockMovement', resourceId: m.id, action: 'create', payload: m as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })))
  const batchSyncEntries = await Promise.all(batches.map((b) =>
    buildEncryptedSyncEntry({ resourceType: 'StockBatch', resourceId: b.id, action: 'update', payload: { ...b, quantityOnHand: 0, status: 'depleted' as const, hlcTimestamp: now } as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })))
  const reversalReceiptSyncEntry = await buildEncryptedSyncEntry({ resourceType: 'GoodsReceipt', resourceId: reversalId, action: 'create', payload: reversalReceipt as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })
  const originalReceiptSyncEntry = await buildEncryptedSyncEntry({ resourceType: 'GoodsReceipt', resourceId: receiptId, action: 'update', payload: { ...receipt, reversedByReceiptId: reversalId } as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })

  await db.transaction('rw', [db.stockBatches, db.stockMovements, db.goodsReceipts, db.purchaseOrders, db.syncQueue], async () => {
    for (let i = 0; i < batches.length; i++) {
      await db.stockMovements.put(movements[i]!)
      await db.stockBatches.update(batches[i]!.id, { quantityOnHand: 0, status: 'depleted', hlcTimestamp: now })
      await db.syncQueue.put(movementSyncEntries[i]!)
      await db.syncQueue.put(batchSyncEntries[i]!)
    }
    await db.goodsReceipts.put(reversalReceipt)
    await db.goodsReceipts.update(receiptId, { reversedByReceiptId: reversalId })
    await db.syncQueue.put(reversalReceiptSyncEntry)
    await db.syncQueue.put(originalReceiptSyncEntry)

    if (receipt.purchaseOrderId) {
      const po = await db.purchaseOrders.get(receipt.purchaseOrderId)
      if (po) {
        const reversed = receipt.items.map((it) => ({ catalogItemId: it.catalogItemId, quantity: it.quantity }))
        const rolled = reverseReceiptFromPO(po, reversed)
        await db.purchaseOrders.update(po.id, { items: rolled.items, status: rolled.status, closedAt: rolled.closedAt, hlcTimestamp: now })
      }
    }
  })

  // Enqueue the PO sync entry after the tx (post-tx value; encryption idiom).
  if (receipt.purchaseOrderId) {
    const updatedPO = await db.purchaseOrders.get(receipt.purchaseOrderId)
    if (updatedPO) {
      await enqueuePharmacySyncEntry({ resourceType: 'PurchaseOrder', resourceId: updatedPO.id, action: 'update', payload: updatedPO as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now })
    }
  }

  return reversalReceipt
}
