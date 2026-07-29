import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock supabase
const mockSignInWithPassword = vi.fn()
const mockListFactors = vi.fn()
const mockChallenge = vi.fn()
const mockVerify = vi.fn()
const mockSignOut = vi.fn()
const mockGetSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getSession: mockGetSession,
      mfa: {
        listFactors: mockListFactors,
        challenge: mockChallenge,
        verify: mockVerify,
      },
    },
  }),
}))

const mockReportAdminAuthEvent = vi.fn()

// The login page uses useRouter/useSearchParams (and next/link). Without a
// next/navigation mock, rendering throws "invariant expected app router to be
// mounted". Mock exactly the hooks the page calls.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}))

vi.mock('@/lib/trpc', () => ({
  reportAdminAuthEvent: (...args: unknown[]) => mockReportAdminAuthEvent(...args),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    () => ({}),
    {
      getState: () => ({
        setSession: vi.fn(),
        clearSession: vi.fn(),
        isAuthenticated: false,
      }),
    },
  ),
}))

const { default: AdminLoginPage } = await import('../app/[locale]/login/page')

describe('Admin Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      value: { pathname: '/login', search: '', href: '' },
      writable: true,
    })
  })

  it('renders email and password form fields', () => {
    render(<AdminLoginPage />)

    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy()
  })

  it('shows error for invalid credentials and emits ADMIN_LOGIN_FAILURE', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid' },
    })

    render(<AdminLoginPage />)

    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await screen.findByText('Invalid email or password')
    expect(mockReportAdminAuthEvent).toHaveBeenCalledWith(
      'ADMIN_LOGIN_FAILURE',
      expect.objectContaining({ actorEmail: 'admin@test.com' }),
    )
  })

  it('denies access and emits failure audit when the authenticated user is not an admin', async () => {
    const user = userEvent.setup()
    // JWT payload: { sub: 'u1', user_metadata: { role: 'CLINICIAN' }, session_id: 's1' }
    const nonAdminJwt =
      'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSIsInVzZXJfbWV0YWRhdGEiOnsicm9sZSI6IkNMSU5JQ0lBTiJ9LCJzZXNzaW9uX2lkIjoiczEifQ.sig'
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'u1' },
        session: { access_token: nonAdminJwt, user: { email: 'admin@test.com' } },
      },
      error: null,
    })
    // No verified WebAuthn factor → page falls through to the role guard.
    mockListFactors.mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    })

    render(<AdminLoginPage />)

    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'pass123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await screen.findByText('Access denied — admin role required')
    expect(mockReportAdminAuthEvent).toHaveBeenCalledWith(
      'ADMIN_LOGIN_FAILURE',
      expect.objectContaining({ actorId: 'u1' }),
    )
  })

  it('advances to FIDO2 MFA step when WebAuthn factor exists', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' } },
      error: null,
    })
    mockListFactors.mockResolvedValue({
      data: {
        all: [{ id: 'f1', factor_type: 'webauthn', status: 'verified' }],
        totp: [],
      },
      error: null,
    })
    mockChallenge.mockResolvedValue({
      data: { id: 'ch1' },
      error: null,
    })

    render(<AdminLoginPage />)

    await user.type(screen.getByLabelText('Email'), 'admin@test.com')
    await user.type(screen.getByLabelText('Password'), 'pass123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await screen.findByText(/hardware security key required/i)
    expect(screen.getByRole('button', { name: 'Verify Security Key' })).toBeTruthy()
  })
})
