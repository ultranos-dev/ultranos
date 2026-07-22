/**
 * Dexie adapter for the sync-engine SyncQueueStorage interface.
 *
 * Bridges pharmacy-lite's Dexie syncQueue table to the platform-agnostic
 * sync-engine queue. Handles the status value mismatch: pharmacy db.ts
 * uses 'in-flight' while sync-engine uses 'syncing'.
 *
 * Encryption (Story 28.3): createDexieSyncAdapter() accepts an optional
 * encryptFn so that payloads without the enc:v1: prefix are encrypted on
 * put(). This avoids double-encrypting entries that are already encrypted.
 *
 * PHI-at-rest wiring: pharmacyEncryptPayload() is the session-key encrypt
 * function that mirrors decryptPharmacyEntryPayload() — same key source
 * (encryptionKeyStore), same AES-256-GCM algorithm, same enc:v1: sentinel
 * prefix. enqueuePharmacySyncEntry() / buildEncryptedSyncEntry() are the write
 * paths every enqueue site routes through so PHI is encrypted before it ever
 * reaches IndexedDB.
 */

import { ENCRYPTED_PAYLOAD_PREFIX, type SyncQueueStorage, type SyncQueueEntry } from '@ultranos/sync-engine'
import { encryptPayload, decryptPayload } from '@ultranos/crypto'
import { db, type SyncQueueEntry as DexieSyncQueueEntry } from './db'
import { encryptionKeyStore } from './encryption-key-store'

export type PharmacyEncryptFn = (jsonPayload: string) => Promise<string>

/**
 * Pharmacy-specific SyncQueueStorage superset. Adds a 3-arg getByResourceId
 * overload (resourceId, resourceType, status) plus totalCount / estimateSizeBytes
 * used by the sync dashboard and data-budget UI. Assignable to the base
 * SyncQueueStorage the sync-engine queue expects.
 */
export interface PharmacySyncQueueStorage extends SyncQueueStorage {
  getByResourceId(
    resourceId: string,
    resourceTypeOrStatus: string,
    maybeStatus?: string,
  ): Promise<SyncQueueEntry | null>
  totalCount(): Promise<number>
  estimateSizeBytes(): Promise<number>
}

/** Map sync-engine status values to Dexie status values. */
function toDbStatus(status: string): string {
  return status === 'syncing' ? 'in-flight' : status
}

/** Map Dexie status values to sync-engine status values. */
function fromDbStatus(status: string): SyncQueueEntry['status'] {
  if (status === 'in-flight') return 'syncing'
  return status as SyncQueueEntry['status']
}

function fromDbEntry(entry: DexieSyncQueueEntry): SyncQueueEntry {
  return {
    ...entry,
    action: entry.action as SyncQueueEntry['action'],
    status: fromDbStatus(entry.status),
  }
}

function toDbEntry(entry: SyncQueueEntry): DexieSyncQueueEntry {
  return {
    ...entry,
    status: toDbStatus(entry.status) as DexieSyncQueueEntry['status'],
  }
}

/**
 * Encrypt a JSON payload string with the pharmacy session key, producing the
 * enc:v1: sentinel-prefixed ciphertext that decryptPharmacyEntryPayload()
 * and the drain worker recognise.
 *
 * Throws EncryptionKeyNotAvailableError (via requireKey) if the session key is
 * not ready — callers (enqueuePharmacySyncEntry / buildEncryptedSyncEntry) own
 * the key-unavailable fallback so plaintext PHI is never persisted as syncable.
 */
export const pharmacyEncryptPayload: PharmacyEncryptFn = async (jsonPayload) => {
  const key = encryptionKeyStore.requireKey()
  const version = encryptionKeyStore.getCurrentWriteVersion()
  const versionedCiphertext = await encryptPayload(key, jsonPayload, version)
  return `${ENCRYPTED_PAYLOAD_PREFIX}${versionedCiphertext}`
}

/**
 * Build a SyncQueueStorage adapter over the Dexie syncQueue table.
 * Shared by both the encrypting and plaintext exports below.
 *
 * The returned object carries a few pharmacy-only helpers (3-arg
 * getByResourceId, totalCount, estimateSizeBytes) beyond the base
 * SyncQueueStorage contract; it is cast to the base type for the sync-engine
 * queue while the extra methods remain callable by pharmacy code/tests.
 */
function buildAdapter(encryptFn?: PharmacyEncryptFn): PharmacySyncQueueStorage {
  const adapter = {
    async put(entry: SyncQueueEntry): Promise<void> {
      let { payload } = entry
      if (encryptFn && !payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
        payload = await encryptFn(payload) // intentionally propagates — do not store plaintext on failure
      }
      await db.syncQueue.put(toDbEntry({ ...entry, payload }))
    },

    async getByResourceId(
      resourceId: string,
      resourceTypeOrStatus: string,
      maybeStatus?: string,
    ): Promise<SyncQueueEntry | null> {
      // Supports both signatures:
      //  - sync-engine core: getByResourceId(resourceId, status)
      //  - pharmacy callers: getByResourceId(resourceId, resourceType, status)
      const status = maybeStatus ?? resourceTypeOrStatus
      const resourceType = maybeStatus ? resourceTypeOrStatus : undefined
      const dbStatus = toDbStatus(status)
      const query: Record<string, string> = { resourceId, status: dbStatus }
      if (resourceType) query['resourceType'] = resourceType
      const entry = await db.syncQueue.where(query).first()
      return entry ? fromDbEntry(entry) : null
    },

    async getByStatus(status: string): Promise<SyncQueueEntry[]> {
      const dbStatus = toDbStatus(status)
      const entries = await db.syncQueue
        .where('status')
        .equals(dbStatus)
        .toArray()
      return entries.map(fromDbEntry)
    },

    async delete(id: string): Promise<void> {
      await db.syncQueue.delete(id)
    },

    async count(status: string): Promise<number> {
      const dbStatus = toDbStatus(status)
      return db.syncQueue.where('status').equals(dbStatus).count()
    },

    async totalCount(): Promise<number> {
      return db.syncQueue.count()
    },

    async estimateSizeBytes(): Promise<number> {
      const entries = await db.syncQueue.toArray()
      // UTF-16 approximation: 2 bytes per payload code unit.
      return entries.reduce((sum, e) => sum + (e.payload?.length ?? 0) * 2, 0)
    },

    async getLatestSynced(): Promise<SyncQueueEntry | null> {
      const synced = await db.syncQueue
        .where('status')
        .equals('synced')
        .toArray()
      if (synced.length === 0) return null
      synced.sort((a, b) => {
        const aTime = a.lastAttemptAt ? new Date(a.lastAttemptAt).getTime() : 0
        const bTime = b.lastAttemptAt ? new Date(b.lastAttemptAt).getTime() : 0
        return bTime - aTime
      })
      const first = synced[0]
      return first ? fromDbEntry(first) : null
    },
  }

  return adapter as unknown as PharmacySyncQueueStorage
}

