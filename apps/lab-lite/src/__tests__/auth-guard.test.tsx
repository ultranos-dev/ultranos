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
    pathname: '/upload',
    search: '',
  },
  writable: true,
})

describe('AuthGuard (Lab Lite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
    locationHref = '/'
    Object.defineProperty(window.location, 'pathname', {
      value: '/upload',
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
      expect(locationHref).toBe('/login?returnUrl=%2Fupload')
    })
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when user has a valid session', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'lab-user-1',
            email: 'tech@lab.example',
            user_metadata: { practitioner_id: 'pract-lab-1' },
          },
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
          user: {
            id: 'u1',
            email: 'a@b.c',
            user_metadata: {},
          },
        },
      },
      error: null,
    })

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('rehydrates auth session store from Supabase session with LAB_TECH role', async () => {
    expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'lab-42',
            email: 'rehydrate@lab.example',
            user_metadata: { practitioner_id: 'pract-42' },
          },
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
    expect(state.session?.userId).toBe('lab-42')
    expect(state.session?.role).toBe('LAB_TECH')
    expect(state.session?.email).toBe('rehydrate@lab.example')
  })
})
