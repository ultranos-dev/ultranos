/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
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
const mockOnOpenChange = vi.fn()

const { default: AssignStaffModal } = await import('../components/lab-staff/AssignStaffModal')

const mockUsers = [
  { id: 'p1', name: 'Alice Smith', email: 'alice@clinic.com', status: 'ACTIVE' },
  { id: 'p2', name: 'Bob Jones', email: 'bob@clinic.com', status: 'ACTIVE' },
  { id: 'p3', name: 'Carol Invite', email: 'carol@clinic.com', status: 'PENDING_INVITE' },
  { id: 'p4', name: 'Dave Suspended', email: 'dave@clinic.com', status: 'SUSPENDED' },
]

const mockLabs = [
  { id: 'lab-1', labName: 'Lab Alpha' },
  { id: 'lab-2', labName: 'Lab Beta' },
]

describe('AssignStaffModal — per-lab context (fixedLabId)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListUsers.mockResolvedValue({ users: mockUsers, total: 4 })
  })

  it('renders the modal with title and role selector', async () => {
    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        open={true} onOpenChange={mockOnOpenChange}
      />
    )
    expect(screen.getByText('Assign Staff to Lab')).toBeTruthy()
    expect(screen.getByLabelText('Initial role')).toBeTruthy()
    // Lab dropdown NOT shown when fixedLabId is provided
    expect(screen.queryByLabelText('Lab')).toBeNull()
  })

  it('loads and displays practitioners in the dropdown', async () => {
    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        open={true} onOpenChange={mockOnOpenChange}
      />
    )

    await waitFor(() => {
      const select = screen.getByLabelText('Practitioner') as HTMLSelectElement
      // placeholder + 3 practitioners (ACTIVE + PENDING_INVITE, SUSPENDED excluded)
      expect(select.options.length).toBe(4)
    })

    expect(screen.getByText('Alice Smith — alice@clinic.com')).toBeTruthy()
    expect(screen.getByText('Bob Jones — bob@clinic.com')).toBeTruthy()
    expect(screen.getByText('Carol Invite — carol@clinic.com')).toBeTruthy()
    expect(screen.queryByText('Dave Suspended — dave@clinic.com')).toBeNull()
  })

  it('calls assignStaffToLab with correct args and invokes onAssigned', async () => {
    mockAssignStaffToLab.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        open={true} onOpenChange={mockOnOpenChange}
      />
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Practitioner') as HTMLSelectElement).options.length).toBe(4)
    })

    await user.selectOptions(screen.getByLabelText('Practitioner'), 'p1')
    await user.click(screen.getByRole('button', { name: 'Assign' }))

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
    mockAssignStaffToLab.mockRejectedValue(new Error('Staff member is already assigned to this lab'))
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        open={true} onOpenChange={mockOnOpenChange}
      />
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Practitioner') as HTMLSelectElement).options.length).toBe(4)
    })

    await user.selectOptions(screen.getByLabelText('Practitioner'), 'p1')
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      expect(screen.getByText('Staff member is already assigned to this lab')).toBeTruthy()
    })
    expect(mockOnAssigned).not.toHaveBeenCalled()
  })

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(
      <AssignStaffModal
        fixedLabId="lab-1"
        onAssigned={mockOnAssigned}
        open={true} onOpenChange={mockOnOpenChange}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('AssignStaffModal — org-wide context (labs prop)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListUsers.mockResolvedValue({ users: mockUsers, total: 4 })
  })

  it('renders lab dropdown when labs prop is provided', async () => {
    render(
      <AssignStaffModal
        labs={mockLabs}
        onAssigned={mockOnAssigned}
        open={true} onOpenChange={mockOnOpenChange}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('Lab')).toBeTruthy()
    })
    expect(screen.getByText('Lab Alpha')).toBeTruthy()
    expect(screen.getByText('Lab Beta')).toBeTruthy()
  })

  it('calls assignStaffToLab with selected lab when submitted', async () => {
    mockAssignStaffToLab.mockResolvedValue({ success: true })
    const user = userEvent.setup()

    render(
      <AssignStaffModal
        labs={mockLabs}
        onAssigned={mockOnAssigned}
        open={true} onOpenChange={mockOnOpenChange}
      />
    )

    await waitFor(() => {
      expect((screen.getByLabelText('Practitioner') as HTMLSelectElement).options.length).toBe(4)
    })

    await user.selectOptions(screen.getByLabelText('Lab'), 'lab-2')
    await user.selectOptions(screen.getByLabelText('Practitioner'), 'p2')
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
        open={true} onOpenChange={mockOnOpenChange}
      />
    )
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled()
  })
})
