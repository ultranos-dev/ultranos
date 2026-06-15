import { describe, it, expect } from 'vitest'
import {
  CURRENT_CONSENT_VERSION,
  getConsentVersion,
  getCurrentConsentVersion,
  getAudioPath,
} from '../lib/consent-versions'

describe('Consent Version Registry (Task 10.2)', () => {
  it('CURRENT_CONSENT_VERSION is defined and non-empty', () => {
    expect(CURRENT_CONSENT_VERSION).toBeTruthy()
    expect(typeof CURRENT_CONSENT_VERSION).toBe('string')
  })

  it('getCurrentConsentVersion returns the current version entry', () => {
    const entry = getCurrentConsentVersion()
    expect(entry.version).toBe(CURRENT_CONSENT_VERSION)
    expect(entry.effectiveDate).toBeTruthy()
    expect(entry.messageKeys.title).toBeTruthy()
    expect(entry.messageKeys.bodyText).toBeTruthy()
    expect(entry.messageKeys.rightToRefuse).toBeTruthy()
  })

  it('getConsentVersion returns undefined for unknown version', () => {
    expect(getConsentVersion('99.99.99')).toBeUndefined()
  })

  it('resolves correct audio paths for each locale', () => {
    const locales = ['en', 'ar', 'prs', 'ps'] as const

    for (const locale of locales) {
      const path = getAudioPath(locale)
      expect(path).toContain(`consent-lab-collection-${locale}`)
      expect(path).toMatch(/\.mp3$/)
    }
  })

  it('audio paths are under the /audio/consent/ directory', () => {
    const path = getAudioPath('en')
    expect(path).toMatch(/^\/audio\/consent\//)
  })

  it('all version entries have all 4 locale audio files', () => {
    const entry = getCurrentConsentVersion()
    expect(entry.audioFiles.en).toBeTruthy()
    expect(entry.audioFiles.ar).toBeTruthy()
    expect(entry.audioFiles.prs).toBeTruthy()
    expect(entry.audioFiles.ps).toBeTruthy()
  })
})
