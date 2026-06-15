// ---------------------------------------------------------------------------
// Atlas Search (Story 53.2 — AC: 6)
// Client-side only. With ~40–100 entries, in-memory substring search is fast.
// No server round-trip needed. Operates on Dexie data (offline-capable).
// ---------------------------------------------------------------------------

import type { AtlasEntry } from './visual-atlas'

/**
 * Search atlas entries by keyword.
 *
 * Searches across:
 *   - `tags`                 (English keywords — primary search surface)
 *   - `name`                 (i18n key, searched as-is — works for English keys)
 *   - `description`          (i18n key, searched as-is)
 *
 * Matching:
 *   - Case-insensitive, partial substring match
 *   - Multiple query words: ALL words must match (AND logic)
 *
 * Returns entries sorted by number of tag matches (most relevant first).
 * Falls back to original order when relevance is tied.
 */
export function searchAtlas(entries: AtlasEntry[], query: string): AtlasEntry[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const scored: { entry: AtlasEntry; score: number }[] = []

  for (const entry of entries) {
    const searchable = buildSearchableString(entry)
    let score = 0
    let allMatch = true

    for (const word of words) {
      if (!searchable.includes(word)) {
        allMatch = false
        break
      }
      // Boost score for each tag that contains the word
      for (const tag of entry.tags) {
        if (tag.toLowerCase().includes(word)) score++
      }
    }

    if (allMatch) {
      scored.push({ entry, score })
    }
  }

  // Sort by score descending (more tag matches = more relevant), stable sort
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.entry)
}

/**
 * Build a single lowercase searchable string for an entry.
 * Concatenates: tags, the last segment of the i18n name key, and i18n key segments.
 * Tags are the primary search surface — they are always in English.
 */
function buildSearchableString(entry: AtlasEntry): string {
  const parts: string[] = [
    // Tags are English — primary search surface
    ...entry.tags,
    // Last segment of i18n key (e.g., 'neutrophil' from 'visualAtlas.entries.neutrophil.name')
    entry.name.split('.').at(-2) ?? '',
    // Description key last segment too
    entry.description.split('.').at(-2) ?? '',
  ]
  return parts.join(' ').toLowerCase()
}
