import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createDraft } from '@/lib/wholesale/sales-order-service'

beforeEach(async () => { await db.delete(); await db.open() })

describe('createDraft', () => {
  it('computes baseUnits for pack lines and totals from lines + tax', async () => {
    const order = await createDraft({
      customerId: 'c1', taxRate: 10, createdBy: 'u1',
      lines: [
        { catalogItemId: 'i1', description: 'Amox 500', unit: 'pack', quantity: 2, unitPrice: 1000, packSize: 24 },
        { catalogItemId: 'i2', description: 'Ibu 400', unit: 'each', quantity: 5, unitPrice: 50, packSize: 30 },
      ],
    })
    expect(order.status).toBe('draft')
    expect(order.lines[0]).toMatchObject({ baseUnits: 48, lineTotal: 2000 }) // 2 packs × 24; 2 × 1000
    expect(order.lines[1]).toMatchObject({ baseUnits: 5, lineTotal: 250 })   // each
    expect(order.subtotal).toBe(2250)
    expect(order.taxAmount).toBe(225)   // 10% of 2250
    expect(order.total).toBe(2475)
    expect(order.orderNumber).toMatch(/^SO-/)
    expect(await db.salesOrders.get(order.id)).toBeTruthy()
  })
})
