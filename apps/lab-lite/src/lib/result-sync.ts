/**
 * Result Sync — drains structured lab-result bundles to the Hub.
 *
 * Result entry enqueues a full LabFhirBundle into syncQueue with
 * resourceType='DiagnosticReport' (results/[sampleId]/enter/page.tsx). This
 * worker POSTs each pending entry to lab.submitResult and marks it synced.
 * Never throws — sync must not block clinical work. PHI-safe logging (shape only).
 */
import { classifySyncFailure } from '@ultranos/sync-engine'
import { getDb } from './db'
import { getHubApiUrl } from './trpc'

/**
 * Returns true for permanent 4xx rejections that will never succeed with
 * the same payload (schema-invalid, entity-not-found, etc.).
 * 408 (Request Timeout) and 429 (Too Many Requests) are transient — excluded.
 */
function isPermanentFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

export async function drainResultSyncQueue(
  getToken: () => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 }
  try {
    const db = getDb()
    const pending = await db.syncQueue
      .where('resourceType')
      .equals('DiagnosticReport')
      .filter((e: { status: string }) => e.status === 'pending')
      .toArray()
    if (pending.length === 0) return result

    const token = await getToken()
    for (const entry of pending) {
      try {
        const res = await fetch(`${getHubApiUrl()}/lab.submitResult`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ json: entry.payload }),
          signal: AbortSignal.timeout(15_000),
        })
        if (res.ok) {
          await db.syncQueue.update(entry.id, { status: 'synced' })
          result.synced++
        } else if (isPermanentFailure(res.status)) {
          // Permanent (4xx, not 408/429): dead-letter this entry so it stops
          // re-consuming each drain cycle. The payload will never succeed.
          await db.syncQueue.update(entry.id, {
            status: 'failed',
            failureReason: classifySyncFailure(`HTTP ${res.status}`),
            retryCount: (entry.retryCount ?? 0) + 1,
            lastAttemptAt: new Date().toISOString(),
          })
          result.failed++
        } else {
          // Transient (5xx, 408, 429): leave pending for next cycle.
          await db.syncQueue.update(entry.id, {
            retryCount: (entry.retryCount ?? 0) + 1,
            lastAttemptAt: new Date().toISOString(),
          })
          result.failed++
        }
      } catch {
        // Network / timeout error — transient; leave pending.
        await db.syncQueue.update(entry.id, {
          retryCount: (entry.retryCount ?? 0) + 1,
          lastAttemptAt: new Date().toISOString(),
        })
        result.failed++
      }
    }
  } catch {
    // Non-fatal — retried next cycle.
  }
  return result
}
