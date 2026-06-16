import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  back: vi.fn(),
  signInWithPassword: vi.fn(async () => ({ data: { session: null }, error: { message: 'bad' } })),
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: h.replace, back: h.back }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithPassword: h.signInWithPassword, resetPasswordForEmail: h.resetPasswordForEmail } } }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { login: () => void }) => unknown) => s({ login: vi.fn() }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))

import LoginScreen from '@/app/(auth)/login'

describe('LoginScreen (member sign-in)', () => {
  it('renders email + password and the member title; no clinical/patient toggle', () => {
    const { getByTestId, queryByTestId, getByText } = render(<LoginScreen />)
    expect(getByText('login.memberTitle')).toBeTruthy()
    expect(getByTestId('email-input')).toBeTruthy()
    expect(getByTestId('password-input')).toBeTruthy()
    expect(queryByTestId('clinical-tab')).toBeNull()
    expect(queryByTestId('patient-tab')).toBeNull()
  })

  it('calls signInWithPassword on submit', async () => {
    const { getByTestId } = render(<LoginScreen />)
    fireEvent.changeText(getByTestId('email-input'), 'a@b.co')
    fireEvent.changeText(getByTestId('password-input'), 'pw')
    fireEvent.press(getByTestId('login-button'))
    await waitFor(() => expect(h.signInWithPassword).toHaveBeenCalled())
  })

  it('triggers a reset email from forgot-password', async () => {
    const { getByTestId } = render(<LoginScreen />)
    await act(async () => { fireEvent.changeText(getByTestId('email-input'), 'a@b.co') })
    await act(async () => { fireEvent.press(getByTestId('forgot-password-button')) })
    await waitFor(() => expect(h.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co'))
  })
})
