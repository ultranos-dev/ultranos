import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import LoginPage from '../app/[locale]/(auth)/login/page'

// Mock Supabase client
const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn()
const mockListFactors = vi.fn()
const mockChallenge = vi.fn()
const mockVerify = vi.fn()
const mockGetSession = vi.fn()

const mockReportAuthEvent = vi.fn()
vi.mock('@/lib/trpc', () => ({
  reportAuthEvent: (...args: unknown[]) => mockReportAuthEvent(...args),
}))

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

const mockSetSession = vi.fn()
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ setSession: mockSetSession }),
  },
}))

function setupMfaFlow() {
  mockSignInWithPassword.mockResolvedValue({ data: { session: {}, user: { id: 'user-1' } }, error: null })
  mockListFactors.mockResolvedValue({
    data: { totp: [{ id: 'factor-1' }] },
    error: null,
  })
  mockChallenge.mockResolvedValue({
    data: { id: 'challenge-1' },
    error: null,
  })
  mockGetSession.mockResolvedValue({
    data: {
      session: {
        user: {
          id: 'user-1',
          email: 'tech@lab.com',
          user_metadata: { practitioner_id: 'Practitioner/p1' },
        },
      },
    },
  })
}

// Mock crypto.randomUUID if not available in jsdom
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () => 'test-uuid-1234',
    },
  })
}

async function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tech@lab.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct' } })
  await act(async () => {
    fireEvent.submit(screen.getByLabelText('Email').closest('form')!)
  })
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1', email: 'tech@lab.com', user_metadata: {} } } },
    })
  })

  it('renders the credential form initially', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText('Email')).toBeDefined()
    expect(screen.getByLabelText('Password')).toBeDefined()
    expect(screen.getByText('Sign In')).toBeDefined()
  })

  it('shows error on invalid credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid credentials' },
    })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tech@lab.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Email').closest('form')!)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Invalid email or password')
    })
  })

  it('transitions to MFA step after successful credentials with TOTP enrolled', async () => {
    setupMfaFlow()

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeDefined()
    })
  })

  it('shows error when TOTP MFA is not enrolled', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { session: {}, user: { id: 'u1' } }, error: null })
    mockListFactors.mockResolvedValue({
      data: { totp: [] },
      error: null,
    })

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('TOTP MFA is required')
    })
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('shows error on invalid TOTP code', async () => {
    setupMfaFlow()
    mockVerify.mockResolvedValue({
      error: { message: 'Invalid code' },
    })

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('TOTP Code'), { target: { value: '123456' } })
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('TOTP Code').closest('form')!)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Invalid TOTP code')
    })
  })

  it('redirects on successful MFA verification', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })

    setupMfaFlow()
    mockVerify.mockResolvedValue({ error: null })

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('TOTP Code'), { target: { value: '123456' } })
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('TOTP Code').closest('form')!)
    })

    await waitFor(() => {
      expect(window.location.href).toBe('/')
    })

    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })

  it('shows error when MFA challenge initiation fails', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { session: {}, user: { id: 'u1' } }, error: null })
    mockListFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1' }] },
      error: null,
    })
    mockChallenge.mockResolvedValue({
      data: null,
      error: { message: 'Challenge failed' },
    })

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Failed to initiate MFA challenge')
    })
  })

  it('calls reportAuthEvent on login failure', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid credentials' },
    })

    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tech@lab.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Email').closest('form')!)
    })

    await waitFor(() => {
      expect(mockReportAuthEvent).toHaveBeenCalledWith('LOGIN_FAILURE', { actorEmail: 'tech@lab.com' })
    })
  })

  it('calls reportAuthEvent on login success', async () => {
    setupMfaFlow()
    mockSignInWithPassword.mockResolvedValue({
      data: { session: {}, user: { id: 'user-123' } },
      error: null,
    })

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(mockReportAuthEvent).toHaveBeenCalledWith('LOGIN_SUCCESS', { actorId: 'user-123' })
    })
  })

  it('signs out when navigating back from MFA', async () => {
    setupMfaFlow()

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeDefined()
    })

    const backButtons = screen.getAllByText('Back to sign in')
    await act(async () => {
      fireEvent.click(backButtons[0]!)
    })

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
    })
  })

  it('allows navigating back from MFA to credentials', async () => {
    setupMfaFlow()

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeDefined()
    })

    const backButtons = screen.getAllByText('Back to sign in')
    await act(async () => {
      fireEvent.click(backButtons[0]!)
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeDefined()
    })
  })

  it('shows error when getSession returns null session after MFA', async () => {
    setupMfaFlow()
    mockVerify.mockResolvedValue({ error: null })
    mockGetSession.mockResolvedValue({
      data: { session: null },
    })

    render(<LoginPage />)
    await submitCredentials()

    await waitFor(() => {
      expect(screen.getByLabelText('TOTP Code')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('TOTP Code'), { target: { value: '123456' } })
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('TOTP Code').closest('form')!)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Session unavailable after MFA verification')
    })
    expect(mockSetSession).not.toHaveBeenCalled()
  })
})
