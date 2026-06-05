'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
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
  const t = useTranslations('patients')
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
      setPatient(result.patient as unknown as PatientDetail)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('errorLoad'))
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
    return <div className="text-muted-foreground p-8">{t('detailLoading')}</div>
  }

  if (error && !patient) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/patients" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('detailBackToPatients')}</Link>
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!patient) return null

  return (
    <div className="flex flex-col gap-4">
        <Link href="/patients" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('detailBackToPatients')}</Link>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Demographics card */}
          <div className="rounded-3xl bg-card p-5 border border-border">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              <span className="wavy-divider">{t('detailDemographics')}</span>
            </h2>
            <div className="mt-4 space-y-4">
              <DetailRow label={t('detailNameGiven')} value={patient.name_given ?? '-'} />
              <DetailRow label={t('detailNameFather')} value={patient.name_father ?? '-'} />
              <DetailRow label={t('detailNameGrandfather')} value={patient.name_grandfather ?? '-'} />
              <DetailRow label={t('detailGender')} value={patient.gender ?? '-'} />
              <DetailRow label={t('detailBirthYear')} value={patient.birth_year != null ? String(patient.birth_year) : '-'} />
              <DetailRow label={t('detailDistrictOrigin')} value={patient.address_district_origin ?? '-'} />
              <DetailRow label={t('detailProvinceOrigin')} value={patient.address_province_origin ?? '-'} />
            </div>
          </div>

          {/* MPI & Status card */}
          <div className="rounded-3xl bg-card p-5 border border-border">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
              <span className="wavy-divider">{t('detailMpiStatus')}</span>
            </h2>
            <div className="mt-4 space-y-4">
              <DetailRow
                label={t('detailMpiScore')}
                value={patient.mpi_score != null ? String(patient.mpi_score) : '-'}
              />
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('detailMpiWarn')}</dt>
                <dd className="mt-1"><MpiWarnBadge warn={patient.mpi_warn} /></dd>
              </div>
              <DetailRow label={t('detailPatientTier')} value={patient.patient_tier ?? '-'} />
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('detailStatus')}</dt>
                <dd className="mt-1"><StatusBadge active={patient.is_active} /></dd>
              </div>
              <DetailRow label={t('detailCreatedAt')} value={formatDateTime(patient.created_at)} />
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-border">
              <Button asChild>
                <Link href={`/patients/merge?survivor=${patient.id}`}>
                  {t('detailMergeLink')}
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Consent Timeline section */}
        <ConsentTimeline patientId={patient.id} />
      </div>
  )
}
