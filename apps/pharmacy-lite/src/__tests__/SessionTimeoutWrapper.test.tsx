import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type React from 'react'
import { useAuthSessionStore } from '../stores/auth-session-store'

// ── Hoisted mock fns (vi.mock factories are hoisted above imports) ─────
const {
  mockWipe,
  mockStopAuditDrain,
  mockSignInWithPassword,
  mockSignOut,
  mockGetUser,
} = vi.hoisted(() => ({
  mockWipe: vi.fn(),
  mockStopAuditDrain: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetUser: vi.fn(),
}))

// ── Mock encryption key store ─────────────────────────────────────────
vi.mock('@/lib/encryption-key-store', () => ({
  encryptionKeyStore: { wipe: mockWipe },
}))

// ── Mock audit drain ──────────────────────────────────────────────────
vi.mock('@/lib/audit', () => ({
  stopAuditDrain: mockStopAuditDrain,
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

// ── Mock window.location ─────────────────────────────────────────────
const originalLocation = window.location

describe('SessionTimeoutWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
    capturedProps = {}
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
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

  it('renders SessionManagerProvider with correct props when authenticated', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'u1',
      practitionerId: 'p1',
      role: 'PHARMACIST',
      sessionId: 's1',
      email: 'pharm@hospital.com',
    })

    render(
      <SessionTimeoutWrapper>
        <div data-testid="child">Hello</div>
      </SessionTimeoutWrapper>,
    )

    expect(screen.getByTestId('session-manager-provider')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()

    // Verify config props — PHARMACIST = 12h
    expect(capturedProps.maxDurationMs).toBe(12 * 60 * 60 * 1000)
    expect(capturedProps.inactivityMs).toBe(30 * 60 * 1000) // 30 min
    expect(capturedProps.userEmail).toBe('pharm@hospital.com')
    expect(typeof capturedProps.onExpired).toBe('function')
    expect(typeof capturedProps.onReAuth).toBe('function')
  })

  it('falls back to PHARMACIST duration for unknown roles', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'u1',
      practitionerId: 'p1',
      role: 'UNKNOWN_ROLE',
      sessionId: 's1',
      email: 'user@hospital.com',
    })

    render(
      <SessionTimeoutWrapper>
        <div>content</div>
      </SessionTimeoutWrapper>,
    )

    expect(capturedProps.maxDurationMs).toBe(12 * 60 * 60 * 1000) // fallback to PHARMACIST
  })

  describe('onExpired callback', () => {
    it('wipes encryption key, stops audit drain, clears session, signs out, and redirects', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'PHARMACIST',
        sessionId: 's1',
        email: 'pharm@hospital.com',
      })

      mockSignOut.mockResolvedValue({ error: null })

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onExpired = capturedProps.onExpired as () => Promise<void>
      await onExpired()

      // Encryption key wiped
      expect(mockWipe).toHaveBeenCalledOnce()

      // Audit drain stopped
      expect(mockStopAuditDrain).toHaveBeenCalledOnce()

      // Auth cleared
      expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)

      // Supabase signed out
      expect(mockSignOut).toHaveBeenCalledOnce()

      // Redirected to login
      expect(window.location.href).toBe('/login')
    })

    it('still redirects to login when signOut throws', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'PHARMACIST',
        sessionId: 's1',
        email: 'pharm@hospital.com',
      })

      mockSignOut.mockRejectedValue(new Error('Network error'))

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onExpired = capturedProps.onExpired as () => Promise<void>
      await onExpired().catch(() => {})

      // Cleanup still ran
      expect(mockWipe).toHaveBeenCalledOnce()
      expect(mockStopAuditDrain).toHaveBeenCalledOnce()
      expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)

      // Redirect fires despite signOut failure
      expect(window.location.href).toBe('/login')
    })
  })

  describe('onReAuth callback', () => {
    it('returns true on successful re-authentication', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'PHARMACIST',
        sessionId: 's1',
        email: 'pharm@hospital.com',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'pharm@hospital.com' } },
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
        email: 'pharm@hospital.com',
        password: 'correct-password',
      })
    })

    it('returns false on failed re-authentication', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'PHARMACIST',
        sessionId: 's1',
        email: 'pharm@hospital.com',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'pharm@hospital.com' } },
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

    it('falls back to store email when getUser returns no email', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'PHARMACIST',
        sessionId: 's1',
        email: 'pharm@hospital.com',
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
        email: 'pharm@hospital.com',
        password: 'correct-password',
      })
    })

    it('returns false when both getUser and store email are unavailable', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'PHARMACIST',
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
        role: 'PHARMACIST',
        sessionId: 's1',
        email: 'pharm@hospital.com',
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
        email: 'pharm@hospital.com',
        password: 'correct-password',
      })
    })

    it('returns false when signInWithPassword throws', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'PHARMACIST',
        sessionId: 's1',
        email: 'pharm@hospital.com',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'pharm@hospital.com' } },
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
