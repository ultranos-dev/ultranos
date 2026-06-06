/**
 * Dexie adapter for the sync-engine SyncQueueStorage interface.
 *
 * Bridges pharmacy-lite's Dexie syncQueue table to the platform-agnostic
 * sync-engine queue. Handles the status value mismatch: pharmacy db.ts
 * uses 'in-flight' while sync-engine uses 'syncing'.
 */

import type { SyncQueueStorage, SyncQueueEntry } from '@ultranos/sync-engine'
import { db, type SyncQueueEntry as DexieSyncQueueEntry } from './db'

/** Map sync-engine status values to Dexie status values. */
function toDbStatus(status: string): string {
  return status === 'syncing' ? 'in-flight' : status
}

/** Map Dexie status values to sync-engine status values. */
function fromDbStatus(status: string): SyncQueueEntry['status'] {
  if (status === 'in-flight') return 'syncing'
  return status as SyncQueueEntry['status']
}

/** Convert a Dexie entry to a sync-engine SyncQueueEntry. */
function fromDbEntry(entry: DexieSyncQueueEntry): SyncQueueEntry {
  return {
    ...entry,
    action: entry.action as SyncQueueEntry['action'],
    status: fromDbStatus(entry.status),
  }
}

/** Convert a sync-engine SyncQueueEntry to Dexie format. */
function toDbEntry(entry: SyncQueueEntry): DexieSyncQueueEntry {
  return {
    ...entry,
    status: toDbStatus(entry.status) as DexieSyncQueueEntry['status'],
  }
}

export const dexieSyncAdapter: SyncQueueStorage = {
  async put(entry: SyncQueueEntry): Promise<void> {
    await db.syncQueue.put(toDbEntry(entry))
  },

  async getByResourceId(resourceId: string, status: string): Promise<SyncQueueEntry | null> {
    const dbStatus = toDbStatus(status)
    const entry = await db.syncQueue
      .where({ resourceId, status: dbStatus })
      .first()
    return entry ? fromDbEntry(entry) : null
  },

  async getByStatus(status: string): Promise<SyncQueueEntry[]> {
    const dbStatus = toDbStatus(status)
    const entries = await db.syncQueue
      .where('status')
      .equals(dbStatus)
      .toArray()
    return entries.map(fromDbEntry)
  },

  async delete(id: string): Promise<void> {
    await db.syncQueue.delete(id)
  },

  async count(status: string): Promise<number> {
    const dbStatus = toDbStatus(status)
    return db.syncQueue.where('status').equals(dbStatus).count()
  },

  async getLatestSynced(): Promise<SyncQueueEntry | null> {
    const synced = await db.syncQueue
      .where('status')
      .equals('synced')
      .toArray()
    if (synced.length === 0) return null
    // Sort by lastAttemptAt descending to get the most recent
    synced.sort((a, b) => {
      const aTime = a.lastAttemptAt ? new Date(a.lastAttemptAt).getTime() : 0
      const bTime = b.lastAttemptAt ? new Date(b.lastAttemptAt).getTime() : 0
      return bTime - aTime
    })
    const first = synced[0]
    return first ? fromDbEntry(first) : null
  },

}
