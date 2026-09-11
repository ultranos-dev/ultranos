import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { SupplierInvoicesPage } from '@/components/pharmacy/procurement/SupplierInvoicesPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { createSupplierInvoice } from '@/lib/procurement/supplier-invoice-service'
import type { CatalogItem } from '@/lib/inventory/types'

// Real next-intl so NextIntlClientProvider + messages work (same pattern as wac-display test).
vi.mock('next-intl', async () => await vi.importActual('next-intl'))

// Stub next/link — not under test.
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const ITEM: CatalogItem = { id: 'a', name: 'A', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.pharmacySettings, db.catalogItems, db.stockBatches, db.stockMovements, db.goodsReceipts, db.syncQueue]) await t.clear()
  await db.catalogItems.put(ITEM)
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: 8, costPrice: 100, sellingPrice: 200 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'SUP-100', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty: 8, unitPrice: 100 }] })
})

describe('SupplierInvoicesPage', () => {
  it('lists the invoice with a matched badge', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><SupplierInvoicesPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByText('SUP-100')).toBeInTheDocument())
    expect(screen.getByText(en.supplierInvoices.matchMatched)).toBeInTheDocument()
  })
})
