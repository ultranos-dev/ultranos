import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { StockOverviewPage } from '@/components/pharmacy/inventory/StockOverviewPage'
import type { CatalogItem, StockBatch } from '@/lib/inventory/types'

// Real next-intl so NextIntlClientProvider + messages work (same pattern as StockLedgerPage test).
vi.mock('next-intl', async () => await vi.importActual('next-intl'))

// Stub next/link — not under test.
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// StockTable uses useAuthSessionStore; stub it out.
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ session: null, isAuthenticated: false }),
    { getState: () => ({ session: null, isAuthenticated: false }) },
  ),
}))

const ITEM: CatalogItem = {
  id: 'a',
  name: 'Paracetamol',
  form: 'tablet',
  strength: '500',
  strengthUnit: 'mg',
  packSize: 20,
  category: 'c',
  defaultSellingPrice: 500,
  reorderPoint: 0,
  isActive: true,
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
}

const b = (o: Partial<StockBatch>): StockBatch => ({
  id: crypto.randomUUID(),
  catalogItemId: 'a',
  batchNumber: 'B',
  expiryDate: '2030-01-01',
  quantityOnHand: 10,
  costPrice: 100,
  sellingPrice: 200,
  receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  locationId: 'default',
  hlcTimestamp: '2026-01-01T00:00:00.000Z',
  ...o,
})

beforeEach(async () => {
  for (const t of [db.catalogItems, db.stockBatches, db.pharmacySettings]) await t.clear()
  await db.catalogItems.put(ITEM)
  // Two active batches: qty=10 @ cost=100, qty=30 @ cost=200
  // WAC = (10*100 + 30*200) / (10+30) = 7000/40 = 175 minor units = AFN 1.75
  // Total inventory value = 10*100 + 30*200 = 7000 minor units = AFN 70.00
  await db.stockBatches.bulkPut([
    b({ quantityOnHand: 10, costPrice: 100 }),
    b({ quantityOnHand: 30, costPrice: 200 }),
  ])
  // No settings seeded → component falls back to defaults (AFN, 2 minor units)
})

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <StockOverviewPage />
    </NextIntlClientProvider>,
  )
}

describe('WAC + valuation display', () => {
  it('shows an inventory-value summary with the correct total', async () => {
    renderPage()
    // total value = 10*100 + 30*200 = 7000 minor = AFN 70.00
    await waitFor(() => expect(screen.getByTestId('inventory-valuation')).toBeInTheDocument())
    expect(screen.getByTestId('inventory-valuation').textContent).toMatch(/70\.00/)
  })

  it('shows a WAC value for the stock row', async () => {
    renderPage()
    // WAC for 'a' = round(7000/40) = 175 minor units = AFN 1.75
    await waitFor(() => expect(screen.getByTestId('inventory-valuation')).toBeInTheDocument())
    // The WAC column header should be present
    expect(screen.getByText('Avg cost')).toBeInTheDocument()
    // WAC value: AFN 1.75 — both rows share the same catalogItemId so value appears twice (one per row)
    const wacCells = screen.getAllByText('AFN 1.75')
    expect(wacCells.length).toBeGreaterThan(0)
  })
})
