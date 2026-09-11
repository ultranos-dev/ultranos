import { describe, it, expect } from 'vitest'
import { computePoTotals, type PoLineInput } from '@/lib/procurement/po-totals'

const line = (o: Partial<PoLineInput> = {}): PoLineInput => ({
  catalogItemId: 'a', catalogItemName: 'A', quantityOrdered: 10, unitCost: 100, ...o,
})

describe('computePoTotals', () => {
  it('no discount, no tax, no freight → subtotal = grandTotal', () => {
    const r = computePoTotals([line()], 0, 0)
    expect(r.subtotal).toBe(1000)
    expect(r.grandTotal).toBe(1000)
    expect(r.items[0]!.netUnitCost).toBe(100)
  })
  it('percent discount reduces line net and net unit cost', () => {
    const r = computePoTotals([line({ discountType: 'percent', discountValue: 10 })], 0, 0)
    expect(r.items[0]!.lineDiscount).toBe(100) // 10% of 1000
    expect(r.items[0]!.lineNet).toBe(900)
    expect(r.items[0]!.netUnitCost).toBe(90)
    expect(r.discountTotal).toBe(100)
  })
  it('amount discount is a flat minor-unit reduction off the line', () => {
    const r = computePoTotals([line({ discountType: 'amount', discountValue: 250 })], 0, 0)
    expect(r.items[0]!.lineNet).toBe(750)
    expect(r.items[0]!.netUnitCost).toBe(75)
  })
  it('discount clamps to the line gross (never negative net)', () => {
    const r = computePoTotals([line({ discountType: 'amount', discountValue: 99999 })], 0, 0)
    expect(r.items[0]!.lineDiscount).toBe(1000)
    expect(r.items[0]!.lineNet).toBe(0)
  })
  it('tax applies to subtotal; freight adds to grand total', () => {
    const r = computePoTotals([line()], 5, 300) // subtotal 1000, tax 50, freight 300
    expect(r.taxAmount).toBe(50)
    expect(r.grandTotal).toBe(1350)
  })
  it('zero quantity → no divide-by-zero, netUnitCost 0', () => {
    const r = computePoTotals([line({ quantityOrdered: 0 })], 0, 0)
    expect(r.items[0]!.netUnitCost).toBe(0)
    expect(r.subtotal).toBe(0)
  })
  it('multi-line subtotal sums line nets', () => {
    const r = computePoTotals([line(), line({ unitCost: 50, quantityOrdered: 4 })], 0, 0)
    expect(r.subtotal).toBe(1200)
  })
})
