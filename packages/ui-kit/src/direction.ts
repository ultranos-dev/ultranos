export type SupportedLocale = 'en' | 'ar' | 'prs' | 'ps'

export type Direction = 'ltr' | 'rtl'

/** Returns 'rtl' for Arabic, Dari, and Pashto, 'ltr' for everything else. Handles locale variants (e.g. ar-SA). */
export function getDirection(locale: string): Direction {
  const base = locale?.split('-')[0]?.toLowerCase() ?? ''
  return base === 'ar' || base === 'prs' || base === 'ps' ? 'rtl' : 'ltr'
}
