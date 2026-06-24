import Fuse, { type IFuseOptions, type FuseResultMatch } from 'fuse.js'
import { db } from './db'
import type { VocabMedicationEntry } from './db'
import { searchDrugCatalog } from './trpc'
import type { DrugSearchResult } from '@ultranos/shared-types'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'

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

function mirrorEntryToItems(e: DrugEntry): MedicationItem[] {
  const form = e.doseForms[0] ?? ''
  const generic: MedicationItem = { code: e.atcCode, display: e.innName, form, strength: '' }
  // One item per brand name so a brand query surfaces (and labels) the generic.
  const brands: MedicationItem[] = (e.brandNames ?? []).map((b) => ({
    code: e.atcCode,
    display: `${e.innName} (${b})`,
    form,
    strength: '',
  }))
  return [generic, ...brands]
}

async function searchMirror(trimmed: string): Promise<MedicationSearchResult[] | null> {
  const total = await db.drugCatalogMirror.count()
  if (total === 0) return null // cold start — caller falls back to vocab seed

  const lower = trimmed.toLowerCase()
  const byName = await db.drugCatalogMirror
    .where('innName')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()
  const byBrand = await db.drugCatalogMirror
    .where('brandNames')
    .startsWithIgnoreCase(trimmed)
    .limit(200)
    .toArray()

  let candidates = [...byName, ...byBrand]
  if (candidates.length < 10) {
    candidates = await db.drugCatalogMirror.limit(1000).toArray()
  }
  // De-dupe entries by atcCode before expanding to items.
  const seen = new Set<string>()
  const items: MedicationItem[] = []
  for (const e of candidates) {
    if (seen.has(e.atcCode)) continue
    seen.add(e.atcCode)
    items.push(...mirrorEntryToItems(e))
  }
  const fuse = new Fuse(items, fuseOptions)
  return fuse.search(lower, { limit: 20 }).map((r) => ({ item: r.item, matches: r.matches }))
}

async function searchLocal(trimmed: string): Promise<MedicationSearchResult[]> {
  const fromMirror = await searchMirror(trimmed)
  if (fromMirror !== null) return fromMirror

  // Fallback (pre-first-sync cold start): the JSON-seeded vocabulary.
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
