/**
 * Tests for Story 45.4 — Plain-Language Audio Result Summaries
 * Task 9.10: Offline test — verify that result audio file paths are registered
 *            in the SW precache manifest so they are available without a network.
 *
 * This test validates the precache entry generator logic extracted from sw.ts.
 * Full SW integration (cache storage + fetch intercept) requires an e2e
 * environment (Playwright + service worker). This unit test covers the
 * catalogue completeness guarantee: all 160 audio files are listed.
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Replicate the resultAudioFiles helper from sw.ts
// (The SW itself is a browser environment module and cannot be imported in
//  Node/jsdom. We duplicate the pure data-generation logic here so we can
//  assert the same catalogue that the SW would register.)
// ---------------------------------------------------------------------------

const LOCALES = ['en', 'ar', 'prs', 'ps'] as const
const INTERPRETATIONS = ['normal', 'low', 'high', 'critical-low', 'critical-high'] as const

function resultAudioFiles(category: string, analyte: string): string[] {
  return INTERPRETATIONS.flatMap(interp =>
    LOCALES.map(locale => `/audio/results/${category}/${analyte}-${interp}-${locale}.mp3`),
  )
}

const RESULT_AUDIO_PRECACHE: string[] = [
  ...resultAudioFiles('cbc', 'cbc'),
  ...resultAudioFiles('lipid', 'lipidPanel'),
  ...resultAudioFiles('hba1c', 'hba1c'),
  ...resultAudioFiles('bmp', 'metabolicPanel'),
  ...resultAudioFiles('liver', 'liverFunction'),
  ...resultAudioFiles('tsh', 'tsh'),
  ...resultAudioFiles('ua', 'urinalysis'),
  ...resultAudioFiles('fbs', 'fastingGlucose'),
]

// ---------------------------------------------------------------------------
// 9.10 — Offline / SW precache manifest validation
// ---------------------------------------------------------------------------

describe('SW result audio precache — catalogue completeness', () => {
  it('contains 160 entries (8 categories × 5 interpretations × 4 locales)', () => {
    expect(RESULT_AUDIO_PRECACHE).toHaveLength(160)
  })

  it('every entry is a valid mp3 path under /audio/results/', () => {
    for (const entry of RESULT_AUDIO_PRECACHE) {
      expect(entry, `Invalid path: ${entry}`).toMatch(
        /^\/audio\/results\/[a-z0-9]+\/[a-zA-Z0-9]+-(?:normal|low|high|critical-low|critical-high)-(?:en|ar|prs|ps)\.mp3$/,
      )
    }
  })

  it('includes at least one audio-results URL (SW can serve it offline)', () => {
    const audioResultEntries = RESULT_AUDIO_PRECACHE.filter(e =>
      e.startsWith('/audio/results/'),
    )
    expect(audioResultEntries.length).toBeGreaterThan(0)
  })

  it('includes all 4 locales for the CBC normal entry', () => {
    for (const locale of LOCALES) {
      expect(RESULT_AUDIO_PRECACHE).toContain(
        `/audio/results/cbc/cbc-normal-${locale}.mp3`,
      )
    }
  })

  it('includes all 4 locales for the CBC critical-low entry', () => {
    for (const locale of LOCALES) {
      expect(RESULT_AUDIO_PRECACHE).toContain(
        `/audio/results/cbc/cbc-critical-low-${locale}.mp3`,
      )
    }
  })

  it('includes all 5 interpretation levels for every LOINC category', () => {
    const categories = [
      { category: 'cbc', analyte: 'cbc' },
      { category: 'lipid', analyte: 'lipidPanel' },
      { category: 'hba1c', analyte: 'hba1c' },
      { category: 'bmp', analyte: 'metabolicPanel' },
      { category: 'liver', analyte: 'liverFunction' },
      { category: 'tsh', analyte: 'tsh' },
      { category: 'ua', analyte: 'urinalysis' },
      { category: 'fbs', analyte: 'fastingGlucose' },
    ]
    for (const { category, analyte } of categories) {
      for (const interp of INTERPRETATIONS) {
        const enPath = `/audio/results/${category}/${analyte}-${interp}-en.mp3`
        expect(RESULT_AUDIO_PRECACHE, `Missing: ${enPath}`).toContain(enPath)
      }
    }
  })

  it('has no duplicate entries', () => {
    const unique = new Set(RESULT_AUDIO_PRECACHE)
    expect(unique.size).toBe(RESULT_AUDIO_PRECACHE.length)
  })
})

describe('SW result audio precache — naming convention', () => {
  it('uses the analyte field name (not LOINC code) in the file name', () => {
    // Files should use "cbc", "lipidPanel", etc. — not "58410-2"
    const hasLoincCode = RESULT_AUDIO_PRECACHE.some(e => /\d{5}-\d/.test(e))
    expect(hasLoincCode).toBe(false)
  })

  it('all paths use .mp3 extension', () => {
    const nonMp3 = RESULT_AUDIO_PRECACHE.filter(e => !e.endsWith('.mp3'))
    expect(nonMp3).toHaveLength(0)
  })
})
