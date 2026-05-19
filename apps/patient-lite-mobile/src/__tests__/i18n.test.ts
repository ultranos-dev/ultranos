import { isSupportedLocale, getDirection, SUPPORTED_LOCALES, mapToSupportedLocale } from '../i18n'

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}))

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}))

describe('i18n configuration', () => {
  it('supports en, ar, da locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'ar', 'prs'])
  })

  describe('isSupportedLocale', () => {
    it('returns true for supported locales', () => {
      expect(isSupportedLocale('en')).toBe(true)
      expect(isSupportedLocale('ar')).toBe(true)
      expect(isSupportedLocale('prs')).toBe(true)
    })

    it('returns false for unsupported locales', () => {
      expect(isSupportedLocale('fr')).toBe(false)
      expect(isSupportedLocale('de')).toBe(false)
      expect(isSupportedLocale('')).toBe(false)
    })
  })

  describe('getDirection', () => {
    it('returns ltr for English', () => {
      expect(getDirection('en')).toBe('ltr')
    })

    it('returns rtl for Arabic', () => {
      expect(getDirection('ar')).toBe('rtl')
    })

    it('returns rtl for Dari', () => {
      expect(getDirection('prs')).toBe('rtl')
    })
  })

  describe('mapToSupportedLocale', () => {
    it('maps ar to Arabic', () => {
      expect(mapToSupportedLocale('ar')).toBe('ar')
    })

    it('maps fa to Dari (prs)', () => {
      expect(mapToSupportedLocale('fa')).toBe('prs')
    })

    it('maps fa-AF tag to Dari (prs)', () => {
      expect(mapToSupportedLocale('fa', 'fa-AF')).toBe('prs')
    })

    it('maps prs to Dari', () => {
      expect(mapToSupportedLocale('prs')).toBe('prs')
    })

    it('returns null for Danish (da) — not a Dari locale', () => {
      expect(mapToSupportedLocale('da')).toBeNull()
    })

    it('maps en to English', () => {
      expect(mapToSupportedLocale('en')).toBe('en')
    })

    it('returns null for unsupported locales', () => {
      expect(mapToSupportedLocale('fr')).toBeNull()
      expect(mapToSupportedLocale('de')).toBeNull()
      expect(mapToSupportedLocale('zh')).toBeNull()
    })
  })
})
