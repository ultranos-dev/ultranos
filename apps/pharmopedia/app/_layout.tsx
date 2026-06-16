import { useEffect, useState } from 'react'
import { Appearance } from 'react-native'
import { Stack, Redirect } from 'expo-router'
// Suppress react-native-screens passing pointerEvents as a prop on web (library bug, not our code)
if (__DEV__) {
  const _warn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('props.pointerEvents is deprecated')) return
    _warn(...args)
  }
}
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope'
import {
  PublicSans_400Regular,
  PublicSans_700Bold,
} from '@expo-google-fonts/public-sans'
import { openDatabase, getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useDeviceSecurityStore } from '@/stores/device-security-store'
import { useLangStore } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { useCoachMarkStore } from '@/store/coach-mark-store'
import { useRecentSearchStore } from '@/store/recent-search-store'
import { useThemeStore } from '@/store/theme-store'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { initI18n } from '@/i18n'
import { hasSeenWelcome } from './welcome'
import { UiKitProvider } from '@ultranos/ui-kit/native'
import { isRtlLang } from '@/store/lang-store'

export default function RootLayout() {
  const { isAuthenticated, initialized, initialize } = useAuthStore()
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null)
  const setSecurityResult = useDeviceSecurityStore((s) => s.setResult)
  const langInit = useLangStore((s) => s.init)
  const langInitialized = useLangStore((s) => s.initialized)
  const themeInit = useThemeStore((s) => s.init)
  const themeInitialized = useThemeStore((s) => s.initialized)
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const onSystemChange = useThemeStore((s) => s.onSystemChange)
  const lang = useLangStore((s) => s.lang)

  const [fontsLoaded] = useFonts({
    'Manrope':          Manrope_400Regular,
    'Manrope-Medium':   Manrope_500Medium,
    'Manrope-SemiBold': Manrope_600SemiBold,
    'Manrope-Bold':     Manrope_700Bold,
    'PublicSans':       PublicSans_400Regular,
    'PublicSans-Bold':  PublicSans_700Bold,
    NotoNaskhArabic: require('../assets/fonts/NotoNaskhArabic-Regular.ttf'),
  })

  useEffect(() => {
    async function init() {
      try {
        setSecurityResult({ isCompromised: false, reasons: [] })
        await openDatabase()
        await langInit()
        await themeInit()
        initI18n(useLangStore.getState().lang)
        await useBookmarkStore.getState().init(getDatabase())
        await useCoachMarkStore.getState().init()
        await useRecentSearchStore.getState().init()
        const seen = await hasSeenWelcome()
        setShowWelcome(!seen)
      } catch {
        // DB unavailable (web platform without WASM, first-launch failure) — proceed without local cache
        await langInit()
        await themeInit()
        initI18n(useLangStore.getState().lang)
        await useCoachMarkStore.getState().init()
        await useRecentSearchStore.getState().init()
        const seen = await hasSeenWelcome()
        setShowWelcome(!seen)
      } finally {
        initialize()
      }
    }
    void init()
  }, [])

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      onSystemChange(colorScheme)
    })
    return () => sub.remove()
  }, [onSystemChange])

  if (!initialized || !langInitialized || !themeInitialized || !fontsLoaded || showWelcome === null) return null

  return (
    <>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <UiKitProvider mode={resolvedTheme} rtl={isRtlLang(lang)}>
        <ErrorBoundary>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: 250 }} />
            <Stack.Screen name="drug/[atcCode]" options={{ headerShown: true, title: '', animation: 'slide_from_bottom', animationDuration: 300 }} />
            <Stack.Screen name="search" options={{ headerShown: true, title: '', animation: 'slide_from_bottom', animationDuration: 300 }} />
          </Stack>
        </ErrorBoundary>
      </UiKitProvider>
      {showWelcome && !isAuthenticated && <Redirect href="/welcome" />}
      {!showWelcome && !isAuthenticated && <Redirect href="/(auth)/onboarding" />}
    </>
  )
}
