'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useDataBudgetStore } from '@/stores/data-budget-store'

export function DataBudgetDashboard() {
  const t = useTranslations('dataBudget')
  const {
    planSizeMB,
    currentCycleUsedMB,
    projectedExhaustionDate,
    dailyUsage,
    categoryBreakdown,
    thresholdLevel,
    isLoaded,
    loadFromDexie,
    refreshUsageStats,
  } = useDataBudgetStore()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isLoaded) {
      void loadFromDexie()
    }
    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(() => {
      void refreshUsageStats()
    }, 60_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isLoaded, loadFromDexie, refreshUsageStats])

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0
  const remainingMB = Math.max(planSizeMB - currentCycleUsedMB, 0)

  const barColor =
    thresholdLevel === 'critical'
      ? 'bg-red-500'
      : thresholdLevel === 'warning'
        ? 'bg-yellow-500'
        : 'bg-green-500'

  const maxDailyMB = Math.max(...dailyUsage.map((d) => d.totalMB), 0.01)

  return (
    <div className="flex flex-col gap-4">
      {/* Threshold Banners */}
      {thresholdLevel === 'warning' && (
        <div
          role="alert"
          className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
          data-testid="data-budget-warning"
        >
          {t('warningBanner')}
        </div>
      )}
      {thresholdLevel === 'critical' && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
          data-testid="data-budget-critical"
        >
          {t('criticalBanner')}
        </div>
      )}

      {/* Usage Gauge */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-500 mb-3">{t('usageTitle')}</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 w-full rounded-full bg-neutral-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${usedPct}%` }}
                role="progressbar"
                aria-valuenow={Math.round(usedPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('usageAriaLabel', {
                  used: currentCycleUsedMB.toFixed(1),
                  total: planSizeMB,
                })}
              />
            </div>
          </div>
          <span className="text-sm font-medium text-neutral-700 whitespace-nowrap">
            {currentCycleUsedMB.toFixed(1)} / {planSizeMB} MB
          </span>
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          {usedPct.toFixed(0)}% {t('used')} &middot; {remainingMB.toFixed(1)} MB {t('remaining')}
        </p>
      </div>

      {/* Projection Card */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-500 mb-2">{t('projectionTitle')}</h2>
        <p className="text-sm text-neutral-700">
          {projectedExhaustionDate
            ? t('projectionExhaustion', { date: projectedExhaustionDate })
            : t('projectionNoData')}
        </p>
      </div>

      {/* Daily Usage Chart (CSS bars) */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-500 mb-3">{t('dailyUsageTitle')}</h2>
        <div className="flex items-end gap-1" style={{ height: '120px' }}>
          {dailyUsage.map((day) => {
            const heightPct = maxDailyMB > 0 ? (day.totalMB / maxDailyMB) * 100 : 0
            return (
              <div
                key={day.date}
                className="flex-1 flex flex-col items-center justify-end"
                style={{ height: '100%' }}
              >
                <div
                  className={`w-full rounded-t ${barColor} min-h-[2px]`}
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                  title={`${day.date}: ${day.totalMB.toFixed(2)} MB`}
                />
                <span className="text-[9px] text-neutral-400 mt-1 truncate w-full text-center">
                  {day.date.slice(5)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-500 mb-3">{t('categoryTitle')}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-500 text-xs">
              <th className="text-start pb-1">{t('categoryHeader')}</th>
              <th className="text-end pb-1">MB</th>
            </tr>
          </thead>
          <tbody>
            {['upload', 'audit', 'notification', 'other'].map((cat) => (
              <tr key={cat} className="border-t border-neutral-100">
                <td className="py-1 text-neutral-700">{t(`category.${cat}`)}</td>
                <td className="py-1 text-end text-neutral-700 font-mono">
                  {(categoryBreakdown[cat] ?? 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
