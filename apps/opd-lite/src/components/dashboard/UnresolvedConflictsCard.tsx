'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { db } from '@/lib/db'
import { TIER_1_RESOURCE_TYPES } from '@/lib/conflict-resolution'
import { Card } from '@/components/Card'
import { Skeleton } from '@ultranos/ui-kit/components/ui/skeleton'
import { AlertTriangle } from '@ultranos/ui-kit/icons'

export function UnresolvedConflictsCard() {
  const t = useTranslations('dashboard')
  const [count, setCount] = useState<number | null>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadConflicts() {
      try {
        const conflicts = await db.syncQueue
          .filter(
            (entry) =>
              entry.conflictFlag === true &&
              entry.status !== 'synced' &&
              (TIER_1_RESOURCE_TYPES as readonly string[]).includes(entry.resourceType)
          )
          .count()
        setCount(conflicts)
      } catch {
        setCount(null)
      } finally {
        setLoading(false)
      }
    }

    loadConflicts()
    const interval = setInterval(loadConflicts, 10_000)
    return () => clearInterval(interval)
  }, [])

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
