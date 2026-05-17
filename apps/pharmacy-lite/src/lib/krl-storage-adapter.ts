import type { KRLStorage, KRLEntry } from '@ultranos/sync-engine'
import { db } from './db'

/**
 * Dexie-backed KRLStorage adapter for Pharmacy Lite.
 * Story 19.5 Task 1: Maps the platform-agnostic KRLStorage interface
 * to the local IndexedDB `revokedKeys` table.
 *
 * Non-PHI table — contains only opaque public keys and timestamps.
 */
export const dexieKrlStorage: KRLStorage = {
  async getAll(): Promise<KRLEntry[]> {
    return db.revokedKeys.toArray()
  },

  async replaceAll(entries: KRLEntry[]): Promise<void> {
    await db.transaction('rw', db.revokedKeys, async () => {
      await db.revokedKeys.clear()
      if (entries.length > 0) {
        await db.revokedKeys.bulkPut(entries)
      }
    })
  },

  async has(publicKey: string): Promise<boolean> {
    const entry = await db.revokedKeys.get(publicKey)
    return !!entry
  },
}
