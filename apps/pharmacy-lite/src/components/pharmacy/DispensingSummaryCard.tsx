'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

interface DispensingSummaryCardProps {
  dispensedToday: number
  pendingSync: number
  failedSync: number
}

export const DispensingSummaryCard = memo(function DispensingSummaryCard({
  dispensedToday,
  pendingSync,
  failedSync,
}: DispensingSummaryCardProps) {
  const t = useTranslations('dispensing')
  return (
    <div
      data-testid="dispensing-summary-card"
      className="flex flex-col rounded-xl bg-card p-5 text-start shadow-card ring-[0.65px] ring-border/50"
    >
      <p className="text-sm font-medium text-muted-foreground">{t('todaysDispensing')}</p>
      <p
        data-testid="dispensed-today-count"
        className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums"
      >
        {dispensedToday}
      </p>
      <div className="mt-1 flex items-center gap-3 text-sm font-medium">
        <span className="text-muted-foreground">
          {t('pendingSync')}{' '}
          <span
            data-testid="pending-sync-count"
            className={`tabular-nums ${pendingSync > 0 ? 'text-warning' : 'text-muted-foreground'}`}
          >
            {pendingSync}
          </span>
        </span>
        <span className="text-muted-foreground">
          {t('failedSync')}{' '}
          <span
            data-testid="failed-sync-count"
            className={`tabular-nums ${failedSync > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {failedSync}
          </span>
        </span>
      </div>
    </div>
  )
})
