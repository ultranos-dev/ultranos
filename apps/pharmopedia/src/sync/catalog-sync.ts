import type * as SQLite from 'expo-sqlite'
import { syncDrugsApi } from '@/api/drug-catalog'
import { upsertDrugBatch, getSyncMeta, setSyncMeta } from '@/db/drug-catalog'

const SYNC_PAGE_SIZE = 200

export interface SyncResult {
  synced: number
  version: number
}

/**
 * Run the drug catalog sync.
 *
 * Initial sync (lastVersion === 0): fetches all pages, calls onProgress after each batch.
 * Incremental sync: fetches only entries newer than the stored lastVersion.
 *
 * Saves latestVersion to sync_meta after each page so a crash mid-sync is recoverable.
 * The caller (root layout / profile screen) must set sync-store status before and after.
 */
export async function runSync(
  db: SQLite.SQLiteDatabase,
  token: string,
  onProgress?: (totalSynced: number) => void,
): Promise<SyncResult> {
  const storedVersion = await getSyncMeta(db, 'lastVersion')
  let sinceVersion = storedVersion ? parseInt(storedVersion, 10) : 0
  let totalSynced = 0
  let latestVersion = sinceVersion

  while (true) {
    const { entries, latestVersion: pageVersion } = await syncDrugsApi(
      sinceVersion,
      SYNC_PAGE_SIZE,
      token,
    )

    if (entries.length === 0) {
      // No new entries — update version in case server advanced without new entries
      if (pageVersion > latestVersion) {
        latestVersion = pageVersion
        await setSyncMeta(db, 'lastVersion', String(latestVersion))
      }
      break
    }

    // Guard against stalled server that returns the same version forever
    if (pageVersion <= sinceVersion && entries.length > 0) {
      throw new Error(
        `Sync stalled: server returned entries but version did not advance (sinceVersion=${sinceVersion}, pageVersion=${pageVersion})`
      )
    }

    await upsertDrugBatch(db, entries)
    latestVersion = pageVersion
    totalSynced += entries.length
    sinceVersion = latestVersion

    await setSyncMeta(db, 'lastVersion', String(latestVersion))
    await setSyncMeta(db, 'lastSyncAt', new Date().toISOString())

    onProgress?.(totalSynced)
  }

  return { synced: totalSynced, version: latestVersion }
}
