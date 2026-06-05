import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockResetPasswordForEmail = vi.fn()
const mockReportAuthEvent = vi.fn()
const mockRouterPush = vi.fn()
const mockRouterReplace = vi.fn()

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  }),
}))

vi.mock('@/lib/trpc', () => ({
  reportAuthEvent: (...args: unknown[]) => mockReportAuthEvent(...args),
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

vi.mock('@ultranos/ui-kit/icons', () => ({
  Pill: () => null,
  MailCheck: () => null,
}))

import ForgotPasswordPage from '../app/[locale]/(auth)/forgot-password/page'

describe('ForgotPasswordPage (pharmacy-lite)', () => {
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
    mockSearchParamsValue = 'email=pharmacist%40hospital.example'
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue('pharmacist@hospital.example')
  })

  it('calls resetPasswordForEmail with correct redirectTo on submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'pharmacist@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('pharmacist@hospital.example', {
        redirectTo: expect.stringContaining('/reset-password'),
      })
    })
  })

  it('transitions to success state on successful submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'pharmacist@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByText('checkYourEmail')).toBeInTheDocument()
    })
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('emits PASSWORD_RESET_REQUESTED with no email in payload', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'pharmacist@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(mockReportAuthEvent).toHaveBeenCalledWith('PASSWORD_RESET_REQUESTED')
    })
    const callArgs = mockReportAuthEvent.mock.calls[0]
    expect(callArgs[1]).toBeUndefined()
  })

  it('shows inline error when Supabase returns error', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Too many requests' } })
    render(<ForgotPasswordPage />)

    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'pharmacist@hospital.example')
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('resetRequestFailed')
    })
  })

  it('"Resend" link hidden initially, visible after 60s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
        target: { value: 'pharmacist@hospital.example' },
      })
      fireEvent.submit(screen.getByRole('form'))
      // Let the async handleSubmit (resetPasswordForEmail promise) resolve
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('checkYourEmail')).toBeInTheDocument()
    expect(screen.queryByText('resend')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(screen.getByText('resend')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('"Back to sign in" link points to /login', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('link', { name: /backToSignIn/i })).toHaveAttribute('href', '/login')
  })
})
