'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getFinancialSummary, type FinancialSummary } from '@/lib/reports/financial-report'

function formatAmount(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}

export function FinancialSummaryCard() {
  const t = useTranslations('reports')
  const [data, setData] = useState<FinancialSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getFinancialSummary()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{t('loadingFinancial')}</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">
        {t('revenueSummary')}
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('today')}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {formatAmount(data.todayRevenue)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('thisWeek')}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {formatAmount(data.weekRevenue)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('thisMonth')}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {formatAmount(data.monthRevenue)}
          </p>
        </div>
        <div>
          <p className="text-xs text-warning">{t('outstanding')}</p>
          <p className="text-lg font-semibold tabular-nums text-warning">
            {formatAmount(data.totalOutstanding)}
          </p>
        </div>
      </div>
    </div>
  )
}
