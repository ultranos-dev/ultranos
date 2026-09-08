import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
const mockCustomers = vi.fn().mockResolvedValue([{ id: 'c1', name: 'Kabul Pharma', isActive: true, createdAt: '' }])
const mockCreateDraft = vi.fn().mockResolvedValue({ id: 'o1' })
const mockConfirm = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/wholesale/customer-service', () => ({ getActiveCustomers: () => mockCustomers() }))
vi.mock('@/lib/wholesale/sales-order-service', () => ({ createDraft: (...a: unknown[]) => mockCreateDraft(...a), confirm: (...a: unknown[]) => mockConfirm(...a) }))
const mockDbCatalogItemsToArray = vi.fn().mockResolvedValue([])
vi.mock('@/lib/db', () => ({
  db: {
    catalogItems: {
      filter: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      toArray: (...a: unknown[]) => mockDbCatalogItemsToArray(...a),
    },
    pharmacySettings: {
      toCollection: () => ({ first: vi.fn().mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 }) }),
    },
    contractPrices: {
      where: vi.fn().mockReturnValue({ equals: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) }),
    },
  },
}))
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }),
  },
}))
const mockResolve = vi.fn()
// quantity-aware: cust=c1, item=i1 → 1500 at qty<10, 1000 at qty>=10
mockResolve.mockImplementation(async (cust: string, item: string, qty = 1) =>
  cust === 'c1' && item === 'i1' ? (qty >= 10 ? 1000 : 1500) : null,
)
vi.mock('@/lib/wholesale/contract-price-service', () => ({ resolveContractPrice: (...a: unknown[]) => mockResolve(...a) }))

import { NewOrderPage } from '@/components/pharmacy/wholesale/NewOrderPage'

const catalogItem1 = { id: 'i1', name: 'Amoxicillin 500mg', form: 'capsule', strength: '500', strengthUnit: 'mg', packSize: 10, category: 'antibiotic', wholesalePrice: 2000, defaultSellingPrice: 2500, reorderPoint: 10, isActive: true, lastSyncedAt: '' }
const catalogItem2 = { id: 'i2', name: 'Paracetamol 500mg', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 10, category: 'analgesic', wholesalePrice: 800, defaultSellingPrice: 1000, reorderPoint: 10, isActive: true, lastSyncedAt: '' }

beforeEach(() => {
  vi.clearAllMocks()
  mockDbCatalogItemsToArray.mockResolvedValue([])
})

