import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import AsyncStorage from '@react-native-async-storage/async-storage'

import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import prs from '../../messages/prs.json'

const LOCALE_STORAGE_KEY = '@ultranos/locale'
const SUPPORTED_LOCALES = ['en', 'ar', 'prs'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale)
}

export function getDirection(locale: string): 'rtl' | 'ltr' {
  return locale === 'ar' || locale === 'prs' ? 'rtl' : 'ltr'
}

/**
 * Map device language code to a supported locale.
 * PRD HP-001: ar, ar-* → Arabic; fa, fa-AF, prs, da → Dari; all others → English
 */
function mapToSupportedLocale(languageCode: string, languageTag?: string): SupportedLocale | null {
  const code = languageCode.toLowerCase()
  if (code === 'ar') return 'ar'
  if (code === 'fa' || code === 'prs') return 'prs'
  // Check full tag for fa-AF specifically
  if (languageTag?.toLowerCase().startsWith('fa-af')) return 'prs'
  if (code === 'en') return 'en'
  return null
}

function detectDeviceLocale(): SupportedLocale {
  const deviceLocales = getLocales()
  for (const deviceLocale of deviceLocales) {
    const code = deviceLocale.languageCode ?? ''
    const tag = deviceLocale.languageTag ?? ''
    const mapped = mapToSupportedLocale(code, tag)
    if (mapped) return mapped
  }
  return 'en'
}

export async function initI18n(): Promise<void> {
  let savedLocale: string | null = null
  try {
    savedLocale = await AsyncStorage.getItem(LOCALE_STORAGE_KEY)
  } catch {
    // Fallback to device detection if storage read fails
  }

  const initialLocale =
    savedLocale && isSupportedLocale(savedLocale) ? savedLocale : detectDeviceLocale()

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      prs: { translation: prs },
    },
    lng: initialLocale,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    interpolation: { escapeValue: false },
  })
}

export { i18n, SUPPORTED_LOCALES, LOCALE_STORAGE_KEY, mapToSupportedLocale }
export default i18n
