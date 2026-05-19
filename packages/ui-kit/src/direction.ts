export type SupportedLocale = 'en' | 'ar' | 'prs'

export type Direction = 'ltr' | 'rtl'

/** Returns 'rtl' for Arabic and Dari, 'ltr' for everything else. Handles locale variants (e.g. ar-SA). */
export function getDirection(locale: string): Direction {
  const base = locale?.split('-')[0]?.toLowerCase() ?? ''
  return base === 'ar' || base === 'prs' ? 'rtl' : 'ltr'
}
