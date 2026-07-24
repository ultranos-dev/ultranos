import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

// Mock EmptyState — avoids pulling in the full ui-kit bundle
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
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ result: { data: { json: rows } } }),
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

  it('renders EmptyState with UserSearch icon when candidates array is empty', async () => {
    setupFetch([makeRow({ candidates: [], decision: 'PENDING' })])

    render(<DuplicateReviewTable />)

    // Wait for the row to appear
    await screen.findByText('Ahmad')

    // Click to expand the row
    fireEvent.click(screen.getByText('Ahmad'))

    // The expanded row should show EmptyState with noCandidates key
    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toBeDefined()
    expect(emptyState.textContent).toContain('noCandidates')
    // Icon should be rendered
    expect(screen.getByTestId('icon-user-search')).toBeDefined()
    // Size should be sm (compact affordance inside an expanded row)
    expect(emptyState.getAttribute('data-size')).toBe('sm')
  })

  it('non-PENDING rows carry aria-disabled and muted text class', async () => {
    setupFetch([makeRow({ decision: 'DISMISSED' })])

    const { container } = render(<DuplicateReviewTable />)
    await screen.findByText('Ahmad')

    const row = container.querySelector('tr[aria-disabled="true"]')
    expect(row).not.toBeNull()
    expect(row?.className).toContain('text-muted-foreground')
  })

  it('PENDING rows do NOT carry aria-disabled', async () => {
    setupFetch([makeRow({ decision: 'PENDING' })])

    const { container } = render(<DuplicateReviewTable />)
    await screen.findByText('Ahmad')

    // No tr should have aria-disabled=true for a pending row
    const disabledRows = container.querySelectorAll('tr[aria-disabled="true"]')
    expect(disabledRows.length).toBe(0)
  })

  it('renders candidate cards when candidates array is non-empty', async () => {
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

    fireEvent.click(screen.getByText('Ahmad'))

    expect(screen.getByTestId('candidate-card-cand-1')).toBeDefined()
    expect(screen.getByTestId('candidate-card-cand-2')).toBeDefined()
    // EmptyState should NOT be shown
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })
})
