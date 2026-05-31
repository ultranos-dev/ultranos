'use client'

/**
 * WestgardHistoryView — Story 43.6
 *
 * Tabular view of QC runs for a specific analyte/instrument combination,
 * displaying Westgard multi-rule violation status for each run.
 * No Levey-Jennings chart (statistical rules only per story requirements).
 *
 * Note: The existing QcHistoryView.tsx (Story 43.2) uses a different QcRun
 * data model and includes an SVG chart. This component is the Story 43.6
 * implementation using the targetMean/targetSd Westgard model.
 *
 * RTL: All layout uses logical CSS properties.
 * No PHI — QC data is operational instrument data, not patient data.
 */

import { useTranslations } from 'next-intl'
import type { QcRun, DriftAlert } from '@/lib/qc/types'
import { runAllWestgardRules } from '@/lib/qc/westgard-rules'
import { detectTrend } from '@/lib/qc/trend-detector'

interface WestgardHistoryViewProps {
  /** QC runs for this analyte/instrument (may span control levels). */
  runs: QcRun[]
  /** All drift alerts (active and acknowledged) for this analyte/instrument. */
  alerts: DriftAlert[]
}

type QcRunStatus = 'PASS' | 'WARNING' | 'REJECT'

interface QcRunRow {
  run: QcRun
  /** Deviation in SD units: (observedValue - targetMean) / targetSd */
  deviationSd: number
  status: QcRunStatus
  ruleViolated?: string
}

/** Compute per-run Westgard status using cumulative history up to that run's index. */
function buildRows(runs: QcRun[]): QcRunRow[] {
  const values = runs.map((r) => r.observedValue)
  return runs.map((run, idx) => {
    const valuesUpToHere = values.slice(0, idx + 1)
    const violations = runAllWestgardRules(valuesUpToHere, run.targetMean, run.targetSd)
    const rejectViolation = violations.find((v) => v.severity === 'REJECT')
    const warnViolation = violations.find((v) => v.severity === 'WARNING')

    let status: QcRunStatus = 'PASS'
    let ruleViolated: string | undefined

    if (rejectViolation) {
      status = 'REJECT'
      ruleViolated = rejectViolation.rule
    } else if (warnViolation) {
      status = 'WARNING'
      ruleViolated = warnViolation.rule
    }

    return {
      run,
      deviationSd: run.targetSd !== 0
        ? (run.observedValue - run.targetMean) / run.targetSd
        : 0,
      status,
      ruleViolated,
    }
  })
}

export function WestgardHistoryView({ runs, alerts }: WestgardHistoryViewProps) {
  const t = useTranslations('qc')

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
        <p className="text-sm text-neutral-500">{t('history.empty')}</p>
      </div>
    )
  }

  // Sort runs oldest → newest for display
  const sortedRuns = [...runs].sort((a, b) => a.runDate.localeCompare(b.runDate))
  const rows = buildRows(sortedRuns)

  // Trend detection on the full sorted history
  const allValues = sortedRuns.map((r) => r.observedValue)
  const trend = detectTrend(allValues)

  return (
    <div className="space-y-6">
      {/* Trend indicator */}
      {trend && (
        <div
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5"
          role="status"
          aria-live="polite"
          data-testid="trend-indicator"
        >
          <span className="text-xl text-amber-600" aria-hidden="true">
            {trend.direction === 'UP' ? '↑' : '↓'}
          </span>
          <p className="text-sm text-amber-800">
            <strong>
              {trend.consecutiveCount} {t('trendConsecutive')}
            </strong>{' '}
            {trend.direction === 'UP' ? t('trendDirectionUp') : t('trendDirectionDown')}
          </p>
        </div>
      )}

      {/* QC Runs Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table
          className="w-full text-sm"
          aria-label={t('history.tableLabel')}
        >
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-start">{t('history.col.date')}</th>
              <th scope="col" className="px-3 py-2.5 text-start">{t('history.col.controlLevel')}</th>
              <th scope="col" className="px-3 py-2.5 text-end">{t('col.targetMean')}</th>
              <th scope="col" className="px-3 py-2.5 text-end">{t('col.targetSd')}</th>
              <th scope="col" className="px-3 py-2.5 text-end">{t('col.observedValue')}</th>
              <th scope="col" className="px-3 py-2.5 text-end">{t('col.deviation')}</th>
              <th scope="col" className="px-3 py-2.5 text-start">{t('col.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map(({ run, deviationSd, status, ruleViolated }) => (
              <tr
                key={run.id}
                className={
                  status === 'REJECT'
                    ? 'bg-red-50'
                    : status === 'WARNING'
                      ? 'bg-amber-50'
                      : ''
                }
              >
                <td className="px-3 py-2.5 text-neutral-900">
                  {new Date(run.runDate).toLocaleDateString()}
                </td>
                <td className="px-3 py-2.5 text-neutral-600">{run.controlLevel}</td>
                <td className="px-3 py-2.5 text-end tabular-nums text-neutral-700">
                  {run.targetMean.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums text-neutral-700">
                  {run.targetSd.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums font-medium text-neutral-900">
                  {run.observedValue.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums text-neutral-600">
                  {deviationSd >= 0 ? '+' : ''}{deviationSd.toFixed(2)} SD
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={status} ruleViolated={ruleViolated} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drift Alert History */}
      {alerts.length > 0 && (
        <section aria-labelledby="drift-alert-history-heading">
          <h3
            id="drift-alert-history-heading"
            className="mb-3 text-sm font-semibold text-neutral-700"
          >
            {t('alertHistoryTitle')}
          </h3>
          <div className="space-y-2">
            {[...alerts]
              .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
              .map((alert) => {
                const isAcknowledged = !!alert.acknowledgedAt
                return (
                  <div
                    key={alert.id}
                    className={`rounded-lg border p-3 ${
                      isAcknowledged
                        ? 'border-neutral-200 bg-neutral-50'
                        : alert.severity === 'REJECT'
                          ? 'border-red-200 bg-red-50'
                          : 'border-amber-200 bg-amber-50'
                    }`}
                    data-testid={`alert-history-item-${alert.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                              isAcknowledged
                                ? 'bg-neutral-200 text-neutral-600'
                                : alert.severity === 'REJECT'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {isAcknowledged ? t('statusResolved') : alert.severity}
                          </span>
                          <span className="text-xs font-mono text-neutral-500">
                            {alert.ruleViolated}
                          </span>
                          <span className="text-xs text-neutral-400">
                            {new Date(alert.detectedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-neutral-700">{alert.message}</p>
                        {isAcknowledged && (
                          <p className="mt-0.5 text-xs text-neutral-500">
                            {alert.resolution} &mdash; {alert.acknowledgedBy} &mdash;{' '}
                            {new Date(alert.acknowledgedAt!).toLocaleString()}
                            {alert.resolutionNotes && ` — "${alert.resolutionNotes}"`}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}

function StatusBadge({
  status,
  ruleViolated,
}: {
  status: QcRunStatus
  ruleViolated?: string
}) {
  const base =
    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold'
  if (status === 'REJECT') {
    return (
      <span className={`${base} bg-red-100 text-red-700`}>
        REJECT{ruleViolated && <span className="font-mono font-normal">· {ruleViolated}</span>}
      </span>
    )
  }
  if (status === 'WARNING') {
    return (
      <span className={`${base} bg-amber-100 text-amber-700`}>
        WARNING{ruleViolated && <span className="font-mono font-normal">· {ruleViolated}</span>}
      </span>
    )
  }
  return <span className={`${base} bg-green-100 text-green-700`}>PASS</span>
}
