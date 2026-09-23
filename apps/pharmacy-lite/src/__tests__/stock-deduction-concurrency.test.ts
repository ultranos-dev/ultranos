import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { deductStock, InsufficientStockError } from '@/lib/inventory/stock-service'
import type { StockBatch } from '@/lib/inventory/types'

// Story 57.4 (M-PHARM-2, AC 1): the quantity read-check-write must happen INSIDE
// the Dexie transaction so concurrent decrements cannot produce a lost update or
// an unnoticed negative on-hand.

const BATCH: StockBatch = {
  id: 'batch-1',
  catalogItemId: 'cat-1',
  batchNumber: 'B1',
  expiryDate: '2030-01-01',
  quantityOnHand: 10,
  costPrice: 100,
  sellingPrice: 200,
  receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  locationId: 'default',
  hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  await db.stockBatches.clear()
  await db.stockMovements.clear()
  await db.stockBatches.put({ ...BATCH })
})

describe('deductStock transactional integrity (AC 1)', () => {
  it('two concurrent full-coverage deductions do not lose an update', async () => {
    // 10 on hand, two deductions of 4 fired concurrently → final must be 2, with
    // two movement rows. A TOCTOU (read outside tx) could leave 6 (one lost).
    await Promise.all([
      deductStock({ stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 4, type: 'dispensed', performedBy: 'u1' }),
      deductStock({ stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 4, type: 'dispensed', performedBy: 'u2' }),
    ])

    const batch = await db.stockBatches.get('batch-1')
    expect(batch!.quantityOnHand).toBe(2)
    const moves = await db.stockMovements.where('stockBatchId').equals('batch-1').toArray()
    expect(moves).toHaveLength(2)
    expect(moves.reduce((s, m) => s + m.quantity, 0)).toBe(-8)
  })

  it('never drives on-hand negative: the over-drawing deduction is rejected', async () => {
    // 10 on hand; deductions of 8 and 8 fired concurrently. One must succeed, the
    // other must throw InsufficientStockError — final on-hand is 2, never -6.
    const results = await Promise.allSettled([
      deductStock({ stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 8, type: 'dispensed', performedBy: 'u1' }),
      deductStock({ stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 8, type: 'dispensed', performedBy: 'u2' }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError)

    const batch = await db.stockBatches.get('batch-1')
    expect(batch!.quantityOnHand).toBe(2)
    expect(batch!.quantityOnHand).toBeGreaterThanOrEqual(0)
    // Only the successful deduction wrote a movement.
    const moves = await db.stockMovements.where('stockBatchId').equals('batch-1').toArray()
    expect(moves).toHaveLength(1)
  })

  it('throws InsufficientStockError (not a plain Error) when a single deduction over-draws', async () => {
    await expect(
      deductStock({ stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 11, type: 'dispensed', performedBy: 'u1' }),
    ).rejects.toBeInstanceOf(InsufficientStockError)

    const batch = await db.stockBatches.get('batch-1')
    expect(batch!.quantityOnHand).toBe(10) // unchanged — tx aborted before any write
    const moves = await db.stockMovements.where('stockBatchId').equals('batch-1').toArray()
    expect(moves).toHaveLength(0)
  })

  it('depletes the batch (status → depleted) when the deduction empties it', async () => {
    await deductStock({ stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 10, type: 'dispensed', performedBy: 'u1' })
    const batch = await db.stockBatches.get('batch-1')
    expect(batch!.quantityOnHand).toBe(0)
    expect(batch!.status).toBe('depleted')
  })

  it('normal sufficient-stock deduction behaves identically (zero regression)', async () => {
    const result = await deductStock({ stockBatchId: 'batch-1', catalogItemId: 'cat-1', quantity: 3, type: 'dispensed', performedBy: 'u1' })
    expect(result.quantityOnHand).toBe(7)
    expect(result.status).toBe('active')
    const batch = await db.stockBatches.get('batch-1')
    expect(batch!.quantityOnHand).toBe(7)
  })
})
