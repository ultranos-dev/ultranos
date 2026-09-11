import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { processGoodsReceipt } from '@/lib/inventory/goods-receipt-service'
import { reverseGoodsReceipt, ReceiptNotReversibleError } from '@/lib/inventory/goods-receipt-reversal'
import { recordDisposal } from '@/lib/inventory/stock-movement'
import { createPurchaseOrder, markPurchaseOrderSent } from '@/lib/procurement/purchase-order-service'
import type { CatalogItem } from '@/lib/inventory/types'

function catalog(id: string): CatalogItem {
  return { id, name: id, form: 'tablet', strength: '1', strengthUnit: 'mg', packSize: 1, category: 'c',
    defaultSellingPrice: 200, reorderPoint: 0, isActive: true, lastSyncedAt: '2026-01-01T00:00:00.000Z' }
}
const line = (catalogItemId: string, quantity: number) => ({
  catalogItemId, batchNumber: `B-${catalogItemId}`, expiryDate: '2030-01-01', quantity, costPrice: 100, sellingPrice: 200,
})

beforeEach(async () => {
  for (const t of [db.purchaseOrders, db.goodsReceipts, db.stockBatches, db.stockMovements, db.catalogItems, db.pharmacySettings, db.syncQueue]) await t.clear()
  await db.catalogItems.put(catalog('a'))
})

async function receiveAgainstFreshPO(qty: number) {
  const po = await createPurchaseOrder({ supplierId: 's1', supplierName: 'Acme', createdBy: 'u1',
    items: [{ catalogItemId: 'a', catalogItemName: 'a', quantityOrdered: qty, unitCost: 100 }] })
  await markPurchaseOrderSent(po.id, 'u1')
  const receipt = await processGoodsReceipt({ items: [line('a', qty)], purchaseOrderId: po.id, receivedBy: 'u1', locationId: 'default' })
  return { po, receipt }
}

describe('reverseGoodsReceipt', () => {
  it('reverses an intact receipt: depletes batches, appends void_reversal, rolls back PO counts', async () => {
    const { po, receipt } = await receiveAgainstFreshPO(5)
    expect((await db.purchaseOrders.get(po.id))!.status).toBe('closed')

    const reversal = await reverseGoodsReceipt(receipt.id, 'u2')
    expect(reversal.reversalOf).toBe(receipt.id)

    const batches = await db.stockBatches.filter((b) => b.goodsReceiptId === receipt.id).toArray()
    expect(batches.every((b) => b.quantityOnHand === 0 && b.status === 'depleted')).toBe(true)

    const voids = await db.stockMovements.where('type').equals('void_reversal').toArray()
    expect(voids.length).toBe(1)
    expect(voids[0]!.quantity).toBe(-5)

    const reopened = await db.purchaseOrders.get(po.id)
    expect(reopened!.items[0]!.quantityReceived).toBe(0)
    expect(reopened!.status).toBe('sent')

    const original = await db.goodsReceipts.get(receipt.id)
    expect(original!.reversedByReceiptId).toBe(reversal.id)
  })

  it('blocks reversal when the received stock was drawn down', async () => {
    const { receipt } = await receiveAgainstFreshPO(5)
    const batch = (await db.stockBatches.filter((b) => b.goodsReceiptId === receipt.id).toArray())[0]!
    await recordDisposal({ stockBatchId: batch.id, quantity: 2, reasonCode: 'damaged', performedBy: 'u1' })
    await expect(reverseGoodsReceipt(receipt.id, 'u2')).rejects.toBeInstanceOf(ReceiptNotReversibleError)
  })

  it('blocks reversing an already-reversed receipt', async () => {
    const { receipt } = await receiveAgainstFreshPO(5)
    await reverseGoodsReceipt(receipt.id, 'u2')
    await expect(reverseGoodsReceipt(receipt.id, 'u2')).rejects.toBeInstanceOf(ReceiptNotReversibleError)
  })

  it('blocks reversing a reversal receipt (is_reversal guard)', async () => {
    const { receipt } = await receiveAgainstFreshPO(5)
    const reversal = await reverseGoodsReceipt(receipt.id, 'u2')
    expect(reversal.reversalOf).toBe(receipt.id)
    // Attempt to reverse the reversal itself should reject with is_reversal reason
    try {
      await reverseGoodsReceipt(reversal.id, 'u3')
      expect.fail('Should have thrown ReceiptNotReversibleError')
    } catch (error) {
      expect(error).toBeInstanceOf(ReceiptNotReversibleError)
      expect((error as ReceiptNotReversibleError).reason).toBe('is_reversal')
    }
  })
})
