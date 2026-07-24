import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthSessionStore } from '../stores/auth-session-store'

// MFA is currently disabled in the login page (credentials → session → redirect),
// so these tests cover that flow plus the deterministic encryption-key derivation
// (Story 28.4) that must match AuthGuard so data survives a refresh.

// Hoisted so the vi.mock factories below (which vitest lifts to the top of the
// file) can safely reference these spies without a temporal-dead-zone error.
const { mockDeriveSessionKey, mockSetKey } = vi.hoisted(() => ({
  mockDeriveSessionKey: vi.fn().mockResolvedValue('derived-key'),
  mockSetKey: vi.fn(),
}))

const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn()
const mockGetSession = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getSession: mockGetSession,
    },
  }),
}))

const mockReportAuthEvent = vi.fn()
vi.mock('@/lib/trpc', () => ({
  reportAuthEvent: (...args: unknown[]) => mockReportAuthEvent(...args),
}))

const mockRouterPush = vi.fn()
const mockRouterReplace = vi.fn()
let mockSearchParamsValue = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/components/LanguageSelectorClient', () => ({
  LanguageSelectorClient: () => null,
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  Stethoscope: () => null,
  X: () => null,
}))

// Deterministic key derivation is the whole point of the crypto fix — mock it so
// we can assert it's called with the JWT sub (matching AuthGuard's input).
vi.mock('@ultranos/crypto', () => ({
  deriveSessionKey: (...args: unknown[]) => mockDeriveSessionKey(...args),
  generateSessionKey: vi.fn().mockResolvedValue('generated-key'),
}))

vi.mock('@/lib/encryption-key-store', () => ({
  encryptionKeyStore: { isReady: () => false, setKey: mockSetKey, wipe: vi.fn(), getKey: () => null },
  getOrCreateDeviceSalt: () => new Uint8Array(16),
}))

import LoginPage from '../app/[locale]/(auth)/login/page'

/** Build a fake (unsigned) JWT whose payload decodes to `payload`. */
function fakeJwt(payload: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`
}

const DEFAULT_PAYLOAD = {
  sub: 'user-123',
  role: 'CLINICIAN',
  session_id: 'sess-abc',
  practitioner_id: 'pract-456',
}

function mockSuccessfulSignIn(payload: Record<string, unknown> = DEFAULT_PAYLOAD) {
  mockSignInWithPassword.mockResolvedValue({ data: { user: { id: payload.sub } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: fakeJwt(payload), user: { id: payload.sub, email: 'doc@hospital.com' } } },
  })
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('email'), 'doc@hospital.com')
  await user.type(screen.getByLabelText('password'), 'correct-pass')
  await user.click(screen.getByRole('button', { name: /signIn/i }))
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthSessionStore.getState().clearSession()
    mockSearchParamsValue = ''
    window.history.replaceState({}, '', '/login')
  })

  it('renders credential form with email, password, and sign-in button', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText('email')).toBeInTheDocument()
    expect(screen.getByLabelText('password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /signIn/i })).toBeInTheDocument()
  })

  it('shows error and emits LOGIN_FAILURE on invalid credentials', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } })

    render(<LoginPage />)
    await submitCredentials(user)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('errorInvalidCredentials')
    })
    expect(mockReportAuthEvent).toHaveBeenCalledWith('LOGIN_FAILURE', { actorEmail: 'doc@hospital.com' })
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('populates the session, derives the deterministic key, and redirects on success', async () => {
    const user = userEvent.setup()
    mockSuccessfulSignIn()

    render(<LoginPage />)
    await submitCredentials(user)

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/')
    })

    expect(mockReportAuthEvent).toHaveBeenCalledWith('LOGIN_SUCCESS', { actorId: 'user-123' })
    expect(useAuthSessionStore.getState().session).toMatchObject({
      userId: 'user-123',
      practitionerId: 'pract-456',
      role: 'CLINICIAN',
      sessionId: 'sess-abc',
      email: 'doc@hospital.com',
    })
    // Key must be derived from the JWT sub (deterministic, matches AuthGuard) —
    // never a random generateSessionKey().
    expect(mockDeriveSessionKey).toHaveBeenCalledWith('user-123', expect.anything())
    expect(mockSetKey).toHaveBeenCalledWith('derived-key')
  })

  it('falls back to userId as practitionerId when the claim is absent', async () => {
    const user = userEvent.setup()
    mockSuccessfulSignIn({ sub: 'user-789', role: 'DOCTOR', session_id: 'sess-xyz' })

    render(<LoginPage />)
    await submitCredentials(user)

    await waitFor(() => {
      expect(useAuthSessionStore.getState().session).toMatchObject({
        userId: 'user-789',
        practitionerId: 'user-789',
      })
    })
    expect(mockDeriveSessionKey).toHaveBeenCalledWith('user-789', expect.anything())
  })

  it('redirects to a safe returnUrl when present', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/login?returnUrl=%2Fpatients')
    mockSuccessfulSignIn()

    render(<LoginPage />)
    await submitCredentials(user)

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/patients')
    })
  })

  it('rejects an absolute returnUrl (open-redirect prevention)', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/login?returnUrl=https%3A%2F%2Fevil.com')
    mockSuccessfulSignIn()

    render(<LoginPage />)
    await submitCredentials(user)

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/')
    })
  })
})
