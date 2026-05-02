import Fuse from 'fuse.js'
import { db } from './db'
import type { VocabMedicationEntry } from './db'

export interface MedicationItem {
  code: string
  display: string
  form: string
  strength: string
}

const fuseOptions: Fuse.IFuseOptions<MedicationItem> = {
  keys: [
    { name: 'display', weight: 0.5 },
    { name: 'form', weight: 0.2 },
    { name: 'strength', weight: 0.15 },
    { name: 'code', weight: 0.15 },
  ],
  threshold: 0.4,
  includeMatches: true,
  minMatchCharLength: 2,
}

export interface MedicationSearchResult {
  item: MedicationItem
  matches: Fuse.FuseResultMatch[] | undefined
}

function toMedicationItem(entry: VocabMedicationEntry): MedicationItem {
  return {
    code: entry.code,
    display: entry.display,
    form: entry.form,
    strength: entry.strength,
  }
}

/**
 * Hybrid search: Dexie indexed prefix match → Fuse.js fuzzy ranking.
 * Maintains the same API as the previous static-JSON implementation.
 */
export async function searchMedications(query: string): Promise<MedicationSearchResult[]> {
  if (!query || query.trim().length < 2) return []

  const trimmed = query.trim()

  // Stage 1: Dexie indexed prefix match on display name
  const prefixCandidates = await db.vocabularyMedications
    .where('display')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()

  // Stage 2: Also grab broader candidates if prefix match is thin
  let candidates: VocabMedicationEntry[]
  if (prefixCandidates.length < 10) {
    // Fall back to full table scan for fuzzy matching on small datasets
    // or when the prefix doesn't match well (e.g. typos, form searches)
    candidates = await db.vocabularyMedications.toArray()
  } else {
    candidates = prefixCandidates
  }

  // Stage 3: Fuse.js fuzzy ranking on the candidate set
  const items = candidates.map(toMedicationItem)
  const fuse = new Fuse(items, fuseOptions)
  const results = fuse.search(trimmed, { limit: 20 })

  return results.map((r) => ({ item: r.item, matches: r.matches }))
}
