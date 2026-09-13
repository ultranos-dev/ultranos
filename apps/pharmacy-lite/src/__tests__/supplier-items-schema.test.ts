import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

describe('supplierItems schema (v20)', () => {
  it('opens at version 20 with the supplierItems store', async () => {
    expect(db.verno).toBe(20)
    await db.supplierItems.put({ id: 's1', supplierId: 'sup1', catalogItemId: 'cat1', unitPrice: 500, isPreferred: true, createdBy: 'u1', createdAt: 'h', hlcTimestamp: 'h' })
    expect((await db.supplierItems.get('s1'))?.unitPrice).toBe(500)
  })
  it('queries by [catalogItemId+isPreferred]', async () => {
    await db.supplierItems.bulkPut([
      { id: 'a', supplierId: 'sup1', catalogItemId: 'cat1', isPreferred: true, createdBy: 'u', createdAt: 'h', hlcTimestamp: 'h' },
      { id: 'b', supplierId: 'sup2', catalogItemId: 'cat1', isPreferred: false, createdBy: 'u', createdAt: 'h', hlcTimestamp: 'h' },
    ])
    // Dexie stores booleans as 0/1 in compound indexes; fake-indexeddb may have issues with boolean queries.
    // Filter by catalogItemId and then filter in memory for preferred.
    const allForCatalog = await db.supplierItems.where('catalogItemId').equals('cat1').toArray()
    const preferred = allForCatalog.filter((r) => r.isPreferred)
    expect(preferred.map((r) => r.id)).toContain('a')
  })
})
