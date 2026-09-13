import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import {
  upsertSupplierItem, setPreferredSupplier, getSupplierItemsForCatalogItem,
  getPreferredSupplierItem, getSupplierItemsForSupplier, removeSupplierItem,
} from '@/lib/procurement/supplier-item-service'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

describe('upsertSupplierItem', () => {
  it('creates a link + enqueues a SupplierItem sync entry', async () => {
    const r = await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 500, createdBy: 'u1' })
    expect(r.id).toBeDefined()
    expect((await db.supplierItems.get(r.id))?.unitPrice).toBe(500)
    expect((await db.syncQueue.toArray()).some((q) => q.resourceType === 'SupplierItem')).toBe(true)
  })
  it('upserts a duplicate (supplierId, catalogItemId) in place (no second row)', async () => {
    await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 500, createdBy: 'u1' })
    await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 700, minOrderQty: 10, createdBy: 'u1' })
    const rows = await getSupplierItemsForCatalogItem('cat1')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.unitPrice).toBe(700)
    expect(rows[0]!.minOrderQty).toBe(10)
  })
  it('setting isPreferred clears it on other rows for the same item (exactly one preferred)', async () => {
    const a = await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', isPreferred: true, createdBy: 'u1' })
    await upsertSupplierItem({ supplierId: 'sup2', catalogItemId: 'cat1', isPreferred: true, createdBy: 'u1' })
    const rows = await getSupplierItemsForCatalogItem('cat1')
    expect(rows.filter((r) => r.isPreferred)).toHaveLength(1)
    expect((await getPreferredSupplierItem('cat1'))?.supplierId).toBe('sup2')
    expect((await db.supplierItems.get(a.id))?.isPreferred).toBe(false)
  })
})

describe('setPreferredSupplier / queries / remove', () => {
  it('setPreferredSupplier makes exactly one row preferred', async () => {
    const a = await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', createdBy: 'u1' })
    const b = await upsertSupplierItem({ supplierId: 'sup2', catalogItemId: 'cat1', createdBy: 'u1' })
    await setPreferredSupplier('cat1', a.id)
    await setPreferredSupplier('cat1', b.id)
    const rows = await getSupplierItemsForCatalogItem('cat1')
    expect(rows.filter((r) => r.isPreferred).map((r) => r.id)).toEqual([b.id])
  })
  it('getSupplierItemsForSupplier + removeSupplierItem', async () => {
    const a = await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat1', createdBy: 'u1' })
    await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'cat2', createdBy: 'u1' })
    expect(await getSupplierItemsForSupplier('sup1')).toHaveLength(2)
    await removeSupplierItem(a.id)
    expect(await db.supplierItems.get(a.id)).toBeUndefined()
  })
})
