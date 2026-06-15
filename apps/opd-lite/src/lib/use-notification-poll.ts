'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchNotifications,
  acknowledgeNotification,
  type NotificationItem,
} from '@/lib/notification-api'

const POLL_INTERVAL_MS = 30_000 // 30s polling for <60s SLA

export interface UseNotificationPollResult {
  notifications: NotificationItem[]
  unreadCount: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  acknowledge: (id: string) => Promise<void>
  acknowledgeAll: () => Promise<void>
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>
}

/**
 * Shared polling hook for notification system.
 * Used by both NotificationBell (dropdown) and NotificationCenter (full page).
 * Polls notification.list every intervalMs (default 30s).
 */
export function useNotificationPoll(intervalMs = POLL_INTERVAL_MS): UseNotificationPollResult {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const activeRef = useRef(true)
  const notificationsRef = useRef<NotificationItem[]>([])

  const computeUnread = useCallback((items: NotificationItem[]) => {
    return items.filter(n => n.status !== 'ACKNOWLEDGED').length
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const { notifications: items } = await fetchNotifications()
      if (activeRef.current) {
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

    // Fire all acknowledge calls concurrently (no bulk endpoint yet)
    // TODO: Add notification.acknowledgeAll Hub API endpoint for efficiency
    await Promise.allSettled(
      unread.map(n => acknowledgeNotification(n.id)),
    )
  }, [])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchAll,
    acknowledge,
    acknowledgeAll: acknowledgeAllFn,
    setNotifications,
  }
}
