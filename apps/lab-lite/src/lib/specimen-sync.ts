/**
 * Specimen Sync — drains collected specimens to the Hub.
 *
 * accessionSample / transitionSampleStatus / rejectSample enqueue the full
 * FhirSpecimen into syncQueue with resourceType='Specimen'. This worker maps
 * each pending entry to the lab.submitSpecimen DTO, POSTs it, and marks synced.
 * Never throws — sync must not block clinical work. PHI-safe logging (shape only).
 */
import { getDb } from './db'
import { getHubApiUrl } from './trpc'

interface FhirSpecimenLike {
  id: string
  status?: string
  type?: { coding?: Array<{ code?: string }> }
  subject?: { reference?: string }
  request?: Array<{ reference?: string }>
  receivedTime?: string
  collection?: { collector?: { reference?: string } }
  note?: Array<{ text?: string }>
  _ultranos?: {
    labSampleId?: string
    pipelineStatus?: string
    sampleCondition?: string
    rejectionReason?: string
    hlcTimestamp?: string
  }
}

function toDto(s: FhirSpecimenLike) {
  return {
    id: s.id,
    labSampleId: s._ultranos?.labSampleId ?? '',
    pipelineStatus: s._ultranos?.pipelineStatus ?? 'received',
    fhirStatus: s.status ?? 'available',
    specimenType: s.type?.coding?.[0]?.code,
    subjectReference: s.subject?.reference ?? '',
    serviceRequestRef: s.request?.[0]?.reference,
    receivedFrom: s.collection?.collector?.reference,
    receivedTime: s.receivedTime,
    condition: s._ultranos?.sampleCondition,
    rejectionReason: s._ultranos?.rejectionReason,
    note: s.note?.[0]?.text,
    hlcTimestamp: s._ultranos?.hlcTimestamp ?? '',
  }
}

export async function drainSpecimenSyncQueue(
  getToken: () => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 }
  try {
    const db = getDb()
    const pending = await db.syncQueue
      .where('resourceType')
      .equals('Specimen')
      .filter((e: { status: string }) => e.status === 'pending')
      .toArray()
    if (pending.length === 0) return result

    // Oldest-first so status transitions apply in order.
    pending.sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

    const token = await getToken()
    for (const entry of pending) {
      try {
        const res = await fetch(`${getHubApiUrl()}/lab.submitSpecimen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ json: toDto(entry.payload as FhirSpecimenLike) }),
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
