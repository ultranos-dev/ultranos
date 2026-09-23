import { db } from '@/lib/db'
import type { StockBatch } from './types'

/** Today as a YYYY-MM-DD string (local), for lexicographic comparison against
 *  `expiryDate` (also YYYY-MM-DD). A batch expiring today is treated as expired
 *  — same-day dispensing of an expiring batch is not permitted. */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Story 57.4 (M-PHARM-2, AC 2): a batch is FEFO-eligible for DISPENSING only when
 * it is active, has stock, AND is strictly in-date (`expiryDate > today`). Expiry
 * exclusion lives in the predicate itself — it does NOT depend on the expiry
 * watchdog having already quarantined the batch (the watchdog may not have run,
 * or may run on a lag), so an expired batch can never be selected for dispense.
 */
function isDispensable(batch: StockBatch, today: string): boolean {
  return batch.quantityOnHand > 0 && batch.expiryDate > today
}

/**
 * Story 57.4 (M-PHARM-2, AC 2): the result of trying to select a FEFO batch that
 * can COVER the required quantity. Callers MUST handle `insufficientCoverage`
 * explicitly rather than dispensing from whatever batch happens to have >0 units.
 *
 * - `ok`: a single in-date batch fully covers `requiredQty`.
 * - `insufficientCoverage`: no single in-date batch covers `requiredQty`. The
 *   caller decides the UX (split across batches, dispense a partial quantity with
 *   pharmacist confirmation, or abort) — this function never silently returns a
 *   batch that cannot cover the order.
 */
export type FefoSelection =
  | { kind: 'ok'; batch: StockBatch }
  | {
      kind: 'insufficientCoverage'
      /** In-date batches with stock, earliest-expiry first (may be empty). */
      candidates: StockBatch[]
      /** Total in-date units available across all candidate batches. */
      availableQty: number
      requiredQty: number
    }

/**
 * Select the earliest-expiry in-date batch that fully covers `requiredQty`.
 * Returns a typed result the caller must branch on; expired batches are never
 * considered (see {@link isDispensable}).
 */
export async function selectFefoCoverage(
  catalogItemId: string,
  requiredQty: number,
): Promise<FefoSelection> {
  const today = todayIso()
  const batches = await db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .sortBy('expiryDate')

  const candidates = batches.filter((b) => isDispensable(b, today))

  const covering = candidates.find((b) => b.quantityOnHand >= requiredQty)
  if (covering) return { kind: 'ok', batch: covering }

  const availableQty = candidates.reduce((sum, b) => sum + b.quantityOnHand, 0)
  return { kind: 'insufficientCoverage', candidates, availableQty, requiredQty }
}

/**
 * Legacy convenience wrapper: returns the covering in-date batch or `null`.
 *
 * Story 57.4: the silent ">0 units fallback" was removed — when no single in-date
 * batch covers the quantity this now returns `null` (an explicit "no coverage"
 * signal) instead of any batch with leftover units. Expired batches are excluded
 * by the predicate. Prefer {@link selectFefoCoverage} for the typed
 * partial-coverage flow; this wrapper exists only for call sites that need a
 * nullable batch.
 */
export async function selectFefoBatch(
  catalogItemId: string,
  requiredQty: number,
): Promise<StockBatch | null> {
  const selection = await selectFefoCoverage(catalogItemId, requiredQty)
  return selection.kind === 'ok' ? selection.batch : null
}

/**
 * All active batches for a catalog item, earliest-expiry first. Used by stock
 * COUNTING and wholesale fulfillment. Note: this intentionally does NOT filter by
 * expiry — a physical stock count must include expired-but-still-on-shelf batches,
 * and expiry exclusion for dispensing is enforced at the selection layer
 * ({@link selectFefoCoverage}), not here.
 */
export async function getFefoBatches(catalogItemId: string): Promise<StockBatch[]> {
  return db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .sortBy('expiryDate')
}

export async function getTotalStockOnHand(catalogItemId: string): Promise<number> {
  const batches = await db.stockBatches
    .where('[catalogItemId+status]')
    .equals([catalogItemId, 'active'])
    .toArray()
  return batches.reduce((sum, b) => sum + b.quantityOnHand, 0)
}
