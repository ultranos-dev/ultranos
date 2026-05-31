import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mock supabase (required by TopHeader) ───────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// ── Mock auth session store (required by TopHeader) ─────────
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
  usePathname: () => '/mentorship',
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockListMentorshipPairings = vi.fn()
const mockGetMentorshipStats = vi.fn()
const mockListEligibleMentors = vi.fn()
const mockListAllLabStaff = vi.fn()
const mockCreateMentorshipPairing = vi.fn()
const mockDissolveMentorshipPairing = vi.fn()
const mockGetMentorshipPairingDetail = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listMentorshipPairings: { query: (...args: any[]) => mockListMentorshipPairings(...args) },
      getMentorshipStats: { query: (...args: any[]) => mockGetMentorshipStats(...args) },
      listEligibleMentors: { query: (...args: any[]) => mockListEligibleMentors(...args) },
      listAllLabStaff: { query: (...args: any[]) => mockListAllLabStaff(...args) },
      createMentorshipPairing: { mutate: (...args: any[]) => mockCreateMentorshipPairing(...args) },
      dissolveMentorshipPairing: { mutate: (...args: any[]) => mockDissolveMentorshipPairing(...args) },
      getMentorshipPairingDetail: { query: (...args: any[]) => mockGetMentorshipPairingDetail(...args) },
    },
  },
}))

const { default: MentorshipPage } = await import('../app/mentorship/page')

const MOCK_STATS = {
  totalPaired: 8,
  unmatchedTechs: 3,
  avgPairingDurationDays: 65,
  checkinCompletionRate: 85,
}

const MOCK_PAIRINGS = {
  items: [
    {
      id: 'p1',
      mentorName: 'Alice Supervisor',
      mentorEmail: 'alice@lab.com',
      menteeName: 'Bob Junior',
      menteeEmail: 'bob@lab.com',
      labName: 'Central Lab',
      startDate: '2026-04-01',
      status: 'ACTIVE',
      dissolvedAt: null,
      dissolvedReason: null,
    },
    {
      id: 'p2',
      mentorName: 'Carol Manager',
      mentorEmail: 'carol@lab.com',
      menteeName: 'Dave Tech',
      menteeEmail: 'dave@lab.com',
      labName: 'West Lab',
      startDate: '2026-01-15',
      status: 'DISSOLVED',
      dissolvedAt: '2026-05-01T00:00:00Z',
      dissolvedReason: 'COMPLETED',
    },
  ],
  nextCursor: null,
}

describe('MentorshipPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListMentorshipPairings.mockResolvedValue(MOCK_PAIRINGS)
    mockGetMentorshipStats.mockResolvedValue(MOCK_STATS)
    mockListEligibleMentors.mockResolvedValue([])
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('renders dashboard stats cards with correct values', async () => {
    render(<MentorshipPage />)

    await waitFor(() => {
      expect(screen.getByText('Paired Techs')).toBeInTheDocument()
    })

    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2 months')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('renders pairings table with correct columns', async () => {
    render(<MentorshipPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice Supervisor')).toBeInTheDocument()
    })

    // Table headers
    expect(screen.getByText('Mentor')).toBeInTheDocument()
    expect(screen.getByText('Mentee')).toBeInTheDocument()
    expect(screen.getByText('Lab')).toBeInTheDocument()
    expect(screen.getByText('Start Date')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()

    // Row data
    expect(screen.getByText('Bob Junior')).toBeInTheDocument()
    expect(screen.getByText('Central Lab')).toBeInTheDocument()
    expect(screen.getByText('Carol Manager')).toBeInTheDocument()
    expect(screen.getByText('Dave Tech')).toBeInTheDocument()
    expect(screen.getByText('West Lab')).toBeInTheDocument()
  })

  it('shows Dissolve button only for ACTIVE pairings', async () => {
    render(<MentorshipPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice Supervisor')).toBeInTheDocument()
    })

    // Only one Dissolve button (for the ACTIVE pairing)
    const dissolveButtons = screen.getAllByText('Dissolve')
    expect(dissolveButtons).toHaveLength(1)
  })

  it('shows dissolution modal with reason dropdown when Dissolve clicked', async () => {
    const user = userEvent.setup()
    render(<MentorshipPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice Supervisor')).toBeInTheDocument()
    })

    const dissolveBtn = screen.getByText('Dissolve')
    await user.click(dissolveBtn)

    // Modal appears with title and action button
    await waitFor(() => {
      expect(screen.getByText('This will end the mentorship pairing. This action cannot be undone.')).toBeInTheDocument()
    })

    // Reason dropdown should be visible
    expect(screen.getByText('Reason')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('shows create pairing form when Create Pairing clicked', async () => {
    const user = userEvent.setup()
    render(<MentorshipPage />)

    await waitFor(() => {
      expect(screen.getByText('Alice Supervisor')).toBeInTheDocument()
    })

    // Click the Create Pairing CTA button (not the empty state one)
    const createButtons = screen.getAllByText('Create Pairing')
    await user.click(createButtons[0]!)

    await waitFor(() => {
      expect(screen.getByText('Create Mentorship Pairing')).toBeInTheDocument()
    })

    expect(screen.getByText('Mentor (Supervisor / Lab Manager)')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.getByText('Create Mentorship Pairing')).toBeInTheDocument()
  })

  it('status filter changes trigger re-fetch', async () => {
    const user = userEvent.setup()
    render(<MentorshipPage />)

    await waitFor(() => {
      expect(mockListMentorshipPairings).toHaveBeenCalledTimes(1)
    })

    // Click "Active" tab
    const activeTab = screen.getByText('Active')
    await user.click(activeTab)

    await waitFor(() => {
      expect(mockListMentorshipPairings).toHaveBeenCalledWith(
        expect.objectContaining({ statusFilter: 'ACTIVE' }),
      )
    })

    // Click "Dissolved" tab
    const dissolvedTab = screen.getByText('Dissolved')
    await user.click(dissolvedTab)

    await waitFor(() => {
      expect(mockListMentorshipPairings).toHaveBeenCalledWith(
        expect.objectContaining({ statusFilter: 'DISSOLVED' }),
      )
    })
  })

  it('renders empty state with Create Pairing button when no pairings', async () => {
    mockListMentorshipPairings.mockResolvedValue({ items: [], nextCursor: null })

    render(<MentorshipPage />)

    await waitFor(() => {
      expect(screen.getByText('No mentorship pairings yet')).toBeInTheDocument()
    })

    expect(screen.getByText('Create a pairing to connect experienced techs with junior staff.')).toBeInTheDocument()
  })
})
