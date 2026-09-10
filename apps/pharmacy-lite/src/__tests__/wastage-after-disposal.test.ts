import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { recordDisposal } from '@/lib/inventory/stock-movement'
import { getWastageMetrics } from '@/lib/reports/wastage-report'
import type { StockBatch } from '@/lib/inventory/types'

const BATCH: StockBatch = {
  id: 'batch-disp-1',
  catalogItemId: 'cat-1',
  batchNumber: 'B1',
  expiryDate: '2020-01-01',
  quantityOnHand: 5,
  costPrice: 100,
  sellingPrice: 200,
  receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'quarantined',
  locationId: 'default',
  hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  await db.stockBatches.clear()
  await db.stockMovements.clear()
  await db.syncQueue.clear()
})

describe('wastage report after disposal', () => {
  it('counts disposed units in totalDisposed and disposedInPeriod', async () => {
    await db.stockBatches.put({ ...BATCH })
    await recordDisposal({
      stockBatchId: 'batch-disp-1',
      quantity: 5,
      reasonCode: 'expired',
      performedBy: 'u1',
    })

    const metrics = await getWastageMetrics(30)

    // The disposed movement was created just now — well within the 30-day window.
    expect(metrics.disposedInPeriod).toBe(1)
    expect(metrics.totalDisposed).toBe(5)
  })

  it('reflects zero disposals when no disposal movements exist', async () => {
    // Seed a quarantined batch but do NOT dispose it.
    await db.stockBatches.put({ ...BATCH })

    const metrics = await getWastageMetrics(30)

    expect(metrics.disposedInPeriod).toBe(0)
    expect(metrics.totalDisposed).toBe(0)
    // The quarantined batch still shows up in quarantinedBatches count.
    expect(metrics.quarantinedBatches).toBe(1)
  })

  it('wastageRate accounts for the disposed movement', async () => {
    await db.stockBatches.put({ ...BATCH })
    await recordDisposal({
      stockBatchId: 'batch-disp-1',
      quantity: 5,
      reasonCode: 'expired',
      performedBy: 'u1',
    })

    const metrics = await getWastageMetrics(30)

    // One movement total (the disposed one), and it is a waste movement → 100% rate.
    expect(metrics.wastageRate).toBe(100)
  })
})
