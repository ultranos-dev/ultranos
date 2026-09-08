import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createCatalogItem, updateCatalogItem, deactivateCatalogItem } from '@/lib/inventory/catalog-item-service'

beforeEach(async () => { await db.catalogItems.clear() })

const VALID = {
  name: 'Paracetamol 500mg', form: 'tablet' as const, strength: '500', strengthUnit: 'mg',
  packSize: 20, category: 'analgesic', defaultSellingPrice: 500, reorderPoint: 10,
}

describe('createCatalogItem', () => {
  it('creates a local item flagged source=local + locallyModified, active, with a generated id', async () => {
    const created = await createCatalogItem(VALID)
    expect(created.id).toBeTruthy()
    expect(created.source).toBe('local')
    expect(created.locallyModified).toBe(true)
    expect(created.isActive).toBe(true)
    const stored = await db.catalogItems.get(created.id)
    expect(stored!.name).toBe('Paracetamol 500mg')
    expect(stored!.defaultSellingPrice).toBe(500) // minor units, stored as-is
  })

  it('rejects an empty name', async () => {
    await expect(createCatalogItem({ ...VALID, name: '  ' })).rejects.toThrow()
  })
  it('rejects a non-positive packSize', async () => {
    await expect(createCatalogItem({ ...VALID, packSize: 0 })).rejects.toThrow()
  })
  it('rejects a negative price', async () => {
    await expect(createCatalogItem({ ...VALID, defaultSellingPrice: -1 })).rejects.toThrow()
  })
})

describe('updateCatalogItem', () => {
  it('applies updates and flags the row locallyModified', async () => {
    const c = await createCatalogItem(VALID)
    // simulate a clean Hub row to prove update flips the flag
    await db.catalogItems.update(c.id, { locallyModified: false, source: 'hub' })
    await updateCatalogItem(c.id, { defaultSellingPrice: 750 })
    const u = await db.catalogItems.get(c.id)
    expect(u!.defaultSellingPrice).toBe(750)
    expect(u!.locallyModified).toBe(true)
  })
})

describe('deactivateCatalogItem', () => {
  it('sets isActive false and flags locallyModified (survives sync)', async () => {
    const c = await createCatalogItem(VALID)
    await db.catalogItems.update(c.id, { locallyModified: false, source: 'hub' })
    await deactivateCatalogItem(c.id)
    const d = await db.catalogItems.get(c.id)
    expect(d!.isActive).toBe(false)
    expect(d!.locallyModified).toBe(true)
  })
})
