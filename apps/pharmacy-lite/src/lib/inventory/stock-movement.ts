import { db } from '@/lib/db'
import { addStock, deductStock } from './stock-service'
import type { StockAdjustmentReason, StockMovementType } from './types'

/**
 * Correct a batch's on-hand quantity to `newQuantity`, recording an
 * `adjusted` movement (refType `adjustment`) with a structured reason.
 * Reuses addStock/deductStock — no separate deduction logic, no extra sync enqueue.
 */
export async function recordAdjustment(params: {
  stockBatchId: string
  newQuantity: number
  reasonCode: StockAdjustmentReason
  note?: string
  performedBy: string
}): Promise<void> {
  const { stockBatchId, newQuantity, reasonCode, note, performedBy } = params
  if (newQuantity < 0) throw new Error('newQuantity must be >= 0')

  const batch = await db.stockBatches.get(stockBatchId)
  if (!batch) throw new Error(`StockBatch not found: ${stockBatchId}`)

  const delta = newQuantity - batch.quantityOnHand
  if (delta === 0) return

  const common = {
    stockBatchId,
    catalogItemId: batch.catalogItemId,
    type: 'adjusted' as StockMovementType,
    referenceType: 'adjustment' as const,
    reason: note,
    reasonCode,
    performedBy,
  }

  if (delta > 0) {
    await addStock({ ...common, quantity: delta })
  } else {
    await deductStock({ ...common, quantity: -delta })
  }
}
