/**
 * Story 63.1 — locale-aware date/time formatting for the admin portal.
 *
 * The admin app runs under four app locales (en, ar, prs, ps). Date rendering
 * must follow the active locale rather than being pinned to `en-GB`. This maps
 * each app locale to a BCP-47 tag and centralizes the formatting so pages don't
 * hardcode a locale string.
 *
 * App-local by design (Story 63.1 footprint): this is NOT a cross-package util.
 */

export type AppLocale = 'en' | 'ar' | 'prs' | 'ps'

/** Map an app locale to the BCP-47 tag `Intl` understands. */
const BCP47: Record<AppLocale, string> = {
  en: 'en-GB',
  ar: 'ar',
  prs: 'fa-AF', // Dari
  ps: 'ps-AF', // Pashto
}

function toBcp47(locale: string): string {
  return BCP47[locale as AppLocale] ?? 'en-GB'
}

/** Locale-aware date+time (short month, 2-digit time) — replaces `toLocaleString('en-GB', …)`. */
export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(toBcp47(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Locale-aware date only. */
export function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString(toBcp47(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
