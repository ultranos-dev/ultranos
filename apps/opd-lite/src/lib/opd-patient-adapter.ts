/**
 * OpdPatientAdapter — the single data seam for the patient registration/edit form
 * (Phase 1 / 2d). Bundles every data operation the form performs (Hub transport +
 * local Dexie persistence + offline registration + photo upload + vitals write) behind
 * one object. Today the form creates it internally; once the orchestrator moves into
 * @ultranos/patient-kit this becomes an injected prop, and pharmacy/lab supply their own
 * implementations (different transports / local stores) against the same shape.
 *
 * Build-inputs (FHIR patient/observations, payloads) are produced by the form from its
 * React state and passed in — the adapter is stateless, so it can live outside the
 * component and be swapped per app.
 */
import { db } from '@/lib/db'
import { registerPatientOffline } from '@/lib/offline-registration'
import { uploadPatientPhoto, dataUrlToBlob } from '@/lib/patient-photo-api'
import { enqueueSyncAction } from '@ultranos/sync-engine'
import { syncQueue } from '@/lib/sync-queue'
import type { FhirObservation, FhirPatient } from '@ultranos/shared-types'
import {
  checkDuplicates,
  createPatient,
  updatePatient,
  recordConsentPoc,
  isNetworkError,
  type CheckDuplicatesResult,
  type CreatePatientResult,
  type UpdatePatientResult,
} from '@/lib/opd-patient-network'

export type { CheckDuplicatesResult, CreatePatientResult, UpdatePatientResult }

export interface OpdPatientAdapter {
  // ── Hub transport ──
  checkDuplicates(input: Record<string, unknown>): Promise<CheckDuplicatesResult>
  createPatient(input: Record<string, unknown>): Promise<CreatePatientResult>
  updatePatient(input: Record<string, unknown>): Promise<UpdatePatientResult>
  recordConsent(input: Record<string, unknown>): Promise<void>
  isNetworkError(err: unknown): boolean
  // ── Local persistence / offline ──
  /** Upsert the patient into the local encrypted store (throws on missing key). */
  savePatient(patient: FhirPatient): Promise<void>
  /** Persist a provisional patient locally + enqueue the Hub syncCreate (offline path). */
  registerOffline(
    provisionalId: string,
    localPatient: FhirPatient,
    syncPayload: Record<string, unknown>,
    photoDataUrl: string | null,
  ): Promise<void>
  /** Upload a captured photo (data URL) for an existing patient (opaque-key, Rule #7). */
  uploadPhoto(patientId: string, dataUrl: string): Promise<void>
  /** Append patient-scoped vitals Observations locally + enqueue each for sync. */
  saveObservations(observations: FhirObservation[]): Promise<void>
}

export function createOpdPatientAdapter(): OpdPatientAdapter {
  return {
    checkDuplicates,
    createPatient,
    updatePatient,
    recordConsent: recordConsentPoc,
    isNetworkError,

    async savePatient(patient) {
      await db.patients.put(patient as never)
    },

    async registerOffline(provisionalId, localPatient, syncPayload, photoDataUrl) {
      await registerPatientOffline(
        provisionalId,
        localPatient as never,
        syncPayload,
        photoDataUrl,
      )
    },

    async uploadPhoto(patientId, dataUrl) {
      const blob = dataUrlToBlob(dataUrl)
      await uploadPatientPhoto(patientId, blob, new Date().toISOString())
    },

    async saveObservations(observations) {
      await db.observations.bulkAdd(observations as never)
      for (const o of observations) {
        void enqueueSyncAction(syncQueue, {
          resourceType: 'Observation',
          resourceId: o.id,
          action: 'create',
          payload: o as unknown as Record<string, unknown>,
          hlcTimestamp: o._ultranos.hlcTimestamp,
        })
      }
    },
  }
}
