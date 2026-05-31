import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { within } from '@testing-library/react'

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
  usePathname: () => '/staff',
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockListAllLabStaff = vi.fn()
const mockListLabsForFilter = vi.fn()
const mockGetManagerlessLabs = vi.fn()
const mockExportLabStaffCsv = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listAllLabStaff: { query: (...args: any[]) => mockListAllLabStaff(...args) },
      listLabsForFilter: { query: (...args: any[]) => mockListLabsForFilter(...args) },
      getManagerlessLabs: { query: (...args: any[]) => mockGetManagerlessLabs(...args) },
      exportLabStaffCsv: { mutate: (...args: any[]) => mockExportLabStaffCsv(...args) },
    },
  },
}))

const { default: StaffPage } = await import('../app/staff/page')

const MOCK_STAFF = {
  items: [
    {
      practitionerId: 'p1',
      email: 'tech1@lab.com',
      labId: 'lab-1',
      labName: 'Central Lab',
      labRole: 'LAB_TECH',
      lastActiveAt: '2026-05-29T10:00:00Z',
      createdAt: '2026-05-01T00:00:00Z',
      labHasManager: true,
    },
    {
      practitionerId: 'p2',
      email: 'manager@lab.com',
      labId: 'lab-2',
      labName: 'West Lab',
      labRole: 'LAB_MANAGER',
      lastActiveAt: null,
      createdAt: '2026-05-02T00:00:00Z',
      labHasManager: false,
    },
    {
      practitionerId: 'p3',
      email: 'senior@lab.com',
      labId: 'lab-1',
      labName: 'Central Lab',
      labRole: 'SENIOR_TECH',
      lastActiveAt: '2026-05-15T10:00:00Z',
      createdAt: '2026-05-03T00:00:00Z',
      labHasManager: true,
    },
  ],
  nextCursor: null,
}

const MOCK_LABS = [
  { id: 'lab-1', labName: 'Central Lab' },
  { id: 'lab-2', labName: 'West Lab' },
]

describe('Cross-Lab Staff Overview Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListLabsForFilter.mockResolvedValue(MOCK_LABS)
    mockListAllLabStaff.mockResolvedValue(MOCK_STAFF)
    mockGetManagerlessLabs.mockResolvedValue([{ labId: 'lab-2', labName: 'West Lab' }])
  })

  it('renders staff table with correct columns', async () => {
    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    })

    // Column headers
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Lab Name')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Last Active')).toBeInTheDocument()
    expect(screen.getByText('Assigned')).toBeInTheDocument()

    // Data rendered with truncated emails
    expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    expect(screen.getByText('m***@lab.com')).toBeInTheDocument()
    expect(screen.getByText('s***@lab.com')).toBeInTheDocument()
  })

  it('role filter changes trigger re-fetch with correct filter param', async () => {
    const user = userEvent.setup()
    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    })

    // Click the "Lab Tech" role filter button (in the filter bar, not the badge)
    const labTechButtons = screen.getAllByText('Lab Tech')
    await user.click(labTechButtons[0])

    await waitFor(() => {
      expect(mockListAllLabStaff).toHaveBeenCalledWith(
        expect.objectContaining({ roleFilter: 'LAB_TECH' }),
      )
    })
  })

  it('lab filter dropdown populated from listLabsForFilter', async () => {
    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    })

    // Lab filter dropdown should show lab names
    const labSelect = screen.getByLabelText('Filter by lab')
    expect(labSelect).toBeInTheDocument()

    // Check options
    const options = labSelect.querySelectorAll('option')
    expect(options).toHaveLength(3) // "All Labs" + 2 labs
    expect(options[1].textContent).toBe('Central Lab')
    expect(options[2].textContent).toBe('West Lab')
  })

  it('managerless lab warning badge renders next to lab name', async () => {
    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    })

    // West Lab (labHasManager: false) should have a warning icon in its row
    // Get all rows and find the West Lab row
    const rows = screen.getAllByRole('row')
    const westLabRow = rows.find((r) => r.textContent?.includes('West Lab'))
    expect(westLabRow).toBeDefined()

    // Warning icon should be present (SVG with path for warning triangle)
    const svgs = westLabRow!.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('top-level warning banner shows count of managerless labs', async () => {
    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    })

    // Warning banner for managerless labs
    expect(screen.getByText(/1 lab.*have no Lab Manager assigned/i)).toBeInTheDocument()
  })

  it('pagination next/previous buttons work with cursor', async () => {
    const staffWithCursor = {
      ...MOCK_STAFF,
      nextCursor: 'p3',
    }
    mockListAllLabStaff.mockResolvedValue(staffWithCursor)
    const user = userEvent.setup()

    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    })

    // Next button should be enabled
    const nextBtn = screen.getByText('Next')
    expect(nextBtn).not.toBeDisabled()

    // Previous should be disabled on first page
    const prevBtn = screen.getByText('Previous')
    expect(prevBtn).toBeDisabled()

    // Click next
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })
    await user.click(nextBtn)

    await waitFor(() => {
      expect(mockListAllLabStaff).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'p3' }),
      )
    })
  })

  it('row click navigates to /labs/[labId]/staff', async () => {
    const user = userEvent.setup()
    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    })

    // Click on the first data row
    const rows = screen.getAllByRole('row')
    // rows[0] is the header, rows[1] is the first data row
    await user.click(rows[1])

    expect(mockPush).toHaveBeenCalledWith('/labs/lab-1/staff')
  })

  it('empty state renders when no staff found', async () => {
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })

    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('No staff found')).toBeInTheDocument()
    })

    expect(screen.getByText('Adjust your filters or add staff to a lab.')).toBeInTheDocument()
  })

  it('error state renders on fetch failure', async () => {
    mockListAllLabStaff.mockRejectedValue(new Error('Connection failed'))

    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load staff. Please try again.')).toBeInTheDocument()
    })
  })

  it('labs dropdown shows error option when listLabsForFilter fails', async () => {
    mockListLabsForFilter.mockRejectedValue(new Error('Network error'))

    render(<StaffPage />)

    await waitFor(() => {
      expect(screen.getByText('t***@lab.com')).toBeInTheDocument()
    })

    const labSelect = screen.getByLabelText('Filter by lab')
    expect(labSelect.querySelector('option[disabled]')?.textContent).toBe('Failed to load labs')
  })
})

describe('Cross-Lab Staff Overview Page — RTL snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListLabsForFilter.mockResolvedValue(MOCK_LABS)
    mockListAllLabStaff.mockResolvedValue(MOCK_STAFF)
    mockGetManagerlessLabs.mockResolvedValue([{ labId: 'lab-2', labName: 'West Lab' }])
  })

  it('renders correctly in LTR', async () => {
    const { container } = render(
      <div dir="ltr">
        <StaffPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('t***@lab.com')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })

  it('renders correctly in RTL', async () => {
    const { container } = render(
      <div dir="rtl">
        <StaffPage />
      </div>,
    )
    await waitFor(() => expect(screen.getByText('t***@lab.com')).toBeInTheDocument())
    expect(container.firstChild).toMatchSnapshot()
  })
})
