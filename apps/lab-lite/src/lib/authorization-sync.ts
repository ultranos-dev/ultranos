/**
 * Story 42.5 — Sync Integration for Offline Authorization
 * Task 10: Drains pending authorization actions from Dexie to Hub when online.
 *
 * Authorization actions are stored in:
 * 1. authorizationActions table (full audit trail)
 * 2. syncQueue table (resourceType: 'labResultAuthorization' | 'notification')
 *
 * On reconnect, this drain function processes both queues.
 * Conflict handling: if the same result was authorized by two supervisors
 * offline, use Tier 2 (timestamp-based merge, newer wins).
 * Both authorization records are kept as addenda for audit purposes.
 */
import { getDb, markAuthorizationActionsSynced, getUnsyncedAuthorizationActions } from './db'
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface SyncResult {
  synced: number
  failed: number
  conflicts: number
}

/**
 * Drain all pending authorization actions to the Hub API.
 * Called by the sync drain worker when connectivity is restored.
 * Never throws — sync must not block other operations.
 */
export async function drainAuthorizationActions(
  getToken: () => Promise<string>,
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, conflicts: 0 }

  try {
    const unsyncedActions = await getUnsyncedAuthorizationActions()
    if (unsyncedActions.length === 0) return result

    const token = await getToken()

    for (const action of unsyncedActions) {
      try {
        const res = await fetch(`${getHubApiUrl()}/lab.authorizeResult`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            json: {
              resultId: action.resultId,
              action: action.action,
              actorId: action.actorId,
              actorRole: action.actorRole,
              timestamp: action.timestamp,
              comments: action.comments,
              criticalValueAcknowledged: action.criticalValueAcknowledged,
              autoVerifyCriteria: action.autoVerifyCriteria,
            },
          }),
          signal: AbortSignal.timeout(10_000),
        })

        if (res.ok) {
          // Mark as synced in authorizationActions table
          if (action.id != null) {
            await markAuthorizationActionsSynced([action.id])
          }
          result.synced++
        } else if (res.status === 409) {
          // Conflict: same result authorized by two supervisors offline
          // Tier 2 merge — newer timestamp wins, but keep both records
          result.conflicts++
          // Mark as synced (the conflict is recorded on the Hub side)
          if (action.id != null) {
            await markAuthorizationActionsSynced([action.id])
          }
        } else {
          result.failed++
        }
      } catch {
        result.failed++
      }
    }
  } catch {
    // Non-fatal — sync will be retried on next connectivity event
  }

  return result
}

/**
 * Drain pending notification sync queue entries for released lab results.
 * Only processes entries with resourceType='notification'.
 */
export async function drainAuthorizationNotifications(
  getToken: () => Promise<string>,
): Promise<void> {
  try {
    const db = getDb()
    const pendingNotifications = await db.syncQueue
      .where('resourceType')
      .equals('notification')
      .filter((entry: any) => entry.status === 'pending')
      .toArray()

    if (pendingNotifications.length === 0) return

    const token = await getToken()

    for (const entry of pendingNotifications) {
      try {
        const res = await fetch(`${getHubApiUrl()}/lab.createNotification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ json: entry.payload }),
          signal: AbortSignal.timeout(10_000),
        })

        if (res.ok) {
          await db.syncQueue.update(entry.id, { status: 'synced' })
        }
        // Failed entries remain in the queue for the next drain cycle
      } catch {
        // Non-fatal — retry on next cycle
      }
    }
  } catch {
    // Non-fatal
  }
}
