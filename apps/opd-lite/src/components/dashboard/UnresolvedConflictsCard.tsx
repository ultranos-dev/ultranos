'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Card } from '@/components/Card'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import { useUnresolvedConflictsCount } from './use-dashboard-counts'

export function UnresolvedConflictsCard() {
  const t = useTranslations('dashboard')
  const { count, loading } = useUnresolvedConflictsCount()

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('unresolvedConflicts')}
        </h3>
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <p className={`text-2xl font-semibold tabular-nums ${count !== null && count > 0 ? 'text-destructive' : 'text-foreground'}`}>
            {count ?? '·'}
          </p>
          {count !== null && count > 0 && (
            <span className="inline-flex items-center rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-semibold text-destructive">
              {count}
            </span>
          )}
        </div>
      )}
      {!loading && count !== null && count > 0 && (
        <Link
          href="/conflicts"
          className="mt-2 inline-block text-sm font-semibold text-destructive hover:underline"
        >
          {t('physicianReview')}
        </Link>
      )}
      {count === null && (
        <p className="mt-2 text-sm font-semibold text-destructive">
          {t('conflictCheckUnavailable')}
        </p>
      )}
    </Card>
  )
}
