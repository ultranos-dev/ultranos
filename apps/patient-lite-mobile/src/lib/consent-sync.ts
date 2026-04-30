import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { FhirConsent } from '@ultranos/shared-types'
import { getSyncPriority } from '@ultranos/sync-engine'
import { emitAuditEvent } from '@/lib/audit'

const SYNC_QUEUE_KEY = 'ultranos_consent_sync_queue'

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
 * Uses the append-only pattern — entries are never removed from the ledger,
 * only marked as synced.
 */
export async function queueConsentSync(consent: FhirConsent): Promise<ConsentSyncEntry> {
  const entry: ConsentSyncEntry = {
    id: consent.id,
    resourceType: 'Consent',
    priority: getSyncPriority('Consent'),
    consent,
    queuedAt: new Date().toISOString(),
    synced: false,
  }

  consentSyncQueue.push(entry)
  await persistQueue()

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
