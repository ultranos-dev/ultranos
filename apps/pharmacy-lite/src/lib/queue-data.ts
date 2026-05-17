import { db } from '@/lib/db'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'
import type { SyncQueueEntry } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

export type SyncStatus = 'synced' | 'pending' | 'failed'

export type FulfillmentPhaseBadge = 'loaded' | 'reviewing' | 'dispensing' | 'completed'

export interface QueueItem {
  id: string
  patientFirstName: string
  medicationCount: number
  phase: FulfillmentPhaseBadge
  timestamp: string
  syncStatus: SyncStatus
  syncQueueEntryId?: string
  dispense: LocalMedicationDispense
}

function extractFirstName(display?: string): string {
  if (!display) return 'Unknown'
  return display.split(' ')[0] ?? 'Unknown'
}

function mapPhase(dispense: LocalMedicationDispense): FulfillmentPhaseBadge {
  // Prefer persisted fulfillment phase from _ultranos (set during dispensing workflow)
  const stored = (dispense._ultranos as Record<string, unknown>)?.fulfillmentPhase
  if (stored === 'loaded' || stored === 'reviewing' || stored === 'dispensing' || stored === 'completed') {
    return stored
  }
  // Fallback: derive from FHIR status
  switch (dispense.status) {
    case 'preparation':
    case 'in-progress':
      return 'loaded'
    case 'on-hold':
      return 'reviewing'
    case 'completed':
      return 'completed'
    default:
      return 'loaded'
  }
}

function deriveSyncStatus(sqEntry: SyncQueueEntry | undefined): SyncStatus {
  if (!sqEntry) return 'synced'
  if (sqEntry.status === 'synced') return 'synced'
  if (sqEntry.retryCount > 0) return 'failed'
  return 'pending'
}

function toQueueItem(
  dispense: LocalMedicationDispense,
  syncStatus: SyncStatus,
  syncQueueEntryId?: string,
): QueueItem {
  return {
    id: dispense.id,
    patientFirstName: extractFirstName(dispense.subject?.display),
    medicationCount: 1, // FHIR MedicationDispense is one medication per resource
    phase: mapPhase(dispense),
    timestamp: dispense.meta?.lastUpdated ?? dispense._ultranos?.createdAt ?? '',
    syncStatus,
    syncQueueEntryId,
    dispense,
  }
}

/**
 * Active items: dispenses with status !== 'completed'
 */
export async function getActiveItems(): Promise<QueueItem[]> {
  const allDispenses = await db.dispenses.toArray()
  const items = allDispenses
    .filter((d) => d.status !== 'completed')
    .map((d) => toQueueItem(d, 'pending'))

  // Audit: PHI access when reading patient dispense data for queue view
  if (items.length > 0) {
    auditPhiAccess(
      'pharmacy-user',
      AuditAction.READ,
      AuditResourceType.PRESCRIPTION,
      'queue-active',
      undefined,
      { phiAccess: 'queue_view', tab: 'active', itemCount: items.length },
    )
  }

  return items
}

/**
 * Completed items: dispenses from today with status === 'completed'.
 * Sync status derived from syncQueue presence and status.
 */
export async function getCompletedItems(): Promise<QueueItem[]> {
  const now = new Date()
  const todayStartUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

  const [todayDispenses, syncQueueAll] = await Promise.all([
    db.dispenses
      .where('meta.lastUpdated')
      .aboveOrEqual(todayStartUtc.toISOString())
      .toArray(),
    db.syncQueue.toArray(),
  ])

  const syncMap = new Map<string, SyncQueueEntry>()
  for (const entry of syncQueueAll) {
    syncMap.set(entry.resourceId, entry)
  }

  const items = todayDispenses
    .filter((d) => d.status === 'completed')
    .map((d) => {
      const sqEntry = syncMap.get(d.id)
      return toQueueItem(d, deriveSyncStatus(sqEntry), sqEntry?.id)
    })

  if (items.length > 0) {
    auditPhiAccess(
      'pharmacy-user',
      AuditAction.READ,
      AuditResourceType.PRESCRIPTION,
      'queue-completed',
      undefined,
      { phiAccess: 'queue_view', tab: 'completed', itemCount: items.length },
    )
  }

  return items
}

/**
 * Failed items: dispenses with corresponding syncQueue entries where status is not 'synced' and retryCount > 0.
 */
export async function getFailedItems(): Promise<QueueItem[]> {
  const syncQueueAll = await db.syncQueue.toArray()
  const failedEntries = syncQueueAll.filter((e) => e.retryCount > 0 && e.status !== 'synced')

  if (failedEntries.length === 0) return []

  const allDispenses = await db.dispenses.toArray()
  const dispenseMap = new Map<string, LocalMedicationDispense>()
  for (const d of allDispenses) {
    dispenseMap.set(d.id, d)
  }

  const items = failedEntries
    .map((sqEntry) => {
      const dispense = dispenseMap.get(sqEntry.resourceId)
      if (!dispense) return null
      return toQueueItem(dispense, 'failed', sqEntry.id)
    })
    .filter((item): item is QueueItem => item !== null)

  if (items.length > 0) {
    auditPhiAccess(
      'pharmacy-user',
      AuditAction.READ,
      AuditResourceType.PRESCRIPTION,
      'queue-failed',
      undefined,
      { phiAccess: 'queue_view', tab: 'failed', itemCount: items.length },
    )
  }

  return items
}
