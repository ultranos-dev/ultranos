/**
 * TDD: Task 4 — StockBatch sync-queue enqueue at mutation sites.
 *
 * Asserts that every stock-mutating operation enqueues a StockBatch/update
 * sync-queue entry alongside its existing StockMovement entry.
 *
 * Harness mirrors dispense-sync.test.ts: Dexie reset + session key.
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
    catalogItemId: 'cat-001',
    batchNumber: 'BN-001',
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
    id: 'cat-001',
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
// stock-service — deductStock
// ---------------------------------------------------------------------------
describe('deductStock', () => {
  it('enqueues a StockBatch/update entry after deducting stock', async () => {
    const batch = makeBatch({ id: 'batch-deduct-001', quantityOnHand: 50 })
    await db.catalogItems.put(makeCatalogItem())
    await db.stockBatches.put(batch)

    const { deductStock } = await import('@/lib/inventory/stock-service')
    await deductStock({
      stockBatchId: batch.id,
      catalogItemId: batch.catalogItemId,
      quantity: 10,
      type: 'dispensed',
      performedBy: 'pharmacist-001',
    })

    const allEntries = await db.syncQueue.toArray()
    const batchEntry = allEntries.find(
      (e) => e.resourceType === 'StockBatch' && e.resourceId === batch.id,
    )
    expect(batchEntry).toBeTruthy()
    expect(batchEntry!.action).toBe('update')

    // StockMovement entry should also still be present
    const movementEntry = allEntries.find((e) => e.resourceType === 'StockMovement')
    expect(movementEntry).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// stock-service — addStock
// ---------------------------------------------------------------------------
describe('addStock', () => {
  it('enqueues a StockBatch/update entry after adding stock', async () => {
    const batch = makeBatch({ id: 'batch-add-001', quantityOnHand: 20 })
    await db.catalogItems.put(makeCatalogItem())
    await db.stockBatches.put(batch)

    const { addStock } = await import('@/lib/inventory/stock-service')
    await addStock({
      stockBatchId: batch.id,
      catalogItemId: batch.catalogItemId,
      quantity: 30,
      type: 'received',
      performedBy: 'pharmacist-001',
    })

    const allEntries = await db.syncQueue.toArray()
    const batchEntry = allEntries.find(
      (e) => e.resourceType === 'StockBatch' && e.resourceId === batch.id,
    )
    expect(batchEntry).toBeTruthy()
    expect(batchEntry!.action).toBe('update')

    // StockMovement entry should also still be present
    const movementEntry = allEntries.find((e) => e.resourceType === 'StockMovement')
    expect(movementEntry).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// goods-receipt-service
// ---------------------------------------------------------------------------
describe('processGoodsReceipt', () => {
  it('enqueues a StockBatch/update entry per received batch alongside the StockMovement entries', async () => {
    const { processGoodsReceipt } = await import('@/lib/inventory/goods-receipt-service')
    await processGoodsReceipt({
      items: [
        {
          catalogItemId: 'cat-001',
          batchNumber: 'BN-GR-001',
          expiryDate: '2027-06-01',
          quantity: 200,
          costPrice: 400,
          sellingPrice: 600,
        },
        {
          catalogItemId: 'cat-001',
          batchNumber: 'BN-GR-002',
          expiryDate: '2027-07-01',
          quantity: 100,
          costPrice: 400,
          sellingPrice: 600,
        },
      ],
      receivedBy: 'pharmacist-001',
      locationId: 'loc-001',
    })

    const allEntries = await db.syncQueue.toArray()
    const batchEntries = allEntries.filter((e) => e.resourceType === 'StockBatch')
    expect(batchEntries).toHaveLength(2)
    for (const entry of batchEntries) {
      expect(entry.action).toBe('update')
    }

    // StockMovement entries should still be present (one per item)
    const movementEntries = allEntries.filter((e) => e.resourceType === 'StockMovement')
    expect(movementEntries).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// expiry-watchdog — quarantineExpiredBatches
// ---------------------------------------------------------------------------
describe('quarantineExpiredBatches', () => {
  it('enqueues a StockBatch/update entry per quarantined batch', async () => {
    // Create an expired batch (expiryDate in the past)
    const expired = makeBatch({
      id: 'batch-exp-001',
      expiryDate: '2025-01-01',
      quantityOnHand: 10,
    })
    await db.stockBatches.put(expired)

    const { quarantineExpiredBatches } = await import('@/lib/inventory/expiry-watchdog')
    await quarantineExpiredBatches('pharmacist-001')

    const allEntries = await db.syncQueue.toArray()
    const batchEntry = allEntries.find(
      (e) => e.resourceType === 'StockBatch' && e.resourceId === expired.id,
    )
    expect(batchEntry).toBeTruthy()
    expect(batchEntry!.action).toBe('update')

    const movementEntry = allEntries.find((e) => e.resourceType === 'StockMovement')
    expect(movementEntry).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// stock-count-service — completeStockCount
// ---------------------------------------------------------------------------
describe('completeStockCount', () => {
  it('enqueues a StockBatch/update entry for each variance item', async () => {
    const batch = makeBatch({ id: 'batch-count-001', quantityOnHand: 50 })
    await db.catalogItems.put(makeCatalogItem())
    await db.stockBatches.put(batch)

    const { startStockCount, addCountItem, completeStockCount } = await import(
      '@/lib/procurement/stock-count-service'
    )
    const count = await startStockCount({ type: 'full', countedBy: 'pharmacist-001' })
    await addCountItem(count.id, {
      stockBatchId: batch.id,
      catalogItemId: batch.catalogItemId,
      catalogItemName: 'Test Item',
      batchNumber: batch.batchNumber,
      expectedQty: 50,
      actualQty: 45,
      variance: -5,
    })
    await completeStockCount(count.id)

    const allEntries = await db.syncQueue.toArray()
    const batchEntry = allEntries.find(
      (e) => e.resourceType === 'StockBatch' && e.resourceId === batch.id,
    )
    expect(batchEntry).toBeTruthy()
    expect(batchEntry!.action).toBe('update')
  })
})
