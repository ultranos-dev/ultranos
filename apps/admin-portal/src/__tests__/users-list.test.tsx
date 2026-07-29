/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/users',
  useRouter: () => ({ push: mockPush }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock trpc client
const mockListUsers = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      listUsers: { query: (...args: any[]) => mockListUsers(...args) },
      exportUsers: { query: vi.fn().mockResolvedValue('') },
    },
  },
  setAccessToken: vi.fn(),
}))

const { default: AllUsersTab, formatRelativeTime } = await import('../app/[locale]/users/_components/AllUsersTab')

const mockUsers = [
  {
    id: 'u1',
    name: 'Dr. Alice Smith',
    email: 'alice@clinic.com',
    role: 'DOCTOR',
    moduleCode: 'OPD_LITE',
    moduleName: 'OPD Lite',
    status: 'ACTIVE',
    mfaEnrolled: true,
    lastLoginAt: new Date(Date.now() - 3_600_000).toISOString(), // 1h ago
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'u2',
    name: 'Bob Admin',
    email: 'bob@clinic.com',
    role: 'ADMIN',
    moduleCode: null,
    moduleName: null,
    status: 'SUSPENDED',
    mfaEnrolled: false,
    lastLoginAt: null,
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'u3',
    name: 'Carol Pharmacist',
    email: 'carol@clinic.com',
    role: 'PHARMACIST',
    moduleCode: 'PHARMACY_LITE',
    moduleName: 'Pharmacy Lite',
    status: 'PENDING_INVITE',
    mfaEnrolled: false,
    lastLoginAt: null,
    createdAt: '2026-03-01T00:00:00Z',
  },
]

describe('Users List Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders table with mock user data', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 3 })

    render(<AllUsersTab />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Alice Smith')).toBeTruthy()
    })

    expect(screen.getByText('alice@clinic.com')).toBeTruthy()
    expect(screen.getByText('bob@clinic.com')).toBeTruthy()
    expect(screen.getByText('Carol Pharmacist')).toBeTruthy()

    // Status badges (also present in filter dropdowns, so use getAllByText)
    const activeElements = screen.getAllByText('Active')
    expect(activeElements.length).toBeGreaterThanOrEqual(2) // dropdown option + badge
    const suspendedElements = screen.getAllByText('Suspended')
    expect(suspendedElements.length).toBeGreaterThanOrEqual(2)
    const pendingElements = screen.getAllByText('Pending Invite')
    expect(pendingElements.length).toBeGreaterThanOrEqual(2)

    // MFA column
    expect(screen.getByText('Enrolled')).toBeTruthy()

    // Last login
    expect(screen.getByText('1h ago')).toBeTruthy()
    expect(screen.getAllByText('Never')).toHaveLength(2)

    // Role with module name
    expect(screen.getByText('(OPD Lite)')).toBeTruthy()
  })

  it('shows empty state when no users', async () => {
    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 })

    render(<AllUsersTab />)

    await waitFor(() => {
      expect(screen.getByText('No staff users yet')).toBeTruthy()
    })

    // Empty state has a Create User CTA
    const createLinks = screen.getAllByText('Create User')
    expect(createLinks.length).toBeGreaterThanOrEqual(1)
    const emptyStateCta = createLinks.find(
      (el) => el.closest('a')?.getAttribute('href') === '/users/create',
    )
    expect(emptyStateCta).toBeTruthy()
  })

  it('shows "Create User" button', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 3 })

    render(<AllUsersTab />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Alice Smith')).toBeTruthy()
    })

    const createUserLinks = screen.getAllByText('Create User')
    const topCta = createUserLinks.find(
      (el) => el.closest('a')?.getAttribute('href') === '/users/create',
    )
    expect(topCta).toBeTruthy()
  })

  it('shows suspended users banner when suspended users exist', async () => {
    mockListUsers.mockResolvedValue({ users: mockUsers, totalCount: 3 })

    render(<AllUsersTab />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Alice Smith')).toBeTruthy()
    })

    expect(screen.getByText(/Some users are suspended/)).toBeTruthy()
    expect(screen.getByText('Review subscriptions')).toBeTruthy()
  })
})

describe('formatRelativeTime', () => {
  it('returns "Never" for null', () => {
    expect(formatRelativeTime(null)).toBe('Never')
  })

  it('returns minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago')
  })

  it('returns days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
    expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago')
  })
})
