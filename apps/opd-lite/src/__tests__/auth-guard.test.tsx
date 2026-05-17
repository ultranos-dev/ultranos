import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthGuard } from '../components/AuthGuard'
import { useAuthSessionStore } from '../stores/auth-session-store'

// Mock Supabase client
const mockGetSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}))

// Track window.location.href assignments
let locationHref = '/'
Object.defineProperty(window, 'location', {
  value: {
    get href() {
      return locationHref
    },
    set href(v: string) {
      locationHref = v
    },
    pathname: '/dashboard',
    search: '',
  },
  writable: true,
})

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
    locationHref = '/'
    // Reset pathname for each test
    Object.defineProperty(window.location, 'pathname', {
      value: '/dashboard',
      writable: true,
    })
    Object.defineProperty(window.location, 'search', {
      value: '',
      writable: true,
    })
  })

  it('redirects unauthenticated user to /login with returnUrl', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(locationHref).toBe('/login?returnUrl=%2Fdashboard')
    })

    // Protected content should never render
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when user has a valid session', async () => {
    const mockSession = {
      access_token: buildMockJwt({
        sub: 'user-1',
        role: 'clinician',
        session_id: 'sess-1',
        practitioner_id: 'pract-1',
      }),
      user: { email: 'doc@hospital.example' },
    }
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('renders children on /login without auth check', () => {
    Object.defineProperty(window.location, 'pathname', {
      value: '/login',
      writable: true,
    })

    render(
      <AuthGuard>
        <div>Login Form</div>
      </AuthGuard>,
    )

    // Login page renders immediately, no redirect
    expect(screen.getByText('Login Form')).toBeInTheDocument()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('renders null during loading state, never children', async () => {
    // Create a promise that won't resolve immediately
    let resolveSession!: (v: unknown) => void
    const pendingPromise = new Promise((resolve) => {
      resolveSession = resolve
    })
    mockGetSession.mockReturnValue(pendingPromise)

    const { container } = render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    // While loading, no children should render
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(container.innerHTML).toBe('')

    // Now resolve to show children
    resolveSession({
      data: {
        session: {
          access_token: buildMockJwt({ sub: 'u1', role: 'r', session_id: 's', practitioner_id: 'p' }),
          user: { email: 'a@b.c' },
        },
      },
      error: null,
    })

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('redirects PENDING_VERIFICATION doctor to /kyc', async () => {
    const mockSession = {
      access_token: buildMockJwt({
        sub: 'user-1',
        role: 'DOCTOR',
        session_id: 'sess-1',
        practitioner_id: 'pract-1',
        kyc_status: 'PENDING_VERIFICATION',
      }),
      user: { email: 'doc@hospital.example' },
    }
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(locationHref).toBe('/kyc')
    })

    // Protected content should NOT render
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('allows ACTIVE doctor to access clinical features', async () => {
    const mockSession = {
      access_token: buildMockJwt({
        sub: 'user-1',
        role: 'DOCTOR',
        session_id: 'sess-1',
        practitioner_id: 'pract-1',
        kyc_status: 'ACTIVE',
      }),
      user: { email: 'doc@hospital.example' },
    }
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    // Should NOT redirect to /kyc
    expect(locationHref).not.toBe('/kyc')
  })

  it('renders children on /kyc without entitlement gate after auth check', async () => {
    Object.defineProperty(window.location, 'pathname', {
      value: '/kyc',
      writable: true,
    })

    const mockSession = {
      access_token: buildMockJwt({
        sub: 'user-1',
        role: 'DOCTOR',
        session_id: 'sess-1',
        practitioner_id: 'pract-1',
        kyc_status: 'PENDING_VERIFICATION',
      }),
      user: { email: 'doc@hospital.example' },
    }
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(
      <AuthGuard>
        <div>KYC Form</div>
      </AuthGuard>,
    )

    // KYC page renders after auth check, without entitlement gate
    await waitFor(() => {
      expect(screen.getByText('KYC Form')).toBeInTheDocument()
    })
  })

  it('redirects REJECTED doctor to /kyc', async () => {
    const mockSession = {
      access_token: buildMockJwt({
        sub: 'user-1',
        role: 'DOCTOR',
        session_id: 'sess-1',
        practitioner_id: 'pract-1',
        kyc_status: 'REJECTED',
      }),
      user: { email: 'doc@hospital.example' },
    }
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(locationHref).toBe('/kyc')
    })
  })

  it('rehydrates auth session store from Supabase session on hard refresh', async () => {
    // Zustand store is empty (simulates hard refresh)
    expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)

    const mockSession = {
      access_token: buildMockJwt({
        sub: 'user-42',
        role: 'doctor',
        session_id: 'sess-abc',
        practitioner_id: 'pract-42',
      }),
      user: { email: 'refresh@hospital.example' },
    }
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    // Auth store should now be populated
    const state = useAuthSessionStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.session?.userId).toBe('user-42')
    expect(state.session?.role).toBe('doctor')
    expect(state.session?.practitionerId).toBe('pract-42')
    expect(state.session?.email).toBe('refresh@hospital.example')
  })
})

/**
 * Build a mock JWT with the given payload claims.
 * The header and signature are dummy values — only the payload is decoded by AuthGuard.
 */
function buildMockJwt(payload: Record<string, string>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${body}.fake-signature`
}
