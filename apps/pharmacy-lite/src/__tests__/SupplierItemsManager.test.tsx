import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SupplierItemsManager } from '@/components/pharmacy/inventory/SupplierItemsManager'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const getSupplierItemsForCatalogItem = vi.fn()
const upsertSupplierItem = vi.fn().mockResolvedValue({ id: 'new' })
vi.mock('@/lib/procurement/supplier-item-service', () => ({
  getSupplierItemsForCatalogItem: () => getSupplierItemsForCatalogItem(),
  upsertSupplierItem: (...a: unknown[]) => upsertSupplierItem(...a),
  setPreferredSupplier: vi.fn().mockResolvedValue(undefined),
  removeSupplierItem: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/procurement/supplier-service', () => ({ getActiveSuppliers: async () => [{ id: 'sup1', name: 'Acme' }, { id: 'sup2', name: 'Globex' }], getSupplierById: async (id: string) => ({ id, name: id === 'sup1' ? 'Acme' : 'Globex' }) }))
vi.mock('@/lib/db', () => ({ db: { pharmacySettings: { toCollection: () => ({ first: async () => ({ currencyMinorUnits: 2 }) }) } } }))

beforeEach(() => { getSupplierItemsForCatalogItem.mockReset(); upsertSupplierItem.mockClear() })

describe('SupplierItemsManager', () => {
  it('lists existing links and adds a new one', async () => {
    getSupplierItemsForCatalogItem.mockResolvedValue([{ id: 'si1', supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 500, isPreferred: true, createdBy: 'u', createdAt: 'h', hlcTimestamp: 'h' }])
    render(<SupplierItemsManager catalogItemId="cat1" performedBy="u1" />)
    expect(await screen.findByText('Acme')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('si-supplier-select'), { target: { value: 'sup2' } })
    fireEvent.click(screen.getByTestId('si-add-btn'))
    await waitFor(() => expect(upsertSupplierItem).toHaveBeenCalled())
  })
  it('shows empty state with no links', async () => {
    getSupplierItemsForCatalogItem.mockResolvedValue([])
    render(<SupplierItemsManager catalogItemId="cat1" performedBy="u1" />)
    expect(await screen.findByText('supplierItemsEmpty')).toBeInTheDocument()
  })
})
