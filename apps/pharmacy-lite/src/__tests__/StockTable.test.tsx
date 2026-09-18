import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Real next-intl so NextIntlClientProvider + messages work (same pattern as StockLedgerPage / wac-display tests).
vi.mock('next-intl', async () => await vi.importActual('next-intl'))

// Stub sub-dialogs — they are not under test and have their own DB interactions.
vi.mock('@/components/pharmacy/inventory/AdjustStockDialog', () => ({
  AdjustStockDialog: () => null,
}))
vi.mock('@/components/pharmacy/inventory/DisposeStockDialog', () => ({
  DisposeStockDialog: () => null,
}))
vi.mock('@/components/pharmacy/inventory/StockHistorySheet', () => ({
  StockHistorySheet: () => null,
}))

// Stub auth session store — not under test.
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ session: null, isAuthenticated: false }),
    { getState: () => ({ session: null, isAuthenticated: false }) },
  ),
}))

// Spy-able getWac mock — returns null by default (no WAC data needed for these tests).
const mockGetWac = vi.fn().mockResolvedValue(null)
vi.mock('@/lib/inventory/valuation', () => ({
  getWac: (...args: unknown[]) => mockGetWac(...args),
}))

import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { StockTable } from '@/components/pharmacy/inventory/StockTable'
import type { StockBatch, CatalogItem } from '@/lib/inventory/types'

const ITEM: CatalogItem = {
  id: 'cat-1',
  name: 'Paracetamol',
  form: 'tablet',
  strength: '500',
  strengthUnit: 'mg',
  packSize: 20,
  category: 'analgesic',
  defaultSellingPrice: 500,
  reorderPoint: 10,
  isActive: true,
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
}

const BATCH: StockBatch = {
  id: 'batch-1',
  catalogItemId: 'cat-1',
  batchNumber: 'B001',
  expiryDate: '2030-01-01',
  quantityOnHand: 50,
  costPrice: 100,
  sellingPrice: 200,
  receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  locationId: 'default',
  hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

const DEFAULT_PROPS = {
  filterStatus: 'all' as const,
  filterLowStock: false,
  filterNearExpiry: false,
  search: '',
  filtersActive: false,
  onClearFilters: vi.fn(),
}

function renderTable(props = DEFAULT_PROPS) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <StockTable {...props} />
    </NextIntlClientProvider>,
  )
}

beforeEach(async () => {
  mockGetWac.mockReset()
  mockGetWac.mockResolvedValue(null)
  await db.stockBatches.clear()
  await db.catalogItems.clear()
  await db.pharmacySettings.clear()
})

describe('StockTable — 4-state behavior', () => {
  // (a) Loading state: while DB load is pending, the loading spinner is present
  //     and the "no stock batches" empty state is NOT shown.
  it('(a) shows loading placeholder and suppresses empty state while load is pending', async () => {
    // Hold the stockBatches.toArray() promise so loading persists during the assertion.
    let resolveLoad!: (value: StockBatch[]) => void
    const deferred = new Promise<StockBatch[]>((res) => { resolveLoad = res })

    // Patch db.stockBatches.toArray on the real db object temporarily.
    const original = db.stockBatches.toArray.bind(db.stockBatches)
    vi.spyOn(db.stockBatches, 'toArray').mockReturnValueOnce(deferred as unknown as ReturnType<typeof db.stockBatches.toArray>)

    renderTable()

    // Loading state must be visible.
    expect(screen.getByTestId('stock-table-loading')).toBeInTheDocument()
    // "no stock batches" empty state must NOT be visible while loading.
    expect(screen.queryByText('No stock batches found.')).not.toBeInTheDocument()

    // Settle the promise so the component finishes loading (cleanup).
    resolveLoad([])
    await waitFor(() =>
      expect(screen.queryByTestId('stock-table-loading')).not.toBeInTheDocument(),
    )

    // Restore original
    vi.mocked(db.stockBatches.toArray).mockRestore?.()
    void original
  })

  // (b) Error state: when the DB load rejects, stock-table-error is shown and
  //     the "no stock batches" empty state is NOT shown.
  it('(b) shows error testid and suppresses noStockBatches empty state on load failure', async () => {
    vi.spyOn(db.stockBatches, 'toArray').mockRejectedValueOnce(new Error('DB unavailable'))

    renderTable()

    await waitFor(() =>
      expect(screen.getByTestId('stock-table-error')).toBeInTheDocument(),
    )
    // The genuine empty-state title must NOT appear on error.
    expect(screen.queryByText('No stock batches found.')).not.toBeInTheDocument()
  })

  // (c) Genuine loaded-zero: when load succeeds but DB has no batches,
  //     the "no stock batches" empty state is shown (no error).
  it('(c) shows noStockBatches empty state when DB loads successfully with zero batches', async () => {
    // DB is empty (cleared in beforeEach) — load resolves with [].
    renderTable()

    await waitFor(() =>
      expect(screen.getByText('No stock batches found.')).toBeInTheDocument(),
    )
    // Error state must NOT be visible.
    expect(screen.queryByTestId('stock-table-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('stock-table-loading')).not.toBeInTheDocument()
  })

  // (d) Loaded with data: when batches exist, the table renders and no empty/error states appear.
  it('(d) renders stock rows when batches are present (no empty or error state)', async () => {
    await db.catalogItems.put(ITEM)
    await db.stockBatches.put(BATCH)

    renderTable()

    await waitFor(() =>
      expect(screen.getByText('Paracetamol')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('stock-table-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('stock-table-loading')).not.toBeInTheDocument()
    expect(screen.queryByText('No stock batches found.')).not.toBeInTheDocument()
  })
})
