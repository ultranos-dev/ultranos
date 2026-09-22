'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowUp, ArrowDown, Minus, BookOpen, GraduationCap } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
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
        className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success"
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
        className="inline-flex items-center rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning"
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
      className="inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"
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
        className="text-success"
        aria-label="Improving"
      />
    )
  }
  if (trend === 'declining') {
    return (
      <ArrowDown
        size={14}
        className="text-destructive"
        aria-label="Declining"
      />
    )
  }
  if (trend === 'stable') {
    return (
      <Minus
        size={14}
        className="text-muted-foreground"
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
      className="flex items-start justify-between rounded-lg border border-warning/30 bg-warning/10 p-3"
      role="alert"
      data-testid={`decay-notification-${notification.procedureRef}`}
    >
      <div className="flex items-start gap-2">
        <BookOpen
          size={16}
          className="mt-0.5 shrink-0 text-warning"
        />
        <p className="text-sm text-warning">
          {buildDecayMessage(notification.procedureName, notification.daysSinceLast)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        className="ms-3 shrink-0 text-xs text-warning underline hover:text-warning/80"
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
      className="transition-colors hover:bg-muted/50"
      data-testid={`competency-row-${row.procedureRef}`}
    >
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {row.procedureName}
          </span>
          <span className="text-xs text-muted-foreground dark:text-muted-foreground">
            {row.procedureRef}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} daysSinceLast={row.daysSinceLast} t={t} />
      </td>
      <td className="hidden px-4 py-3 text-sm text-muted-foreground sm:table-cell">
        {lastPerformedLabel}
      </td>
      <td className="hidden px-4 py-3 text-sm text-muted-foreground sm:table-cell">
        {row.totalPerformed}
      </td>
      <td className="hidden px-4 py-3 text-sm text-muted-foreground md:table-cell">
        {row.performedLast90Days}
      </td>
      <td className="px-4 py-3">
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
  const [statusFilter, setStatusFilter] = useState<ProcedureCompetency['status'] | 'ALL'>('ALL')

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

  // Summary counts
  const activeCount = rows.filter((r) => r.status === 'active').length
  const riskCount = rows.filter((r) => r.status === 'decay_risk').length
  const decayedCount = rows.filter((r) => r.status === 'decayed').length

  const STATUS_PILLS: Array<{ key: ProcedureCompetency['status'] | 'ALL'; label: string }> = [
    { key: 'ALL', label: t('filterAll') },
    { key: 'active', label: t('summaryActive') },
    { key: 'decay_risk', label: t('summaryRisk') },
    { key: 'decayed', label: t('summaryDecayed') },
  ]

  const visibleRows = statusFilter === 'ALL' ? rows : rows.filter((r) => r.status === statusFilter)

  return (
    <div className="flex flex-col gap-4" data-testid="competency-dashboard">
      {/* Decay notifications */}
      {notifications.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="decay-notifications">
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
          className="rounded-xl bg-success/10 p-3 text-center shadow-card ring-[0.65px] ring-success/30"
          data-testid="summary-active"
        >
          <p className="text-2xl font-bold text-success">{activeCount}</p>
          <p className="mt-0.5 text-xs text-success">{t('summaryActive')}</p>
        </div>
        <div
          className="rounded-xl bg-warning/10 p-3 text-center shadow-card ring-[0.65px] ring-warning/30"
          data-testid="summary-risk"
        >
          <p className="text-2xl font-bold text-warning">{riskCount}</p>
          <p className="mt-0.5 text-xs text-warning">{t('summaryRisk')}</p>
        </div>
        <div
          className="rounded-xl bg-destructive/10 p-3 text-center shadow-card ring-[0.65px] ring-destructive/30"
          data-testid="summary-decayed"
        >
          <p className="text-2xl font-bold text-destructive">{decayedCount}</p>
          <p className="mt-0.5 text-xs text-destructive">{t('summaryDecayed')}</p>
        </div>
      </div>

      {/* Toolbar: status filter pills — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {STATUS_PILLS.map((pill) => (
            <button
              key={pill.key}
              type="button"
              role="tab"
              aria-pressed={statusFilter === pill.key}
              onClick={() => setStatusFilter(pill.key)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                statusFilter === pill.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Procedure table — single cohesive box (loading / empty / table) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
            {t('loading')}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={GraduationCap}
              title={t('noProcedures')}
              description={t('noProceduresHint')}
            />
          </div>
        ) : (
          <table className="w-full text-start" data-testid="competency-table">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('colProcedure')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('colStatus')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                  {t('colLastPerformed')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                  {t('colTotal')}
                </th>
                <th className="hidden px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
                  {t('colLast90')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('colTrend')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRows.map((row) => (
                <CompetencyRow key={row.id} row={row} t={t} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
