import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { PrivacySettingsScreen } from '@/screens/PrivacySettingsScreen'
import { GuardianLinkScreen } from '@/screens/GuardianLinkScreen'
import { PremiumGate } from '@/components/PremiumGate'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTranslation } from 'react-i18next'
import type { PrivacyStackParamList } from './types'

const Stack = createNativeStackNavigator<PrivacyStackParamList>()

function GatedGuardianLinkScreen() {
  const { t } = useTranslation()
  return (
    <PremiumGate
      featureId="GUARDIAN_LINKING"
      featureTitle={t('premium.guardianLinkingTitle', 'Guardian Linking')}
      featureDescription={t('premium.guardianLinkingDescription', 'Link a trusted guardian to manage your health records and receive updates on your behalf.')}
    >
      <GuardianLinkScreen />
    </PremiumGate>
  )
}

function PrivacyStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PrivacySettingsScreen" component={PrivacySettingsScreen} />
      <Stack.Screen name="GuardianLinkScreen" component={GatedGuardianLinkScreen} />
      {/* ExportScreen will be added in a future story */}
    </Stack.Navigator>
  )
}

export function PrivacyStack() {
  return (
    <ErrorBoundary>
      <PrivacyStackNavigator />
    </ErrorBoundary>
  )
}
