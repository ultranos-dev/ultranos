import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { AuditAction } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { getStockAlerts } from '@/lib/inventory/stock-service'

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

const line = (over = {}) => ({
  catalogItemId: 'c1', batchNumber: 'B1', expiryDate: '2027-01-01', quantity: 10, costPrice: 100, sellingPrice: 150, ...over,
})

describe('processGoodsReceipt QC decision', () => {
  it('hold → quarantined batch with inspection attribution, excluded from stock, audited', async () => {
    await processGoodsReceipt({ items: [line({ qcDecision: 'hold', heldReason: 'damaged packaging' })], receivedBy: 'u1', locationId: 'loc1' })
    const batches = await db.stockBatches.toArray()
    expect(batches).toHaveLength(1)
    expect(batches[0]!.status).toBe('quarantined')
    expect(batches[0]!.inspectedBy).toBe('u1')
    expect(batches[0]!.heldReason).toBe('damaged packaging')
    const alerts = await getStockAlerts(90)
    expect(alerts.quarantinedCount).toBe(1)
    expect(emitMock.mock.calls.some((c) => c[0].action === AuditAction.BATCH_QC_HELD && c[0].resourceId === batches[0]!.id)).toBe(true)
  })
  it('accept (or absent) → active batch (non-breaking default)', async () => {
    await processGoodsReceipt({ items: [line()], receivedBy: 'u1', locationId: 'loc1' })
    const batches = await db.stockBatches.toArray()
    expect(batches[0]!.status).toBe('active')
    expect(emitMock.mock.calls.some((c) => c[0].action === AuditAction.BATCH_QC_HELD)).toBe(false)
  })
})
