import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockExchangeCodeForSession = vi.fn()
const mockUpdateUser = vi.fn()
const mockSignOut = vi.fn()
const mockReportAdminAuthEvent = vi.fn()
const mockRouterPush = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  }),
}))

vi.mock('@/lib/trpc', () => ({
  reportAdminAuthEvent: (...args: unknown[]) => mockReportAdminAuthEvent(...args),
}))

let mockSearchParamsValue = 'code=abc123'
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@ultranos/ui-kit', () => ({
  PasswordStrengthBar: ({ label }: { label: string }) => <div data-testid="strength-bar">{label}</div>,
  getPasswordStrength: (p: string) => (p.length >= 8 ? 2 : 0) as 0 | 1 | 2 | 3 | 4,
}))

vi.mock('@/components/LanguageSelectorClient', () => ({
  LanguageSelectorClient: () => null,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ clearSession: vi.fn() }) },
}))

import ResetPasswordPage from '../app/[locale]/reset-password/page'

describe('ResetPasswordPage (admin-portal)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsValue = 'code=abc123'
  })

  it('shows loading skeleton on mount before exchange resolves', () => {
    mockExchangeCodeForSession.mockReturnValue(new Promise(() => {}))
    render(<ResetPasswordPage />)
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('shows invalid state when no code in URL', async () => {
    mockSearchParamsValue = ''
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('linkExpiredTitle')).toBeInTheDocument()
    })
  })

  it('shows invalid state when exchangeCodeForSession fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: 'Expired' } })
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('linkExpiredTitle')).toBeInTheDocument()
    })
  })

  it('shows form when exchangeCodeForSession succeeds', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => {
      expect(screen.getByText('resetPasswordTitle')).toBeInTheDocument()
    })
  })

  it('"Update password" button is disabled when strength < 2', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'abc')
    expect(screen.getByRole('button', { name: /updatePassword/i })).toBeDisabled()
  })

  it('"Update password" button is disabled when passwords do not match', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Different1!')
    expect(screen.getByRole('button', { name: /updatePassword/i })).toBeDisabled()
  })

  it('shows mismatch error on blur when passwords differ', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    const confirmInput = screen.getByLabelText('confirmPassword')
    await userEvent.type(confirmInput, 'Different1!')
    fireEvent.blur(confirmInput)

    expect(screen.getByText('passwordMismatch')).toBeInTheDocument()
  })

  it('calls updateUser with correct password and redirects on success', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({})

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'Abcdefg1!' })
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockRouterPush).toHaveBeenCalledWith('/login?reset=success')
    })
  })

  it('emits ADMIN_PASSWORD_RESET_COMPLETED with actorId on success', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-uuid-42' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({})

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockReportAdminAuthEvent).toHaveBeenCalledWith(
        'ADMIN_PASSWORD_RESET_COMPLETED',
        { actorId: 'admin-uuid-42' },
      )
    })
  })

  it('PasswordStrengthBar reflects correct strength label as user types', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefgh')

    expect(screen.getByTestId('strength-bar')).toHaveTextContent('passwordStrengthFair')
  })

  it('shows inline error when updateUser fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'admin-1' } } },
      error: null,
    })
    mockUpdateUser.mockResolvedValue({ error: { message: 'Password too weak' } })

    render(<ResetPasswordPage />)
    await waitFor(() => screen.getByText('resetPasswordTitle'))

    await userEvent.type(screen.getByLabelText('newPassword'), 'Abcdefg1!')
    await userEvent.type(screen.getByLabelText('confirmPassword'), 'Abcdefg1!')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Password too weak')
    })
  })
})
