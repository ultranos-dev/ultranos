import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { getWac, getInventoryValuation } from '@/lib/inventory/valuation'
import type { StockBatch } from '@/lib/inventory/types'

function batch(o: Partial<StockBatch>): StockBatch {
  return { id: crypto.randomUUID(), catalogItemId: 'a', batchNumber: 'B', expiryDate: '2030-01-01',
    quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
    status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z', ...o }
}

beforeEach(async () => { await db.stockBatches.clear() })

describe('getWac', () => {
  it('weights active batch costs by quantity', async () => {
    await db.stockBatches.bulkPut([
      batch({ quantityOnHand: 10, costPrice: 100 }),
      batch({ quantityOnHand: 30, costPrice: 200 }),
    ])
    // (10*100 + 30*200) / 40 = 7000/40 = 175
    expect(await getWac('a')).toBe(175)
  })
  it('ignores depleted and quarantined batches', async () => {
    await db.stockBatches.bulkPut([
      batch({ quantityOnHand: 10, costPrice: 100, status: 'active' }),
      batch({ quantityOnHand: 10, costPrice: 999, status: 'quarantined' }),
      batch({ quantityOnHand: 0, costPrice: 999, status: 'depleted' }),
    ])
    expect(await getWac('a')).toBe(100)
  })
  it('returns null when there is no active stock', async () => {
    expect(await getWac('a')).toBeNull()
  })
})

describe('getInventoryValuation', () => {
  it('totals active inventory value across items', async () => {
    await db.stockBatches.bulkPut([
      batch({ catalogItemId: 'a', quantityOnHand: 10, costPrice: 100 }),
      batch({ catalogItemId: 'b', quantityOnHand: 5, costPrice: 200 }),
      batch({ catalogItemId: 'b', quantityOnHand: 0, costPrice: 200, status: 'depleted' }),
    ])
    const v = await getInventoryValuation()
    expect(v.totalValue).toBe(2000) // 1000 + 1000
    expect(v.byItem.find((i) => i.catalogItemId === 'b')!.wac).toBe(200)
  })
})
