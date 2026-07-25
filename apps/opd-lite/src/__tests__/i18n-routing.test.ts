import { describe, it, expect } from 'vitest'
import { routing } from '../i18n/routing'

describe('i18n routing configuration', () => {
  it('supports en, ar, prs, ps locales', () => {
    expect(routing.locales).toEqual(['en', 'ar', 'prs', 'ps'])
  })

  it('defaults to English', () => {
    expect(routing.defaultLocale).toBe('en')
  })

  it('uses no URL prefix (cookie-based detection)', () => {
    expect(routing.localePrefix).toBe('never')
  })
})
