/**
 * Sync queue retention pass.
 *
 * Synced queue entries accumulate encrypted PHI payloads indefinitely —
 * unbounded retention of clinical payloads that already reached the Hub.
 * This pass bounds that: synced rows older than the retention window are
 * deleted, except the single most-recent synced row, which is kept (with
 * its payload stripped) so getLatestSynced / getLastSyncedAt keep working.
 *
 * SAFETY INVARIANTS — verified by tests, never weaken:
 * - ONLY entries with status 'synced' are eligible. 'awaiting-key',
 *   'failed', 'pending', 'syncing', 'resolved', and any conflict-flagged
 *   state are NEVER touched — those still carry undelivered or
 *   under-review data.
 * - The newest synced entry is never deleted (preserves lastSyncedAt).
 */

import type { SyncQueueStorage, SyncQueueEntry } from './queue.js'

/** Default retention window for synced entries, in days. */
export const DEFAULT_RETENTION_DAYS = 30

export interface RetentionOptions {
  /** Days to keep synced entries. Default 30. */
  retentionDays?: number
  /** Clock override for tests. Returns epoch ms. */
  now?: () => number
}

export interface RetentionResult {
  /** Synced rows deleted (older than the window, not the newest). */
  deletedCount: number
  /** Payloads stripped in-place (the retained newest synced row). */
  strippedCount: number
}

/** Effective completion time of a synced entry. */
function syncedAtMs(entry: SyncQueueEntry): number {
  return new Date(entry.lastAttemptAt ?? entry.createdAt).getTime()
}

/**
 * Run one retention pass over the sync queue.
 * Safe to call repeatedly (idempotent). Never throws on an empty queue.
 */
export async function runRetentionPass(
  storage: SyncQueueStorage,
  options: RetentionOptions = {},
): Promise<RetentionResult> {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS
  const nowMs = options.now ? options.now() : Date.now()
  const cutoffMs = nowMs - retentionDays * 24 * 60 * 60 * 1000

  // ONLY synced entries — by construction this pass can never touch
  // awaiting-key / failed / pending / syncing / resolved entries.
  const synced = await storage.getByStatus('synced')
  if (synced.length === 0) return { deletedCount: 0, strippedCount: 0 }

  // Newest synced entry (by completion time) anchors getLastSyncedAt.
  const newest = synced.reduce((a, b) => (syncedAtMs(b) > syncedAtMs(a) ? b : a))

  let deletedCount = 0
  let strippedCount = 0

  for (const entry of synced) {
    const ageEligible = syncedAtMs(entry) < cutoffMs
    if (!ageEligible) continue

    if (entry.id === newest.id) {
      // Keep the newest synced row so lastSyncedAt survives, but strip its
      // (encrypted PHI) payload — it is no longer needed once synced.
      if (entry.payload !== '') {
        await storage.put({ ...entry, payload: '' })
        strippedCount++
      }
      continue
    }

    await storage.delete(entry.id)
    deletedCount++
  }

  return { deletedCount, strippedCount }
}
