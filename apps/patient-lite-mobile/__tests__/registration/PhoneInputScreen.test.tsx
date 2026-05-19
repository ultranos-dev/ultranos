import { render, fireEvent, waitFor } from '@testing-library/react-native'

// Mock registration API
const mockRequestOtp = jest.fn().mockResolvedValue({ sent: true })
jest.mock('@/lib/registration-api', () => ({
  requestOtp: (...args: unknown[]) => mockRequestOtp(...args),
}))

// Mock auth audit
jest.mock('@/lib/auth-audit', () => ({
  emitAuthAudit: jest.fn(),
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
      primary: { 50: '#e3f2fd', 500: '#2196f3' },
      onPrimary: '#fff',
      error: '#f44336',
    },
  }),
}))

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock language selector
jest.mock('@/components/LanguageSelectorMobile', () => ({
  LanguageSelectorMobile: () => null,
}))

import { PhoneInputScreen } from '@/screens/registration/PhoneInputScreen'

describe('PhoneInputScreen — Story 27.10', () => {
  const mockOnOtpSent = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders country code selector and phone input', () => {
    const { getByLabelText, getByText } = render(
      <PhoneInputScreen onOtpSent={mockOnOtpSent} />,
    )

    expect(getByLabelText('Select country code')).toBeTruthy()
    expect(getByLabelText('auth.phoneLabel')).toBeTruthy()
    expect(getByText('auth.sendOtp')).toBeTruthy()
  })

  it('disables send button when phone is invalid', () => {
    const { getByLabelText } = render(
      <PhoneInputScreen onOtpSent={mockOnOtpSent} />,
    )

    const sendButton = getByLabelText('auth.sendOtp')
    expect(sendButton.props.accessibilityState?.disabled).toBeTruthy()
  })

  it('enables send button when phone is valid', () => {
    const { getByLabelText } = render(
      <PhoneInputScreen onOtpSent={mockOnOtpSent} />,
    )

    const phoneInput = getByLabelText('auth.phoneLabel')
    fireEvent.changeText(phoneInput, '501234567')

    const sendButton = getByLabelText('auth.sendOtp')
    expect(sendButton.props.accessibilityState?.disabled).toBeFalsy()
  })

  it('calls requestOtp and onOtpSent on successful send', async () => {
    const { getByLabelText } = render(
      <PhoneInputScreen onOtpSent={mockOnOtpSent} />,
    )

    fireEvent.changeText(getByLabelText('auth.phoneLabel'), '501234567')
    fireEvent.press(getByLabelText('auth.sendOtp'))

    await waitFor(() => {
      expect(mockRequestOtp).toHaveBeenCalledWith('+93501234567')
      expect(mockOnOtpSent).toHaveBeenCalledWith('+93501234567')
    })
  })
})
