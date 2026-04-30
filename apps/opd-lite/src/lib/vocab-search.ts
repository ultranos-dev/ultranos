import Fuse from 'fuse.js'
import icd10Data from '@/assets/vocab/icd10_subset.json'

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

let fuseInstance: Fuse<Icd10Item> | null = null

function getFuse(): Fuse<Icd10Item> {
  if (!fuseInstance) {
    fuseInstance = new Fuse(icd10Data as Icd10Item[], fuseOptions)
  }
  return fuseInstance
}

export interface VocabSearchResult {
  item: Icd10Item
  matches: Fuse.FuseResultMatch[] | undefined
}

export function searchVocab(query: string): VocabSearchResult[] {
  if (!query || query.trim().length < 2) return []
  const results = getFuse().search(query.trim(), { limit: 20 })
  return results.map((r) => ({ item: r.item, matches: r.matches }))
}
