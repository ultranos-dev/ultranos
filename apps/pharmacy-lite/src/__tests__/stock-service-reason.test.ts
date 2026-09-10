import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { addStock, deductStock } from '@/lib/inventory/stock-service'
import type { StockBatch } from '@/lib/inventory/types'

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2030-01-01',
  quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  await db.stockBatches.clear()
  await db.stockMovements.clear()
  await db.stockBatches.put({ ...BATCH })
})

describe('stock-service reason threading', () => {
  it('deductStock persists reasonCode + reason note on the movement', async () => {
    await deductStock({
      stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 3, type: 'adjusted',
      referenceType: 'adjustment', reason: 'shelf miscount', reasonCode: 'miscount',
      performedBy: 'user-1',
    })
    const moves = await db.stockMovements.where('stockBatchId').equals('batch-1').toArray()
    expect(moves).toHaveLength(1)
    expect(moves[0]!.reasonCode).toBe('miscount')
    expect(moves[0]!.reason).toBe('shelf miscount')
    expect(moves[0]!.referenceType).toBe('adjustment')
    expect(moves[0]!.quantity).toBe(-3)
  })

  it('addStock persists reasonCode on the movement', async () => {
    await addStock({
      stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 5, type: 'adjusted',
      referenceType: 'adjustment', reasonCode: 'system_error', performedBy: 'user-1',
    })
    const moves = await db.stockMovements.where('stockBatchId').equals('batch-1').toArray()
    expect(moves[0]!.reasonCode).toBe('system_error')
    expect(moves[0]!.quantity).toBe(5)
  })
})
