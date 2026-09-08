import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ getAccessToken: vi.fn().mockResolvedValue('test-token') }) },
}))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'http://hub/api/trpc' }))

import { pullWholesale } from '@/lib/wholesale/wholesale-pull'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function pullResponse(changes: unknown[]) {
  return { ok: true, json: async () => ({ result: { data: { json: { changes } } } }) }
}

beforeEach(async () => { await db.delete(); await db.open(); vi.clearAllMocks() })

describe('pullWholesale', () => {
  it('writes pulled rows to their Dexie tables and maps entryTimestamp->timestamp', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'WholesaleCustomer', resourceId: 'c1', hlcTimestamp: '5', data: { id: 'c1', name: 'Herat', isActive: true, createdAt: '2026-09-07T00:00:00Z' } },
      { resourceType: 'CustomerLedgerEntry', resourceId: 'l1', hlcTimestamp: '6', data: { id: 'l1', customerId: 'c1', type: 'charge', amount: 20000, createdBy: 'p1', entryTimestamp: '2026-09-07T01:00:00Z' } },
    ]))
    const res = await pullWholesale()
    expect(res.applied).toBe(2)
    expect(await db.wholesaleCustomers.get('c1')).toMatchObject({ id: 'c1', name: 'Herat' })
    const ledger = await db.customerLedgerEntries.get('l1')
    expect(ledger).toMatchObject({ id: 'l1', timestamp: '2026-09-07T01:00:00Z' }) // entryTimestamp -> timestamp
    expect((ledger as unknown as Record<string, unknown>).entryTimestamp).toBeUndefined()
    expect(await db.wholesalePullMeta.get('wholesale')).toMatchObject({ lastPulledHlc: '6' })
  })

  it('passes the stored watermark as sinceHlc on the next call', async () => {
    await db.wholesalePullMeta.put({ key: 'wholesale', lastPulledHlc: '9' })
    fetchMock.mockResolvedValue(pullResponse([]))
    await pullWholesale()
    const url = fetchMock.mock.calls[0][0] as string
    expect(decodeURIComponent(url)).toContain('"sinceHlc":"9"')
  })

  it('does NOT overwrite a local row that has a pending sync-queue entry (dirty-protection)', async () => {
    await db.salesOrders.put({ id: 'o1', orderNumber: 'SO-LOCAL', customerId: 'c1', status: 'draft', lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'p1', createdAt: '', hlcTimestamp: '1' } as never)
    await db.syncQueue.add({ id: 'q1', resourceType: 'SalesOrder', resourceId: 'o1', action: 'create', payload: '{}', status: 'pending', hlcTimestamp: '1', createdAt: '', retryCount: 0 } as never)
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'SalesOrder', resourceId: 'o1', hlcTimestamp: '5', data: { id: 'o1', orderNumber: 'SO-REMOTE', customerId: 'c1', status: 'fulfilled', lines: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0, createdBy: 'p1', createdAt: '', hlcTimestamp: '5' } },
    ]))
    await pullWholesale()
    expect((await db.salesOrders.get('o1'))!.orderNumber).toBe('SO-LOCAL') // local kept
  })

  it('soft-fails when offline (watermark unchanged)', async () => {
    await db.wholesalePullMeta.put({ key: 'wholesale', lastPulledHlc: '3' })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const res = await pullWholesale()
    expect(res.applied).toBe(0)
    expect(await db.wholesalePullMeta.get('wholesale')).toMatchObject({ lastPulledHlc: '3' })
  })

  it('hydrates a ContractPrice, mapping Hub price -> priceMinor', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'ContractPrice', resourceId: 'cp1', hlcTimestamp: '7', data: { id: 'cp1', customerId: 'c1', catalogItemId: 'i1', price: 1800, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z' } },
    ]))
    await pullWholesale()
    const cp = await db.contractPrices.get('cp1')
    expect(cp).toMatchObject({ id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800 })
    expect((cp as unknown as Record<string, unknown>).price).toBeUndefined()
  })

  it('requests ContractPrice among the pulled resource types', async () => {
    fetchMock.mockResolvedValue(pullResponse([]))
    await pullWholesale()
    expect(decodeURIComponent(fetchMock.mock.calls[0][0] as string)).toContain('ContractPrice')
  })

  it('deletes a local ContractPrice when the pulled row is a tombstone (deletedAt set)', async () => {
    await db.contractPrices.put({ id: 'cp1', customerId: 'c1', catalogItemId: 'i1', priceMinor: 1800, createdBy: 'p1', createdAt: '' } as never)
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'ContractPrice', resourceId: 'cp1', hlcTimestamp: '9', data: { id: 'cp1', customerId: 'c1', catalogItemId: 'i1', price: 1800, createdBy: 'p1', createdAt: '', deletedAt: '2026-09-09T00:00:00Z' } },
    ]))
    await pullWholesale()
    expect(await db.contractPrices.get('cp1')).toBeUndefined()
  })

  it('does NOT delete a locally-dirty ContractPrice tombstone (local edit kept)', async () => {
    await db.contractPrices.put({ id: 'cp2', customerId: 'c1', catalogItemId: 'i2', priceMinor: 500, createdBy: 'p1', createdAt: '' } as never)
    await db.syncQueue.add({ id: 'qd', resourceType: 'ContractPrice', resourceId: 'cp2', action: 'update', payload: '{}', status: 'pending', hlcTimestamp: '1', createdAt: '', retryCount: 0 } as never)
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'ContractPrice', resourceId: 'cp2', hlcTimestamp: '9', data: { id: 'cp2', customerId: 'c1', catalogItemId: 'i2', price: 500, createdBy: 'p1', createdAt: '', deletedAt: '2026-09-09T00:00:00Z' } },
    ]))
    await pullWholesale()
    expect(await db.contractPrices.get('cp2')).toBeDefined() // local dirty kept
  })

  // ── Task 3: Inventory / Procurement Sync ──────────────────────────────────

  it('requests all 5 new procurement/inventory types in the pull input', async () => {
    fetchMock.mockResolvedValue(pullResponse([]))
    await pullWholesale()
    const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string)
    expect(url).toContain('Supplier')
    expect(url).toContain('PurchaseOrder')
    expect(url).toContain('GoodsReceipt')
    expect(url).toContain('StockBatch')
    expect(url).toContain('StockMovement')
  })

  it('writes pulled Supplier row to db.suppliers', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'Supplier', resourceId: 's1', hlcTimestamp: '10', data: { id: 's1', name: 'MedCo', isActive: true, createdAt: '2026-09-07T00:00:00Z' } },
    ]))
    await pullWholesale()
    expect(await db.suppliers.get('s1')).toMatchObject({ id: 's1', name: 'MedCo', isActive: true })
  })

  it('writes pulled PurchaseOrder row to db.purchaseOrders with catalogItemId present in items', async () => {
    const items = [{ catalogItemId: 'ci1', catalogItemName: 'Amoxicillin 500mg', quantityOrdered: 100, quantityReceived: 0, unitCost: 1500 }]
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'PurchaseOrder', resourceId: 'po1', hlcTimestamp: '11', data: { id: 'po1', supplierId: 's1', supplierName: 'MedCo', status: 'draft', items, totalCost: 150000, createdBy: 'p1', createdAt: '2026-09-07T00:00:00Z', hlcTimestamp: '11' } },
    ]))
    await pullWholesale()
    const po = await db.purchaseOrders.get('po1')
    expect(po).toMatchObject({ id: 'po1', supplierId: 's1', status: 'draft' })
    expect((po as unknown as { items: { catalogItemId: string }[] }).items[0]?.catalogItemId).toBe('ci1')
  })

  it('writes pulled GoodsReceipt row to db.goodsReceipts', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'GoodsReceipt', resourceId: 'gr1', hlcTimestamp: '12', data: { id: 'gr1', receivedBy: 'p1', items: [], totalCost: 0, receivedAt: '2026-09-07T00:00:00Z', hlcTimestamp: '12' } },
    ]))
    await pullWholesale()
    expect(await db.goodsReceipts.get('gr1')).toMatchObject({ id: 'gr1', receivedBy: 'p1' })
  })

  it('writes pulled StockBatch row to db.stockBatches', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'StockBatch', resourceId: 'sb1', hlcTimestamp: '13', data: { id: 'sb1', catalogItemId: 'ci1', batchNumber: 'B001', expiryDate: '2027-01-01', quantityOnHand: 50, costPrice: 1500, sellingPrice: 2000, receivedAt: '2026-09-07T00:00:00Z', status: 'active', locationId: 'loc1', hlcTimestamp: '13' } },
    ]))
    await pullWholesale()
    expect(await db.stockBatches.get('sb1')).toMatchObject({ id: 'sb1', batchNumber: 'B001', status: 'active' })
  })

  it('pulled ContractPrice with tiers in Hub data lands with tiers preserved on the local row', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'ContractPrice', resourceId: 'cp3', hlcTimestamp: '8', data: { id: 'cp3', customerId: 'c1', catalogItemId: 'i3', price: 2000, createdBy: 'p1', createdAt: '2026-09-08T00:00:00Z', tiers: [{ minQuantity: 10, priceMinor: 1500 }] } },
    ]))
    await pullWholesale()
    const cp = await db.contractPrices.get('cp3')
    expect(cp).toMatchObject({ id: 'cp3', priceMinor: 2000 })
    expect((cp as unknown as { tiers: { minQuantity: number; priceMinor: number }[] }).tiers).toEqual([{ minQuantity: 10, priceMinor: 1500 }])
  })

  it('writes pulled StockMovement with movementTimestamp reversed to timestamp field', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'StockMovement', resourceId: 'sm1', hlcTimestamp: '14', data: { id: 'sm1', stockBatchId: 'sb1', catalogItemId: 'ci1', type: 'received', quantity: 50, performedBy: 'p1', movementTimestamp: '2026-09-07T10:00:00Z', hlcTimestamp: '14' } },
    ]))
    await pullWholesale()
    const sm = await db.stockMovements.get('sm1')
    expect(sm).toMatchObject({ id: 'sm1', type: 'received', timestamp: '2026-09-07T10:00:00Z' })
    expect((sm as unknown as Record<string, unknown>).movementTimestamp).toBeUndefined()
  })

  // ── Task 3: StockTransfer + StockCount pull registration ─────────────────

  it('requests StockTransfer among the pulled resource types', async () => {
    fetchMock.mockResolvedValue(pullResponse([]))
    await pullWholesale()
    const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string)
    expect(url).toContain('StockTransfer')
  })

  it('writes pulled StockTransfer to db.stockTransfers with items[0].stockBatchId present', async () => {
    const items = [{ stockBatchId: 'sb1', catalogItemId: 'ci1', quantity: 20 }]
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'StockTransfer', resourceId: 'st1', hlcTimestamp: '15', data: { id: 'st1', fromLocationId: 'loc1', toLocationId: 'loc2', status: 'requested', items, requestedBy: 'p1', requestedAt: '2026-09-08T00:00:00Z', hlcTimestamp: '15' } },
    ]))
    await pullWholesale()
    const st = await db.stockTransfers.get('st1')
    expect(st).toMatchObject({ id: 'st1', status: 'requested' })
    expect((st as unknown as { items: { stockBatchId: string }[] }).items[0]?.stockBatchId).toBe('sb1')
  })

  it('writes pulled StockCount to db.stockCounts with items[0].expectedQty present', async () => {
    const items = [{ stockBatchId: 'sb1', catalogItemId: 'ci1', expectedQty: 50, actualQty: 48 }]
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'StockCount', resourceId: 'sc1', hlcTimestamp: '16', data: { id: 'sc1', type: 'full', status: 'in_progress', items, countedBy: 'p1', startedAt: '2026-09-08T00:00:00Z', hlcTimestamp: '16' } },
    ]))
    await pullWholesale()
    const sc = await db.stockCounts.get('sc1')
    expect(sc).toMatchObject({ id: 'sc1', status: 'in_progress' })
    expect((sc as unknown as { items: { expectedQty: number }[] }).items[0]?.expectedQty).toBe(50)
  })

  // ── Task 4: POS PHI sync — Invoice / Payment / LedgerEntry pull ──────────

  it('requests Invoice among the pulled resource types', async () => {
    fetchMock.mockResolvedValue(pullResponse([]))
    await pullWholesale()
    const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string)
    expect(url).toContain('Invoice')
  })

  it('pulled Invoice (Hub invoiceItems) lands in db.invoices with items and no leftover invoiceItems', async () => {
    const invoiceItems = [{ catalogItemId: 'ci1', description: 'Amoxicillin 500mg', quantity: 2, unitPriceMinor: 1500, totalMinor: 3000 }]
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'Invoice', resourceId: 'inv1', hlcTimestamp: '20', data: { id: 'inv1', patientId: 'p1', encounterId: 'e1', invoiceItems, totalMinor: 3000, status: 'draft', createdBy: 'u1', createdAt: '2026-09-08T00:00:00Z', hlcTimestamp: '20' } },
    ]))
    await pullWholesale()
    const inv = await db.invoices.get('inv1')
    expect(inv).toMatchObject({ id: 'inv1', status: 'draft', totalMinor: 3000 })
    expect((inv as unknown as { items: { catalogItemId: string }[] }).items[0]?.catalogItemId).toBe('ci1')
    expect((inv as unknown as Record<string, unknown>).invoiceItems).toBeUndefined()
  })

  it('pulled Payment (Hub paymentTimestamp) lands in db.payments with timestamp and no leftover paymentTimestamp', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'Payment', resourceId: 'pay1', hlcTimestamp: '21', data: { id: 'pay1', invoiceId: 'inv1', amountMinor: 3000, method: 'cash', receivedBy: 'u1', paymentTimestamp: '2026-09-08T10:00:00Z', hlcTimestamp: '21' } },
    ]))
    await pullWholesale()
    const pay = await db.payments.get('pay1')
    expect(pay).toMatchObject({ id: 'pay1', amountMinor: 3000, timestamp: '2026-09-08T10:00:00Z' })
    expect((pay as unknown as Record<string, unknown>).paymentTimestamp).toBeUndefined()
  })

  it('pulled LedgerEntry (Hub ledgerNote+ledgerTimestamp) lands in db.ledgerEntries with note+timestamp and no leftover renamed keys', async () => {
    fetchMock.mockResolvedValue(pullResponse([
      { resourceType: 'LedgerEntry', resourceId: 'le1', hlcTimestamp: '22', data: { id: 'le1', patientId: 'p1', type: 'charge', amountMinor: 3000, ledgerNote: 'Invoice payment', ledgerTimestamp: '2026-09-08T10:05:00Z', createdBy: 'u1', hlcTimestamp: '22' } },
    ]))
    await pullWholesale()
    const le = await db.ledgerEntries.get('le1')
    expect(le).toMatchObject({ id: 'le1', type: 'charge', note: 'Invoice payment', timestamp: '2026-09-08T10:05:00Z' })
    expect((le as unknown as Record<string, unknown>).ledgerNote).toBeUndefined()
    expect((le as unknown as Record<string, unknown>).ledgerTimestamp).toBeUndefined()
  })
})
