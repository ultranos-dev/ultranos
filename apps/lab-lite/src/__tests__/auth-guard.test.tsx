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

// AuthGuard tracks the live pathname via next/navigation's usePathname so that a
// client-side (soft) navigation — e.g. the post-login router.push('/') — is seen
// without a remount. Mock it with a mutable value the tests can flip.
let mockPathname = '/upload'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
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

/** Set both the router pathname and window.location.pathname in lockstep. */
function setPathname(path: string) {
  mockPathname = path
  Object.defineProperty(window.location, 'pathname', { value: path, writable: true })
}

describe('AuthGuard (Lab Lite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
    locationHref = '/'
    setPathname('/upload')
  })

  it('re-runs the session check after a soft navigation from a public page to a protected page (no remount)', async () => {
    // Start on the public login page — the guard must NOT run a session check there.
    setPathname('/login')
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'lab-1', email: 'tech@lab.example', user_metadata: {} },
        },
      },
      error: null,
    })

    const { rerender } = render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    expect(mockGetSession).not.toHaveBeenCalled()

    // Simulate the post-login router.push('/') soft navigation: the SAME AuthGuard
    // instance (mounted in the root layout) re-renders with a new pathname — it must
    // now perform the session check. The pre-fix code captured the pathname once on
    // mount, so it stayed on the public-page branch here and never established the key.
    setPathname('/')
    rerender(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(mockGetSession).toHaveBeenCalled()
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

  it('renders null during loading, never children', async () => {
    let resolveSession!: (v: unknown) => void
    mockGetSession.mockReturnValue(new Promise((r) => { resolveSession = r }))

    const { container } = render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    // During loading the guard shows a busy skeleton (never the protected children).
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()

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
