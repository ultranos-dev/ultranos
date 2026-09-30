'use client'

import { useTranslations } from 'next-intl'
import { Card } from '@/components/Card'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { FlaskConical } from '@ultranos/ui-kit/icons'
import { usePendingLabResultsCount } from './use-dashboard-counts'

export function PendingLabResultsCard() {
  const t = useTranslations('dashboard')
  const { count, loading } = usePendingLabResultsCount()

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('pendingLabResults')}
        </h3>
        <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{count ?? '·'}</p>
      )}
      {!loading && count !== null && count > 0 && (
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t('unreadResults')}
        </p>
      )}
      {!loading && count === null && (
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t('unavailableOffline')}
        </p>
      )}
    </Card>
  )
}
