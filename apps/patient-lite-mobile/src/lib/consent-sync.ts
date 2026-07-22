import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { FhirConsent } from '@ultranos/shared-types'
import type { SyncQueue } from '@ultranos/sync-engine'
import { getSyncPriority, enqueueSyncAction } from '@ultranos/sync-engine'
import { consentToEnqueueInput } from '@/lib/consent-queue-adapter'
import { emitAuditEvent } from '@/lib/audit'

const SYNC_QUEUE_KEY = 'ultranos_consent_sync_queue'

/**
 * Sync-engine queue for dual-write.
 * Set during app init (see use-database-unlock.ts / sync-drain-init.ts). When set,
 * queueConsentSync ALSO enqueues the consent into the durable sync-engine queue so
 * the DrainWorker dispatches it to the Hub. When null (queue not yet initialized),
 * consent changes are still captured in the SecureStore ledger below.
 */
let syncEngineQueue: SyncQueue | null = null

/**
 * Wire the sync-engine queue for dual-write. Pass null to clear (e.g. on lock/logout).
 */
export function setSyncEngineQueue(queue: SyncQueue | null): void {
  syncEngineQueue = queue
}

/** In-memory mirror for PWA — cleared on tab close */
let memoryStore: Map<string, string> = new Map()

/**
 * Sync queue entry for consent resources.
 * Consent is high-priority (priority 1) — same as allergies.
 */
export interface ConsentSyncEntry {
  id: string
  resourceType: 'Consent'
  priority: number
  consent: FhirConsent
  queuedAt: string
  synced: boolean
}

/** Sync queue — backed by persistent storage for durability across app restarts */
let consentSyncQueue: ConsentSyncEntry[] = []

/** Persist the sync queue to durable storage */
async function persistQueue(): Promise<void> {
  const serialized = JSON.stringify(consentSyncQueue)
  if (Platform.OS === 'web') {
    memoryStore.set(SYNC_QUEUE_KEY, serialized)
    return
  }
  await SecureStore.setItemAsync(SYNC_QUEUE_KEY, serialized)
}

/** Load the sync queue from durable storage on startup */
export async function loadSyncQueue(): Promise<void> {
  let data: string | null | undefined
  if (Platform.OS === 'web') {
    data = memoryStore.get(SYNC_QUEUE_KEY) ?? null
  } else {
    data = await SecureStore.getItemAsync(SYNC_QUEUE_KEY)
  }
  if (!data) return
  try {
    const parsed = JSON.parse(data)
    if (Array.isArray(parsed)) {
      consentSyncQueue = parsed
    }
  } catch {
    // Corrupted queue — start fresh
  }
}

/**
 * Queue a consent change for high-priority sync to the Hub API.
 *
 * Dual-write:
 *   (a) Appends to the append-only SecureStore ledger (entries are never
 *       removed, only marked as synced).
 *   (b) When a sync-engine queue is wired via setSyncEngineQueue(), also
 *       enqueues the consent into the durable sync-engine queue so the
 *       DrainWorker dispatches it to the Hub.
 *
 * Returns the ledger entry synchronously. The durable persist (SecureStore)
 * and the sync-engine enqueue run fire-and-forget so a rejected persist never
 * discards the already-appended ledger entry; the entry is retained and will
 * be retried on the next queue flush.
 */
export function queueConsentSync(consent: FhirConsent): ConsentSyncEntry {
  const entry: ConsentSyncEntry = {
    id: consent.id,
    resourceType: 'Consent',
    priority: getSyncPriority('Consent'),
    consent,
    queuedAt: new Date().toISOString(),
    synced: false,
  }

  // (a) Append to the ledger synchronously so it is captured before enqueue.
  consentSyncQueue.push(entry)
  void persistQueue()

  // (b) Dual-write to the sync-engine queue when initialized.
  if (syncEngineQueue) {
    void enqueueSyncAction(syncEngineQueue, consentToEnqueueInput(consent))
  }

  const ref = consent.patient?.reference ?? ''
  const patientId = ref.includes('/') ? ref.split('/').pop()! : ref
  emitAuditEvent({
    action: 'PHI_WRITE',
    resourceType: 'Consent',
    resourceId: consent.id,
    patientId,
    outcome: 'success',
    metadata: {
      syncAction: 'queued',
      priority: String(entry.priority),
    },
  })

  return entry
}

/**
 * Get pending consent sync entries, sorted by priority (highest first).
 * Consent entries (priority 1) will always be at the front of the queue.
 */
export function getPendingConsentSync(): ConsentSyncEntry[] {
  return consentSyncQueue
    .filter((e) => !e.synced)
    .sort((a, b) => a.priority - b.priority)
}

/**
 * Mark a consent sync entry as successfully synced.
 * The entry remains in the queue (append-only ledger) but is flagged as synced.
 */
export async function markConsentSynced(consentId: string): Promise<void> {
  const entry = consentSyncQueue.find((e) => e.id === consentId)
  if (entry) {
    entry.synced = true
    await persistQueue()
  }
}

/**
 * Get the full consent sync ledger (append-only — includes synced entries).
 * Used for audit trail verification.
 */
export function getConsentSyncLedger(): readonly ConsentSyncEntry[] {
  return consentSyncQueue
}

/** Clear sync queue — only for testing */
export function _clearSyncQueue(): void {
  consentSyncQueue.length = 0
}
