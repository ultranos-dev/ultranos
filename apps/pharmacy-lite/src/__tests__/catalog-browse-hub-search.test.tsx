import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CatalogBrowsePage } from '@/components/pharmacy/inventory/CatalogBrowsePage'
import type { DrugSearchResult } from '@ultranos/shared-types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/db', () => ({
  db: {
    catalogItems: {
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}))

vi.mock('@/hooks/useCatalogSync', () => ({ useCatalogSync: vi.fn() }))
vi.mock('@/stores/inventory-store', () => ({ useInventoryStore: (fn: (s: { isSyncingCatalog: boolean }) => boolean) => fn({ isSyncingCatalog: false }) }))
vi.mock('@/lib/inventory/fefo', () => ({ getTotalStockOnHand: vi.fn().mockResolvedValue(0) }))

const { mockSearchDrugCatalog } = vi.hoisted(() => ({
  mockSearchDrugCatalog: vi.fn(),
}))

vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(),
  reportAuthEvent: vi.fn(),
  searchDrugCatalog: mockSearchDrugCatalog,
  setDrugPrice: vi.fn(),
}))

const METRO_RESULT: DrugSearchResult = {
  atcCode: 'P01AB01',
  innName: 'Metronidazole',
  brandNames: ['Flagyl'],
  therapeuticClass: 'Antiprotozoals',
  doseForms: ['Tablet 400mg'],
  localName: undefined,
}

describe('CatalogBrowsePage — Hub search fallback', () => {
  beforeEach(() => { mockSearchDrugCatalog.mockReset() })

  it('does not show Hub section when local results exist', async () => {
    // No search entered — local items shown, no Hub query
    render(<CatalogBrowsePage />)
    await waitFor(() => {})
    expect(mockSearchDrugCatalog).not.toHaveBeenCalled()
    expect(screen.queryByText(/global drug catalog/i)).toBeNull()
  })

  it('shows Hub results when local search returns nothing', async () => {
    mockSearchDrugCatalog.mockResolvedValueOnce([METRO_RESULT])
    render(<CatalogBrowsePage />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'metro' } })
    await waitFor(() => screen.getByText('Metronidazole'), { timeout: 500 })
    expect(screen.getByText('P01AB01')).toBeTruthy()
  })

  it('shows Pharmopedia link for Hub results', async () => {
    mockSearchDrugCatalog.mockResolvedValueOnce([METRO_RESULT])
    render(<CatalogBrowsePage />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'metro' } })
    await waitFor(() => screen.getByText('Metronidazole'))
    const link = screen.getByRole('link', { name: /pharmopedia/i })
    expect(link).toHaveAttribute('href', 'pharmopedia://drug/P01AB01')
  })

  it('does not query Hub for searches shorter than 2 chars', async () => {
    render(<CatalogBrowsePage />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'm' } })
    await waitFor(() => {})
    expect(mockSearchDrugCatalog).not.toHaveBeenCalled()
  })
})
