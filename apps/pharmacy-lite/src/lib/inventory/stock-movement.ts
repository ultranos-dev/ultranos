import { db } from '@/lib/db'
import { addStock, deductStock } from './stock-service'
import type { StockAdjustmentReason, StockDisposalReason, StockMovementType } from './types'

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

/**
 * Remove `quantity` units from a batch as disposal/write-off, recording a
 * `disposed` movement (refType `disposal`). Operates on active AND quarantined
 * batches — disposal is how quarantined stock leaves the books. deductStock
 * already flips the batch to `depleted` at zero and enqueues sync.
 */
export async function recordDisposal(params: {
  stockBatchId: string
  quantity: number
  reasonCode: StockDisposalReason
  note?: string
  performedBy: string
}): Promise<void> {
  const { stockBatchId, quantity, reasonCode, note, performedBy } = params
  if (quantity <= 0) throw new Error('quantity must be > 0')

  const batch = await db.stockBatches.get(stockBatchId)
  if (!batch) throw new Error(`StockBatch not found: ${stockBatchId}`)

  await deductStock({
    stockBatchId,
    catalogItemId: batch.catalogItemId,
    quantity,
    type: 'disposed',
    referenceType: 'disposal',
    reason: note,
    reasonCode,
    performedBy,
  })
}
