/**
 * TDD: Task 4 — StockCount sync-queue enqueue at create + complete.
 *
 * Asserts that:
 * - startStockCount enqueues a StockCount/create entry.
 * - completeStockCount enqueues a StockCount/update entry AND a StockMovement/create
 *   entry for each variance item (existing behaviour preserved).
 *
 * Harness mirrors stock-batch-enqueue.test.ts: Dexie reset + session key.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { generateSessionKey } from '@ultranos/crypto'
import type { StockBatch, CatalogItem } from '@/lib/inventory/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBatch(overrides?: Partial<StockBatch>): StockBatch {
  return {
    id: crypto.randomUUID(),
    catalogItemId: 'cat-sc-001',
    batchNumber: 'BN-SC-001',
    expiryDate: '2027-01-01',
    quantityOnHand: 100,
    costPrice: 500,
    sellingPrice: 700,
    receivedAt: '2026-01-01T00:00:00Z',
    status: 'active',
    locationId: 'loc-001',
    hlcTimestamp: new Date().toISOString(),
    ...overrides,
  }
}

function makeCatalogItem(overrides?: Partial<CatalogItem>): CatalogItem {
  return {
    id: 'cat-sc-001',
    name: 'Paracetamol 500mg',
    form: 'tablet',
    strength: '500',
    strengthUnit: 'mg',
    packSize: 100,
    category: 'analgesic',
    defaultSellingPrice: 700,
    reorderPoint: 10,
    isActive: true,
    lastSyncedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(async () => {
  encryptionKeyStore.setKey(await generateSessionKey())
  await db.delete()
  await db.open()
})

afterEach(async () => {
  encryptionKeyStore.wipe()
  try { await db.delete() } catch { /* DatabaseClosedError teardown flake — known, not our failure */ }
})

// ---------------------------------------------------------------------------
// startStockCount — StockCount/create enqueue
// ---------------------------------------------------------------------------
describe('startStockCount', () => {
  it('enqueues a StockCount/create entry after creating a stock count', async () => {
    const { startStockCount } = await import('@/lib/procurement/stock-count-service')

    const count = await startStockCount({ type: 'full', countedBy: 'pharmacist-001' })

    const allEntries = await db.syncQueue.toArray()
    const countEntry = allEntries.find(
      (e) => e.resourceType === 'StockCount' && e.resourceId === count.id,
    )
    expect(countEntry).toBeTruthy()
    expect(countEntry!.action).toBe('create')
  })
})

// ---------------------------------------------------------------------------
// completeStockCount — StockCount/update enqueue + variance StockMovement intact
// ---------------------------------------------------------------------------
describe('completeStockCount', () => {
  it('enqueues a StockCount/update entry and preserves the variance StockMovement entry', async () => {
    const batch = makeBatch({ id: 'batch-sc-complete-001', quantityOnHand: 50 })
    await db.catalogItems.put(makeCatalogItem())
    await db.stockBatches.put(batch)

    const { startStockCount, addCountItem, completeStockCount } = await import(
      '@/lib/procurement/stock-count-service'
    )

    const count = await startStockCount({ type: 'full', countedBy: 'pharmacist-001' })
    await addCountItem(count.id, {
      stockBatchId: batch.id,
      catalogItemId: batch.catalogItemId,
      catalogItemName: 'Paracetamol 500mg',
      batchNumber: batch.batchNumber,
      expectedQty: 50,
      actualQty: 45,
      variance: -5,
    })
    await completeStockCount(count.id)

    const allEntries = await db.syncQueue.toArray()

    // StockCount/update entry must be present
    const countUpdateEntry = allEntries.find(
      (e) => e.resourceType === 'StockCount' && e.resourceId === count.id && e.action === 'update',
    )
    expect(countUpdateEntry).toBeTruthy()
    expect(countUpdateEntry!.action).toBe('update')

    // Variance StockMovement entry must still be present (existing behaviour)
    const movementEntry = allEntries.find((e) => e.resourceType === 'StockMovement')
    expect(movementEntry).toBeTruthy()
    expect(movementEntry!.action).toBe('create')
  })
})
