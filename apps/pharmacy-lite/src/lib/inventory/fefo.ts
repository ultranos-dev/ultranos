import { db } from '@/lib/db'
import type { StockBatch } from './types'

export async function selectFefoBatch(
  catalogItemId: string,
  requiredQty: number,
): Promise<StockBatch | null> {
  const batches = await db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .sortBy('expiryDate')

  for (const batch of batches) {
    if (batch.quantityOnHand >= requiredQty) {
      return batch
    }
  }

  const anyStock = batches.find((b) => b.quantityOnHand > 0)
  return anyStock ?? null
}

export async function getFefoBatches(catalogItemId: string): Promise<StockBatch[]> {
  return db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .sortBy('expiryDate')
}

export async function getTotalStockOnHand(catalogItemId: string): Promise<number> {
  const batches = await db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .toArray()
  return batches.reduce((sum, b) => sum + b.quantityOnHand, 0)
}
