import { db } from '@/lib/db'
import { buildEncryptedSyncEntry } from '@/lib/dexie-sync-adapter'
import { auditProcurementEvent } from '@/lib/procurement/audit'
import { AuditAction, AuditResourceType } from '@ultranos/shared-types'
import type { StockBatch, StockMovement } from './types'

export class BatchNotQuarantinedError extends Error {
  constructor() {
    super('Only a quarantined batch can be released')
    this.name = 'BatchNotQuarantinedError'
  }
}

/** Release a quarantined batch back to active stock. Writes a 'released' movement
 *  and flips status to 'active'. Mirrors the expiry-watchdog quarantine write. */
export async function releaseFromQuarantine(batchId: string, releasedBy: string): Promise<void> {
  const batch = await db.stockBatches.get(batchId)
  if (!batch) throw new Error(`StockBatch not found: ${batchId}`)
  if (batch.status !== 'quarantined') throw new BatchNotQuarantinedError()

  const now = new Date().toISOString()
  const movement: StockMovement = {
    id: crypto.randomUUID(),
    stockBatchId: batchId,
    catalogItemId: batch.catalogItemId,
    type: 'released',
    quantity: batch.quantityOnHand,
    reason: 'Released from quarantine',
    performedBy: releasedBy,
    timestamp: now,
    hlcTimestamp: now,
  }

  // Encrypt sync entries BEFORE the tx (Web Crypto cannot run inside a Dexie tx zone).
  const movementSync = await buildEncryptedSyncEntry({
    resourceType: 'StockMovement', resourceId: movement.id, action: 'create',
    payload: movement as unknown as Record<string, unknown>, hlcTimestamp: now, createdAt: now,
  })
  const batchSync = await buildEncryptedSyncEntry({
    resourceType: 'StockBatch', resourceId: batchId, action: 'update',
    payload: { ...batch, status: 'active', releasedBy, releasedAt: now, hlcTimestamp: now } as unknown as Record<string, unknown>,
    hlcTimestamp: now, createdAt: now,
  })

  await db.transaction('rw', [db.stockBatches, db.stockMovements, db.syncQueue], async () => {
    await db.stockMovements.put(movement)
    await db.stockBatches.update(batchId, { status: 'active', releasedBy, releasedAt: now, hlcTimestamp: now })
    await db.syncQueue.put(movementSync)
    await db.syncQueue.put(batchSync)
  })

  auditProcurementEvent(releasedBy, AuditAction.BATCH_QC_RELEASED, AuditResourceType.STOCK_BATCH, batchId, {
    batchNumber: batch.batchNumber, catalogItemId: batch.catalogItemId,
  })
}

export async function getQuarantinedBatches(): Promise<StockBatch[]> {
  const batches = await db.stockBatches.where('status').equals('quarantined').toArray()
  return batches.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}
