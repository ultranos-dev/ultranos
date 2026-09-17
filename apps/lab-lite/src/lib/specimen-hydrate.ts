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
      lastUpdated: dto.receivedTime ?? now,
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
  }
}
