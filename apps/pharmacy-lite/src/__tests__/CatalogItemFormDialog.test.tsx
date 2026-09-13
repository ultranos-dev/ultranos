import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — at top level before component imports
// ---------------------------------------------------------------------------

const mockCreateCatalogItem = vi.fn().mockResolvedValue({ id: 'new-id' })
const mockUpdateCatalogItem = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/inventory/catalog-item-service', () => ({
  createCatalogItem: (...a: unknown[]) => mockCreateCatalogItem(...a),
  updateCatalogItem: (...a: unknown[]) => mockUpdateCatalogItem(...a),
}))

vi.mock('@/lib/db', () => ({
  db: {
    pharmacySettings: {
      toCollection: () => ({
        first: vi.fn().mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 }),
      }),
    },
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
}))

// Mock auth session store using the same pattern as PharmacyDashboard.test.tsx
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        session: {
          userId: 'u1',
          practitionerId: 'p1',
          role: 'PHARMACIST',
          sessionId: 's1',
          email: 'pharm@test.com',
        },
        isAuthenticated: true,
      }),
    {
      getState: () => ({
        session: {
          userId: 'u1',
          practitionerId: 'p1',
          role: 'PHARMACIST',
          sessionId: 's1',
          email: 'pharm@test.com',
        },
        isAuthenticated: true,
      }),
    },
  ),
}))

// Mock supplier-item-service so the embedded SupplierItemsManager renders without error
vi.mock('@/lib/procurement/supplier-item-service', () => ({
  getSupplierItemsForCatalogItem: vi.fn().mockResolvedValue([]),
  upsertSupplierItem: vi.fn().mockResolvedValue({}),
  setPreferredSupplier: vi.fn().mockResolvedValue(undefined),
  removeSupplierItem: vi.fn().mockResolvedValue(undefined),
}))

