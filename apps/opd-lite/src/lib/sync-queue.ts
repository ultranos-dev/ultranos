/**
 * OPD-Lite sync queue singleton.
 *
 * Wires the generic sync-engine queue to the Dexie syncQueue table.
 * Imported by stores to enqueue sync operations on local writes.
 */

import { createSyncQueue, type SyncQueueStorage, type SyncQueueEntry } from '@ultranos/sync-engine'
import { db } from './db'

/** Dexie-backed storage adapter for the sync queue. */
const dexieStorage: SyncQueueStorage = {
  async put(entry: SyncQueueEntry) {
    await db.syncQueue.put(entry)
  },

  async getByResourceId(resourceId: string, status: string) {
    return (
      (await db.syncQueue
        .where('resourceId')
        .equals(resourceId)
        .filter((e) => e.status === status)
        .first()) ?? null
    )
  },

  async getByStatus(status: string) {
    return db.syncQueue.where('status').equals(status).toArray()
  },

  async delete(id: string) {
    await db.syncQueue.delete(id)
  },

  async count(status: string) {
    return db.syncQueue.where('status').equals(status).count()
  },

  async getLatestSynced() {
    const synced = await db.syncQueue
      .where('status')
      .equals('synced')
      .toArray()
    if (synced.length === 0) return null
    synced.sort((a, b) => (b.lastAttemptAt ?? b.createdAt).localeCompare(a.lastAttemptAt ?? a.createdAt))
    return synced[0]
  },
}

export const syncQueue = createSyncQueue(dexieStorage)
