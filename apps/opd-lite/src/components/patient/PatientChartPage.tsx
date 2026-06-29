'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import type { FhirPatient } from '@ultranos/shared-types'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { usePatientSync } from '@/hooks/usePatientSync'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import {
  normalizeFhirPatient,
  fetchPatientFromHub,
  UUID_REGEX,
} from '@/lib/patient-loader'
import { Button } from '@/components/ui/Button'

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
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
        <p className="font-semibold text-muted-foreground">{tPatient('loadingChart')}</p>
      </div>
    )
  }

  // Error states
  if (!patient) {
    return (
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
        {needsReauth ? (
          <>
            <p className="font-semibold text-muted-foreground">
              {tPatient('reauthRequired')}
            </p>
            <Button
              variant="primary"
              onClick={() => {
                const returnUrl = encodeURIComponent(window.location.pathname)
                window.location.href = `/login?returnUrl=${returnUrl}`
              }}
              className="mt-4"
            >
              {tPatient('signIn')}
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
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-4">
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
      <section aria-label={tPatient('encounterHistory')}>
        <h2 className="mb-3 text-lg font-bold text-foreground">{tPatient('encounterHistory')}</h2>
        <EncounterHistoryList patientId={patientId} />
      </section>

      {/* Lab results */}
      <section
        className="rounded-xl bg-card p-5 shadow-sm ring-[0.65px] ring-border/50"
        aria-label={tPatient('labResultsSection')}
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
    </div>
  )
}
