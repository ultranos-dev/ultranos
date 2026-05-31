'use client'

import { useTranslations } from 'next-intl'
import type { NetworkMetrics } from '@/types/lab-network'

interface MetricCardProps {
  label: string
  value: number | string
  asOf: string
  warnThreshold?: number
  numericValue?: number
}

/** Format ISO timestamp as "X min ago" or "X h ago" for staleness display. */
function formatAge(isoTimestamp: string): { label: string; stale: boolean } {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 5) return { label: 'Just now', stale: false }
  if (diffMin < 60) return { label: `${diffMin} min ago`, stale: diffMin > 30 }
  const diffH = Math.floor(diffMin / 60)
  return { label: `${diffH}h ago`, stale: true }
}

function MetricCard({ label, value, asOf, warnThreshold, numericValue }: MetricCardProps) {
  const age = formatAge(asOf)
  const isWarning = warnThreshold != null && (numericValue ?? 0) > warnThreshold

  return (
    <div
      className={`rounded-lg border p-4 ${
        isWarning ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-white'
      }`}
    >
      <p className="text-sm text-neutral-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${isWarning ? 'text-amber-700' : 'text-neutral-900'}`}>
        {value}
      </p>
      <p
        className={`mt-1 text-xs ${age.stale ? 'text-amber-600' : 'text-neutral-400'}`}
        aria-label={`Data updated ${age.label}`}
      >
        {age.stale ? `⚠ Data from ${age.label}` : `Updated ${age.label}`}
      </p>
    </div>
  )
}

interface NetworkMetricsSummaryProps {
  metrics: NetworkMetrics
}

export function NetworkMetricsSummary({ metrics }: NetworkMetricsSummaryProps) {
  const t = useTranslations('network')

  // Sum pending results across all locations
  const totalPending = Object.values(metrics.pendingResultsByLocation).reduce((a, b) => a + b, 0)

  // Average TAT across all locations (show "—" if no data)
  const tatValues = Object.values(metrics.avgTATByLocation)
  const avgTAT =
    tatValues.length > 0
      ? Math.round(tatValues.reduce((a, b) => a + b, 0) / tatValues.length)
      : null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="region" aria-label={t('networkMetrics')}>
      <MetricCard
        label={t('totalSamplesToday')}
        value={metrics.totalSamplesToday}
        asOf={metrics.asOf}
      />
      <MetricCard
        label={t('networkAvgTAT')}
        value={avgTAT != null ? `${avgTAT} min` : '—'}
        asOf={metrics.asOf}
      />
      <MetricCard
        label={t('pendingResults')}
        value={totalPending}
        numericValue={totalPending}
        warnThreshold={10}
        asOf={metrics.asOf}
      />
      <MetricCard
        label={t('stockoutAlerts')}
        value={metrics.stockoutAlerts}
        numericValue={metrics.stockoutAlerts}
        warnThreshold={0}
        asOf={metrics.asOf}
      />
    </div>
  )
}
