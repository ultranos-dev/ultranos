import { Stack } from 'expo-router'
import { useReducedMotion } from '@ultranos/ui-kit/native'
import { useLangStore, isRtlLang } from '@/store/lang-store'

export default function AuthLayout() {
  const lang = useLangStore((s) => s.lang)
  const reduced = useReducedMotion()
  // Match the root stack: side-slide from the trailing edge, RTL-aware.
  const animation = reduced ? 'fade' : isRtlLang(lang) ? 'slide_from_left' : 'slide_from_right'

  return (
    <Stack screenOptions={{ headerShown: false, animation, animationDuration: 300 }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  )
}
