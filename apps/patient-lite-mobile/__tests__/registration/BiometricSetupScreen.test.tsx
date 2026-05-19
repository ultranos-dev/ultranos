import { render, fireEvent, waitFor } from '@testing-library/react-native'
import * as LocalAuthentication from 'expo-local-authentication'

// Mock auth store
const mockSetBiometricEnrolled = jest.fn()
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: jest.fn((selector) => {
    if (typeof selector === 'function') {
      return selector({
        setBiometricEnrolled: mockSetBiometricEnrolled,
        userId: 'test-user-id',
      })
    }
    return { setBiometricEnrolled: mockSetBiometricEnrolled, userId: 'test-user-id' }
  }),
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
      textPrimary: '#000',
      textSecondary: '#666',
      textMuted: '#999',
      primary: { 500: '#2196f3' },
      onPrimary: '#fff',
    },
  }),
}))

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

import { BiometricSetupScreen } from '@/screens/registration/BiometricSetupScreen'

describe('BiometricSetupScreen — Story 27.10', () => {
  const mockOnComplete = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true)
    ;(LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true })
  })

  it('auto-skips when no biometric hardware (Task 5.5)', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false)

    render(<BiometricSetupScreen onComplete={mockOnComplete} />)

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled()
    })
  })

  it('auto-skips when biometrics not enrolled on device', async () => {
    ;(LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false)

    render(<BiometricSetupScreen onComplete={mockOnComplete} />)

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled()
    })
  })

  it('shows enrollment prompt when hardware available', async () => {
    const { findByLabelText } = render(
      <BiometricSetupScreen onComplete={mockOnComplete} />,
    )

    const enrollButton = await findByLabelText('auth.biometricEnroll')
    expect(enrollButton).toBeTruthy()
  })

  it('enrolls biometric on button press (Task 5.2, 5.3)', async () => {
    const { findByLabelText } = render(
      <BiometricSetupScreen onComplete={mockOnComplete} />,
    )

    const enrollButton = await findByLabelText('auth.biometricEnroll')
    fireEvent.press(enrollButton)

    await waitFor(() => {
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled()
      expect(mockSetBiometricEnrolled).toHaveBeenCalled()
      expect(mockOnComplete).toHaveBeenCalled()
    })
  })

  it('allows skip (Task 5.4)', async () => {
    const { findByLabelText } = render(
      <BiometricSetupScreen onComplete={mockOnComplete} />,
    )

    const skipButton = await findByLabelText('auth.biometricSkip')
    fireEvent.press(skipButton)

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled()
      expect(mockSetBiometricEnrolled).not.toHaveBeenCalled()
    })
  })
})
