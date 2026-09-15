'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listNotifications,
  acknowledgeNotification,
  type NotificationItem,
} from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const POLL_INTERVAL_MS = 30_000 // 30s polling for <60s SLA

export interface UseNotificationPollResult {
  notifications: NotificationItem[]
  newNotifications: NotificationItem[]
  unreadCount: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  acknowledge: (id: string) => Promise<void>
}

/**
 * Shared polling hook for lab-lite notification system.
 * Used by both NotificationPanel (dropdown) and NotificationToaster.
 * Polls notification.list every intervalMs (default 30s).
 *
 * newNotifications: items present in this poll cycle that were absent from the
 * seenIds set. seenIds is SEEDED on the first successful load so the initial
 * backlog does NOT produce toasts — only genuinely new arrivals do.
 */
export function useNotificationPoll(intervalMs = POLL_INTERVAL_MS): UseNotificationPollResult {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [newNotifications, setNewNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const activeRef = useRef(true)
  const notificationsRef = useRef<NotificationItem[]>([])
  /** Tracks IDs seen since first load. Seeded on first successful fetch. */
  const seenIdsRef = useRef<Set<string> | null>(null)

  const computeUnread = useCallback((items: NotificationItem[]) => {
    return items.filter(n => n.status !== 'ACKNOWLEDGED').length
  }, [])

  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    } catch {
      return null
    }
  }, [])

  const fetchAll = useCallback(async () => {
    const token = await getToken()
    if (!token) {
      if (activeRef.current) setLoading(false)
      return
    }
    try {
      const items = await listNotifications(token)
      if (activeRef.current) {
        if (seenIdsRef.current === null) {
          // First successful load — seed seenIds with all current IDs so the
          // initial backlog does NOT generate toasts.
          seenIdsRef.current = new Set(items.map(n => n.id))
          setNewNotifications([])
        } else {
          // Subsequent polls — surface only IDs that weren't seen before.
          const novel = items.filter(n => !seenIdsRef.current!.has(n.id))
          novel.forEach(n => seenIdsRef.current!.add(n.id))
          setNewNotifications(novel)
        }

        setNotifications(items)
        notificationsRef.current = items
        setUnreadCount(computeUnread(items))
        setError(null)
      }
    } catch {
      if (activeRef.current) {
        setError('Unable to fetch notifications')
      }
    } finally {
      if (activeRef.current) {
        setLoading(false)
      }
    }
  }, [computeUnread, getToken])

  // Initial fetch + polling
  useEffect(() => {
    activeRef.current = true
    fetchAll()
    const interval = setInterval(fetchAll, intervalMs)
    return () => {
      activeRef.current = false
      clearInterval(interval)
    }
  }, [fetchAll, intervalMs])

  const acknowledge = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? { ...n, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() }
          : n,
      )
      setUnreadCount(updated.filter(n => n.status !== 'ACKNOWLEDGED').length)
      return updated
    })

    try {
      const token = await getToken()
      if (!token) return
      await acknowledgeNotification(id, token)
    } catch {
      // Best-effort — optimistic update stays
    }
  }, [getToken])

  return {
    notifications,
    newNotifications,
    unreadCount,
    loading,
    error,
    refetch: fetchAll,
    acknowledge,
  }
}
