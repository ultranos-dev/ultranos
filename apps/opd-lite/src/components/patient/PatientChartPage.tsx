'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import type { FhirPatient } from '@ultranos/shared-types'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { usePatientSync } from '@/hooks/usePatientSync'
import { Button } from '@/components/ui/Button'

// Composed sections
import { PatientBannerStack } from '@/components/patient/PatientBannerStack'
import { PatientHeaderCard } from '@/components/patient/PatientHeaderCard'
import { PatientEditModal } from '@/components/patient/PatientEditModal'
import { PatientDetailsAccordion } from '@/components/patient/PatientDetailsAccordion'
import { ActiveMedicationsList } from '@/components/patient/ActiveMedicationsList'
import { EncounterHistoryList } from '@/components/patient/EncounterHistoryList'
import { LabResultsList } from '@/components/clinical/LabResultsList'
import { LabResultDetail } from '@/components/clinical/LabResultDetail'
import type { LocalDiagnosticReport } from '@/lib/db'

interface PatientChartPageProps {
  patientId: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function PatientChartPage({ patientId }: PatientChartPageProps) {
  const router = useRouter()
  const [patient, setPatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsReauth, setNeedsReauth] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedLabReport, setSelectedLabReport] = useState<LocalDiagnosticReport | null>(null)

  usePatientSync(patientId)

  useEffect(() => {
    if (!UUID_REGEX.test(patientId)) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function loadPatient() {
      try {
        const p = await db.patients.get(patientId)
        if (!cancelled) {
          setPatient(p ?? null)
          if (p) {
            auditPhiAccess(
              AuditAction.READ,
              AuditResourceType.PATIENT,
              patientId,
              patientId,
              { phiAccess: 'patient_chart_view' },
            )
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof EncryptionKeyNotAvailableError) {
            setNeedsReauth(true)
          }
          setPatient(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
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
        <p className="font-semibold text-neutral-500">Loading patient chart...</p>
      </main>
    )
  }

  // Error states
  if (!patient) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        {needsReauth ? (
          <>
            <p className="font-semibold text-neutral-500">
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
            <p className="font-semibold text-neutral-500">Patient not found in local session.</p>
            <Button variant="ghost" onClick={() => router.push('/')} className="mt-4">
              Return to Patient Search
            </Button>
          </>
        )}
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-4">
      {/* Back navigation */}
      <Button variant="ghost" onClick={() => router.push('/')} aria-label="Back to search">
        &larr; Back to Search
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

      {/* Cross-encounter active medications */}
      <ActiveMedicationsList patientId={patientId} />

      {/* Encounter history with expandable detail */}
      <section aria-label="Encounter history">
        <h2 className="mb-3 text-lg font-bold text-neutral-900">Encounter History</h2>
        <EncounterHistoryList patientId={patientId} />
      </section>

      {/* Lab results */}
      <section
        className="rounded-xl bg-card-bg p-5 shadow-sm ring-[0.65px] ring-gray-400/40"
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
