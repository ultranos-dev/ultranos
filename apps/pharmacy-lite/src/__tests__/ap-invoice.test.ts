import { describe, it, expect } from 'vitest'
import { computeAmountDue, computeSettlementStatus } from '@/lib/procurement/ap-invoice'

describe('computeAmountDue', () => {
  it('is total when nothing paid (amountPaid undefined → 0)', () => {
    expect(computeAmountDue({ total: 1000 })).toBe(1000)
  })
  it('is total − amountPaid', () => {
    expect(computeAmountDue({ total: 1000, amountPaid: 400 })).toBe(600)
  })
  it('clamps to 0 when overpaid', () => {
    expect(computeAmountDue({ total: 1000, amountPaid: 1200 })).toBe(0)
  })
})

describe('computeSettlementStatus', () => {
  it('unpaid when nothing paid', () => {
    expect(computeSettlementStatus({ total: 1000 })).toBe('unpaid')
    expect(computeSettlementStatus({ total: 1000, amountPaid: 0 })).toBe('unpaid')
  })
  it('partial when some but not all paid', () => {
    expect(computeSettlementStatus({ total: 1000, amountPaid: 400 })).toBe('partial')
  })
  it('paid when fully paid or overpaid', () => {
    expect(computeSettlementStatus({ total: 1000, amountPaid: 1000 })).toBe('paid')
    expect(computeSettlementStatus({ total: 1000, amountPaid: 1200 })).toBe('paid')
  })
})
