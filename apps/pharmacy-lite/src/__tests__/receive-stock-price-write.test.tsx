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
  useAuthSessionStore: (fn: (s: { session: { practitionerId: string } }) => unknown) =>
    fn({ session: { practitionerId: 'pract-1' } }),
}))

const mockCatalogItemWithAtc: CatalogItem = {
  id: 'cat-1',
  name: 'Metronidazole',
  form: 'tablet',
  strength: '400',
  strengthUnit: 'mg',
  packSize: 100,
  category: 'Antiprotozoals',
  defaultSellingPrice: 3500,
  reorderPoint: 50,
  isActive: true,
  lastSyncedAt: '2026-06-01T00:00:00Z',
  atcCode: 'P01AB01',
}

const mockCatalogItemNoAtc: CatalogItem = {
  ...mockCatalogItemWithAtc,
  id: 'cat-2',
  name: 'Unknown Drug',
  atcCode: undefined,
}

// Use a mutable ref so each test can control which item gets selected
let catalogItemToSelect: CatalogItem = mockCatalogItemWithAtc

vi.mock('@/components/pharmacy/inventory/CatalogSearchInput', () => ({
  CatalogSearchInput: ({ onSelect }: { onSelect: (item: CatalogItem) => void }) => (
    <button data-testid="add-item" onClick={() => onSelect(catalogItemToSelect)}>
      Add item
    </button>
  ),
}))

describe('ReceiveStockForm — price write on receipt', () => {
  beforeEach(() => {
    mockProcessGoodsReceipt.mockReset()
    mockSetDrugPrice.mockReset()
    mockProcessGoodsReceipt.mockResolvedValue(undefined)
    mockSetDrugPrice.mockResolvedValue(undefined)
    catalogItemToSelect = mockCatalogItemWithAtc  // reset to default
  })

  async function fillAndSubmit(locationId = 'fac-uuid-1234', onComplete = vi.fn()) {
    render(<ReceiveStockForm locationId={locationId} currencyMinorUnits={2} onComplete={onComplete} />)
    fireEvent.click(screen.getByTestId('add-item'))
    await waitFor(() => screen.getByTestId('receive-item-0'))
    fireEvent.change(screen.getByLabelText(/batchNoRequired/i), { target: { value: 'BATCH-001' } })
    fireEvent.change(screen.getByLabelText(/expiryDateRequired/i), { target: { value: '2028-12-31' } })
    fireEvent.change(screen.getByLabelText(/quantityRequired/i), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/costPriceRequired/i), { target: { value: '25.00' } })
    fireEvent.change(screen.getByLabelText(/sellingPriceRequired/i), { target: { value: '35.50' } })
    fireEvent.click(screen.getByTestId('confirm-receipt-btn'))
  }

  it('calls setDrugPrice with atcCode and converted sellingPrice after successful receipt', async () => {
    await fillAndSubmit()
    await waitFor(() => expect(mockProcessGoodsReceipt).toHaveBeenCalledOnce())
    expect(mockSetDrugPrice).toHaveBeenCalledWith({
      atcCode: 'P01AB01',
      facilityId: 'fac-uuid-1234',
      retailPrice: 35.5,
      stockSignal: 'in_stock',
      doseForm: 'tablet',
    })
  })

  it('does not call setDrugPrice when catalogItem has no atcCode', async () => {
    catalogItemToSelect = mockCatalogItemNoAtc
    await fillAndSubmit()
    await waitFor(() => expect(mockProcessGoodsReceipt).toHaveBeenCalledOnce())
    expect(mockSetDrugPrice).not.toHaveBeenCalled()
  })

  it('calls onComplete even if setDrugPrice would fail (best-effort)', async () => {
    mockSetDrugPrice.mockRejectedValueOnce(new Error('Hub down'))
    const onComplete = vi.fn()
    await fillAndSubmit('fac-1', onComplete)
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce())
  })
})
