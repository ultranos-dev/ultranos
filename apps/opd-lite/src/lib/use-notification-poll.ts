'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchNotifications,
  acknowledgeNotification,
  deleteNotification,
  markUnreadNotification,
  type NotificationItem,
} from '@/lib/notification-api'

const POLL_INTERVAL_MS = 30_000 // 30s polling for <60s SLA
const PAGE_SIZE = 50 // rows fetched per "load more" step (matches server default)

export interface UseNotificationPollResult {
  notifications: NotificationItem[]
  newNotifications: NotificationItem[]
  unreadCount: number
  /** Total rows available for the caller (unwindowed) — drives "load more". */
  total: number
  /** True when the server holds more rows than the current window has loaded. */
  hasMore: boolean
  /** True while a loadMore fetch is in flight. */
  loadingMore: boolean
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  loadMore: () => Promise<void>
  acknowledge: (id: string) => Promise<void>
  acknowledgeAll: () => Promise<void>
  markUnread: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  setNotifications: React.Dispatch<React.SetStateAction<NotificationItem[]>>
}

/**
 * Shared polling hook for notification system.
 * Used by both NotificationBell (dropdown) and NotificationCenter (full page).
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
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const activeRef = useRef(true)
  const notificationsRef = useRef<NotificationItem[]>([])
  /** Current fetch window (grows as the user loads more). */
  const windowSizeRef = useRef(PAGE_SIZE)
  /** Tracks IDs seen since first load. Seeded on first successful fetch. */
  const seenIdsRef = useRef<Set<string> | null>(null)

  const computeUnread = useCallback((items: NotificationItem[]) => {
    return items.filter(n => n.status !== 'ACKNOWLEDGED').length
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const { notifications: items, total: totalCount } = await fetchNotifications(windowSizeRef.current)
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
        setTotal(totalCount)
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

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    windowSizeRef.current += PAGE_SIZE
    try {
      await fetchAll()
    } finally {
      if (activeRef.current) setLoadingMore(false)
    }
  }, [fetchAll, loadingMore])

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

  const markUnread = useCallback(async (id: string) => {
    // Optimistic update — flip back to unread (SENT) immediately
    setNotifications(prev => {
      const updated = prev.map(n =>
        n.id === id
          ? { ...n, status: 'SENT', acknowledgedAt: null }
          : n,
      )
      setUnreadCount(updated.filter(n => n.status !== 'ACKNOWLEDGED').length)
      return updated
    })

    try {
      await markUnreadNotification(id)
    } catch {
      // Best-effort — optimistic update stays
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    // Optimistic update — remove from local state immediately
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id)
      setUnreadCount(updated.filter(n => n.status !== 'ACKNOWLEDGED').length)
      return updated
    })
    setTotal(t => Math.max(0, t - 1))

    try {
      await deleteNotification(id)
    } catch {
      // Best-effort — optimistic removal stays
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
    newNotifications,
    unreadCount,
    total,
    hasMore: notifications.length < total,
    loadingMore,
    loading,
    error,
    refetch: fetchAll,
    loadMore,
    acknowledge,
    acknowledgeAll: acknowledgeAllFn,
    markUnread,
    remove,
    setNotifications,
  }
}
