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
    if (!isLoaded) void loadFromDexie()
    intervalRef.current = setInterval(() => void refreshUsageStats(), 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isLoaded, loadFromDexie, refreshUsageStats])

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0
  const remainingMB = Math.max(planSizeMB - currentCycleUsedMB, 0)

  const barColor =
    thresholdLevel === 'critical' ? 'bg-red-500'
    : thresholdLevel === 'warning' ? 'bg-yellow-500'
    : 'bg-green-500'

  const maxDailyMB = Math.max(...dailyUsage.map((d) => d.totalMB), 0.01)

  return (
    <div className="flex flex-col gap-4">
      {thresholdLevel === 'warning' && (
        <div role="alert" className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800" data-testid="data-budget-warning">
          {t('warningBanner')}
        </div>
      )}
      {thresholdLevel === 'critical' && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="data-budget-critical">
          {t('criticalBanner')}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('usageTitle')}</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${usedPct}%` }}
                role="progressbar"
                aria-valuenow={Math.round(usedPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('usageAriaLabel', { used: currentCycleUsedMB.toFixed(0), total: planSizeMB })}
              />
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-foreground">{currentCycleUsedMB.toFixed(1)} MB <span className="text-muted-foreground font-normal">{t('used')}</span></div>
            <div className="text-muted-foreground">{remainingMB.toFixed(1)} MB {t('remaining')}</div>
          </div>
        </div>
        {projectedExhaustionDate && (
          <p className="mt-2 text-xs text-muted-foreground">{t('projectionExhaustion', { date: projectedExhaustionDate })}</p>
        )}
        {!projectedExhaustionDate && (
          <p className="mt-2 text-xs text-muted-foreground">{t('projectionNoData')}</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('dailyUsageTitle')}</h2>
        <div className="flex items-end gap-0.5 h-16">
          {dailyUsage.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className={`w-full rounded-sm ${barColor} opacity-80`}
                style={{ height: `${Math.max((d.totalMB / maxDailyMB) * 48, d.totalMB > 0 ? 2 : 0)}px` }}
                title={`${d.date}: ${d.totalMB.toFixed(2)} MB`}
              />
            </div>
          ))}
        </div>
      </div>

      {Object.keys(categoryBreakdown).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('categoryTitle')}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-start font-medium text-muted-foreground">{t('categoryHeader')}</th>
                <th className="pb-2 text-end font-medium text-muted-foreground">MB</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(categoryBreakdown).map(([cat, mb]) => (
                <tr key={cat} className="border-b border-border last:border-0">
                  <td className="py-1.5 text-foreground">{t(`category.${cat}`)}</td>
                  <td className="py-1.5 text-end text-muted-foreground font-mono">{mb.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
