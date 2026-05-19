import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

/**
 * Story 27.12 Task 8: SubscriptionScreen tests
 *
 * 8.2: Renders premium feature list with price
 * 8.3: Subscribe button initiates IAP purchase flow
 * 8.4: Successful purchase calls Hub API and updates local tier state
 * 8.5: Failed purchase shows error, tier unchanged
 * 8.6: Already-premium user sees "Manage Subscription" instead of "Subscribe"
 * 8.7: Restore Purchases triggers restore flow
 */

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

jest.mock('@/theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      surface: '#FFFFFF',
      surfaceElevated: '#F5F5F5',
      border: '#E0E0E0',
      textPrimary: '#111111',
      textSecondary: '#666666',
      textMuted: '#999999',
      primary: { 500: '#6B4EFF' },
      success: { 100: '#D4EDDA', 500: '#28A745', 700: '#155724' },
      neutral: { 100: '#F0F0F0', 300: '#CCCCCC' },
      danger: { 500: '#DC3545' },
      statusBarStyle: 'dark-content',
    },
  }),
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}))

jest.mock('@/services/iap-service', () => ({
  initIAP: jest.fn().mockResolvedValue(undefined),
  getSubscriptionProduct: jest.fn().mockResolvedValue(null),
  purchaseSubscription: jest.fn().mockResolvedValue({}),
  restorePurchases: jest.fn().mockResolvedValue([]),
  acknowledgePurchase: jest.fn().mockResolvedValue(undefined),
  cleanupIAP: jest.fn().mockResolvedValue(undefined),
}))

import * as iapService from '@/services/iap-service'
const mockInitIAP = iapService.initIAP as jest.Mock
const mockGetSubscriptionProduct = iapService.getSubscriptionProduct as jest.Mock
const mockPurchaseSubscription = iapService.purchaseSubscription as jest.Mock
const mockRestorePurchases = iapService.restorePurchases as jest.Mock
const mockAcknowledgePurchase = iapService.acknowledgePurchase as jest.Mock
const mockCleanupIAP = iapService.cleanupIAP as jest.Mock

jest.mock('@/config/iap', () => ({
  getPremiumProductId: () => 'ultranos_premium_monthly',
}))

import { usePatientTierStore } from '@/stores/patient-tier-store'
import { useAuthStore } from '@/stores/auth-store'
import { SubscriptionScreen } from '@/screens/SubscriptionScreen'

const MOCK_PRODUCT = {
  productId: 'ultranos_premium_monthly',
  localizedPrice: '$4.99',
  price: '4.99',
  title: 'Ultranos Premium',
  description: 'Monthly premium subscription',
}

beforeEach(() => {
  jest.clearAllMocks()
  usePatientTierStore.setState({ patientTier: 'FREE' })
  useAuthStore.setState({ userId: 'patient-001', isAuthenticated: true })
  mockGetSubscriptionProduct.mockResolvedValue(MOCK_PRODUCT)
})

