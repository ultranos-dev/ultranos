'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  listNotifications,
  acknowledgeNotification,
  acknowledgeAllNotifications,
  type NotificationItem,
} from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { NotificationItemRow } from '@/components/notifications/NotificationItem'

export default function NotificationsPage() {
  const t = useTranslations('notifications')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const getToken = useCallback(async (): Promise<string | null> => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const token = await getToken()
        if (!token || !active) return
        const items = await listNotifications(token)
        if (active) setNotifications(items)
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [getToken])

  const handleAcknowledge = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() }
          : n,
      ),
    )
    try {
      const token = await getToken()
      if (token) await acknowledgeNotification(id, token)
    } catch {
      // Best-effort
    }
  }, [getToken])

  const handleMarkAllRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() })),
    )
    try {
      const token = await getToken()
      if (token) await acknowledgeAllNotifications(token)
    } catch {
      // Best-effort
    }
  }, [getToken])

  const unreadCount = notifications.filter((n) => n.status !== 'ACKNOWLEDGED').length

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            type="button"
            onClick={handleMarkAllRead}
          >
            {t('markAllRead')}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground" aria-busy="true">
            <span className="flex items-center gap-2 justify-center">
              <svg className="motion-safe:animate-spin h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.938l3-2.647z" />
              </svg>
              {t('loading')}
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-8 text-center text-sm text-amber-600">
            {t('loadError')}
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        )}

        {!loading &&
          notifications.map((n) => (
            <NotificationItemRow
              key={n.id}
              notification={n}
              onAcknowledge={handleAcknowledge}
            />
          ))}
      </div>
    </div>
  )
}
