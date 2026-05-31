'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  AuditStatus,
  type ComplianceTrend,
  type InfectionControlAudit,
  type ChecklistItemTemplate,
} from '@/types/infection-control-audit'

interface ComplianceTrendViewProps {
  trends: ComplianceTrend[]
  latestAudit?: InfectionControlAudit | null
  templates: ChecklistItemTemplate[]
}

const MAX_BARS = 12

/** Returns Tailwind text colour class for a compliance score. */
function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-500'
  return 'text-red-600'
}

/** Returns Tailwind bg colour class for a compliance score. */
function scoreBgClass(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-400'
  return 'bg-red-500'
}

export function ComplianceTrendView({
  trends,
  latestAudit,
  templates,
}: ComplianceTrendViewProps) {
  const t = useTranslations('safety.audit')

  const templateMap = useMemo(
    () => new Map(templates.map((tmpl) => [tmpl.id, tmpl])),
    [templates],
  )

  /** Up to MAX_BARS most recent months, oldest-first for left→right chart rendering. */
  const chartData = useMemo(
    () =>
      [...trends]
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-MAX_BARS),
    [trends],
  )

  const hasLatestCompleted =
    latestAudit !== null &&
    latestAudit !== undefined &&
    latestAudit.status === AuditStatus.COMPLETED

  const latestScore = hasLatestCompleted ? latestAudit!.complianceScore : null

  /** Month-over-month delta */
  const momDelta = useMemo(() => {
    if (chartData.length < 2) return null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const prev = chartData[chartData.length - 2]!.score
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const curr = chartData[chartData.length - 1]!.score
    return curr - prev
  }, [chartData])

  /** Failed item descriptions from the latest completed audit */
  const failedDescriptions = useMemo(() => {
    if (!hasLatestCompleted || !latestAudit) return []
    const latestTrend = trends.find((tr) => tr.month === latestAudit.auditMonth)
    if (!latestTrend) return []
    return latestTrend.failedItems
      .map((id) => templateMap.get(id)?.description ?? id)
  }, [hasLatestCompleted, latestAudit, trends, templateMap])

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      {/* ── Large score display ─────────────────────────────────────────────── */}
      {hasLatestCompleted && latestAudit ? (
        <div className="rounded-xl border border-neutral-200 p-6 text-center">
          <p
            className={`text-6xl font-bold ${
              latestScore !== null ? scoreColorClass(latestScore) : 'text-neutral-400'
            }`}
          >
            {latestScore !== null ? `${latestScore}%` : t('scoreNA')}
          </p>
          <p className="mt-1 text-sm font-medium text-neutral-600">
            {t('complianceScore')}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {t('lastAudit')}: {latestAudit.auditDate}
          </p>

          {/* Month-over-month */}
          {momDelta !== null && (
            <div
              className={`mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                momDelta > 0
                  ? 'bg-green-100 text-green-700'
                  : momDelta < 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              {momDelta > 0 ? '↑' : momDelta < 0 ? '↓' : '—'}
              {momDelta !== 0 ? (
                <span>
                  {Math.abs(momDelta)}% {t('vsLastMonth')}
                </span>
              ) : (
                <span>{t('noChange')}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        /* No audits completed yet */
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-sm font-medium text-neutral-600">{t('noAuditsCompleted')}</p>
          <p className="mt-1 text-xs text-neutral-400">{t('noAuditsCTA')}</p>
        </div>
      )}

      {/* ── Trend bar chart ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-neutral-200 p-4">
        <h2 className="mb-4 text-sm font-semibold text-neutral-700">
          {t('trendChartTitle')}
        </h2>

        {chartData.length < 2 ? (
          <p className="text-xs text-neutral-400">{t('notEnoughTrendData')}</p>
        ) : (
          <div className="flex h-32 items-end gap-1.5" role="img" aria-label={t('trendChartAriaLabel')}>
            {chartData.map((point) => {
              const heightPct = Math.max(2, point.score) // at least 2% visible
              return (
                <div
                  key={point.month}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  {/* Score label above bar */}
                  <span className="text-[9px] font-medium text-neutral-500">
                    {point.score}%
                  </span>
                  {/* Bar */}
                  <div
                    className={`w-full rounded-t-sm ${scoreBgClass(point.score)}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${point.month}: ${point.score}%`}
                  />
                  {/* Month label */}
                  <span className="text-[8px] text-neutral-400 truncate w-full text-center">
                    {point.month}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Failed items from latest audit ─────────────────────────────────── */}
      {failedDescriptions.length > 0 && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-red-800">
            {t('failedItemsTitle')}
          </h2>
          <ul className="space-y-1">
            {failedDescriptions.map((desc, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-red-700">
                <span className="mt-0.5 shrink-0 text-red-400" aria-hidden="true">
                  ✕
                </span>
                {desc}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
