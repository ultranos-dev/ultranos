import type { SettlementStatus } from './types'

/** Remaining amount owed on an invoice (minor units), clamped ≥ 0. Derived — never stored. */
export function computeAmountDue(inv: { total: number; amountPaid?: number }): number {
  return Math.max(0, inv.total - (inv.amountPaid ?? 0))
}

/** Settlement state derived from amountPaid vs total. */
export function computeSettlementStatus(inv: { total: number; amountPaid?: number }): SettlementStatus {
  if (computeAmountDue(inv) <= 0) return 'paid'
  if ((inv.amountPaid ?? 0) > 0) return 'partial'
  return 'unpaid'
}
