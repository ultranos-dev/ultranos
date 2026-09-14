import { db } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import { enqueueStockBatchSync } from './stock-batch-sync'
import { DEFAULT_LOCATION_ID } from './types'
import type { StockLocation } from './types'
import type { FacilityLocation } from '@ultranos/shared-types'

export interface LocationSyncResult { locationsSynced: number; lastSyncedAt: string }

/** Reassign every batch tagged 'default'/'' to the facility's primary sub-location
 *  and re-sync each so the Hub's location_id is corrected. Idempotent. */
export async function reconcileLegacyLocations(primaryId: string): Promise<number> {
  const legacy = await db.stockBatches.where('locationId').anyOf([DEFAULT_LOCATION_ID, '']).toArray()
  if (legacy.length === 0) return 0
  const now = new Date().toISOString()
  const ids = legacy.map((b) => b.id)
  await db.transaction('rw', db.stockBatches, async () => {
    for (const id of ids) await db.stockBatches.update(id, { locationId: primaryId, hlcTimestamp: now })
  })
  // enqueue AFTER the tx (Web Crypto cannot run inside a Dexie tx zone)
  for (const id of ids) {
    const updated = await db.stockBatches.get(id)
    if (updated) await enqueueStockBatchSync(updated)
  }
  return ids.length
}

export async function syncLocationsFromHub(signal?: AbortSignal): Promise<LocationSyncResult> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) throw new Error('Authentication required')

  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/facilityLocations.listForFacility'

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal })
  if (!res.ok) throw new Error(`Location sync failed: ${res.status}`)

  const body = (await res.json()) as { result: { data: { json: FacilityLocation[] } } }
  const rows = body.result.data.json ?? []
  const lastSyncedAt = new Date().toISOString()
  const toStore: StockLocation[] = rows.map((r) => ({ ...r, lastSyncedAt }))

  await db.transaction('rw', db.stockLocations, async () => {
    await db.stockLocations.clear()
    if (toStore.length > 0) await db.stockLocations.bulkPut(toStore)
  })

  const primary = toStore.find((l) => l.isPrimary && l.isActive)
  if (primary) await reconcileLegacyLocations(primary.id)

  return { locationsSynced: toStore.length, lastSyncedAt }
}
