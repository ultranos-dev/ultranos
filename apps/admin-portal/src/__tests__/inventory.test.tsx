import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock supabase (required by TopHeader) ───────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// ── Mock auth session store (required by TopHeader) ─────────
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// ── Mock next/navigation ────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/inventory',
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockGetInventoryOverview = vi.fn()
const mockGetRedistributionRecommendations = vi.fn()
const mockListPurchaseOrders = vi.fn()
const mockListSuppliers = vi.fn()
const mockUpdateOrderStatus = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getInventoryOverview: { query: (...args: any[]) => mockGetInventoryOverview(...args) },
      getRedistributionRecommendations: { query: (...args: any[]) => mockGetRedistributionRecommendations(...args) },
      listPurchaseOrders: { query: (...args: any[]) => mockListPurchaseOrders(...args) },
      listSuppliers: { query: (...args: any[]) => mockListSuppliers(...args) },
      updateOrderStatus: { mutate: (...args: any[]) => mockUpdateOrderStatus(...args) },
      createPurchaseOrder: { mutate: vi.fn() },
      createSupplier: { mutate: vi.fn() },
      updateSupplier: { mutate: vi.fn() },
    },
  },
}))

const { default: InventoryPage } = await import('../app/inventory/page')

const MOCK_OVERVIEW = {
  labs: [
    { id: 'lab-1', name: 'Lab Alpha' },
    { id: 'lab-2', name: 'Lab Beta' },
  ],
  reagentCategories: ['Malaria RDT', 'CBC'],
  cells: [
    { labId: 'lab-1', labName: 'Lab Alpha', reagentCategory: 'Malaria RDT', quantity: 0, unit: 'tests', reportedAt: '2026-05-30T10:00:00Z', stockLevel: 'RED' },
    { labId: 'lab-1', labName: 'Lab Alpha', reagentCategory: 'CBC', quantity: 5, unit: 'tests', reportedAt: '2026-05-30T10:00:00Z', stockLevel: 'AMBER' },
    { labId: 'lab-2', labName: 'Lab Beta', reagentCategory: 'Malaria RDT', quantity: 50, unit: 'tests', reportedAt: '2026-05-30T10:00:00Z', stockLevel: 'GREEN' },
  ],
}

const MOCK_RECOMMENDATIONS = {
  recommendations: [
    { targetLabId: 'lab-1', targetLabName: 'Lab Alpha', sourceLabId: 'lab-2', sourceLabName: 'Lab Beta', reagentCategory: 'Malaria RDT', sourceQuantity: 50 },
  ],
}

const MOCK_ORDERS = {
  orders: [
    { id: 'po-1', supplierId: 'sup-1', supplierName: 'Acme Medical', items: [], status: 'REQUESTED', totalItems: 3, notes: null, createdAt: '2026-05-28T10:00:00Z' },
  ],
  total: 1,
}

beforeEach(() => {
  mockGetInventoryOverview.mockResolvedValue(MOCK_OVERVIEW)
  mockGetRedistributionRecommendations.mockResolvedValue(MOCK_RECOMMENDATIONS)
  mockListPurchaseOrders.mockResolvedValue(MOCK_ORDERS)
  mockListSuppliers.mockResolvedValue({ suppliers: [{ id: 'sup-1', name: 'Acme Medical' }] })
})

describe('Inventory Page — Heat Map', () => {
  it('renders heat map with correct stock level colors', async () => {
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Lab Alpha').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Lab Beta').length).toBeGreaterThan(0)
    })

    // RED cell (0 tests)
    const redCell = screen.getByText('0 tests')
    expect(redCell.className).toContain('bg-danger-subtle')

    // AMBER cell (5 tests)
    const amberCell = screen.getByText('5 tests')
    expect(amberCell.className).toContain('bg-warning-subtle')

    // GREEN cell (50 tests)
    const greenCell = screen.getByText('50 tests')
    expect(greenCell.className).toContain('bg-success-subtle')
  })

  it('renders redistribution recommendations', async () => {
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getByText(/has 0 Malaria RDT/)).toBeInTheDocument()
    })

    expect(screen.getByText(/has 50/)).toBeInTheDocument()
  })

  it('renders reagent category column headers', async () => {
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Malaria RDT').length).toBeGreaterThan(0)
      expect(screen.getAllByText('CBC').length).toBeGreaterThan(0)
    })
  })
})

describe('Inventory Page — Purchase Orders Tab', () => {
  it('switches to Purchase Orders tab and renders table', async () => {
    const user = userEvent.setup()
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getByText('Heat Map')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Purchase Orders'))

    await waitFor(() => {
      expect(screen.getByText('Acme Medical')).toBeInTheDocument()
      expect(screen.getByText('Requested')).toBeInTheDocument()
    })
  })

  it('shows advance status button for non-terminal orders', async () => {
    const user = userEvent.setup()
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getByText('Heat Map')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Purchase Orders'))

    await waitFor(() => {
      expect(screen.getByText('→ APPROVED')).toBeInTheDocument()
    })
  })
})

describe('Inventory Page — Header', () => {
  it('renders page title and create button', async () => {
    render(<InventoryPage />)

    await waitFor(() => {
      expect(screen.getByText('Inventory Overview')).toBeInTheDocument()
      expect(screen.getByText('Create Purchase Order')).toBeInTheDocument()
    })
  })
})
