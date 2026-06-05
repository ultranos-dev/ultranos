'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowUp, ArrowDown, Minus, BookOpen } from '@ultranos/ui-kit/icons'
import { getDb } from '@/lib/db'
import { recalculateAllCompetencies, getProcedureTrend } from '@/lib/competency-tracker'
import {
  getActiveDecayNotifications,
  dismissDecayNotification,
  buildDecayMessage,
} from '@/lib/decay-notifier'
import type { ProcedureCompetency, CompetencyTrend, DecayNotification } from '@/lib/competency-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompetencyRowData extends ProcedureCompetency {
  daysSinceLast: number | null
  trend: CompetencyTrend | null
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
  daysSinceLast,
  t,
}: {
  status: ProcedureCompetency['status']
  daysSinceLast: number | null
  t: ReturnType<typeof useTranslations>
}) {
  if (status === 'active') {
    const label =
      daysSinceLast !== null
        ? t('statusActive', { days: daysSinceLast })
        : t('statusActiveRecent')
    return (
      <span
        className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
        data-testid="badge-active"
      >
        {label}
      </span>
    )
  }
  if (status === 'decay_risk') {
    const label =
      daysSinceLast !== null
        ? t('statusDecayRisk', { days: daysSinceLast })
        : t('statusDecayRiskUnknown')
    return (
      <span
        className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
        data-testid="badge-decay-risk"
      >
        {label}
      </span>
    )
  }
  // decayed
  const label =
    daysSinceLast !== null
      ? t('statusDecayed', { days: daysSinceLast })
      : t('statusDecayedNever')
  return (
    <span
      className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300"
      data-testid="badge-decayed"
    >
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Trend icon
// ---------------------------------------------------------------------------

function TrendIcon({ trend }: { trend: CompetencyTrend | null }) {
  if (trend === 'improving') {
    return (
      <ArrowUp
        size={14}
        className="text-green-600 dark:text-green-400"
        aria-label="Improving"
      />
    )
  }
  if (trend === 'declining') {
    return (
      <ArrowDown
        size={14}
        className="text-red-500 dark:text-red-400"
        aria-label="Declining"
      />
    )
  }
  if (trend === 'stable') {
    return (
      <Minus
        size={14}
        className="text-muted-foreground dark:text-muted-foreground"
        aria-label="Stable"
      />
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Decay notification banner
// ---------------------------------------------------------------------------

function DecayNotificationCard({
  notification,
  onDismiss,
  t,
}: {
  notification: DecayNotification
  onDismiss: (id: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div
      className="flex items-start justify-between rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/20"
      role="alert"
      data-testid={`decay-notification-${notification.procedureRef}`}
    >
      <div className="flex items-start gap-2">
        <BookOpen
          size={16}
          className="mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400"
        />
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          {buildDecayMessage(notification.procedureName, notification.daysSinceLast)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        className="ms-3 shrink-0 text-xs text-yellow-600 underline hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-200"
        aria-label={t('dismissNotification')}
      >
        {t('dismiss')}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Competency row
// ---------------------------------------------------------------------------

function CompetencyRow({
  row,
  t,
}: {
  row: CompetencyRowData
  t: ReturnType<typeof useTranslations>
}) {
  const lastPerformedLabel = row.lastPerformedAt
    ? new Date(row.lastPerformedAt).toLocaleDateString()
    : t('neverPerformed')

  return (
    <tr
      className="border-b border-border/50 last:border-0 dark:border-border"
      data-testid={`competency-row-${row.procedureRef}`}
    >
      <td className="py-3 pe-4 ps-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground dark:text-white">
            {row.procedureName}
          </span>
          <span className="text-xs text-muted-foreground dark:text-muted-foreground">
            {row.procedureRef}
          </span>
        </div>
      </td>
      <td className="py-3 pe-4">
        <StatusBadge status={row.status} daysSinceLast={row.daysSinceLast} t={t} />
      </td>
      <td className="hidden py-3 pe-4 text-sm text-muted-foreground dark:text-muted-foreground sm:table-cell">
        {lastPerformedLabel}
      </td>
      <td className="hidden py-3 pe-4 text-sm text-muted-foreground dark:text-muted-foreground sm:table-cell">
        {row.totalPerformed}
      </td>
      <td className="hidden py-3 pe-4 text-sm text-muted-foreground dark:text-muted-foreground md:table-cell">
        {row.performedLast90Days}
      </td>
      <td className="py-3 pe-2">
        <TrendIcon trend={row.trend} />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Sort order: red first, yellow, then green
// ---------------------------------------------------------------------------

const STATUS_SORT: Record<ProcedureCompetency['status'], number> = {
  decayed: 0,
  decay_risk: 1,
  active: 2,
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

interface Props {
  technicianId: string
}

export function CompetencyDashboard({ technicianId }: Props) {
  const t = useTranslations('competency')

  const [rows, setRows] = useState<CompetencyRowData[]>([])
  const [notifications, setNotifications] = useState<DecayNotification[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Recalculate competencies from result history
      const competencies = await recalculateAllCompetencies(technicianId)

      // Enrich each competency with days-since-last and trend
      const now = new Date().toISOString()
      const enriched: CompetencyRowData[] = await Promise.all(
        competencies.map(async (c) => {
          const daysSinceLast = c.lastPerformedAt
            ? Math.floor(
                (new Date(now).getTime() - new Date(c.lastPerformedAt).getTime()) /
                  (1000 * 60 * 60 * 24),
              )
            : null
          const trend = await getProcedureTrend(technicianId, c.procedureRef)
          return { ...c, daysSinceLast, trend }
        }),
      )

      // Sort: red first, yellow, then green
      enriched.sort((a, b) => {
        const statusDiff = STATUS_SORT[a.status] - STATUS_SORT[b.status]
        if (statusDiff !== 0) return statusDiff
        // Within same status: most days since last first
        return (b.daysSinceLast ?? Infinity) - (a.daysSinceLast ?? Infinity)
      })

      setRows(enriched)

      // Load active notifications
      const notifs = await getActiveDecayNotifications(technicianId)
      setNotifications(notifs)
    } finally {
      setLoading(false)
    }
  }, [technicianId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDismiss(notificationId: string) {
    await dismissDecayNotification(notificationId)
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center dark:border-border dark:bg-card">
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          {t('noProcedures')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">
          {t('noProceduresHint')}
        </p>
      </div>
    )
  }

  // Summary counts
  const activeCount = rows.filter((r) => r.status === 'active').length
  const riskCount = rows.filter((r) => r.status === 'decay_risk').length
  const decayedCount = rows.filter((r) => r.status === 'decayed').length

  return (
    <div className="space-y-4" data-testid="competency-dashboard">
      {/* Decay notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2" data-testid="decay-notifications">
          {notifications.map((n) => (
            <DecayNotificationCard
              key={n.id}
              notification={n}
              onDismiss={(id) => void handleDismiss(id)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-900/20"
          data-testid="summary-active"
        >
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
            {activeCount}
          </p>
          <p className="mt-0.5 text-xs text-green-600 dark:text-green-400">
            {t('summaryActive')}
          </p>
        </div>
        <div
          className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center dark:border-yellow-800 dark:bg-yellow-900/20"
          data-testid="summary-risk"
        >
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
            {riskCount}
          </p>
          <p className="mt-0.5 text-xs text-yellow-600 dark:text-yellow-400">
            {t('summaryRisk')}
          </p>
        </div>
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-800 dark:bg-red-900/20"
          data-testid="summary-decayed"
        >
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">
            {decayedCount}
          </p>
          <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">
            {t('summaryDecayed')}
          </p>
        </div>
      </div>

      {/* Procedure table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card dark:border-border dark:bg-card">
        <table className="w-full text-start" data-testid="competency-table">
          <thead>
            <tr className="border-b border-border dark:border-border">
              <th className="px-2 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
                {t('colProcedure')}
              </th>
              <th className="px-0 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
                {t('colStatus')}
              </th>
              <th className="hidden px-0 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground sm:table-cell">
                {t('colLastPerformed')}
              </th>
              <th className="hidden px-0 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground sm:table-cell">
                {t('colTotal')}
              </th>
              <th className="hidden px-0 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground md:table-cell">
                {t('colLast90')}
              </th>
              <th className="px-0 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
                {t('colTrend')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <CompetencyRow key={row.id} row={row} t={t} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
