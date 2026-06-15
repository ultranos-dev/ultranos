import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import LoginScreen from '../../app/(auth)/login'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
      signInWithPassword: jest.fn(),
    },
  },
}))

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }))

const mockSignInWithPassword = supabase.auth.signInWithPassword as jest.Mock
const mockSignInWithOtp = supabase.auth.signInWithOtp as jest.Mock
const mockVerifyOtp = supabase.auth.verifyOtp as jest.Mock

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, isAuthenticated: false, initialized: true })
  jest.clearAllMocks()
})

describe('LoginScreen — clinical staff flow', () => {
  it('calls signInWithPassword and sets auth-store on success', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'jwt-token',
          user: { id: 'u1', app_metadata: { role: 'DOCTOR' } },
        },
      },
      error: null,
    })

    const { getByTestId } = render(<LoginScreen />)

    // Default to clinical tab
    fireEvent.changeText(getByTestId('email-input'), 'doctor@clinic.org')
    fireEvent.changeText(getByTestId('password-input'), 'password123')
    fireEvent.press(getByTestId('login-button'))

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().token).toBe('jwt-token')
    })
  })

  it('shows error message on failed login', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid credentials' },
    })

    const { getByTestId, findByText } = render(<LoginScreen />)
    fireEvent.changeText(getByTestId('email-input'), 'bad@email.com')
    fireEvent.changeText(getByTestId('password-input'), 'wrong')
    fireEvent.press(getByTestId('login-button'))

    expect(await findByText(/Invalid credentials/i)).toBeTruthy()
  })
})

describe('LoginScreen — patient OTP flow', () => {
  it('requests OTP on phone submit', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null })

    const { getByTestId } = render(<LoginScreen />)
    fireEvent.press(getByTestId('patient-tab'))
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    fireEvent.press(getByTestId('request-otp-button'))

    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+93700000000' }))
  })

  it('verifies OTP and sets auth-store on success', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null })
    mockVerifyOtp.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'patient-jwt',
          user: { id: 'p1', app_metadata: { role: 'PATIENT' } },
        },
      },
      error: null,
    })

    const { getByTestId } = render(<LoginScreen />)
    fireEvent.press(getByTestId('patient-tab'))
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    fireEvent.press(getByTestId('request-otp-button'))
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalled())

    fireEvent.changeText(getByTestId('otp-input'), '123456')
    fireEvent.press(getByTestId('verify-otp-button'))

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().token).toBe('patient-jwt')
    })
  })

  it('shows error on failed OTP verification', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null })
    mockVerifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Token has expired or is invalid' },
    })

    const { getByTestId, findByText } = render(<LoginScreen />)
    fireEvent.press(getByTestId('patient-tab'))
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    fireEvent.press(getByTestId('request-otp-button'))
    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalled())

    fireEvent.changeText(getByTestId('otp-input'), '000000')
    fireEvent.press(getByTestId('verify-otp-button'))

    expect(await findByText(/Token has expired or is invalid/i)).toBeTruthy()
  })
})
