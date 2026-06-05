'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useDataBudgetStore } from '@/stores/data-budget-store'

export function DataBudgetIndicator() {
  const t = useTranslations('dataBudget')
  const { planSizeMB, currentCycleUsedMB, thresholdLevel, isLoaded, loadFromDexie } = useDataBudgetStore()

  useEffect(() => {
    if (!isLoaded) void loadFromDexie()
  }, [isLoaded, loadFromDexie])

  if (!isLoaded) return null

  const usedPct = planSizeMB > 0 ? Math.min((currentCycleUsedMB / planSizeMB) * 100, 100) : 0

  const barColor =
    thresholdLevel === 'critical'
      ? 'bg-red-500'
      : thresholdLevel === 'warning'
        ? 'bg-yellow-500'
        : 'bg-green-500'

  const textColor =
    thresholdLevel === 'critical'
      ? 'text-red-400'
      : thresholdLevel === 'warning'
        ? 'text-yellow-400'
        : 'text-muted-foreground'

  return (
    <Link href="/settings/data-budget" className="block" title={t('viewDashboard')}>
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${usedPct}%` }} />
        </div>
        <span className={`text-[10px] font-mono ${textColor} whitespace-nowrap`}>
          {t('sidebarUsed', { used: currentCycleUsedMB.toFixed(0) })}
        </span>
      </div>
    </Link>
  )
}
