/**
 * Specimen Rehydration — pulls active specimens from the Hub on login and
 * restores them to the local Dexie `samples` table.
 *
 * Fixes the data-loss bug where PHI cleanup wipes `samples` on session end.
 * Because lab-lite is push-only, specimens collected in a previous session
 * would vanish permanently without this pull-on-login.
 *
 * DESIGN RULES:
 * - Never throws (wrapped in try/catch) — offline-safe, hydration must not
 *   block clinical work or login flow.
 * - Idempotent + newer-wins: only puts a specimen when local row is ABSENT, or
 *   the hub's hlcTimestamp is STRICTLY NEWER than the local one. This prevents
 *   clobbering in-session edits made after the pull fires.
 * - PHI-safe: no PHI in logs (shape only). Relies on data-min Rule #7 — the
 *   hub endpoint never returns note, raw UUID, or National ID.
 */

import { compareHlc, deserializeHlc } from '@ultranos/sync-engine'
import { getDb } from './db'
import { pullSpecimens } from './trpc'
import type { SpecimenPullDto } from './trpc'
import type { FhirSpecimen } from '@ultranos/shared-types'

/**
 * True once the initial hub specimen hydration has been ATTEMPTED this session
 * (success, empty, or failure). Consumers (e.g. the worklist) use this to avoid
 * flashing a false "no samples" empty state while the hub pull is still pending —
 * they keep showing a loading state until hydration settles.
 */
let hydrationSettled = false
export function isSpecimenHydrationSettled(): boolean {
  return hydrationSettled
}

/**
 * Map a `SpecimenPullDto` (Hub wire format) back into a `FhirSpecimen` for
 * local storage in `db.samples`. This is the inverse of specimen-sync's `toDto`.
 */
function fromDto(dto: SpecimenPullDto): FhirSpecimen {
  const now = new Date().toISOString()

  return {
    id: dto.id,
    resourceType: 'Specimen',
    status: dto.fhirStatus,
    ...(dto.specimenType != null
      ? { type: { coding: [{ code: dto.specimenType, display: dto.specimenType }] } }
      : {}),
    subject: { reference: dto.subjectReference },
    ...(dto.serviceRequestRef != null
      ? { request: [{ reference: dto.serviceRequestRef }] }
      : {}),
    ...(dto.receivedTime != null ? { receivedTime: dto.receivedTime } : {}),
    ...(dto.receivedFrom != null
      ? { collection: { collector: { reference: dto.receivedFrom } } }
      : {}),
    meta: {
      // Use local hydration time — the hub DTO carries no real last-modified timestamp,
      // and using receivedTime would falsely imply received == last-modified.
      // Newer-wins logic relies on hlcTimestamp (below), not on this field.
      lastUpdated: now,
      // Rehydration placeholder: hub API doesn't expose version_id;
      // newer-wins uses hlcTimestamp, not versionId.
      versionId: '1',
    },
    _ultranos: {
      labSampleId: dto.labSampleId,
      pipelineStatus: dto.pipelineStatus,
      sampleCondition: dto.condition,
      hlcTimestamp: dto.hlcTimestamp,
      createdAt: dto.receivedTime ?? now,
      isOfflineCreated: false,
    },
  } as FhirSpecimen
}

/**
 * Returns true when the hub specimen should overwrite the local one:
 *  - Local row is absent → always write.
 *  - Hub hlcTimestamp is STRICTLY NEWER than local hlcTimestamp → write.
 *  - Equal or local is newer → keep local (newer-wins rule).
 *  - If either HLC is unparseable → conservatively write hub data (guard).
 */
function shouldUpsert(
  local: FhirSpecimen | undefined,
  hubHlc: string,
): boolean {
  if (!local) return true
  const localHlc = (local._ultranos as { hlcTimestamp?: string })?.hlcTimestamp
  if (!localHlc) return true

  try {
    const hubParsed   = deserializeHlc(hubHlc)
    const localParsed = deserializeHlc(localHlc)
    // cmp > 0 means hub is newer; cmp <= 0 means local is equal-or-newer → keep
    return compareHlc(hubParsed, localParsed) > 0
  } catch {
    // Unparseable HLC (corrupt/missing data) — conservatively upsert hub data
    return true
  }
}

/**
 * Pull active specimens from the Hub and hydrate the local `samples` table.
 *
 * @param getToken  Async function that resolves to a valid access token.
 * @returns         `{ hydrated: number }` — count of rows actually written.
 *                  Returns `{ hydrated: 0 }` on any failure (offline-safe).
 */
export async function hydrateSamplesFromHub(
  getToken: () => Promise<string>,
): Promise<{ hydrated: number }> {
  try {
    const token = await getToken()
    const { specimens } = await pullSpecimens(token)

    if (specimens.length === 0) return { hydrated: 0 }

    const db = getDb()
    let hydrated = 0

    for (const dto of specimens) {
      try {
        const local = await db.samples.get(dto.id) as FhirSpecimen | undefined
        if (shouldUpsert(local, dto.hlcTimestamp)) {
          const specimen = fromDto(dto)
          // Preserve lab-local worklist fields the hub does NOT model. The hub
          // DTO carries no `archived` flag or data-min display stamp, so a naive
          // overwrite would silently un-archive a sample and blank its name/test
          // on every boot. Carry these forward from the local row.
          if (local) {
            const localExt = local._ultranos as {
              archived?: boolean
              patientFirstName?: string
              patientAge?: number | null
              orderedTests?: FhirSpecimen['_ultranos']['orderedTests']
            }
            specimen._ultranos = {
              ...specimen._ultranos,
              ...(localExt.archived !== undefined ? { archived: localExt.archived } : {}),
              ...(localExt.patientFirstName ? { patientFirstName: localExt.patientFirstName } : {}),
              ...(localExt.patientAge != null ? { patientAge: localExt.patientAge } : {}),
              ...(localExt.orderedTests ? { orderedTests: localExt.orderedTests } : {}),
            }
          }
          await db.samples.put(specimen)
          hydrated++
        }
      } catch {
        // Per-specimen failure is non-fatal — continue with remaining specimens.
        // Shape-only log (no PHI).
        console.warn('[HYDRATE_SPECIMEN_SKIP]', { id: dto.id })
      }
    }

    return { hydrated }
  } catch {
    // Fetch failure, token failure, or unexpected error — offline-safe, never throws.
    return { hydrated: 0 }
  } finally {
    // Mark settled in ALL paths (success / empty / failure) so the worklist stops
    // showing a loading state and can render the genuine result.
    hydrationSettled = true
  }
}
