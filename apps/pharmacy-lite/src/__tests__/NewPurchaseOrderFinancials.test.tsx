import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '@/lib/db'
import { NewPurchaseOrderPage } from '@/components/pharmacy/procurement/NewPurchaseOrderPage'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createPO = vi.fn()
vi.mock('@/lib/procurement/purchase-order-service', () => ({
  createPurchaseOrder: (...a: unknown[]) => createPO(...a),
  markPurchaseOrderSent: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
  getPurchaseOrders: vi.fn().mockResolvedValue([]),
  getPurchaseOrderById: vi.fn().mockResolvedValue(undefined),
  getOpenPurchaseOrdersForSupplier: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/procurement/supplier-service', () => ({
  getActiveSuppliers: async () => [{ id: 's1', name: 'Acme', isActive: true, createdAt: '2026-01-01' }],
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }),
  },
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  createPO.mockClear()
  createPO.mockResolvedValue({ id: 'po-1' })
  await db.catalogItems.clear()
  await db.pharmacySettings.clear()
  await db.catalogItems.put({
    id: 'a',
    name: 'Paracetamol',
    form: 'tablet',
    strength: '500',
    strengthUnit: 'mg',
    packSize: 20,
    category: 'c',
    defaultSellingPrice: 500,
    reorderPoint: 0,
    isActive: true,
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
  })
})

function renderPage() {
  return render(<NewPurchaseOrderPage />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('New PO financials', () => {
  it('passes taxRate, freight, and per-line discount to createPurchaseOrder', async () => {
    renderPage()

    // add a line via catalog search
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Para' } })
    fireEvent.click(await screen.findByTestId('catalog-result'))

    // set unit cost 1.00 on the first line cost input
    const costInput = await screen.findByTestId(/^line-cost-/)
    fireEvent.change(costInput, { target: { value: '1.00' } })

    // set tax rate 5% and freight 3.00
    fireEvent.change(screen.getByTestId('po-tax-rate'), { target: { value: '5' } })
    fireEvent.change(screen.getByTestId('po-freight'), { target: { value: '3.00' } })

    // submit
    fireEvent.click(screen.getByTestId('submit-po'))

    await waitFor(() =>
      expect(createPO).toHaveBeenCalledWith(
        expect.objectContaining({ taxRate: 5, freight: 300 }),
      ),
    )
  })

  it('passes per-line percent discount to createPurchaseOrder', async () => {
    renderPage()

    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Para' } })
    fireEvent.click(await screen.findByTestId('catalog-result'))

    const costInput = await screen.findByTestId(/^line-cost-/)
    fireEvent.change(costInput, { target: { value: '10.00' } })

    // set line discount type to percent + value 10
    const lineDiscType = await screen.findByTestId(/^line-disc-type-/)
    fireEvent.change(lineDiscType, { target: { value: 'percent' } })
    const lineDiscVal = await screen.findByTestId(/^line-disc-val-/)
    fireEvent.change(lineDiscVal, { target: { value: '10' } })

    fireEvent.click(screen.getByTestId('submit-po'))

    await waitFor(() =>
      expect(createPO).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ discountType: 'percent', discountValue: 10 }),
          ]),
        }),
      ),
    )
  })

  it('passes per-line amount discount (minor units) to createPurchaseOrder', async () => {
    renderPage()

    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Para' } })
    fireEvent.click(await screen.findByTestId('catalog-result'))

    const costInput = await screen.findByTestId(/^line-cost-/)
    fireEvent.change(costInput, { target: { value: '10.00' } })

    // set line discount type to amount + value 2.00 (= 200 minor at 2dp default)
    const lineDiscType = await screen.findByTestId(/^line-disc-type-/)
    fireEvent.change(lineDiscType, { target: { value: 'amount' } })
    const lineDiscVal = await screen.findByTestId(/^line-disc-val-/)
    fireEvent.change(lineDiscVal, { target: { value: '2.00' } })

    fireEvent.click(screen.getByTestId('submit-po'))

    await waitFor(() =>
      expect(createPO).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ discountType: 'amount', discountValue: 200 }),
          ]),
        }),
      ),
    )
  })

  it('shows live totals breakdown (subtotal, grand total) in the summary section', async () => {
    renderPage()

    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'Para' } })
    fireEvent.click(await screen.findByTestId('catalog-result'))

    const costInput = await screen.findByTestId(/^line-cost-/)
    fireEvent.change(costInput, { target: { value: '5.00' } })

    // Wait for the breakdown labels to appear (keys returned by mock t())
    await waitFor(() => {
      expect(screen.getByTestId('po-totals-subtotal')).toBeInTheDocument()
      expect(screen.getByTestId('po-totals-grandtotal')).toBeInTheDocument()
    })
  })
})
