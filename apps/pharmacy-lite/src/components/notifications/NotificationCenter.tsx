'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import { deleteNotification, markUnreadNotification } from '@/lib/trpc'
import type { PharmacyNotification } from '@/lib/trpc'
import { PanelNotificationRow } from './NotificationPanel'

/**
 * Full-page "See all notifications" list for Pharmacy-Lite. Reuses the same
 * PanelNotificationRow + poll the header bell uses, laid out in the shared
 * list-page box idiom.
 */
export function NotificationCenter() {
  const tNotif = useTranslations('notifications')
  const router = useRouter()
  const { notifications: polled, loading, error, acknowledge } = useNotificationPoll()
  const [openId, setOpenId] = useState<string | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [statusOverrides, setStatusOverrides] = useState<Map<string, Partial<PharmacyNotification>>>(new Map())

  const notifications = useMemo(
    () => polled
      .filter(n => !deletedIds.has(n.id))
      .map(n => {
        const override = statusOverrides.get(n.id)
        return override ? { ...n, ...override } : n
      }),
    [polled, deletedIds, statusOverrides],
  )

  const handleAcknowledge = useCallback(async (id: string) => {
    setStatusOverrides(prev => { const next = new Map(prev); next.delete(id); return next })
    await acknowledge(id)
  }, [acknowledge])

  const handleMarkUnread = useCallback(async (id: string) => {
    setStatusOverrides(prev => { const next = new Map(prev); next.set(id, { status: 'SENT', acknowledgedAt: null }); return next })
    try {
      await markUnreadNotification(id)
    } catch {
      // Best-effort mark-unread
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setDeletedIds(prev => new Set([...prev, id]))
    setStatusOverrides(prev => { const next = new Map(prev); next.delete(id); return next })
    try {
      await deleteNotification(id)
    } catch {
      // Best-effort delete
    }
  }, [])

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
      {error ? (
        <p className="flex min-h-[16rem] items-center justify-center px-4 text-center text-sm text-destructive">
          {tNotif('error')}
        </p>
      ) : loading ? (
        <p className="flex min-h-[16rem] items-center justify-center px-4 text-center text-sm text-muted-foreground">
          {tNotif('loading')}
        </p>
      ) : notifications.length === 0 ? (
        <div className="flex min-h-[16rem] items-center justify-center">
          <EmptyState title={tNotif('empty')} />
        </div>
      ) : (
        <div className="divide-y divide-border">
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
        </div>
      )}
    </div>
  )
}
