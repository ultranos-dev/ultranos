import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createDraft, confirm, pickOrder, fulfill } from '@/lib/wholesale/sales-order-service'
import { getAccountsWithBalance } from '@/lib/wholesale/customer-account-service'
import type { StockBatch } from '@/lib/inventory/types'

const b: StockBatch = {
  id: 'b1',
  catalogItemId: 'i1',
  batchNumber: 'B',
  expiryDate: '2027-01-01',
  quantityOnHand: 100,
  costPrice: 0,
  sellingPrice: 0,
  receivedAt: '2026-01-01',
  status: 'active',
  locationId: 'loc',
  hlcTimestamp: '0',
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('fulfill', () => {
  it('deducts allocated stock and posts an AR charge equal to the order total', async () => {
    await db.stockBatches.put({ ...b })
    const order = await createDraft({
      customerId: 'c1',
      taxRate: 0,
      createdBy: 'u1',
      lines: [
        {
          catalogItemId: 'i1',
          description: 'x',
          unit: 'each',
          quantity: 30,
          unitPrice: 10,
          packSize: 1,
        },
      ],
    })
    await confirm(order.id)
    await pickOrder(order.id)
    await fulfill(order.id, 'u1')

    expect((await db.stockBatches.get('b1'))!.quantityOnHand).toBe(70) // 100 - 30
    expect((await db.salesOrders.get(order.id))!.status).toBe('fulfilled')
    const bal = (await getAccountsWithBalance()).find((a) => a.customerId === 'c1')?.balance
    expect(bal).toBe(300) // 30 × 10
  })
})
