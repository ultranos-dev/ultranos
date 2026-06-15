'use client'

import { useAppLocale } from '../hooks/useAppLocale.js'
import { LanguageSelector } from './LanguageSelector.js'

/**
 * LanguageSelector pre-wired to the PWA useAppLocale hook.
 * Drop this into any Next.js app with next-intl configured.
 */
export function ConnectedLanguageSelector({ collapsed = false }: { collapsed?: boolean }) {
  const { locale, setLocale } = useAppLocale()
  return <LanguageSelector currentLocale={locale} onLocaleChange={setLocale} collapsed={collapsed} />
}
