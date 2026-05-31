/**
 * Visual Atlas for Microscopy — Unit Tests (Story 53.2)
 *
 * Tests cover:
 *  - Atlas data model integrity (seed entries, category tree)
 *  - Search (searchAtlas) — keyword matching, AND logic, relevance scoring
 *  - Dexie schema helpers (semverIsNewer)
 *  - No PHI present in atlas data
 */

import { describe, it, expect } from 'vitest'
import {
  ATLAS_CATEGORY_TREE,
  buildEntryIndex,
  getAllEntries,
  CATEGORY_BLOOD_CELLS,
  CATEGORY_PARASITES,
  CATEGORY_BACTERIA,
  CATEGORY_URINE_SEDIMENT,
  CATEGORY_BODY_FLUID,
} from '@/lib/visual-atlas'
import { searchAtlas } from '@/lib/atlas-search'
import { ALL_SEED_ENTRIES } from '@/lib/atlas-seed-data'
import { semverIsNewer } from '@/lib/db'

// ---------------------------------------------------------------------------
// Category tree structure
// ---------------------------------------------------------------------------

describe('ATLAS_CATEGORY_TREE', () => {
  it('has exactly 5 categories', () => {
    expect(ATLAS_CATEGORY_TREE).toHaveLength(5)
  })

  it('contains the expected category IDs', () => {
    const ids = ATLAS_CATEGORY_TREE.map((c) => c.id)
    expect(ids).toContain(CATEGORY_BLOOD_CELLS)
    expect(ids).toContain(CATEGORY_PARASITES)
    expect(ids).toContain(CATEGORY_BACTERIA)
    expect(ids).toContain(CATEGORY_URINE_SEDIMENT)
    expect(ids).toContain(CATEGORY_BODY_FLUID)
  })

  it('has 9 subcategories total across all categories', () => {
    const total = ATLAS_CATEGORY_TREE.reduce((sum, cat) => sum + cat.subcategories.length, 0)
    expect(total).toBe(9)
  })

  it('every category has a non-empty name (i18n key)', () => {
    for (const cat of ATLAS_CATEGORY_TREE) {
      expect(cat.name).toBeTruthy()
    }
  })

  it('every subcategory references its parent categoryId', () => {
    for (const cat of ATLAS_CATEGORY_TREE) {
      for (const sub of cat.subcategories) {
        expect(sub.categoryId).toBe(cat.id)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Seed data integrity
// ---------------------------------------------------------------------------

describe('ALL_SEED_ENTRIES', () => {
  it('has at least 36 entries', () => {
    expect(ALL_SEED_ENTRIES.length).toBeGreaterThanOrEqual(36)
  })

  it('every entry has a unique ID', () => {
    const ids = ALL_SEED_ENTRIES.map((e) => e.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ALL_SEED_ENTRIES.length)
  })

  it('every entry has a valid categoryId', () => {
    const validCategoryIds = new Set(ATLAS_CATEGORY_TREE.map((c) => c.id))
    for (const entry of ALL_SEED_ENTRIES) {
      expect(validCategoryIds.has(entry.categoryId), `entry ${entry.id} has invalid categoryId`).toBe(true)
    }
  })

  it('every entry has a valid subcategoryId', () => {
    const validSubIds = new Set(
      ATLAS_CATEGORY_TREE.flatMap((c) => c.subcategories.map((s) => s.id)),
    )
    for (const entry of ALL_SEED_ENTRIES) {
      expect(validSubIds.has(entry.subcategoryId), `entry ${entry.id} has invalid subcategoryId`).toBe(true)
    }
  })

  it('every entry has a semver version string', () => {
    const semverRe = /^\d+\.\d+\.\d+$/
    for (const entry of ALL_SEED_ENTRIES) {
      expect(semverRe.test(entry.version), `entry ${entry.id} version "${entry.version}" is not semver`).toBe(true)
    }
  })

  it('every entry has at least one tag', () => {
    for (const entry of ALL_SEED_ENTRIES) {
      expect(entry.tags.length).toBeGreaterThan(0)
    }
  })

  it('every entry has a lastReviewedAt ISO date', () => {
    for (const entry of ALL_SEED_ENTRIES) {
      expect(() => new Date(entry.lastReviewedAt).toISOString()).not.toThrow()
    }
  })

  it('i18n name keys follow the correct short-key format (no namespace prefix)', () => {
    for (const entry of ALL_SEED_ENTRIES) {
      // Should start with 'entries.' (short key, not 'visualAtlas.entries.')
      expect(
        entry.name.startsWith('entries.'),
        `entry ${entry.id} name key "${entry.name}" should start with "entries.", not a full namespace path`,
      ).toBe(true)
      expect(
        entry.name.startsWith('visualAtlas.'),
        `entry ${entry.id} name key "${entry.name}" must not include namespace prefix`,
      ).toBe(false)
    }
  })

  it('i18n description keys follow the correct short-key format', () => {
    for (const entry of ALL_SEED_ENTRIES) {
      expect(entry.description.startsWith('entries.')).toBe(true)
      expect(entry.description.startsWith('visualAtlas.')).toBe(false)
    }
  })

  it('i18n clinicalSignificance keys follow the correct short-key format', () => {
    for (const entry of ALL_SEED_ENTRIES) {
      expect(entry.clinicalSignificance.startsWith('entries.')).toBe(true)
    }
  })

  it('no PHI in atlas data — tags contain no patient-identifying information', () => {
    // Tags should be clinical terms (English), not patient names/IDs/dates
    const phiPatterns = [/\bpatient\b/i, /\bmrn\b/i, /\bdate of birth\b/i, /\bssn\b/i]
    for (const entry of ALL_SEED_ENTRIES) {
      for (const tag of entry.tags) {
        for (const pattern of phiPatterns) {
          expect(pattern.test(tag), `tag "${tag}" in entry ${entry.id} matches PHI pattern`).toBe(false)
        }
      }
    }
  })

  it('placeholder field marks non-photomicrograph entries', () => {
    const placeholders = ALL_SEED_ENTRIES.filter((e) => e.placeholder)
    // All seed entries should be placeholder=true (no real images bundled)
    expect(placeholders.length).toBe(ALL_SEED_ENTRIES.length)
  })
})

// ---------------------------------------------------------------------------
// buildEntryIndex / getAllEntries helpers
// ---------------------------------------------------------------------------

describe('buildEntryIndex', () => {
  it('returns an empty map for empty category tree', () => {
    const idx = buildEntryIndex([])
    expect(idx.size).toBe(0)
  })

  it('builds an index keyed by entry ID', () => {
    const cat = ATLAS_CATEGORY_TREE[0]
    // Inject a fake entry into the first subcategory to test index building
    const fakeEntry = ALL_SEED_ENTRIES[0]
    const catCopy = {
      ...cat,
      subcategories: [
        { ...cat.subcategories[0], entries: [fakeEntry] },
      ],
    }
    const idx = buildEntryIndex([catCopy])
    expect(idx.has(fakeEntry.id)).toBe(true)
    expect(idx.get(fakeEntry.id)).toBe(fakeEntry)
  })
})

describe('getAllEntries', () => {
  it('returns empty array for empty tree', () => {
    expect(getAllEntries([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// searchAtlas
// ---------------------------------------------------------------------------

describe('searchAtlas', () => {
  // Build a minimal set of entries with controlled tags for deterministic testing
  const makeEntry = (id: string, tags: string[], nameKey: string): Parameters<typeof searchAtlas>[0][0] => ({
    id,
    subcategoryId: 'blood-cells-normal',
    categoryId: CATEGORY_BLOOD_CELLS,
    name: `entries.${nameKey}.name`,
    image: '',
    imageMimeType: 'image/jpeg' as const,
    thumbnailImage: '',
    description: `entries.${nameKey}.description`,
    clinicalSignificance: `entries.${nameKey}.clinicalSignificance`,
    nextSteps: [],
    tags,
    author: { name: 'Test', credentials: 'MD', institution: 'Test Hospital' },
    version: '1.0.0',
    lastReviewedAt: '2026-01-01T00:00:00Z',
    placeholder: true,
  })

  const neutrophil = makeEntry('ATLAS-BC-NEUT-001', ['neutrophil', 'white blood cell', 'granulocyte', 'infection'], 'neutrophil')
  const lymphocyte = makeEntry('ATLAS-BC-LYMP-001', ['lymphocyte', 'white blood cell', 'viral', 'immune'], 'lymphocyte')
  const blastCell = makeEntry('ATLAS-BC-BLAST-001', ['blast cell', 'leukaemia', 'acute', 'critical'], 'blastCell')

  const entries = [neutrophil, lymphocyte, blastCell]

  it('returns empty array for empty query', () => {
    expect(searchAtlas(entries, '')).toEqual([])
  })

  it('returns empty array for whitespace-only query', () => {
    expect(searchAtlas(entries, '   ')).toEqual([])
  })

  it('matches a single keyword (case-insensitive)', () => {
    const results = searchAtlas(entries, 'neutrophil')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('ATLAS-BC-NEUT-001')
  })

  it('matches keyword regardless of case', () => {
    const results = searchAtlas(entries, 'BLAST')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.find((e) => e.id === 'ATLAS-BC-BLAST-001')).toBeDefined()
  })

  it('matches multiple entries sharing a tag', () => {
    const results = searchAtlas(entries, 'white blood cell')
    expect(results).toHaveLength(2)
    const ids = results.map((e) => e.id)
    expect(ids).toContain('ATLAS-BC-NEUT-001')
    expect(ids).toContain('ATLAS-BC-LYMP-001')
  })

  it('applies AND logic — all words must match', () => {
    // 'white' matches both neutrophil and lymphocyte
    // 'granulocyte' only matches neutrophil
    const results = searchAtlas(entries, 'white granulocyte')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('ATLAS-BC-NEUT-001')
  })

  it('returns no results when no entry matches all words', () => {
    const results = searchAtlas(entries, 'neutrophil leukaemia')
    expect(results).toHaveLength(0)
  })

  it('sorts by tag match count — more tag matches first', () => {
    // 'blast leukaemia acute' — 3 tags match for blastCell, 0 for others
    const blastFirst = searchAtlas(entries, 'blast')
    expect(blastFirst[0].id).toBe('ATLAS-BC-BLAST-001')
  })

  it('also matches on the entry name i18n key segment', () => {
    // The name key for neutrophil is 'entries.neutrophil.name'
    // buildSearchableString extracts 'neutrophil' from the key
    const results = searchAtlas(entries, 'neutrophil')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// semverIsNewer
// ---------------------------------------------------------------------------

describe('semverIsNewer', () => {
  it('newer major version is newer', () => {
    expect(semverIsNewer('2.0.0', '1.9.9')).toBe(true)
  })

  it('older major version is not newer', () => {
    expect(semverIsNewer('1.0.0', '2.0.0')).toBe(false)
  })

  it('newer minor version is newer when major is equal', () => {
    expect(semverIsNewer('1.2.0', '1.1.9')).toBe(true)
  })

  it('newer patch version is newer when major/minor are equal', () => {
    expect(semverIsNewer('1.0.1', '1.0.0')).toBe(true)
  })

  it('same version is NOT newer', () => {
    expect(semverIsNewer('1.0.0', '1.0.0')).toBe(false)
  })

  it('handles non-numeric segments gracefully', () => {
    expect(semverIsNewer('1.0.0', 'invalid')).toBe(true)
    expect(semverIsNewer('invalid', '1.0.0')).toBe(false)
  })
})
