'use client'

/**
 * Lab-Lite host wrapper for the shared @ultranos/patient-kit registration/edit form
 * (the canonical OPD-Lite model). Full access, product decision 2026-09-28 — NOTHING
 * gated: lab renders the exact same full form as every other app (photo, identity,
 * demographics, national ID, contact, address, social, allergies, vitals, consent) and
 * uses the same clinician-facing patient.* / consent.* / patient-photo transports (lab
 * users now have full Hub access). Role-based access will be layered on later.
 */
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PatientRegistrationForm as KitPatientRegistrationForm } from '@ultranos/patient-kit/components/registration/patient-registration-form'
import type {
  PatientFormAdapter,
  PatientFormExternals,
} from '@ultranos/patient-kit'
import { VitalsForm } from '@ultranos/patient-kit/components/clinical/vitals-form'
import { mapVitalsToObservations, LOINC } from '@ultranos/patient-kit/lib/vitals-fhir-mapper'
import { getVitalRangeStatus, type VitalKey } from '@ultranos/patient-kit/lib/vitals-config'
import type { FhirObservation, FhirPatient } from '@ultranos/shared-types'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import { getHubApiUrl } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { putPatient, enqueueSyncEvent } from '@/lib/db'
import { hlc, hlcNow, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import {
  getPatientPhotoUrl,
  uploadPatientPhoto,
  removePatientPhoto,
  dataUrlToBlob,
} from '@/lib/patient-photo-api'
import {
  addAllergy,
  updateAllergyStatus as updateAllergyStatusStore,
  loadVitalsObservations,
  saveObservations,
} from '@/lib/patient-clinical-store'

export { diffAllergies } from '@ultranos/patient-kit/components/registration/patient-registration-form'
export type { RegistrationEditContext } from '@ultranos/patient-kit/components/registration/patient-registration-form'
import type { RegistrationEditContext } from '@ultranos/patient-kit/components/registration/patient-registration-form'

/**
 * Minimal raw tRPC mutation fetch (mirrors lab's makeTrpcProcedure) so we can call
 * arbitrary patient.* / consent.* paths — lab users now have full Hub access.
 */
async function rawMutate(path: string, input: Record<string, unknown>): Promise<unknown> {
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${getHubApiUrl()}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = (await res.json()) as { result?: { data?: { json?: unknown } } }
  return body?.result?.data?.json ?? null
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error) return /Hub API error/.test(err.message) === false && /fetch|network/i.test(err.message)
  return false
}

interface PatientRegistrationFormProps {
  prefilledNameGiven?: string
  editContext?: RegistrationEditContext
  onCancel?: () => void
}

export function PatientRegistrationForm(props: PatientRegistrationFormProps) {
  const router = useRouter()

  const adapter = useMemo<PatientFormAdapter>(() => ({
    checkDuplicates: (input) => rawMutate('patient.checkDuplicates', input) as Promise<never>,
    createPatient: (input) => rawMutate('patient.create', input) as Promise<never>,
    updatePatient: (input) => rawMutate('patient.update', input) as Promise<never>,
    recordConsent: async (input) => { await rawMutate('consent.recordAtPointOfCare', input) },
    isNetworkError,
    // Full access: lab stores the full FHIR patient locally (its `patients` table is untyped).
    savePatient: async (patient: FhirPatient) => { await putPatient(patient) },
    registerOffline: async (provisionalId, localPatient, syncPayload) => {
      await putPatient(localPatient)
      await enqueueSyncEvent({
        resourceType: 'Patient',
        resourceId: provisionalId,
        payload: syncPayload,
        hlcTimestamp: hlcNow(),
      })
    },
    uploadPhoto: async (patientId, dataUrl) => {
      await uploadPatientPhoto(patientId, dataUrlToBlob(dataUrl), new Date().toISOString())
    },
    saveObservations,
  }), [])

  const externals = useMemo<PatientFormExternals>(() => ({
    addAllergyToStore: addAllergy,
    updateAllergyStatus: (id, status) =>
      updateAllergyStatusStore(id, status as 'active' | 'inactive' | 'resolved'),
    auditPhiAccess: (action, resourceType, resourceId, patientId, metadata) => {
      try {
        void emitClientAudit({
          actorId: useAuthSessionStore.getState().session?.userId ?? 'unknown',
          actorRole: UserRole.LAB_TECH,
          action: action as AuditAction,
          resourceType: resourceType as AuditResourceType,
          resourceId,
          hlcTimestamp: serializeHlc(hlc.now()),
          metadata: { ...metadata, patientId, source: 'lab-lite' },
        })
      } catch { /* audit is best-effort client-side; Hub audits authoritatively */ }
    },
    hlc,
    serializeHlc: (t: unknown) => serializeHlc(t as Parameters<typeof serializeHlc>[0]),
    mapVitalsToObservations,
    LOINC,
    getVitalRangeStatus: (key, value) => getVitalRangeStatus(key as VitalKey, value),
    isEncryptionKeyError: (e) => e instanceof Error && /encryption key/i.test(e.message),
    loadVitalsObservations: (ref) => loadVitalsObservations(ref) as Promise<FhirObservation[]>,
    VitalsForm,
    photoApi: { getPatientPhotoUrl, uploadPatientPhoto, removePatientPhoto },
    navigate: (path: string) => router.push(path),
    navigateBack: () => router.back(),
  }), [router])

  // No `capabilities` prop → shared form defaults to fullFormCapabilities: lab renders
  // the exact same full form as OPD-Lite, every section functional, nothing gated.
  return (
    <KitPatientRegistrationForm {...props} adapter={adapter} externals={externals} />
  )
}
