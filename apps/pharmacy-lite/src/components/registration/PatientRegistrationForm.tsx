'use client'

/**
 * Pharmacy-Lite host wrapper for the shared @ultranos/patient-kit registration/edit form
 * (the canonical OPD-Lite model). Supplies pharmacy's data adapter + host externals +
 * a capability config for the sections pharmacy's infra supports today
 * (identity/demographics/nationalId/contact/address/social/consent). Photo, vitals, and
 * allergies are gated off until pharmacy grows that infra (follow-up).
 *
 * Offline-first without data loss: the local cache stores pharmacy's reduced LocalPatient
 * projection, but the FULL create payload is enqueued to the Hub (syncCreate), so no
 * captured field is lost on the offline path.
 */
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PatientRegistrationForm as KitPatientRegistrationForm } from '@ultranos/patient-kit/components/registration/patient-registration-form'
import type {
  PatientFormAdapter,
  PatientFormExternals,
  PatientFormCapabilities,
} from '@ultranos/patient-kit'
import type { FhirPatient } from '@ultranos/shared-types'
import { db, type LocalPatient } from '@/lib/db'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { hlc, hlcNow, serializeHlc } from '@/lib/hlc'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export { diffAllergies } from '@ultranos/patient-kit/components/registration/patient-registration-form'
export type { RegistrationEditContext } from '@ultranos/patient-kit/components/registration/patient-registration-form'
import type { RegistrationEditContext } from '@ultranos/patient-kit/components/registration/patient-registration-form'

// ── Hub transport (pharmacy auth) ────────────────────────────────────────────
function getHubApiUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  const token = data.session?.access_token
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}
async function postJson<T>(procedure: string, input: Record<string, unknown>): Promise<T> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + procedure
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = (await res.json()) as { result: { data: { json: T } } }
  return body.result.data.json
}

/** FhirPatient → pharmacy's reduced local cache row (Hub keeps the full record). */
function toPharmacyLocal(p: FhirPatient): LocalPatient {
  const ext = (p._ultranos ?? {}) as Record<string, unknown>
  return {
    id: p.id,
    nameGiven: (ext.nameGiven as string) ?? p.name?.[0]?.given?.[0] ?? '',
    nameFather: (ext.nameFather as string) || undefined,
    gender: (p.gender as LocalPatient['gender']) ?? 'unknown',
    birthYear: ext.birthYear as number | undefined,
    birthDate: (p.birthDate as string) || undefined,
    phone: p.telecom?.find((t) => t.system === 'phone')?.value || undefined,
    preferredLanguage: ext.preferredLanguage as string | undefined,
    allergies: undefined,
    createdAt: (ext.createdAt as string) ?? new Date().toISOString(),
    source: 'registered',
  }
}

/** Pharmacy captures the demographic profile; no photo/vitals/allergy infra yet. */
const PHARMACY_CAPABILITIES: PatientFormCapabilities = {
  sections: {
    photo: 'hidden',
    identity: 'edit',
    demographics: 'edit',
    nationalId: 'edit',
    contact: 'edit',
    address: 'edit',
    social: 'edit',
    allergies: 'hidden',
    vitals: 'hidden',
    consent: 'edit',
  },
  runDuplicateCheck: true,
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
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
    checkDuplicates: (input) => postJson('patient.checkDuplicates', input),
    createPatient: (input) => postJson('patient.create', input),
    updatePatient: (input) => postJson('patient.update', input),
    recordConsent: async (input) => { await postJson('consent.recordAtPointOfCare', input) },
    isNetworkError,
    savePatient: async (patient) => { await db.patients.put(toPharmacyLocal(patient)) },
    registerOffline: async (provisionalId, localPatient, syncPayload) => {
      // Local cache = reduced projection; Hub gets the FULL payload via syncCreate.
      await db.patients.put(toPharmacyLocal(localPatient))
      await enqueuePharmacySyncEntry({
        resourceType: 'Patient',
        resourceId: provisionalId,
        action: 'create',
        payload: syncPayload,
        hlcTimestamp: hlcNow(),
        createdAt: new Date().toISOString(),
      })
    },
    // Photo/vitals sections are gated off for pharmacy → these are never invoked.
    uploadPhoto: async () => {},
    saveObservations: async () => {},
  }), [])

  const externals = useMemo<PatientFormExternals>(() => ({
    addAllergyToStore: () => {},
    updateAllergyStatus: () => {},
    auditPhiAccess: (action, resourceType, resourceId, patientId, metadata) =>
      auditPhiAccess(
        useAuthSessionStore.getState().session?.userId ?? 'unknown',
        action as AuditAction,
        resourceType as AuditResourceType,
        resourceId,
        patientId,
        metadata,
      ),
    hlc,
    serializeHlc: (t: unknown) => serializeHlc(t as Parameters<typeof serializeHlc>[0]),
    mapVitalsToObservations: () => [],
    LOINC: {},
    getVitalRangeStatus: () => 'normal',
    isEncryptionKeyError: (e) => e instanceof EncryptionKeyNotAvailableError,
    loadVitalsObservations: async () => [],
    VitalsForm: () => null,
    photoApi: {
      getPatientPhotoUrl: async () => null,
      uploadPatientPhoto: async () => ({ photoUrl: '', lastUpdated: '' }),
      removePatientPhoto: async () => ({ lastUpdated: '' }),
    },
    navigate: (path: string) => router.push(path),
    navigateBack: () => router.back(),
  }), [router])

  return (
    <KitPatientRegistrationForm
      {...props}
      adapter={adapter}
      externals={externals}
      capabilities={PHARMACY_CAPABILITIES}
    />
  )
}
