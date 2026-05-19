/**
 * Root stack navigator: PatientSearch → PatientSummary
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { PatientSearchScreen } from '../screens/PatientSearchScreen'
import { PatientSummaryScreen } from '../screens/PatientSummaryScreen'
import type { RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="PatientSearch"
      screenOptions={{
        headerStyle: { backgroundColor: '#FFFFFF' },
        headerTintColor: '#0F172A',
        headerTitleStyle: { fontWeight: '900' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="PatientSearch"
        component={PatientSearchScreen}
        options={{ title: 'OPD Lite', headerBackVisible: false }}
      />
      <Stack.Screen
        name="PatientSummary"
        component={PatientSummaryScreen}
        options={{ title: 'Patient Summary' }}
      />
    </Stack.Navigator>
  )
}
