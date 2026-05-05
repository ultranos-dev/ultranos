import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type React from 'react'
import { useAuthSessionStore } from '../stores/auth-session-store'

// ── Hoisted mock fns ──────────────────────────────────────────────────
const {
  mockSignInWithPassword,
  mockSignOut,
  mockGetUser,
} = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetUser: vi.fn(),
}))

// ── Mock Supabase client ──────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getUser: mockGetUser,
    },
  }),
}))

// ── Mock SessionManagerProvider to capture props ──────────────────────
let capturedProps: Record<string, unknown> = {}

vi.mock('@ultranos/ui-kit', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ultranos/ui-kit')
  return {
    ...actual,
    SessionManagerProvider: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => {
      capturedProps = props
      return <div data-testid="session-manager-provider">{children}</div>
    },
  }
})

// ── Import after mocks ───────────────────────────────────────────────
import { SessionTimeoutWrapper } from '../components/SessionTimeoutWrapper'

// ── Mock window.location ──────────────────────────────────────────────
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
})

describe('SessionTimeoutWrapper', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
    capturedProps = {}
    window.location.href = ''
  })

  it('does not render SessionManagerProvider when not authenticated', () => {
    render(
      <SessionTimeoutWrapper>
        <div data-testid="child">Hello</div>
      </SessionTimeoutWrapper>,
    )

    expect(screen.queryByTestId('session-manager-provider')).not.toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders SessionManagerProvider with correct props (8h LAB_TECH duration)', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'u1',
      practitionerId: 'p1',
      role: 'LAB_TECH',
      sessionId: 's1',
      email: 'tech@lab.example',
    })

    render(
      <SessionTimeoutWrapper>
        <div data-testid="child">Hello</div>
      </SessionTimeoutWrapper>,
    )

    expect(screen.getByTestId('session-manager-provider')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()

    // LAB_TECH = 8h
    expect(capturedProps.maxDurationMs).toBe(8 * 60 * 60 * 1000)
    // 30 min inactivity
    expect(capturedProps.inactivityMs).toBe(30 * 60 * 1000)
    expect(capturedProps.userEmail).toBe('tech@lab.example')
    expect(typeof capturedProps.onExpired).toBe('function')
    expect(typeof capturedProps.onReAuth).toBe('function')
  })

  it('falls back to LAB_TECH duration for unknown roles', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'u1',
      practitionerId: 'p1',
      role: 'UNKNOWN_ROLE',
      sessionId: 's1',
      email: 'user@lab.example',
    })

    render(
      <SessionTimeoutWrapper>
        <div>content</div>
      </SessionTimeoutWrapper>,
    )

    expect(capturedProps.maxDurationMs).toBe(8 * 60 * 60 * 1000) // fallback to LAB_TECH
  })

  describe('onExpired callback', () => {
    it('clears session, signs out, and redirects', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'LAB_TECH',
        sessionId: 's1',
        email: 'tech@lab.example',
      })

      mockSignOut.mockResolvedValue({ error: null })

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onExpired = capturedProps.onExpired as () => Promise<void>
      await onExpired()

      // Auth cleared
      expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)

      // Supabase signed out
      expect(mockSignOut).toHaveBeenCalledOnce()

      // Redirected to login
      expect(window.location.href).toBe('/login')
    })

    it('still redirects when signOut throws', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'LAB_TECH',
        sessionId: 's1',
        email: 'tech@lab.example',
      })

      mockSignOut.mockRejectedValue(new Error('network error'))

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onExpired = capturedProps.onExpired as () => Promise<void>
      // Error propagates after finally, but redirect still fires
      await expect(onExpired()).rejects.toThrow('network error')

      // Auth cleared
      expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)

      // Redirected despite signOut failure (via finally block)
      expect(window.location.href).toBe('/login')
    })
  })

  describe('onReAuth callback', () => {
    it('returns true on successful re-authentication', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'LAB_TECH',
        sessionId: 's1',
        email: 'tech@lab.example',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'tech@lab.example' } },
      })
      mockSignInWithPassword.mockResolvedValue({ error: null })

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onReAuth = capturedProps.onReAuth as (password: string) => Promise<boolean>
      const result = await onReAuth('correct-password')

      expect(result).toBe(true)
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'tech@lab.example',
        password: 'correct-password',
      })
    })

    it('returns false on failed re-authentication', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'LAB_TECH',
        sessionId: 's1',
        email: 'tech@lab.example',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'tech@lab.example' } },
      })
      mockSignInWithPassword.mockResolvedValue({
        error: { message: 'Invalid credentials' },
      })

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onReAuth = capturedProps.onReAuth as (password: string) => Promise<boolean>
      const result = await onReAuth('wrong-password')

      expect(result).toBe(false)
    })

    it('falls back to store email when getUser returns null', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'LAB_TECH',
        sessionId: 's1',
        email: 'tech@lab.example',
      })

      mockGetUser.mockResolvedValue({
        data: { user: null },
      })
      mockSignInWithPassword.mockResolvedValue({ error: null })

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onReAuth = capturedProps.onReAuth as (password: string) => Promise<boolean>
      const result = await onReAuth('correct-password')

      expect(result).toBe(true)
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'tech@lab.example',
        password: 'correct-password',
      })
    })

    it('returns false when both getUser and store email are unavailable', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'LAB_TECH',
        sessionId: 's1',
        email: '',
      })

      mockGetUser.mockResolvedValue({
        data: { user: null },
      })

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onReAuth = capturedProps.onReAuth as (password: string) => Promise<boolean>
      const result = await onReAuth('any-password')

      expect(result).toBe(false)
      expect(mockSignInWithPassword).not.toHaveBeenCalled()
    })

    it('falls back to store email when getUser throws', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'LAB_TECH',
        sessionId: 's1',
        email: 'tech@lab.example',
      })

      mockGetUser.mockRejectedValue(new Error('Network error'))
      mockSignInWithPassword.mockResolvedValue({ error: null })

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onReAuth = capturedProps.onReAuth as (password: string) => Promise<boolean>
      const result = await onReAuth('correct-password')

      expect(result).toBe(true)
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'tech@lab.example',
        password: 'correct-password',
      })
    })

    it('returns false when signInWithPassword throws', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'LAB_TECH',
        sessionId: 's1',
        email: 'tech@lab.example',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'tech@lab.example' } },
      })
      mockSignInWithPassword.mockRejectedValue(new Error('Network error'))

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onReAuth = capturedProps.onReAuth as (password: string) => Promise<boolean>
      const result = await onReAuth('any-password')

      expect(result).toBe(false)
    })
  })
})
