import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReceiveStockForm } from '@/components/pharmacy/inventory/ReceiveStockForm'
import type { CatalogItem } from '@/lib/inventory/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const { mockProcessGoodsReceipt } = vi.hoisted(() => ({
  mockProcessGoodsReceipt: vi.fn(),
}))

vi.mock('@/lib/inventory/goods-receipt-service', () => ({
  processGoodsReceipt: mockProcessGoodsReceipt,
}))

const { mockSetDrugPrice } = vi.hoisted(() => ({
  mockSetDrugPrice: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(),
  reportAuthEvent: vi.fn(),
  searchDrugCatalog: vi.fn(),
  setDrugPrice: mockSetDrugPrice,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (fn: (s: { session: { practitionerId: string; userId: string } }) => unknown) =>
    fn({ session: { practitionerId: 'pract-1', userId: 'user-1' } }),
}))

vi.mock('@/stores/location-store', () => ({
  useLocationStore: (sel: (s: { locations: unknown[]; currentLocationId: string }) => unknown) =>
    sel({
      locations: [{ id: 'main', name: 'Main', isPrimary: true, isActive: true }],
      currentLocationId: 'main',
    }),
}))

const mockCatalogItemWithAtc: CatalogItem = {
  id: 'cat-loc-1',
  name: 'Amoxicillin',
  form: 'capsule',
  strength: '500',
  strengthUnit: 'mg',
  packSize: 50,
  category: 'antibiotics',
  defaultSellingPrice: 2000,
  reorderPoint: 10,
  isActive: true,
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
  atcCode: 'J01CA04',
}

vi.mock('@/components/pharmacy/inventory/CatalogSearchInput', () => ({
  CatalogSearchInput: ({ onSelect }: { onSelect: (item: CatalogItem) => void }) => (
    <button data-testid="add-item" onClick={() => onSelect(mockCatalogItemWithAtc)}>
      Add item
    </button>
  ),
}))

describe('ReceiveStockForm — sub-location tagging', () => {
  beforeEach(() => {
    mockProcessGoodsReceipt.mockReset()
    mockSetDrugPrice.mockReset()
    mockProcessGoodsReceipt.mockResolvedValue(undefined)
    mockSetDrugPrice.mockResolvedValue(undefined)
  })

  it('tags processGoodsReceipt with the resolved sub-location and setDrugPrice with the facility prop', async () => {
    render(
      <ReceiveStockForm
        locationId="facility-x"
        currencyMinorUnits={2}
        onComplete={vi.fn()}
      />,
    )

    // Add a line item
    fireEvent.click(screen.getByTestId('add-item'))
    await waitFor(() => screen.getByTestId('receive-item-0'))

    // Fill required fields to make isValid true
    fireEvent.change(screen.getByLabelText(/batchNoRequired/i), { target: { value: 'BATCH-LOC-001' } })
    fireEvent.change(screen.getByLabelText(/expiryDateRequired/i), { target: { value: '2029-06-30' } })
    fireEvent.change(screen.getByLabelText(/quantityRequired/i), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/costPriceRequired/i), { target: { value: '15.00' } })
    fireEvent.change(screen.getByLabelText(/sellingPriceRequired/i), { target: { value: '20.00' } })

    fireEvent.click(screen.getByTestId('confirm-receipt-btn'))

    await waitFor(() => expect(mockProcessGoodsReceipt).toHaveBeenCalledOnce())

    // processGoodsReceipt must use the RESOLVED sub-location ('main'), not the prop ('facility-x')
    expect(mockProcessGoodsReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'main' }),
    )

    // setDrugPrice must still use the FACILITY PROP ('facility-x'), not the sub-location
    // (binding decoupling constraint)
    await waitFor(() =>
      expect(mockSetDrugPrice).not.toHaveBeenCalledWith(
        expect.objectContaining({ facilityId: 'main' }),
      ),
    )
    expect(mockSetDrugPrice).toHaveBeenCalledWith(
      expect.objectContaining({ facilityId: 'facility-x' }),
    )
  })
})
