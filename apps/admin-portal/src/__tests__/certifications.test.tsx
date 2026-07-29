/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock supabase ────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// ── Mock auth session store ──────────────────────────────────
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// ── Mock next/navigation ────────────────────────────────────
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/certifications',
  useParams: () => ({ practitionerId: '00000000-0000-0000-0000-000000000200' }),
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockListCertificationPathways = vi.fn()
const mockArchiveCertificationPathway = vi.fn()
const mockGetExpiringCredentials = vi.fn()
const mockCreateCertificationPathway = vi.fn()
const mockListCertificationProgress = vi.fn()
const mockReviewMilestone = vi.fn()
const mockAssignPathway = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listCertificationPathways: { query: (...args: any[]) => mockListCertificationPathways(...args) },
      archiveCertificationPathway: { mutate: (...args: any[]) => mockArchiveCertificationPathway(...args) },
      getExpiringCredentials: { query: (...args: any[]) => mockGetExpiringCredentials(...args) },
      createCertificationPathway: { mutate: (...args: any[]) => mockCreateCertificationPathway(...args) },
      listCertificationProgress: { query: (...args: any[]) => mockListCertificationProgress(...args) },
      reviewMilestone: { mutate: (...args: any[]) => mockReviewMilestone(...args) },
      assignPathway: { mutate: (...args: any[]) => mockAssignPathway(...args) },
    },
  },
}))

const { default: CertificationsPage } = await import('../app/[locale]/certifications/page')

const MOCK_PATHWAYS = {
  pathways: [
    {
      id: 'pw-1',
      name: 'Lab Tech Level 1',
      description: 'Entry-level certification',
      milestoneCount: 3,
      status: 'ACTIVE',
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
    {
      id: 'pw-2',
      name: 'Advanced Microscopy',
      description: null,
      milestoneCount: 5,
      status: 'ARCHIVED',
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-15T00:00:00Z',
    },
  ],
  total: 2,
}

describe('Story 55.5: Certifications Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListCertificationPathways.mockResolvedValue(MOCK_PATHWAYS)
    mockGetExpiringCredentials.mockResolvedValue({
      credentials: [],
      buckets: { within90: 0, within60: 0, within30: 0 },
    })
  })

  // ================================================================
  // 11.6: Pathway list renders with correct columns
  // ================================================================

  it('renders pathway list with correct columns', async () => {
    render(<CertificationsPage />)

    await waitFor(() => {
      expect(screen.getByText('Lab Tech Level 1')).toBeDefined()
    })

    // Check column headers
    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Description')).toBeDefined()
    expect(screen.getByText('Milestones')).toBeDefined()
    expect(screen.getByText('Status')).toBeDefined()
    expect(screen.getByText('Actions')).toBeDefined()

    // Check data renders
    expect(screen.getByText('Entry-level certification')).toBeDefined()
    expect(screen.getByText('Advanced Microscopy')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByText('ACTIVE')).toBeDefined()
    expect(screen.getByText('ARCHIVED')).toBeDefined()
  })

  it('renders filter tabs', async () => {
    render(<CertificationsPage />)

    await waitFor(() => {
      expect(screen.getByText('All')).toBeDefined()
    })

    expect(screen.getByText('Active')).toBeDefined()
    expect(screen.getByText('Archived')).toBeDefined()
  })

  it('switches filter and refetches', async () => {
    const user = userEvent.setup()
    render(<CertificationsPage />)

    await waitFor(() => {
      expect(screen.getByText('Lab Tech Level 1')).toBeDefined()
    })

    const activeBtn = screen.getByText('Active')
    await user.click(activeBtn)

    await waitFor(() => {
      expect(mockListCertificationPathways).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACTIVE' }),
      )
    })
  })

  it('shows create pathway button', async () => {
    render(<CertificationsPage />)

    await waitFor(() => {
      expect(screen.getByText('Create Pathway')).toBeDefined()
    })
  })

  // ================================================================
  // 11.8: Expiry warning color coding
  // ================================================================

  it('renders expiry warning widget with color-coded buckets', async () => {
    mockGetExpiringCredentials.mockResolvedValue({
      credentials: [],
      buckets: { within90: 5, within60: 3, within30: 1 },
    })

    render(<CertificationsPage />)

    await waitFor(() => {
      expect(screen.getByText('Expiring in 30 days')).toBeDefined()
    })

    expect(screen.getByText('1')).toBeDefined() // 30-day count
    expect(screen.getByText('Expiring in 60 days')).toBeDefined()
    expect(screen.getByText('Expiring in 90 days')).toBeDefined()
    // Both 60-day and 90-day buckets show '2' (60d: 3-1=2, 90d: 5-3=2)
    const twos = screen.getAllByText('2')
    expect(twos.length).toBeGreaterThanOrEqual(2)
  })

  it('hides expiry widget when no credentials expiring', async () => {
    mockGetExpiringCredentials.mockResolvedValue({
      credentials: [],
      buckets: { within90: 0, within60: 0, within30: 0 },
    })

    render(<CertificationsPage />)

    await waitFor(() => {
      expect(screen.getByText('Lab Tech Level 1')).toBeDefined()
    })

    expect(screen.queryByText('Expiring in 30 days')).toBeNull()
  })

  // ================================================================
  // Empty state
  // ================================================================

  it('shows empty state when no pathways exist', async () => {
    mockListCertificationPathways.mockResolvedValue({ pathways: [], total: 0 })
    render(<CertificationsPage />)

    await waitFor(() => {
      expect(screen.getByText(/No certification pathways found/)).toBeDefined()
    })
  })
})

