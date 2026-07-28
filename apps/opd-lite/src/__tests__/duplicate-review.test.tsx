import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => 'en',
}))

// Mock hub-auth so the component doesn't attempt real network calls
vi.mock('@/lib/hub-auth', () => ({
  getHubApiUrl: () => 'http://localhost:4000',
  getAuthHeaders: () => Promise.resolve({ Authorization: 'Bearer test' }),
}))

// Mock EmptyState -- avoids pulling in the full ui-kit bundle
vi.mock('@ultranos/ui-kit/components/ui/empty-state', () => ({
  EmptyState: ({
    title,
    size,
    icon: Icon,
  }: {
    title: string
    size?: string
    icon?: React.ComponentType
  }) => (
    <div data-testid="empty-state" data-size={size}>
      {Icon && <Icon />}
      <p>{title}</p>
    </div>
  ),
}))

// Mock icons
vi.mock('@ultranos/ui-kit/icons', () => ({
  UserSearch: () => <svg data-testid="icon-user-search" />,
}))

// Mock the Button re-export proxy used by the component
vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button onClick={onClick} disabled={disabled} type={type} {...rest}>
      {children}
    </button>
  ),
}))

// Mock CandidateComparisonCard to keep this test focused on the table logic
vi.mock('@/components/duplicate-review/CandidateComparisonCard', () => ({
  CandidateComparisonCard: ({ candidate }: { candidate: { id: string } }) => (
    <div data-testid={`candidate-card-${candidate.id}`} />
  ),
}))

// We need to mock global fetch so loading succeeds in tests
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

import { DuplicateReviewTable } from '@/components/duplicate-review/DuplicateReviewTable'

function makeRow(overrides: Partial<{
  id: string
  patientLabel: string
  sourcePatientId: string
  candidates: Array<{ id: string; mpiScore: number }>
  topScore: number
  decision: 'PENDING' | 'DISMISSED' | 'FLAGGED_FOR_MERGE'
  createdAt: string
}> = {}) {
  return {
    id: 'row-1',
    patientLabel: 'Ahmad',
    sourcePatientId: 'patient-001',
    candidates: [],
    topScore: 85,
    decision: 'PENDING' as const,
    createdAt: '2026-07-01',
    ...overrides,
  }
}

function setupFetch(rows: ReturnType<typeof makeRow>[]) {
  // Matches the real Hub contract: rows live under result.data.json.reviews
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ result: { data: { json: { reviews: rows } } } }),
  } as Response)
}

