import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthSessionStore } from '../stores/auth-session-store'

// MFA is currently disabled in the login page (credentials → session → redirect),
// so these tests cover that flow plus the deterministic encryption-key derivation
// (Story 28.4) that must match AuthGuard so data survives a refresh.

// Hoisted so the vi.mock factories (lifted to the top of the file) can reference
// these spies without a temporal-dead-zone error.
const { mockDeriveSessionKey, mockSetKey } = vi.hoisted(() => ({
  mockDeriveSessionKey: vi.fn().mockResolvedValue({} as CryptoKey),
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
  Pill: () => null,
}))

// deriveSessionKey is the DETERMINISTIC PBKDF2 key that must match AuthGuard — the
// login page must call it (not the random generateSessionKey) so data survives refresh.
vi.mock('@ultranos/crypto', () => ({
  deriveSessionKey: (...args: unknown[]) => mockDeriveSessionKey(...args),
  generateSessionKey: vi.fn().mockResolvedValue({} as CryptoKey),
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
  role: 'PHARMACIST',
  session_id: 'sess-abc',
  practitioner_id: 'pract-456',
}

function mockSuccessfulSignIn(payload: Record<string, unknown> = DEFAULT_PAYLOAD) {
  mockSignInWithPassword.mockResolvedValue({ data: { user: { id: payload.sub } }, error: null })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: fakeJwt(payload), user: { id: payload.sub, email: 'pharm@hospital.com' } } },
  })
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('email'), 'pharm@hospital.com')
  await user.type(screen.getByLabelText('password'), 'correct-pass')
  await user.click(screen.getByRole('button', { name: /signIn/i }))
}

describe('LoginPage (pharmacy-lite)', () => {
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
      expect(screen.getByRole('alert')).toHaveTextContent('invalidCredentials')
    })
    expect(mockReportAuthEvent).toHaveBeenCalledWith('LOGIN_FAILURE', { actorEmail: 'pharm@hospital.com' })
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
      role: 'PHARMACIST',
      sessionId: 'sess-abc',
      email: 'pharm@hospital.com',
    })
    // Key must be derived from the JWT sub (deterministic, matches AuthGuard) —
    // never a random generateSessionKey().
    expect(mockDeriveSessionKey).toHaveBeenCalledWith('user-123', expect.anything())
    expect(mockSetKey).toHaveBeenCalled()
  })

  it('falls back to userId as practitionerId when the claim is absent', async () => {
    const user = userEvent.setup()
    mockSuccessfulSignIn({ sub: 'user-789', role: 'PHARMACIST', session_id: 'sess-xyz' })

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
    window.history.replaceState({}, '', '/login?returnUrl=%2Fdispense')
    mockSuccessfulSignIn()

    render(<LoginPage />)
    await submitCredentials(user)

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/dispense')
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
