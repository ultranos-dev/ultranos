'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getTopDispensedItems, type ConsumptionItem } from '@/lib/reports/consumption-report'

export function ConsumptionChart() {
  const t = useTranslations('consumptionChart')
  const [items, setItems] = useState<ConsumptionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getTopDispensedItems({ daysBack: 30, limit: 10 })
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <h3 className="mb-2 text-sm font-medium text-foreground">
          {t('topDispensed')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('noData')}</p>
      </div>
    )
  }

  const maxCount = Math.max(...items.map((i) => i.totalDispensed))

  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
      <h3 className="mb-4 text-sm font-medium text-foreground">
        {t('topDispensed')}
      </h3>
      <div className="space-y-2">
        {items.map((item) => {
          const widthPct = maxCount > 0 ? (item.totalDispensed / maxCount) * 100 : 0
          return (
            <div key={item.catalogItemId} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-xs text-foreground">
                {item.catalogItemName}
              </span>
              <div className="flex-1">
                <div
                  className="h-5 rounded bg-success transition-all"
                  style={{ width: `${widthPct}%`, minWidth: widthPct > 0 ? '4px' : '0' }}
                />
              </div>
              <span className="w-10 text-end text-xs tabular-nums text-muted-foreground">
                {item.totalDispensed}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
