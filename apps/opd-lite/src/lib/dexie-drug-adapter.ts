import type { DrugDatabaseAdapter, VocabInteractionEntry } from '@ultranos/drug-db'
import { db } from './db'

/**
 * Dexie-backed adapter for the @ultranos/drug-db package.
 * Reads interaction entries from the OPD Lite IndexedDB vocabulary table.
 */
export function createDexieDrugAdapter(): DrugDatabaseAdapter {
  return {
    async getInteractions(): Promise<VocabInteractionEntry[]> {
      const entries = await db.vocabularyInteractions.toArray()
      return entries.map((e) => ({
        drugA: e.drugA,
        drugB: e.drugB,
        severity: e.severity,
        description: e.description,
      }))
    },

    async getMetadata() {
      const lastSynced = localStorage.getItem('ultranos:vocab-last-synced:interactions')
      if (!lastSynced) return null
      const version = localStorage.getItem('ultranos:vocab-version:interactions')
      return {
        lastUpdatedAt: lastSynced,
        version: version ? parseInt(version, 10) : 0,
      }
    },
  }
}
