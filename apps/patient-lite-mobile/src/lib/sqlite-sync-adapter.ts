/**
 * SQLite-backed SyncQueueStorage adapter for Patient Lite Mobile.
 *
 * Implements the SyncQueueStorage interface from @ultranos/sync-engine
 * using expo-sqlite with SQLCipher encryption. The sync_queue table
 * lives in the same encrypted DB as patient data, so queue entries
 * are automatically encrypted at rest.
 */
import type { SQLiteDatabase } from 'expo-sqlite'
import type { SyncQueueEntry, SyncQueueStorage } from '@ultranos/sync-engine'

/**
 * Create a SyncQueueStorage adapter backed by the encrypted SQLite DB.
 * The caller must pass an already-opened, authenticated DB connection.
 */
export function createSqliteSyncAdapter(db: SQLiteDatabase): SyncQueueStorage {
  return {
    async put(entry: SyncQueueEntry): Promise<void> {
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_queue
           (id, resource_type, resource_id, action, payload, status, hlc_timestamp, created_at, retry_count, last_attempt_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.id,
        entry.resourceType,
        entry.resourceId,
        entry.action,
        entry.payload,
        entry.status,
        entry.hlcTimestamp,
        entry.createdAt,
        entry.retryCount,
        entry.lastAttemptAt ?? null,
      )
    },

    async getByResourceId(
      resourceId: string,
      resourceType: string,
      status: string,
    ): Promise<SyncQueueEntry | null> {
      const row = await db.getFirstAsync<SyncQueueRow>(
        `SELECT * FROM sync_queue WHERE resource_id = ? AND resource_type = ? AND status = ? LIMIT 1`,
        resourceId,
        resourceType,
        status,
      )
      return row ? rowToEntry(row) : null
    },

    async getByStatus(status: string): Promise<SyncQueueEntry[]> {
      const rows = await db.getAllAsync<SyncQueueRow>(
        `SELECT * FROM sync_queue WHERE status = ?`,
        status,
      )
      return rows.map(rowToEntry)
    },

    async delete(id: string): Promise<void> {
      await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, id)
    },

    async count(status: string): Promise<number> {
      const row = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM sync_queue WHERE status = ?`,
        status,
      )
      return row?.cnt ?? 0
    },

    async getLatestSynced(): Promise<SyncQueueEntry | null> {
      const row = await db.getFirstAsync<SyncQueueRow>(
        `SELECT * FROM sync_queue WHERE status = 'synced' ORDER BY last_attempt_at DESC LIMIT 1`,
      )
      return row ? rowToEntry(row) : null
    },

    async totalCount(): Promise<number> {
      const row = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM sync_queue`,
      )
      return row?.cnt ?? 0
    },

    async estimateSizeBytes(): Promise<number> {
      const row = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(LENGTH(payload)), 0) AS total FROM sync_queue`,
      )
      return row?.total ?? 0
    },
  }
}

/** SQLite row shape — snake_case columns mapped to SyncQueueEntry camelCase. */
interface SyncQueueRow {
  id: string
  resource_type: string
  resource_id: string
  action: string
  payload: string
  status: string
  hlc_timestamp: string
  created_at: string
  retry_count: number
  last_attempt_at: string | null
}

function rowToEntry(row: SyncQueueRow): SyncQueueEntry {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    action: row.action as SyncQueueEntry['action'],
    payload: row.payload,
    status: row.status as SyncQueueEntry['status'],
    hlcTimestamp: row.hlc_timestamp,
    createdAt: row.created_at,
    retryCount: row.retry_count,
    lastAttemptAt: row.last_attempt_at ?? undefined,
  }
}
