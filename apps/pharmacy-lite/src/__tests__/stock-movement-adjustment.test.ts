import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { recordAdjustment } from '@/lib/inventory/stock-movement'
import type { StockBatch } from '@/lib/inventory/types'

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2030-01-01',
  quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  await db.stockBatches.clear()
  await db.stockMovements.clear()
  await db.syncQueue.clear()
  await db.stockBatches.put({ ...BATCH })
})

describe('recordAdjustment', () => {
  it('adjusts upward: sets on-hand and writes a positive adjusted movement', async () => {
    await recordAdjustment({ stockBatchId: 'batch-1', newQuantity: 14, reasonCode: 'system_error', performedBy: 'u1' })
    const b = await db.stockBatches.get('batch-1')
    expect(b!.quantityOnHand).toBe(14)
    const m = (await db.stockMovements.toArray())[0]!
    expect(m.type).toBe('adjusted')
    expect(m.referenceType).toBe('adjustment')
    expect(m.reasonCode).toBe('system_error')
    expect(m.quantity).toBe(4)
  })

  it('adjusts downward: writes a negative adjusted movement with note', async () => {
    await recordAdjustment({ stockBatchId: 'batch-1', newQuantity: 6, reasonCode: 'miscount', note: 'recount', performedBy: 'u1' })
    const b = await db.stockBatches.get('batch-1')
    expect(b!.quantityOnHand).toBe(6)
    const m = (await db.stockMovements.toArray())[0]!
    expect(m.quantity).toBe(-4)
    expect(m.reason).toBe('recount')
  })

  it('is a no-op when newQuantity equals current on-hand (no movement)', async () => {
    await recordAdjustment({ stockBatchId: 'batch-1', newQuantity: 10, reasonCode: 'miscount', performedBy: 'u1' })
    expect(await db.stockMovements.count()).toBe(0)
  })

  it('rejects a negative newQuantity', async () => {
    await expect(
      recordAdjustment({ stockBatchId: 'batch-1', newQuantity: -1, reasonCode: 'miscount', performedBy: 'u1' }),
    ).rejects.toThrow()
  })

  it('throws for an unknown batch', async () => {
    await expect(
      recordAdjustment({ stockBatchId: 'nope', newQuantity: 5, reasonCode: 'miscount', performedBy: 'u1' }),
    ).rejects.toThrow()
  })

  it('enqueues a sync entry for the movement', async () => {
    await recordAdjustment({ stockBatchId: 'batch-1', newQuantity: 12, reasonCode: 'system_error', performedBy: 'u1' })
    const entries = await db.syncQueue.where('resourceType').equals('StockMovement').toArray()
    expect(entries.length).toBeGreaterThanOrEqual(1)
  })
})
