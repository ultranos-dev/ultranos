import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockResetPasswordForEmail = vi.fn()
const mockReportAdminAuthEvent = vi.fn()
const mockRouterPush = vi.fn()
const mockRouterReplace = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args) },
  }),
}))

vi.mock('@/lib/trpc', () => ({
  reportAdminAuthEvent: (...args: unknown[]) => mockReportAdminAuthEvent(...args),
}))

let mockSearchParamsValue = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsValue),
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/LanguageSelectorClient', () => ({
  LanguageSelectorClient: () => null,
}))

import ForgotPasswordPage from '../app/[locale]/forgot-password/page'

describe('ForgotPasswordPage (admin-portal)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsValue = ''
  })

  it('renders email form with submit button', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sendResetLink/i })).toBeInTheDocument()
  })

  it('pre-fills email from ?email= query param', () => {
    mockSearchParamsValue = 'email=admin%40hospital.example'
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('admin@hospital.example')
  })

  it('calls resetPasswordForEmail with correct redirectTo on submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('admin@hospital.example', {
        redirectTo: expect.stringContaining('/reset-password'),
      })
    })
  })

  it('transitions to success state on successful submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByText('checkYourEmail')).toBeInTheDocument()
    })
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('emits ADMIN_PASSWORD_RESET_REQUESTED with no email in payload', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockReportAdminAuthEvent).toHaveBeenCalledWith('ADMIN_PASSWORD_RESET_REQUESTED')
    })
    const callArgs = mockReportAdminAuthEvent.mock.calls[0]
    expect(callArgs[1]).toBeUndefined()
  })

  it('shows inline error when Supabase returns error', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Rate limit exceeded' } })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'admin@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('resetRequestFailed')
    })
  })

  it('"Resend" link is hidden initially and visible after 60s', async () => {
    vi.useFakeTimers()
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    // Trigger form submit and flush all async state updates via act
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
        target: { value: 'admin@hospital.example' },
      })
      fireEvent.submit(screen.getByRole('form'))
    })

    expect(screen.getByText('checkYourEmail')).toBeInTheDocument()
    expect(screen.queryByText('resend')).not.toBeInTheDocument()

    // Advance past the 60s cooldown and flush React updates
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByText('resend')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('"Back to sign in" link points to /login', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('link', { name: /backToSignIn/i })).toHaveAttribute('href', '/login')
  })
})
