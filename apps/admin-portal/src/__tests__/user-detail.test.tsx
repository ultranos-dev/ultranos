/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/users/u1',
  useParams: () => ({ userId: 'u1' }),
  useRouter: () => ({ push: mockPush }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) => {
    const state = {
      session: { email: 'admin@ultranos.com', userId: 'u1', practitionerId: 'p1', role: 'admin', sessionId: 's1' },
      clearSession: vi.fn(),
    }
    return selector(state)
  },
}))

// Mock trpc client
const mockGetUser = vi.fn()
const mockUpdateUser = vi.fn()
const mockSuspendUser = vi.fn()
const mockReactivateUser = vi.fn()
const mockResendInvitation = vi.fn()
const mockResetUserPassword = vi.fn()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getUser: { query: (...args: any[]) => mockGetUser(...args) },
      updateUser: { mutate: (...args: any[]) => mockUpdateUser(...args) },
      suspendUser: { mutate: (...args: any[]) => mockSuspendUser(...args) },
      reactivateUser: { mutate: (...args: any[]) => mockReactivateUser(...args) },
      resendInvitation: { mutate: (...args: any[]) => mockResendInvitation(...args) },
      resetUserPassword: { mutate: (...args: any[]) => mockResetUserPassword(...args) },
    },
  },
  setAccessToken: vi.fn(),
}))

const { default: UserDetailPage } = await import('../app/users/[userId]/page')

const activeUser = {
  id: 'u1',
  name: 'Dr. Alice Smith',
  givenName: 'Alice',
  familyName: 'Smith',
  email: 'alice@clinic.com',
  role: 'DOCTOR',
  moduleCode: 'OPD_LITE',
  moduleName: 'OPD Lite',
  status: 'ACTIVE',
  suspensionReason: null,
  suspendedAt: null,
  lastLoginAt: '2026-05-10T14:30:00Z',
  createdAt: '2026-01-01T00:00:00Z',
}

const suspendedUser = {
  ...activeUser,
  id: 'u2',
  name: 'Bob Admin',
  email: 'bob@clinic.com',
  role: 'ADMIN',
  moduleCode: null,
  moduleName: null,
  status: 'SUSPENDED',
  suspensionReason: 'Violated policy',
  suspendedAt: '2026-04-15T10:00:00Z',
  lastLoginAt: null,
}

const pendingUser = {
  ...activeUser,
  id: 'u3',
  name: 'Carol Pharmacist',
  email: 'carol@clinic.com',
  role: 'PHARMACIST',
  moduleCode: 'PHARMACY_LITE',
  moduleName: 'Pharmacy Lite',
  status: 'PENDING_INVITE',
  lastLoginAt: null,
}

describe('User Detail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user profile data (name, email, status)', async () => {
    mockGetUser.mockResolvedValue(activeUser)

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Dr. Alice Smith')).toBeTruthy()
    })

    const emailElements = screen.getAllByText('alice@clinic.com')
    expect(emailElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('DOCTOR')).toBeTruthy()
    expect(screen.getByText('(OPD Lite)')).toBeTruthy()
  })

  it('shows "Suspend User" button for ACTIVE users', async () => {
    mockGetUser.mockResolvedValue(activeUser)

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Dr. Alice Smith')).toBeTruthy()
    })

    expect(screen.getByText('Suspend User')).toBeTruthy()
    expect(screen.getByText('Reset Password')).toBeTruthy()
    expect(screen.queryByText('Reactivate User')).toBeNull()
    expect(screen.queryByText('Resend Invitation')).toBeNull()
  })

  it('shows "Reactivate User" button for SUSPENDED users', async () => {
    mockGetUser.mockResolvedValue(suspendedUser)

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Bob Admin')).toBeTruthy()
    })

    expect(screen.getByText('Reactivate User')).toBeTruthy()
    expect(screen.getByText('Suspended')).toBeTruthy()
    expect(screen.getByText(/Violated policy/)).toBeTruthy()
    expect(screen.queryByText('Suspend User')).toBeNull()
    expect(screen.queryByText('Reset Password')).toBeNull()
  })

  it('shows "Resend Invitation" for PENDING_INVITE users', async () => {
    mockGetUser.mockResolvedValue(pendingUser)

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Carol Pharmacist')).toBeTruthy()
    })

    expect(screen.getByText('Resend Invitation')).toBeTruthy()
    expect(screen.getByText('Suspend User')).toBeTruthy()
    expect(screen.queryByText('Reactivate User')).toBeNull()
    expect(screen.queryByText('Reset Password')).toBeNull()
  })

  it('shows back link to users list', async () => {
    mockGetUser.mockResolvedValue(activeUser)

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Dr. Alice Smith')).toBeTruthy()
    })

    const backLink = screen.getByText(/Back to Users/)
    expect(backLink.closest('a')?.getAttribute('href')).toBe('/users')
  })

  it('disables save button when name is not dirty', async () => {
    mockGetUser.mockResolvedValue(activeUser)

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Dr. Alice Smith')).toBeTruthy()
    })

    const saveBtn = screen.getByText('Save Changes')
    expect(saveBtn).toHaveProperty('disabled', true)
  })
})
