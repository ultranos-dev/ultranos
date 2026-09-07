import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const mockGetAll = vi.fn()
vi.mock('@/lib/wholesale/customer-service', () => ({
  getAllCustomers: (...a: unknown[]) => mockGetAll(...a),
  createCustomer: vi.fn(),
}))

import { CustomersPage } from '@/components/pharmacy/wholesale/CustomersPage'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAll.mockResolvedValue([
    { id: 'c1', name: 'Kabul Pharma', isActive: true, createdAt: '2026-09-06' },
  ])
})

describe('CustomersPage', () => {
  it('renders a full-width heading and lists customers', async () => {
    render(<CustomersPage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())
  })

  it('renders the search input in the toolbar', async () => {
    render(<CustomersPage />)
    const searchInput = screen.getByRole('searchbox')
    expect(searchInput).toBeInTheDocument()
  })

  it('renders "New customer" button in the toolbar', async () => {
    render(<CustomersPage />)
    // i18n mock returns key string
    expect(screen.getByRole('button', { name: /newCustomer/i })).toBeInTheDocument()
  })

  it('filters customers by search query', async () => {
    mockGetAll.mockResolvedValue([
      { id: 'c1', name: 'Kabul Pharma', isActive: true, createdAt: '2026-09-06' },
      { id: 'c2', name: 'Herat Drugs', isActive: true, createdAt: '2026-09-06' },
    ])
    render(<CustomersPage />)
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Herat' } })
    expect(screen.queryByText('Kabul Pharma')).not.toBeInTheDocument()
    expect(screen.getByText('Herat Drugs')).toBeInTheDocument()
  })

  it('shows empty state when no customers match', async () => {
    mockGetAll.mockResolvedValue([])
    render(<CustomersPage />)
    await waitFor(() => {
      // EmptyState renders the title — i18n mock returns key
      expect(screen.getByText('noCustomers')).toBeInTheDocument()
    })
  })

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <CustomersPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <CustomersPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Kabul Pharma')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
