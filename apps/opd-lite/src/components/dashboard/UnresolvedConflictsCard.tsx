'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { db } from '@/lib/db'
import { TIER_1_RESOURCE_TYPES } from '@/lib/conflict-resolution'
import { Card } from '@/components/Card'

export function UnresolvedConflictsCard() {
  const t = useTranslations('dashboard')
  const [count, setCount] = useState<number | null>(0)

  useEffect(() => {
    async function loadConflicts() {
      try {
        const conflicts = await db.syncQueue
          .filter(
            (entry) =>
              entry.conflictFlag === true &&
              entry.status !== 'resolved' &&
              (TIER_1_RESOURCE_TYPES as readonly string[]).includes(entry.resourceType)
          )
          .count()
        setCount(conflicts)
      } catch {
        setCount(null)
      }
    }

    loadConflicts()
    const interval = setInterval(loadConflicts, 10_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card>
      <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">
        {t('unresolvedConflicts')}
      </h3>
      <div className="mt-2 flex items-center gap-2">
        <p className="text-3xl font-black text-neutral-900">{count ?? '—'}</p>
        {count !== null && count > 0 && (
          <span className="inline-flex items-center rounded-full bg-conflict-red px-2 py-0.5 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </div>
      {count !== null && count > 0 && (
        <Link
          href="/conflicts"
          className="mt-2 inline-block text-sm font-semibold text-conflict-red hover:underline"
        >
          {t('physicianReview')}
        </Link>
      )}
      {count === null && (
        <p className="mt-2 text-sm font-semibold text-conflict-red">
          {t('conflictCheckUnavailable')}
        </p>
      )}
    </Card>
  )
}
