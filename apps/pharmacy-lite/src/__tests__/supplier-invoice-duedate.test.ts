import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { createSupplierInvoice } from '@/lib/procurement/supplier-invoice-service'
import { createPurchaseOrder } from '@/lib/procurement/purchase-order-service'
import { createSupplier } from '@/lib/procurement/supplier-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

async function seedPo(supplierId: string) {
  return createPurchaseOrder({
    supplierId, supplierName: 'Acme',
    items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }],
    createdBy: 'u1',
  })
}

describe('createSupplierInvoice settlement defaults', () => {
  it('initializes amountPaid=0 and settlementStatus=unpaid', async () => {
    const supplier = await createSupplier({ name: 'Acme' })
    const po = await seedPo(supplier.id)
    const inv = await createSupplierInvoice({
      purchaseOrderId: po.id, invoiceNumber: 'S1',
      items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }],
      createdBy: 'u1',
    })
    expect(inv.amountPaid).toBe(0)
    expect(inv.settlementStatus).toBe('unpaid')
    expect(inv.dueDate).toBeDefined()
  })

  it('defaults dueDate to createdAt + supplier.paymentTermsDays', async () => {
    const supplier = await createSupplier({ name: 'Acme', paymentTermsDays: 30 })
    const po = await seedPo(supplier.id)
    const inv = await createSupplierInvoice({
      purchaseOrderId: po.id, invoiceNumber: 'S2',
      items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }],
      createdBy: 'u1',
    })
    const expected = new Date(new Date(inv.createdAt).getTime() + 30 * 86_400_000).toISOString()
    expect(inv.dueDate).toBe(expected)
  })

  it('honours an explicit dueDate param', async () => {
    const supplier = await createSupplier({ name: 'Acme', paymentTermsDays: 30 })
    const po = await seedPo(supplier.id)
    const inv = await createSupplierInvoice({
      purchaseOrderId: po.id, invoiceNumber: 'S3', dueDate: '2026-05-01T00:00:00.000Z',
      items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }],
      createdBy: 'u1',
    })
    expect(inv.dueDate).toBe('2026-05-01T00:00:00.000Z')
  })
})
