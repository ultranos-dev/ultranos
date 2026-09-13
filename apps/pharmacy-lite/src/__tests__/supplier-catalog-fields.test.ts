import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { createSupplier, updateSupplier } from '@/lib/procurement/supplier-service'
import { createCatalogItem, updateCatalogItem } from '@/lib/inventory/catalog-item-service'

beforeEach(async () => {
  await db.delete()
  await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(
      await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      ),
    )
  }
})

describe('supplier master fields', () => {
  it('createSupplier persists the new fields; updateSupplier updates them', async () => {
    const s = await createSupplier({
      name: 'Acme',
      supplierCode: 'ACM',
      taxId: 'TX-1',
      minOrderValue: 10000,
      rating: 4,
      notes: 'reliable',
    })
    expect(s.supplierCode).toBe('ACM')
    expect(s.minOrderValue).toBe(10000)
    expect(s.rating).toBe(4)
    await updateSupplier(s.id, { rating: 5, notes: 'excellent' })
    const after = await db.suppliers.get(s.id)
    expect(after?.rating).toBe(5)
    expect(after?.notes).toBe('excellent')
  })
})

describe('catalog reorderQuantity', () => {
  it('createCatalogItem persists reorderQuantity + marks locallyModified', async () => {
    const c = await createCatalogItem({
      name: 'Amox',
      form: 'tablet',
      strength: '500',
      strengthUnit: 'mg',
      packSize: 10,
      category: 'antibiotic',
      defaultSellingPrice: 100,
      reorderPoint: 5,
      reorderQuantity: 50,
    })
    expect(c.reorderQuantity).toBe(50)
    expect(c.locallyModified).toBe(true)
  })
  it('updateCatalogItem sets reorderQuantity + locallyModified; rejects negative', async () => {
    const c = await createCatalogItem({
      name: 'Amox',
      form: 'tablet',
      strength: '500',
      strengthUnit: 'mg',
      packSize: 10,
      category: 'antibiotic',
      defaultSellingPrice: 100,
      reorderPoint: 5,
    })
    await updateCatalogItem(c.id, { reorderQuantity: 30 })
    const after = await db.catalogItems.get(c.id)
    expect(after?.reorderQuantity).toBe(30)
    expect(after?.locallyModified).toBe(true)
    await expect(
      createCatalogItem({
        name: 'X',
        form: 'tablet',
        strength: '1',
        strengthUnit: 'mg',
        packSize: 1,
        category: 'c',
        defaultSellingPrice: 0,
        reorderPoint: 0,
        reorderQuantity: -1,
      }),
    ).rejects.toThrow()
  })
})
