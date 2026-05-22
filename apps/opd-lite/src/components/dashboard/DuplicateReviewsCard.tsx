'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

/**
 * Dashboard card showing the number of pending MPI duplicate reviews.
 * Fetches the count from the Hub API duplicate-review endpoint.
 */
export function DuplicateReviewsCard() {
  const t = useTranslations('duplicateReview')
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    async function loadPendingCount() {
      try {
        // TODO: Replace with tRPC client call once wired up:
        // const { data } = trpc.duplicateReview.pendingCount.useQuery()
        const hubUrl =
          process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
        const res = await fetch(
          `${hubUrl}/duplicateReview.pendingCount?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        )

        if (!res.ok) throw new Error(`Hub API error: ${res.status}`)

        const body = (await res.json()) as {
          result: { data: { json: { count: number } } }
        }
        setCount(body.result.data.json.count)
      } catch {
        // Network unavailable — keep last known count (null on first load)
      }
    }

    loadPendingCount()
    const interval = setInterval(loadPendingCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-xl bg-card-bg p-5 shadow-sm">
      <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">
        {t('pendingReviews')}
      </h3>
      <div className="mt-2 flex items-center gap-2">
        <p
          className="text-3xl font-black text-neutral-900"
          role="status"
          aria-label={t('pendingCountLabel', { count: count ?? 0 })}
        >
          {count ?? '\u2014'}
        </p>
        {count !== null && count > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </div>
      {count !== null && count > 0 && (
        <Link
          href="/duplicate-review"
          className="mt-2 inline-block min-h-[44px] text-sm font-semibold text-amber-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          {t('reviewNow')}
        </Link>
      )}
      {count === null && (
        <p className="mt-2 text-sm font-semibold text-neutral-400">
          {t('unavailableOffline')}
        </p>
      )}
    </div>
  )
}
