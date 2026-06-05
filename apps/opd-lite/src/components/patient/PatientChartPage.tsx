'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import type { FhirPatient, PatientAddress } from '@ultranos/shared-types'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { usePatientSync } from '@/hooks/usePatientSync'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

const HUB_API_URL =
  process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000'

// Composed sections
import { PatientBannerStack } from '@/components/patient/PatientBannerStack'
import { PatientHeaderCard } from '@/components/patient/PatientHeaderCard'
import { PatientEditModal } from '@/components/patient/PatientEditModal'
import { PatientDetailsAccordion } from '@/components/patient/PatientDetailsAccordion'
import { PatientAuditTrail } from '@/components/patient/PatientAuditTrail'
import { ActiveMedicationsList } from '@/components/patient/ActiveMedicationsList'
import { EncounterHistoryList } from '@/components/patient/EncounterHistoryList'
import { LabResultsList } from '@/components/clinical/LabResultsList'
import { LabResultDetail } from '@/components/clinical/LabResultDetail'
import type { LocalDiagnosticReport } from '@/lib/db'

interface PatientChartPageProps {
  patientId: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normalize a Dexie patient record into a proper FhirPatient shape.
 *
 * The sync pull may have stored the patient as a flat camelCase object
 * (matching the Postgres row layout) rather than the nested FhirPatient
 * structure that UI components expect. This function reconstructs the
 * nested `_ultranos` block from flat fields when needed.
 */
function normalizeFhirPatient(raw: Record<string, unknown>): FhirPatient {
  // Check if already in the correct nested shape WITH complete data.
  // The patient.getById endpoint may return a partial _ultranos (only isActive,
  // createdAt, etc.) while key fields like addressOrigin, nameGiven are at the
  // top level. We detect this by checking for a key field that should be in _ultranos.
  const ext = raw._ultranos as Record<string, unknown> | undefined
  if (ext && typeof ext === 'object' && 'nameLocal' in ext && 'isNomadic' in ext) {
    return raw as unknown as FhirPatient
  }

  // Reconstruct from flat Hub row (or hybrid format with partial _ultranos)
  // Merge: prefer values from existing _ultranos, then fall back to top-level fields
  const existingExt = (ext ?? {}) as Record<string, unknown>
  const phone = (raw.telecomPhone as string) || (existingExt.telecomPhone as string) || undefined
  return {
    id: raw.id as string,
    resourceType: 'Patient',
    name: (raw.name as FhirPatient['name']) ?? [
      {
        given: (raw.nameGiven as string) ? [raw.nameGiven as string] : [],
        text: (raw.nameLocal as string) ?? (existingExt.nameLocal as string) ?? '',
      },
    ],
    gender: (raw.gender as FhirPatient['gender']),
    birthDate: (raw.birthDate as string) || undefined,
    birthYearOnly: (raw.birthYearOnly as boolean) ?? true,
    telecom: phone
      ? [{ system: 'phone' as const, value: phone }]
      : (raw.telecom as FhirPatient['telecom']) ?? [],
    _ultranos: {
      nameLocal: (existingExt.nameLocal as string) ?? (raw.nameLocalEnc as string) ?? (raw.nameLocal as string) ?? '',
      nameLatin: (existingExt.nameLatin as string) ?? (raw.nameLatinEnc as string) ?? (raw.nameLatin as string) ?? undefined,
      namePhonetic: (existingExt.namePhonetic as string) ?? (raw.namePhoneticEnc as string) ?? (raw.namePhonetic as string) ?? undefined,
      nationalIdHash: (existingExt.nationalIdHash as string) ?? (raw.nationalIdHash as string) ?? undefined,
      guardianId: (existingExt.guardianId as string) ?? (raw.guardianId as string) ?? undefined,
      consentVersion: (existingExt.consentVersion as string) ?? (raw.consentVersion as string) ?? undefined,
      patient_tier: ((existingExt.patient_tier as string) ?? (raw.patientTier as string) ?? 'FREE') as 'FREE' | 'PREMIUM',
      preferredLanguage: (existingExt.preferredLanguage as string) ?? (raw.preferredLanguage as string) ?? undefined,
      isActive: (existingExt.isActive as boolean) ?? (raw.isActive as boolean) ?? true,
      createdBy: (existingExt.createdBy as string) ?? (raw.createdBy as string) ?? undefined,
      createdAt: (existingExt.createdAt as string) ?? (raw.createdAt as string) ?? new Date().toISOString(),
      nameGiven: (existingExt.nameGiven as string) ?? (raw.nameGivenEnc as string) ?? (raw.nameGiven as string) ?? undefined,
      nameFather: (existingExt.nameFather as string) ?? (raw.nameFatherEnc as string) ?? (raw.nameFather as string) ?? undefined,
      nameGrandfather: (existingExt.nameGrandfather as string) ?? (raw.nameGrandfatherEnc as string) ?? (raw.nameGrandfather as string) ?? undefined,
      birthYear: (existingExt.birthYear as number) ?? (raw.birthYear as number) ?? undefined,
      addressOrigin: (existingExt.addressOrigin as PatientAddress | undefined)
        // Flat keys from patient.list/search responses cached in _ultranos
        ?? ((existingExt.addressProvinceOrigin as string)
          ? {
              province: existingExt.addressProvinceOrigin as PatientAddress['province'],
              district: (existingExt.addressDistrictOrigin as string) ?? '',
              village: (existingExt.addressVillageOrigin as string) || undefined,
            }
          : undefined)
        // Flat keys at top level from raw Hub row
        ?? (raw.addressProvinceOrigin
          ? {
              province: raw.addressProvinceOrigin as PatientAddress['province'],
              district: (raw.addressDistrictOrigin as string) ?? '',
              village: (raw.addressVillageOrigin as string) || undefined,
            }
          : undefined),
      addressCurrent: (existingExt.addressCurrent as PatientAddress | undefined)
        ?? ((existingExt.addressProvinceCurrent as string)
          ? {
              province: existingExt.addressProvinceCurrent as PatientAddress['province'],
              district: (existingExt.addressDistrictCurrent as string) ?? '',
              village: (existingExt.addressVillageCurrent as string) || undefined,
            }
          : undefined)
        ?? (raw.addressProvinceCurrent
          ? {
              province: raw.addressProvinceCurrent as PatientAddress['province'],
              district: (raw.addressDistrictCurrent as string) ?? '',
              village: (raw.addressVillageCurrent as string) || undefined,
            }
          : undefined),
      isNomadic: (existingExt.isNomadic as boolean) ?? (raw.isNomadic as boolean) ?? false,
      biometricFingerprintHash: (existingExt.biometricFingerprintHash as string) ?? (raw.biometricFingerprintHash as string) ?? undefined,
      biometricAlgorithmVersion: (existingExt.biometricAlgorithmVersion as string) ?? (raw.biometricAlgorithmVersion as string) ?? undefined,
      mpiScore: (existingExt.mpiScore as number) ?? (raw.mpiScore as number) ?? undefined,
      identifiers: (existingExt.identifiers as FhirPatient['_ultranos']['identifiers']) ?? (raw.identifiers as FhirPatient['_ultranos']['identifiers']) ?? undefined,
      photoUrl: (existingExt.photoUrl as string) ?? (raw.photoUrl as string) ?? undefined,
      bloodGroup: (existingExt.bloodGroup as string) ?? (raw.bloodGroup as string) ?? undefined,
      updatedByName: (existingExt.updatedByName as string) ?? undefined,
      updatedByRole: (existingExt.updatedByRole as string) ?? undefined,
    },
    meta: raw.meta as FhirPatient['meta'] ?? {
      lastUpdated: (raw.updatedAt as string) ?? new Date().toISOString(),
      versionId: (raw.metaVersionId as string) ?? undefined,
    },
  }
}

/**
 * Fetch a patient from the Hub API (patient.getById) and cache in Dexie.
 * Used as a fallback when the patient isn't available in local IndexedDB
 * (e.g. after sign-out/sign-in, since the sync pull for Patient resources
 * is broken — the patients table is missing an hlc_timestamp column).
 */
async function fetchPatientFromHub(
  patientId: string,
): Promise<FhirPatient | null> {
  try {
    const supabase = getSupabaseBrowserClient()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return null

    const params = encodeURIComponent(
      JSON.stringify({ json: { patientId } }),
    )
    const res = await fetch(
      `${HUB_API_URL}/api/trpc/patient.read?input=${params}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    if (!res.ok) {
      console.warn('[fetchPatientFromHub] patient.read failed:', { status: res.status })
      return null
    }

    const data = await res.json() as {
      result: { data: { json: Record<string, unknown> } }
    }
    const raw = data.result?.data?.json
    if (!raw) return null

    const patient = normalizeFhirPatient(raw)

    // Cache in Dexie so subsequent reads don't hit the Hub
    try {
      await db.patients.put(patient)
    } catch {
      // Non-critical — patient loaded in memory even if cache fails
    }

    return patient
  } catch {
    return null
  }
}

export function PatientChartPage({ patientId }: PatientChartPageProps) {
  const tPatient = useTranslations('patient')
  const tNav = useTranslations('nav')
  const router = useRouter()
  const [patient, setPatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsReauth, setNeedsReauth] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedLabReport, setSelectedLabReport] = useState<LocalDiagnosticReport | null>(null)
  const [userRole, setUserRole] = useState<string>('DOCTOR')

  useEffect(() => {
    async function loadRole() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        const role = (data.session?.user?.app_metadata?.role as string) ?? 'DOCTOR'
        setUserRole(role)
      } catch {
        // Default role is fine
      }
    }
    loadRole()
  }, [])

  usePatientSync(patientId)

  useEffect(() => {
    if (!UUID_REGEX.test(patientId)) {
      setLoading(false)
      return
    }
    let cancelled = false

    async function loadPatient() {
      // Step 1: Try local Dexie for instant display
      let hasLocalData = false
      try {
        const raw = await db.patients.get(patientId)
        if (!cancelled && raw) {
          const p = normalizeFhirPatient(raw as unknown as Record<string, unknown>)
          setPatient(p)
          setLoading(false)
          hasLocalData = true
          auditPhiAccess(
            AuditAction.READ,
            AuditResourceType.PATIENT,
            patientId,
            patientId,
            { phiAccess: 'patient_chart_view' },
          )
        }
      } catch (err) {
        if (!cancelled && err instanceof EncryptionKeyNotAvailableError) {
          setNeedsReauth(true)
          setLoading(false)
          return
        }
        // Other Dexie errors — fall through to Hub fetch
      }

      // Step 2: Always fetch the full record from Hub API.
      // Dexie may only have partial data from patient.list/search (missing
      // address_current, village, phone, blood_group, etc.). The Hub
      // patient.read endpoint returns the complete FHIR-aligned patient.
      if (!cancelled) {
        const hubPatient = await fetchPatientFromHub(patientId)
        if (!cancelled && hubPatient) {
          setPatient(hubPatient)
          if (!hasLocalData) {
            auditPhiAccess(
              AuditAction.READ,
              AuditResourceType.PATIENT,
              patientId,
              patientId,
              { phiAccess: 'patient_chart_view_hub_fallback' },
            )
          }
        }
      }

      if (!cancelled) setLoading(false)
    }

    loadPatient()
    return () => { cancelled = true }
  }, [patientId])

  const handlePatientUpdated = useCallback((updated: FhirPatient) => {
    setPatient(updated)
  }, [])

  // Loading state
  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="font-semibold text-muted-foreground">{tPatient('loadingChart')}</p>
      </main>
    )
  }

  // Error states
  if (!patient) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        {needsReauth ? (
          <>
            <p className="font-semibold text-muted-foreground">
              Session encryption key unavailable — please sign in again to access patient data.
            </p>
            <Button
              variant="primary"
              onClick={() => {
                const returnUrl = encodeURIComponent(window.location.pathname)
                window.location.href = `/login?returnUrl=${returnUrl}`
              }}
              className="mt-4"
            >
              Sign In
            </Button>
          </>
        ) : (
          <>
            <p className="font-semibold text-muted-foreground">{tPatient('notFound')}</p>
            <Button variant="ghost" onClick={() => router.push('/')} className="mt-4">
              {tNav('returnToSearch')}
            </Button>
          </>
        )}
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-4">
      {/* Back navigation */}
      <Button variant="ghost" onClick={() => router.push('/')} aria-label={tNav('backToSearch')}>
        {tNav('backToSearch')}
      </Button>

      {/* Safety banners — CLAUDE.md Rule #4: allergies first, never collapsed */}
      <PatientBannerStack patient={patient} patientId={patientId} />

      {/* Patient identity header with avatar, vitals, actions */}
      <PatientHeaderCard
        patient={patient}
        patientId={patientId}
        onEditClick={() => setEditModalOpen(true)}
        onPatientUpdated={handlePatientUpdated}
      />

      {/* Collapsible demographics and identity details */}
      <PatientDetailsAccordion patient={patient} />

      {/* Audit trail — who modified this record */}
      <PatientAuditTrail patientId={patientId} userRole={userRole} />

      {/* Cross-encounter active medications */}
      <ActiveMedicationsList patientId={patientId} />

      {/* Encounter history with expandable detail */}
      <section aria-label="Encounter history">
        <h2 className="mb-3 text-lg font-bold text-foreground">Encounter History</h2>
        <EncounterHistoryList patientId={patientId} />
      </section>

      {/* Lab results */}
      <section
        className="rounded-xl bg-card p-5 shadow-sm ring-[0.65px] ring-border/50"
        aria-label="Lab results"
      >
        {selectedLabReport ? (
          <LabResultDetail
            report={selectedLabReport}
            onBack={() => setSelectedLabReport(null)}
          />
        ) : (
          <LabResultsList
            patientId={patientId}
            onSelectReport={setSelectedLabReport}
          />
        )}
      </section>

      {/* Edit profile modal */}
      <PatientEditModal
        open={editModalOpen}
        patient={patient}
        patientId={patientId}
        onClose={() => setEditModalOpen(false)}
        onSaved={handlePatientUpdated}
      />
    </main>
  )
}
