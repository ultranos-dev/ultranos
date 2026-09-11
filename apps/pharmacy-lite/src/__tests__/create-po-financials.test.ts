import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createPurchaseOrder } from '@/lib/procurement/purchase-order-service'

beforeEach(async () => { await db.purchaseOrders.clear(); await db.pharmacySettings.clear(); await db.syncQueue.clear() })

describe('createPurchaseOrder financials', () => {
  it('assigns a poNumber and computes grand total with discount + tax + freight', async () => {
    const po = await createPurchaseOrder({
      supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', taxRate: 5, freight: 300,
      items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100, discountType: 'percent', discountValue: 10 }],
    })
    expect(po.poNumber).toBe('PO-2026-0001') // seeded counter; year from creation
    expect(po.subtotal).toBe(900)   // 1000 - 10%
    expect(po.taxAmount).toBe(45)   // 5% of 900
    expect(po.freight).toBe(300)
    expect(po.totalCost).toBe(1245) // grand total
    expect(po.items[0]!.discountType).toBe('percent')
  })

  it('sequential POs get incrementing numbers', async () => {
    const a = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 1, unitCost: 100 }] })
    const b = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 1, unitCost: 100 }] })
    expect(a.poNumber).not.toBe(b.poNumber)
  })

  it('defaults taxRate from settings and freight to 0', async () => {
    await db.pharmacySettings.clear()
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 2, unitCost: 100 }] })
    expect(po.taxAmount).toBe(0)
    expect(po.freight).toBe(0)
    expect(po.totalCost).toBe(200)
  })
})
