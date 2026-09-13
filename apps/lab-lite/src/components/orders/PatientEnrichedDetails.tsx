'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { LabOrderPatientDetails } from '@/lib/trpc'

function fullNameStr(fn: LabOrderPatientDetails['fullName']): string {
  return [fn.given, fn.father, fn.grandfather].filter(Boolean).join(' · ')
}

interface Row {
  label: string
  value: ReactNode
  numeric?: boolean
}

/**
 * Renders the detail-view patient PHI (full name · blood group · latest vitals)
 * that the lab may see on an explicit detail view (CLAUDE.md Rule #7 detail-view
 * scope). Shared by the Patient Details modal (`full` grid) and the verification
 * step (`compact` inline). Fetches nothing itself — the caller passes fetched
 * `details` + `loading`.
 */
export function PatientEnrichedDetails({
  details,
  loading,
  variant = 'full',
}: {
  details: LabOrderPatientDetails | null
  loading: boolean
  variant?: 'full' | 'compact'
}) {
  const t = useTranslations('orders')

  if (loading) return <p className="text-sm text-muted-foreground">{t('details.loading')}</p>
  if (!details) return <p className="text-sm text-muted-foreground">{t('details.unavailable')}</p>

  const v = details.vitals
  const rows: Row[] = []
  const fn = fullNameStr(details.fullName)
  if (fn) rows.push({ label: t('details.fullName'), value: <bdi>{fn}</bdi> })
  if (details.bloodGroup) rows.push({ label: t('details.bloodGroup'), value: details.bloodGroup, numeric: true })
  if (v.weightKg != null) rows.push({ label: t('details.weight'), value: `${v.weightKg} kg`, numeric: true })
  if (v.heightCm != null) rows.push({ label: t('details.height'), value: `${v.heightCm} cm`, numeric: true })
  if (v.bmi != null) rows.push({ label: t('details.bmi'), value: `${v.bmi}`, numeric: true })
  if (v.bpSystolic != null && v.bpDiastolic != null) {
    rows.push({ label: t('details.bloodPressure'), value: `${v.bpSystolic}/${v.bpDiastolic} mmHg`, numeric: true })
  }
  if (v.temperatureC != null) rows.push({ label: t('details.temperature'), value: `${v.temperatureC} °C`, numeric: true })

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('details.unavailable')}</p>

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm" data-testid="patient-enriched-compact">
        {rows.map((r) => (
          <span key={r.label}>
            <span className="text-muted-foreground">{r.label}:</span>{' '}
            <span className={`text-foreground ${r.numeric ? 'font-numeric' : ''}`}>{r.value}</span>
          </span>
        ))}
      </div>
    )
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-testid="patient-enriched-full">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="font-medium text-muted-foreground">{r.label}</dt>
          <dd className={`text-foreground ${r.numeric ? 'font-numeric' : ''}`}>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
