/**
 * sop-library-ui.test.tsx
 *
 * P13 — Component tests for SOPLibrary search/category filtering.
 * RTL snapshot tests for SOPLibrary in LTR and RTL document directions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import 'fake-indexeddb/auto'
import { getDb, putSOPs, addSOPAcknowledgment } from '../lib/db'
import { SOPCategory, type SOP, type SOPAcknowledgment } from '../lib/sop-types'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const msgs: Record<string, string> = {
      title: 'SOP Library',
      loading: 'Loading SOPs...',
      empty: 'No SOPs available',
      searchPlaceholder: 'Search SOPs...',
      noSearchResults: 'No SOPs match your search',
      categoryFilter: 'Filter by category',
      allCategories: 'All',
      acknowledged: 'Acknowledged',
      unacknowledged: 'Review Required',
      'category.HEMATOLOGY': 'Hematology',
      'category.CHEMISTRY': 'Chemistry',
      'category.MICROBIOLOGY': 'Microbiology',
      'category.GENERAL_LAB_SAFETY': 'General Lab Safety',
      'category.OTHER': 'Other',
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (sel: (s: { session: { userId: string } | null }) => unknown) =>
    sel({ session: { userId: 'tech-001' } }),
}))

vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  FileSearch: () => <svg data-testid="icon-file-search" />,
  Loader2: () => <svg data-testid="icon-loader2" />,
  ChevronLeft: () => <svg data-testid="icon-chevron-left" />,
}))

vi.mock('@ultranos/ui-kit', () => ({
  DirectionalIcon: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../components/sop/SOPDetailView', () => ({
  SOPDetailView: ({ sop }: { sop: SOP }) => (
    <div data-testid="sop-detail-view">{sop.title}</div>
  ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSOP(overrides: Partial<SOP> = {}): SOP {
  return {
    id: crypto.randomUUID(),
    title: 'CBC Procedure',
    version: '1.0.0',
    effectiveDate: '2026-01-15',
    author: 'Lab Manager',
    category: SOPCategory.HEMATOLOGY,
    content: '## Step 1\nCollect sample',
    images: [],
    status: 'active',
    meta: {
      lastUpdated: '2026-01-15T00:00:00.000Z',
      versionId: '1',
    },
    ...overrides,
  }
}

function makeAck(overrides: Partial<SOPAcknowledgment> = {}): SOPAcknowledgment {
  return {
    id: crypto.randomUUID(),
    sopId: 'sop-1',
    sopVersion: '1.0.0',
    technicianId: 'tech-001',
    acknowledgedAt: new Date().toISOString(),
    syncStatus: 'pending',
    ...overrides,
  }
}

// ── SOPLibrary component tests ────────────────────────────────────────────────

describe('SOPLibrary — search filtering (P13)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
    cleanup()
  })

  it('renders the SOP list after loading', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-1', title: 'Blood Culture Protocol', status: 'active' }),
      makeSOP({ id: 'sop-2', title: 'Urine Analysis SOP', status: 'active' }),
    ])

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    render(<SOPLibrary />)

    await waitFor(() => {
      expect(screen.getByText('Blood Culture Protocol')).toBeDefined()
      expect(screen.getByText('Urine Analysis SOP')).toBeDefined()
    })
  })

  it('filters by title search query', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-1', title: 'Blood Culture Protocol', status: 'active' }),
      makeSOP({ id: 'sop-2', title: 'Urine Analysis SOP', status: 'active' }),
    ])

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const user = userEvent.setup()
    render(<SOPLibrary />)

    const searchInput = await screen.findByRole('textbox')
    await user.type(searchInput, 'Blood')

    await waitFor(() => {
      expect(screen.getByText('Blood Culture Protocol')).toBeDefined()
      expect(screen.queryByText('Urine Analysis SOP')).toBeNull()
    })
  })

  it('shows noSearchResults empty state when search has no matches', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-1', title: 'Blood Culture Protocol', status: 'active' }),
    ])

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const user = userEvent.setup()
    render(<SOPLibrary />)

    const searchInput = await screen.findByRole('textbox')
    await user.type(searchInput, 'xyznonexistent')

    await waitFor(() => {
      const emptyState = screen.getByTestId('empty-state')
      expect(emptyState.textContent).toBe('No SOPs match your search')
    })
  })

  it('shows generic empty state when no SOPs exist and no search', async () => {
    // No SOPs seeded
    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    render(<SOPLibrary />)

    await waitFor(() => {
      const emptyState = screen.getByTestId('empty-state')
      expect(emptyState.textContent).toBe('No SOPs available')
    })
  })

  it('filters by category tab', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-1', title: 'CBC Protocol', category: SOPCategory.HEMATOLOGY, status: 'active' }),
      makeSOP({ id: 'sop-2', title: 'Glucose Assay', category: SOPCategory.CHEMISTRY, status: 'active' }),
    ])

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const user = userEvent.setup()
    render(<SOPLibrary />)

    // Wait for SOPs to load
    await waitFor(() => {
      expect(screen.getByText('CBC Protocol')).toBeDefined()
    })

    // Click the Chemistry tab
    const chemTab = screen.getByRole('tab', { name: 'Chemistry' })
    await user.click(chemTab)

    await waitFor(() => {
      expect(screen.getByText('Glucose Assay')).toBeDefined()
      expect(screen.queryByText('CBC Protocol')).toBeNull()
    })
  })

  it('shows all SOPs when All category tab is selected', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-1', title: 'CBC Protocol', category: SOPCategory.HEMATOLOGY, status: 'active' }),
      makeSOP({ id: 'sop-2', title: 'Glucose Assay', category: SOPCategory.CHEMISTRY, status: 'active' }),
    ])

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const user = userEvent.setup()
    render(<SOPLibrary />)

    // Filter to chemistry first
    await waitFor(() => expect(screen.getByText('CBC Protocol')).toBeDefined())
    const chemTab = screen.getByRole('tab', { name: 'Chemistry' })
    await user.click(chemTab)

    await waitFor(() => expect(screen.queryByText('CBC Protocol')).toBeNull())

    // Reset to All
    const allTab = screen.getByRole('tab', { name: 'All' })
    await user.click(allTab)

    await waitFor(() => {
      expect(screen.getByText('CBC Protocol')).toBeDefined()
      expect(screen.getByText('Glucose Assay')).toBeDefined()
    })
  })

  it('shows acknowledged badge when technician has acknowledged the SOP', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-acked', title: 'Acked SOP', version: '1.0.0', status: 'active' }),
    ])
    await addSOPAcknowledgment(
      makeAck({ sopId: 'sop-acked', sopVersion: '1.0.0', technicianId: 'tech-001' }),
    )

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    render(<SOPLibrary />)

    await waitFor(() => {
      expect(screen.getByText('Acknowledged')).toBeDefined()
    })
  })

  it('does not include superseded SOPs in the list', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-active', title: 'Active SOP', status: 'active' }),
      makeSOP({ id: 'sop-old', title: 'Superseded SOP', status: 'superseded' }),
    ])

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    render(<SOPLibrary />)

    await waitFor(() => {
      expect(screen.getByText('Active SOP')).toBeDefined()
      expect(screen.queryByText('Superseded SOP')).toBeNull()
    })
  })

  it('navigates to SOPDetailView on card click', async () => {
    await putSOPs([
      makeSOP({ id: 'sop-click', title: 'Clickable SOP', status: 'active' }),
    ])

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const user = userEvent.setup()
    render(<SOPLibrary />)

    const card = await screen.findByText('Clickable SOP')
    await user.click(card)

    await waitFor(() => {
      expect(screen.getByTestId('sop-detail-view')).toBeDefined()
    })
  })
})

// ── SOPLibrary RTL snapshot tests ─────────────────────────────────────────────

describe('SOPLibrary RTL snapshots (P13)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.sops.clear()
    await db.sop_acknowledgments.clear()
    document.dir = 'ltr'
    cleanup()
  })

  it('renders SOPLibrary in LTR', async () => {
    await putSOPs([
      makeSOP({ id: 'snap-1', title: 'Snap SOP', status: 'active' }),
    ])
    document.dir = 'ltr'

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const { container } = render(<SOPLibrary />)

    await waitFor(() => {
      expect(screen.getByText('Snap SOP')).toBeDefined()
    })

    expect(container).toMatchSnapshot()
  })

  it('renders SOPLibrary in RTL', async () => {
    await putSOPs([
      makeSOP({ id: 'snap-1', title: 'Snap SOP', status: 'active' }),
    ])
    document.dir = 'rtl'

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const { container } = render(<SOPLibrary />)

    await waitFor(() => {
      expect(screen.getByText('Snap SOP')).toBeDefined()
    })

    expect(container).toMatchSnapshot()
  })

  it('renders empty SOPLibrary in LTR', async () => {
    document.dir = 'ltr'

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const { container } = render(<SOPLibrary />)

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined()
    })

    expect(container).toMatchSnapshot()
  })

  it('renders empty SOPLibrary in RTL', async () => {
    document.dir = 'rtl'

    const { SOPLibrary } = await import('../components/sop/SOPLibrary')
    const { container } = render(<SOPLibrary />)

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeDefined()
    })

    expect(container).toMatchSnapshot()
  })
})
