'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchNotifications,
  acknowledgeNotification,
  type AdminNotificationItem,
} from '@/lib/notification-client'

const POLL_INTERVAL_MS = 30_000 // 30s polling for <60s SLA

export interface UseNotificationPollResult {
  notifications: AdminNotificationItem[]
  newNotifications: AdminNotificationItem[]
  unreadCount: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  acknowledge: (id: string) => Promise<void>
  acknowledgeAll: () => Promise<void>
}

/**
 * Polling hook for admin notification system.
 * Used by both NotificationBell (dropdown) and NotificationToaster.
 * Polls notification.list every intervalMs (default 30s).
 *
 * newNotifications: items present in this poll cycle that were absent from
 * seenIds. seenIds is SEEDED on the first successful load so the initial
 * backlog does NOT produce toasts — only genuinely new arrivals do.
 */
export function useNotificationPoll(intervalMs = POLL_INTERVAL_MS): UseNotificationPollResult {
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([])
  const [newNotifications, setNewNotifications] = useState<AdminNotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const activeRef = useRef(true)
  const notificationsRef = useRef<AdminNotificationItem[]>([])
  /** Tracks IDs seen since first load. Seeded on first successful fetch. */
  const seenIdsRef = useRef<Set<string> | null>(null)

  const computeUnread = useCallback((items: AdminNotificationItem[]) => {
    return items.filter(n => n.status !== 'ACKNOWLEDGED').length
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const items = await fetchNotifications()
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
  }, [computeUnread])

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
      await acknowledgeNotification(id)
    } catch {
      // Best-effort — optimistic update stays
    }
  }, [])

  const acknowledgeAllFn = useCallback(async () => {
    const unread = notificationsRef.current.filter(n => n.status !== 'ACKNOWLEDGED')
    if (unread.length === 0) return

    // Optimistic: mark all as read locally
    setNotifications(prev => {
      const updated = prev.map(n => ({
        ...n,
        status: 'ACKNOWLEDGED',
        acknowledgedAt: n.acknowledgedAt ?? new Date().toISOString(),
      }))
      notificationsRef.current = updated
      return updated
    })
    setUnreadCount(0)

    // Fire all acknowledge calls concurrently
    await Promise.allSettled(
      unread.map(n => acknowledgeNotification(n.id)),
    )
  }, [])

  return {
    notifications,
    newNotifications,
    unreadCount,
    loading,
    error,
    refetch: fetchAll,
    acknowledge,
    acknowledgeAll: acknowledgeAllFn,
  }
}
