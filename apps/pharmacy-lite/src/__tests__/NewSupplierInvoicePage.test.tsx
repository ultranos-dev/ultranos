import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { NewSupplierInvoicePage } from '@/components/pharmacy/procurement/NewSupplierInvoicePage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import type { CatalogItem } from '@/lib/inventory/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(`poId=${(globalThis as unknown as { __poid: string }).__poid}`) }))
const ITEM: CatalogItem = { id: 'a', name: 'Paracetamol', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 20, category: 'c', defaultSellingPrice: 500, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => {
  push.mockClear()
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.catalogItems, db.stockBatches, db.stockMovements, db.goodsReceipts, db.syncQueue]) await t.clear()
  await db.catalogItems.put(ITEM)
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'Paracetamol', quantityOrdered: 10, unitCost: 100, discountType: 'percent', discountValue: 10 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: 6, costPrice: 90, sellingPrice: 500 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  ;(globalThis as unknown as { __poid: string }).__poid = po.id
})

describe('NewSupplierInvoicePage', () => {
  it('prefills a line with billed = received and unit price = PO net cost, and submits', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><NewSupplierInvoicePage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByText('Paracetamol')).toBeInTheDocument())
    // billed qty default 6 (received); unit price default 0.90 (net of 10% off 1.00)
    expect((screen.getByTestId('inv-billed-a') as HTMLInputElement).value).toBe('6')
    expect((screen.getByTestId('inv-price-a') as HTMLInputElement).value).toBe('0.90')
    fireEvent.change(screen.getByTestId('inv-number'), { target: { value: 'SUP-501' } })
    fireEvent.click(screen.getByTestId('submit-invoice'))
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect((await db.supplierInvoices.toArray())[0]!.invoiceNumber).toBe('SUP-501')
  })
})
