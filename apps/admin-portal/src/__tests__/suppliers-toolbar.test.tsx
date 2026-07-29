/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// next-intl mock: echo the key so we can assert against i18n keys.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const mockListSuppliers = vi.fn()
const mockCreateSupplier = vi.fn()
const mockUpdateSupplier = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listSuppliers: { query: (...args: any[]) => mockListSuppliers(...args) },
      createSupplier: { mutate: (...args: any[]) => mockCreateSupplier(...args) },
      updateSupplier: { mutate: (...args: any[]) => mockUpdateSupplier(...args) },
    },
  },
}))

import SuppliersPage from '../app/[locale]/inventory/suppliers/page'

const TWO_SUPPLIERS = {
  suppliers: [
    { id: 's1', name: 'Alpha Reagents', contactEmail: 'alpha@x.io', phone: null, leadTimeDays: 5, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    { id: 's2', name: 'Beta Supplies', contactEmail: 'beta@x.io', phone: null, leadTimeDays: 9, status: 'INACTIVE', createdAt: '', updatedAt: '' },
  ],
}

describe('SuppliersPage — §5.5 toolbar-visible-when-empty + wired filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the toolbar (search + status tabs) AND the empty state when the list is empty', async () => {
    mockListSuppliers.mockResolvedValue({ suppliers: [] })
    render(<SuppliersPage />)

    // Toolbar controls must be present even with zero rows (§5.5)
    await waitFor(() => {
      expect(screen.getByLabelText('suppliersSearchPlaceholder')).toBeInTheDocument()
    })
    // Status pill tabs render
    expect(screen.getByRole('button', { name: 'filterAll' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'filterActive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'filterInactive' })).toBeInTheDocument()
    // The no-data empty state (not the filtered one)
    expect(screen.getByText('noSuppliers')).toBeInTheDocument()
  })

  it('filters the list by search text (client-side wiring)', async () => {
    mockListSuppliers.mockResolvedValue(TWO_SUPPLIERS)
    render(<SuppliersPage />)

    await waitFor(() => {
      expect(screen.getByText('Alpha Reagents')).toBeInTheDocument()
    })
    expect(screen.getByText('Beta Supplies')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('suppliersSearchPlaceholder'), 'Beta')

    await waitFor(() => {
      expect(screen.queryByText('Alpha Reagents')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Beta Supplies')).toBeInTheDocument()
  })

  it('filters the list by status tab and shows the filtered-empty state on no match', async () => {
    mockListSuppliers.mockResolvedValue(TWO_SUPPLIERS)
    render(<SuppliersPage />)

    await waitFor(() => {
      expect(screen.getByText('Alpha Reagents')).toBeInTheDocument()
    })

    // Click the "Active" tab → only the ACTIVE supplier remains
    await userEvent.click(screen.getByRole('button', { name: 'filterActive' }))
    await waitFor(() => {
      expect(screen.queryByText('Beta Supplies')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Alpha Reagents')).toBeInTheDocument()

    // Now search for a name that cannot match within the ACTIVE set → filtered-empty
    await userEvent.type(screen.getByLabelText('suppliersSearchPlaceholder'), 'zzzz')
    await waitFor(() => {
      expect(screen.getByText('noResultsTitle')).toBeInTheDocument()
    })
    // Toolbar is still present alongside the filtered-empty state
    expect(screen.getByLabelText('suppliersSearchPlaceholder')).toBeInTheDocument()
  })
})
