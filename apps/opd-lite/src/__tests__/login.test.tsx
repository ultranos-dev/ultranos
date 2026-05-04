import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '../app/login/page'
import { useAuthSessionStore } from '../stores/auth-session-store'

// Mock Supabase client
const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn()
const mockListFactors = vi.fn()
const mockChallenge = vi.fn()
const mockVerify = vi.fn()
const mockGetSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      mfa: {
        listFactors: mockListFactors,
        challenge: mockChallenge,
        verify: mockVerify,
      },
      getSession: mockGetSession,
    },
  }),
}))

// Mock reportAuthEvent
const mockReportAuthEvent = vi.fn()
vi.mock('@/lib/trpc', () => ({
  reportAuthEvent: (...args: unknown[]) => mockReportAuthEvent(...args),
}))

// Mock window.location
const mockLocationHref = vi.fn()
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
})

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
    window.location.href = ''
  })

  it('renders credential form with email and password fields', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('shows error on failed credential submission and emits LOGIN_FAILURE', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid credentials' },
    })

    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password')
    })

    expect(mockReportAuthEvent).toHaveBeenCalledWith('LOGIN_FAILURE', {
      actorEmail: 'test@example.com',
    })
  })

  it('transitions to MFA step on successful credential submission', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1' }] },
      error: null,
    })
    mockChallenge.mockResolvedValue({
      data: { id: 'challenge-1' },
      error: null,
    })

    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'doc@hospital.com')
    await user.type(screen.getByLabelText('Password'), 'correct-pass')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeInTheDocument()
    })

    expect(mockReportAuthEvent).toHaveBeenCalledWith('LOGIN_SUCCESS', {
      actorId: 'user-123',
    })
  })

  it('shows enrollment error and signs out when no TOTP factor is enrolled', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockListFactors.mockResolvedValue({
      data: { totp: [] },
      error: null,
    })

    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'doc@hospital.com')
    await user.type(screen.getByLabelText('Password'), 'correct-pass')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'TOTP MFA is required for clinical staff',
      )
    })

    expect(mockSignOut).toHaveBeenCalled()
  })

  it('renders MFA form with TOTP input after credential success', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1' }] },
      error: null,
    })
    mockChallenge.mockResolvedValue({
      data: { id: 'challenge-1' },
      error: null,
    })

    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'doc@hospital.com')
    await user.type(screen.getByLabelText('Password'), 'correct-pass')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument()
      expect(screen.getByText('Back to sign in')).toBeInTheDocument()
    })
  })

  it('populates auth session store on successful MFA verification', async () => {
    const user = userEvent.setup()

    // Set up the full flow
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1' }] },
      error: null,
    })
    mockChallenge.mockResolvedValue({
      data: { id: 'challenge-1' },
      error: null,
    })
    mockVerify.mockResolvedValue({ error: null })

    // Create a fake JWT with claims
    const payload = {
      sub: 'user-123',
      role: 'CLINICIAN',
      session_id: 'sess-abc',
      practitioner_id: 'pract-456',
    }
    const fakeJwt = `header.${btoa(JSON.stringify(payload))}.signature`
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: fakeJwt, user: { email: 'doc@hospital.com' } } },
    })

    render(<LoginPage />)

    // Step 1: credentials
    await user.type(screen.getByLabelText('Email'), 'doc@hospital.com')
    await user.type(screen.getByLabelText('Password'), 'correct-pass')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    // Step 2: MFA
    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('TOTP Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      const session = useAuthSessionStore.getState().session
      expect(session).toEqual({
        userId: 'user-123',
        practitionerId: 'pract-456',
        role: 'CLINICIAN',
        sessionId: 'sess-abc',
        email: 'doc@hospital.com',
      })
    })

    expect(mockReportAuthEvent).toHaveBeenCalledWith('MFA_VERIFY_SUCCESS')
    expect(window.location.href).toBe('/')
  })

  it('shows error and clears TOTP input on failed MFA verification', async () => {
    const user = userEvent.setup()

    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1' }] },
      error: null,
    })
    mockChallenge.mockResolvedValue({
      data: { id: 'challenge-1' },
      error: null,
    })
    mockVerify.mockResolvedValue({
      error: { message: 'Invalid TOTP' },
    })

    render(<LoginPage />)

    // Step 1: credentials
    await user.type(screen.getByLabelText('Email'), 'doc@hospital.com')
    await user.type(screen.getByLabelText('Password'), 'correct-pass')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    // Step 2: MFA with wrong code
    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('TOTP Code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid TOTP code — please try again',
      )
    })

    expect(mockReportAuthEvent).toHaveBeenCalledWith('MFA_VERIFY_FAILURE')
    expect(screen.getByLabelText('TOTP Code')).toHaveValue('')
  })

  it('uses userId as practitionerId fallback when not in JWT claims', async () => {
    const user = userEvent.setup()

    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1' }] },
      error: null,
    })
    mockChallenge.mockResolvedValue({
      data: { id: 'challenge-1' },
      error: null,
    })
    mockVerify.mockResolvedValue({ error: null })

    // JWT without practitioner_id
    const payload = {
      sub: 'user-789',
      role: 'DOCTOR',
      session_id: 'sess-xyz',
    }
    const fakeJwt = `header.${btoa(JSON.stringify(payload))}.signature`
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: fakeJwt, user: { email: 'doc@hospital.com' } } },
    })

    render(<LoginPage />)

    await user.type(screen.getByLabelText('Email'), 'doc@hospital.com')
    await user.type(screen.getByLabelText('Password'), 'correct-pass')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('TOTP Code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => {
      const session = useAuthSessionStore.getState().session
      expect(session).toEqual({
        userId: 'user-789',
        practitionerId: 'user-789', // fallback to userId
        role: 'DOCTOR',
        sessionId: 'sess-xyz',
        email: 'doc@hospital.com',
      })
    })
  })
})
