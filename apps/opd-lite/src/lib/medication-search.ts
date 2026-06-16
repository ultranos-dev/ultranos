import Fuse, { type IFuseOptions, type FuseResultMatch } from 'fuse.js'
import { db } from './db'
import type { VocabMedicationEntry } from './db'
import { searchDrugCatalog } from './trpc'
import type { DrugSearchResult } from '@ultranos/shared-types'

export interface MedicationItem {
  code: string
  display: string
  form: string
  strength: string
}

const fuseOptions: IFuseOptions<MedicationItem> = {
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
  matches: readonly FuseResultMatch[] | undefined
}

function toMedicationItem(entry: VocabMedicationEntry): MedicationItem {
  return {
    code: entry.code,
    display: entry.display,
    form: entry.form,
    strength: entry.strength,
  }
}

function drugResultToMedicationItem(r: DrugSearchResult): MedicationItem {
  return {
    code: r.atcCode,
    display: r.localName ?? r.innName,
    form: r.doseForms[0] ?? '',
    strength: '',
  }
}

async function searchLocal(trimmed: string): Promise<MedicationSearchResult[]> {
  const prefixCandidates = await db.vocabularyMedications
    .where('display')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()

  let candidates: VocabMedicationEntry[]
  if (prefixCandidates.length < 10) {
    candidates = await db.vocabularyMedications.toArray()
  } else {
    candidates = prefixCandidates
  }

  const items = candidates.map(toMedicationItem)
  const fuse = new Fuse(items, fuseOptions)
  return fuse.search(trimmed, { limit: 20 }).map((r) => ({ item: r.item, matches: r.matches }))
}

/**
 * Hybrid search: Hub drug catalog API when online (ATC-keyed results),
 * falls back to local Dexie + Fuse when offline or on Hub failure.
 */
export async function searchMedications(
  query: string,
  signal?: AbortSignal,
): Promise<MedicationSearchResult[]> {
  if (!query || query.trim().length < 2) return []

  const trimmed = query.trim()

  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      const results = await searchDrugCatalog(trimmed, 'en', signal)
      return results.map((r) => ({ item: drugResultToMedicationItem(r), matches: undefined }))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      // Network failure or Hub unavailable — fall through to local search
    }
  }

  return searchLocal(trimmed)
}
