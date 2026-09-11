import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: (globalThis as unknown as { __poid: string }).__poid }), useRouter: () => ({ push: vi.fn() }) }))

beforeEach(async () => { for (const t of [db.purchaseOrders, db.pharmacySettings, db.goodsReceipts, db.syncQueue]) await t.clear() })

describe('PO detail record-invoice link', () => {
  it('links to the new-invoice form for a sent PO', async () => {
    const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
    await markPurchaseOrderSent(po.id, 'u1')
    ;(globalThis as unknown as { __poid: string }).__poid = po.id
    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrderDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByTestId('record-invoice-link')).toBeInTheDocument())
    expect(screen.getByTestId('record-invoice-link').getAttribute('href')).toContain(`/inventory/invoices/new?poId=${po.id}`)
  })
})
