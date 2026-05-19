import { useCallback } from 'react'
import { I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LOCALE_STORAGE_KEY, getDirection, type SupportedLocale } from '@/i18n'

export type Direction = 'ltr' | 'rtl'

export interface UseAppLocaleReturn {
  locale: SupportedLocale
  dir: Direction
  /** Changes locale, persists preference, and updates RTL. Requires app restart for RTL to take effect. */
  setLocale: (locale: SupportedLocale) => Promise<{ requiresRestart: boolean }>
}

/**
 * Mobile locale hook wrapping i18next.
 * Changes language, persists to AsyncStorage, and updates RTL layout direction.
 */
export function useAppLocale(): UseAppLocaleReturn {
  const { i18n } = useTranslation()
  const locale = i18n.language as SupportedLocale
  const dir = getDirection(locale)

  const setLocale = useCallback(
    async (newLocale: SupportedLocale): Promise<{ requiresRestart: boolean }> => {
      const oldDir = getDirection(i18n.language)
      await i18n.changeLanguage(newLocale)
      try {
        await AsyncStorage.setItem(LOCALE_STORAGE_KEY, newLocale)
      } catch {
        // Storage write failed — locale is applied for this session but won't persist
      }
      const newDir = getDirection(newLocale)
      const dirChanged = newDir !== oldDir
      I18nManager.forceRTL(newDir === 'rtl')
      return { requiresRestart: dirChanged }
    },
    [i18n]
  )

  return { locale, dir, setLocale }
}
