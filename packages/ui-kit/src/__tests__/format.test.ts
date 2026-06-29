import { describe, it, expect } from 'vitest'
import {
  formatNumber,
  formatInteger,
  formatDecimal,
  formatPercent,
  formatDate,
  formatDateTime,
  formatTime,
  formatRelativeTime,
  getArabicPluralCategory,
  getDariPluralCategory,
  getPluralCategory,
} from '../utils/format'

describe('formatNumber', () => {
  it('formats integers in English', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234')
  })

  it('formats numbers in Arabic locale', () => {
    const result = formatNumber(1234, 'ar')
    // May use Arabic-Indic numerals (٠-٩) or Western digits depending on ICU data
    expect(result).toBeTruthy()
    expect(result.replace(/[^\d٠-٩۰-۹]/g, '')).toBeTruthy()
  })

  it('formats numbers in Dari locale', () => {
    const result = formatNumber(1234, 'prs')
    // Uses Farsi locale — may use Extended Arabic-Indic digits (۰-۹) or Western
    expect(result).toBeTruthy()
    expect(result.replace(/[^\d٠-٩۰-۹]/g, '')).toBeTruthy()
  })
})

describe('formatInteger', () => {
  it('formats without decimals', () => {
    expect(formatInteger(3.7, 'en')).toBe('4')
  })
})

describe('formatDecimal', () => {
  it('formats with specified decimal places', () => {
    expect(formatDecimal(3.14159, 'en', 2)).toBe('3.14')
  })
})

describe('formatPercent', () => {
  it('formats percentage in English', () => {
    expect(formatPercent(75, 'en')).toBe('75%')
  })
})

describe('formatDate', () => {
  const MAR_15 = new Date(2026, 2, 15) // local March 15, 2026 (avoids TZ boundary)

  it('formats English as DD/MM/YYYY (not US MM/DD/YYYY)', () => {
    expect(formatDate(MAR_15, 'en')).toBe('15/03/2026')
  })

  it('formats Arabic as DD/MM/YYYY with Arabic-Indic digits', () => {
    expect(formatDate(MAR_15, 'ar')).toMatch(/^[٠-٩]{2}\/[٠-٩]{2}\/[٠-٩]{4}$/)
  })

  it('formats Dari (prs) and Pashto (ps) as DD/MM/YYYY with Persian digits', () => {
    expect(formatDate(MAR_15, 'prs')).toMatch(/^[۰-۹]{2}\/[۰-۹]{2}\/[۰-۹]{4}$/)
    expect(formatDate(MAR_15, 'ps')).toMatch(/^[۰-۹]{2}\/[۰-۹]{2}\/[۰-۹]{4}$/)
  })

  it('uses the Gregorian calendar for Dari, NOT Solar-Hijri/Jalali', () => {
    // 2026 → ۲۰۲۶ (Gregorian). Jalali would render the year as ۱۴۰۵.
    expect(formatDate(MAR_15, 'prs')).toContain('۲۰۲۶')
    expect(formatDate(MAR_15, 'prs')).not.toContain('۱۴۰۵')
  })

  it('returns empty string for invalid date', () => {
    expect(formatDate('invalid', 'en')).toBe('')
  })

  it('accepts ISO string input', () => {
    expect(formatDate('2026-05-16T10:30:00Z', 'en')).toContain('2026')
  })
})

describe('formatDateTime', () => {
  it('renders DD/MM/YYYY plus 24-hour time for English', () => {
    const result = formatDateTime(new Date(2026, 2, 15, 14, 30), 'en')
    expect(result).toContain('15/03/2026')
    expect(result).toContain('14:30')
  })
})

describe('formatTime', () => {
  it('formats time only', () => {
    const result = formatTime(new Date('2026-03-15T14:30:00'), 'en')
    // Should contain hour and minute
    expect(result).toBeTruthy()
  })
})

describe('formatRelativeTime', () => {
  it('returns a relative time string', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000)
    const result = formatRelativeTime(fiveMinAgo, 'en')
    expect(result).toBeTruthy()
  })

  it('returns empty string for invalid date', () => {
    expect(formatRelativeTime('invalid', 'en')).toBe('')
  })
})

describe('getArabicPluralCategory', () => {
  it('returns zero for 0', () => {
    expect(getArabicPluralCategory(0)).toBe('zero')
  })

  it('returns one for 1', () => {
    expect(getArabicPluralCategory(1)).toBe('one')
  })

  it('returns two for 2', () => {
    expect(getArabicPluralCategory(2)).toBe('two')
  })

  it('returns few for 3-10', () => {
    expect(getArabicPluralCategory(3)).toBe('few')
    expect(getArabicPluralCategory(7)).toBe('few')
    expect(getArabicPluralCategory(10)).toBe('few')
  })

  it('returns many for 11-99', () => {
    expect(getArabicPluralCategory(11)).toBe('many')
    expect(getArabicPluralCategory(50)).toBe('many')
    expect(getArabicPluralCategory(99)).toBe('many')
  })

  it('returns other for 100+', () => {
    expect(getArabicPluralCategory(100)).toBe('other')
    expect(getArabicPluralCategory(1000)).toBe('other')
  })

  it('handles numbers where mod100 falls in few range', () => {
    expect(getArabicPluralCategory(103)).toBe('few')
    expect(getArabicPluralCategory(210)).toBe('few')
  })

  it('handles numbers where mod100 falls in many range', () => {
    expect(getArabicPluralCategory(111)).toBe('many')
    expect(getArabicPluralCategory(299)).toBe('many')
  })
})

describe('getDariPluralCategory', () => {
  it('returns one for 0', () => {
    expect(getDariPluralCategory(0)).toBe('one')
  })

  it('returns one for 1', () => {
    expect(getDariPluralCategory(1)).toBe('one')
  })

  it('returns other for 2+', () => {
    expect(getDariPluralCategory(2)).toBe('other')
    expect(getDariPluralCategory(100)).toBe('other')
  })
})

describe('getPluralCategory', () => {
  it('uses Arabic rules for ar locale', () => {
    expect(getPluralCategory(2, 'ar')).toBe('two')
    expect(getPluralCategory(5, 'ar')).toBe('few')
  })

  it('uses Dari rules for prs locale', () => {
    expect(getPluralCategory(0, 'prs')).toBe('one')
    expect(getPluralCategory(5, 'prs')).toBe('other')
  })

  it('uses English rules for en locale', () => {
    expect(getPluralCategory(1, 'en')).toBe('one')
    expect(getPluralCategory(2, 'en')).toBe('other')
  })
})
