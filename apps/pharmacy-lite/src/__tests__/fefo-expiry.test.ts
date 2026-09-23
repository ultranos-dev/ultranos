import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { selectFefoBatch, selectFefoCoverage } from '@/lib/inventory/fefo'
import type { StockBatch } from '@/lib/inventory/types'

// Story 57.4 (M-PHARM-2, AC 2): expired batches are excluded by the FEFO
// predicate itself (not by the watchdog having run), and a quantity that no
// single in-date batch can cover yields a typed insufficientCoverage result —
// never a silent ">0 units" fallback batch.

function makeBatch(over: Partial<StockBatch>): StockBatch {
  return {
    id: 'b',
    catalogItemId: 'cat-1',
    batchNumber: 'B',
    expiryDate: '2999-01-01',
    quantityOnHand: 100,
    costPrice: 10,
    sellingPrice: 20,
    receivedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    locationId: 'default',
    hlcTimestamp: '0',
    ...over,
  }
}

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

beforeEach(async () => {
  await db.stockBatches.clear()
})

describe('FEFO expiry exclusion (AC 2)', () => {
  it('never selects an expired batch even when it is active with stock', async () => {
    // An expired-but-still-active batch (watchdog has not quarantined it yet) with
    // ample stock must be skipped in favour of the in-date batch.
    await db.stockBatches.bulkPut([
      makeBatch({ id: 'expired', expiryDate: isoDaysFromNow(-1), quantityOnHand: 100 }),
      makeBatch({ id: 'in-date', expiryDate: isoDaysFromNow(30), quantityOnHand: 100 }),
    ])

    const batch = await selectFefoBatch('cat-1', 5)
    expect(batch).not.toBeNull()
    expect(batch!.id).toBe('in-date')
  })

  it('treats a batch expiring today as expired (expiryDate > today, strict)', async () => {
    await db.stockBatches.put(makeBatch({ id: 'today', expiryDate: isoDaysFromNow(0), quantityOnHand: 100 }))
    const sel = await selectFefoCoverage('cat-1', 5)
    expect(sel.kind).toBe('insufficientCoverage')
    if (sel.kind === 'insufficientCoverage') {
      expect(sel.candidates).toHaveLength(0)
      expect(sel.availableQty).toBe(0)
    }
  })

  it('returns insufficientCoverage (not any >0 batch) when no in-date batch covers the qty', async () => {
    // Two in-date batches with 3 + 4 units; requesting 10 → no single batch covers.
    await db.stockBatches.bulkPut([
      makeBatch({ id: 'a', expiryDate: isoDaysFromNow(10), quantityOnHand: 3 }),
      makeBatch({ id: 'b', expiryDate: isoDaysFromNow(20), quantityOnHand: 4 }),
    ])

    const sel = await selectFefoCoverage('cat-1', 10)
    expect(sel.kind).toBe('insufficientCoverage')
    if (sel.kind === 'insufficientCoverage') {
      expect(sel.availableQty).toBe(7)
      expect(sel.requiredQty).toBe(10)
      expect(sel.candidates.map((c) => c.id)).toEqual(['a', 'b']) // earliest-expiry first
    }
    // Legacy wrapper returns null instead of the old >0-units fallback.
    expect(await selectFefoBatch('cat-1', 10)).toBeNull()
  })

  it('selects the earliest-expiry in-date batch that covers the qty (FEFO order preserved)', async () => {
    await db.stockBatches.bulkPut([
      makeBatch({ id: 'later', expiryDate: isoDaysFromNow(60), quantityOnHand: 50 }),
      makeBatch({ id: 'sooner', expiryDate: isoDaysFromNow(10), quantityOnHand: 50 }),
    ])
    const sel = await selectFefoCoverage('cat-1', 5)
    expect(sel.kind).toBe('ok')
    if (sel.kind === 'ok') expect(sel.batch.id).toBe('sooner')
  })

  it('excludes zero-quantity batches from coverage', async () => {
    await db.stockBatches.bulkPut([
      makeBatch({ id: 'empty', expiryDate: isoDaysFromNow(10), quantityOnHand: 0 }),
      makeBatch({ id: 'stocked', expiryDate: isoDaysFromNow(20), quantityOnHand: 8 }),
    ])
    const sel = await selectFefoCoverage('cat-1', 5)
    expect(sel.kind).toBe('ok')
    if (sel.kind === 'ok') expect(sel.batch.id).toBe('stocked')
  })
})
