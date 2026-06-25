import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { db } from './db'

/** Read a full tiered drug entry from the on-device mirror by ATC. Null when absent. */
export async function getMirrorDrugEntry(atcCode: string): Promise<DrugEntry | null> {
  if (!atcCode) return null
  const row = await db.drugCatalogMirror.get(atcCode)
  return (row as DrugEntry | undefined) ?? null
}