// ================================================================
// 11.7: MilestoneReviewModal
// ================================================================

describe('Story 55.5: MilestoneReviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders milestone details and action buttons', async () => {
    const { MilestoneReviewModal } = await import('../components/certifications/MilestoneReviewModal')

    const milestone = {
      progressId: 'progress-1',
      title: 'Blood Draw Supervision',
      type: 'SUPERVISED_PROCEDURE',
      evidenceRef: 'EV-001',
      submittedAt: '2026-05-15T10:00:00Z',
    }

    render(
      <MilestoneReviewModal
        milestone={milestone}
        open={true}
        onOpenChange={vi.fn()}
        onReviewed={vi.fn()}
      />,
    )

    expect(screen.getByText('Review Milestone')).toBeDefined()
    expect(screen.getByText('Blood Draw Supervision')).toBeDefined()
    expect(screen.getByText('Supervised procedure')).toBeDefined()
    expect(screen.getByText('EV-001')).toBeDefined()
    expect(screen.getByText('Approve')).toBeDefined()
    expect(screen.getByText('Reject')).toBeDefined()
  })

  it('shows confirmation dialog before approving', async () => {
    const { MilestoneReviewModal } = await import('../components/certifications/MilestoneReviewModal')
    const user = userEvent.setup()

    const milestone = {
      progressId: 'progress-1',
      title: 'Safety Training',
      type: 'MODULE_COMPLETION',
      evidenceRef: null,
      submittedAt: '2026-05-15T10:00:00Z',
    }

    render(
      <MilestoneReviewModal
        milestone={milestone}
        open={true}
        onOpenChange={vi.fn()}
        onReviewed={vi.fn()}
      />,
    )

    await user.click(screen.getByText('Approve'))

    // Confirmation dialog should appear
    expect(screen.getByText(/Are you sure you want to approve/)).toBeDefined()
    expect(screen.getByText('Confirm Approval')).toBeDefined()
  })

  it('shows confirmation dialog before rejecting', async () => {
    const { MilestoneReviewModal } = await import('../components/certifications/MilestoneReviewModal')
    const user = userEvent.setup()

    const milestone = {
      progressId: 'progress-1',
      title: 'Safety Training',
      type: 'MODULE_COMPLETION',
      evidenceRef: null,
      submittedAt: '2026-05-15T10:00:00Z',
    }

    render(
      <MilestoneReviewModal
        milestone={milestone}
        open={true}
        onOpenChange={vi.fn()}
        onReviewed={vi.fn()}
      />,
    )

    await user.click(screen.getByText('Reject'))

    expect(screen.getByText(/Are you sure you want to reject/)).toBeDefined()
    expect(screen.getByText('Confirm Rejection')).toBeDefined()
  })
})
