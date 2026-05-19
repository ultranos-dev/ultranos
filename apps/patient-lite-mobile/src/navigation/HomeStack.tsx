import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeDashboardScreen } from '@/screens/HomeDashboardScreen'
import { QRFullScreen } from '@/screens/QRFullScreen'
import { SubscriptionScreen } from '@/screens/SubscriptionScreen'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { HomeStackParamList } from './types'

const Stack = createNativeStackNavigator<HomeStackParamList>()

function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeScreen" component={HomeDashboardScreen} />
      <Stack.Screen name="QRFullScreen" component={QRFullScreen} />
      <Stack.Screen name="SubscriptionScreen" component={SubscriptionScreen} />
    </Stack.Navigator>
  )
}

export function HomeStack() {
  return (
    <ErrorBoundary>
      <HomeStackNavigator />
    </ErrorBoundary>
  )
}
