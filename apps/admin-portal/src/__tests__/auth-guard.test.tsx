/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock supabase
const mockGetSession = vi.fn()
const mockSignOut = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  }),
}))

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
}))

// Mock zustand store
const mockSetSession = vi.fn()
const mockClearSession = vi.fn()
let mockIsAuthenticated = false

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector?: (s: any) => any) => {
      const state = {
        session: null,
        isAuthenticated: mockIsAuthenticated,
        setSession: mockSetSession,
        clearSession: mockClearSession,
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        isAuthenticated: mockIsAuthenticated,
        setSession: mockSetSession,
        clearSession: mockClearSession,
      }),
    },
  ),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

const { AuthGuard } = await import('../components/AuthGuard')

/** Helper to create a fake JWT with given payload */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256' }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.fake-sig`
}

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated = false
    // Reset location mock
    Object.defineProperty(window, 'location', {
      value: { pathname: '/dashboard', search: '', href: '' },
      writable: true,
    })
  })

  it('redirects unauthenticated users to /login', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })

    render(
      <AuthGuard>
        <div>Protected content</div>
      </AuthGuard>,
    )

    // Wait for the async effect
    await vi.waitFor(() => {
      expect(window.location.href).toContain('/login')
    })
  })

  it('shows "Access Denied" for non-ADMIN roles', async () => {
    const jwt = fakeJwt({ sub: 'user-1', role: 'DOCTOR', session_id: 's1' })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: jwt,
          user: { email: 'doc@test.com' },
        },
      },
    })

    render(
      <AuthGuard>
        <div>Protected content</div>
      </AuthGuard>,
    )

    await screen.findByText('Access Denied')
    expect(
      screen.getByText(/you do not have admin privileges/i),
    ).toBeTruthy()
  })

  it('renders children for authenticated ADMIN users', async () => {
    const jwt = fakeJwt({ sub: 'admin-1', role: 'ADMIN', session_id: 's1', practitioner_id: 'p1' })
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: jwt,
          user: { email: 'admin@test.com' },
        },
      },
    })

    render(
      <AuthGuard>
        <div>Protected content</div>
      </AuthGuard>,
    )

    await screen.findByText('Protected content')
  })

  it('bypasses auth check on login page', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/login', search: '', href: '' },
      writable: true,
    })

    render(
      <AuthGuard>
        <div>Login form</div>
      </AuthGuard>,
    )

    expect(screen.getByText('Login form')).toBeTruthy()
  })
})
