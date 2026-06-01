/**
 * Procurement Cost Tracker — Story 52.3 Task 7
 *
 * Computes lead time, total cost, and average unit price from local order history.
 * All computations run from local Dexie data — no Hub dependency needed.
 *
 * All prices are in AFN (Afghan Afghani) consistent with Story 44.2.
 * No PHI: reagent codes and pricing data only.
 */

import { getDb } from '../db'
import type { ResupplyRequestItem } from '../db'

// ---------------------------------------------------------------------------
// calculateLeadTimeDays — days from request to delivery (AC 7)
// ---------------------------------------------------------------------------

export function calculateLeadTimeDays(requestedAt: string, deliveredAt: string): number {
  const reqDate = new Date(requestedAt)
  const delDate = new Date(deliveredAt)
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.max(0, Math.floor((delDate.getTime() - reqDate.getTime()) / msPerDay))
}

// ---------------------------------------------------------------------------
// calculateTotalCost — sum of all item totalPrice values in AFN (AC 7)
// Returns null if any item lacks pricing (coordinator hasn't filled it yet).
// ---------------------------------------------------------------------------

export function calculateTotalCost(items: ResupplyRequestItem[]): number | null {
  if (!items || items.length === 0) return null

  let total = 0
  for (const item of items) {
    if (item.totalPrice === null) return null
    total += item.totalPrice
  }
  return total
}

// ---------------------------------------------------------------------------
// getAverageUnitPrice — average unit price for a reagent over past N months (AC 8)
// Returns null if no history found.
// ---------------------------------------------------------------------------

export async function getAverageUnitPrice(
  reagentCode: string,
  lookbackMonths: number,
): Promise<number | null> {
  const db = getDb()
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths)
  const cutoffIso = cutoff.toISOString()

  const allHistory = await db.orderHistory.toArray()

  const prices: number[] = []
  for (const entry of allHistory) {
    if (entry.deliveredAt < cutoffIso) continue
    for (const item of entry.items) {
      if (item.reagentCode === reagentCode && item.unitPrice !== null) {
        prices.push(item.unitPrice)
      }
    }
  }

  if (prices.length === 0) return null
  return prices.reduce((sum, p) => sum + p, 0) / prices.length
}

// ---------------------------------------------------------------------------
// formatAfn — currency display helper (consistent with Story 44.2)
// ---------------------------------------------------------------------------

export function formatAfn(amount: number): string {
  return new Intl.NumberFormat('fa-AF', {
    style: 'currency',
    currency: 'AFN',
    maximumFractionDigits: 0,
  }).format(amount)
}
