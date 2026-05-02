import Fuse from 'fuse.js'
import { db } from './db'
import type { VocabIcd10Entry } from './db'

export interface Icd10Item {
  code: string
  display: string
}

const fuseOptions: Fuse.IFuseOptions<Icd10Item> = {
  keys: [
    { name: 'code', weight: 0.4 },
    { name: 'display', weight: 0.6 },
  ],
  threshold: 0.4,
  includeMatches: true,
  minMatchCharLength: 2,
}

export interface VocabSearchResult {
  item: Icd10Item
  matches: Fuse.FuseResultMatch[] | undefined
}

function toIcd10Item(entry: VocabIcd10Entry): Icd10Item {
  return { code: entry.code, display: entry.display }
}

/**
 * Hybrid search: Dexie indexed prefix match → Fuse.js fuzzy ranking.
 * Maintains the same API as the previous static-JSON implementation.
 */
export async function searchVocab(query: string): Promise<VocabSearchResult[]> {
  if (!query || query.trim().length < 2) return []

  const trimmed = query.trim()

  // Stage 1: Try prefix match on code (e.g. "J06" → "J06.9")
  const codeCandidates = await db.vocabularyIcd10
    .where('code')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()

  // Stage 2: Try prefix match on display name
  const displayCandidates = await db.vocabularyIcd10
    .where('display')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()

  // Merge and deduplicate candidates
  const candidateMap = new Map<string, VocabIcd10Entry>()
  for (const c of [...codeCandidates, ...displayCandidates]) {
    candidateMap.set(c.code, c)
  }

  let candidates: VocabIcd10Entry[]
  if (candidateMap.size < 10) {
    // Fall back to full table for fuzzy matching (typos, partial words)
    candidates = await db.vocabularyIcd10.toArray()
  } else {
    candidates = Array.from(candidateMap.values())
  }

  // Stage 3: Fuse.js fuzzy ranking
  const items = candidates.map(toIcd10Item)
  const fuse = new Fuse(items, fuseOptions)
  const results = fuse.search(trimmed, { limit: 20 })

  return results.map((r) => ({ item: r.item, matches: r.matches }))
}
