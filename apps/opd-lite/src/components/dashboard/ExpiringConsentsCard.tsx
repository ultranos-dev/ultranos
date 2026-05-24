'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/Card'

/**
 * Dashboard card showing the number of active consents expiring within 90 days.
 * Fetches the count from the Hub API consent.expiringCount endpoint.
 *
 * TODO i18n keys to add to messages/{locale}.json under "consent":
 *   expiringConsents, expiringCountLabel, reviewNow, unavailableOffline
 */
export function ExpiringConsentsCard() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    async function loadExpiringCount() {
      try {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase')
        const { data: authData } = await getSupabaseBrowserClient().auth.getSession()
        const token = authData.session?.access_token
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const hubUrl =
          process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
        const res = await fetch(
          `${hubUrl}/consent.expiringCount?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
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

    loadExpiringCount()
    const interval = setInterval(loadExpiringCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card>
      <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">
        {/* TODO: t('consent.expiringConsents') */}
        Expiring Consents
      </h3>
      <div className="mt-2 flex items-center gap-2">
        <p
          className="text-3xl font-black text-neutral-900"
          role="status"
          aria-label={`${count ?? 0} consents expiring soon`}
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
          href="/expiring-consents"
          className="mt-2 inline-block min-h-[44px] text-sm font-semibold text-amber-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          {/* TODO: t('consent.reviewNow') */}
          Review Now
        </Link>
      )}
      {count === null && (
        <p className="mt-2 text-sm font-semibold text-neutral-400">
          {/* TODO: t('consent.unavailableOffline') */}
          Unavailable offline
        </p>
      )}
    </Card>
  )
}
