'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getWastageMetrics, type WastageMetrics } from '@/lib/reports/wastage-report'

export function WastageCard() {
  const t = useTranslations('reports')
  const [data, setData] = useState<WastageMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getWastageMetrics(30)
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
        <p className="text-sm text-muted-foreground">{t('loadingWastage')}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
      <h3 className="mb-4 text-sm font-medium text-foreground">
        {t('wastageTitle')}
      </h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold tabular-nums text-destructive">
            {data.quarantinedBatches}
          </p>
          <p className="text-xs text-muted-foreground">{t('quarantined')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {data.disposedInPeriod}
          </p>
          <p className="text-xs text-muted-foreground">{t('disposed')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {data.wastageRate}%
          </p>
          <p className="text-xs text-muted-foreground">{t('wasteRate')}</p>
        </div>
      </div>
    </div>
  )
}
