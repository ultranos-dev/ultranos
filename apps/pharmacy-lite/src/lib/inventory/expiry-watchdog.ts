import { db } from '@/lib/db'
import type { StockMovement } from './types'

export async function quarantineExpiredBatches(performedBy: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0]!

  const expiredBatches = await db.stockBatches
    .where('status')
    .equals('active')
    .filter((batch) => batch.expiryDate <= today)
    .toArray()

  if (expiredBatches.length === 0) return 0

  const now = new Date().toISOString()

  await db.transaction('rw', [db.stockBatches, db.stockMovements, db.syncQueue], async () => {
    for (const batch of expiredBatches) {
      const movementId = crypto.randomUUID()
      const movement: StockMovement = {
        id: movementId,
        stockBatchId: batch.id,
        catalogItemId: batch.catalogItemId,
        type: 'quarantined',
        quantity: -batch.quantityOnHand,
        reason: `Auto-quarantined: expired on ${batch.expiryDate}`,
        performedBy,
        timestamp: now,
        hlcTimestamp: now,
      }
      await db.stockMovements.put(movement)
      await db.stockBatches.update(batch.id, {
        status: 'quarantined' as const,
        hlcTimestamp: now,
      })
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
  })

  return expiredBatches.length
}
