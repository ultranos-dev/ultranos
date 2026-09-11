import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createSupplierInvoice, findDuplicateInvoice, getInvoicesForPO } from '@/lib/procurement/supplier-invoice-service'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.syncQueue]) await t.clear()
})

async function seedPO() {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  return po
}

describe('createSupplierInvoice', () => {
  it('computes totals, inherits supplier from PO, stores pending + enqueues sync', async () => {
    const po = await seedPO()
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'SUP-1', createdBy: 'u1', taxRate: 5, freight: 200,
      items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }] })
    expect(inv.supplierId).toBe('s1')
    expect(inv.subtotal).toBe(800)
    expect(inv.taxAmount).toBe(40)
    expect(inv.total).toBe(1040)
    expect(inv.status).toBe('pending')
    const entries = await db.syncQueue.where('resourceType').equals('SupplierInvoice').toArray()
    expect(entries.some((e) => e.resourceId === inv.id && e.action === 'create')).toBe(true)
  })

  it('findDuplicateInvoice detects a same-supplier same-number invoice', async () => {
    const po = await seedPO()
    await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'DUP-9', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 1, unitPrice: 100 }] })
    expect(await findDuplicateInvoice('s1', 'DUP-9')).toBeTruthy()
    expect(await findDuplicateInvoice('s1', 'OTHER')).toBeUndefined()
  })

  it('getInvoicesForPO returns invoices for that PO', async () => {
    const po = await seedPO()
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'X', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 1, unitPrice: 100 }] })
    expect((await getInvoicesForPO(po.id)).map((i) => i.id)).toContain(inv.id)
  })
})
