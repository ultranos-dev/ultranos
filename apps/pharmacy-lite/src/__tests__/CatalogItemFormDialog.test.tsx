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
})
