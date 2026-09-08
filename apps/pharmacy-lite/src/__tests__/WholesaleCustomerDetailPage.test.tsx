import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }),
  },
}))

const mockGetCustomer = vi.fn().mockResolvedValue({
  id: 'c1',
  name: 'Herat Depot',
  isActive: true,
  createdAt: '',
})
vi.mock('@/lib/wholesale/customer-service', () => ({
  getCustomerById: () => mockGetCustomer(),
  updateCustomer: vi.fn(),
}))

const mockGetPrices = vi.fn().mockResolvedValue([])
const mockSet = vi.fn().mockResolvedValue({ id: 'cp1' })
vi.mock('@/lib/wholesale/contract-price-service', () => ({
  getContractPrices: () => mockGetPrices(),
  setContractPrice: (...a: unknown[]) => mockSet(...a),
  removeContractPrice: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    catalogItems: {
      toArray: vi.fn().mockResolvedValue([
        { id: 'item1', name: 'Amoxicillin 500mg' },
      ]),
    },
    pharmacySettings: {
      toCollection: () => ({
        first: vi.fn().mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 }),
      }),
    },
  },
}))

import { CustomerDetailPage } from '@/components/pharmacy/wholesale/CustomerDetailPage'

beforeEach(() => { vi.clearAllMocks() })

describe('CustomerDetailPage', () => {
  it('renders the customer name and a Contract prices section', async () => {
    render(<CustomerDetailPage />)
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())
    // i18n mock returns key string; contractPricesHeading maps to "Contract prices" in production
    expect(screen.getByText('contractPricesHeading')).toBeInTheDocument()
  })

  it('renders a back button with w-fit class', async () => {
    render(<CustomerDetailPage />)
    const backBtn = screen.getByTestId('back-button')
    expect(backBtn).toBeInTheDocument()
    expect(backBtn.className).toMatch(/w-fit/)
  })

  it('renders empty state when no contract prices', async () => {
    render(<CustomerDetailPage />)
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())
    // EmptyState for no-contract-prices renders key string via i18n mock
    expect(screen.getByText('noContractPrices')).toBeInTheDocument()
  })

  it('shows existing tier (minQuantity=10) when a contract price has tiers', async () => {
    mockGetPrices.mockResolvedValueOnce([
      {
        id: 'cp1',
        customerId: 'c1',
        catalogItemId: 'item1',
        priceMinor: 5000,
        createdBy: 'Practitioner/p1',
        createdAt: '',
        tiers: [{ minQuantity: 10, priceMinor: 1500 }],
      },
    ])
    render(<CustomerDetailPage />)
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())
    // The tier row should show the minQuantity value
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('adds a volume break and calls setContractPrice with tiers array', async () => {
    mockGetPrices.mockResolvedValue([
      {
        id: 'cp1',
        customerId: 'c1',
        catalogItemId: 'item1',
        priceMinor: 5000,
        createdBy: 'Practitioner/p1',
        createdAt: '',
        tiers: [],
      },
    ])
    render(<CustomerDetailPage />)
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())

    // Find add-tier qty input and break price input for cp1
    const qtyInput = screen.getByTestId('tier-qty-cp1')
    const priceInput = screen.getByTestId('tier-price-cp1')
    const addBtn = screen.getByTestId('tier-add-cp1')

    fireEvent.change(qtyInput, { target: { value: '20' } })
    fireEvent.change(priceInput, { target: { value: '12.00' } })
    fireEvent.click(addBtn)

    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'c1',
          catalogItemId: 'item1',
          priceMinor: 5000,
          createdBy: 'Practitioner/p1',
          tiers: expect.arrayContaining([
            expect.objectContaining({ minQuantity: 20, priceMinor: 1200 }),
          ]),
        }),
      ),
    )
  })

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <CustomerDetailPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <CustomerDetailPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('LTR snapshot with tiers', async () => {
    mockGetPrices.mockResolvedValueOnce([
      {
        id: 'cp1',
        customerId: 'c1',
        catalogItemId: 'item1',
        priceMinor: 5000,
        createdBy: 'Practitioner/p1',
        createdAt: '',
        tiers: [{ minQuantity: 10, priceMinor: 1500 }],
      },
    ])
    const { container } = render(
      <div dir="ltr">
        <CustomerDetailPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot with tiers', async () => {
    mockGetPrices.mockResolvedValueOnce([
      {
        id: 'cp1',
        customerId: 'c1',
        catalogItemId: 'item1',
        priceMinor: 5000,
        createdBy: 'Practitioner/p1',
        createdAt: '',
        tiers: [{ minQuantity: 10, priceMinor: 1500 }],
      },
    ])
    const { container } = render(
      <div dir="rtl">
        <CustomerDetailPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('Herat Depot')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
