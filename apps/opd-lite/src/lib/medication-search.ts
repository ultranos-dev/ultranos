import Fuse from 'fuse.js'
import medicationsData from '@/assets/vocab/medications_subset.json'

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

let fuseInstance: Fuse<MedicationItem> | null = null

function getFuse(): Fuse<MedicationItem> {
  if (!fuseInstance) {
    fuseInstance = new Fuse(medicationsData as MedicationItem[], fuseOptions)
  }
  return fuseInstance
}

export interface MedicationSearchResult {
  item: MedicationItem
  matches: Fuse.FuseResultMatch[] | undefined
}

export function searchMedications(query: string): MedicationSearchResult[] {
  if (!query || query.trim().length < 2) return []
  const results = getFuse().search(query.trim(), { limit: 20 })
  return results.map((r) => ({ item: r.item, matches: r.matches }))
}
