import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { enqueueStockBatchSync } from './stock-batch-sync'
import { hlcNow } from '@/lib/hlc'
import type { StockBatch, StockMovement, StockMovementType, StockMovementReason } from './types'

/**
 * Story 57.4 (M-PHARM-2, AC 1): thrown when a deduction cannot proceed because
 * the current on-hand quantity does not cover the requested amount. A distinct
 * error class so callers (fulfillment) can distinguish an insufficient-stock
 * failure from an infrastructure failure and surface the correct warning +
 * reconciliation record without ever silently swallowing it.
 */
export class InsufficientStockError extends Error {
  readonly stockBatchId: string
  readonly available: number
  readonly requested: number
  constructor(stockBatchId: string, available: number, requested: number) {
    // No PHI in message — batch id is an opaque inventory id, not patient data.
    super(`Insufficient stock for batch ${stockBatchId}: have ${available}, need ${requested}`)
    this.name = 'InsufficientStockError'
    this.stockBatchId = stockBatchId
    this.available = available
    this.requested = requested
  }
}

export async function deductStock(params: {
  stockBatchId: string
  catalogItemId: string
  quantity: number
  type: StockMovementType
  reason?: string
  reasonCode?: StockMovementReason
  referenceId?: string
  referenceType?: StockMovement['referenceType']
  performedBy: string
}): Promise<StockBatch> {
  const { stockBatchId, catalogItemId, quantity, type, reason, reasonCode, referenceId, referenceType, performedBy } = params

  const now = new Date().toISOString()
  const hlcTs = hlcNow()
  const movementId = crypto.randomUUID()

  const movement: StockMovement = {
    id: movementId,
    stockBatchId,
    catalogItemId,
    type,
    quantity: -quantity,
    reason,
    reasonCode,
    referenceId,
    referenceType,
    performedBy,
    timestamp: now,
    hlcTimestamp: hlcTs,
  }

  // Story 57.4 (M-PHARM-2, AC 1): the read → quantity-check → newQty compute →
  // write ALL happen inside a single rw transaction. Previously the batch was
  // read and validated OUTSIDE the transaction, so two tabs dispensing the same
  // batch concurrently could both pass the check against the same stale on-hand
  // value and produce a lost update (or drive stock negative unnoticed). Reading
  // inside the tx serialises the check-and-decrement; a negative result is
  // rejected before any write is committed.
  const updatedBatch = await db.transaction('rw', [db.stockMovements, db.stockBatches], async () => {
    const batch = await db.stockBatches.get(stockBatchId)
    if (!batch) throw new Error(`StockBatch not found: ${stockBatchId}`)

    const newQty = batch.quantityOnHand - quantity
    if (newQty < 0) {
      // Guard: never write a negative on-hand. Abort the tx (no movement, no
      // batch update) so the ledger stays consistent and the caller can surface
      // an explicit reconciliation warning.
      throw new InsufficientStockError(stockBatchId, batch.quantityOnHand, quantity)
    }
    const newStatus = newQty <= 0 ? 'depleted' as const : batch.status

    await db.stockMovements.put(movement)
    await db.stockBatches.update(stockBatchId, {
      quantityOnHand: newQty,
      status: newStatus,
      hlcTimestamp: hlcTs,
    })
    return { ...batch, quantityOnHand: newQty, status: newStatus, hlcTimestamp: hlcTs }
  })

  await enqueuePharmacySyncEntry({
    resourceType: 'StockMovement',
    resourceId: movementId,
    action: 'create',
    payload: movement as unknown as Record<string, unknown>,
    hlcTimestamp: hlcTs,
    createdAt: now,
  })

  // Site #1: enqueue the full updated StockBatch after the txn (LWW snapshot)
  await enqueueStockBatchSync(updatedBatch)

  return updatedBatch
}

export async function addStock(params: {
  stockBatchId: string
  catalogItemId: string
  quantity: number
  type: StockMovementType
  reason?: string
  reasonCode?: StockMovementReason
  referenceId?: string
  referenceType?: StockMovement['referenceType']
  performedBy: string
}): Promise<void> {
  const { stockBatchId, catalogItemId, quantity, type, reason, reasonCode, referenceId, referenceType, performedBy } = params

  const now = new Date().toISOString()
  const hlcTs = hlcNow()
  const movementId = crypto.randomUUID()

  const movement: StockMovement = {
    id: movementId,
    stockBatchId,
    catalogItemId,
    type,
    quantity,
    reason,
    reasonCode,
    referenceId,
    referenceType,
    performedBy,
    timestamp: now,
    hlcTimestamp: hlcTs,
  }

  await db.transaction('rw', [db.stockMovements, db.stockBatches], async () => {
    await db.stockMovements.put(movement)
    const batch = await db.stockBatches.get(stockBatchId)
    if (batch) {
      const newQty = batch.quantityOnHand + quantity
      await db.stockBatches.update(stockBatchId, {
        quantityOnHand: newQty,
        status: newQty > 0 && batch.status === 'depleted' ? 'active' as const : batch.status,
        hlcTimestamp: hlcTs,
      })
    }
  })

  await enqueuePharmacySyncEntry({
    resourceType: 'StockMovement',
    resourceId: movementId,
    action: 'create',
    payload: movement as unknown as Record<string, unknown>,
    hlcTimestamp: hlcTs,
    createdAt: now,
  })

  // Site #2: enqueue the full updated StockBatch after the txn (read-back for post-txn qty)
  const updatedBatch = await db.stockBatches.get(stockBatchId)
  if (updatedBatch) {
    await enqueueStockBatchSync(updatedBatch)
  }
}

export async function getStockAlerts(expiryAlertDays: number): Promise<{
  lowStockCount: number
  nearExpiryCount: number
  quarantinedCount: number
}> {
  const now = new Date()
  const alertDate = new Date(now.getTime() + expiryAlertDays * 24 * 60 * 60 * 1000)
  const alertDateStr = alertDate.toISOString().split('T')[0]!

  const activeBatches = await db.stockBatches.where('status').equals('active').toArray()
  const qtyByCatalog = new Map<string, number>()
  for (const batch of activeBatches) {
    qtyByCatalog.set(batch.catalogItemId, (qtyByCatalog.get(batch.catalogItemId) ?? 0) + batch.quantityOnHand)
  }

  let lowStockCount = 0
  const catalogIds = Array.from(qtyByCatalog.keys())
  if (catalogIds.length > 0) {
    const catalogItems = await db.catalogItems.where('id').anyOf(catalogIds).toArray()
    for (const item of catalogItems) {
      const qty = qtyByCatalog.get(item.id) ?? 0
      if (qty <= item.reorderPoint) lowStockCount++
    }
  }

  const nearExpiryCount = activeBatches.filter((b) => b.expiryDate <= alertDateStr).length
  const quarantinedCount = await db.stockBatches.where('status').equals('quarantined').count()

  return { lowStockCount, nearExpiryCount, quarantinedCount }
}