/**
 * Create a Dexie SyncQueueStorage adapter with optional payload encryption.
 * When encryptFn is provided, put() encrypts any payload that does not
 * already carry the enc:v1: prefix (avoiding double-encryption on status updates).
 *
 * Error contract: if encryptFn rejects, put() propagates the error rather than
 * storing plaintext PHI. Callers have a top-level try/catch that swallows queue
 * failures without crashing clinical workflows.
 */
export function createDexieSyncAdapter(encryptFn?: PharmacyEncryptFn): SyncQueueStorage {
  return buildAdapter(encryptFn)
}

/**
 * The canonical PHI-encrypting storage adapter for the sync queue.
 * Wired into the drain worker's createSyncQueue in sync-drain-init.
 */
export const encryptingSyncAdapter: PharmacySyncQueueStorage = buildAdapter(pharmacyEncryptPayload)

/**
 * Shape callers use to enqueue a sync action. Normalises payload to a JSON
 * string and fills in status/retryCount/id/createdAt when omitted.
 */
export interface PharmacyEnqueueInput {
  id?: string
  resourceType: string
  resourceId: string
  action: string
  /** Already-serialized JSON string, or a value that will be JSON.stringify'd. */
  payload: string | Record<string, unknown>
  hlcTimestamp: string
  createdAt?: string
}

function baseEntryFrom(input: PharmacyEnqueueInput): DexieSyncQueueEntry {
  const jsonPayload =
    typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload)
  const now = input.createdAt ?? new Date().toISOString()
  return {
    id: input.id ?? crypto.randomUUID(),
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    payload: jsonPayload,
    status: 'pending',
    hlcTimestamp: input.hlcTimestamp,
    createdAt: now,
    retryCount: 0,
  }
}

/**
 * Build a fully-formed, encrypted Dexie sync-queue entry WITHOUT writing it.
 *
 * Use this at enqueue sites that live inside a `db.transaction('rw', ...)`
 * block: call it BEFORE opening the transaction (encryption is async Web Crypto
 * and cannot run inside a Dexie transaction zone), then `db.syncQueue.put(entry)`
 * synchronously inside the transaction.
 *
 * Key-unavailable handling: if the session key is not ready (or encryption
 * fails), the entry is returned with status 'awaiting-key' and its raw JSON
 * payload, to be encrypted in-place on re-auth by migrateUnencryptedQueueEntries().
 * The drain worker never pushes awaiting-key entries, so plaintext PHI is never
 * synced to the Hub.
 */
export async function buildEncryptedSyncEntry(
  input: PharmacyEnqueueInput,
): Promise<DexieSyncQueueEntry> {
  const baseEntry = baseEntryFrom(input)

  if (!encryptionKeyStore.isReady()) {
    return { ...baseEntry, status: 'awaiting-key' }
  }

  try {
    const encryptedPayload = await pharmacyEncryptPayload(baseEntry.payload)
    return { ...baseEntry, payload: encryptedPayload }
  } catch {
    return { ...baseEntry, status: 'awaiting-key' }
  }
}

/**
 * The single write path for PHI-bearing sync-queue entries at non-transaction
 * call sites. Encrypts the payload (enc:v1: prefix) before it touches IndexedDB.
 *
 * Key-unavailable handling mirrors buildEncryptedSyncEntry: the entry is stored
 * as 'awaiting-key' with its raw JSON payload and encrypted in-place on re-auth.
 * Never throws — sync-queue failures must not block clinical workflows.
 */
export async function enqueuePharmacySyncEntry(input: PharmacyEnqueueInput): Promise<void> {
  try {
    const entry = await buildEncryptedSyncEntry(input)
    await db.syncQueue.put(entry)
  } catch {
    console.warn('[sync-queue] Failed to enqueue sync action — continuing')
  }
}

/**
 * Decrypt a pharmacy sync queue entry payload in memory before Hub push.
 * Returns plaintext JSON for legacy unencrypted entries unchanged.
 */
export async function decryptPharmacyEntryPayload(payload: string): Promise<string> {
  if (!payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
    return payload
  }
  const versionedCiphertext = payload.slice(ENCRYPTED_PAYLOAD_PREFIX.length)
  const keyMap = encryptionKeyStore.requireKeyMap()
  const decrypted = await decryptPayload(keyMap, versionedCiphertext)
  return typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted)
}

/** Default adapter without encryption (backward-compatible singleton). */
export const dexieSyncAdapter: PharmacySyncQueueStorage = buildAdapter()
