import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import RegisterScreen from '@/app/(auth)/register'

const mockReplace = vi.fn()
const mockPush = vi.fn()
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

const mockSignInWithOtp = vi.fn()
const mockVerifyOtp = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    },
  },
}))

const mockLogin = vi.fn()
vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: { login: typeof mockLogin }) => unknown) => sel({ login: mockLogin }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (key === 'register.enterCode' && opts?.phone) return `Enter code for ${opts.phone}`
      return key
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RegisterScreen — phone step', () => {
  it('renders phone input and send-code button', () => {
    render(<RegisterScreen />)
    expect(screen.getByTestId('phone-input')).toBeTruthy()
    expect(screen.getByTestId('request-otp-button')).toBeTruthy()
  })

  it('moves to code step after successful OTP request', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    render(<RegisterScreen />)
    fireEvent.changeText(screen.getByTestId('phone-input'), '+93701234567')
    fireEvent.press(screen.getByTestId('request-otp-button'))
    await waitFor(() => expect(screen.getByTestId('otp-input')).toBeTruthy())
  })

  it('shows error message when OTP request fails', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'Too many requests' } })
    render(<RegisterScreen />)
    fireEvent.press(screen.getByTestId('request-otp-button'))
    await waitFor(() => expect(screen.getByText('Too many requests')).toBeTruthy())
  })
})

describe('RegisterScreen — code step', () => {
  async function renderAtCodeStep() {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    render(<RegisterScreen />)
    fireEvent.changeText(screen.getByTestId('phone-input'), '+93701234567')
    fireEvent.press(screen.getByTestId('request-otp-button'))
    await waitFor(() => expect(screen.getByTestId('otp-input')).toBeTruthy())
  }

  it('calls login() and navigates to /(tabs) after successful OTP verify', async () => {
    await renderAtCodeStep()
    mockVerifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok',
          user: { id: 'uid-1', app_metadata: { role: 'PATIENT' } },
        },
      },
      error: null,
    })
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')
    fireEvent.press(screen.getByTestId('verify-otp-button'))
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('tok', { sub: 'uid-1', role: 'PATIENT', facilityId: undefined }))
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('shows error message when OTP verify fails', async () => {
    await renderAtCodeStep()
    mockVerifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid code' } })
    fireEvent.press(screen.getByTestId('verify-otp-button'))
    await waitFor(() => expect(screen.getByText('Invalid code')).toBeTruthy())
  })

  it('back button returns to phone step', async () => {
    await renderAtCodeStep()
    fireEvent.press(screen.getByTestId('register-back-button'))
    await waitFor(() => expect(screen.getByTestId('phone-input')).toBeTruthy())
  })
})

describe('RegisterScreen — sign-in link', () => {
  it('navigates to /login when sign-in link is pressed', () => {
    render(<RegisterScreen />)
    fireEvent.press(screen.getByTestId('sign-in-link'))
    expect(mockPush).toHaveBeenCalledWith('/login')
  })
})
