/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/users',
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const mockListAllLabStaff = vi.fn()
const mockListLabsForFilter = vi.fn()
const mockGetManagerlessLabs = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listAllLabStaff: { query: (...args: any[]) => mockListAllLabStaff(...args) },
      listLabsForFilter: { query: (...args: any[]) => mockListLabsForFilter(...args) },
      getManagerlessLabs: { query: (...args: any[]) => mockGetManagerlessLabs(...args) },
      exportLabStaffCsv: { mutate: vi.fn().mockResolvedValue('') },
      listUsers: { query: vi.fn().mockResolvedValue({ users: [], totalCount: 0 }) },
      exportUsers: { query: vi.fn().mockResolvedValue('') },
      assignStaffToLab: { mutate: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
  setAccessToken: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

describe('LabAssignmentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListLabsForFilter.mockResolvedValue([])
    mockGetManagerlessLabs.mockResolvedValue([])
  })

  it('renders the lab staff table with rows', async () => {
    const { default: LabAssignmentsTab } = await import('../app/[locale]/users/_components/LabAssignmentsTab')
    mockListAllLabStaff.mockResolvedValue({
      items: [
        {
          practitionerId: 'p1',
          email: 'alice@clinic.com',
          labId: 'lab1',
          labName: 'Lab Alpha',
          labRole: 'LAB_TECH',
          lastActiveAt: new Date(Date.now() - 3_600_000).toISOString(),
          createdAt: '2026-01-15T00:00:00Z',
          labHasManager: true,
        },
      ],
      nextCursor: null,
    })

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByText('Lab Alpha')).toBeTruthy()
    })

    expect(screen.getAllByText('Lab Tech').length).toBeGreaterThan(0)
    expect(screen.getByText('1h ago')).toBeTruthy()
  })

  it('shows empty state when no staff found', async () => {
    const { default: LabAssignmentsTab } = await import('../app/[locale]/users/_components/LabAssignmentsTab')
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })

    render(<LabAssignmentsTab />)

    // Empty state now uses t('noLabStaff') = "No lab staff assigned"
    await waitFor(() => {
      expect(screen.getByText('No lab staff assigned')).toBeTruthy()
    })
  })

  it('shows managerless labs warning when count > 0', async () => {
    const { default: LabAssignmentsTab } = await import('../app/[locale]/users/_components/LabAssignmentsTab')
    mockGetManagerlessLabs.mockResolvedValue([{ id: 'lab1' }, { id: 'lab2' }])
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByText(/2 labs have no Lab Manager assigned/)).toBeTruthy()
    })
  })

  it('renders "Assign to Lab" button', async () => {
    const { default: LabAssignmentsTab } = await import('../app/[locale]/users/_components/LabAssignmentsTab')
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })
    mockListLabsForFilter.mockResolvedValue([{ id: 'lab-1', labName: 'Lab Alpha' }])

    render(<LabAssignmentsTab />)

    // With no staff + no active filters the empty state also renders an
    // "Assign to Lab" action button, so there are two matching buttons
    // (toolbar + empty-state). Assert at least the toolbar one exists.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Assign to Lab' })[0]).toBeTruthy()
    })
  })

  it('"Assign to Lab" button opens AssignStaffModal with lab dropdown', async () => {
    const { default: LabAssignmentsTab } = await import('../app/[locale]/users/_components/LabAssignmentsTab')
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })
    mockListLabsForFilter.mockResolvedValue([
      { id: 'lab-1', labName: 'Lab Alpha' },
      { id: 'lab-2', labName: 'Lab Beta' },
    ])
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()

    render(<LabAssignmentsTab />)

    // Empty state duplicates the "Assign to Lab" label as its action button,
    // so scope to the toolbar (first) button for both the wait and the click.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Assign to Lab' })[0]).toBeTruthy()
    })

    await user.click(screen.getAllByRole('button', { name: 'Assign to Lab' })[0]!)

    await waitFor(() => {
      expect(screen.getByText('Assign Staff to Lab')).toBeTruthy()
      // Lab dropdown is present (org-wide context)
      expect(screen.getByLabelText('Lab')).toBeTruthy()
    })
  })
})

describe('UsersPage tab shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })
    mockListLabsForFilter.mockResolvedValue([])
    mockGetManagerlessLabs.mockResolvedValue([])
  })

  it('renders "All Users" tab link and "Lab Assignments" tab link', async () => {
    const { default: UsersPage } = await import('../app/[locale]/users/page')
    render(<UsersPage />)
    expect(screen.getByRole('link', { name: 'All Users' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Lab Assignments' })).toBeTruthy()
  })
})
