import { db } from '@/lib/db'
import { getHubApiUrl } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { compareHlc, deserializeHlc } from '@ultranos/sync-engine'

const WHOLESALE_TYPES = [
  'WholesaleCustomer',
  'SalesOrder',
  'CustomerLedgerEntry',
  'ContractPrice',
  'Supplier',
  'PurchaseOrder',
  'GoodsReceipt',
  'StockBatch',
  'StockMovement',
] as const

interface PullChange {
  resourceType: string
  resourceId: string
  hlcTimestamp: string
  data: Record<string, unknown>
}

/**
 * Returns true if there is a locally-dirty sync-queue entry for this resourceId.
 * Dirty statuses: pending, in-flight, failed, awaiting-key.
 * A row with any of these statuses has un-committed local changes that must not
 * be overwritten by a remote pull (dirty-write protection).
 */
async function isLocalDirty(id: string): Promise<boolean> {
  const entries = await db.syncQueue.where('resourceId').equals(id).toArray()
  return entries.some(
    (e) =>
      e.status === 'pending' ||
      e.status === 'in-flight' ||
      e.status === 'failed' ||
      e.status === 'awaiting-key',
  )
}

function tableFor(resourceType: string) {
  if (resourceType === 'WholesaleCustomer') return db.wholesaleCustomers
  if (resourceType === 'SalesOrder') return db.salesOrders
  if (resourceType === 'CustomerLedgerEntry') return db.customerLedgerEntries
  if (resourceType === 'ContractPrice') return db.contractPrices
  if (resourceType === 'Supplier') return db.suppliers
  if (resourceType === 'PurchaseOrder') return db.purchaseOrders
  if (resourceType === 'GoodsReceipt') return db.goodsReceipts
  if (resourceType === 'StockBatch') return db.stockBatches
  if (resourceType === 'StockMovement') return db.stockMovements
  return null
}

/**
 * Map a Hub resource row to the client Dexie row shape.
 * CustomerLedgerEntry: Hub uses `entryTimestamp`; local Dexie uses `timestamp`.
 */
function toClientRow(
  resourceType: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (resourceType === 'CustomerLedgerEntry') {
    const { entryTimestamp, ...rest } = data
    return { ...rest, timestamp: entryTimestamp }
  }
  if (resourceType === 'ContractPrice') {
    const { price, ...rest } = data
    return { ...rest, priceMinor: price }
  }
  if (resourceType === 'StockMovement') {
    const { movementTimestamp, ...rest } = data
    return { ...rest, timestamp: movementTimestamp }
  }
  // WholesaleCustomer / SalesOrder / Supplier / PurchaseOrder / GoodsReceipt / StockBatch
  // already match the local shape (camelCase, including items[])
  return data
}

/**
 * Compare two HLC strings. Returns negative if a < b, 0 if equal, positive if a > b.
 * Hub uses `deserializeHlc` + `compareHlc` — reuse the same helpers here.
 * Falls back to lexicographic comparison if deserialization fails (e.g. '0' sentinel).
 */
function compareHlcStrings(a: string, b: string): number {
  try {
    return compareHlc(deserializeHlc(a), deserializeHlc(b))
  } catch {
    // Sentinel '0' and other non-HLC strings: fall back to lexicographic
    return a < b ? -1 : a > b ? 1 : 0
  }
}

/**
 * Pull wholesale resource changes from the Hub since the last watermark.
 *
 * - Reads the watermark from `db.wholesalePullMeta` (defaults to '0').
 * - Calls sync.pull (GET, query procedure) with resourceTypes + sinceHlc.
 * - Per change: skips if the local row has a dirty sync-queue entry; otherwise
 *   puts the mapped row into the appropriate Dexie table.
 * - Advances the watermark to the max HLC seen in the batch.
 * - Never throws — returns { pulled: 0, applied: 0 } and leaves the watermark
 *   unchanged on any error (network failure, parse error, non-ok response).
 */
export async function pullWholesale(): Promise<{ pulled: number; applied: number }> {
  try {
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return { pulled: 0, applied: 0 }

    const meta = await db.wholesalePullMeta.get('wholesale')
    const sinceHlc = meta?.lastPulledHlc ?? '0'

    // sync.pull is a tRPC query — GET with URL-encoded input
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/sync.pull'
    url.searchParams.set(
      'input',
      JSON.stringify({ json: { resourceTypes: WHOLESALE_TYPES, sinceHlc } }),
    )

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) return { pulled: 0, applied: 0 }

    const body = (await res.json()) as {
      result?: { data?: { json?: { changes?: PullChange[] } } }
    }
    const changes = body.result?.data?.json?.changes ?? []

    let applied = 0
    let maxHlc = sinceHlc

    for (const ch of changes) {
      const table = tableFor(ch.resourceType)
      if (!table) continue

      if (!(await isLocalDirty(ch.resourceId))) {
        const clientRow = toClientRow(ch.resourceType, ch.data)
        if ((clientRow as Record<string, unknown>).deletedAt) {
          await table.delete(ch.resourceId)
        } else {
          await table.put(clientRow as never)
        }
        applied++
      }

      // Advance the high-water mark to the largest HLC in the batch.
      // Intentionally OUTSIDE the dirty gate: a change skipped as locally-dirty
      // (incl. a skipped tombstone) still advances the watermark, so we don't
      // re-pull it forever — the local edit re-asserts itself on its own push.
      if (compareHlcStrings(ch.hlcTimestamp, maxHlc) > 0) {
        maxHlc = ch.hlcTimestamp
      }
    }

    // Only write if the watermark actually moved
    if (maxHlc !== sinceHlc) {
      await db.wholesalePullMeta.put({ key: 'wholesale', lastPulledHlc: maxHlc })
    }

    return { pulled: changes.length, applied }
  } catch {
    // Soft-fail: offline, token missing, parse error, etc.
    // Watermark is NOT advanced — next call will re-pull from the same offset.
    return { pulled: 0, applied: 0 }
  }
}
