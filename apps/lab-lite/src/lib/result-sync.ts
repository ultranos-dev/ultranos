/**
 * Result Sync — drains structured lab-result bundles to the Hub.
 *
 * Result entry enqueues a full LabFhirBundle into syncQueue with
 * resourceType='DiagnosticReport' (results/[sampleId]/enter/page.tsx). This
 * worker POSTs each pending entry to lab.submitResult and marks it synced.
 * Never throws — sync must not block clinical work. PHI-safe logging (shape only).
 */
import { getDb } from './db'
import { getHubApiUrl } from './trpc'

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
        } else {
          await db.syncQueue.update(entry.id, {
            retryCount: (entry.retryCount ?? 0) + 1,
            lastAttemptAt: new Date().toISOString(),
          })
          result.failed++
        }
      } catch {
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
