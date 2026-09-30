'use client'

import { useTranslations } from 'next-intl'
import { Card } from '@/components/Card'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { CalendarDays } from '@ultranos/ui-kit/icons'
import { useTodayEncounters } from './use-dashboard-counts'

export function TodayEncountersCard() {
  const t = useTranslations('dashboard')
  const tEnc = useTranslations('encounter')
  const { stats, loading } = useTodayEncounters()

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('todayEncounters')}
        </h3>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{stats.total}</p>
      )}
      {stats.hasActive && (
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
          {tEnc('activeConsultation')}
        </span>
      )}
    </Card>
  )
}
