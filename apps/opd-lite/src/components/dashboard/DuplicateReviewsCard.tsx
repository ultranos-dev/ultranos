'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Card } from '@/components/Card'

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
        const { getSupabaseBrowserClient } = await import('@/lib/supabase')
        const { data: authData } = await getSupabaseBrowserClient().auth.getSession()
        const token = authData.session?.access_token
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const hubUrl =
          process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
        const res = await fetch(
          `${hubUrl}/duplicateReview.pendingCount?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
          { method: 'GET', headers }
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
    <Card>
      <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wide">
        {t('pendingReviews')}
      </h3>
      <div className="mt-2 flex items-center gap-2">
        <p
          className="text-3xl font-black text-foreground"
          role="status"
          aria-label={t('pendingCountLabel', { count: count ?? 0 })}
        >
          {count ?? '\u2014'}
        </p>
        {count !== null && count > 0 && (
          <span className="inline-flex items-center rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </div>
      {count !== null && count > 0 && (
        <Link
          href="/duplicate-review"
          className="mt-2 inline-block min-h-[44px] text-sm font-semibold text-warning hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
        >
          {t('reviewNow')}
        </Link>
      )}
      {count === null && (
        <p className="mt-2 text-sm font-semibold text-muted-foreground">
          {t('unavailableOffline')}
        </p>
      )}
    </Card>
  )
}
