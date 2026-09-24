/**
 * Order-Ack Sync — Story 60.4 (Task 1 / AC 2).
 *
 * Drains the durable order-ack retry queue (Dexie `orderAckQueue`). The ack was
 * previously fired one-shot inside the order-pull loop and, on failure, swallowed
 * with only a comment — so a failed ack left the OPD-side order editable forever.
 * This worker retries each queued ack until it succeeds (or dead-letters it on a
 * permanent 4xx), bounding that discrepancy.
 *
 * Never throws — sync must not block clinical work. PHI-safe: the queue holds
 * only the opaque orderId; the failure reason is categorized, never raw text.
 */
import { classifySyncFailure } from '@ultranos/sync-engine'
import {
  getPendingOrderAcks,
  markOrderAckDone,
  recordOrderAckFailure,
} from './db'
import { acknowledgeOrder } from './trpc'

/**
 * Permanent 4xx rejections that will never succeed with the same request
 * (order not found, forbidden, schema-invalid). 408/429 are transient.
 */
function isPermanentFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

/** Extract an HTTP status from the acknowledgeOrder error message, if present. */
function statusFromError(message: string): number | null {
  const m = message.match(/\b(4\d\d|5\d\d)\b/)
  return m ? Number(m[1]) : null
}

export async function drainOrderAckQueue(
  getToken: () => Promise<string>,
): Promise<{ acked: number; failed: number }> {
  const result = { acked: 0, failed: 0 }
  try {
    const pending = await getPendingOrderAcks()
    if (pending.length === 0) return result

    const token = await getToken()
    if (!token) return result

    for (const entry of pending) {
      try {
        await acknowledgeOrder(entry.orderId, token)
        await markOrderAckDone(entry.orderId)
        result.acked++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown'
        const status = statusFromError(message)
        // Permanent 4xx → dead-letter (surfaced in the failed-sync UI). Everything
        // else (network error, timeout, 5xx, 408/429) stays pending for retry.
        const permanent = status !== null && isPermanentFailure(status)
        await recordOrderAckFailure(entry.orderId, classifySyncFailure(message), permanent)
        result.failed++
      }
    }
  } catch {
    // Non-fatal — retried next cycle.
  }
  return result
}
