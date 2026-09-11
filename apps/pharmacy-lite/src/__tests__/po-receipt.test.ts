import { describe, it, expect } from 'vitest'
import {
  validateReceiptAgainstPO, applyReceiptToPO, reverseReceiptFromPO, OverReceiptError,
} from '@/lib/procurement/po-receipt'
import type { PurchaseOrder } from '@/lib/procurement/types'

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po-1', supplierId: 's1', supplierName: 'Acme', status: 'sent',
    items: [
      { catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 0, unitCost: 100 },
      { catalogItemId: 'b', catalogItemName: 'B', quantityOrdered: 5, quantityReceived: 0, unitCost: 50 },
    ],
    totalCost: 1250, createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z', hlcTimestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
const noControlled = new Set<string>()

describe('validateReceiptAgainstPO', () => {
  it('passes when within remaining', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 10 }], controlledIds: noControlled, tolerancePercent: 0 })).not.toThrow()
  })
  it('passes over-remaining within tolerance', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 11 }], controlledIds: noControlled, tolerancePercent: 10 })).not.toThrow()
  })
  it('throws over-tolerance without override reason', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 12 }], controlledIds: noControlled, tolerancePercent: 10 })).toThrow(OverReceiptError)
  })
  it('passes over-tolerance WITH override reason', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 12 }], controlledIds: noControlled, tolerancePercent: 10, overrideReason: 'bonus units' })).not.toThrow()
  })
  it('hard-blocks a controlled item over remaining regardless of tolerance + reason', () => {
    expect(() => validateReceiptAgainstPO({ po: po(), received: [{ catalogItemId: 'a', quantity: 11 }], controlledIds: new Set(['a']), tolerancePercent: 50, overrideReason: 'whatever' })).toThrow(OverReceiptError)
  })
})

describe('applyReceiptToPO', () => {
  const now = '2026-02-01T00:00:00.000Z'
  it('partial receipt → partially_received', () => {
    const r = applyReceiptToPO(po(), [{ catalogItemId: 'a', quantity: 4 }], now)
    expect(r.status).toBe('partially_received')
    expect(r.items.find((i) => i.catalogItemId === 'a')!.quantityReceived).toBe(4)
    expect(r.items.find((i) => i.catalogItemId === 'b')!.quantityReceived).toBe(0)
    expect(r.closedAt).toBeUndefined()
  })
  it('full receipt of all lines → closed with closedAt', () => {
    const r = applyReceiptToPO(po(), [{ catalogItemId: 'a', quantity: 10 }, { catalogItemId: 'b', quantity: 5 }], now)
    expect(r.status).toBe('closed')
    expect(r.closedAt).toBe(now)
  })
})

describe('reverseReceiptFromPO', () => {
  it('reversing a closed PO reopens it and clears closedAt', () => {
    const closed = po({ status: 'closed', closedAt: '2026-02-01T00:00:00.000Z', items: [
      { catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 10, unitCost: 100 },
      { catalogItemId: 'b', catalogItemName: 'B', quantityOrdered: 5, quantityReceived: 5, unitCost: 50 },
    ] })
    const r = reverseReceiptFromPO(closed, [{ catalogItemId: 'a', quantity: 10 }])
    expect(r.status).toBe('partially_received')
    expect(r.closedAt).toBeUndefined()
    expect(r.items.find((i) => i.catalogItemId === 'a')!.quantityReceived).toBe(0)
  })
  it('reversing all received qty returns status to sent', () => {
    const partial = po({ status: 'partially_received', items: [
      { catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, quantityReceived: 3, unitCost: 100 },
      { catalogItemId: 'b', catalogItemName: 'B', quantityOrdered: 5, quantityReceived: 0, unitCost: 50 },
    ] })
    const r = reverseReceiptFromPO(partial, [{ catalogItemId: 'a', quantity: 3 }])
    expect(r.status).toBe('sent')
  })
})
