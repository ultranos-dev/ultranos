import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/users',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

const mockListUsers = vi.fn()
const mockAssignStaffToLab = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listUsers: { query: (...args: any[]) => mockListUsers(...args) },
      assignStaffToLab: { mutate: (...args: any[]) => mockAssignStaffToLab(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const mockOnAssigned = vi.fn()
const mockOnClose = vi.fn()

const { default: AssignStaffModal } = await import('../components/lab-staff/AssignStaffModal')

const mockUsers = [
  { id: 'p1', name: 'Alice Smith', email: 'alice@clinic.com', role: 'LAB_TECH', status: 'ACTIVE', moduleCode: null, moduleName: null, mfaEnrolled: true, lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', name: 'Bob Jones', email: 'bob@clinic.com', role: 'LAB_TECH', status: 'ACTIVE', moduleCode: null, moduleName: null, mfaEnrolled: false, lastLoginAt: null, createdAt: '2026-01-02T00:00:00Z' },
]

const mockLabs = [
  { id: 'lab-1', labName: 'Lab Alpha' },
  { id: 'lab-2', labName: 'Lab Beta' },
]

describe('AssignStaffModal — per-lab context (fixedLabId)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 })
  })

  it('renders the modal with title and role selector', () => {
    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText('Assign Staff to Lab')).toBeTruthy()
    expect(screen.getByLabelText('Initial role')).toBeTruthy()
    // Lab dropdown NOT shown when fixedLabId is provided
    expect(screen.queryByLabelText('Lab')).toBeNull()
  })

  it('shows search results when user types 2+ characters', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 2 })
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )

    const searchInput = screen.getByPlaceholderText('Search by name or email...')
    await user.type(searchInput, 'ali')

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeTruthy()
    })
    expect(screen.getByText('alice@clinic.com')).toBeTruthy()
  })

  it('calls assignStaffToLab with correct args and invokes onAssigned', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 2 })
    mockAssignStaffToLab.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )

    await user.type(screen.getByPlaceholderText('Search by name or email...'), 'ali')

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeTruthy()
    })

    await user.click(screen.getByText('Alice Smith'))

    const assignBtn = screen.getByRole('button', { name: 'Assign' })
    await user.click(assignBtn)

    await waitFor(() => {
      expect(mockAssignStaffToLab).toHaveBeenCalledWith({
        labId: 'lab-1',
        practitionerId: 'p1',
        initialRole: 'LAB_TECH',
      })
    })
    expect(mockOnAssigned).toHaveBeenCalled()
  })

  it('shows error message on CONFLICT (already assigned)', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 2 })
    mockAssignStaffToLab.mockRejectedValue(new Error('Staff member is already assigned to this lab'))
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )

    await user.type(screen.getByPlaceholderText('Search by name or email...'), 'ali')
    await waitFor(() => { expect(screen.getByText('Alice Smith')).toBeTruthy() })
    await user.click(screen.getByText('Alice Smith'))
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      expect(screen.getByText('Staff member is already assigned to this lab')).toBeTruthy()
    })
    expect(mockOnAssigned).not.toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalled()
  })
})

describe('AssignStaffModal — org-wide context (labs prop)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 })
  })

  it('renders lab dropdown when labs prop is provided', () => {
    render(
      <AssignStaffModal
        labs={mockLabs}
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByLabelText('Lab')).toBeTruthy()
    expect(screen.getByText('Lab Alpha')).toBeTruthy()
    expect(screen.getByText('Lab Beta')).toBeTruthy()
  })

  it('calls assignStaffToLab with selected lab when submitted', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 2 })
    mockAssignStaffToLab.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        labs={mockLabs}
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )

    await user.selectOptions(screen.getByLabelText('Lab'), 'lab-2')
    await user.type(screen.getByPlaceholderText('Search by name or email...'), 'bob')

    await waitFor(() => { expect(screen.getByText('Bob Jones')).toBeTruthy() })
    await user.click(screen.getByText('Bob Jones'))
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      expect(mockAssignStaffToLab).toHaveBeenCalledWith({
        labId: 'lab-2',
        practitionerId: 'p2',
        initialRole: 'LAB_TECH',
      })
    })
  })

  it('Assign button is disabled until both a lab and a practitioner are selected', async () => {
    render(
      <AssignStaffModal
        labs={mockLabs}
        onAssigned={mockOnAssigned}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled()
  })
})
