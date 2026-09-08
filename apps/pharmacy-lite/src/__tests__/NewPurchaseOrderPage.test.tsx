import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — must be at top level before any imports of the component
// ---------------------------------------------------------------------------

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockGetActiveSuppliers = vi.fn().mockResolvedValue([
  { id: 's1', name: 'Al-Shifa Pharma Supplies', isActive: true, createdAt: '' },
])
vi.mock('@/lib/procurement/supplier-service', () => ({
  getActiveSuppliers: (...a: unknown[]) => mockGetActiveSuppliers(...a),
}))

const mockCreatePurchaseOrder = vi.fn().mockResolvedValue({ id: 'po-001' })
vi.mock('@/lib/procurement/purchase-order-service', () => ({
  createPurchaseOrder: (...a: unknown[]) => mockCreatePurchaseOrder(...a),
  // re-export other functions so existing tests importing this module still work
  markPurchaseOrderSent: vi.fn(),
  recordReceiptAgainstPO: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
  getPurchaseOrders: vi.fn().mockResolvedValue([]),
  getPurchaseOrderById: vi.fn().mockResolvedValue(undefined),
  getOpenPurchaseOrdersForSupplier: vi.fn().mockResolvedValue([]),
}))

const mockDbCatalogItemsToArray = vi.fn().mockResolvedValue([])
vi.mock('@/lib/db', () => ({
  db: {
    catalogItems: {
      toArray: (...a: unknown[]) => mockDbCatalogItemsToArray(...a),
    },
    pharmacySettings: {
      toCollection: () => ({ first: vi.fn().mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 }) }),
    },
  },
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ getPractitionerRef: () => 'Practitioner/p1' }),
  },
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import { NewPurchaseOrderPage } from '@/components/pharmacy/procurement/NewPurchaseOrderPage'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const catalogItem1 = {
  id: 'cat-1',
  name: 'Amoxicillin 500mg',
  nameLocal: undefined,
  form: 'capsule' as const,
  strength: '500',
  strengthUnit: 'mg',
  packSize: 10,
  category: 'antibiotic',
  wholesalePrice: 2000,
  defaultSellingPrice: 2500,
  reorderPoint: 10,
  isActive: true,
  lastSyncedAt: '',
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockGetActiveSuppliers.mockResolvedValue([
    { id: 's1', name: 'Al-Shifa Pharma Supplies', isActive: true, createdAt: '' },
  ])
  mockCreatePurchaseOrder.mockResolvedValue({ id: 'po-001' })
  mockDbCatalogItemsToArray.mockResolvedValue([])
  mockPush.mockClear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NewPurchaseOrderPage', () => {
  it('renders a full-width h1 heading', async () => {
    render(<NewPurchaseOrderPage />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
  })

  it('renders the back button as ghost variant with w-fit', async () => {
    render(<NewPurchaseOrderPage />)
    const backBtn = screen.getByTestId('back-button')
    expect(backBtn).toBeInTheDocument()
    expect(backBtn.className).toMatch(/w-fit/)
  })

  it('renders the supplier select and populates it', async () => {
    render(<NewPurchaseOrderPage />)
    await waitFor(() => {
      const select = screen.getByTestId('supplier-select')
      expect(select).toBeInTheDocument()
      expect(select.textContent).toContain('Al-Shifa Pharma Supplies')
    })
  })

  it('renders the submit button', async () => {
    render(<NewPurchaseOrderPage />)
    await waitFor(() => expect(screen.getByTestId('submit-po')).toBeInTheDocument())
  })

  it('renders the add-manual-line button', async () => {
    render(<NewPurchaseOrderPage />)
    await waitFor(() => expect(screen.getByTestId('add-manual-line')).toBeInTheDocument())
  })

  // -------------------------------------------------------------------------
  // Core contract: select supplier + add catalog line → submit → correct call
  // -------------------------------------------------------------------------

  it('calls createPurchaseOrder with correct payload and navigates to detail', async () => {
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem1])
    const user = userEvent.setup()
    const { container } = render(<NewPurchaseOrderPage />)

    // Wait for supplier select (s1 auto-selected as single supplier)
    await waitFor(() => expect(screen.getByTestId('supplier-select')).toBeInTheDocument())

    // Add from catalog search
    const catalogSearch = screen.getByRole('searchbox')
    await user.type(catalogSearch, 'Amox')
    await waitFor(() => {
      expect(container.querySelector('[data-testid="catalog-result"]')).toBeInTheDocument()
    })
    await user.click(container.querySelector('[data-testid="catalog-result"]') as HTMLButtonElement)

    // Update unit cost (major units → 10.00 AFN = 1000 minor at 2dp)
    await waitFor(() => expect(container.querySelector('[data-testid^="line-cost-"]')).toBeInTheDocument())
    const costInput = container.querySelector('[data-testid^="line-cost-"]') as HTMLInputElement
    await user.clear(costInput)
    await user.type(costInput, '10.00')

    // Submit
    await user.click(screen.getByTestId('submit-po'))

    await waitFor(() => {
      expect(mockCreatePurchaseOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 's1',
          supplierName: 'Al-Shifa Pharma Supplies',
          items: expect.arrayContaining([
            expect.objectContaining({
              catalogItemId: 'cat-1',
              catalogItemName: 'Amoxicillin 500mg',
              quantityOrdered: 1,
              unitCost: 1000,
            }),
          ]),
          createdBy: 'Practitioner/p1',
        }),
      )
      expect(mockPush).toHaveBeenCalledWith('/inventory/orders/po-001')
    })
  })

  // -------------------------------------------------------------------------
  // Simplified submit test: manual line
  // -------------------------------------------------------------------------

  it('submits a manual line with correct supplierId, supplierName, unitCost (minor), and navigates', async () => {
    const user = userEvent.setup()
    const { container } = render(<NewPurchaseOrderPage />)

    await waitFor(() => expect(screen.getByTestId('supplier-select')).toBeInTheDocument())
    // s1 is auto-selected (single supplier)

    // Add a manual line
    await user.click(screen.getByTestId('add-manual-line'))

    // Fill in unit cost = 5.50 AFN → 550 minor units (2dp)
    await waitFor(() => expect(container.querySelector('[data-testid^="line-cost-"]')).toBeInTheDocument())
    const costInput = container.querySelector('[data-testid^="line-cost-"]') as HTMLInputElement
    await user.clear(costInput)
    await user.type(costInput, '5.50')

    // Submit
    await user.click(screen.getByTestId('submit-po'))

    await waitFor(() => {
      expect(mockCreatePurchaseOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 's1',
          supplierName: 'Al-Shifa Pharma Supplies',
          items: expect.arrayContaining([
            expect.objectContaining({ unitCost: 550 }),
          ]),
          createdBy: 'Practitioner/p1',
        }),
      )
      expect(mockPush).toHaveBeenCalledWith('/inventory/orders/po-001')
    })
  })

  it('shows error if no supplier is selected', async () => {
    // Override: return empty suppliers so nothing is auto-selected
    mockGetActiveSuppliers.mockResolvedValue([])
    const user = userEvent.setup()
    render(<NewPurchaseOrderPage />)
    await waitFor(() => expect(screen.getByTestId('submit-po')).toBeInTheDocument())
    await user.click(screen.getByTestId('submit-po'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(mockCreatePurchaseOrder).not.toHaveBeenCalled()
  })

  it('shows error and does not submit when a supplier is chosen but no line items added', async () => {
    // s1 auto-selected (single supplier); submit with zero line items
    const user = userEvent.setup()
    render(<NewPurchaseOrderPage />)
    await waitFor(() => expect(screen.getByTestId('supplier-select')).toBeInTheDocument())
    await user.click(screen.getByTestId('submit-po'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(mockCreatePurchaseOrder).not.toHaveBeenCalled()
  })

  it('auto-selects the single supplier on load', async () => {
    render(<NewPurchaseOrderPage />)
    await waitFor(() => {
      const select = screen.getByTestId('supplier-select') as HTMLSelectElement
      expect(select.value).toBe('s1')
    })
  })

  it('adds a catalog line and shows it in the table', async () => {
    mockDbCatalogItemsToArray.mockResolvedValue([catalogItem1])
    const user = userEvent.setup()
    const { container } = render(<NewPurchaseOrderPage />)
    await waitFor(() => expect(screen.getByTestId('supplier-select')).toBeInTheDocument())

    const searchInput = screen.getByRole('searchbox')
    await user.type(searchInput, 'Amox')
    await waitFor(() => expect(screen.getByText('Amoxicillin 500mg')).toBeInTheDocument())
    await user.click(screen.getByText('Amoxicillin 500mg'))

    // After clicking, the item name populates the text input in the table row
    await waitFor(() => {
      const nameInputs = container.querySelectorAll('input[type="text"]')
      const found = Array.from(nameInputs).some(
        (el) => (el as HTMLInputElement).value === 'Amoxicillin 500mg',
      )
      expect(found).toBe(true)
    })
  })

  it('LTR snapshot', async () => {
    const { container } = render(
      <div dir="ltr">
        <NewPurchaseOrderPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByTestId('supplier-select')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('RTL snapshot', async () => {
    const { container } = render(
      <div dir="rtl">
        <NewPurchaseOrderPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByTestId('supplier-select')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
