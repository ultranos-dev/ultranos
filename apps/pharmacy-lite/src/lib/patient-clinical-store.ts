'use client'

/**
 * Pharmacy-Lite patient clinical persistence for the shared registration/edit form
 * (parity with OPD-Lite — nothing gated). Persists allergies (Tier-1 append-only) and
 * vitals Observations to the local encrypted Dexie store and enqueues each for Hub sync.
 * Mirrors OPD-Lite's allergy-store + adapter.saveObservations semantics.
 */
import type { FhirAllergyIntolerance, FhirObservation } from '@ultranos/shared-types'
import { db } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { hlc, serializeHlc } from '@/lib/hlc'

const ALLERGY_CLINICAL_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical' as const

function actorId(): string {
  return useAuthSessionStore.getState().session?.userId ?? 'unknown'
}

/** Persist a newly-captured allergy locally (append-only) + enqueue Hub sync. */
export async function addAllergy(allergy: FhirAllergyIntolerance): Promise<void> {
  await db.allergyIntolerances.put(allergy)
  await enqueuePharmacySyncEntry({
    resourceType: 'AllergyIntolerance',
    resourceId: allergy.id,
    action: 'create',
    payload: allergy as unknown as Record<string, unknown>,
    hlcTimestamp: allergy._ultranos.hlcTimestamp,
    createdAt: new Date().toISOString(),
  })
  const patientId = allergy.patient.reference.replace('Patient/', '')
  auditPhiAccess(
    actorId(),
    AuditAction.CREATE,
    AuditResourceType.ALLERGY,
    allergy.id,
    patientId,
    { phiAccess: 'allergy_create' },
  )
}

/**
 * Deactivate/resolve an allergy (edit-mode removal). Append-only: a NEW version row is
 * written with the updated clinicalStatus (Safety Rule #5 — the record is never mutated
 * in place) + enqueued for sync. Mirrors OPD-Lite's updateAllergyStatus.
 */
export async function updateAllergyStatus(
  id: string,
  newStatus: 'active' | 'inactive' | 'resolved',
): Promise<void> {
  const existing = await db.allergyIntolerances.get(id)
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

  await db.allergyIntolerances.put(updated)
  await enqueuePharmacySyncEntry({
    resourceType: 'AllergyIntolerance',
    resourceId: updated.id,
    action: 'update',
    payload: updated as unknown as Record<string, unknown>,
    hlcTimestamp,
    createdAt: nowIso,
  })
  const patientId = existing.patient.reference.replace('Patient/', '')
  auditPhiAccess(
    actorId(),
    AuditAction.UPDATE,
    AuditResourceType.ALLERGY,
    id,
    patientId,
    { phiAccess: 'allergy_update' },
  )
}

/** Load a patient's active allergies from the local store (edit-mode prefill). */
export async function loadPatientAllergies(
  patientId: string,
): Promise<FhirAllergyIntolerance[]> {
  try {
    const rows = await db.allergyIntolerances
      .where('patient.reference')
      .equals(`Patient/${patientId}`)
      .toArray()
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
    return await db.observations
      .where('subject.reference')
      .equals(subjectReference)
      .toArray()
  } catch {
    return []
  }
}

/** Append vitals Observations locally + enqueue each for Hub sync. */
export async function saveObservations(observations: FhirObservation[]): Promise<void> {
  if (observations.length === 0) return
  await db.observations.bulkPut(observations)
  for (const o of observations) {
    await enqueuePharmacySyncEntry({
      resourceType: 'Observation',
      resourceId: o.id,
      action: 'create',
      payload: o as unknown as Record<string, unknown>,
      hlcTimestamp: o._ultranos.hlcTimestamp,
      createdAt: new Date().toISOString(),
    })
  }
}
