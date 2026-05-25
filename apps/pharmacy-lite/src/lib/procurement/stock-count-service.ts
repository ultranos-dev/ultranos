import { db } from '@/lib/db'
import type { StockCount, StockCountItem, StockCountType } from './types'
import type { StockMovement } from '@/lib/inventory/types'

export async function startStockCount(params: {
  type: StockCountType
  countedBy: string
}): Promise<StockCount> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const count: StockCount = {
    id,
    type: params.type,
    status: 'in_progress',
    countedBy: params.countedBy,
    items: [],
    totalVarianceItems: 0,
    startedAt: now,
    hlcTimestamp: now,
  }
  await db.stockCounts.put(count)
  return count
}

export async function addCountItem(countId: string, item: StockCountItem): Promise<void> {
  const count = await db.stockCounts.get(countId)
  if (!count) throw new Error('Stock count not found')
  if (count.status !== 'in_progress') throw new Error('Stock count already completed')
  const existingIndex = count.items.findIndex((i) => i.stockBatchId === item.stockBatchId)
  let updatedItems: StockCountItem[]
  if (existingIndex >= 0) {
    updatedItems = [...count.items]
    updatedItems[existingIndex] = item
  } else {
    updatedItems = [...count.items, item]
  }
  await db.stockCounts.update(countId, { items: updatedItems, hlcTimestamp: new Date().toISOString() })
}

export async function completeStockCount(countId: string): Promise<StockCount> {
  const count = await db.stockCounts.get(countId)
  if (!count) throw new Error('Stock count not found')
  if (count.status !== 'in_progress') throw new Error('Stock count already completed')
  const now = new Date().toISOString()
  const varianceItems = count.items.filter((item) => item.variance !== 0)

  await db.transaction('rw', [db.stockCounts, db.stockMovements, db.stockBatches, db.syncQueue], async () => {
    for (const item of varianceItems) {
      const movementId = crypto.randomUUID()
      const catalogItem = await db.catalogItems.get(item.catalogItemId)
      const isControlled = !!catalogItem?.controlledSchedule
      const movement: StockMovement = {
        id: movementId,
        stockBatchId: item.stockBatchId,
        catalogItemId: item.catalogItemId,
        type: 'adjusted',
        quantity: item.variance,
        reason: isControlled
          ? `[CONTROLLED] Stock count variance: expected ${item.expectedQty}, counted ${item.actualQty}`
          : `Stock count variance: expected ${item.expectedQty}, counted ${item.actualQty}`,
        referenceId: countId,
        referenceType: 'count',
        performedBy: count.countedBy,
        timestamp: now,
        hlcTimestamp: now,
      }
      await db.stockMovements.put(movement)
      await db.stockBatches.update(item.stockBatchId, { quantityOnHand: item.actualQty, hlcTimestamp: now })
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
    await db.stockCounts.update(countId, {
      status: 'completed' as const,
      completedAt: now,
      totalVarianceItems: varianceItems.length,
      hlcTimestamp: now,
    })
  })

  return { ...count, status: 'completed', completedAt: now, totalVarianceItems: varianceItems.length }
}

export async function getControlledSubstanceBalances(): Promise<
  {
    catalogItemId: string
    catalogItemName: string
    schedule: string
    totalOnHand: number
    batchCount: number
  }[]
> {
  const controlledItems = await db.catalogItems
    .filter((item) => !!item.controlledSchedule && item.isActive)
    .toArray()
  return Promise.all(
    controlledItems.map(async (item) => {
      const batches = await db.stockBatches
        .where('[catalogItemId+status]')
        .equals([item.id, 'active'])
        .toArray()
      const totalOnHand = batches.reduce((sum, b) => sum + b.quantityOnHand, 0)
      return {
        catalogItemId: item.id,
        catalogItemName: item.name,
        schedule: item.controlledSchedule!,
        totalOnHand,
        batchCount: batches.length,
      }
    }),
  )
}

export async function getRecentStockCounts(limit = 10): Promise<StockCount[]> {
  return db.stockCounts
    .where('status')
    .equals('completed')
    .reverse()
    .sortBy('completedAt')
    .then((counts) => counts.slice(0, limit))
}

export async function getActiveStockCount(): Promise<StockCount | null> {
  const active = await db.stockCounts.where('status').equals('in_progress').first()
  return active ?? null
}
