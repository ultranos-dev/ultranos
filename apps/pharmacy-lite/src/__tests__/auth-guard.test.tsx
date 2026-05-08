import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthGuard } from '../components/AuthGuard'
import { useAuthSessionStore } from '../stores/auth-session-store'

const mockGetSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}))

let locationHref = '/'
Object.defineProperty(window, 'location', {
  value: {
    get href() {
      return locationHref
    },
    set href(v: string) {
      locationHref = v
    },
    pathname: '/scan',
    search: '',
  },
  writable: true,
})

describe('AuthGuard (Pharmacy Lite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
    locationHref = '/'
    Object.defineProperty(window.location, 'pathname', {
      value: '/scan',
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
      expect(locationHref).toBe('/login?returnUrl=%2Fscan')
    })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when user has a valid session', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: buildMockJwt({ sub: 'u1', role: 'pharmacist', session_id: 's1', practitioner_id: 'p1' }),
          user: { email: 'rx@hospital.example' },
        },
      },
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

    expect(screen.getByText('Login Form')).toBeInTheDocument()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('renders null during loading, never children', async () => {
    let resolveSession!: (v: unknown) => void
    mockGetSession.mockReturnValue(new Promise((r) => { resolveSession = r }))

    const { container } = render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    expect(container.innerHTML).toBe('')

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

  it('rehydrates auth session store from Supabase session', async () => {
    expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: buildMockJwt({ sub: 'u-99', role: 'pharmacist', session_id: 's-99', practitioner_id: 'p-99' }),
          user: { email: 'rehydrate@rx.example' },
        },
      },
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

    const state = useAuthSessionStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.session?.userId).toBe('u-99')
    expect(state.session?.practitionerId).toBe('p-99')
  })
})

function buildMockJwt(payload: Record<string, string>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${header}.${body}.fake-signature`
}
