import type { LocalMedicationDispense } from '@/lib/medication-dispense'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'

export interface DispenseSyncResult {
  synced: boolean
  queued: boolean
  error?: string
}

/**
 * Attempt to sync a MedicationDispense to the Hub API immediately.
 * If the Hub is unreachable (offline or error), queue it in the local sync_queue
 * for later retry. This is a "Sync-Preferred" event per architecture docs.
 */
export async function syncDispenseToHub(
  dispense: LocalMedicationDispense,
): Promise<DispenseSyncResult> {
  const prescriptionId = dispense.authorizingPrescription?.[0]?.reference?.replace(
    'MedicationRequest/',
    '',
  ) ?? ''
  const medicationCode = dispense.medicationCodeableConcept.coding?.[0]?.code ?? ''
  const medicationDisplay = dispense.medicationCodeableConcept.text ?? ''

  // Belt-and-suspenders: derive pharmacistRef from auth store, not from dispense record
  let pharmacistRef: string
  try {
    pharmacistRef = useAuthSessionStore.getState().getPractitionerRef()
  } catch {
    // Auth store unavailable — cannot construct valid payload without identity, do not queue
    return { synced: false, queued: false, error: 'auth-unavailable' }
  }

  // Log warning if stored performer differs from auth store (no PHI)
  const storedPerformerRef = dispense.performer?.[0]?.actor.reference ?? ''
  if (storedPerformerRef && storedPerformerRef !== pharmacistRef) {
    console.warn('[dispense-sync] Performer ref mismatch: stored performer differs from auth session identity')
  }

  // Validate required fields — empty strings will fail Hub Zod validation forever
  if (!prescriptionId || !medicationCode || !medicationDisplay || !pharmacistRef) {
    return { synced: false, queued: false, error: 'Missing required fields for Hub sync' }
  }

  if (!dispense.whenHandedOver) {
    return { synced: false, queued: false, error: 'whenHandedOver is required for Hub sync' }
  }

  const mutationPayload = {
    dispenseId: dispense.id,
    prescriptionId,
    medicationCode,
    medicationDisplay,
    patientRef: dispense.subject.reference,
    pharmacistRef,
    whenHandedOver: dispense.whenHandedOver,
    hlcTimestamp: dispense._ultranos.hlcTimestamp,
    status: dispense.status === 'completed' ? 'completed' : 'in-progress',
  }

  try {
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/medication.recordDispense'

    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) {
      return { synced: false, queued: false, error: 'Authentication required for Hub sync' }
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ json: mutationPayload }),
    })

    if (!res.ok) {
      await enqueueForRetry(dispense, mutationPayload)
      return { synced: false, queued: true }
    }

    return { synced: true, queued: false }
  } catch {
    // Offline or network error — queue for later
    await enqueueForRetry(dispense, mutationPayload)
    return { synced: false, queued: true }
  }
}

/**
 * Retry syncing a previously queued payload directly to the Hub.
 * Used by SyncQueueDashboard when the original dispense record is no longer
 * available in IndexedDB but the serialized payload is still in the sync queue.
 */
export async function retrySyncPayload(
  payload: Record<string, unknown>,
): Promise<DispenseSyncResult> {
  try {
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/medication.recordDispense'

    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) {
      return { synced: false, queued: false, error: 'Authentication required for Hub sync' }
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ json: payload }),
    })

    if (!res.ok) {
      return { synced: false, queued: false, error: `Hub returned ${res.status}` }
    }

    return { synced: true, queued: false }
  } catch {
    return { synced: false, queued: false, error: 'Network error during retry' }
  }
}

async function enqueueForRetry(
  dispense: LocalMedicationDispense,
  payload: Record<string, unknown>,
): Promise<void> {
  // Payload contains PHI (patientRef, medicationDisplay) — encrypted at rest.
  await enqueuePharmacySyncEntry({
    resourceType: 'MedicationDispense',
    resourceId: dispense.id,
    action: 'dispense_sync',
    payload,
    hlcTimestamp: dispense._ultranos.hlcTimestamp,
  })
}
