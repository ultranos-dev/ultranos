import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { NotificationsScreen } from '@/screens/NotificationsScreen'
import { NotificationDetailScreen } from '@/screens/NotificationDetailScreen'
import { PremiumGate } from '@/components/PremiumGate'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTranslation } from 'react-i18next'
import type { NotificationsStackParamList } from './types'

const Stack = createNativeStackNavigator<NotificationsStackParamList>()

function GatedNotificationsScreen() {
  const { t } = useTranslation()
  return (
    <PremiumGate
      featureId="NOTIFICATION_CENTER"
      featureTitle={t('premium.notificationCenterTitle', 'Notification Center')}
      featureDescription={t('premium.notificationCenterDescription', 'Receive medication reminders, appointment alerts, and important health updates.')}
    >
      <NotificationsScreen />
    </PremiumGate>
  )
}

function GatedNotificationDetailScreen() {
  const { t } = useTranslation()
  return (
    <PremiumGate
      featureId="NOTIFICATION_CENTER"
      featureTitle={t('premium.notificationCenterTitle', 'Notification Center')}
      featureDescription={t('premium.notificationCenterDescription', 'Receive medication reminders, appointment alerts, and important health updates.')}
    >
      <NotificationDetailScreen />
    </PremiumGate>
  )
}

function NotificationsStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NotificationsScreen" component={GatedNotificationsScreen} />
      <Stack.Screen name="NotificationDetailScreen" component={GatedNotificationDetailScreen} />
    </Stack.Navigator>
  )
}

export function NotificationsStack() {
  return (
    <ErrorBoundary>
      <NotificationsStackNavigator />
    </ErrorBoundary>
  )
}
