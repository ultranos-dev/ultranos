import type { SyncQueueEntry, ConflictResolution } from '@ultranos/sync-engine'
import { db } from './db'
import { useSyncStore } from '@/stores/sync-store'

/**
 * DrainWorker onConflict observer for pharmacy-lite. Pharmacy authors no
 * Tier-1 data, so a Hub conflict here means the Hub's version is newer-or-
 * concurrent for a Tier-2/3 resource; the tiered resolver's policy applies and
 * the worker markSynced's the (now obsolete) local push. We only RECORD the
 * event for observability — and only when the resolver marks it a genuine
 * concurrent conflict. No remote PHI is persisted; best-effort, never throws.
 */
export async function recordSyncConflict(
  entry: SyncQueueEntry,
  resolution: ConflictResolution,
): Promise<void> {
  if (!resolution.conflictFlag) return
  try {
    await db.syncQueue.update(entry.id, { conflictFlag: true })
    const count = await db.syncQueue.filter((e) => e.conflictFlag === true).count()
    useSyncStore.getState().setConflictCount(count)
  } catch {
    // observability is best-effort — never throw (would markFailed the entry)
  }
}
