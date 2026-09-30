'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Card } from '@/components/Card'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { Copy } from '@ultranos/ui-kit/icons'
import { useDuplicateReviewsCount } from './use-dashboard-counts'

/**
 * Dashboard card showing the number of pending MPI duplicate reviews.
 * Fetches the count from the Hub API duplicate-review endpoint.
 */
export function DuplicateReviewsCard() {
  const t = useTranslations('duplicateReview')
  const { count, loading } = useDuplicateReviewsCount()

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('pendingReviews')}
        </h3>
        <Copy className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <p
            className="text-2xl font-semibold tabular-nums text-foreground"
            role="status"
            aria-label={t('pendingCountLabel', { count: count ?? 0 })}
          >
            {count ?? '·'}
          </p>
          {count !== null && count > 0 && (
            <span className="inline-flex items-center rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">
              {count}
            </span>
          )}
        </div>
      )}
      {!loading && count !== null && count > 0 && (
        <Link
          href="/duplicate-review"
          className="mt-2 inline-block min-h-[44px] text-sm font-semibold text-warning hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
        >
          {t('reviewNow')}
        </Link>
      )}
      {!loading && count === null && (
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t('unavailableOffline')}
        </p>
      )}
    </Card>
  )
}
