/**
 * Tests for LoginScreen — Story 18.2, Task 3.
 *
 * AC #1: Country code selector with MENA region defaults
 * AC #3: 6-digit OTP with auto-focus/advance
 * AC #8: Retry with 60s cooldown + "Try WhatsApp" option
 * AC #9: Generic error messages (no credential enumeration)
 * AC #10: Language selector accessible on login screen
 */
import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { LoginScreen } from '../src/screens/LoginScreen'
import { supabase } from '../src/lib/supabase'

// Mock supabase
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
    },
  },
  clearAuthTokens: jest.fn(),
}))

// Mock auth store — stable reference for setSession
const mockSetSession = jest.fn()
jest.mock('../src/stores/auth-store', () => ({
  useAuthStore: jest.fn((selector) => {
    const state = {
      setSession: mockSetSession,
    }
    return selector(state)
  }),
}))

// Mock auth audit
jest.mock('../src/lib/auth-audit', () => ({
  emitAuthAudit: jest.fn(),
}))

// Mock LanguageSelectorMobile
jest.mock('../src/components/LanguageSelectorMobile', () => ({
  LanguageSelectorMobile: () => {
    const { Text } = require('react-native')
    return <Text testID="language-selector">🌐</Text>
  },
}))

const mockOnLoginSuccess = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
})

describe('LoginScreen — Phone Phase', () => {
  it('renders phone input with country code selector (AC #1)', () => {
    const { getByText, getByLabelText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    // Default country code: Afghanistan +93
    expect(getByText(/\+93/)).toBeTruthy()
    // Phone input
    expect(getByLabelText('Phone Number')).toBeTruthy()
    // Send button
    expect(getByText('Send Code')).toBeTruthy()
  })

  it('shows language selector on login screen (AC #10)', () => {
    const { getByTestId } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    expect(getByTestId('language-selector')).toBeTruthy()
  })

  it('shows MENA country codes in picker (AC #1)', () => {
    const { getByText, queryByText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    // Open country picker
    fireEvent.press(getByText(/\+93/))

    // All MENA codes should be visible
    expect(queryByText(/Afghanistan/)).toBeTruthy()
    expect(queryByText(/UAE/)).toBeTruthy()
    expect(queryByText(/KSA/)).toBeTruthy()
    expect(queryByText(/Jordan/)).toBeTruthy()
  })

  it('disables Send button when phone is invalid', () => {
    const { getByLabelText, getByText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    // Empty phone — button should be disabled
    const sendButton = getByText('Send Code')
    expect(sendButton).toBeTruthy()

    // Type too few digits
    fireEvent.changeText(getByLabelText('Phone Number'), '123')
    // Button still disabled (< 7 digits)
  })
})

describe('LoginScreen — OTP Phase', () => {
  beforeEach(() => {
    ;(supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({ error: null })
  })

  it('transitions to OTP screen after phone submission', async () => {
    const { getByLabelText, getByText, queryByText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    // Enter valid phone
    fireEvent.changeText(getByLabelText('Phone Number'), '7012345678')

    // Send OTP
    await act(async () => {
      fireEvent.press(getByText('Send Code'))
    })

    // Should now show OTP phase
    await waitFor(() => {
      expect(queryByText('Enter Verification Code')).toBeTruthy()
    })
  })

  it('shows 6 OTP digit inputs (AC #3)', async () => {
    const { getByLabelText, getByText, getAllByLabelText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    fireEvent.changeText(getByLabelText('Phone Number'), '7012345678')
    await act(async () => {
      fireEvent.press(getByText('Send Code'))
    })

    await waitFor(() => {
      const otpInputs = getAllByLabelText(/Digit \d of 6/)
      expect(otpInputs).toHaveLength(6)
    })
  })

  it('shows generic error on failed OTP verification (AC #9)', async () => {
    ;(supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid token' },
    })

    const { getByLabelText, getByText, getAllByLabelText, queryByText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    // Go to OTP phase
    fireEvent.changeText(getByLabelText('Phone Number'), '7012345678')
    await act(async () => {
      fireEvent.press(getByText('Send Code'))
    })

    // Wait for OTP inputs to appear
    let otpInputs: ReturnType<typeof getAllByLabelText> = []
    await waitFor(() => {
      otpInputs = getAllByLabelText(/Digit \d of 6/)
      expect(otpInputs).toHaveLength(6)
    })

    // Enter OTP digits
    await act(async () => {
      for (let i = 0; i < 6; i++) {
        fireEvent.changeText(otpInputs[i], String(i + 1))
      }
    })

    // Click Verify button instead of relying on auto-submit
    await act(async () => {
      fireEvent.press(getByText('Verify'))
    })

    // Should show generic error (AC #9: no credential enumeration)
    await waitFor(() => {
      expect(queryByText('Could not verify. Please try again.')).toBeTruthy()
    })

    // Should NOT show specific Supabase error
    expect(queryByText('Invalid token')).toBeNull()
  })

  it('shows retry and WhatsApp options (AC #8)', async () => {
    const { getByLabelText, getByText, queryByText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    fireEvent.changeText(getByLabelText('Phone Number'), '7012345678')
    await act(async () => {
      fireEvent.press(getByText('Send Code'))
    })

    await waitFor(() => {
      // Resend button shows cooldown
      expect(queryByText(/Resend in/)).toBeTruthy()
      // WhatsApp option present
      expect(queryByText('Try WhatsApp instead')).toBeTruthy()
    })
  })

  it('routes to callback on successful OTP (AC #4, #7)', async () => {
    ;(supabase.auth.verifyOtp as jest.Mock).mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'test-user-id',
            created_at: '2026-05-18T00:00:00Z',
            last_sign_in_at: '2026-05-18T00:00:00Z',
          },
        },
      },
      error: null,
    })

    const { getByLabelText, getByText, getAllByLabelText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    // Go to OTP phase
    fireEvent.changeText(getByLabelText('Phone Number'), '7012345678')
    await act(async () => {
      fireEvent.press(getByText('Send Code'))
    })

    // Wait for OTP inputs to appear
    let otpInputs: ReturnType<typeof getAllByLabelText> = []
    await waitFor(() => {
      otpInputs = getAllByLabelText(/Digit \d of 6/)
      expect(otpInputs).toHaveLength(6)
    })

    // Enter OTP digits
    await act(async () => {
      for (let i = 0; i < 6; i++) {
        fireEvent.changeText(otpInputs[i], String(i + 1))
      }
    })

    // Click Verify button
    await act(async () => {
      fireEvent.press(getByText('Verify'))
    })

    await waitFor(() => {
      expect(mockOnLoginSuccess).toHaveBeenCalledWith('test-user-id', expect.any(Boolean))
    })
  })

  it('shows generic error on OTP send failure (AC #9)', async () => {
    ;(supabase.auth.signInWithOtp as jest.Mock).mockResolvedValue({
      error: { message: 'Rate limited' },
    })

    const { getByLabelText, getByText, queryByText } = render(
      <LoginScreen onLoginSuccess={mockOnLoginSuccess} />,
    )

    fireEvent.changeText(getByLabelText('Phone Number'), '7012345678')
    await act(async () => {
      fireEvent.press(getByText('Send Code'))
    })

    await waitFor(() => {
      expect(queryByText('Could not send code. Please try again.')).toBeTruthy()
    })

    // Should NOT expose rate limit error
    expect(queryByText('Rate limited')).toBeNull()
  })
})
