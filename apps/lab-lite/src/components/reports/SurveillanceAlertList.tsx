'use client'

/**
 * SurveillanceAlertList — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Lists all generated surveillance alerts with filtering controls.
 * No PHI — alerts contain aggregate counts, rates, and lab metadata only.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, CircleCheck, Clock, AlertCircle, ChevronDown, ShieldAlert } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
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
    <div className="flex flex-col gap-4">
      {/* Toolbar: search + filters — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('filterByDisease')}
          value={diseaseFilter}
          onChange={(e) => setDiseaseFilter(e.target.value.toLowerCase())}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('filterByDisease')}
        />
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'spike' | 'cluster' | '')}
            className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
            aria-label={t('filterByType')}
          >
            <option value="">{t('filterByType')}</option>
            <option value="spike">{t('spikeDetected')}</option>
            <option value="cluster">{t('clusterDetected')}</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SurveillanceAlert['transmissionStatus'] | '')}
            className="h-9 w-full appearance-none rounded-full border border-border bg-background text-foreground ps-3 pe-9 text-sm"
            aria-label={t('transmissionStatus')}
          >
            <option value="">{t('transmissionStatus')}</option>
            <option value="pending">{t('pending')}</option>
            <option value="transmitted">{t('transmitted')}</option>
            <option value="failed">{t('failed')}</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Error banner (retryable) */}
      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <button type="button" onClick={reload} className="ms-2 underline">{t('retry', { defaultMessage: 'Retry' })}</button>
        </div>
      )}

      {/* Content: loading / empty go inside a box; alert cards stack below */}
      {loading ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card text-sm text-muted-foreground shadow-card ring-[0.65px] ring-border/50" aria-busy="true">
          {t('loading', { defaultMessage: 'Loading...' })}
        </div>
      ) : !error && alerts.length === 0 ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          <EmptyState icon={ShieldAlert} title={t('noAlerts')} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {!error && alerts.map((alert) => (
            <SurveillanceAlertCard
              key={alert.id}
              alert={alert}
              highlighted={alert.id === highlightAlertId}
            />
          ))}
        </div>
      )}
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
    ? 'border-destructive/30 bg-destructive/10'
    : 'border-warning/30 bg-warning/10'

  const severityBadgeClasses = alert.severity === 'critical'
    ? 'bg-destructive/15 text-destructive'
    : 'bg-warning/15 text-warning'

  return (
    <div
      id={`alert-${alert.id}`}
      className={`rounded-lg border p-4 transition-all ${severityClasses} ${highlighted ? 'ring-2 ring-ring' : ''}`}
      role="article"
      aria-label={`${alert.diseaseLabel} ${alert.alertType} alert`}
    >
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AlertTriangle size={16} className={alert.severity === 'critical' ? 'text-destructive' : 'text-warning'} aria-hidden />
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
      <span className="flex items-center gap-1 text-xs text-success">
        <CircleCheck size={12} aria-hidden />
        {t('transmitted')}
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
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
