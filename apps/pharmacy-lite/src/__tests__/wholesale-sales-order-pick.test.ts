import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createDraft, confirm, pickOrder } from '@/lib/wholesale/sales-order-service'
import type { StockBatch } from '@/lib/inventory/types'

function batch(over: Partial<StockBatch>): StockBatch {
  return { id: 'b', catalogItemId: 'i1', batchNumber: 'B', expiryDate: '2027-01-01', quantityOnHand: 100,
    costPrice: 0, sellingPrice: 0, receivedAt: '2026-01-01', status: 'active', locationId: 'loc', hlcTimestamp: '0', ...over }
}

beforeEach(async () => { await db.delete(); await db.open() })

describe('pickOrder FEFO allocation', () => {
  it('allocates across batches earliest-expiry-first', async () => {
    await db.stockBatches.bulkPut([
      batch({ id: 'b-late', expiryDate: '2027-06-01', quantityOnHand: 40 }),
      batch({ id: 'b-early', expiryDate: '2026-12-01', quantityOnHand: 20 }),
    ])
    const order = await createDraft({ customerId: 'c1', taxRate: 0, createdBy: 'u1',
      lines: [{ catalogItemId: 'i1', description: 'x', unit: 'each', quantity: 50, unitPrice: 10, packSize: 1 }] })
    await confirm(order.id)
    const picked = await pickOrder(order.id)
    expect(picked.status).toBe('picking')
    // 20 from earliest, then 30 from the later batch
    expect(picked.lines[0]!.batchAllocations).toEqual([
      { stockBatchId: 'b-early', qty: 20 },
      { stockBatchId: 'b-late', qty: 30 },
    ])
  })

  it('sets shortStock:false when stock fully covers the line', async () => {
    await db.stockBatches.put(batch({ id: 'b-full', quantityOnHand: 100 }))
    const order = await createDraft({ customerId: 'c1', taxRate: 0, createdBy: 'u1',
      lines: [{ catalogItemId: 'i1', description: 'x', unit: 'each', quantity: 30, unitPrice: 10, packSize: 1 }] })
    await confirm(order.id)
    const picked = await pickOrder(order.id)
    expect(picked.lines[0]!.shortStock).toBe(false)
  })

  it('sets shortStock:true when available stock is less than the line baseUnits', async () => {
    await db.stockBatches.put(batch({ id: 'b-partial', quantityOnHand: 10 }))
    const order = await createDraft({ customerId: 'c1', taxRate: 0, createdBy: 'u1',
      lines: [{ catalogItemId: 'i1', description: 'x', unit: 'each', quantity: 50, unitPrice: 10, packSize: 1 }] })
    await confirm(order.id)
    const picked = await pickOrder(order.id)
    expect(picked.lines[0]!.shortStock).toBe(true)
    // Only 10 units allocated out of 50 requested
    const totalAllocated = picked.lines[0]!.batchAllocations.reduce((s, a) => s + a.qty, 0)
    expect(totalAllocated).toBe(10)
  })

  it('sets shortStock:true when there is zero stock for the item', async () => {
    // No stock batches for this item
    const order = await createDraft({ customerId: 'c1', taxRate: 0, createdBy: 'u1',
      lines: [{ catalogItemId: 'i1', description: 'x', unit: 'each', quantity: 20, unitPrice: 10, packSize: 1 }] })
    await confirm(order.id)
    const picked = await pickOrder(order.id)
    expect(picked.lines[0]!.shortStock).toBe(true)
    expect(picked.lines[0]!.batchAllocations).toHaveLength(0)
  })
})
