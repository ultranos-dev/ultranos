/**
 * Tests for BiometricEnrollmentScreen — Story 18.2, Task 4.
 *
 * AC #5: On first login, biometric enrollment is triggered.
 */
import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { BiometricEnrollmentScreen, isBiometricEnrolled } from '../src/screens/BiometricEnrollmentScreen'

// Mock auth store with getState and setState support
const mockSetBiometricEnrolled = jest.fn()
const mockAuthState: Record<string, unknown> = {
  setBiometricEnrolled: mockSetBiometricEnrolled,
  userId: 'test-user-id',
  biometricEnrolled: false,
}
function mockUseAuthStore(selector: (s: Record<string, unknown>) => unknown) {
  return selector(mockAuthState)
}
mockUseAuthStore.getState = () => mockAuthState
mockUseAuthStore.setState = (partial: Record<string, unknown>) => {
  Object.assign(mockAuthState, partial)
}
jest.mock('../src/stores/auth-store', () => ({
  useAuthStore: mockUseAuthStore,
}))

// Mock auth audit
jest.mock('../src/lib/auth-audit', () => ({
  emitAuthAudit: jest.fn(),
}))

const mockOnComplete = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true)
  ;(LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true)
  ;(LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true })
})

describe('BiometricEnrollmentScreen', () => {
  it('renders enrollment prompt', () => {
    const { getByText } = render(
      <BiometricEnrollmentScreen onComplete={mockOnComplete} />,
    )

    expect(getByText('Enable Quick Unlock')).toBeTruthy()
    expect(getByText(/fingerprint\/face unlock/)).toBeTruthy()
    expect(getByText('Enable')).toBeTruthy()
    expect(getByText('Skip')).toBeTruthy()
  })

  it('enrolls biometric on Enable press (AC #5)', async () => {
    const { getByText } = render(
      <BiometricEnrollmentScreen onComplete={mockOnComplete} />,
    )

    await act(async () => {
      fireEvent.press(getByText('Enable'))
    })

    await waitFor(() => {
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalled()
      // Biometric flag stored via auth store (single source of truth), not separate SecureStore key
      expect(mockSetBiometricEnrolled).toHaveBeenCalled()
      expect(mockOnComplete).toHaveBeenCalled()
    })
  })

  it('skips enrollment without storing flag', async () => {
    const { getByText } = render(
      <BiometricEnrollmentScreen onComplete={mockOnComplete} />,
    )

    fireEvent.press(getByText('Skip'))

    expect(mockOnComplete).toHaveBeenCalled()
    expect(mockSetBiometricEnrolled).not.toHaveBeenCalled()
  })

  it('skips silently if no biometric hardware', async () => {
    ;(LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false)

    const { getByText } = render(
      <BiometricEnrollmentScreen onComplete={mockOnComplete} />,
    )

    await act(async () => {
      fireEvent.press(getByText('Enable'))
    })

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled()
    })
  })
})

describe('isBiometricEnrolled', () => {
  it('returns true when auth store has biometricEnrolled', () => {
    mockUseAuthStore.setState({ biometricEnrolled: true })
    expect(isBiometricEnrolled()).toBe(true)
  })

  it('returns false when auth store has no biometric enrollment', () => {
    mockUseAuthStore.setState({ biometricEnrolled: false })
    expect(isBiometricEnrolled()).toBe(false)
  })
})