// Mock supplier-service so the embedded manager's getActiveSuppliers resolves cleanly
vi.mock('@/lib/procurement/supplier-service', () => ({
  getActiveSuppliers: vi.fn().mockResolvedValue([]),
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import { CatalogItemFormDialog } from '@/components/pharmacy/inventory/CatalogItemFormDialog'
import type { CatalogItem } from '@/lib/inventory/types'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const editItem: CatalogItem = {
  id: 'item-1',
  name: 'Amoxicillin 500mg',
  form: 'capsule',
  strength: '500',
  strengthUnit: 'mg',
  packSize: 10,
  category: 'antibiotic',
  defaultSellingPrice: 500,
  reorderPoint: 5,
  reorderQuantity: 50,
  isActive: true,
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
  locallyModified: false,
  source: 'hub',
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateCatalogItem.mockResolvedValue({ id: 'new-id' })
  mockUpdateCatalogItem.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(props: {
  open?: boolean
  item?: CatalogItem
  onSaved?: () => void
  onOpenChange?: (o: boolean) => void
}) {
  const onSaved = props.onSaved ?? vi.fn()
  const onOpenChange = props.onOpenChange ?? vi.fn()
  return render(
    <CatalogItemFormDialog
      open={props.open ?? true}
      onOpenChange={onOpenChange}
      item={props.item}
      onSaved={onSaved}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CatalogItemFormDialog — create mode', () => {
  it('renders a name input and submit button when open', async () => {
    renderDialog({})
    await waitFor(() => {
      expect(screen.getByTestId('catalog-form-name')).toBeInTheDocument()
      expect(screen.getByTestId('catalog-form-submit')).toBeInTheDocument()
    })
  })

  it('renders the reorderQuantity field', async () => {
    renderDialog({})
    await waitFor(() => {
      expect(screen.getByTestId('catalog-form-reorder-quantity')).toBeInTheDocument()
    })
  })

  it('does NOT show the SupplierItemsManager section when creating (no item id)', async () => {
    renderDialog({})
    await waitFor(() => {
      expect(screen.getByTestId('catalog-form-name')).toBeInTheDocument()
    })
    // suppliersForItem is the translation key returned by our mock
    expect(screen.queryByText('suppliersForItem')).not.toBeInTheDocument()
  })

  it('calls createCatalogItem with defaultSellingPrice in minor units on valid submit', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onSaved })

    await waitFor(() => expect(screen.getByTestId('catalog-form-name')).toBeInTheDocument())

    // Fill required fields
    await user.clear(screen.getByTestId('catalog-form-name'))
    await user.type(screen.getByTestId('catalog-form-name'), 'Paracetamol 500mg')

    await user.clear(screen.getByTestId('catalog-form-price'))
    await user.type(screen.getByTestId('catalog-form-price'), '5.00')

    await user.click(screen.getByTestId('catalog-form-submit'))

    await waitFor(() => {
      expect(mockCreateCatalogItem).toHaveBeenCalledWith(
        expect.objectContaining({ defaultSellingPrice: 500 }),
      )
      expect(onSaved).toHaveBeenCalled()
    })
  })

  it('includes reorderQuantity in the createCatalogItem payload when set', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderDialog({ onSaved })

    await waitFor(() => expect(screen.getByTestId('catalog-form-name')).toBeInTheDocument())

    await user.clear(screen.getByTestId('catalog-form-name'))
    await user.type(screen.getByTestId('catalog-form-name'), 'Paracetamol 500mg')

    await user.clear(screen.getByTestId('catalog-form-reorder-quantity'))
    await user.type(screen.getByTestId('catalog-form-reorder-quantity'), '100')

    await user.click(screen.getByTestId('catalog-form-submit'))

    await waitFor(() => {
      expect(mockCreateCatalogItem).toHaveBeenCalledWith(
        expect.objectContaining({ reorderQuantity: 100 }),
      )
    })
  })

  it('shows a role="alert" error and does NOT call createCatalogItem when name is empty', async () => {
    const user = userEvent.setup()
    renderDialog({})

    await waitFor(() => expect(screen.getByTestId('catalog-form-name')).toBeInTheDocument())

    // Clear name field and submit
    await user.clear(screen.getByTestId('catalog-form-name'))
    await user.click(screen.getByTestId('catalog-form-submit'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(mockCreateCatalogItem).not.toHaveBeenCalled()
    })
  })
})

describe('CatalogItemFormDialog — edit mode', () => {
  it('pre-fills name from item and calls updateCatalogItem on submit', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderDialog({ item: editItem, onSaved })

    await waitFor(() => {
      const nameInput = screen.getByTestId('catalog-form-name') as HTMLInputElement
      expect(nameInput.value).toBe('Amoxicillin 500mg')
    })

    await user.click(screen.getByTestId('catalog-form-submit'))

    await waitFor(() => {
      expect(mockUpdateCatalogItem).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ name: 'Amoxicillin 500mg' }),
      )
      expect(onSaved).toHaveBeenCalled()
    })
  })

  it('pre-fills reorderQuantity from item', async () => {
    renderDialog({ item: editItem })

    await waitFor(() => {
      const input = screen.getByTestId('catalog-form-reorder-quantity') as HTMLInputElement
      expect(input.value).toBe('50')
    })
  })

  it('includes reorderQuantity in the updateCatalogItem payload', async () => {
    const onSaved = vi.fn()
    const user = userEvent.setup()
    renderDialog({ item: editItem, onSaved })

    await waitFor(() => expect(screen.getByTestId('catalog-form-name')).toBeInTheDocument())

    await user.click(screen.getByTestId('catalog-form-submit'))

    await waitFor(() => {
      expect(mockUpdateCatalogItem).toHaveBeenCalledWith(
        'item-1',
        expect.objectContaining({ reorderQuantity: 50 }),
      )
    })
  })

  it('shows the SupplierItemsManager section header (suppliersForItem) when editing', async () => {
    renderDialog({ item: editItem })

    await waitFor(() => {
      // The i18n mock returns the key string; suppliersForItem is the h3 in SupplierItemsManager
      expect(screen.getByText('suppliersForItem')).toBeInTheDocument()
    })
  })
})
