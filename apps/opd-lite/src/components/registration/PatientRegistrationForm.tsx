'use client'

/**
 * OPD-Lite host wrapper for the shared @ultranos/patient-kit registration/edit form.
 * The form itself (UI + orchestration) lives in patient-kit; this thin wrapper supplies
 * OPD-Lite's data adapter + host externals (clinical vitals subsystem, allergy store,
 * HLC, audit, encryption-key predicate, photo transport). Pharmacy/Lab will provide their
 * own wrappers against the same shape — opd-lite is the canonical implementation.
 */
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PatientRegistrationForm as KitPatientRegistrationForm } from '@ultranos/patient-kit/components/registration/patient-registration-form'
import type { PatientFormExternals } from '@ultranos/patient-kit'
import type { FhirObservation } from '@ultranos/shared-types'
import { createOpdPatientAdapter } from '@/lib/opd-patient-adapter'
import { useAllergyStore } from '@/stores/allergy-store'
import { VitalsForm } from '@/components/clinical/vitals-form'
import { hlc, serializeHlc } from '@/lib/hlc'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { mapVitalsToObservations, LOINC } from '@/lib/vitals-fhir-mapper'
import { getVitalRangeStatus, type VitalKey } from '@/lib/vitals-config'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import { uploadPatientPhoto, removePatientPhoto, getPatientPhotoUrl } from '@/lib/patient-photo-api'
import { db } from '@/lib/db'

// Re-export the form's contract so existing OPD-Lite consumers/tests are unchanged.
export { diffAllergies } from '@ultranos/patient-kit/components/registration/patient-registration-form'
export type { RegistrationEditContext } from '@ultranos/patient-kit/components/registration/patient-registration-form'

import type { RegistrationEditContext } from '@ultranos/patient-kit/components/registration/patient-registration-form'

interface PatientRegistrationFormProps {
  prefilledNameGiven?: string
  editContext?: RegistrationEditContext
  onCancel?: () => void
}

export function PatientRegistrationForm(props: PatientRegistrationFormProps) {
  const router = useRouter()
  const addAllergyToStore = useAllergyStore((s) => s.addAllergy)
  const updateAllergyStatus = useAllergyStore((s) => s.updateAllergyStatus)
  const adapter = useMemo(() => createOpdPatientAdapter(), [])
  const externals = useMemo<PatientFormExternals>(
    () => ({
      addAllergyToStore,
      // Thin adapters where OPD-Lite's concrete (enum/branded) signatures are narrower
      // than the host-agnostic externals contract.
      updateAllergyStatus: (id: string, status: string) =>
        updateAllergyStatus(id, status as 'active' | 'inactive' | 'resolved'),
      auditPhiAccess: (action, resourceType, resourceId, patientId, metadata) =>
        auditPhiAccess(action as AuditAction, resourceType as AuditResourceType, resourceId, patientId, metadata),
      hlc,
      serializeHlc: (t: unknown) => serializeHlc(t as Parameters<typeof serializeHlc>[0]),
      mapVitalsToObservations,
      LOINC,
      getVitalRangeStatus: (key, value) => getVitalRangeStatus(key as VitalKey, value),
      isEncryptionKeyError: (e) => e instanceof EncryptionKeyNotAvailableError,
      loadVitalsObservations: (ref) =>
        db.observations.where('subject.reference').equals(ref).toArray() as Promise<FhirObservation[]>,
      VitalsForm,
      photoApi: { getPatientPhotoUrl, uploadPatientPhoto, removePatientPhoto },
      navigate: (path: string) => router.push(path),
      navigateBack: () => router.back(),
    }),
    [addAllergyToStore, updateAllergyStatus, router],
  )

  return <KitPatientRegistrationForm {...props} adapter={adapter} externals={externals} />
}
