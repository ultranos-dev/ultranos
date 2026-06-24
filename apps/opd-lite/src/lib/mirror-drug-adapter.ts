import type { DrugDatabaseAdapter, VocabInteractionEntry } from '@ultranos/drug-db'
import type { DrugInteraction } from '@ultranos/shared-types'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { db } from './db'
import { createDexieDrugAdapter } from './dexie-drug-adapter'

interface MaybeWithInteractions { innName: string; interactions?: DrugInteraction[] }

/**
 * DrugDatabaseAdapter backed by the enriched on-device catalog mirror.
 * Flattens each drug's structured interactions into the pairwise rows the
 * @ultranos/drug-db checker expects. Read-only; non-PHI.
 */
export function createMirrorDrugAdapter(): DrugDatabaseAdapter {
  return {
    async getInteractions(): Promise<VocabInteractionEntry[]> {
      const entries = (await db.drugCatalogMirror.toArray()) as unknown as MaybeWithInteractions[]
      const rows: VocabInteractionEntry[] = []
      for (const e of entries) {
        for (const ix of e.interactions ?? []) {
          rows.push({
            drugA: e.innName,
            drugB: ix.drugName,
            severity: ix.severity,
            description: ix.mechanism,
          })
        }
      }
      return rows
    },

    async getMetadata() {
      const last = await db.drugCatalogSyncMeta.get('lastSyncAt')
      if (!last?.value) return null
      const ver = await db.drugCatalogSyncMeta.get('catalogVersion')
      return { lastUpdatedAt: last.value, version: ver?.value ? parseInt(ver.value, 10) : 0 }
    },
  }
}

/** Use the mirror adapter once the catalog has synced; else the JSON-seeded vocab adapter. */
export async function resolveDrugAdapter(): Promise<DrugDatabaseAdapter> {
  const count = await db.drugCatalogMirror.count()
  return count > 0 ? createMirrorDrugAdapter() : createDexieDrugAdapter()
}
