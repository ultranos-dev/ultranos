import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CatalogBrowsePage } from '@/components/pharmacy/inventory/CatalogBrowsePage'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const { activeItem, inactiveItem } = vi.hoisted(() => ({
  activeItem: {
    id: 'a1', name: 'Amoxicillin', form: 'capsule', strength: '500', strengthUnit: 'mg',
    packSize: 10, category: 'antibiotic', defaultSellingPrice: 500, reorderPoint: 5,
    isActive: true, lastSyncedAt: '', source: 'local', locallyModified: true,
  },
  inactiveItem: {
    id: 'i1', name: 'Retiredine', form: 'tablet', strength: '100', strengthUnit: 'mg',
    packSize: 20, category: 'legacy', defaultSellingPrice: 200, reorderPoint: 0,
    isActive: false, lastSyncedAt: '', source: 'local', locallyModified: true,
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    catalogItems: { toArray: vi.fn().mockResolvedValue([activeItem, inactiveItem]) },
    pharmacySettings: {
      toCollection: () => ({ first: vi.fn().mockResolvedValue({ currency: 'AFN', currencyMinorUnits: 2 }) }),
    },
  },
}))

vi.mock('@/hooks/useCatalogSync', () => ({ useCatalogSync: vi.fn() }))
vi.mock('@/hooks/useDrugCatalogSync', () => ({ useDrugCatalogSync: vi.fn() }))
vi.mock('@/stores/inventory-store', () => ({ useInventoryStore: (fn: (s: { isSyncingCatalog: boolean }) => boolean) => fn({ isSyncingCatalog: false }) }))
vi.mock('@/lib/inventory/fefo', () => ({ getTotalStockOnHand: vi.fn().mockResolvedValue(0) }))

const mockReactivate = vi.fn()
vi.mock('@/lib/inventory/catalog-item-service', () => ({
  createCatalogItem: vi.fn(),
  updateCatalogItem: vi.fn(),
  deactivateCatalogItem: vi.fn(),
  reactivateCatalogItem: (...a: unknown[]) => mockReactivate(...a),
}))

vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(),
  reportAuthEvent: vi.fn(),
  searchDrugCatalog: vi.fn().mockResolvedValue([]),
  setDrugPrice: vi.fn(),
}))

describe('CatalogBrowsePage — active/inactive filter + reactivate', () => {
  beforeEach(() => { mockReactivate.mockReset() })

  it('hides inactive items under the default Active filter', async () => {
    render(<CatalogBrowsePage />)
    await waitFor(() => expect(screen.getByText('Amoxicillin')).toBeTruthy())
    expect(screen.queryByText('Retiredine')).toBeNull() // inactive hidden by default
  })

  it('shows the inactive item + a Reactivate action after switching to All', async () => {
    render(<CatalogBrowsePage />)
    await waitFor(() => expect(screen.getByText('Amoxicillin')).toBeTruthy())

    // switch the pill filter to "All"
    fireEvent.click(screen.getByRole('tab', { name: 'filterAll' }))

    await waitFor(() => expect(screen.getByText('Retiredine')).toBeTruthy())
    // the inactive row exposes a Reactivate button (active row shows Deactivate)
    expect(screen.getByText('reactivate')).toBeTruthy()
  })

  it('calls reactivateCatalogItem when Reactivate is clicked', async () => {
    render(<CatalogBrowsePage />)
    await waitFor(() => expect(screen.getByText('Amoxicillin')).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: 'filterAll' }))
    await waitFor(() => expect(screen.getByText('Retiredine')).toBeTruthy())

    fireEvent.click(screen.getByText('reactivate'))
    await waitFor(() => expect(mockReactivate).toHaveBeenCalledWith('i1'))
  })
})
