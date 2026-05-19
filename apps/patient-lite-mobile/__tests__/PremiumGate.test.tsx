import { render, fireEvent } from '@testing-library/react-native'
import { I18nManager } from 'react-native'
import { Text } from 'react-native'

/**
 * Story 27.11 Task 8.2: PremiumGate component tests
 *
 * - PREMIUM tier: renders children
 * - FREE tier: renders locked overlay with feature description
 * - CTA button present
 * - Accessible labels present
 * - RTL layout renders correctly
 */

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
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
    },
  }),
}))

// Import store to manipulate state directly
import { usePatientTierStore } from '@/stores/patient-tier-store'
import { PremiumGate } from '@/components/PremiumGate'

beforeEach(() => {
  usePatientTierStore.setState({ patientTier: 'FREE' })
  I18nManager.forceRTL(false)
})

describe('PremiumGate', () => {
  it('renders children when tier is PREMIUM', () => {
    usePatientTierStore.setState({ patientTier: 'PREMIUM' })

    const { getByText, queryByTestId } = render(
      <PremiumGate
        featureId="MEDICAL_HISTORY_EXPORT"
        featureTitle="Medical History Export"
        featureDescription="Download your records."
      >
        <Text>Premium Content</Text>
      </PremiumGate>,
    )

    expect(getByText('Premium Content')).toBeTruthy()
    expect(queryByTestId('premium-gate-MEDICAL_HISTORY_EXPORT')).toBeNull()
  })

  it('renders locked overlay when tier is FREE', () => {
    usePatientTierStore.setState({ patientTier: 'FREE' })

    const { getByText, getByTestId, queryByText } = render(
      <PremiumGate
        featureId="GUARDIAN_LINKING"
        featureTitle="Guardian Linking"
        featureDescription="Link a trusted guardian to manage your health."
      >
        <Text>Premium Content</Text>
      </PremiumGate>,
    )

    expect(getByTestId('premium-gate-GUARDIAN_LINKING')).toBeTruthy()
    expect(getByText('Guardian Linking')).toBeTruthy()
    expect(getByText('Link a trusted guardian to manage your health.')).toBeTruthy()
    expect(queryByText('Premium Content')).toBeNull()
  })

  it('shows upgrade CTA button', () => {
    usePatientTierStore.setState({ patientTier: 'FREE' })

    const { getByTestId } = render(
      <PremiumGate
        featureId="NOTIFICATION_CENTER"
        featureTitle="Notifications"
        featureDescription="Get alerts."
      >
        <Text>Content</Text>
      </PremiumGate>,
    )

    const ctaButton = getByTestId('premium-upgrade-cta')
    expect(ctaButton).toBeTruthy()
  })

  it('has accessible labels for locked state', () => {
    usePatientTierStore.setState({ patientTier: 'FREE' })

    const { getByTestId } = render(
      <PremiumGate
        featureId="PRESCRIPTION_HISTORY"
        featureTitle="Prescription History"
        featureDescription="View your prescriptions."
      >
        <Text>Content</Text>
      </PremiumGate>,
    )

    const gate = getByTestId('premium-gate-PRESCRIPTION_HISTORY')
    expect(gate.props.accessibilityLabel).toBe(
      'Premium feature, upgrade required',
    )
  })

  it('re-renders when tier changes from FREE to PREMIUM', () => {
    usePatientTierStore.setState({ patientTier: 'FREE' })

    const { queryByText, getByText, rerender } = render(
      <PremiumGate
        featureId="MEDICAL_HISTORY_EXPORT"
        featureTitle="Export"
        featureDescription="Download records."
      >
        <Text>Premium Content</Text>
      </PremiumGate>,
    )

    expect(queryByText('Premium Content')).toBeNull()

    // Upgrade tier
    usePatientTierStore.setState({ patientTier: 'PREMIUM' })

    // Re-render to pick up Zustand change
    rerender(
      <PremiumGate
        featureId="MEDICAL_HISTORY_EXPORT"
        featureTitle="Export"
        featureDescription="Download records."
      >
        <Text>Premium Content</Text>
      </PremiumGate>,
    )

    expect(getByText('Premium Content')).toBeTruthy()
  })

  it('renders correctly in RTL layout', () => {
    I18nManager.forceRTL(true)
    usePatientTierStore.setState({ patientTier: 'FREE' })

    const { getByTestId, getByText } = render(
      <PremiumGate
        featureId="GUARDIAN_LINKING"
        featureTitle="Guardian Linking"
        featureDescription="Link a guardian."
      >
        <Text>Content</Text>
      </PremiumGate>,
    )

    // Component renders without errors in RTL mode
    expect(getByTestId('premium-gate-GUARDIAN_LINKING')).toBeTruthy()
    expect(getByText('Guardian Linking')).toBeTruthy()

    I18nManager.forceRTL(false)
  })
})
