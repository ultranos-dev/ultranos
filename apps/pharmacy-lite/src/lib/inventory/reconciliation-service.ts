import { db, type StockReconciliationTask } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'

/**
 * Story 57.4 (M-PHARM-2, AC 3): record that a stock deduction FAILED during
 * dispensing. Dispensing is never blocked by inventory problems (clinical
 * priority) — this makes the failure durable and visible so the on-hand ledger
 * can be manually reconciled instead of silently drifting.
 *
 * Non-PHI: only opaque inventory ids + quantity + a coarse reason category are
 * stored (never a patient name/ref or medication name). Never throws — a logging
 * failure must not itself block the dispense.
 */
export async function recordStockReconciliationTask(params: {
  catalogItemId?: string
  stockBatchId?: string
  quantity: number
  reason: StockReconciliationTask['reason']
  referenceId?: string
}): Promise<void> {
  try {
    const now = new Date().toISOString()
    const task: StockReconciliationTask = {
      id: crypto.randomUUID(),
      catalogItemId: params.catalogItemId,
      stockBatchId: params.stockBatchId,
      quantity: params.quantity,
      reason: params.reason,
      referenceId: params.referenceId,
      status: 'open',
      createdAt: now,
      hlcTimestamp: serializeHlc(hlc.now()),
    }
    await db.stockReconciliationTasks.put(task)
  } catch {
    // Non-fatal: never let reconciliation bookkeeping block a dispense.
  }
}

/** Open (unresolved) reconciliation tasks, newest first — surfaced on the inventory page. */
export async function getOpenReconciliationTasks(): Promise<StockReconciliationTask[]> {
  const tasks = await db.stockReconciliationTasks
    .where('status')
    .equals('open')
    .toArray()
  return tasks.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** Count of open reconciliation tasks (for the inventory alert badge). */
export async function getOpenReconciliationCount(): Promise<number> {
  return db.stockReconciliationTasks.where('status').equals('open').count()
}

/** Mark a reconciliation task resolved (e.g. after a manual stock adjustment). */
export async function resolveReconciliationTask(id: string): Promise<void> {
  await db.stockReconciliationTasks.update(id, {
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
  })
}
