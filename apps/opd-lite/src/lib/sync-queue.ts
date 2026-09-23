/**
 * OPD-Lite sync queue singleton.
 *
 * Wires the generic sync-engine queue to the Dexie syncQueue table.
 * Imported by stores to enqueue sync operations on local writes.
 *
 * Encryption (Story 28.3, hardened in Story 60.2):
 * - Payloads are encrypted with the session key before IndexedDB storage.
 * - Stored format: enc:<version>:<base64> (ENCRYPTED_PAYLOAD_PREFIX + versioned AES-GCM payload).
 * - If the session key is unavailable (or encryption throws) at enqueue time,
 *   the payload is NEVER stored as plaintext. It is held in memory only and
 *   flushed (encrypted + enqueued) once re-authentication restores the key —
 *   see flushHeldEnqueues(), wired in key-lifecycle-hooks.ts.
 * - The startup migration (sync-queue-migration.ts) still encrypts any LEGACY
 *   plaintext rows written before this hardening.
 */

import {
  createSyncQueue,
  runRetentionPass,
  ENCRYPTED_PAYLOAD_PREFIX,
  type SyncQueueStorage,
  type SyncQueueEntry,
  type SyncQueue,
  type EnqueueInput,
} from '@ultranos/sync-engine'
import { encryptPayload, decryptPayload } from '@ultranos/crypto'
import { db } from './db'
import { encryptionKeyStore } from './encryption-key-store'
import { auditPhiAccess, AuditAction } from './audit'
import type { AuditResourceType } from './audit'
import { useSyncStore } from '@/stores/sync-store'

/** Dexie-backed storage adapter for the sync queue. */
const dexieStorage: SyncQueueStorage = {
  async put(entry: SyncQueueEntry) {
    await db.syncQueue.put(entry)
  },

  async getByResourceId(resourceId: string, status: string) {
    return (
      (await db.syncQueue
        .where('resourceId')
        .equals(resourceId)
        .filter((e) => e.status === status)
        .first()) ?? null
    )
  },

  async getByStatus(status: string) {
    return db.syncQueue.where('status').equals(status).toArray()
  },

  async delete(id: string) {
    await db.syncQueue.delete(id)
  },

  async count(status: string) {
    return db.syncQueue.where('status').equals(status).count()
  },

  async getLatestSynced() {
    const synced = await db.syncQueue
      .where('status')
      .equals('synced')
      .toArray()
    if (synced.length === 0) return null
    synced.sort((a, b) => (b.lastAttemptAt ?? b.createdAt).localeCompare(a.lastAttemptAt ?? a.createdAt))
    return synced[0] ?? null
  },
}

/**
 * A serialized HLC is "<15-digit wallMs>:<5-digit counter>:<nodeId>" (see
 * serializeHlc in @ultranos/sync-engine). Every opd-lite write stamps one via
 * hlc.now(); an ISO date, a stale reuse, or an empty value here causes the Hub
 * to mis-parse the clock and silently drop the write. Reject it at the source.
 */
const SERIALIZED_HLC_RE = /^\d{15}:\d{5}:.+/

function assertSerializedHlc(hlcTimestamp: string): void {
  if (SERIALIZED_HLC_RE.test(hlcTimestamp)) return
  const msg =
    '[sync-queue] hlcTimestamp is not a serialized HLC ("<15d>:<5d>:<node>"). ' +
    'Use serializeHlc(hlc.now()); an ISO date or empty value causes silent Hub sync failures.'
  // Fail loud in dev/test so CI catches the regression; in production, warn
  // (no PHI) but never block a durable clinical write on a format check.
  if (process.env.NODE_ENV !== 'production') throw new Error(msg)
  console.warn(msg)
}

// Late-bound so sync-worker can attach requestDrain after the worker is constructed.
let onEnqueuedBridge: ((input: EnqueueInput) => void) | null = null
export function setOnEnqueuedBridge(fn: typeof onEnqueuedBridge): void {
  onEnqueuedBridge = fn
}

const rawQueue = createSyncQueue(dexieStorage, undefined, {
  onEnqueued: (input) => { try { onEnqueuedBridge?.(input) } catch { /* never block enqueue */ } },
})

/**
 * Plaintext sync inputs held in MEMORY ONLY because they could not be
 * encrypted at enqueue time (session key unavailable / encryption threw).
 * Never persisted — persisting them anywhere would put plaintext PHI at
 * rest in IndexedDB, the exact fail-open this hardening removes (P-CRYPTO-1).
 * Flushed by flushHeldEnqueues() once the key is restored. Like the session
 * key itself, held entries do not survive a tab close; the underlying
 * clinical record write is the durable source of truth.
 */
const heldForEncryption: EnqueueInput[] = []

/** Number of sync inputs currently held awaiting an encryption key. */
export function getHeldForEncryptionCount(): number {
  return heldForEncryption.length
}

/**
 * Encrypt + enqueue every held input. Called on re-authentication once the
 * session key is restored (key-lifecycle-hooks.ts), mirroring how persisted
 * 'awaiting-key' entries are drained after key restore. Never throws.
 */
