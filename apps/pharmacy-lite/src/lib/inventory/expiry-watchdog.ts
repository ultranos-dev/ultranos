import { db } from '@/lib/db'
import { buildEncryptedSyncEntry } from '@/lib/dexie-sync-adapter'
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

  // Build movements and encrypt sync-queue entries BEFORE opening the Dexie
  // transaction — encryption is async Web Crypto and cannot run inside a Dexie
  // transaction zone. Then perform all writes synchronously inside the tx.
  const movements: StockMovement[] = expiredBatches.map((batch) => ({
    id: crypto.randomUUID(),
    stockBatchId: batch.id,
    catalogItemId: batch.catalogItemId,
    type: 'quarantined',
    quantity: -batch.quantityOnHand,
    reason: `Auto-quarantined: expired on ${batch.expiryDate}`,
    performedBy,
    timestamp: now,
    hlcTimestamp: now,
  }))

  const syncEntries = await Promise.all(
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

  await db.transaction('rw', [db.stockBatches, db.stockMovements, db.syncQueue], async () => {
    for (let i = 0; i < expiredBatches.length; i++) {
      const batch = expiredBatches[i]!
      await db.stockMovements.put(movements[i]!)
      await db.stockBatches.update(batch.id, {
        status: 'quarantined' as const,
        hlcTimestamp: now,
      })
      await db.syncQueue.put(syncEntries[i]!)
    }
  })

  return expiredBatches.length
}
