import { useEffect } from 'react'
import { Stack, Redirect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import { openDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useDeviceSecurityStore } from '@/stores/device-security-store'
import { useLangStore } from '@/store/lang-store'
import { initI18n } from '@/i18n'

export default function RootLayout() {
  const { isAuthenticated, initialized, initialize } = useAuthStore()
  const setSecurityResult = useDeviceSecurityStore((s) => s.setResult)
  const langInit = useLangStore((s) => s.init)
  const langInitialized = useLangStore((s) => s.initialized)

  const [fontsLoaded] = useFonts({
    NotoNaskhArabic: require('../assets/fonts/NotoNaskhArabic-Regular.ttf'),
  })

  useEffect(() => {
    async function init() {
      setSecurityResult({ isCompromised: false, reasons: [] })
      await openDatabase()
      await langInit()
      initI18n(useLangStore.getState().lang)
      initialize()
    }
    init()
  }, [])

  if (!initialized || !langInitialized || !fontsLoaded) return null

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="drug/[atcCode]" options={{ headerShown: true, title: '' }} />
      </Stack>
      {!isAuthenticated && <Redirect href="/(auth)/login" />}
    </>
  )
}
