'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { ConsentTimeline } from '@/components/patients/ConsentTimeline'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  if (!warn) return <Badge variant="success">Clear</Badge>
  return <Badge variant="warning">Warning</Badge>
}

function StatusBadge({ active }: { active: boolean }) {
  if (active) return <Badge variant="success">Active</Badge>
  return <Badge variant="destructive">Inactive</Badge>
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
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
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
    return <div className="text-muted-foreground p-8">Loading patient details...</div>
  }

  if (error && !patient) {
    return (
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/patients" className="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Back to Patients</Link>
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!patient) return null

  return (
    <>
      <TopHeader title={formatName(patient)} description={`Patient ID: ${patient.id}`} />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Link href="/patients" className="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Back to Patients</Link>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Demographics card */}
          <div className="rounded-3xl bg-white p-5 border border-border">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
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
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              <span className="wavy-divider">MPI &amp; Status</span>
            </h2>
            <div className="mt-4 space-y-4">
              <DetailRow
                label="MPI Score"
                value={patient.mpi_score != null ? String(patient.mpi_score) : '-'}
              />
              <div>
                <dt className="text-sm font-medium text-muted-foreground">MPI Warn</dt>
                <dd className="mt-1"><MpiWarnBadge warn={patient.mpi_warn} /></dd>
              </div>
              <DetailRow label="Patient Tier" value={patient.patient_tier ?? '-'} />
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                <dd className="mt-1"><StatusBadge active={patient.is_active} /></dd>
              </div>
              <DetailRow label="Created At" value={formatDateTime(patient.created_at)} />
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-border">
              <Button asChild>
                <Link href={`/patients/merge?survivor=${patient.id}`}>
                  Merge with Another Patient
                </Link>
              </Button>
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
