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
const mockParams = { labId: 'lab-1' }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/labs/lab-1/staff',
  useParams: () => mockParams,
}))

// ── Mock trpc ───────────────────────────────────────────────
const mockQuery = vi.fn()
const mockMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listLabStaff: { query: (...args: any[]) => mockQuery('listLabStaff', ...args) },
      updateLabStaffRole: { mutate: (...args: any[]) => mockMutate('updateLabStaffRole', ...args) },
    },
  },
}))

const { default: LabStaffPage } = await import('../app/labs/[labId]/staff/page')

const mockStaffList = [
  {
    practitionerId: '11111111-aaaa-bbbb-cccc-dddddddddddd',
    email: 'tech1@lab.com',
    labRole: 'LAB_TECH',
    createdAt: '2026-05-01T00:00:00Z',
  },
  {
    practitionerId: '22222222-aaaa-bbbb-cccc-dddddddddddd',
    email: 'manager@lab.com',
    labRole: 'LAB_MANAGER',
    createdAt: '2026-05-02T00:00:00Z',
  },
  {
    practitionerId: '33333333-aaaa-bbbb-cccc-dddddddddddd',
    email: 'senior@lab.com',
    labRole: 'SENIOR_TECH',
    createdAt: '2026-05-03T00:00:00Z',
  },
]

describe('Lab Staff Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders staff table with correct columns and role badges', async () => {
    mockQuery.mockResolvedValue(mockStaffList)

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('11111111...')).toBeInTheDocument()
    })

    // Column headers
    expect(screen.getByText('Practitioner ID')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Assigned')).toBeInTheDocument()

    // Staff data rendered
    expect(screen.getByText('tech1@lab.com')).toBeInTheDocument()
    expect(screen.getByText('manager@lab.com')).toBeInTheDocument()
    expect(screen.getByText('senior@lab.com')).toBeInTheDocument()

    // Role dropdowns present (3 staff members = 3 selects)
    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(3)
  })

  it('shows empty state when no staff assigned', async () => {
    mockQuery.mockResolvedValue([])

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('No staff assigned to this lab')).toBeInTheDocument()
    })
  })

  it('shows error state on fetch failure', async () => {
    mockQuery.mockRejectedValue(new Error('Network error'))

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('role dropdown triggers confirmation modal', async () => {
    mockQuery.mockResolvedValue(mockStaffList)
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('tech1@lab.com')).toBeInTheDocument()
    })

    // Change role of first staff member via dropdown
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'SUPERVISOR')

    // Confirmation modal should appear
    await waitFor(() => {
      expect(screen.getByText('Change Staff Role')).toBeInTheDocument()
      expect(screen.getByText('Confirm')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })
  })

  it('confirmation modal shows last-manager warning when demoting LAB_MANAGER', async () => {
    mockQuery.mockResolvedValue(mockStaffList)
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('manager@lab.com')).toBeInTheDocument()
    })

    // Change role of LAB_MANAGER to LAB_TECH
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[1], 'LAB_TECH')

    // Warning should appear about manager demotion
    await waitFor(() => {
      expect(screen.getByText(/remove their manager privileges/i)).toBeInTheDocument()
    })
  })

  it('successful role change refreshes staff list', async () => {
    mockQuery.mockResolvedValue(mockStaffList)
    mockMutate.mockResolvedValue({ success: true, previousRole: 'LAB_TECH', newRole: 'SUPERVISOR' })
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('tech1@lab.com')).toBeInTheDocument()
    })

    // Change role
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'SUPERVISOR')

    // Confirm
    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Confirm'))

    // Should call mutate and refetch
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith('updateLabStaffRole', {
        labId: 'lab-1',
        targetPractitionerId: '11111111-aaaa-bbbb-cccc-dddddddddddd',
        newRole: 'SUPERVISOR',
      })
    })

    // listLabStaff called twice: initial load + refresh
    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByText('Role updated successfully')).toBeInTheDocument()
  })

  it('last-manager CONFLICT error shows error message', async () => {
    mockQuery.mockResolvedValue(mockStaffList)
    mockMutate.mockRejectedValue(new Error('Cannot demote the last Lab Manager'))
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('manager@lab.com')).toBeInTheDocument()
    })

    // Try to demote manager
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[1], 'LAB_TECH')

    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Confirm'))

    // Error message shown
    await waitFor(() => {
      expect(screen.getByText('Cannot demote the last Lab Manager')).toBeInTheDocument()
    })
  })

  it('cancel button dismisses confirmation modal', async () => {
    mockQuery.mockResolvedValue(mockStaffList)
    const user = userEvent.setup()

    render(<LabStaffPage />)

    await waitFor(() => {
      expect(screen.getByText('tech1@lab.com')).toBeInTheDocument()
    })

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'SUPERVISOR')

    await waitFor(() => {
      expect(screen.getByText('Change Staff Role')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Change Staff Role')).not.toBeInTheDocument()
    })

    // No mutation called
    expect(mockMutate).not.toHaveBeenCalled()
  })
})