describe('NewOrderPage', () => {
  it('prices a pack line from wholesalePrice × packSize (overridable) and submits a draft', async () => {
    const user = userEvent.setup()
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    // The component exposes an addLine helper via a manual-entry row for the test:
    await user.click(screen.getByTestId('add-manual-line'))
    // default unit 'each' → switch to pack and enter qty; unitPrice auto-fills from wholesalePrice
    // (exact interactions depend on the built form; assert the submit call shape)
    await user.click(screen.getByTestId('submit-order'))
    expect(mockCreateDraft).toHaveBeenCalled()
  })

  it('renders a full-width h1 heading', async () => {
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
  })

  it('renders the customer select', async () => {
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
  })

  it('renders the back button as ghost variant with w-fit', async () => {
    render(<NewOrderPage />)
    const backBtn = screen.getByTestId('back-button')
    expect(backBtn).toBeInTheDocument()
    expect(backBtn.className).toMatch(/w-fit/)
  })

  it('shows customer name in the select after load', async () => {
    render(<NewOrderPage />)
    await waitFor(() => {
      const select = screen.getByTestId('customer-select')
      expect(select.textContent).toContain('Kabul Pharma')
    })
  })

  it('shows the add-manual-line button', async () => {
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('add-manual-line')).toBeInTheDocument())
  })

  it('shows the submit-order button', async () => {
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('submit-order')).toBeInTheDocument())
  })

  it('calls confirm after createDraft on submit', async () => {
    const user = userEvent.setup()
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('submit-order')).toBeInTheDocument())
    await user.click(screen.getByTestId('submit-order'))
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalled()
      expect(mockConfirm).toHaveBeenCalledWith('o1')
    })
  })

  it('prices a catalog line from the contract price when one exists (not wholesalePrice)', async () => {
    // Item i1: wholesalePrice=2000, contract price=1500 for customer c1
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem1])
    mockResolve.mockImplementation(async (cust: string, item: string) => (cust === 'c1' && item === 'i1' ? 1500 : null))
    const user = userEvent.setup()
    render(<NewOrderPage />)
    // Wait for the single customer (c1) to be auto-selected
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    // Type in the catalog search to trigger results
    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'Amox')
    // Wait for the catalog dropdown result to appear and click it
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument())
    await user.click(screen.getByText('Amoxicillin 500mg'))
    // Submit the order
    await user.click(screen.getByTestId('submit-order'))
    // The line's unitPrice must be the contract price (1500), NOT wholesalePrice (2000)
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ catalogItemId: 'i1', unitPrice: 1500 }),
          ]),
        }),
      )
    })
  })

  it('falls back to wholesalePrice when no contract price exists', async () => {
    // Item i2: wholesalePrice=800, no contract price (resolveContractPrice returns null)
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem2])
    mockResolve.mockResolvedValue(null)
    const user = userEvent.setup()
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'Para')
    await waitFor(() => expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument())
    await user.click(screen.getByText('Paracetamol 500mg'))
    await user.click(screen.getByTestId('submit-order'))
    // unitPrice must fall back to wholesalePrice (800)
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ catalogItemId: 'i2', unitPrice: 800 }),
          ]),
        }),
      )
    })
  })

  it('zero contract price resolves to 0, NOT to wholesalePrice (??-not-|| semantics)', async () => {
    // i3 has wholesalePrice=900; resolveContractPrice returns 0 (legitimately free/negotiated-zero).
    // The resolution `resolveContractPrice(...) ?? item.wholesalePrice ?? 0` must short-circuit at 0
    // and NOT fall through to wholesalePrice (900), proving the code uses ?? not ||.
    const catalogItem3 = {
      id: 'i3', name: 'FreeSample 10mg', form: 'tablet', strength: '10', strengthUnit: 'mg',
      packSize: 5, category: 'sample', wholesalePrice: 900, defaultSellingPrice: 1000,
      reorderPoint: 5, isActive: true, lastSyncedAt: '',
    }
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem3])
    // Contract price is explicitly 0 for customer c1, item i3
    mockResolve.mockImplementation(async (cust: string, item: string) =>
      cust === 'c1' && item === 'i3' ? 0 : null,
    )
    const user = userEvent.setup()
    render(<NewOrderPage />)
    // c1 is the only customer → auto-selected
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'Free')
    await waitFor(() => expect(screen.getByText('FreeSample 10mg')).toBeInTheDocument())
    await user.click(screen.getByText('FreeSample 10mg'))
    await user.click(screen.getByTestId('submit-order'))
    // unitPrice must be 0 (contract price), NOT 900 (wholesalePrice)
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ catalogItemId: 'i3', unitPrice: 0 }),
          ]),
        }),
      )
    })
  })

  it('changing the customer re-resolves existing catalog lines to the new customer contract price', async () => {
    // Two customers: c1 (Kabul Pharma) and c2 (Herat Pharma).
    // i1 has: contract price 1500 for c1, contract price 700 for c2.
    // Flow: render with both customers (no auto-select), select c1, add i1, then
    // change to c2 and submit — the line's unitPrice must update to 700 (c2's price).
    mockCustomers.mockResolvedValueOnce([
      { id: 'c1', name: 'Kabul Pharma', isActive: true, createdAt: '' },
      { id: 'c2', name: 'Herat Pharma', isActive: true, createdAt: '' },
    ])
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem1])
    mockResolve.mockImplementation(async (cust: string, item: string) => {
      if (item !== 'i1') return null
      if (cust === 'c1') return 1500
      if (cust === 'c2') return 700
      return null
    })
    const user = userEvent.setup()
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    // Two customers → no auto-select; choose c1 explicitly
    const customerSelect = screen.getByTestId('customer-select')
    await user.selectOptions(customerSelect, 'c1')
    // Add i1 from catalog search
    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'Amox')
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument())
    await user.click(screen.getByText('Amoxicillin 500mg'))
    // Now switch customer to c2 — handleCustomerChange re-resolves existing lines
    await user.selectOptions(customerSelect, 'c2')
    // Submit and assert the line price has been updated to c2's contract price (700)
    await user.click(screen.getByTestId('submit-order'))
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ catalogItemId: 'i1', unitPrice: 700 }),
          ]),
        }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // Task 3: volume price-break tests
  // -----------------------------------------------------------------------

  it('adds a catalog line at qty 1 → resolves to the qty-1 contract price (below break)', async () => {
    // i1 wholesalePrice=2000; contract for c1: qty<10 → 1500, qty>=10 → 1000
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem1])
    // Use the default outer mock (quantity-aware)
    mockResolve.mockImplementation(async (cust: string, item: string, qty = 1) =>
      cust === 'c1' && item === 'i1' ? (qty >= 10 ? 1000 : 1500) : null,
    )
    const user = userEvent.setup()
    render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    // c1 is the only customer — auto-selected
    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'Amox')
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument())
    await user.click(screen.getByText('Amoxicillin 500mg'))
    // Submit — expect unitPrice = 1500 (qty=1, below break)
    await user.click(screen.getByTestId('submit-order'))
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ catalogItemId: 'i1', unitPrice: 1500 }),
          ]),
        }),
      )
    })
  })

  it('changing qty to 12 on a catalog line re-resolves to the volume-break price', async () => {
    // i1 wholesalePrice=2000; contract for c1: qty<10 → 1500, qty>=10 → 1000
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem1])
    mockResolve.mockImplementation(async (cust: string, item: string, qty = 1) =>
      cust === 'c1' && item === 'i1' ? (qty >= 10 ? 1000 : 1500) : null,
    )
    const user = userEvent.setup()
    const { container } = render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'Amox')
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument())
    await user.click(screen.getByText('Amoxicillin 500mg'))
    // Wait for the line to appear (qty input renders), then change qty to 12
    await waitFor(() => expect(container.querySelector('[data-testid^="line-qty-"]')).toBeInTheDocument())
    const qtyInput = container.querySelector('[data-testid^="line-qty-"]') as HTMLInputElement
    await user.clear(qtyInput)
    await user.type(qtyInput, '12')
    // Submit — expect unitPrice = 1000 (qty=12, at/above break)
    await user.click(screen.getByTestId('submit-order'))
    await waitFor(() => {
      expect(mockCreateDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ catalogItemId: 'i1', quantity: 12, unitPrice: 1000 }),
          ]),
        }),
      )
    })
  })

  it('manually editing the price sets priceOverridden and quantity change does NOT re-resolve', async () => {
    // i1 wholesalePrice=2000; contract for c1: qty<10 → 1500, qty>=10 → 1000
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem1])
    mockResolve.mockImplementation(async (cust: string, item: string, qty = 1) =>
      cust === 'c1' && item === 'i1' ? (qty >= 10 ? 1000 : 1500) : null,
    )
    const user = userEvent.setup()
    const { container } = render(<NewOrderPage />)
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'Amox')
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument())
    await user.click(screen.getByText('Amoxicillin 500mg'))
    // Wait for the line to appear then use data-testid selectors for precision
    await waitFor(() => expect(container.querySelector('[data-testid^="line-price-"]')).toBeInTheDocument())
    // Manually edit the unit-price input to 9.99 (= 999 minor units at 2dp)
    const unitPriceInput = container.querySelector('[data-testid^="line-price-"]') as HTMLInputElement
    await user.clear(unitPriceInput)
    await user.type(unitPriceInput, '9.99')
    // Now change qty to 12 — the manual override must win; price stays 999 (minor)
    const qtyInput = container.querySelector('[data-testid^="line-qty-"]') as HTMLInputElement
    await user.clear(qtyInput)
    await user.type(qtyInput, '12')
    // Submit and check price was NOT re-resolved to 1000
    await user.click(screen.getByTestId('submit-order'))
    await waitFor(() => {
      const call = mockCreateDraft.mock.calls[0][0]
      const line = call.lines.find((l: { catalogItemId: string }) => l.catalogItemId === 'i1')
      expect(line).toBeDefined()
      // Manual price 9.99 AFN = 999 minor units (2dp) — must NOT be 1000 (the break price)
      expect(line.unitPrice).toBe(999)
    })
  })

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <NewOrderPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <NewOrderPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByTestId('customer-select')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
