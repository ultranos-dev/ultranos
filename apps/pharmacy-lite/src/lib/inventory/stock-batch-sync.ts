/**
 * Shared helper: enqueue a StockBatch sync entry AFTER a transaction zone.
 *
 * Use at after-txn sites (deductStock, addStock, stock-count, transfer).
 * At inside-txn sites (goods-receipt, expiry-watchdog) use buildEncryptedSyncEntry
 * + db.syncQueue.put() directly — async encryption cannot run inside a Dexie txn.
 */
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import type { StockBatch } from './types'

export async function enqueueStockBatchSync(batch: StockBatch): Promise<void> {
  await enqueuePharmacySyncEntry({
    resourceType: 'StockBatch',
    resourceId: batch.id,
    action: 'update',
    payload: batch as unknown as Record<string, unknown>,
    hlcTimestamp: batch.hlcTimestamp,
    createdAt: new Date().toISOString(),
  })
}
