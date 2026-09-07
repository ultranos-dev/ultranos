import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const mockGetOrders = vi.fn()
const mockGetAllCustomers = vi.fn()
const mockPharmacySettingsFirst = vi.fn()

vi.mock('@/lib/wholesale/sales-order-service', () => ({ getOrders: (...a: unknown[]) => mockGetOrders(...a) }))
vi.mock('@/lib/wholesale/customer-service', () => ({ getAllCustomers: (...a: unknown[]) => mockGetAllCustomers(...a) }))
vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toCollection: () => ({ first: () => mockPharmacySettingsFirst() }),
    },
  },
}))

import { OrdersPage } from '@/components/pharmacy/wholesale/OrdersPage'

const BASE_ORDERS = [
  {
    id: 'o1',
    orderNumber: 'SO-1',
    customerId: 'c1',
    status: 'draft' as const,
    lines: [],
    subtotal: 0,
    taxRate: 0,
    taxAmount: 0,
    total: 0,
    createdBy: 'u1',
    createdAt: '2026-09-06',
    hlcTimestamp: '0',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOrders.mockResolvedValue(BASE_ORDERS)
  mockGetAllCustomers.mockResolvedValue([{ id: 'c1', name: 'Kabul Medical Supplies', isActive: true, createdAt: '2026-01-01' }])
  mockPharmacySettingsFirst.mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 })
})

describe('OrdersPage', () => {
  it('renders heading and shows an order row', async () => {
    render(<OrdersPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
  })

  it('renders customer name (not raw UUID) in the customer column', async () => {
    render(<OrdersPage />)
    await waitFor(() => expect(screen.getByText('Kabul Medical Supplies')).toBeInTheDocument())
    expect(screen.queryByText('c1')).not.toBeInTheDocument()
  })

  it('falls back to customerId when customer name is not found', async () => {
    mockGetAllCustomers.mockResolvedValue([]) // no customers
    render(<OrdersPage />)
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
    expect(screen.getByText('c1')).toBeInTheDocument()
  })

  it('formats total as currency using pharmacySettings (integer minor units)', async () => {
    mockGetOrders.mockResolvedValue([
      { ...BASE_ORDERS[0], total: 25000 }, // 250.00 AFN
    ])
    render(<OrdersPage />)
    await waitFor(() => expect(screen.getByText('AFN 250.00')).toBeInTheDocument())
  })

  it('renders the search input in the toolbar', async () => {
    render(<OrdersPage />)
    const searchInput = screen.getByRole('searchbox')
    expect(searchInput).toBeInTheDocument()
  })

  it('renders "New order" link in the toolbar', async () => {
    render(<OrdersPage />)
    // i18n mock returns the key string
    const link = screen.getByRole('link', { name: /newOrder/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/wholesale/orders/new')
  })

  it('renders status pill-tabs', async () => {
    render(<OrdersPage />)
    // All tab is always visible
    const allTab = screen.getByRole('button', { name: /ordersTabAll/i })
    expect(allTab).toBeInTheDocument()
  })

  it('filters orders by status tab', async () => {
    mockGetOrders.mockResolvedValue([
      { id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'draft' as const, lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'u1', createdAt: '2026-09-06', hlcTimestamp: '0' },
      { id: 'o2', orderNumber: 'SO-2', customerId: 'c2', status: 'confirmed' as const, lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 25000, createdBy: 'u1', createdAt: '2026-09-06', hlcTimestamp: '1' },
    ])
    render(<OrdersPage />)
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /ordersTabDraft/i }))
    expect(screen.queryByText('SO-2')).not.toBeInTheDocument()
    expect(screen.getByText('SO-1')).toBeInTheDocument()
  })

  it('filters orders by search query', async () => {
    mockGetOrders.mockResolvedValue([
      { id: 'o1', orderNumber: 'SO-1', customerId: 'c1', status: 'draft' as const, lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'u1', createdAt: '2026-09-06', hlcTimestamp: '0' },
      { id: 'o2', orderNumber: 'SO-999', customerId: 'c2', status: 'confirmed' as const, lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 25000, createdBy: 'u1', createdAt: '2026-09-06', hlcTimestamp: '1' },
    ])
    render(<OrdersPage />)
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'SO-999' } })
    expect(screen.queryByText('SO-1')).not.toBeInTheDocument()
    expect(screen.getByText('SO-999')).toBeInTheDocument()
  })

  it('shows empty state when no orders match', async () => {
    mockGetOrders.mockResolvedValue([])
    render(<OrdersPage />)
    await waitFor(() => {
      expect(screen.getByText('noOrders')).toBeInTheDocument()
    })
  })

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <OrdersPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <OrdersPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('SO-1')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
