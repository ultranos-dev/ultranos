import { KRLSyncService } from '@ultranos/sync-engine'
import type { KRLEntry } from '@ultranos/sync-engine'
import { dexieKrlStorage } from './krl-storage-adapter'
import { db } from './db'
import { getHubApiUrl } from './trpc'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'

/**
 * KRL Sync Worker — Story 19.5
 *
 * Polls the Hub API for the Key Revocation List and applies snapshots
 * to the local Dexie store. After each sync, purges any matching keys
 * from the practitioner key cache.
 *
 * Lifecycle: start after auth, stop on logout/session expiry.
 * Pattern mirrors audit drain worker (singleton, start/stop functions).
 */

const KRL_POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const KRL_PAGE_LIMIT = 500

const krlService = new KRLSyncService(dexieKrlStorage)

let intervalId: ReturnType<typeof setInterval> | null = null
let onlineHandler: (() => void) | null = null
let running = false
let syncing = false

/**
 * Fetch the full KRL from the Hub API with cursor-based pagination.
 * Returns all revoked key entries, or null on network/auth failure.
 */
async function fetchKrlFromHub(
  getAccessToken: () => Promise<string | null>,
): Promise<KRLEntry[] | null> {
  try {
    const token = await getAccessToken()
    if (!token) return null

    const hubUrl = getHubApiUrl()
    const allEntries: KRLEntry[] = []
    let cursor: string | undefined
    const MAX_PAGES = 100

    for (let page = 0; page < MAX_PAGES; page++) {
      const input: Record<string, unknown> = { limit: KRL_PAGE_LIMIT }
      if (cursor) input.cursor = cursor

      const url = `${hubUrl}/practitionerKey.getRevocationList?input=${encodeURIComponent(
        JSON.stringify(input),
      )}`

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) return null

      const json = (await res.json()) as {
        result: { data: { json: { revokedKeys: KRLEntry[]; nextCursor?: string } } }
      }
      const data = json.result.data.json
      allEntries.push(...data.revokedKeys)

      if (!data.nextCursor) break
      cursor = data.nextCursor
    }

    return allEntries
  } catch {
    // Network failure — return null so caller can fail-closed
    return null
  }
}

/**
 * Purge practitioner keys that appear in the new KRL.
 * Returns the count of keys purged from the cache.
 */
async function purgeRevokedFromCache(krlEntries: KRLEntry[]): Promise<number> {
  if (krlEntries.length === 0) return 0

  const revokedSet = new Set(krlEntries.map((e) => e.publicKey))
  const cachedKeys = await db.practitionerKeys.toArray()
  const toPurge = cachedKeys.filter((k) => revokedSet.has(k.publicKey))

  if (toPurge.length > 0) {
    await db.practitionerKeys.bulkDelete(toPurge.map((k) => k.publicKey))
  }

  return toPurge.length
}

/**
 * Execute a single KRL sync cycle:
 * 1. Fetch KRL from Hub
 * 2. Apply snapshot to local store
 * 3. Purge revoked keys from practitioner cache
 * 4. Emit audit event
 */
async function syncKrl(
  getAccessToken: () => Promise<string | null>,
  actorId: string,
): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    const entries = await fetchKrlFromHub(getAccessToken)

    if (entries === null) {
      // Network/auth failure — fail-closed: retain existing KRL (AC #4)
      auditPhiAccess(
        actorId,
        AuditAction.SYNC,
        AuditResourceType.PRACTITIONER_KEY,
        'krl',
        undefined,
        { outcome: 'failure', reason: 'Hub unreachable or auth expired' },
      )
      return
    }

    // Get previous KRL count for delta calculation
    const previousEntries = await dexieKrlStorage.getAll()
    const previousKeys = new Set(previousEntries.map((e) => e.publicKey))

    // Apply full snapshot
    await krlService.applySnapshot(entries)

    // Purge revoked keys from practitioner cache (AC #2)
    const purgedCount = await purgeRevokedFromCache(entries)

    // Calculate new revocations
    const newRevocations = entries.filter((e) => !previousKeys.has(e.publicKey)).length

    // Audit success (AC #5) — counts only, never key values
    auditPhiAccess(
      actorId,
      AuditAction.SYNC,
      AuditResourceType.PRACTITIONER_KEY,
      'krl',
      undefined,
      {
        outcome: 'success',
        revokedKeyCount: entries.length,
        newRevocations,
        purgedFromCache: purgedCount,
      },
    )
  } catch {
    // Unexpected error — fail-closed: retain existing KRL
    auditPhiAccess(
      actorId,
      AuditAction.SYNC,
      AuditResourceType.PRACTITIONER_KEY,
      'krl',
      undefined,
      { outcome: 'failure', reason: 'Unexpected error during KRL sync' },
    )
  } finally {
    syncing = false
  }
}

/**
 * Start the KRL sync worker.
 * Runs an immediate sync, then polls every 5 minutes.
 * Also syncs on `online` events for immediate recovery after connectivity loss.
 */
export function startKrlSync(
  getAccessToken: () => Promise<string | null>,
  actorId: string,
): void {
  // Stop any existing worker first
  stopKrlSync()

  running = true

  const doSync = () => void syncKrl(getAccessToken, actorId)

  // Immediate sync on startup (AC #1, Task 4.3)
  doSync()

  // Poll every 5 minutes (AC #1, Task 4.4)
  intervalId = setInterval(doSync, KRL_POLL_INTERVAL_MS)

  // Sync on online event (AC #1 — "when device comes online")
  onlineHandler = doSync
  window.addEventListener('online', onlineHandler)
}

/**
 * Stop the KRL sync worker.
 * Called on logout/session expiry.
 */
export function stopKrlSync(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (onlineHandler !== null) {
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }
  running = false
}

/** Check if the KRL sync worker is currently running. */
export function isKrlSyncRunning(): boolean {
  return running
}

// Exported for testing
export { KRL_POLL_INTERVAL_MS, syncKrl, fetchKrlFromHub, purgeRevokedFromCache }