export async function flushHeldEnqueues(): Promise<void> {
  if (heldForEncryption.length === 0) return
  const snapshot = heldForEncryption.splice(0, heldForEncryption.length)
  for (const input of snapshot) {
    try {
      await syncQueue.enqueue(input)
    } catch {
      // enqueue() already surfaced/re-held the failure — never throw upstream.
    }
  }
}

/** Extract an error class name from Error OR DOMException (which is not an Error instance in every runtime). */
function getErrorName(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = (err as { name?: unknown }).name
    if (typeof name === 'string' && name.length > 0) return name
  }
  return 'UnknownError'
}

/** Classify + surface an enqueue failure to the UI and the audit log. No PHI. */
function surfaceEnqueueFailure(input: EnqueueInput, err: unknown): void {
  const errorName = getErrorName(err)
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: unknown }).message ?? '')
      : ''
  const isQuota = errorName === 'QuotaExceededError' || message.includes('QuotaExceeded')
  try {
    useSyncStore
      .getState()
      .setSyncError(isQuota ? 'STORAGE_QUOTA_EXCEEDED' : 'SYNC_ENQUEUE_FAILED')
  } catch {
    // Store unavailable (e.g. unit tests) — the audit event below still fires.
  }
  auditPhiAccess(
    AuditAction.SYNC,
    input.resourceType as AuditResourceType,
    input.resourceId,
    undefined,
    { syncOutcome: 'failure', reason: 'enqueue_failed', errorName, action: input.action },
  )
}

/** Hold an input in memory (never plaintext at rest) + surface why. No PHI. */
function holdForEncryption(input: EnqueueInput, reason: 'key_unavailable' | 'encrypt_failed'): void {
  heldForEncryption.push(input)
  try {
    useSyncStore.getState().setSyncError('SYNC_ENCRYPTION_UNAVAILABLE')
  } catch {
    // Store unavailable (e.g. unit tests) — the audit event below still fires.
  }
  auditPhiAccess(
    AuditAction.SYNC,
    input.resourceType as AuditResourceType,
    input.resourceId,
    undefined,
    { syncOutcome: 'failure', reason, action: input.action, held: true },
  )
  console.warn(`[sync-queue] payload held in memory (${reason}) — will encrypt + enqueue after key restore`)
}

/**
 * Queue proxy that transparently encrypts payloads on enqueue.
 * All other queue operations delegate to the underlying queue unchanged.
 *
 * FAIL-SAFE (Story 60.2 / P-CRYPTO-1): a plaintext payload is NEVER written
 * to IndexedDB. If it cannot be encrypted right now, it is held in memory
 * and flushed after key restore. Storage failures (quota, corruption) are
 * surfaced to the sync UI + audit log, then re-thrown so callers keep the
 * pre-existing propagation semantics (enqueueSyncAction never throws).
 */
export const syncQueue: SyncQueue = {
  ...rawQueue,
  async enqueue(input) {
    assertSerializedHlc(input.hlcTimestamp)

    // Already-encrypted payloads pass straight through.
    if (input.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
      try {
        return await rawQueue.enqueue(input)
      } catch (err) {
        surfaceEnqueueFailure(input, err)
        throw err
      }
    }

    const key = encryptionKeyStore.getKey()
    if (!key) {
      // No session key: never store plaintext — hold in memory until restore.
      holdForEncryption(input, 'key_unavailable')
      return
    }

    let encryptedBase64: string
    try {
      encryptedBase64 = await encryptPayload(key, input.payload)
    } catch {
      // Encryption failed (SubtleCrypto unavailable, key revoked mid-call).
      // NEVER fall back to storing plaintext — hold in memory instead.
      holdForEncryption(input, 'encrypt_failed')
      return
    }

    try {
      return await rawQueue.enqueue({
        ...input,
        payload: `${ENCRYPTED_PAYLOAD_PREFIX}${encryptedBase64}`,
      })
    } catch (err) {
      // Storage failure (QuotaExceededError, IndexedDB corruption) — surface
      // to UI + audit instead of letting it vanish into a console.warn.
      surfaceEnqueueFailure(input, err)
      throw err
    }
  },
}

/**
 * Retention pass over synced queue rows (Story 60.2): delete synced entries
 * older than the default 30-day window (keeping the newest, payload-stripped,
 * so lastSyncedAt survives). Never touches pending/failed/awaiting-key/
 * conflict entries — that invariant lives in runRetentionPass itself.
 * Best-effort: never throws.
 */
export async function runSyncQueueRetention(): Promise<void> {
  try {
    await runRetentionPass(dexieStorage)
  } catch {
    // Retention is housekeeping — never let it break sync startup.
  }
}

/**
 * Decrypt a sync queue entry payload in memory before Hub push.
 * Returns the original JSON string for plaintext (legacy) entries unchanged.
 * Used exclusively by the drain worker — decrypted value is never persisted.
 */
export async function decryptEntryPayload(payload: string): Promise<string> {
  if (!payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
    return payload
  }
  const versionedCiphertext = payload.slice(ENCRYPTED_PAYLOAD_PREFIX.length)
  const keyMap = encryptionKeyStore.requireKeyMap()
  const decrypted = await decryptPayload(keyMap, versionedCiphertext)
  return typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted)
}