describe('DuplicateReviewTable', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('renders FLAGGED_FOR_MERGE badge with text-primary-foreground (not text-primary)', async () => {
    setupFetch([makeRow({ decision: 'FLAGGED_FOR_MERGE' })])

    const { container } = render(<DuplicateReviewTable />)

    // Wait for the loading state to resolve
    await screen.findByText('decisionFlagged')

    const badge = container.querySelector('.bg-primary')
    expect(badge).not.toBeNull()
    // The badge must have text-primary-foreground, not the invisible text-primary
    expect(badge?.className).toContain('text-primary-foreground')
    expect(badge?.className).not.toContain('text-primary ')
    // text-primary-foreground must not also include text-primary as a standalone class
    const classes = (badge?.className ?? '').split(' ')
    expect(classes).not.toContain('text-primary')
  })

  it('renders EmptyState with UserSearch icon when candidates array is empty (auto-selects first row)', async () => {
    setupFetch([makeRow({ candidates: [], decision: 'PENDING' })])

    render(<DuplicateReviewTable />)

    // Wait for the row to appear in the list
    await screen.findByText('Ahmad')

    // The first row is auto-selected; the detail pane shows noCandidates EmptyState immediately
    // Multiple empty-state elements may be present (the detail pane "noCandidates" one).
    // Find the one with noCandidates text.
    const emptyStates = screen.getAllByTestId('empty-state')
    const noCandidatesState = emptyStates.find((el) =>
      el.textContent?.includes('noCandidates')
    )
    expect(noCandidatesState).toBeDefined()
    // Icon should be rendered inside the detail pane
    expect(screen.getByTestId('icon-user-search')).toBeDefined()
    // Size should be sm (compact affordance inside the detail panel)
    expect(noCandidatesState?.getAttribute('data-size')).toBe('sm')
  })

  it('clicking a different row selects it and shows its detail', async () => {
    setupFetch([
      makeRow({ id: 'row-1', patientLabel: 'Ahmad', topScore: 85 }),
      makeRow({
        id: 'row-2',
        patientLabel: 'Sara',
        topScore: 92,
        candidates: [{ id: 'cand-99', mpiScore: 92 }],
      }),
    ])

    render(<DuplicateReviewTable />)

    // Both names appear in the list
    await screen.findByText('Ahmad')
    await screen.findByText('Sara')

    // Select Sara's row
    fireEvent.click(screen.getByText('Sara'))

    // Detail pane should now show Sara's candidate card
    expect(screen.getByTestId('candidate-card-cand-99')).toBeDefined()
  })

  it('non-PENDING list items carry aria-disabled and muted text class', async () => {
    setupFetch([makeRow({ decision: 'DISMISSED' })])

    const { container } = render(<DuplicateReviewTable />)
    await screen.findByText('Ahmad')

    // In the new layout the selectable list items are <button> elements
    const row = container.querySelector('button[aria-disabled="true"]')
    expect(row).not.toBeNull()
    expect(row?.className).toContain('text-muted-foreground')
  })

  it('PENDING list items do NOT carry aria-disabled', async () => {
    setupFetch([makeRow({ decision: 'PENDING' })])

    const { container } = render(<DuplicateReviewTable />)
    await screen.findByText('Ahmad')

    // No list-item button should have aria-disabled=true for a pending row
    const disabledItems = container.querySelectorAll('button[aria-disabled="true"]')
    expect(disabledItems.length).toBe(0)
  })

  it('renders candidate cards when candidates array is non-empty (auto-selects first row)', async () => {
    setupFetch([
      makeRow({
        candidates: [
          { id: 'cand-1', mpiScore: 92 },
          { id: 'cand-2', mpiScore: 75 },
        ],
      }),
    ])

    render(<DuplicateReviewTable />)
    await screen.findByText('Ahmad')

    // First row is auto-selected, so candidate cards appear in the detail pane immediately
    expect(screen.getByTestId('candidate-card-cand-1')).toBeDefined()
    expect(screen.getByTestId('candidate-card-cand-2')).toBeDefined()
    // EmptyState for noCandidates should NOT be shown (there are candidates)
    const emptyStates = screen.queryAllByTestId('empty-state')
    const noCandidatesState = emptyStates.find((el) =>
      el.textContent?.includes('noCandidates')
    )
    expect(noCandidatesState).toBeUndefined()
  })

  it('approve button POSTs to duplicateReview.flagForMerge with the reviewId', async () => {
    // Use mockResolvedValue (not Once) for load so repeated loadRows calls (from t() ref churn)
    // always resolve successfully, keeping the component stable between async awaits.
    const loadResponse = {
      ok: true,
      json: async () => ({
        result: { data: { json: { reviews: [makeRow({ decision: 'PENDING' })] } } },
      }),
    } as Response
    const decideResponse = { ok: true } as Response
    // First call: initial load. Subsequent load calls get loadResponse again.
    // The decide call (POST) is identified by method in assertions.
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(decideResponse)
      return Promise.resolve(loadResponse)
    })

    render(<DuplicateReviewTable />)
    await screen.findByText('Ahmad')

    // First row is auto-selected; decision buttons should be visible in the detail pane
    const flagButton = screen.getByText('actionFlagMerge')
    expect(flagButton).toBeDefined()

    fireEvent.click(flagButton)

    // Wait for submitDecision to have been called (a POST fetch)
    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        (call: Parameters<typeof fetch>) => (call[1] as RequestInit)?.method === 'POST'
      )
      expect(postCalls.length).toBeGreaterThanOrEqual(1)
    })

    const postCalls = mockFetch.mock.calls.filter(
      (call: Parameters<typeof fetch>) => (call[1] as RequestInit)?.method === 'POST'
    )
    // flagForMerge is a distinct Hub endpoint; body carries only reviewId (no decision field)
    expect(String(postCalls[0][0])).toContain('duplicateReview.flagForMerge')
    const lastCallBody = JSON.parse((postCalls[0][1] as RequestInit).body as string)
    expect(lastCallBody.json.reviewId).toBe('row-1')
  })

  it('dismiss button POSTs to duplicateReview.dismiss with reviewId + sourcePatientId', async () => {
    const loadResponse = {
      ok: true,
      json: async () => ({
        result: { data: { json: { reviews: [makeRow({ decision: 'PENDING' })] } } },
      }),
    } as Response
    const decideResponse = { ok: true } as Response
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(decideResponse)
      return Promise.resolve(loadResponse)
    })

    render(<DuplicateReviewTable />)
    await screen.findByText('Ahmad')

    const dismissButton = screen.getByText('actionDismiss')
    expect(dismissButton).toBeDefined()

    fireEvent.click(dismissButton)

    await waitFor(() => {
      const postCalls = mockFetch.mock.calls.filter(
        (call: Parameters<typeof fetch>) => (call[1] as RequestInit)?.method === 'POST'
      )
      expect(postCalls.length).toBeGreaterThanOrEqual(1)
    })

    const postCalls = mockFetch.mock.calls.filter(
      (call: Parameters<typeof fetch>) => (call[1] as RequestInit)?.method === 'POST'
    )
    // dismiss is its own Hub endpoint and also needs the source patientId (to clear mpi_warn)
    expect(String(postCalls[0][0])).toContain('duplicateReview.dismiss')
    const lastCallBody = JSON.parse((postCalls[0][1] as RequestInit).body as string)
    expect(lastCallBody.json.reviewId).toBe('row-1')
    expect(lastCallBody.json.patientId).toBe('patient-001')
  })

  // --- Toolbar: search + status tab-bar (Patients-style) ---
  describe('Toolbar filtering', () => {
    it('renders a search input and an All/Pending/Resolved tab-bar', async () => {
      setupFetch([makeRow()])
      render(<DuplicateReviewTable />)
      await screen.findByText('Ahmad')

      expect(screen.getByLabelText('searchPlaceholder')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'statusTabAll' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'statusTabPending' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'statusTabResolved' })).toBeInTheDocument()
    })

    it('renders the toolbar even when there are no reviews (empty state)', async () => {
      // Persistent mock (not Once) so t()-churn re-fetches also resolve empty
      // instead of falling through to an error state.
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: { data: { json: { reviews: [] } } } }),
      } as Response)
      render(<DuplicateReviewTable />)

      // noReviews empty state renders, and the toolbar is still present above it
      await screen.findByText('noReviews')
      expect(screen.getByLabelText('searchPlaceholder')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'statusTabAll' })).toBeInTheDocument()
    })

    it('status tab-bar filters the list by decision', async () => {
      setupFetch([
        makeRow({ id: 'row-1', patientLabel: 'Ahmad', decision: 'PENDING' }),
        makeRow({ id: 'row-2', patientLabel: 'Sara', decision: 'DISMISSED' }),
      ])
      render(<DuplicateReviewTable />)
      await screen.findByText('Ahmad')
      expect(screen.getByText('Sara')).toBeInTheDocument()

      // Resolved tab -> only the DISMISSED row (Sara)
      fireEvent.click(screen.getByRole('button', { name: 'statusTabResolved' }))
      expect(screen.getByText('Sara')).toBeInTheDocument()
      expect(screen.queryByText('Ahmad')).not.toBeInTheDocument()

      // Pending tab -> only the PENDING row (Ahmad)
      fireEvent.click(screen.getByRole('button', { name: 'statusTabPending' }))
      expect(screen.getByText('Ahmad')).toBeInTheDocument()
      expect(screen.queryByText('Sara')).not.toBeInTheDocument()
    })

    it('search filters the list by patient name', async () => {
      setupFetch([
        makeRow({ id: 'row-1', patientLabel: 'Ahmad' }),
        makeRow({ id: 'row-2', patientLabel: 'Sara' }),
      ])
      render(<DuplicateReviewTable />)
      await screen.findByText('Ahmad')

      fireEvent.change(screen.getByLabelText('searchPlaceholder'), { target: { value: 'Sara' } })

      expect(screen.getByText('Sara')).toBeInTheDocument()
      expect(screen.queryByText('Ahmad')).not.toBeInTheDocument()
    })

    it('shows a filtered-empty state when search matches nothing', async () => {
      setupFetch([makeRow({ patientLabel: 'Ahmad' })])
      render(<DuplicateReviewTable />)
      await screen.findByText('Ahmad')

      fireEvent.change(screen.getByLabelText('searchPlaceholder'), { target: { value: 'zzz-no-match' } })

      const emptyStates = screen.getAllByTestId('empty-state')
      expect(emptyStates.some((el) => el.textContent?.includes('noResultsFiltered'))).toBe(true)
      expect(screen.queryByText('Ahmad')).not.toBeInTheDocument()
    })
  })
})
