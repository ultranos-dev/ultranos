import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { mergeCatalogBatch, computeCatalogWatermark } from '@/lib/inventory/catalog-sync'
import type { CatalogItem } from '@/lib/inventory/types'

function item(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'x', name: 'Item', form: 'tablet', strength: '1', strengthUnit: 'mg',
    packSize: 1, category: 'misc', defaultSellingPrice: 0, reorderPoint: 0,
    isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z', ...over,
  }
}

beforeEach(async () => {
  await db.catalogItems.clear()
})

describe('catalog dirty-guard', () => {
  it('does NOT overwrite a locally-modified row on Hub sync', async () => {
    await db.catalogItems.put(item({ id: 'a', name: 'LOCAL EDIT', defaultSellingPrice: 999, locallyModified: true }))
    // Hub returns a competing version of the same id
    await mergeCatalogBatch([item({ id: 'a', name: 'HUB NAME', defaultSellingPrice: 100 })], '2026-06-01T00:00:00.000Z')
    const a = await db.catalogItems.get('a')
    expect(a!.name).toBe('LOCAL EDIT')          // local edit preserved
    expect(a!.defaultSellingPrice).toBe(999)
  })

  it('DOES upsert a clean Hub row', async () => {
    await db.catalogItems.put(item({ id: 'b', name: 'OLD', locallyModified: false }))
    await mergeCatalogBatch([item({ id: 'b', name: 'NEW' })], '2026-06-01T00:00:00.000Z')
    expect((await db.catalogItems.get('b'))!.name).toBe('NEW')
  })

  it('watermark ignores locally-modified / local-only rows', async () => {
    await db.catalogItems.put(item({ id: 'h', lastSyncedAt: '2026-03-01T00:00:00.000Z', locallyModified: false }))
    await db.catalogItems.put(item({ id: 'l', lastSyncedAt: '2026-09-01T00:00:00.000Z', locallyModified: true, source: 'local' }))
    // newest CLEAN row is 'h'; the local row must NOT advance the watermark
    expect(await computeCatalogWatermark()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('mergeCatalogBatch is a no-op returning 0 for an empty batch', async () => {
    const written = await mergeCatalogBatch([], '2026-06-01T00:00:00.000Z')
    expect(written).toBe(0)
    expect(await db.catalogItems.count()).toBe(0)
  })

  it('mergeCatalogBatch returns the count actually written (dirty rows excluded)', async () => {
    await db.catalogItems.put(item({ id: 'a', name: 'LOCAL', locallyModified: true }))
    // batch has 2 items; id 'a' is dirty and must be skipped → only 1 written
    const written = await mergeCatalogBatch(
      [item({ id: 'a', name: 'HUB' }), item({ id: 'c', name: 'FRESH' })],
      '2026-06-01T00:00:00.000Z',
    )
    expect(written).toBe(1)
    expect((await db.catalogItems.get('a'))!.name).toBe('LOCAL') // preserved
  })
})
