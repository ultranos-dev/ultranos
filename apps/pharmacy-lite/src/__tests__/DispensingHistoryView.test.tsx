import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { mockGetHistoryPage } = vi.hoisted(() => ({
  mockGetHistoryPage: vi.fn(),
}))

vi.mock('@/lib/history-data', () => ({
  getHistoryPage: mockGetHistoryPage,
  getShiftSummary: vi.fn().mockResolvedValue({
    totalPrescriptions: 0,
    totalMedicationItems: 0,
    syncSuccessRate: 100,
    unresolvedFailures: [],
  }),
}))

import { DispensingHistoryView } from '@/components/pharmacy/DispensingHistoryView'

function makeHistoryPage(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    totalCount: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    ...overrides,
  }
}

function makeHistoryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    patientFirstName: 'Ahmad',
    medicationNames: ['Amoxicillin 500mg'],
    whenHandedOver: '2026-05-12T10:00:00.000Z',
    pharmacistDisplay: 'Dr. Reza',
    syncStatus: 'synced' as const,
    ...overrides,
  }
}

describe('DispensingHistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetHistoryPage.mockResolvedValue(makeHistoryPage())
  })

  it('renders empty state when no records', async () => {
    render(<DispensingHistoryView />)
    await waitFor(() => {
      expect(screen.getByTestId('history-empty')).toBeInTheDocument()
    })
  })

  it('renders history list with items', async () => {
    const items = [
      makeHistoryItem({ id: 'row-1' }),
      makeHistoryItem({ id: 'row-2' }),
    ]
    mockGetHistoryPage.mockResolvedValue(makeHistoryPage({ items, totalCount: 2 }))

    render(<DispensingHistoryView />)
    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeInTheDocument()
    })
    expect(screen.getByTestId('history-row-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('history-row-row-2')).toBeInTheDocument()
  })

  it('shows record count', async () => {
    mockGetHistoryPage.mockResolvedValue(
      makeHistoryPage({ items: [makeHistoryItem()], totalCount: 5 }),
    )

    render(<DispensingHistoryView />)
    await waitFor(() => {
      // Component uses t('recordsFound', { count: 5 }) — i18n mock returns key + JSON values
      expect(screen.getByText('recordsFound {"count":5}')).toBeInTheDocument()
    })
  })

  it('renders filter bar', async () => {
    render(<DispensingHistoryView />)
    await waitFor(() => {
      expect(screen.getByTestId('history-filter-bar')).toBeInTheDocument()
    })
  })

  it('renders shift summary button', async () => {
    render(<DispensingHistoryView />)
    await waitFor(() => {
      expect(screen.getByTestId('shift-summary-button')).toBeInTheDocument()
    })
  })

  it('opens shift summary modal when button clicked', async () => {
    render(<DispensingHistoryView />)
    await waitFor(() => {
      expect(screen.getByTestId('shift-summary-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('shift-summary-button'))
    await waitFor(() => {
      expect(screen.getByTestId('shift-summary-overlay')).toBeInTheDocument()
    })
  })

  it('renders pagination when multiple pages', async () => {
    const items = Array.from({ length: 20 }, (_, i) => makeHistoryItem({ id: `p-${i}` }))
    mockGetHistoryPage.mockResolvedValue(
      makeHistoryPage({ items, totalCount: 25, totalPages: 2, page: 1 }),
    )

    render(<DispensingHistoryView />)
    await waitFor(() => {
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })
    expect(screen.getByTestId('pagination-indicator')).toHaveTextContent('Page 1 of 2')
  })

  it('does not render pagination when single page', async () => {
    mockGetHistoryPage.mockResolvedValue(
      makeHistoryPage({ items: [makeHistoryItem()], totalCount: 1, totalPages: 1 }),
    )

    render(<DispensingHistoryView />)
    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
  })

  it('resets to page 1 when filters change', async () => {
    const items = Array.from({ length: 20 }, (_, i) => makeHistoryItem({ id: `f-${i}` }))
    mockGetHistoryPage.mockResolvedValue(
      makeHistoryPage({ items, totalCount: 25, totalPages: 2, page: 1 }),
    )

    render(<DispensingHistoryView />)
    await waitFor(() => {
      expect(screen.getByTestId('history-list')).toBeInTheDocument()
    })

    // Type in medication filter to trigger filter change. The field is
    // placeholder-identified in the toolbar (its aria-label is shared with the
    // SearchInput magnifier button, so query by placeholder for uniqueness).
    const medInput = screen.getByPlaceholderText('filterMedicationPlaceholder')
    fireEvent.change(medInput, { target: { value: 'Ibuprofen' } })

    await waitFor(() => {
      // Verify getHistoryPage was called with page 1
      const lastCall = mockGetHistoryPage.mock.calls[mockGetHistoryPage.mock.calls.length - 1]
      expect(lastCall![1]).toBe(1)
    })
  })
})
