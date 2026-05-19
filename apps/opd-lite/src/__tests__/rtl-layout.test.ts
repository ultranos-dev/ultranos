import { describe, it, expect } from 'vitest'
import { getDirection } from '@ultranos/ui-kit'
import type { SupportedLocale } from '@ultranos/ui-kit'

describe('RTL layout direction', () => {
  it('returns rtl for Arabic locale', () => {
    expect(getDirection('ar')).toBe('rtl')
  })

  it('returns rtl for Dari locale', () => {
    expect(getDirection('prs')).toBe('rtl')
  })

  it('returns ltr for English locale', () => {
    expect(getDirection('en')).toBe('ltr')
  })

  it('returns rtl for Arabic locale variants', () => {
    expect(getDirection('ar-SA')).toBe('rtl')
    expect(getDirection('ar-EG')).toBe('rtl')
  })

  it('returns ltr for unknown locale', () => {
    expect(getDirection('fr')).toBe('ltr')
  })

  it('all supported locales produce valid directions', () => {
    const locales: SupportedLocale[] = ['en', 'ar', 'prs']
    for (const locale of locales) {
      const dir = getDirection(locale)
      expect(['ltr', 'rtl']).toContain(dir)
    }
  })
})
