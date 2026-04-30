import { db } from '@/lib/db'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

/**
 * Returns the current auth token for Hub API calls.
 * Token is provided by the caller (from auth session store).
 */
let _authToken: string | null = null

export function setDispenseSyncAuthToken(token: string | null): void {
  _authToken = token
}

function getAuthToken(): string | null {
  return _authToken
}

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
  const pharmacistRef = dispense.performer?.[0]?.actor.reference ?? ''

  // Validate required fields — empty strings will fail Hub Zod validation forever
  if (!prescriptionId || !medicationCode || !medicationDisplay || !pharmacistRef) {
    return { synced: false, queued: false, error: 'Missing required fields for Hub sync' }
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

    const token = getAuthToken()
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

async function enqueueForRetry(
  dispense: LocalMedicationDispense,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.syncQueue.add({
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    resourceId: dispense.id,
    action: 'dispense_sync',
    payload: JSON.stringify(payload),
    status: 'pending',
    hlcTimestamp: dispense._ultranos.hlcTimestamp,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  })
}
