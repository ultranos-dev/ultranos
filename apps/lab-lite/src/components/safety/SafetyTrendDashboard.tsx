'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  SafetyConcernCategory,
  ReportStatus,
  type SafetyReport,
} from '@/types/safety-reporting'
import { getSafetyReports } from '@/lib/db'
import { Button } from '@/components/ui/Button'

type TimePeriod = '30d' | '90d' | '12m'

const CATEGORY_COLORS: Record<SafetyConcernCategory, string> = {
  [SafetyConcernCategory.HAND_HYGIENE]: 'bg-blue-500',
  [SafetyConcernCategory.PPE_NON_USE]: 'bg-amber-500',
  [SafetyConcernCategory.IMPROPER_WASTE_DISPOSAL]: 'bg-red-500',
  [SafetyConcernCategory.EQUIPMENT_MISUSE]: 'bg-purple-500',
  [SafetyConcernCategory.OTHER]: 'bg-muted',
}

interface SafetyTrendDashboardProps {
  onBack?: () => void
}

export function SafetyTrendDashboard({ onBack }: SafetyTrendDashboardProps) {
  const t = useTranslations('safety.reporting')
  const [reports, setReports] = useState<SafetyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<TimePeriod>('30d')

  const loadReports = useCallback(async () => {
    setLoading(true)
    const all = await getSafetyReports()
    setReports(all)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const cutoffDate = useMemo(() => {
    const now = new Date()
    if (period === '30d') return new Date(now.getTime() - 30 * 86400000)
    if (period === '90d') return new Date(now.getTime() - 90 * 86400000)
    return new Date(now.getTime() - 365 * 86400000)
  }, [period])

  const filteredReports = useMemo(() => {
    return reports.filter((r) => new Date(r.submittedAt) >= cutoffDate)
  }, [reports, cutoffDate])

  const stats = useMemo(() => {
    const total = filteredReports.length
    const closed = filteredReports.filter((r) => r.status === ReportStatus.CLOSED)
    const resolutionRate = total > 0 ? Math.round((closed.length / total) * 100) : 0

    // Average time to acknowledge (ms)
    const acknowledged = filteredReports.filter((r) => r.acknowledgedAt)
    const avgAckTime = acknowledged.length > 0
      ? acknowledged.reduce((sum, r) => {
          const ack = new Date(r.acknowledgedAt!).getTime()
          const sub = new Date(r.submittedAt).getTime()
          return sum + (ack - sub)
        }, 0) / acknowledged.length
      : 0

    // Average time to close (ms)
    const avgCloseTime = closed.length > 0
      ? closed.reduce((sum, r) => {
          const close = new Date(r.closedAt!).getTime()
          const sub = new Date(r.submittedAt).getTime()
          return sum + (close - sub)
        }, 0) / closed.length
      : 0

    // Category counts
    const byCat: Record<SafetyConcernCategory, number> = {
      [SafetyConcernCategory.HAND_HYGIENE]: 0,
      [SafetyConcernCategory.PPE_NON_USE]: 0,
      [SafetyConcernCategory.IMPROPER_WASTE_DISPOSAL]: 0,
      [SafetyConcernCategory.EQUIPMENT_MISUSE]: 0,
      [SafetyConcernCategory.OTHER]: 0,
    }
    for (const r of filteredReports) {
      byCat[r.category]++
    }

    // Recurring issues: categories with 3+ reports
    const recurring = Object.entries(byCat)
      .filter(([, count]) => count >= 3)
      .map(([cat]) => cat as SafetyConcernCategory)

    return { total, resolutionRate, avgAckTime, avgCloseTime, byCat, recurring }
  }, [filteredReports])

  function formatDuration(ms: number): string {
    if (ms === 0) return '—'
    const hours = Math.floor(ms / 3600000)
    if (hours < 24) return `${hours}h`
    const days = Math.round(hours / 24)
    return `${days}d`
  }

  const maxCatCount = Math.max(1, ...Object.values(stats.byCat))

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">{t('loading')}</p>
  }

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-primary-600 hover:underline"
        >
          ← {t('backToList')}
        </button>
      )}

      <h1 className="text-xl font-semibold">{t('trendTitle')}</h1>

      {/* Time period selector */}
      <div className="flex gap-2">
        {(['30d', '90d', '12m'] as TimePeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              period === p
                ? 'bg-primary-500 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted'
            }`}
          >
            {t(`period.${p}`)}
          </button>
        ))}
      </div>

      {filteredReports.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noDataForPeriod')}</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">{t('totalReports')}</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{stats.resolutionRate}%</p>
              <p className="text-xs text-muted-foreground">{t('resolutionRate')}</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{formatDuration(stats.avgAckTime)}</p>
              <p className="text-xs text-muted-foreground">{t('avgAckTime')}</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{formatDuration(stats.avgCloseTime)}</p>
              <p className="text-xs text-muted-foreground">{t('avgCloseTime')}</p>
            </div>
          </div>

          {/* Category bar chart */}
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-4 text-sm font-semibold">{t('reportsByCategory')}</h2>
            <div className="space-y-3">
              {Object.entries(stats.byCat).map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-muted-foreground truncate">
                    {t(`category.${cat}`)}
                  </span>
                  <div className="flex-1">
                    <div
                      className={`h-5 rounded ${CATEGORY_COLORS[cat as SafetyConcernCategory]}`}
                      style={{ width: `${(count / maxCatCount) * 100}%`, minWidth: count > 0 ? '4px' : '0' }}
                    />
                  </div>
                  <span className="w-6 text-end text-xs font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recurring issues */}
          {stats.recurring.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-amber-800">
                {t('recurringIssues')}
              </h2>
              <ul className="space-y-1">
                {stats.recurring.map((cat) => (
                  <li key={cat} className="flex items-center gap-2 text-sm text-amber-700">
                    <span className="font-medium">{t(`category.${cat}`)}</span>
                    <span className="text-xs">({stats.byCat[cat]} {t('reports')})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
