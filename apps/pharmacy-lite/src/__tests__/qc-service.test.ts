import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { releaseFromQuarantine, getQuarantinedBatches, BatchNotQuarantinedError } from '@/lib/inventory/qc-service'
import type { StockBatch } from '@/lib/inventory/types'

vi.mock('@ultranos/audit-logger/client', async (orig) => ({
  ...(await orig<typeof import('@ultranos/audit-logger/client')>()),
  emitClientAudit: vi.fn(async () => {}),
}))
const emitMock = vi.mocked(emitClientAudit)

beforeEach(async () => {
  await db.delete(); await db.open()
  if (!encryptionKeyStore.isReady()) {
    encryptionKeyStore.setKey(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']))
  }
  emitMock.mockClear()
})

function batch(over: Partial<StockBatch> = {}): StockBatch {
  return {
    id: 'b1', catalogItemId: 'c1', batchNumber: 'B1', expiryDate: '2027-01-01', quantityOnHand: 10,
    costPrice: 100, sellingPrice: 150, receivedAt: '2026-01-01T00:00:00.000Z', status: 'quarantined',
    locationId: 'loc1', hlcTimestamp: 'h', ...over,
  }
}

describe('releaseFromQuarantine', () => {
  it('moves quarantined → active with attribution + a released movement + audit', async () => {
    await db.stockBatches.put(batch())
    await releaseFromQuarantine('b1', 'u2')
    const after = await db.stockBatches.get('b1')
    expect(after?.status).toBe('active')
    expect(after?.releasedBy).toBe('u2')
    expect(after?.releasedAt).toBeDefined()
    const movements = await db.stockMovements.where('stockBatchId').equals('b1').toArray()
    expect(movements.some((m) => m.type === 'released')).toBe(true)
    expect(emitMock.mock.calls.some((c) => c[0].action === AuditAction.BATCH_QC_RELEASED && c[0].resourceId === 'b1')).toBe(true)
  })
  it('throws BatchNotQuarantinedError on a non-quarantined batch', async () => {
    await db.stockBatches.put(batch({ status: 'active' }))
    await expect(releaseFromQuarantine('b1', 'u2')).rejects.toBeInstanceOf(BatchNotQuarantinedError)
  })
})

describe('getQuarantinedBatches', () => {
  it('returns only quarantined batches, newest received first', async () => {
    await db.stockBatches.bulkPut([
      batch({ id: 'a', status: 'quarantined', receivedAt: '2026-01-01T00:00:00.000Z' }),
      batch({ id: 'b', status: 'active', receivedAt: '2026-01-02T00:00:00.000Z' }),
      batch({ id: 'c', status: 'quarantined', receivedAt: '2026-01-03T00:00:00.000Z' }),
    ])
    const rows = await getQuarantinedBatches()
    expect(rows.map((r) => r.id)).toEqual(['c', 'a'])
  })
})
