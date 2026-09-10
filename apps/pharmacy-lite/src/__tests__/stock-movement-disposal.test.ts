import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { recordDisposal } from '@/lib/inventory/stock-movement'
import type { StockBatch } from '@/lib/inventory/types'

function batch(overrides: Partial<StockBatch> = {}): StockBatch {
  return {
    id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2020-01-01',
    quantityOnHand: 8, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
    status: 'quarantined', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.stockBatches.clear()
  await db.stockMovements.clear()
  await db.syncQueue.clear()
})

describe('recordDisposal', () => {
  it('disposes a partial quantity from a quarantined batch', async () => {
    await db.stockBatches.put(batch())
    await recordDisposal({ stockBatchId: 'batch-1', quantity: 3, reasonCode: 'expired', performedBy: 'u1' })
    const b = await db.stockBatches.get('batch-1')
    expect(b!.quantityOnHand).toBe(5)
    const m = (await db.stockMovements.toArray())[0]!
    expect(m.type).toBe('disposed')
    expect(m.referenceType).toBe('disposal')
    expect(m.reasonCode).toBe('expired')
    expect(m.quantity).toBe(-3)
  })

  it('disposing the full quantity depletes the batch', async () => {
    await db.stockBatches.put(batch({ quantityOnHand: 4 }))
    await recordDisposal({ stockBatchId: 'batch-1', quantity: 4, reasonCode: 'damaged', performedBy: 'u1' })
    const b = await db.stockBatches.get('batch-1')
    expect(b!.quantityOnHand).toBe(0)
    expect(b!.status).toBe('depleted')
  })

  it('works on an active batch (damage/recall before expiry)', async () => {
    await db.stockBatches.put(batch({ status: 'active', expiryDate: '2030-01-01' }))
    await recordDisposal({ stockBatchId: 'batch-1', quantity: 2, reasonCode: 'recalled', performedBy: 'u1' })
    expect((await db.stockBatches.get('batch-1'))!.quantityOnHand).toBe(6)
  })

  it('rejects a non-positive quantity', async () => {
    await db.stockBatches.put(batch())
    await expect(
      recordDisposal({ stockBatchId: 'batch-1', quantity: 0, reasonCode: 'expired', performedBy: 'u1' }),
    ).rejects.toThrow()
  })

  it('rejects disposing more than on-hand', async () => {
    await db.stockBatches.put(batch({ quantityOnHand: 2 }))
    await expect(
      recordDisposal({ stockBatchId: 'batch-1', quantity: 5, reasonCode: 'expired', performedBy: 'u1' }),
    ).rejects.toThrow()
  })
})
