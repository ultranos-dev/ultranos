import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type React from 'react'
import { useAuthSessionStore } from '../stores/auth-session-store'

// ── Hoisted mock fns (vi.mock factories are hoisted above imports) ─────
const {
  mockEncounterClear,
  mockVitalsClear,
  mockDiagnosisClear,
  mockSoapNoteClear,
  mockPrescriptionClear,
  mockAllergyClear,
  mockWipe,
  mockClearSigningKeys,
  mockSignInWithPassword,
  mockSignOut,
  mockGetUser,
} = vi.hoisted(() => ({
  mockEncounterClear: vi.fn(),
  mockVitalsClear: vi.fn(),
  mockDiagnosisClear: vi.fn(),
  mockSoapNoteClear: vi.fn(),
  mockPrescriptionClear: vi.fn(),
  mockAllergyClear: vi.fn(),
  mockWipe: vi.fn(),
  mockClearSigningKeys: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetUser: vi.fn(),
}))

// ── Mock clinical stores ───────────────────────────────────────────────
vi.mock('@/stores/encounter-store', () => ({
  useEncounterStore: Object.assign(() => ({}), {
    getState: () => ({ clearPhiState: mockEncounterClear }),
  }),
}))
vi.mock('@/stores/vitals-store', () => ({
  useVitalsStore: Object.assign(() => ({}), {
    getState: () => ({ clearPhiState: mockVitalsClear }),
  }),
}))
vi.mock('@/stores/diagnosis-store', () => ({
  useDiagnosisStore: Object.assign(() => ({}), {
    getState: () => ({ clearPhiState: mockDiagnosisClear }),
  }),
}))
vi.mock('@/stores/soap-note-store', () => ({
  useSoapNoteStore: Object.assign(() => ({}), {
    getState: () => ({ clearPhiState: mockSoapNoteClear }),
  }),
}))
vi.mock('@/stores/prescription-store', () => ({
  usePrescriptionStore: Object.assign(() => ({}), {
    getState: () => ({ clearPhiState: mockPrescriptionClear }),
  }),
}))
vi.mock('@/stores/allergy-store', () => ({
  useAllergyStore: Object.assign(() => ({}), {
    getState: () => ({ clearPhiState: mockAllergyClear }),
  }),
}))

// ── Mock encryption/signing key stores ─────────────────────────────────
vi.mock('@/lib/encryption-key-store', () => ({
  encryptionKeyStore: { wipe: mockWipe },
}))
vi.mock('@/lib/signing-key-store', () => ({
  clearSigningKeys: mockClearSigningKeys,
}))

// ── Mock Supabase client ───────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getUser: mockGetUser,
    },
  }),
}))

// ── Mock SessionManagerProvider to capture props ───────────────────────
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

// ── Import after mocks ────────────────────────────────────────────────
import { SessionTimeoutWrapper } from '../components/SessionTimeoutWrapper'

// ── Mock window.location ───────────────────────────────────────────────
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
})

