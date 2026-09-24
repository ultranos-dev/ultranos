/**
 * Offline patient registration for Lab-Lite (Story 60.3, Task 3 — M-LAB-3
 * counterpart of C-OPD-2).
 *
 * Lab-Lite registers patients via the Hub `lab.registerPatient` endpoint, which
 * returns an OPAQUE HMAC blind-index ref (`Patient/<hmac>`) — the lab never
 * receives the real patient UUID (Rule #7). That ref cannot be computed offline,
 * so an offline registration mints a PROVISIONAL local ref
 * (`Patient/local-<uuid>`), writes the tier-minimal patient locally (first name,
 * gender, birth year only — Rule #7), and enqueues a `Patient` `create` carrying
 * the full `lab.registerPatient` input for the Hub.
 *
 * At drain (`drainPatientRegistrationQueue`) the entry is POSTed to
 * `lab.registerPatient`; the Hub runs its MPI check and returns the real blind
 * ref. The provisional ref is then reconciled to the real ref across the lab's
 * local records that key on it (patient row, samples, orders, verifications).
 *
 * Consent rides inside the queued payload, so it reaches the Hub with the
 * patient — never stranded. The queue survives logout (Story 57.3: syncQueue is
 * in PRESERVE_TABLES), so a queued-but-undrained registration is never the only
 * copy destroyed.
 */

import { classifySyncFailure } from '@ultranos/sync-engine'
import { getDb, putPatient, enqueueSyncEvent } from './db'
import { getHubApiUrl } from './trpc'
import type { CreatePatientInput } from './trpc'
import { hlcNow } from './hlc'

/** Prefix marking a provisional (offline-minted) lab patient ref. */
export const PROVISIONAL_REF_PREFIX = 'Patient/local-'

export function isProvisionalRef(ref: string): boolean {
  return ref.startsWith(PROVISIONAL_REF_PREFIX)
}

/**
 * Register a patient offline: write the tier-minimal local row + enqueue the
 * Hub `lab.registerPatient` create. Returns the provisional ref the caller uses
 * as the local patient key (and the `/upload?patientId=` param).
 *
 * @param input       the full lab.registerPatient input (demographics + consent)
 * @param localMinimal the tier-minimal fields the lab RETAINS locally (Rule #7)
 */
export async function registerPatientOfflineLab(
  input: CreatePatientInput,
  localMinimal: { firstName: string; gender: string; birthYear?: number },
): Promise<string> {
  const provisionalRef = `${PROVISIONAL_REF_PREFIX}${crypto.randomUUID()}`
  const now = new Date().toISOString()

  // Tier-minimal local patient (Rule #7): first name + gender + birth year only.
  // Never persist father's name, exact DOB, or phone in the lab's local store.
  const patient = {
    id: provisionalRef,
    resourceType: 'Patient',
    name: [{ given: [localMinimal.firstName] }],
    gender: localMinimal.gender,
    _ultranos: {
      nameLocal: localMinimal.firstName,
      birthYearOnly: true,
      birthYear: localMinimal.birthYear,
      mpiPending: true,
      isOfflineCreated: true,
    },
    meta: { lastUpdated: now, versionId: '1' },
  }
  await putPatient(patient)

  // Enqueue the full registration input for the Hub. resourceId is the
  // provisional ref so the drain can reconcile it to the real ref on ack.
  await enqueueSyncEvent({
    resourceType: 'PatientRegistration',
    resourceId: provisionalRef,
    payload: input,
    hlcTimestamp: hlcNow(),
  })

  return provisionalRef
}

/** Returns true for permanent 4xx rejections (mirrors specimen-sync). */
function isPermanentFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

/**
 * Reconcile a provisional lab patient ref to the real Hub blind-index ref
 * across the lab's local records that key on it. Idempotent.
 */
export async function reconcileProvisionalLabRef(
  provisionalRef: string,
  realRef: string,
): Promise<number> {
  const db = getDb()
  let touched = 0
  if (provisionalRef === realRef) return 0

  // 1) Re-key the local patient row (drop the provisional row, put under real ref).
  try {
    const prov = await db.table('patients').get(provisionalRef)
    if (prov) {
      const ultranos = { ...((prov as { _ultranos?: Record<string, unknown> })._ultranos ?? {}) }
      delete ultranos.mpiPending
      delete ultranos.isOfflineCreated
      await db.table('patients').put({ ...prov, id: realRef, _ultranos: ultranos })
      await db.table('patients').delete(provisionalRef)
      touched++
    }
  } catch { /* non-fatal */ }

  // 2) samples.subject.reference (indexed).
  try {
    const samples = await db.table('samples').where('subject.reference').equals(provisionalRef).toArray()
    for (const s of samples) {
      await db.table('samples').put({ ...s, subject: { ...(s.subject ?? {}), reference: realRef } })
      touched++
    }
  } catch { /* table/index may be absent in this schema version */ }

  // 3) orders.patientRef (indexed).
  try {
    const orders = await db.table('orders').where('patientRef').equals(provisionalRef).toArray()
    for (const o of orders) {
      await db.table('orders').put({ ...o, patientRef: realRef })
      touched++
    }
  } catch { /* non-fatal */ }

  // 4) patientVerifications.patientRef (indexed).
  try {
    const verifs = await db.table('patientVerifications').where('patientRef').equals(provisionalRef).toArray()
    for (const v of verifs) {
      await db.table('patientVerifications').put({ ...v, patientRef: realRef })
      touched++
    }
  } catch { /* non-fatal */ }

  // 5) verified_patients keyed by patientId — re-key.
  try {
    const vp = await db.table('verified_patients').get(provisionalRef)
    if (vp) {
      await db.table('verified_patients').put({ ...vp, patientId: realRef })
      await db.table('verified_patients').delete(provisionalRef)
      touched++
    }
  } catch { /* non-fatal */ }

  return touched
}

/**
 * Drain queued offline patient registrations to `lab.registerPatient`.
 * On success, reconcile the provisional ref → the Hub blind-index ref, then mark
 * the queue entry synced. Never throws — sync must not block clinical work.
 */
export async function drainPatientRegistrationQueue(
  getToken: () => Promise<string>,
): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 }
  try {
    const db = getDb()
    const pending = await db.syncQueue
      .where('resourceType')
      .equals('PatientRegistration')
      .filter((e: { status: string }) => e.status === 'pending')
      .toArray()
    if (pending.length === 0) return result

    pending.sort((a: { createdAt?: string }, b: { createdAt?: string }) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

    const token = await getToken()
    for (const entry of pending) {
      try {
        const res = await fetch(`${getHubApiUrl()}/lab.registerPatient`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ json: entry.payload }),
          signal: AbortSignal.timeout(15_000),
        })
        if (res.ok) {
          const body = (await res.json()) as { result?: { data?: { json?: { ref?: string } } } }
          const realRef = body.result?.data?.json?.ref
          if (realRef) {
            await reconcileProvisionalLabRef(entry.resourceId, realRef)
          }
          await db.syncQueue.update(entry.id, { status: 'synced' })
          result.synced++
        } else if (isPermanentFailure(res.status)) {
          await db.syncQueue.update(entry.id, {
            status: 'failed',
            failureReason: classifySyncFailure(`HTTP ${res.status}`),
            retryCount: (entry.retryCount ?? 0) + 1,
            lastAttemptAt: new Date().toISOString(),
          })
          result.failed++
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
