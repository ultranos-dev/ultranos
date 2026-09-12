import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'

// The global setup.ts mocks next-intl to return raw keys. Re-import the real
// next-intl so NextIntlClientProvider resolves actual message strings.
vi.mock('next-intl', async () => await vi.importActual('next-intl'))
import { db } from '@/lib/db'
import { SupplierInvoiceDetailPage } from '@/components/pharmacy/procurement/SupplierInvoiceDetailPage'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { createSupplierInvoice, approveSupplierInvoice } from '@/lib/procurement/supplier-invoice-service'
import type { CatalogItem } from '@/lib/inventory/types'

vi.mock('next/navigation', () => ({ useParams: () => ({ id: (globalThis as unknown as { __invid: string }).__invid }), useRouter: () => ({ push: vi.fn() }) }))

// Mocks for the supplier payment service — used in the settlement-panel test
const mockRecordSupplierPayment = vi.fn().mockResolvedValue({ id: 'pay-1', amount: 0 })
const mockGetPaymentsForInvoice = vi.fn().mockResolvedValue([])
vi.mock('@/lib/procurement/supplier-payment-service', () => ({
  recordSupplierPayment: (...args: unknown[]) => mockRecordSupplierPayment(...args),
  getPaymentsForInvoice: (...args: unknown[]) => mockGetPaymentsForInvoice(...args),
}))

const ITEM: CatalogItem = { id: 'a', name: 'A', form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c', defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.supplierInvoices, db.supplierPayments, db.pharmacySettings, db.catalogItems, db.stockBatches, db.stockMovements, db.goodsReceipts, db.syncQueue]) await t.clear()
  await db.catalogItems.put(ITEM)
  mockRecordSupplierPayment.mockClear()
  mockGetPaymentsForInvoice.mockClear()
  mockGetPaymentsForInvoice.mockResolvedValue([])
})

async function seedInvoice(billedQty: number) {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  await processGoodsReceipt({ items: [{ catalogItemId: 'a', batchNumber: 'B1', expiryDate: '2030-01-01', quantity: 8, costPrice: 100, sellingPrice: 200 }], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  const inv = await createSupplierInvoice({ purchaseOrderId: po.id, invoiceNumber: 'INV-1', createdBy: 'u1', items: [{ catalogItemId: 'a', catalogItemName: 'A', billedQty, unitPrice: 100 }] })
  ;(globalThis as unknown as { __invid: string }).__invid = inv.id
  return inv
}

describe('SupplierInvoiceDetailPage', () => {
  it('a matched invoice approves in one click', async () => {
    await seedInvoice(8)
    render(<NextIntlClientProvider locale="en" messages={en}><SupplierInvoiceDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByTestId('approve-invoice')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('approve-invoice'))
    await waitFor(async () => expect((await db.supplierInvoices.toArray())[0]!.status).toBe('approved'))
  })

  it('a variance invoice requires an override reason to approve', async () => {
    await seedInvoice(10) // over-billed → variance
    render(<NextIntlClientProvider locale="en" messages={en}><SupplierInvoiceDetailPage /></NextIntlClientProvider>)
    await waitFor(() => expect(screen.getByTestId('approve-invoice')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('approve-invoice'))
    // still pending — an override reason is required
    await waitFor(() => expect(screen.getByText(en.supplierInvoices.overrideRequired)).toBeInTheDocument())
    expect((await db.supplierInvoices.toArray())[0]!.status).toBe('pending')
    fireEvent.change(screen.getByTestId('override-reason'), { target: { value: 'bonus units accepted' } })
    fireEvent.click(screen.getByTestId('approve-invoice'))
    await waitFor(async () => expect((await db.supplierInvoices.toArray())[0]!.status).toBe('approved'))
  })

  it('approved unpaid invoice shows settlement section and Record payment calls recordSupplierPayment with amountDue', async () => {
    // Seed a matched invoice (billedQty=8, received=8 → total=800 minor units) then approve it
    const inv = await seedInvoice(8)
    await approveSupplierInvoice(inv.id, 'u1')

    render(<NextIntlClientProvider locale="en" messages={en}><SupplierInvoiceDetailPage /></NextIntlClientProvider>)

    // Settlement section heading must be present
    await waitFor(() => expect(screen.getByText(en.supplierInvoices.settlementSection)).toBeInTheDocument())

    // Unpaid badge
    expect(screen.getByText(en.supplierInvoices.settlementUnpaid)).toBeInTheDocument()

    // Record payment button is visible for approved + amountDue > 0
    const recordBtn = screen.getByTestId('open-invoice-payment')
    expect(recordBtn).toBeInTheDocument()
    fireEvent.click(recordBtn)

    // Dialog opens — amount input defaults to the major-unit form of amountDue (800 minor = 8.00)
    await waitFor(() => expect(screen.getByTestId('invoice-payment-amount')).toBeInTheDocument())
    const amountInput = screen.getByTestId('invoice-payment-amount') as HTMLInputElement
    expect(amountInput.value).toBe('8.00')

    // Confirm payment
    fireEvent.click(screen.getByTestId('confirm-invoice-payment'))

    await waitFor(() =>
      expect(mockRecordSupplierPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: inv.supplierId,
          allocations: [expect.objectContaining({ supplierInvoiceId: inv.id, amount: 800 })],
          method: 'cash',
        }),
      ),
    )
  })
})
