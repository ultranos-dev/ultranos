import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'

const mockResetPassword = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      resetPasswordForEmail: mockResetPassword,
    },
  },
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ login: vi.fn(), token: null, user: null, isAuthenticated: false }),
}))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', textPrimary: '#111', textSecondary: '#666', textMuted: '#999',
    primary500: '#2e9e71', white: '#fff', border: '#e5e5e5',
    danger: '#dc2626', successDark: '#166534',
  }),
}))

vi.mock('expo-router', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/components/LanguageChips', () => ({ LanguageChips: () => null }))
vi.mock('@/lib/haptics', () => ({ hapticNotification: vi.fn() }))
vi.mock('expo-haptics', () => ({ NotificationFeedbackType: { Error: 'error', Success: 'success' } }))

import LoginScreen from '@/app/(auth)/login'

describe('Password Reset Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows forgot password link on clinical tab', () => {
    render(<LoginScreen />)
    expect(screen.getByText('login.forgotPassword')).toBeTruthy()
  })

  it('sends reset email on tap', async () => {
    mockResetPassword.mockResolvedValue({ error: null })
    render(<LoginScreen />)
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('email-input'), 'doc@clinic.af')
    })
    fireEvent.press(screen.getByTestId('forgot-password-button'))
    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('doc@clinic.af')
    })
  })

  it('shows error when reset fails', async () => {
    mockResetPassword.mockResolvedValue({ error: { message: 'User not found' } })
    render(<LoginScreen />)
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('email-input'), 'nobody@test.com')
    })
    fireEvent.press(screen.getByTestId('forgot-password-button'))
    await waitFor(() => {
      expect(screen.getByText('login.resetFailed')).toBeTruthy()
    })
  })
})
