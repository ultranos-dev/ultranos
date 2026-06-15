import { db } from '@/lib/db'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import type { CatalogItem } from './types'

const SYNC_PAGE_SIZE = 100

interface CatalogSyncResult {
  itemsSynced: number
  lastSyncedAt: string
}

export async function syncCatalogFromHub(
  signal?: AbortSignal,
): Promise<CatalogSyncResult> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) throw new Error('Authentication required')

  const hubBaseUrl = getHubApiUrl()

  const mostRecent = await db.catalogItems
    .orderBy('lastSyncedAt')
    .reverse()
    .first()
  const since = mostRecent?.lastSyncedAt ?? '1970-01-01T00:00:00.000Z'

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

    if (items.length > 0) {
      const stamped = items.map((item) => ({ ...item, lastSyncedAt: syncTimestamp }))
      await db.catalogItems.bulkPut(stamped)
      totalSynced += items.length
    }

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
