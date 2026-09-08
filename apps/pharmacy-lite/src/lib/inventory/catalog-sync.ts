import { db } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import type { CatalogItem } from './types'

const SYNC_PAGE_SIZE = 100

interface CatalogSyncResult {
  itemsSynced: number
  lastSyncedAt: string
}

/** Newest lastSyncedAt among CLEAN (Hub-authoritative) rows only. A locally
 *  modified or local-only row must not advance the pull watermark, else the
 *  next Hub pull would skip server-side changes newer than the local edit. */
export async function computeCatalogWatermark(): Promise<string> {
  const rows = await db.catalogItems.orderBy('lastSyncedAt').reverse().toArray()
  const newestClean = rows.find((r) => !r.locallyModified)
  return newestClean?.lastSyncedAt ?? '1970-01-01T00:00:00.000Z'
}

/** Upsert a Hub batch, skipping any id whose local row is locallyModified
 *  (dirty-guard) so pharmacist edits/deactivations survive the pull.
 *  Returns the number of rows actually written (dirty-skipped rows excluded). */
export async function mergeCatalogBatch(items: CatalogItem[], syncTimestamp: string): Promise<number> {
  if (items.length === 0) return 0
  const ids = items.map((i) => i.id)
  const existing = await db.catalogItems.where('id').anyOf(ids).toArray()
  const dirtyIds = new Set(existing.filter((e) => e.locallyModified).map((e) => e.id))
  const toPut = items
    .filter((i) => !dirtyIds.has(i.id))
    .map((i) => ({ ...i, lastSyncedAt: syncTimestamp, source: 'hub' as const }))
  if (toPut.length > 0) await db.catalogItems.bulkPut(toPut)
  return toPut.length
}

export async function syncCatalogFromHub(
  signal?: AbortSignal,
): Promise<CatalogSyncResult> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) throw new Error('Authentication required')

  const hubBaseUrl = getHubApiUrl()

  const since = await computeCatalogWatermark()

  let cursor: string | undefined
  let totalSynced = 0
  const syncTimestamp = new Date().toISOString()

  while (true) {
    if (signal?.aborted) break

    const url = new URL(hubBaseUrl)
    url.pathname = url.pathname.replace(/\/$/, '') + '/catalog.list'
    const input: Record<string, unknown> = { since, limit: SYNC_PAGE_SIZE }
    if (cursor) input.cursor = cursor
    url.searchParams.set('input', JSON.stringify({ json: input }))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })

    if (!res.ok) {
      if (res.status === 404) break
      throw new Error(`Catalog sync failed: ${res.status}`)
    }

    const body = (await res.json()) as {
      result: { data: { json: { items: CatalogItem[]; nextCursor?: string } } }
    }
    const { items, nextCursor } = body.result.data.json

    totalSynced += await mergeCatalogBatch(items, syncTimestamp)

    if (!nextCursor || items.length < SYNC_PAGE_SIZE) break
    cursor = nextCursor
  }

  return { itemsSynced: totalSynced, lastSyncedAt: syncTimestamp }
}

export async function searchCatalog(query: string): Promise<CatalogItem[]> {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed || trimmed.length < 2) return []

  const barcodeMatch = await db.catalogItems.where('barcode').equals(trimmed).first()
  if (barcodeMatch) return [barcodeMatch]

  return db.catalogItems
    .filter((item) =>
      item.isActive && (
        item.name.toLowerCase().includes(trimmed) ||
        (item.nameLocal?.toLowerCase().includes(trimmed) ?? false)
      )
    )
    .limit(20)
    .toArray()
}
