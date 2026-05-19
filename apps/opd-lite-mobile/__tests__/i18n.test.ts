import { getDirection, mapToSupportedLocale, isSupportedLocale, SUPPORTED_LOCALES } from '../src/i18n'

// Mock expo-localization
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }],
}))

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}))

describe('getDirection', () => {
  it('returns rtl for Arabic', () => {
    expect(getDirection('ar')).toBe('rtl')
  })

  it('returns rtl for Dari (prs)', () => {
    expect(getDirection('prs')).toBe('rtl')
  })

  it('returns ltr for English', () => {
    expect(getDirection('en')).toBe('ltr')
  })

  it('returns ltr for unknown locales', () => {
    expect(getDirection('fr')).toBe('ltr')
    expect(getDirection('de')).toBe('ltr')
  })
})

describe('isSupportedLocale', () => {
  it('accepts supported locales', () => {
    expect(isSupportedLocale('en')).toBe(true)
    expect(isSupportedLocale('ar')).toBe(true)
    expect(isSupportedLocale('prs')).toBe(true)
  })

  it('rejects unsupported locales', () => {
    expect(isSupportedLocale('fr')).toBe(false)
    expect(isSupportedLocale('de')).toBe(false)
    expect(isSupportedLocale('')).toBe(false)
  })
})

describe('mapToSupportedLocale', () => {
  it('maps ar to Arabic', () => {
    expect(mapToSupportedLocale('ar')).toBe('ar')
  })

  it('maps fa to Dari', () => {
    expect(mapToSupportedLocale('fa')).toBe('prs')
  })

  it('maps prs to Dari', () => {
    expect(mapToSupportedLocale('prs')).toBe('prs')
  })

  it('maps da to Dari', () => {
    expect(mapToSupportedLocale('da')).toBe('prs')
  })

  it('maps fa-AF tag to Dari', () => {
    expect(mapToSupportedLocale('fa', 'fa-AF')).toBe('prs')
  })

  it('maps en to English', () => {
    expect(mapToSupportedLocale('en')).toBe('en')
  })

  it('returns null for unsupported locales', () => {
    expect(mapToSupportedLocale('fr')).toBeNull()
    expect(mapToSupportedLocale('de')).toBeNull()
  })
})

describe('SUPPORTED_LOCALES', () => {
  it('includes en, ar, prs', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'ar', 'prs'])
  })
})
