import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import type { StockBatch } from '@/lib/inventory/types'

const enqueueSpy = vi.fn(async (_b: unknown) => {})
vi.mock('@/lib/inventory/stock-batch-sync', () => ({ enqueueStockBatchSync: (b: unknown) => enqueueSpy(b) }))
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ getAccessToken: async () => 'tok' }) },
}))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'https://hub.example/api/trpc/' }))

import { syncLocationsFromHub, reconcileLegacyLocations } from '@/lib/inventory/location-sync'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  enqueueSpy.mockClear()
})

function batch(over: Partial<StockBatch>): StockBatch {
  return { id: 'b1', catalogItemId: 'c1', batchNumber: 'B1', expiryDate: '2027-01-01', quantityOnHand: 5, costPrice: 100, sellingPrice: 150, receivedAt: '2026-01-01T00:00:00.000Z', status: 'active', locationId: 'default', hlcTimestamp: 'h', ...over } as StockBatch
}

describe('syncLocationsFromHub', () => {
  it('full-replaces the cache and reconciles legacy batches when a primary exists', async () => {
    await db.stockLocations.put({ id: 'stale', facilityId: 'f1', name: 'Stale', kind: 'store', isPrimary: false, isActive: true, lastSyncedAt: 'old' })
    await db.stockBatches.bulkPut([batch({ id: 'b1', locationId: 'default' }), batch({ id: 'b2', locationId: '' }), batch({ id: 'b3', locationId: 'main' })])
    const rows = [
      { id: 'main', facilityId: 'f1', name: 'Main', kind: 'store', isPrimary: true, isActive: true },
      { id: 'fridge', facilityId: 'f1', name: 'Fridge', kind: 'fridge', isPrimary: false, isActive: true },
    ]
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ result: { data: { json: rows } } }), { status: 200 })) as never
    const res = await syncLocationsFromHub()
    expect(res.locationsSynced).toBe(2)
    expect(await db.stockLocations.get('stale')).toBeUndefined()   // full replace removed the stale row
    expect((await db.stockLocations.get('main'))?.name).toBe('Main')
    // legacy 'default'/'' batches reassigned to the primary + re-synced
    expect((await db.stockBatches.get('b1'))?.locationId).toBe('main')
    expect((await db.stockBatches.get('b2'))?.locationId).toBe('main')
    expect((await db.stockBatches.get('b3'))?.locationId).toBe('main') // was already 'main'
    expect(enqueueSpy).toHaveBeenCalledTimes(2)                     // only the two reassigned
  })

  it('propagates a fetch failure and leaves the cache unchanged', async () => {
    await db.stockLocations.put({ id: 'keep', facilityId: 'f1', name: 'Keep', kind: 'store', isPrimary: true, isActive: true, lastSyncedAt: 'old' })
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as never
    await expect(syncLocationsFromHub()).rejects.toBeTruthy()
    expect((await db.stockLocations.get('keep'))?.name).toBe('Keep')
  })
})

describe('reconcileLegacyLocations', () => {
  it('is idempotent — a second run reassigns zero', async () => {
    await db.stockBatches.put(batch({ id: 'b1', locationId: 'default' }))
    expect(await reconcileLegacyLocations('main')).toBe(1)
    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    enqueueSpy.mockClear()
    expect(await reconcileLegacyLocations('main')).toBe(0)
    expect(enqueueSpy).not.toHaveBeenCalled()
  })
})
