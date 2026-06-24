import type { DrugDatabaseAdapter, VocabInteractionEntry } from '@ultranos/drug-db'
import type { DrugInteraction } from '@ultranos/shared-types'
import { db } from './db'

interface MaybeWithInteractions { innName: string; interactions?: DrugInteraction[] }

/**
 * DrugDatabaseAdapter backed by the enriched on-device catalog mirror.
 * Flattens each drug's structured interactions into the pairwise rows the
 * @ultranos/drug-db checker expects. Read-only; non-PHI.
 * (Flatten logic mirrors OPD-Lite's mirror-drug-adapter — see Decision D3.)
 */
export function createMirrorDrugAdapter(): DrugDatabaseAdapter {
  return {
    async getInteractions(): Promise<VocabInteractionEntry[]> {
      const entries = (await db.drugCatalogMirror.toArray()) as unknown as MaybeWithInteractions[]
      const rows: VocabInteractionEntry[] = []
      for (const e of entries) {
        for (const ix of e.interactions ?? []) {
          rows.push({ drugA: e.innName, drugB: ix.drugName, severity: ix.severity, description: ix.mechanism })
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

/**
 * Mirror adapter when the catalog has synced; null otherwise (caller surfaces UNAVAILABLE — never CLEAR).
 * The `count > 0` gate is intentionally optimistic — callers check `getMetadata().lastUpdatedAt`
 * for freshness/staleness (the @ultranos/drug-db checker degrades stale data to UNAVAILABLE).
 */
export async function resolveDrugAdapter(): Promise<DrugDatabaseAdapter | null> {
  const count = await db.drugCatalogMirror.count()
  return count > 0 ? createMirrorDrugAdapter() : null
}