describe('SessionTimeoutWrapper', () => {
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

  it('renders SessionManagerProvider with correct props when authenticated', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'u1',
      practitionerId: 'p1',
      role: 'CLINICIAN',
      sessionId: 's1',
      email: 'doc@hospital.com',
    })

    render(
      <SessionTimeoutWrapper>
        <div data-testid="child">Hello</div>
      </SessionTimeoutWrapper>,
    )

    expect(screen.getByTestId('session-manager-provider')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()

    // Verify config props
    expect(capturedProps.maxDurationMs).toBe(8 * 60 * 60 * 1000) // CLINICIAN = 8h
    expect(capturedProps.inactivityMs).toBe(30 * 60 * 1000) // 30 min
    expect(capturedProps.userEmail).toBe('doc@hospital.com')
    expect(typeof capturedProps.onExpired).toBe('function')
    expect(typeof capturedProps.onReAuth).toBe('function')
  })

  it('uses PHARMACIST duration for PHARMACIST role', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'u1',
      practitionerId: 'p1',
      role: 'PHARMACIST',
      sessionId: 's1',
      email: 'pharm@hospital.com',
    })

    render(
      <SessionTimeoutWrapper>
        <div>content</div>
      </SessionTimeoutWrapper>,
    )

    expect(capturedProps.maxDurationMs).toBe(12 * 60 * 60 * 1000) // PHARMACIST = 12h
  })

  it('uses DOCTOR duration (8h) for DOCTOR role', () => {
    useAuthSessionStore.getState().setSession({
      userId: 'u1',
      practitionerId: 'p1',
      role: 'DOCTOR',
      sessionId: 's1',
      email: 'doc@hospital.com',
    })

    render(
      <SessionTimeoutWrapper>
        <div>content</div>
      </SessionTimeoutWrapper>,
    )

    expect(capturedProps.maxDurationMs).toBe(8 * 60 * 60 * 1000) // DOCTOR = 8h
  })

  it('falls back to CLINICIAN duration for unknown roles', () => {
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

    expect(capturedProps.maxDurationMs).toBe(8 * 60 * 60 * 1000) // fallback to CLINICIAN
  })

  describe('onExpired callback', () => {
    it('calls all clearPhiState methods, wipes keys, signs out, and redirects', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'CLINICIAN',
        sessionId: 's1',
        email: 'doc@hospital.com',
      })

      mockSignOut.mockResolvedValue({ error: null })

      render(
        <SessionTimeoutWrapper>
          <div>content</div>
        </SessionTimeoutWrapper>,
      )

      const onExpired = capturedProps.onExpired as () => Promise<void>
      await onExpired()

      // All 6 clinical stores cleared
      expect(mockEncounterClear).toHaveBeenCalledOnce()
      expect(mockVitalsClear).toHaveBeenCalledOnce()
      expect(mockDiagnosisClear).toHaveBeenCalledOnce()
      expect(mockSoapNoteClear).toHaveBeenCalledOnce()
      expect(mockPrescriptionClear).toHaveBeenCalledOnce()
      expect(mockAllergyClear).toHaveBeenCalledOnce()

      // Cryptographic keys wiped
      expect(mockWipe).toHaveBeenCalledOnce()
      expect(mockClearSigningKeys).toHaveBeenCalledOnce()

      // Auth cleared
      expect(useAuthSessionStore.getState().isAuthenticated).toBe(false)

      // Supabase signed out
      expect(mockSignOut).toHaveBeenCalledOnce()

      // Redirected to login
      expect(window.location.href).toBe('/login')
    })
  })

  describe('onReAuth callback', () => {
    it('returns true on successful re-authentication', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'CLINICIAN',
        sessionId: 's1',
        email: 'doc@hospital.com',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'doc@hospital.com' } },
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
        email: 'doc@hospital.com',
        password: 'correct-password',
      })
    })

    it('returns false on failed re-authentication', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'CLINICIAN',
        sessionId: 's1',
        email: 'doc@hospital.com',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'doc@hospital.com' } },
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
        role: 'CLINICIAN',
        sessionId: 's1',
        email: 'doc@hospital.com',
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
        email: 'doc@hospital.com',
        password: 'correct-password',
      })
    })

    it('returns false when both getUser and store email are unavailable', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'CLINICIAN',
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
        role: 'CLINICIAN',
        sessionId: 's1',
        email: 'doc@hospital.com',
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
        email: 'doc@hospital.com',
        password: 'correct-password',
      })
    })

    it('returns false when signInWithPassword throws', async () => {
      useAuthSessionStore.getState().setSession({
        userId: 'u1',
        practitionerId: 'p1',
        role: 'CLINICIAN',
        sessionId: 's1',
        email: 'doc@hospital.com',
      })

      mockGetUser.mockResolvedValue({
        data: { user: { email: 'doc@hospital.com' } },
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
