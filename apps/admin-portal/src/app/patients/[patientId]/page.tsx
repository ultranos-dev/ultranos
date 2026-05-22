'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { ConsentTimeline } from '@/components/patients/ConsentTimeline'

interface PatientDetail {
  id: string
  name_given: string | null
  name_father: string | null
  name_grandfather: string | null
  gender: string | null
  birth_year: number | null
  address_district_origin: string | null
  address_province_origin: string | null
  mpi_score: number | null
  mpi_warn: boolean | null
  patient_tier: string | null
  is_active: boolean
  created_at: string | null
}

function MpiWarnBadge({ warn }: { warn: boolean | null }) {
  if (!warn) {
    return (
      <span className="inline-block rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success">
        Clear
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full bg-warning-subtle px-2.5 py-0.5 text-xs font-medium text-warning">
      Warning
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-block rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success">
        Active
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full bg-danger-subtle px-2.5 py-0.5 text-xs font-medium text-danger">
      Inactive
    </span>
  )
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function DetailRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-text-secondary">{label}</dt>
      <dd className="mt-1 text-sm text-text-primary">{value}</dd>
    </div>
  )
}

export default function PatientDetailPage() {
  const params = useParams()
  const patientId = params.patientId as string

  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPatient = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.patientAdmin.getById.query({ patientId })
      setPatient(result.patient as PatientDetail)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load patient')
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    fetchPatient()
  }, [fetchPatient])

  function formatName(p: PatientDetail): string {
    return [p.name_given, p.name_father].filter(Boolean).join(' ') || 'Unknown'
  }

  if (loading) {
    return <div className="text-text-secondary p-8">Loading patient details...</div>
  }

  if (error && !patient) {
    return (
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/patients" className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Patients</Link>
        <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
      </div>
    )
  }

  if (!patient) return null

  return (
    <>
      <TopHeader title={formatName(patient)} description={`Patient ID: ${patient.id}`} />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/patients" className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Patients</Link>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Demographics card */}
          <div className="rounded-3xl bg-white p-5 border border-border">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              <span className="wavy-divider">Demographics</span>
            </h2>
            <div className="mt-4 space-y-4">
              <DetailRow label="Name Given" value={patient.name_given ?? '-'} />
              <DetailRow label="Name Father" value={patient.name_father ?? '-'} />
              <DetailRow label="Name Grandfather" value={patient.name_grandfather ?? '-'} />
              <DetailRow label="Gender" value={patient.gender ?? '-'} />
              <DetailRow label="Birth Year" value={patient.birth_year != null ? String(patient.birth_year) : '-'} />
              <DetailRow label="District Origin" value={patient.address_district_origin ?? '-'} />
              <DetailRow label="Province Origin" value={patient.address_province_origin ?? '-'} />
            </div>
          </div>

          {/* MPI & Status card */}
          <div className="rounded-3xl bg-white p-5 border border-border">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              <span className="wavy-divider">MPI &amp; Status</span>
            </h2>
            <div className="mt-4 space-y-4">
              <DetailRow
                label="MPI Score"
                value={patient.mpi_score != null ? String(patient.mpi_score) : '-'}
              />
              <div>
                <dt className="text-sm font-medium text-text-secondary">MPI Warn</dt>
                <dd className="mt-1"><MpiWarnBadge warn={patient.mpi_warn} /></dd>
              </div>
              <DetailRow label="Patient Tier" value={patient.patient_tier ?? '-'} />
              <div>
                <dt className="text-sm font-medium text-text-secondary">Status</dt>
                <dd className="mt-1"><StatusBadge active={patient.is_active} /></dd>
              </div>
              <DetailRow label="Created At" value={formatDateTime(patient.created_at)} />
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-border">
              <Link
                href={`/patients/merge?survivor=${patient.id}`}
                className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
              >
                Merge with Another Patient
              </Link>
            </div>
          </div>
        </div>

        {/* Consent Timeline section */}
        <div className="mt-6">
          <ConsentTimeline patientId={patient.id} />
        </div>
      </div>
    </>
  )
}
