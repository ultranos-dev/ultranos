import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { queryMovements } from '@/lib/inventory/stock-movement'
import type { StockMovement } from '@/lib/inventory/types'

function mv(id: string, o: Partial<StockMovement>): StockMovement {
  return {
    id, stockBatchId: 'b1', catalogItemId: 'cat-1', type: 'adjusted', quantity: 1,
    performedBy: 'u1', timestamp: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    ...o,
  }
}

beforeEach(async () => {
  await db.stockMovements.clear()
  await db.stockMovements.bulkPut([
    mv('m1', { catalogItemId: 'cat-1', type: 'received', timestamp: '2026-01-01T00:00:00.000Z' }),
    mv('m2', { catalogItemId: 'cat-1', type: 'disposed', timestamp: '2026-03-01T00:00:00.000Z' }),
    mv('m3', { catalogItemId: 'cat-2', type: 'adjusted', timestamp: '2026-02-01T00:00:00.000Z' }),
  ])
})

describe('queryMovements', () => {
  it('returns all movements newest-first when no filter', async () => {
    const r = await queryMovements()
    expect(r.map((m) => m.id)).toEqual(['m2', 'm3', 'm1'])
  })
  it('filters by catalogItemId', async () => {
    const r = await queryMovements({ catalogItemId: 'cat-1' })
    expect(r.map((m) => m.id)).toEqual(['m2', 'm1'])
  })
  it('filters by type', async () => {
    const r = await queryMovements({ type: 'disposed' })
    expect(r.map((m) => m.id)).toEqual(['m2'])
  })
  it('filters by date range (inclusive)', async () => {
    const r = await queryMovements({ from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T00:00:00.000Z' })
    expect(r.map((m) => m.id)).toEqual(['m3'])
  })
  it('applies limit after sorting', async () => {
    const r = await queryMovements({ limit: 1 })
    expect(r.map((m) => m.id)).toEqual(['m2'])
  })
})
