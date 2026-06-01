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
    },
  },
  setAccessToken: vi.fn(),
}))

const { default: LabAssignmentsTab } = await import('../app/users/_components/LabAssignmentsTab')

describe('LabAssignmentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListLabsForFilter.mockResolvedValue([])
    mockGetManagerlessLabs.mockResolvedValue([])
  })

  it('renders the lab staff table with rows', async () => {
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
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByText('No staff found')).toBeTruthy()
    })
  })

  it('shows managerless labs warning when count > 0', async () => {
    mockGetManagerlessLabs.mockResolvedValue([{ id: 'lab1' }, { id: 'lab2' }])
    mockListAllLabStaff.mockResolvedValue({ items: [], nextCursor: null })

    render(<LabAssignmentsTab />)

    await waitFor(() => {
      expect(screen.getByText(/2 labs have no Lab Manager assigned/)).toBeTruthy()
    })
  })
})
