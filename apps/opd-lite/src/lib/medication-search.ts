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
  /** Present on brand-presentation rows; absent on the generic fallback row. */
  brandName?: string
  manufacturer?: string
  route?: string
  presentationId?: string
}

/** Max brand-presentation rows surfaced per generic, to keep the list scannable. */
const MAX_PRESENTATIONS_PER_GENERIC = 6
/** Overall cap on rows returned to the dropdown. */
const MAX_ROWS = 25

/** A matched generic drug, before expansion into presentation rows. */
interface GenericMatch {
  code: string
  display: string
  doseForms: string[]
  matches?: readonly FuseResultMatch[] | undefined
}

/** Searchable generic entry — brand names are a search key, not separate rows. */
interface SearchableGeneric {
  code: string
  display: string
  doseForms: string[]
  brandNames: string[]
}

const genericFuseOptions: IFuseOptions<SearchableGeneric> = {
  keys: [
    { name: 'display', weight: 0.5 },
    { name: 'brandNames', weight: 0.3 },
    { name: 'code', weight: 0.2 },
  ],
  threshold: 0.4,
  includeMatches: true,
  minMatchCharLength: 2,
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

/** Leading numeric magnitude of a strength string ("500 mg" → 500); NaN sorts last. */
function strengthMagnitude(strength: string): number {
  const n = parseFloat(strength)
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
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

function drugResultToGenericMatch(r: DrugSearchResult): GenericMatch {
  return {
    code: r.atcCode,
    display: r.localName ?? r.innName,
    doseForms: r.doseForms ?? [],
    matches: undefined,
  }
}

/**
 * Expand matched generics into dropdown rows by joining the on-device brand +
 * presentation mirror. Each generic yields one generic fallback row plus one row
 * per distinct presentation (strength · form · brand · manufacturer · route),
 * deduped and capped. Runs for both the online and offline search paths, since
 * the presentation mirror is on-device regardless of connectivity.
 */
async function enrichWithPresentations(generics: GenericMatch[]): Promise<MedicationSearchResult[]> {
  const out: MedicationSearchResult[] = []
  for (const g of generics) {
    // Generic fallback row (always exactly one per ATC) — carries the fuzzy-match
    // highlight indices; presentation rows are not highlighted.
    out.push({
      item: { code: g.code, display: g.display, form: g.doseForms[0] ?? '', strength: '' },
      matches: g.matches,
    })

    const brands = await db.drugBrandsMirror.where('genericAtcCode').equals(g.code).toArray()
    const seen = new Set<string>()
    const presRows: MedicationItem[] = []
    for (const b of brands) {
      const presentations = await db.drugBrandPresentationsMirror.where('brandId').equals(b.id).toArray()
      for (const p of presentations) {
        const strength = p.strength ?? ''
        const form = p.doseForm ?? g.doseForms[0] ?? ''
        const key = `${b.brandName}|${strength}|${form}`
        if (seen.has(key)) continue
        seen.add(key)
        presRows.push({
          code: g.code,
          display: g.display,
          form,
          strength,
          brandName: b.brandName,
          manufacturer: b.manufacturer ?? undefined,
          route: p.route ?? undefined,
          presentationId: p.id,
        })
      }
    }
    presRows.sort((a, z) => strengthMagnitude(a.strength) - strengthMagnitude(z.strength))
    for (const item of presRows.slice(0, MAX_PRESENTATIONS_PER_GENERIC)) {
      out.push({ item, matches: undefined })
    }
  }
  return out.slice(0, MAX_ROWS)
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
  // De-dupe entries by atcCode; one searchable generic each (brand names are a
  // search key, not separate rows).
  const seen = new Set<string>()
  const searchable: SearchableGeneric[] = []
  for (const e of candidates) {
    if (seen.has(e.atcCode)) continue
    seen.add(e.atcCode)
    searchable.push({
      code: e.atcCode,
      display: e.innName,
      doseForms: e.doseForms ?? [],
      brandNames: e.brandNames ?? [],
    })
  }
  const fuse = new Fuse(searchable, genericFuseOptions)
  const generics: GenericMatch[] = fuse
    .search(lower, { limit: 20 })
    .map((r) => ({ code: r.item.code, display: r.item.display, doseForms: r.item.doseForms, matches: r.matches }))
  return enrichWithPresentations(generics)
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
      // Enrich the Hub's generic identity matches with on-device brand presentations.
      return enrichWithPresentations(results.map(drugResultToGenericMatch))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      // Network failure or Hub unavailable — fall through to local search
    }
  }

  return searchLocal(trimmed)
}
