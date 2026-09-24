/**
 * Story 63.2 — Placeholder content gating tests.
 *
 * Verifies that placeholder/scaffolding clinical content is HIDDEN by default
 * and REVEALED only when the corresponding feature flag is flipped — a clinical
 * reference tool must never present gray-square atlas images or raw `[TRANSLATE]`
 * guidance as clinical truth. Each gate is reversible by flag.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const ATLAS_ENV = 'NEXT_PUBLIC_LAB_SHOW_PLACEHOLDER_ATLAS'
const GUIDANCE_ENV = 'NEXT_PUBLIC_LAB_SHOW_UNTRANSLATED_GUIDANCE'

describe('feature-flags (Story 63.2)', () => {
  const orig = { atlas: process.env[ATLAS_ENV], guidance: process.env[GUIDANCE_ENV] }
  afterEach(() => {
    process.env[ATLAS_ENV] = orig.atlas
    process.env[GUIDANCE_ENV] = orig.guidance
  })

  it('defaults both placeholder gates to hidden (false)', async () => {
    delete process.env[ATLAS_ENV]
    delete process.env[GUIDANCE_ENV]
    const { getFeatureFlags } = await import('@/lib/feature-flags')
    const flags = getFeatureFlags()
    expect(flags.showPlaceholderAtlasEntries).toBe(false)
    expect(flags.showUntranslatedGuidanceLocales).toBe(false)
  })

  it('reveals when the env var is truthy, and ignores malformed values', async () => {
    const { showPlaceholderAtlasEntries } = await import('@/lib/feature-flags')
    process.env[ATLAS_ENV] = 'true'
    expect(showPlaceholderAtlasEntries()).toBe(true)
    process.env[ATLAS_ENV] = 'nonsense'
    expect(showPlaceholderAtlasEntries()).toBe(false)
    process.env[ATLAS_ENV] = 'false'
    expect(showPlaceholderAtlasEntries()).toBe(false)
  })
})

describe('Atlas placeholder gating', () => {
  it('classifies gray-square / stub-author seed entries as placeholders', async () => {
    const { ALL_SEED_ENTRIES } = await import('@/lib/atlas-seed-data')
    const { isPlaceholderAtlasEntry } = await import('@/lib/visual-atlas')
    // All current seed entries are placeholders (no real photomicrographs yet).
    expect(ALL_SEED_ENTRIES.length).toBeGreaterThan(0)
    expect(ALL_SEED_ENTRIES.every(isPlaceholderAtlasEntry)).toBe(true)
  })

  it('filters placeholders out by default, and keeps them when allowed', async () => {
    const { ATLAS_CATEGORY_TREE, filterPlaceholderEntries, getAllEntries } = await import(
      '@/lib/visual-atlas'
    )
    const { ALL_SEED_ENTRIES_BY_SUBCATEGORY } = await import('@/lib/atlas-seed-data')
    const seeded = ATLAS_CATEGORY_TREE.map((cat) => ({
      ...cat,
      subcategories: cat.subcategories.map((sub) => ({
        ...sub,
        entries: ALL_SEED_ENTRIES_BY_SUBCATEGORY[sub.id] ?? [],
      })),
    }))

    const hidden = filterPlaceholderEntries(seeded, false)
    expect(getAllEntries(hidden)).toHaveLength(0) // all current entries are placeholders

    const shown = filterPlaceholderEntries(seeded, true)
    expect(getAllEntries(shown).length).toBeGreaterThan(0)
  })
})

describe('Guidance translation gating', () => {
  const orig = process.env[GUIDANCE_ENV]
  afterEach(() => {
    process.env[GUIDANCE_ENV] = orig
  })

  it('hides [TRANSLATE] locales by default (pending, never raw marker)', async () => {
    delete process.env[GUIDANCE_ENV]
    const { resolveGuidanceLocale } = await import('@/lib/public-health-guidance')
    const { GUIDANCE_SEED } = await import('@/lib/guidance-seed-data')
    const entry = GUIDANCE_SEED[0]!

    // English is complete → shown.
    const en = resolveGuidanceLocale(entry.text, entry.audio, 'en')
    expect(en.pending).toBe(false)
    expect(en.text).toBeTruthy()

    // Non-English are [TRANSLATE]-marked → pending, no raw marker leaks.
    for (const loc of ['ar', 'prs', 'ps'] as const) {
      const r = resolveGuidanceLocale(entry.text, entry.audio, loc)
      expect(r.pending).toBe(true)
      expect(r.text).toBeNull()
      expect(r.audio).toBeNull()
    }
  })

  it('reveals translated content when the flag is on, stripping any [TRANSLATE] marker', async () => {
    process.env[GUIDANCE_ENV] = 'true'
    const { resolveGuidanceLocale } = await import('@/lib/public-health-guidance')
    const { GUIDANCE_SEED } = await import('@/lib/guidance-seed-data')
    const entry = GUIDANCE_SEED[0]!
    const ar = resolveGuidanceLocale(entry.text, entry.audio, 'ar')
    expect(ar.pending).toBe(false)
    expect(ar.text).toBeTruthy()
    expect(ar.text).not.toContain('[TRANSLATE]')
  })

  it('never falls back to English for a pending locale (honest pending, not misleading English)', async () => {
    delete process.env[GUIDANCE_ENV]
    const { resolveGuidanceLocale } = await import('@/lib/public-health-guidance')
    const { GUIDANCE_SEED } = await import('@/lib/guidance-seed-data')
    const entry = GUIDANCE_SEED[0]!
    const ar = resolveGuidanceLocale(entry.text, entry.audio, 'ar')
    // Must be pending — must NOT silently return the English string.
    expect(ar.pending).toBe(true)
    expect(ar.text).not.toBe(entry.text.en)
  })
})
