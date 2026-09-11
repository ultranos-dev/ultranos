import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PurchaseOrdersPage } from '@/components/pharmacy/procurement/PurchaseOrdersPage'
import { PurchaseOrderDetailPage } from '@/components/pharmacy/procurement/PurchaseOrderDetailPage'
import type { PurchaseOrder } from '@/lib/procurement/types'

// Override the global next-intl mock so useTranslations returns real strings
// from the en.json messages when components are wrapped in NextIntlClientProvider.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return actual
})

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'po-1' }), useRouter: () => ({ push: vi.fn() }) }))

const PO: PurchaseOrder = {
  id: 'po-1', poNumber: 'PO-KBL01-2026-0007', supplierId: 's1', supplierName: 'Acme', status: 'draft',
  items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 0, unitCost: 100 }],
  subtotal: 900, taxRate: 5, taxAmount: 45, freight: 300, totalCost: 1245,
  createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => { await db.purchaseOrders.clear(); await db.pharmacySettings.clear(); await db.goodsReceipts.clear(); await db.purchaseOrders.put(PO) })

describe('PO number + breakdown display', () => {
  it('list shows the poNumber', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrdersPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByText('PO-KBL01-2026-0007')).toBeInTheDocument())
  })
  it('detail shows the poNumber and a grand-total breakdown row', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><PurchaseOrderDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByText(/PO-KBL01-2026-0007/)).toBeInTheDocument())
    // The label renders as "{detailGrandTotal}: " inside a span; use regex to match
    expect(screen.getByText(new RegExp(en.purchaseOrders.detailGrandTotal))).toBeInTheDocument()
  })
})
