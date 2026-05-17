'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/db'
import type { FhirPatient } from '@ultranos/shared-types'
import type { LocalDiagnosticReport } from '@/lib/db'
import { AllergyBanner } from '@/components/clinical/AllergyBanner'
import { EncounterHistoryList } from '@/components/patient/EncounterHistoryList'
import { LabResultsList } from '@/components/clinical/LabResultsList'
import { LabResultDetail } from '@/components/clinical/LabResultDetail'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { fetchDiagnosticReportsForPatient } from '@/lib/trpc'

interface PatientChartPageProps {
  patientId: string
}

function formatAge(birthDate?: string): string {
  if (!birthDate) return 'Unknown age'
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return `${age}y`
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function PatientChartPage({ patientId }: PatientChartPageProps) {
  const router = useRouter()
  const [patient, setPatient] = useState<FhirPatient | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLabReport, setSelectedLabReport] = useState<LocalDiagnosticReport | null>(null)

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
            // Story 20.5: Background fetch of lab results from Hub
            fetchDiagnosticReportsForPatient(patientId)
          }
        }
      } catch {
        if (!cancelled) setPatient(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadPatient()
    return () => { cancelled = true }
  }, [patientId])

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="font-semibold text-neutral-500">Loading patient chart...</p>
      </main>
    )
  }

  if (!patient) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="font-semibold text-neutral-500">Patient not found in local session.</p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 font-semibold text-primary-500 underline"
        >
          Return to Patient Search
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* CLAUDE.md Rule #4: Allergy banner renders FIRST, in red, never collapsed */}
      <AllergyBanner patientId={patientId} />

      <header className="mb-8">
        <button
          onClick={() => router.push('/')}
          className="mb-4 text-sm font-semibold text-primary-500 hover:underline"
          aria-label="Back to search"
        >
          &larr; Back to Search
        </button>
        <h1 className="text-3xl font-black tracking-tight text-neutral-900">
          Patient Chart
        </h1>
      </header>

      <section
        className="rounded-lg border border-neutral-200 bg-white p-6"
        aria-label="Patient information"
      >
        <h2 className="text-xl font-bold text-neutral-900">
          {patient._ultranos?.nameLocal}
        </h2>
        {patient._ultranos?.nameLatin && (
          <p className="text-sm font-semibold text-neutral-500">
            {patient._ultranos.nameLatin}
          </p>
        )}
        <div className="mt-3 flex gap-4 text-sm font-semibold text-neutral-600">
          <span>ID: {patient.id.slice(0, 8)}...</span>
          <span>{patient.gender ?? 'Unknown'}</span>
          <span>{formatAge(patient.birthDate)}</span>
        </div>
      </section>

      <div className="mt-6 flex justify-end">
        <Link
          href={`/encounter/${patientId}`}
          className="rounded-md bg-green-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700"
          aria-label="Start New Encounter"
        >
          Start New Encounter
        </Link>
      </div>

      <section className="mt-6" aria-label="Encounter history">
        <h2 className="mb-4 text-xl font-bold text-neutral-900">Encounter History</h2>
        <EncounterHistoryList patientId={patientId} />
      </section>

      {/* Lab Results — Story 20.5 */}
      <section
        className="mt-6 rounded-lg border border-neutral-200 bg-white p-6"
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
    </main>
  )
}
