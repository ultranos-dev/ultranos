'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { NotificationBell as SharedNotificationBell } from '@ultranos/ui-kit/components/notifications/notification-bell'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import { deleteNotification, markUnreadNotification } from '@/lib/trpc'
import type { NotificationItem } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { PanelNotificationRow } from './NotificationPanel'

/**
 * Lab-Lite notification bell — adapts Lab's Hub notification poll to the SHARED
 * ui-kit NotificationBell shell (badge + dropdown + "See all"). The badge and
 * list both reflect Hub notifications, consistent with every other app; active
 * instrument alerts still surface on the equipment queue view. Rows reuse Lab's
 * PanelNotificationRow (lab-specific payload mapping + deep links).
 */
export function NotificationBell() {
  const tNotif = useTranslations('notifications')
  const router = useRouter()
  const { notifications: polled, unreadCount, loading, error, acknowledge } = useNotificationPoll()
  const [openId, setOpenId] = useState<string | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [statusOverrides, setStatusOverrides] = useState<Map<string, Partial<NotificationItem>>>(new Map())

  const notifications = useMemo(
    () => polled
      .filter(n => !deletedIds.has(n.id))
      .map(n => {
        const override = statusOverrides.get(n.id)
        return override ? { ...n, ...override } : n
      }),
    [polled, deletedIds, statusOverrides],
  )

  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      return data.session?.access_token ?? null
    } catch {
      return null
    }
  }, [])

  const handleAcknowledge = useCallback(async (id: string) => {
    setStatusOverrides(prev => { const next = new Map(prev); next.delete(id); return next })
    await acknowledge(id)
  }, [acknowledge])

  const handleMarkUnread = useCallback(async (id: string) => {
    setStatusOverrides(prev => { const next = new Map(prev); next.set(id, { status: 'SENT', acknowledgedAt: null }); return next })
    try {
      const token = await getToken()
      if (token) await markUnreadNotification(id, token)
    } catch {
      // Best-effort mark-unread — optimistic update stays
    }
  }, [getToken])

  const handleDelete = useCallback(async (id: string) => {
    setDeletedIds(prev => new Set([...prev, id]))
    setStatusOverrides(prev => { const next = new Map(prev); next.delete(id); return next })
    try {
      const token = await getToken()
      if (token) await deleteNotification(id, token)
    } catch {
      // Best-effort delete — row stays removed locally
    }
  }, [getToken])

  // Badge counts unread among the (locally-filtered) Hub notifications, matching
  // the dropdown list; falls back to the poll's count before any local overrides.
  const hasLocalEdits = deletedIds.size > 0 || statusOverrides.size > 0
  const badgeCount = hasLocalEdits
    ? notifications.filter(n => n.status !== 'ACKNOWLEDGED').length
    : unreadCount

  return (
    <SharedNotificationBell
      unreadCount={badgeCount}
      loading={loading}
      error={!!error}
      empty={!loading && !error && notifications.length === 0}
      onSeeAll={() => router.push('/notifications')}
    >
      {notifications.map(n => (
        <PanelNotificationRow
          key={n.id}
          notification={n}
          openId={openId}
          setOpenId={setOpenId}
          onAcknowledge={handleAcknowledge}
          onMarkUnread={handleMarkUnread}
          onDelete={handleDelete}
          onNavigate={(path) => { router.push(path) }}
          tNotif={tNotif}
        />
      ))}
    </SharedNotificationBell>
  )
}
