import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { StockBatch, StockMovement, StockMovementType } from './types'

export async function deductStock(params: {
  stockBatchId: string
  catalogItemId: string
  quantity: number
  type: StockMovementType
  referenceId?: string
  referenceType?: StockMovement['referenceType']
  performedBy: string
}): Promise<StockBatch> {
  const { stockBatchId, catalogItemId, quantity, type, referenceId, referenceType, performedBy } = params

  const batch = await db.stockBatches.get(stockBatchId)
  if (!batch) throw new Error(`StockBatch not found: ${stockBatchId}`)
  if (batch.quantityOnHand < quantity) {
    throw new Error(`Insufficient stock: have ${batch.quantityOnHand}, need ${quantity}`)
  }

  const now = new Date().toISOString()
  const movementId = crypto.randomUUID()

  const movement: StockMovement = {
    id: movementId,
    stockBatchId,
    catalogItemId,
    type,
    quantity: -quantity,
    referenceId,
    referenceType,
    performedBy,
    timestamp: now,
    hlcTimestamp: now,
  }

  const newQty = batch.quantityOnHand - quantity
  const newStatus = newQty <= 0 ? 'depleted' as const : batch.status

  await db.transaction('rw', [db.stockMovements, db.stockBatches], async () => {
    await db.stockMovements.put(movement)
    await db.stockBatches.update(stockBatchId, {
      quantityOnHand: newQty,
      status: newStatus,
      hlcTimestamp: now,
    })
  })

  await enqueuePharmacySyncEntry({
    resourceType: 'StockMovement',
    resourceId: movementId,
    action: 'create',
    payload: movement as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })

  return { ...batch, quantityOnHand: newQty, status: newStatus }
}

export async function addStock(params: {
  stockBatchId: string
  catalogItemId: string
  quantity: number
  type: StockMovementType
  referenceId?: string
  referenceType?: StockMovement['referenceType']
  performedBy: string
}): Promise<void> {
  const { stockBatchId, catalogItemId, quantity, type, referenceId, referenceType, performedBy } = params

  const now = new Date().toISOString()
  const movementId = crypto.randomUUID()

  const movement: StockMovement = {
    id: movementId,
    stockBatchId,
    catalogItemId,
    type,
    quantity,
    referenceId,
    referenceType,
    performedBy,
    timestamp: now,
    hlcTimestamp: now,
  }

  await db.transaction('rw', [db.stockMovements, db.stockBatches], async () => {
    await db.stockMovements.put(movement)
    const batch = await db.stockBatches.get(stockBatchId)
    if (batch) {
      const newQty = batch.quantityOnHand + quantity
      await db.stockBatches.update(stockBatchId, {
        quantityOnHand: newQty,
        status: newQty > 0 && batch.status === 'depleted' ? 'active' as const : batch.status,
        hlcTimestamp: now,
      })
    }
  })

  await enqueuePharmacySyncEntry({
    resourceType: 'StockMovement',
    resourceId: movementId,
    action: 'create',
    payload: movement as unknown as Record<string, unknown>,
    hlcTimestamp: now,
    createdAt: now,
  })
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
