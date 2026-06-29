/**
 * Locale-aware formatting utilities for the Ultranos ecosystem.
 * Story 11.3 — Task 7: Pluralization & Formatting
 *
 * Supports:
 * - Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) for ar locale
 * - Extended Arabic-Indic numerals for prs (Dari) locale
 * - MENA-standard date format (dd/MM/yyyy)
 * - Locale-aware number formatting with proper grouping
 */

import type { SupportedLocale } from '../direction.js'

// --- Number Formatting ---

/**
 * Format a number using locale-appropriate numerals.
 * Arabic locale uses Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩).
 * Dari locale uses Extended Arabic-Indic digits (۰۱۲۳۴۵۶۷۸۹).
 */
export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  if (!isFinite(value)) return ''
  const resolvedLocale = locale === 'prs' ? 'fa' : locale
  return new Intl.NumberFormat(resolvedLocale, options).format(value)
}

/**
 * Format an integer (no decimals) using locale-appropriate numerals.
 */
export function formatInteger(value: number, locale: SupportedLocale): string {
  return formatNumber(value, locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
}

/**
 * Format a decimal number with a specific number of decimal places.
 */
export function formatDecimal(
  value: number,
  locale: SupportedLocale,
  decimalPlaces = 2,
): string {
  return formatNumber(value, locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
}

/**
 * Format a percentage value.
 */
export function formatPercent(value: number, locale: SupportedLocale): string {
  return formatNumber(value / 100, locale, { style: 'percent' })
}

// --- Date Formatting ---

/**
 * Locale → BCP-47 tag for NUMERIC dates. We pin the day/month/year ORDER and the
 * Gregorian calendar by using `en-GB` (which is DD/MM/YYYY) as the base, and vary
 * ONLY the numbering system per locale via the `-u-nu-` extension. This is the
 * MENA/Afghanistan convention: Gregorian DD/MM/YYYY with locale-appropriate
 * numerals — the same order for every locale.
 *
 * Why not pass the locale directly: `en` resolves to en-US → MM/DD/YYYY, and
 * `fa`/`ps` (Dari/Pashto) default to the Solar-Hijri (Jalali) calendar, year-first
 * (e.g. ۱۴۰۵/۰۳/۳۰) — neither is the requested DD/MM/YYYY Gregorian format.
 */
const NUMERIC_DATE_LOCALE: Record<SupportedLocale, string> = {
  en: 'en-GB',                  // 20/06/2026 (Latin digits)
  ar: 'en-GB-u-nu-arab',        // ٢٠/٠٦/٢٠٢٦ (Arabic-Indic digits)
  prs: 'en-GB-u-nu-arabext',    // ۲۰/۰۶/۲۰۲۶ (Extended Arabic-Indic / Persian digits)
  ps: 'en-GB-u-nu-arabext',     // ۲۰/۰۶/۲۰۲۶ (Pashto uses Persian digits)
}

function numericDateTag(locale: SupportedLocale): string {
  return NUMERIC_DATE_LOCALE[locale] ?? 'en-GB'
}

/**
 * Format a date in MENA-standard Gregorian format (DD/MM/YYYY) using
 * locale-appropriate numerals. The day/month/year order is the same for every
 * supported locale; only the digits differ.
 */
export function formatDate(
  date: Date | string,
  locale: SupportedLocale,
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  return new Intl.DateTimeFormat(numericDateTag(locale), {
    calendar: 'gregory',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/**
 * Format a date with 24-hour time as DD/MM/YYYY HH:mm, Gregorian, with
 * locale-appropriate numerals.
 */
export function formatDateTime(
  date: Date | string,
  locale: SupportedLocale,
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  return new Intl.DateTimeFormat(numericDateTag(locale), {
    calendar: 'gregory',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/**
 * Format a date as a short display (e.g., "15 May" or "١٥ مايو").
 */
export function formatDateShort(
  date: Date | string,
  locale: SupportedLocale,
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  const resolvedLocale = locale === 'prs' ? 'fa' : locale
  return new Intl.DateTimeFormat(resolvedLocale, {
    day: 'numeric',
    month: 'short',
  }).format(d)
}

/**
 * Format a time-only value (HH:mm) in locale-appropriate numerals.
 */
export function formatTime(
  date: Date | string,
  locale: SupportedLocale,
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  const resolvedLocale = locale === 'prs' ? 'fa' : locale
  return new Intl.DateTimeFormat(resolvedLocale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/**
 * Format a relative time string (e.g., "3 days ago" / "منذ 3 أيام").
 * Uses Intl.RelativeTimeFormat when available.
 */
export function formatRelativeTime(
  date: Date | string,
  locale: SupportedLocale,
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()

  const resolvedLocale = locale === 'prs' ? 'fa' : locale
  const rtf = new Intl.RelativeTimeFormat(resolvedLocale, { numeric: 'auto' })

  // Handle future dates
  if (diffMs < 0) {
    const futureMins = Math.ceil(-diffMs / 60_000)
    const futureHrs = Math.ceil(-diffMs / 3_600_000)
    const futureDays = Math.ceil(-diffMs / 86_400_000)
    if (futureMins < 1) return rtf.format(0, 'minute')
    if (futureMins < 60) return rtf.format(futureMins, 'minute')
    if (futureHrs < 24) return rtf.format(futureHrs, 'hour')
    if (futureDays < 30) return rtf.format(futureDays, 'day')
    return formatDate(d, locale)
  }

  // Past dates
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHrs = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return rtf.format(0, 'minute')
  if (diffMin < 60) return rtf.format(-diffMin, 'minute')
  if (diffHrs < 24) return rtf.format(-diffHrs, 'hour')
  if (diffDays < 30) return rtf.format(-diffDays, 'day')

  return formatDate(d, locale)
}

// --- Pluralization helpers ---

/**
 * Arabic plural categories per CLDR:
 * - zero: 0
 * - one: 1
 * - two: 2
 * - few: 3-10
 * - many: 11-99
 * - other: 100+
 *
 * next-intl handles this via ICU MessageFormat natively.
 * This helper is for manual plural selection outside of message catalogs.
 */
export type ArabicPluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

export function getArabicPluralCategory(count: number): ArabicPluralCategory {
  const absCount = Math.abs(count)
  if (absCount === 0) return 'zero'
  if (absCount === 1) return 'one'
  if (absCount === 2) return 'two'
  const mod100 = absCount % 100
  if (mod100 >= 3 && mod100 <= 10) return 'few'
  if (mod100 >= 11 && mod100 <= 99) return 'many'
  return 'other'
}

/**
 * Dari plural categories per CLDR:
 * - one: 0 or 1
 * - other: everything else
 */
export type DariPluralCategory = 'one' | 'other'

export function getDariPluralCategory(count: number): DariPluralCategory {
  return Math.abs(count) <= 1 ? 'one' : 'other'
}

/**
 * Select the correct plural form based on locale and count.
 * Returns the CLDR plural category for use with ICU messages.
 */
export function getPluralCategory(
  count: number,
  locale: SupportedLocale,
): string {
  if (locale === 'ar') return getArabicPluralCategory(count)
  if (locale === 'prs') return getDariPluralCategory(count)
  // English: standard rules
  return count === 1 ? 'one' : 'other'
}
