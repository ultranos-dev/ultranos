import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import type { VerifiedPrescription } from '@/lib/prescription-verify'
import type { CatalogItem, StockBatch } from '@/lib/inventory/types'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

// Story 57.4 (M-PHARM-2, AC 3): a stock-deduction failure during dispensing is
// never swallowed — dispensing proceeds (clinical priority) but a persistent
// warning is set and a durable reconciliation task is written.

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: { userId: 'u1', practitionerId: 'p-1', role: 'PHARMACIST', sessionId: 's1', email: 'x@y.z' },
      getPractitionerRef: () => 'Practitioner/p-1',
      getAccessToken: async () => 'tok',
    }),
  },
}))

const rx: VerifiedPrescription[] = [
  {
    id: 'rx-amx',
    med: 'AMX500',
    medN: 'Amoxicillin',
    medT: 'Amoxicillin 500mg Capsule',
    dos: { qty: 2, unit: 'capsule' },
    dur: 7,
    req: 'r1',
    pat: 'pat-1',
    at: '2026-09-08T10:00:00Z',
  },
]

const catalogItem: CatalogItem = {
  id: 'cat-amx',
  name: 'Amoxicillin',
  form: 'capsule',
  strength: '500',
  strengthUnit: 'mg',
  packSize: 1,
  category: 'antibiotic',
  defaultSellingPrice: 200,
  reorderPoint: 10,
  isActive: true,
  lastSyncedAt: '2026-09-08T10:00:00Z',
}

function batch(over: Partial<StockBatch> = {}): StockBatch {
  return {
    id: 'batch-amx',
    catalogItemId: 'cat-amx',
    batchNumber: 'B1',
    expiryDate: '2999-01-01',
    quantityOnHand: 100,
    costPrice: 100,
    sellingPrice: 350,
    receivedAt: '2026-09-08T10:00:00Z',
    status: 'active',
    locationId: 'loc-1',
    hlcTimestamp: '0',
    ...over,
  }
}

beforeEach(async () => {
  useFulfillmentStore.getState().reset()
  vi.clearAllMocks()
  await db.delete()
  await db.open()
  if (!encryptionKeyStore.isReady()) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    encryptionKeyStore.setKey(key)
  }
})

describe('deductStockOnDispense reconciliation on failure (AC 3)', () => {
  it('records a reconciliation task + sets a persistent warning when deduction fails', async () => {
    await db.catalogItems.add(catalogItem)
    await db.stockBatches.add(batch())

    useFulfillmentStore.getState().loadPrescriptions(rx)
    await useFulfillmentStore.getState().assignFefoBatches()

    // A FEFO batch was assigned…
    expect(useFulfillmentStore.getState().items[0]!.fefoBatchId).toBe('batch-amx')

    // …then it vanishes before the decrement (concurrent depletion / drift):
    await db.stockBatches.clear()

    await useFulfillmentStore.getState().deductStockOnDispense('Practitioner/p-1')

    // Warning is surfaced, not swallowed.
    const warning = useFulfillmentStore.getState().stockDeductionWarning
    expect(warning).not.toBeNull()
    expect(warning!.failedCount).toBe(1)

    // A durable reconciliation task exists (non-PHI: opaque ids + qty only).
    const tasks = await db.stockReconciliationTasks.toArray()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.status).toBe('open')
    expect(tasks[0]!.stockBatchId).toBe('batch-amx')
    expect(tasks[0]!.quantity).toBe(2)
    expect(tasks[0]!.referenceId).toBe('rx-amx')
    expect(tasks[0]!.reason).toBe('deduction_error')
  })

  it('normal in-stock deduction leaves no warning and no reconciliation task (zero regression)', async () => {
    await db.catalogItems.add(catalogItem)
    await db.stockBatches.add(batch({ quantityOnHand: 100 }))

    useFulfillmentStore.getState().loadPrescriptions(rx)
    await useFulfillmentStore.getState().assignFefoBatches()
    await useFulfillmentStore.getState().deductStockOnDispense('Practitioner/p-1')

    expect(useFulfillmentStore.getState().stockDeductionWarning).toBeNull()
    expect(await db.stockReconciliationTasks.count()).toBe(0)

    const b = await db.stockBatches.get('batch-amx')
    expect(b!.quantityOnHand).toBe(98) // 100 - 2
  })

  it('records insufficient_stock reason when the batch cannot cover the deduction', async () => {
    await db.catalogItems.add(catalogItem)
    // Batch covers FEFO assignment (qty 2) but is then reduced below required.
    await db.stockBatches.add(batch({ quantityOnHand: 2 }))

    useFulfillmentStore.getState().loadPrescriptions(rx)
    await useFulfillmentStore.getState().assignFefoBatches()

    // Drain the batch to 1 so the qty-2 deduction over-draws.
    await db.stockBatches.update('batch-amx', { quantityOnHand: 1 })

    await useFulfillmentStore.getState().deductStockOnDispense('Practitioner/p-1')

    const tasks = await db.stockReconciliationTasks.toArray()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.reason).toBe('insufficient_stock')
    expect(tasks[0]!.catalogItemId).toBe('cat-amx')
    // On-hand was not driven negative.
    const b = await db.stockBatches.get('batch-amx')
    expect(b!.quantityOnHand).toBe(1)
  })
})
