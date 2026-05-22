'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchUnreadCount } from '@/lib/notification-api'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface NavBadges {
  notifications: number
  conflicts: number
  duplicateReviews: number
  expiringConsents: number
}

const POLL_INTERVAL_MS = 30_000

/**
 * Aggregates badge counts for sidebar navigation items.
 * Polls the Hub API for counts every 30 seconds (matches existing NotificationBell pattern).
 * Returns 0 for counts that fail to fetch (fail-silent, no false positives).
 */
export function useNavBadges(): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({
    notifications: 0,
    conflicts: 0,
    duplicateReviews: 0,
    expiringConsents: 0,
  })
  const session = useAuthSessionStore((s) => s.session)

  const fetchBadges = useCallback(async () => {
    if (!session) return

    // Fetch all counts in parallel — each fails independently
    const [notifResult, conflictResult, dupeResult, consentResult] =
      await Promise.allSettled([
        fetchUnreadCount(),
        fetchTrpcCount('patient.unresolvedConflictCount'),
        fetchTrpcCount('duplicateReview.pendingCount'),
        fetchTrpcCount('consent.expiringCount'),
      ])

    setBadges({
      notifications:
        notifResult.status === 'fulfilled'
          ? notifResult.value?.count ?? 0
          : 0,
      conflicts:
        conflictResult.status === 'fulfilled' ? conflictResult.value : 0,
      duplicateReviews:
        dupeResult.status === 'fulfilled' ? dupeResult.value : 0,
      expiringConsents:
        consentResult.status === 'fulfilled' ? consentResult.value : 0,
    })
  }, [session])

  useEffect(() => {
    fetchBadges()
    const interval = setInterval(fetchBadges, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchBadges])

  return badges
}

/**
 * Fetches a numeric count from a Hub API tRPC query endpoint.
 * Reuses the same URL/auth pattern as notification-api.ts.
 */
async function fetchTrpcCount(path: string): Promise<number> {
  const hubUrl =
    process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'

  // Dynamic import to reuse Supabase auth token (same pattern as notification-api)
  const { getSupabaseBrowserClient } = await import('@/lib/supabase')
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = new URL(hubUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path

  const res = await fetch(url.toString(), { method: 'GET', headers })
  if (!res.ok) {
    throw new Error(`Hub API error: ${res.status}`)
  }

  const body = (await res.json()) as { result: { data: { json: number } } }
  return body.result.data.json ?? 0
}
