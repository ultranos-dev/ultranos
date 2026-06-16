import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react-native'

const mockSignInWithOtp = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
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
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, unknown>) =>
      p?.seconds !== undefined ? `Resend in ${p.seconds}s` : k,
  }),
}))
vi.mock('@/components/LanguageChips', () => ({ LanguageChips: () => null }))
vi.mock('@/lib/haptics', () => ({ hapticNotification: vi.fn(), hapticSelection: vi.fn() }))
vi.mock('expo-haptics', () => ({ NotificationFeedbackType: { Error: 'error', Success: 'success' } }))

// O1: the patient-OTP resend flow moved out of login into the public register screen.
import RegisterScreen from '@/app/(auth)/register'

describe('OTP Resend Cooldown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function goToOtpCodeStep() {
    render(<RegisterScreen />)
    fireEvent.changeText(screen.getByTestId('phone-input'), '+93700000000')
    // Request OTP and flush async state (Promise resolves via microtasks, unaffected by fake timers)
    await act(async () => {
      fireEvent.press(screen.getByTestId('request-otp-button'))
    })
  }

  it('shows resend button on OTP code step', async () => {
    await goToOtpCodeStep()
    expect(screen.getByText(/Resend in/)).toBeTruthy()
  })

  it('enables resend button after cooldown expires', async () => {
    await goToOtpCodeStep()
    // Tick through 60 one-second intervals so the cooldown useEffect reaches 0
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
    }
    expect(screen.getByText('register.resendCode')).toBeTruthy()
  })
})
