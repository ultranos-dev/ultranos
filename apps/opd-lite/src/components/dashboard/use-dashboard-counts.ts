'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { TIER_1_RESOURCE_TYPES } from '@/lib/conflict-resolution'
import { fetchNotifications } from '@/lib/notification-api'
import { getHubTrpcUrl } from '@/lib/hub-url'
import { useEncounterStore } from '@/stores/encounter-store'
import { subscribeAppointmentChanges } from '@/hooks/useAppointments'
import { deserializeHlc } from '@ultranos/sync-engine'
import type { FhirAppointmentZod } from '@ultranos/shared-types'

/**
 * Shared dashboard count hooks.
 *
 * These extract the data-fetching that previously lived inside each summary
 * Card so both the compact dashboard "attention" chips and the legacy Card
 * components can share one source of truth — no duplicated Dexie/Hub queries.
 *
 * A `null` count means "unavailable" (network/Dexie error) and must never be
 * rendered as "0": for safety-relevant items (conflicts) a false zero would
 * mask work that needs a physician.
 */

export function useUnresolvedConflictsCount(): { count: number | null; loading: boolean } {
  const [count, setCount] = useState<number | null>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
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

    load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [])

  return { count, loading }
}

export interface TodayEncounterStats {
  total: number
  hasActive: boolean
}

export function useTodayEncounters(): { stats: TodayEncounterStats; loading: boolean } {
  const [stats, setStats] = useState<TodayEncounterStats>({ total: 0, hasActive: false })
  const [loading, setLoading] = useState(true)
  const activeEncounter = useEncounterStore((s) => s.activeEncounter)

  useEffect(() => {
    async function load() {
      try {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayMs = todayStart.getTime()

        const encounters = await db.encounters
          .orderBy('_ultranos.hlcTimestamp')
          .filter((e) => {
            const ts = e._ultranos?.hlcTimestamp ?? ''
            if (!ts) {
              const fallback = e.meta?.lastUpdated ?? ''
              return fallback ? new Date(fallback).getTime() >= todayMs : false
            }
            try {
              const hlc = deserializeHlc(ts)
              return hlc.wallMs >= todayMs
            } catch {
              return false
            }
          })
          .toArray()

        setStats({
          total: encounters.length,
          hasActive: encounters.some((e) => e.status === 'in-progress'),
        })
      } catch {
        setStats({ total: 0, hasActive: false })
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [activeEncounter])

  return { stats, loading }
}

export interface TodayAppointmentCounts {
  /** Total scheduled (non-walk-in) appointments booked for today, excl. cancelled. */
  scheduled: number
  /** Patients waiting to be seen: every walk-in in the queue PLUS scheduled
   *  patients who have checked in (status → arrived). */
  waiting: number
}

/**
 * Today's appointment load for the dashboard attention line. Reads the same
 * Dexie `appointments` store the appointments page uses (queried by today's
 * `start` window) and refreshes on any appointment change broadcast plus a slow
 * poll. A `null` result means the local store was unreadable.
 */
export function useTodayAppointmentCounts(): {
  counts: TodayAppointmentCounts | null
  loading: boolean
} {
  const [counts, setCounts] = useState<TodayAppointmentCounts | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date()
        end.setHours(23, 59, 59, 999)

        const appts = (await db.appointments
          .where('start')
          .between(start.toISOString(), end.toISOString(), true, true)
          .toArray()) as FhirAppointmentZod[]

        const isActive = (a: FhirAppointmentZod) =>
          a.status !== 'cancelled' && a.status !== 'entered-in-error'

        const scheduled = appts.filter((a) => !a._ultranos.walkIn && isActive(a)).length
        const waiting = appts.filter(
          (a) => isActive(a) && (a._ultranos.walkIn || a.status === 'arrived'),
        ).length

        if (!cancelled) setCounts({ scheduled, waiting })
      } catch {
        if (!cancelled) setCounts(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const interval = setInterval(load, 10_000)
    const unsubscribe = subscribeAppointmentChanges(() => void load())
    return () => {
      cancelled = true
      clearInterval(interval)
      unsubscribe()
    }
  }, [])

  return { counts, loading }
}

export function usePendingLabResultsCount(): { count: number | null; loading: boolean } {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { notifications } = await fetchNotifications()
        const labUnread = notifications.filter(
          (n) => n.type === 'LAB_RESULT_AVAILABLE' && n.status !== 'ACKNOWLEDGED'
        ).length
        setCount(labUnread)
      } catch {
        // Network unavailable — keep last known count (null on first load)
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [])

  return { count, loading }
}

export function useDuplicateReviewsCount(): { count: number | null; loading: boolean } {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase')
        const { data: authData } = await getSupabaseBrowserClient().auth.getSession()
        const token = authData.session?.access_token
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        const hubUrl = getHubTrpcUrl()
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
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [])

  return { count, loading }
}
