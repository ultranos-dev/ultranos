import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const mockGetPurchaseOrders = vi.fn()
const mockPharmacySettingsFirst = vi.fn()

vi.mock('@/lib/procurement/purchase-order-service', () => ({
  getPurchaseOrders: (...a: unknown[]) => mockGetPurchaseOrders(...a),
}))
vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toCollection: () => ({ first: () => mockPharmacySettingsFirst() }),
    },
  },
}))

import { PurchaseOrdersPage } from '@/components/pharmacy/procurement/PurchaseOrdersPage'

const BASE_POS = [
  {
    id: 'po-abc123def456',
    supplierId: 's1',
    supplierName: 'Kabul Medical Supplies',
    status: 'draft' as const,
    items: [],
    totalCost: 0,
    createdBy: 'u1',
    createdAt: '2026-09-08T10:00:00Z',
    hlcTimestamp: '0',
  },
  {
    id: 'po-xyz789uvw012',
    supplierId: 's2',
    supplierName: 'Herat Pharma Distributors',
    status: 'sent' as const,
    items: [],
    totalCost: 50000,
    createdBy: 'u1',
    createdAt: '2026-09-07T09:00:00Z',
    hlcTimestamp: '1',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPurchaseOrders.mockResolvedValue(BASE_POS)
  mockPharmacySettingsFirst.mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 })
})

describe('PurchaseOrdersPage', () => {
  it('renders heading and lists both POs by supplier name', async () => {
    render(<PurchaseOrdersPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Kabul Medical Supplies')).toBeInTheDocument())
    expect(screen.getByText('Herat Pharma Distributors')).toBeInTheDocument()
  })

  it('renders the PO id (short) in the first column', async () => {
    render(<PurchaseOrdersPage />)
    await waitFor(() => expect(screen.getByText('abc123')).toBeInTheDocument())
  })

  it('renders the status badge for each PO', async () => {
    render(<PurchaseOrdersPage />)
    // i18n mock returns key string — purchaseOrders.statusDraft / purchaseOrders.statusSent
    await waitFor(() => expect(screen.getByText('statusDraft')).toBeInTheDocument())
    expect(screen.getByText('statusSent')).toBeInTheDocument()
  })

  it('formats totalCost via formatAmount using pharmacySettings', async () => {
    mockGetPurchaseOrders.mockResolvedValue([
      { ...BASE_POS[0], totalCost: 25000 }, // 250.00 AFN
    ])
    render(<PurchaseOrdersPage />)
    await waitFor(() => expect(screen.getByText('AFN 250.00')).toBeInTheDocument())
  })

  it('renders the search input in the toolbar', async () => {
    render(<PurchaseOrdersPage />)
    const searchInput = screen.getByRole('searchbox')
    expect(searchInput).toBeInTheDocument()
  })

  it('renders "New purchase order" link in the toolbar targeting /inventory/orders/new', async () => {
    render(<PurchaseOrdersPage />)
    // i18n mock returns key string: newPurchaseOrder
    const link = screen.getByRole('link', { name: /newPurchaseOrder/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/inventory/orders/new')
  })

  it('renders status pill-tabs including All tab', async () => {
    render(<PurchaseOrdersPage />)
    const allTab = screen.getByRole('button', { name: /tabAll/i })
    expect(allTab).toBeInTheDocument()
  })

  it('filters POs by status tab', async () => {
    render(<PurchaseOrdersPage />)
    await waitFor(() => expect(screen.getByText('Kabul Medical Supplies')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /tabDraft/i }))
    expect(screen.queryByText('Herat Pharma Distributors')).not.toBeInTheDocument()
    expect(screen.getByText('Kabul Medical Supplies')).toBeInTheDocument()
  })

  it('filters POs by supplierName search query', async () => {
    render(<PurchaseOrdersPage />)
    await waitFor(() => expect(screen.getByText('Kabul Medical Supplies')).toBeInTheDocument())

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Herat' } })
    expect(screen.queryByText('Kabul Medical Supplies')).not.toBeInTheDocument()
    expect(screen.getByText('Herat Pharma Distributors')).toBeInTheDocument()
  })

  it('shows empty state when no POs match', async () => {
    mockGetPurchaseOrders.mockResolvedValue([])
    render(<PurchaseOrdersPage />)
    await waitFor(() => {
      expect(screen.getByText('noPurchaseOrders')).toBeInTheDocument()
    })
  })

  it('row links to the PO detail page', async () => {
    render(<PurchaseOrdersPage />)
    await waitFor(() => expect(screen.getByText('abc123')).toBeInTheDocument())
    const link = screen.getByRole('link', { name: 'abc123' })
    expect(link).toHaveAttribute('href', '/inventory/orders/po-abc123def456')
  })

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <PurchaseOrdersPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Kabul Medical Supplies')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <PurchaseOrdersPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Kabul Medical Supplies')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