describe('SubscriptionScreen', () => {
  // 8.2: Renders premium feature list with price
  it('renders premium feature list with price for FREE tier', async () => {
    const { getByText, getByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('subscription-screen')).toBeTruthy()
    })

    // Feature list
    expect(getByText('Full Medical History')).toBeTruthy()
    expect(getByText('Health Record Export')).toBeTruthy()
    expect(getByText('Guardian Linking')).toBeTruthy()
    expect(getByText('Prescription History')).toBeTruthy()
    expect(getByText('Priority Support')).toBeTruthy()

    // Price
    expect(getByTestId('subscription-price')).toBeTruthy()
    expect(getByText('$4.99')).toBeTruthy()

    // Free tier badge
    expect(getByText('Free Plan')).toBeTruthy()
  })

  // 8.3: Subscribe button initiates IAP purchase flow
  it('subscribe button initiates purchase flow', async () => {
    mockPurchaseSubscription.mockResolvedValue({
      productId: 'ultranos_premium_monthly',
      purchaseToken: 'mock-token-123',
      transactionId: 'txn-123',
    })

    const { getByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('subscribe-button')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(getByTestId('subscribe-button'))
    })

    await waitFor(() => {
      expect(mockPurchaseSubscription).toHaveBeenCalledWith('ultranos_premium_monthly')
    })
  })

  // 8.4: Successful purchase updates local tier state
  it('successful purchase updates tier to PREMIUM', async () => {
    mockPurchaseSubscription.mockResolvedValue({
      productId: 'ultranos_premium_monthly',
      purchaseToken: 'valid-token-456',
      transactionId: 'txn-456',
    })

    const { getByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('subscribe-button')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(getByTestId('subscribe-button'))
    })

    await waitFor(() => {
      expect(usePatientTierStore.getState().patientTier).toBe('PREMIUM')
    })

    // Verify purchase was acknowledged with store
    expect(mockAcknowledgePurchase).toHaveBeenCalled()
  })

  // 8.5: Failed purchase shows error, tier unchanged
  it('failed purchase shows error and keeps FREE tier', async () => {
    mockPurchaseSubscription.mockRejectedValue(new Error('Payment declined'))

    const { getByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('subscribe-button')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(getByTestId('subscribe-button'))
    })

    await waitFor(() => {
      expect(getByTestId('subscription-error')).toBeTruthy()
    })

    // Tier should remain FREE
    expect(usePatientTierStore.getState().patientTier).toBe('FREE')
  })

  // 8.6: Already-premium user sees "Manage Subscription"
  it('premium user sees Manage Subscription instead of Subscribe', async () => {
    usePatientTierStore.setState({ patientTier: 'PREMIUM' })

    const { getByTestId, getByText, queryByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('subscription-screen')).toBeTruthy()
    })

    // Should show premium badge and manage button
    expect(getByText('Premium Plan')).toBeTruthy()
    expect(getByTestId('manage-subscription-button')).toBeTruthy()
    expect(getByText('Manage Subscription')).toBeTruthy()

    // Should NOT show subscribe button or feature list
    expect(queryByTestId('subscribe-button')).toBeNull()
    expect(queryByTestId('restore-purchases-button')).toBeNull()
  })

  // 8.7: Restore Purchases triggers restore flow
  it('restore purchases triggers restore flow and updates tier on success', async () => {
    mockRestorePurchases.mockResolvedValue([
      { productId: 'ultranos_premium_monthly', purchaseToken: 'restored-token' },
    ])

    const { getByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('restore-purchases-button')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(getByTestId('restore-purchases-button'))
    })

    await waitFor(() => {
      expect(mockRestorePurchases).toHaveBeenCalled()
      expect(usePatientTierStore.getState().patientTier).toBe('PREMIUM')
    })
  })

  it('restore purchases with no results shows error message', async () => {
    mockRestorePurchases.mockResolvedValue([])

    const { getByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('restore-purchases-button')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(getByTestId('restore-purchases-button'))
    })

    await waitFor(() => {
      expect(getByTestId('subscription-error')).toBeTruthy()
    })

    expect(usePatientTierStore.getState().patientTier).toBe('FREE')
  })

  it('shows loading state while fetching product', () => {
    // Don't resolve the product fetch yet
    mockGetSubscriptionProduct.mockReturnValue(new Promise(() => {}))

    const { getByTestId } = render(<SubscriptionScreen />)

    expect(getByTestId('subscription-loading')).toBeTruthy()
  })

  // P3: User cancellation via error code does not show error message
  it('user cancellation (E_USER_CANCELLED) does not show error', async () => {
    const cancelError = new Error('User cancelled') as Error & { code: string }
    cancelError.code = 'E_USER_CANCELLED'
    mockPurchaseSubscription.mockRejectedValue(cancelError)

    const { getByTestId, queryByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('subscribe-button')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(getByTestId('subscribe-button'))
    })

    // Wait for the purchase promise to settle
    await waitFor(() => {
      expect(mockPurchaseSubscription).toHaveBeenCalled()
    })

    // Should NOT show an error for user cancellation
    expect(queryByTestId('subscription-error')).toBeNull()
    expect(usePatientTierStore.getState().patientTier).toBe('FREE')
  })

  // P10: initIAP failure shows load error
  it('shows error when IAP initialization fails', async () => {
    mockInitIAP.mockRejectedValue(new Error('Play Services unavailable'))
    mockGetSubscriptionProduct.mockRejectedValue(new Error('Not connected'))

    const { getByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('subscription-error')).toBeTruthy()
    })
  })

  // P10: Purchase with missing token shows error
  it('purchase with no token received shows error', async () => {
    // Return a purchase object with neither purchaseToken nor transactionId
    mockPurchaseSubscription.mockResolvedValue({
      productId: 'ultranos_premium_monthly',
    })

    const { getByTestId } = render(<SubscriptionScreen />)

    await waitFor(() => {
      expect(getByTestId('subscribe-button')).toBeTruthy()
    })

    await act(async () => {
      fireEvent.press(getByTestId('subscribe-button'))
    })

    await waitFor(() => {
      expect(getByTestId('subscription-error')).toBeTruthy()
    })

    expect(usePatientTierStore.getState().patientTier).toBe('FREE')
    expect(mockAcknowledgePurchase).not.toHaveBeenCalled()
  })
})
