import { useFonts } from 'expo-font'

/**
 * Loads Arabic font assets from the app bundle.
 * Fonts are bundled at build time (not downloaded at runtime)
 * to ensure offline availability on all devices.
 * Uses TTF format — the only format guaranteed by expo-font on native.
 */
export function useArabicFonts() {
  const [fontsLoaded, fontError] = useFonts({
    'NotoSansArabic-Regular': require('../../../assets/fonts/NotoSansArabic-Regular.ttf'),
    'NotoSansArabic-Medium': require('../../../assets/fonts/NotoSansArabic-Medium.ttf'),
    'NotoSansArabic-Bold': require('../../../assets/fonts/NotoSansArabic-Bold.ttf'),
    'NotoNaskhArabic-Regular': require('../../../assets/fonts/NotoNaskhArabic-Regular.ttf'),
    'NotoNaskhArabic-Bold': require('../../../assets/fonts/NotoNaskhArabic-Bold.ttf'),
  })

  return { fontsLoaded, fontError }
}
