'use client'

/**
 * SurveillanceAlertList — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Lists all generated surveillance alerts with filtering controls.
 * No PHI — alerts contain aggregate counts, rates, and lab metadata only.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, CircleCheck, Clock, AlertCircle } from '@ultranos/ui-kit/icons'
import type { SurveillanceAlert } from '@/lib/surveillance-types'
import { useSurveillanceAlerts } from '@/hooks/useSurveillanceAlerts'

interface SurveillanceAlertListProps {
  /** Pre-select a specific alert ID (e.g. when navigating from a notification). */
  highlightAlertId?: string
}

export function SurveillanceAlertList({ highlightAlertId }: SurveillanceAlertListProps) {
  const t = useTranslations('surveillance')
  const [diseaseFilter, setDiseaseFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'spike' | 'cluster' | ''>('')
  const [statusFilter, setStatusFilter] = useState<SurveillanceAlert['transmissionStatus'] | ''>('')

  const { alerts, loading, error, reload } = useSurveillanceAlerts({
    diseaseCode: diseaseFilter || undefined,
    alertType: (typeFilter as 'spike' | 'cluster') || undefined,
    transmissionStatus: (statusFilter as SurveillanceAlert['transmissionStatus']) || undefined,
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <input
          type="text"
          placeholder={t('filterByDisease')}
          value={diseaseFilter}
          onChange={(e) => setDiseaseFilter(e.target.value.toLowerCase())}
          className="rounded border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label={t('filterByDisease')}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'spike' | 'cluster' | '')}
          className="rounded border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label={t('filterByType')}
        >
          <option value="">{t('filterByType')}</option>
          <option value="spike">{t('spikeDetected')}</option>
          <option value="cluster">{t('clusterDetected')}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SurveillanceAlert['transmissionStatus'] | '')}
          className="rounded border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label={t('transmissionStatus')}
        >
          <option value="">{t('transmissionStatus')}</option>
          <option value="pending">{t('pending')}</option>
          <option value="transmitted">{t('transmitted')}</option>
          <option value="failed">{t('failed')}</option>
        </select>
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          {t('loading', { defaultMessage: 'Loading...' })}
        </div>
      )}
      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={reload} className="ms-2 underline">{t('retry', { defaultMessage: 'Retry' })}</button>
        </div>
      )}
      {!loading && !error && alerts.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
          {t('noAlerts')}
        </div>
      )}

      {/* Alert cards */}
      {!loading && !error && alerts.map((alert) => (
        <SurveillanceAlertCard
          key={alert.id}
          alert={alert}
          highlighted={alert.id === highlightAlertId}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual alert card
// ---------------------------------------------------------------------------

function SurveillanceAlertCard({
  alert,
  highlighted,
}: {
  alert: SurveillanceAlert
  highlighted: boolean
}) {
  const t = useTranslations('surveillance')

  const severityClasses = alert.severity === 'critical'
    ? 'border-red-300 bg-red-50'
    : 'border-amber-300 bg-amber-50'

  const severityBadgeClasses = alert.severity === 'critical'
    ? 'bg-red-100 text-red-800'
    : 'bg-amber-100 text-amber-800'

  return (
    <div
      id={`alert-${alert.id}`}
      className={`rounded-lg border p-4 transition-all ${severityClasses} ${highlighted ? 'ring-2 ring-primary-500' : ''}`}
      role="article"
      aria-label={`${alert.diseaseLabel} ${alert.alertType} alert`}
    >
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AlertTriangle size={16} className={alert.severity === 'critical' ? 'text-red-600' : 'text-amber-600'} aria-hidden />
        <span className="font-semibold text-foreground text-sm">{alert.diseaseLabel}</span>

        {/* Alert type badge */}
        <span className="rounded px-2 py-0.5 text-xs font-medium bg-muted text-foreground">
          {alert.alertType === 'spike' ? t('spikeDetected') : t('clusterDetected')}
        </span>

        {/* Severity badge */}
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${severityBadgeClasses}`}>
          {t(alert.severity)}
        </span>

        {/* Transmission status */}
        <TransmissionStatusBadge status={alert.transmissionStatus} t={t} />

        {/* Timestamp */}
        <time className="ms-auto text-xs text-muted-foreground" dateTime={alert.createdAt}>
          {new Date(alert.createdAt).toLocaleString()}
        </time>
      </div>

      {/* Alert message */}
      <p className="text-sm text-foreground">{alert.message}</p>

      {/* Spike details */}
      {alert.alertType === 'spike' && (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>{t('currentRate')}: <strong>{(alert.currentRate ?? 0).toFixed(1)}%</strong></span>
          <span>{t('baseline')}: <strong>{(alert.baselineRate ?? 0).toFixed(1)}%</strong></span>
          <span>{t('ratio')}: <strong>{isFinite(alert.spikeRatio ?? 0) ? `${(alert.spikeRatio ?? 0).toFixed(1)}x` : '—'}</strong></span>
          <span>{t('testCategory')}: <strong>{alert.diseaseLabel}</strong></span>
        </div>
      )}

      {/* Cluster details */}
      {alert.alertType === 'cluster' && (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>{t('caseCount')}: <strong>{alert.clusterCaseCount}</strong></span>
          {alert.clusterWindowStart && alert.clusterWindowEnd && (
            <span>
              {new Date(alert.clusterWindowStart).toLocaleString()} – {new Date(alert.clusterWindowEnd).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Lab location */}
      <div className="mt-1 text-xs text-muted-foreground">
        {t('labLocation')}: {alert.labFacilityName}, {alert.labDistrict}, {alert.labProvince}
      </div>
    </div>
  )
}

function TransmissionStatusBadge({
  status,
  t,
}: {
  status: SurveillanceAlert['transmissionStatus']
  t: (key: string) => string
}) {
  if (status === 'transmitted') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-700">
        <CircleCheck size={12} aria-hidden />
        {t('transmitted')}
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <AlertCircle size={12} aria-hidden />
        {t('failed')}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock size={12} aria-hidden />
      {t('pending')}
    </span>
  )
}
