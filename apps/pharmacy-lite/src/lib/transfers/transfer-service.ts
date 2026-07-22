import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { deductStock, addStock } from '@/lib/inventory/stock-service'
import type { StockTransfer, TransferItem } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString()
}

async function enqueueSyncUpdate(transferId: string): Promise<void> {
  const transfer = await db.stockTransfers.get(transferId)
  if (!transfer) return
  const ts = now()
  await enqueuePharmacySyncEntry({
    resourceType: 'StockTransfer',
    resourceId: transferId,
    action: 'update',
    payload: transfer as unknown as Record<string, unknown>,
    hlcTimestamp: ts,
    createdAt: ts,
  })
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function createTransferRequest(params: {
  id?: string
  fromLocationId: string
  fromLocationName: string
  toLocationId: string
  toLocationName: string
  items: TransferItem[]
  requestedBy: string
}): Promise<StockTransfer> {
  const ts = now()
  const transfer: StockTransfer = {
    id: params.id ?? crypto.randomUUID(),
    fromLocationId: params.fromLocationId,
    fromLocationName: params.fromLocationName,
    toLocationId: params.toLocationId,
    toLocationName: params.toLocationName,
    status: 'requested',
    items: params.items,
    requestedBy: params.requestedBy,
    requestedAt: ts,
    hlcTimestamp: ts,
  }

  await db.stockTransfers.put(transfer)

  await enqueuePharmacySyncEntry({
    resourceType: 'StockTransfer',
    resourceId: transfer.id,
    action: 'create',
    payload: transfer as unknown as Record<string, unknown>,
    hlcTimestamp: ts,
    createdAt: ts,
  })

  return transfer
}

export async function approveTransfer(
  transferId: string,
  approvedBy: string,
): Promise<void> {
  const ts = now()
  await db.stockTransfers.update(transferId, {
    status: 'approved',
    approvedBy,
    approvedAt: ts,
    hlcTimestamp: ts,
  })
  await enqueueSyncUpdate(transferId)
}

export async function shipTransfer(
  transferId: string,
  performedBy: string,
): Promise<void> {
  const transfer = await db.stockTransfers.get(transferId)
  if (!transfer) throw new Error(`StockTransfer not found: ${transferId}`)

  for (const item of transfer.items) {
    await deductStock({
      stockBatchId: item.stockBatchId,
      catalogItemId: item.catalogItemId,
      quantity: item.quantity,
      type: 'transferred_out',
      referenceId: transferId,
      referenceType: 'transfer',
      performedBy,
    })
  }

  const ts = now()
  await db.stockTransfers.update(transferId, {
    status: 'shipped',
    shippedAt: ts,
    hlcTimestamp: ts,
  })
  await enqueueSyncUpdate(transferId)
}

export async function receiveTransfer(
  transferId: string,
  receivedBy: string,
  locationId: string,
): Promise<void> {
  const transfer = await db.stockTransfers.get(transferId)
  if (!transfer) throw new Error(`StockTransfer not found: ${transferId}`)

  const ts = now()

  for (const item of transfer.items) {
    // Look up the source batch to copy metadata
    const sourceBatch = await db.stockBatches.get(item.stockBatchId)

    const newBatchId = crypto.randomUUID()

    // Create a new StockBatch at the receiving location
    await db.stockBatches.put({
      id: newBatchId,
      catalogItemId: item.catalogItemId,
      batchNumber: item.batchNumber,
      lotNumber: sourceBatch?.lotNumber,
      expiryDate: sourceBatch?.expiryDate ?? '',
      quantityOnHand: 0, // addStock will increment this
      costPrice: sourceBatch?.costPrice ?? 0,
      sellingPrice: sourceBatch?.sellingPrice ?? 0,
      zoneId: sourceBatch?.zoneId,
      supplierId: sourceBatch?.supplierId,
      receivedAt: ts,
      status: 'active',
      locationId,
      hlcTimestamp: ts,
    })

    await addStock({
      stockBatchId: newBatchId,
      catalogItemId: item.catalogItemId,
      quantity: item.quantity,
      type: 'transferred_in',
      referenceId: transferId,
      referenceType: 'transfer',
      performedBy: receivedBy,
    })
  }

  await db.stockTransfers.update(transferId, {
    status: 'received',
    receivedAt: ts,
    receivedBy,
    hlcTimestamp: ts,
  })
  await enqueueSyncUpdate(transferId)
}

export async function cancelTransfer(
  transferId: string,
  reason: string,
): Promise<void> {
  const ts = now()
  await db.stockTransfers.update(transferId, {
    status: 'cancelled',
    cancelledReason: reason,
    hlcTimestamp: ts,
  })
  await enqueueSyncUpdate(transferId)
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getTransfers(locationId: string): Promise<StockTransfer[]> {
  const [outgoing, incoming] = await Promise.all([
    db.stockTransfers.where('fromLocationId').equals(locationId).toArray(),
    db.stockTransfers.where('toLocationId').equals(locationId).toArray(),
  ])

  // Merge and deduplicate by id (a transfer between the same location would
  // appear in both arrays only in degenerate cases, but guard anyway)
  const seen = new Set<string>()
  const results: StockTransfer[] = []
  for (const t of [...outgoing, ...incoming]) {
    if (!seen.has(t.id)) {
      seen.add(t.id)
      results.push(t)
    }
  }
  return results
}

export async function getPendingIncoming(locationId: string): Promise<StockTransfer[]> {
  return db.stockTransfers
    .where('toLocationId')
    .equals(locationId)
    .filter((t) => t.status === 'shipped')
    .toArray()
}
