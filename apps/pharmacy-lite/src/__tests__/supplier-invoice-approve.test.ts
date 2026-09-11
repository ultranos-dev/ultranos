import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createSupplierInvoice, approveSupplierInvoice, disputeSupplierInvoice, InvoiceVarianceUnresolvedError } from '@/lib/procurement/supplier-invoice-service'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import type { CatalogItem } from '@/lib/inventory/types'

const ITEM: CatalogItem = { id: 'a', name: 'A', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.catalogItems, db.stockBatches, db.stockMovements, db.goodsReceipts, db.syncQueue]) await t.clear()
  await db.catalogItems.put(ITEM)
})

async function poReceived(qty: number) {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: qty, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: qty, costPrice: 100, sellingPrice: 200 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  return po
}

describe('approve/dispute supplier invoice', () => {
  it('a matched invoice approves with no override reason', async () => {
    const po = await poReceived(8)
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'M1', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }] })
    await approveSupplierInvoice(inv.id, 'approver')
    expect((await db.supplierInvoices.get(inv.id))!.status).toBe('approved')
  })

  it('a variance invoice throws without an override reason, approves with one', async () => {
    const po = await poReceived(8)
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'V1', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 10, unitPrice: 100 }] }) // over-billed
    await expect(approveSupplierInvoice(inv.id, 'approver')).rejects.toBeInstanceOf(InvoiceVarianceUnresolvedError)
    await approveSupplierInvoice(inv.id, 'approver', 'accepted the extra 2 as a bonus')
    const stored = await db.supplierInvoices.get(inv.id)
    expect(stored!.status).toBe('approved')
    expect(stored!.approvedReason).toBe('accepted the extra 2 as a bonus')
  })

  it('dispute records status + reason', async () => {
    const po = await poReceived(8)
    const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'D1', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }] })
    await disputeSupplierInvoice(inv.id, 'disputer', 'price mismatch on paper copy')
    const stored = await db.supplierInvoices.get(inv.id)
    expect(stored!.status).toBe('disputed')
    expect(stored!.disputeReason).toBe('price mismatch on paper copy')
  })
})
