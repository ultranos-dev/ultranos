'use client'

/**
 * Lab-Lite patient clinical persistence for the shared registration/edit form
 * (full access, product decision 2026-09-28 — nothing gated). Persists allergies
 * (Tier-1 append-only) and vitals Observations to the local encrypted Dexie store
 * and enqueues each for Hub sync. Mirrors OPD-Lite/Pharmacy semantics.
 */
import type { FhirAllergyIntolerance, FhirObservation } from '@ultranos/shared-types'
import { getDb, enqueueSyncEvent } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'

const ALLERGY_CLINICAL_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const

/** Persist a newly-captured allergy locally (append-only) + enqueue Hub sync. */
export async function addAllergy(allergy: FhirAllergyIntolerance): Promise<void> {
  await getDb().table('allergyIntolerances').put(allergy)
  await enqueueSyncEvent({
    resourceType: 'AllergyIntolerance',
    resourceId: allergy.id,
    payload: allergy,
    hlcTimestamp: allergy._ultranos.hlcTimestamp,
  })
}

/**
 * Deactivate/resolve an allergy (edit-mode removal). Append-only: a NEW version row
 * is written with the updated clinicalStatus (Safety Rule #5) + enqueued for sync.
 */
export async function updateAllergyStatus(
  id: string,
  newStatus: 'active' | 'inactive' | 'resolved',
): Promise<void> {
  const existing = (await getDb().table('allergyIntolerances').get(id)) as
    | FhirAllergyIntolerance
    | undefined
  if (!existing) return

  const nowIso = new Date().toISOString()
  const hlcTimestamp = serializeHlc(hlc.now())
  const updated: FhirAllergyIntolerance = {
    ...existing,
    id: crypto.randomUUID(),
    clinicalStatus: { coding: [{ system: ALLERGY_CLINICAL_SYSTEM, code: newStatus }] },
    _ultranos: { ...existing._ultranos, hlcTimestamp },
    meta: { ...existing.meta, lastUpdated: nowIso },
  }
  await getDb().table('allergyIntolerances').put(updated)
  await enqueueSyncEvent({
    resourceType: 'AllergyIntolerance',
    resourceId: updated.id,
    payload: updated,
    hlcTimestamp,
  })
}

/** Load a patient's active allergies from the local store (edit-mode prefill). */
export async function loadPatientAllergies(
  patientId: string,
): Promise<FhirAllergyIntolerance[]> {
  try {
    const rows = (await getDb()
      .table('allergyIntolerances')
      .where('patient.reference')
      .equals(`Patient/${patientId}`)
      .toArray()) as FhirAllergyIntolerance[]
    return rows.filter((a) => a.clinicalStatus?.coding?.[0]?.code === 'active')
  } catch {
    return []
  }
}

/** Load a patient's vitals Observations from the local store (edit-mode prefill). */
export async function loadVitalsObservations(
  subjectReference: string,
): Promise<FhirObservation[]> {
  try {
    return (await getDb()
      .table('observations')
      .where('subject.reference')
      .equals(subjectReference)
      .toArray()) as FhirObservation[]
  } catch {
    return []
  }
}

/** Append vitals Observations locally + enqueue each for Hub sync. */
export async function saveObservations(observations: FhirObservation[]): Promise<void> {
  if (observations.length === 0) return
  await getDb().table('observations').bulkPut(observations)
  for (const o of observations) {
    await enqueueSyncEvent({
      resourceType: 'Observation',
      resourceId: o.id,
      payload: o,
      hlcTimestamp: o._ultranos.hlcTimestamp,
    })
  }
}
