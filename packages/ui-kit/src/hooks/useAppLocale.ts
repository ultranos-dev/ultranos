import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { getDirection } from '../direction.js'
import type { SupportedLocale, Direction } from '../direction.js'

export type { SupportedLocale, Direction }
export { getDirection }

export interface UseAppLocaleReturn {
  locale: SupportedLocale
  dir: Direction
  setLocale: (locale: SupportedLocale) => void
}

/**
 * PWA locale hook wrapping next-intl.
 * Updates the NEXT_LOCALE cookie and refreshes the router to apply the new locale.
 */
export function useAppLocale(): UseAppLocaleReturn {
  const locale = useLocale() as SupportedLocale
  const router = useRouter()
  const dir = getDirection(locale)

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      const secure = window.location.protocol === 'https:' ? ';Secure' : ''
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax${secure}`
      router.refresh()
    },
    [router]
  )

  return { locale, dir, setLocale }
}
