import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { getLastPurchaseCost, getReorderReport, generateReorderPurchaseOrders } from '@/lib/procurement/reorder-service'
import { upsertSupplierItem } from '@/lib/procurement/supplier-item-service'
import type { CatalogItem, StockBatch } from '@/lib/inventory/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
})

function cat(over: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'c1', name: 'Amoxicillin', form: 'tablet', strength: '500', strengthUnit: 'mg', packSize: 10,
    category: 'antibiotic', defaultSellingPrice: 150, reorderPoint: 10, isActive: true,
    lastSyncedAt: 'h', ...over,
  } as CatalogItem
}
function batch(over: Partial<StockBatch>): StockBatch {
  return {
    id: 'b1', catalogItemId: 'c1', batchNumber: 'B1', expiryDate: '2027-01-01', quantityOnHand: 5,
    costPrice: 100, sellingPrice: 150, receivedAt: '2026-01-01T00:00:00.000Z', status: 'active',
    locationId: 'loc1', hlcTimestamp: 'h', ...over,
  } as StockBatch
}

describe('getLastPurchaseCost', () => {
  it('returns the newest batch costPrice; undefined when none', async () => {
    await db.stockBatches.bulkPut([
      batch({ id: 'b1', costPrice: 100, receivedAt: '2026-01-01T00:00:00.000Z' }),
      batch({ id: 'b2', costPrice: 130, receivedAt: '2026-03-01T00:00:00.000Z' }),
    ])
    expect(await getLastPurchaseCost('c1')).toBe(130)
    expect(await getLastPurchaseCost('nope')).toBeUndefined()
  })
})

describe('getReorderReport', () => {
  it('includes items at/below reorderPoint (incl. zero-stock), excludes above + reorderPoint 0', async () => {
    await db.catalogItems.bulkPut([
      cat({ id: 'low', name: 'Low', reorderPoint: 10, maxStock: 100 }),      // onHand 5 ≤ 10 → included
      cat({ id: 'zero', name: 'Zero', reorderPoint: 5 }),                    // no batch → onHand 0 ≤ 5 → included
      cat({ id: 'ok', name: 'Ok', reorderPoint: 10 }),                       // onHand 50 > 10 → excluded
      cat({ id: 'untracked', name: 'Untracked', reorderPoint: 0 }),         // reorderPoint 0 → excluded
    ])
    await db.stockBatches.bulkPut([
      batch({ id: 'lb', catalogItemId: 'low', quantityOnHand: 5, costPrice: 100 }),
      batch({ id: 'okb', catalogItemId: 'ok', quantityOnHand: 50 }),
    ])
    const rows = await getReorderReport()
    expect(rows.map((r) => r.catalogItemId).sort()).toEqual(['low', 'zero'])
    const low = rows.find((r) => r.catalogItemId === 'low')!
    expect(low.onHand).toBe(5)
    expect(low.suggestedQty).toBe(95)          // maxStock 100 − 5
    expect(low.unitCost).toBe(100)             // last batch cost (no preferred supplier)
  })
  it('uses the preferred supplier price + name + MOQ', async () => {
    await db.catalogItems.put(cat({ id: 'c1', reorderPoint: 10 }))
    await db.stockBatches.put(batch({ catalogItemId: 'c1', quantityOnHand: 2 }))
    await db.suppliers.put({ id: 'sup1', name: 'Acme', isActive: true, createdAt: 'h' })
    await upsertSupplierItem({ supplierId: 'sup1', catalogItemId: 'c1', unitPrice: 90, minOrderQty: 50, isPreferred: true, createdBy: 'u1' })
    const rows = await getReorderReport()
    const r = rows.find((x) => x.catalogItemId === 'c1')!
    expect(r.preferredSupplierId).toBe('sup1')
    expect(r.preferredSupplierName).toBe('Acme')
    expect(r.unitCost).toBe(90)                // preferred price beats last batch cost
    expect(r.suggestedQty).toBe(50)            // gap 8 → raised to MOQ 50
  })
})

describe('generateReorderPurchaseOrders', () => {
  it('groups selected lines by supplier into one draft PO each; drops qty ≤ 0', async () => {
    await db.suppliers.bulkPut([
      { id: 'sup1', name: 'Acme', isActive: true, createdAt: 'h' },
      { id: 'sup2', name: 'Globex', isActive: true, createdAt: 'h' },
    ])
    const pos = await generateReorderPurchaseOrders([
      { catalogItemId: 'a', catalogItemName: 'A', quantity: 10, unitCost: 100, supplierId: 'sup1' },
      { catalogItemId: 'b', catalogItemName: 'B', quantity: 5, unitCost: 200, supplierId: 'sup1' },
      { catalogItemId: 'c', catalogItemName: 'C', quantity: 8, unitCost: 50, supplierId: 'sup2' },
      { catalogItemId: 'd', catalogItemName: 'D', quantity: 0, unitCost: 10, supplierId: 'sup2' }, // dropped
    ], 'u1')
    expect(pos).toHaveLength(2)
    const acme = pos.find((p) => p.supplierId === 'sup1')!
    expect(acme.status).toBe('draft')
    expect(acme.items).toHaveLength(2)
    const globex = pos.find((p) => p.supplierId === 'sup2')!
    expect(globex.items).toHaveLength(1) // qty-0 line dropped
  })
})
