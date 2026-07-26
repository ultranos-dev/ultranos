'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Label } from '@ultranos/ui-kit/components/ui/label'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Database } from '@ultranos/ui-kit/icons'
import { Card } from '@/components/Card'
import { useDataBudgetStore } from '@/stores/data-budget-store'

export function DataBudgetDashboard() {
  const t = useTranslations('dataBudget')
  const {
    planSizeMB,
    billingCycleDay,
    lowDataMode,
    currentCycleUsedMB,
    projectedExhaustionDate,
    dailyUsage,
    categoryBreakdown,
    thresholdLevel,
    isLoaded,
    loadFromDexie,
    refreshUsageStats,
    updateConfig,
  } = useDataBudgetStore()

  const [planInput, setPlanInput] = useState(String(planSizeMB))
  const [cycleInput, setCycleInput] = useState(String(billingCycleDay))
  const [lowData, setLowData] = useState(lowDataMode)
  const [saved, setSaved] = useState(false)

  // Sync form state when store loads
  useEffect(() => {
    if (isLoaded) {
      setPlanInput(String(planSizeMB))
      setCycleInput(String(billingCycleDay))
      setLowData(lowDataMode)
    }
  }, [isLoaded, planSizeMB, billingCycleDay, lowDataMode])

  async function handleSave() {
    const newPlan = Math.max(1, parseInt(planInput, 10) || planSizeMB)
    const newCycle = Math.min(28, Math.max(1, parseInt(cycleInput, 10) || billingCycleDay))
    await updateConfig({ planSizeMB: newPlan, billingCycleDay: newCycle, lowDataMode: lowData })
    setPlanInput(String(newPlan))
    setCycleInput(String(newCycle))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  useEffect(() => {
    const id = setInterval(() => void refreshUsageStats(), 60_000)
    return () => clearInterval(id)
  }, [refreshUsageStats])

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0
  const remainingMB = Math.max(planSizeMB - currentCycleUsedMB, 0)

  const barColor =
    thresholdLevel === 'critical' ? 'bg-destructive'
    : thresholdLevel === 'warning' ? 'bg-warning'
    : 'bg-success'

  const maxDailyMB = Math.max(...dailyUsage.map((d) => d.totalMB), 0.01)

  return (
    <div className="flex flex-col gap-4">
      {thresholdLevel === 'warning' && (
        <Alert variant="warning" role="alert" data-testid="data-budget-warning">
          {t('warningBanner')}
        </Alert>
      )}
      {thresholdLevel === 'critical' && (
        <Alert variant="destructive" role="alert" data-testid="data-budget-critical">
          {t('criticalBanner')}
        </Alert>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('usageTitle')}</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-4 w-full rounded-full bg-muted overflow-hidden" aria-hidden="true">
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
          <div className="text-end text-sm">
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
      </Card>

      <Card>
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
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t('categoryTitle')}</h2>
        {Object.keys(categoryBreakdown).length === 0 ? (
          <EmptyState size="sm" icon={Database} title={t('categoryEmpty')} />
        ) : (
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
                  <td className="py-1.5 text-end text-muted-foreground tabular-nums">{mb.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-muted-foreground mb-4">{t('settingsTitle')}</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-size">{t('planSize')}</Label>
            <Input
              id="plan-size"
              type="number"
              min={1}
              value={planInput}
              onChange={(e) => setPlanInput(e.target.value)}
              className="w-36"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cycle-day">{t('billingCycleDay')}</Label>
            <Input
              id="cycle-day"
              type="number"
              min={1}
              max={28}
              value={cycleInput}
              onChange={(e) => setCycleInput(e.target.value)}
              className="w-24"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={lowData}
              onChange={(e) => setLowData(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{t('lowDataMode')}</span>
              <span className="text-xs text-muted-foreground">{t('lowDataModeDesc')}</span>
            </div>
          </label>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} size="sm">{t('save')}</Button>
            {saved && <span className="text-xs text-success">{t('saved')}</span>}
          </div>
        </div>
      </Card>
    </div>
  )
}
