import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { TimelineScreen } from '@/screens/TimelineScreen'
import { AllergyDetailScreen } from '@/screens/AllergyDetailScreen'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { TimelineStackParamList } from './types'

const Stack = createNativeStackNavigator<TimelineStackParamList>()

function TimelineStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TimelineScreen" component={TimelineScreen} />
      <Stack.Screen name="AllergyDetailScreen" component={AllergyDetailScreen} />
      {/* EncounterDetailScreen will be added in future stories */}
    </Stack.Navigator>
  )
}

export function TimelineStack() {
  return (
    <ErrorBoundary>
      <TimelineStackNavigator />
    </ErrorBoundary>
  )
}
