import { render, fireEvent } from '@testing-library/react-native'

// Mock registration API
jest.mock('@/lib/registration-api', () => ({
  requestOtp: jest.fn().mockResolvedValue({ sent: true }),
}))

// Mock theme
jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      surface: '#fff',
      surfaceElevated: '#f5f5f5',
      textPrimary: '#000',
      textSecondary: '#666',
      textMuted: '#999',
      border: '#ddd',
      primary: { 500: '#2196f3' },
      onPrimary: '#fff',
      error: '#f44336',
    },
  }),
}))

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'auth.expiresIn') return `${params?.minutes}:${params?.seconds}`
      return key
    },
  }),
}))

import { OtpVerificationScreen } from '@/screens/registration/OtpVerificationScreen'

describe('OtpVerificationScreen — Story 27.10', () => {
  const mockOnVerified = jest.fn()
  const mockOnBack = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders 6 OTP digit inputs', () => {
    const { getAllByLabelText } = render(
      <OtpVerificationScreen
        phone="+971501234567"
        onVerified={mockOnVerified}
        onBack={mockOnBack}
      />,
    )

    const otpInputs = getAllByLabelText(/Digit \d of 6/)
    expect(otpInputs).toHaveLength(6)
  })

  it('shows resend timer countdown', () => {
    const { getByText } = render(
      <OtpVerificationScreen
        phone="+971501234567"
        onVerified={mockOnVerified}
        onBack={mockOnBack}
      />,
    )

    // Should show countdown, not the resend button text
    expect(getByText(/auth.resendIn/)).toBeTruthy()
  })

  it('calls onBack when back button pressed', () => {
    const { getByText } = render(
      <OtpVerificationScreen
        phone="+971501234567"
        onVerified={mockOnVerified}
        onBack={mockOnBack}
      />,
    )

    fireEvent.press(getByText(/common.back/))
    expect(mockOnBack).toHaveBeenCalled()
  })

  it('calls onVerified when 6 digits entered and verify pressed', () => {
    const { getAllByLabelText, getByLabelText } = render(
      <OtpVerificationScreen
        phone="+971501234567"
        onVerified={mockOnVerified}
        onBack={mockOnBack}
      />,
    )

    const otpInputs = getAllByLabelText(/Digit \d of 6/)
    const digits = ['1', '2', '3', '4', '5', '6']
    digits.forEach((d, i) => fireEvent.changeText(otpInputs[i], d))

    fireEvent.press(getByLabelText('auth.verifyButton'))
    expect(mockOnVerified).toHaveBeenCalledWith('123456')
  })
})
