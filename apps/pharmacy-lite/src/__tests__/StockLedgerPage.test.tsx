import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Override the global next-intl mock (setup.ts returns raw keys) so this test
// can assert on real translated strings ("Disposed", "Received" etc.) via the
// NextIntlClientProvider + messages={en} wrapper pattern the brief prescribes.
vi.mock('next-intl', async () => await vi.importActual('next-intl'))

const mockQueryMovements = vi.fn()
vi.mock('@/lib/inventory/stock-movement', () => ({
  queryMovements: (...args: unknown[]) => mockQueryMovements(...args),
}))

import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { StockLedgerPage } from '@/components/pharmacy/inventory/StockLedgerPage'
import type { StockMovement, CatalogItem } from '@/lib/inventory/types'

const ITEM: CatalogItem = {
  id: 'cat-1', name: 'Paracetamol', form: 'tablet', strength: '500', strengthUnit: 'mg',
  packSize: 20, category: 'analgesic', defaultSellingPrice: 500, reorderPoint: 10,
  isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z',
}
function mv(id: string, o: Partial<StockMovement>): StockMovement {
  return { id, stockBatchId: 'b1', catalogItemId: 'cat-1', type: 'adjusted', quantity: -2,
    performedBy: 'u1', timestamp: '2026-03-01T00:00:00.000Z', hlcTimestamp: '2026-03-01T00:00:00.000Z', ...o }
}

beforeEach(async () => {
  mockQueryMovements.mockReset()
  await db.stockMovements.clear(); await db.catalogItems.clear()
  await db.catalogItems.put(ITEM)
  await db.stockMovements.bulkPut([
    mv('m1', { type: 'disposed', reasonCode: 'expired' }),
    mv('m2', { type: 'received', quantity: 50, timestamp: '2026-02-01T00:00:00.000Z' }),
  ])
  // Default: delegate to real DB via stock-movement (we only override when testing error)
  mockQueryMovements.mockImplementation(async (opts: Record<string, unknown>) => {
    const { queryMovements: realQuery } = await vi.importActual<typeof import('@/lib/inventory/stock-movement')>('@/lib/inventory/stock-movement')
    return realQuery(opts as Parameters<typeof realQuery>[0])
  })
})

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}><StockLedgerPage /></NextIntlClientProvider>,
  )
}

describe('StockLedgerPage', () => {
  it('lists movements with product name resolved', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Paracetamol').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Disposed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Received').length).toBeGreaterThan(0)
  })

  it('does NOT show empty state while loading — shows loading placeholder first', async () => {
    let resolve!: () => void
    mockQueryMovements.mockReturnValue(new Promise<[]>((res) => { resolve = () => res([]) }))
    renderPage()
    expect(screen.getByTestId('ledger-loading')).toBeInTheDocument()
    expect(screen.queryByText('No stock movements')).not.toBeInTheDocument()
    resolve()
    await waitFor(() => expect(screen.queryByTestId('ledger-loading')).not.toBeInTheDocument())
  })

  it('shows unavailable error state (not empty) when load fails', async () => {
    mockQueryMovements.mockRejectedValue(new Error('DB error'))
    renderPage()
    await waitFor(() => expect(screen.getByTestId('ledger-error')).toBeInTheDocument())
    // The genuine empty-state title "No stock movements" must NOT appear on error
    expect(screen.queryByText('No stock movements')).not.toBeInTheDocument()
  })

  it('filters by movement type', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Received').length).toBeGreaterThan(0))
    fireEvent.change(screen.getByTestId('ledger-type-filter'), { target: { value: 'disposed' } })
    // After filtering to 'disposed', the Received row is gone from the table
    // (the select option "Received" is no longer rendered since we replaced the options list
    // but the select still shows options; we verify the table row text is gone)
    await waitFor(() => {
      // The table body should not contain a "Received" row cell
      const cells = screen.getAllByRole('cell').map((c) => c.textContent)
      expect(cells).not.toContain('Received')
    })
    expect(screen.getAllByText('Disposed').length).toBeGreaterThan(0)
  })
})
