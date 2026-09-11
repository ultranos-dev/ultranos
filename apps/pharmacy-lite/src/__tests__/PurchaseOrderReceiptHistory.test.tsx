import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import type { CatalogItem } from '@/lib/inventory/types'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: (globalThis as unknown as { __poid: string }).__poid }), useRouter: () => ({ push: vi.fn() }) }))

const ITEM: CatalogItem = { id: 'a', name: 'A', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => { for (const t of [db.purchaseOrders, db.goodsReceipts, db.stockBatches, db.stockMovements, db.catalogItems, db.pharmacySettings, db.syncQueue]) await t.clear(); await db.catalogItems.put(ITEM) })

describe('PO detail receipt history', () => {
  it('lists a posted receipt with a Reverse action', async () => {
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 5, unitCost: 100 }] })
    await markPurchaseOrderSent(po.id, 'u1')
    await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: 5, costPrice: 100, sellingPrice: 200 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
    ;(globalThis as unknown as { __poid: string }).__poid = po.id

    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrderDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByTestId('receipt-history')).toBeInTheDocument())
    expect(screen.getAllByTestId(/^reverse-receipt-/).length).toBe(1)
  })
})
