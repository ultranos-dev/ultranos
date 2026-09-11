import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'
import type { GoodsReceipt } from '@/lib/inventory/types'

beforeEach(async () => { await db.goodsReceipts.clear() })

describe('procurement schema v17', () => {
  it('DEFAULT_PHARMACY_SETTINGS includes overReceiptTolerancePercent = 0', () => {
    expect(DEFAULT_PHARMACY_SETTINGS.overReceiptTolerancePercent).toBe(0)
  })

  it('goodsReceipts is queryable by purchaseOrderId', async () => {
    const receipt: GoodsReceipt = {
      id: 'gr-1', purchaseOrderId: 'po-1', receivedBy: 'u1', items: [], totalCost: 0,
      receivedAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    }
    await db.goodsReceipts.put(receipt)
    const found = await db.goodsReceipts.where('purchaseOrderId').equals('po-1').toArray()
    expect(found.map((r) => r.id)).toEqual(['gr-1'])
  })
})
