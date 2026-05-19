import { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar, Text, View } from 'react-native'
import { initI18n } from '@/i18n'

import { RootNavigator } from './src/navigation/RootNavigator'

export function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initI18n()
      .then(() => setReady(true))
      .catch(() => {
        // Fail open to English — app is usable without i18n
        setReady(true)
      })
  }, [])

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading...</Text>
      </View>
    )
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <RootNavigator />
    </NavigationContainer>
  )
}
