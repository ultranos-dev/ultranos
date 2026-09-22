'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { Bell, FileSearch, AlertTriangle } from '@ultranos/ui-kit/icons'
import {
  listNotifications,
  acknowledgeNotification,
  acknowledgeAllNotifications,
  type NotificationItem,
} from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { NotificationItemRow } from '@/components/notifications/NotificationItem'

type ReadFilter = 'ALL' | 'UNREAD' | 'READ'

const READ_FILTERS: ReadFilter[] = ['ALL', 'UNREAD', 'READ']

export default function NotificationsPage() {
  const t = useTranslations('notifications')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [readFilter, setReadFilter] = useState<ReadFilter>('ALL')

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

  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      const isUnread = n.status !== 'ACKNOWLEDGED'
      if (readFilter === 'UNREAD' && !isUnread) return false
      if (readFilter === 'READ' && isUnread) return false
      if (query) {
        const haystack = `${n.type} ${n.payload?.testCategory ?? ''} ${n.payload?.message ?? ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [notifications, readFilter, query])

  const filtersActive = query !== '' || readFilter !== 'ALL'
  const unreadCount = notifications.filter((n) => n.status !== 'ACKNOWLEDGED').length

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: search + read/unread pills + mark-all — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchPlaceholder')}
        />
        <div role="tablist" className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {READ_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-pressed={readFilter === f}
              onClick={() => setReadFilter(f)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                readFilter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'ALL' ? t('filterAll') : f === 'UNREAD' ? t('filterUnread') : t('filterRead')}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          type="button"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
        >
          {t('markAllRead')}
        </Button>
      </div>

      {/* Content box — single cohesive box (loading / error / empty / list) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
            {t('loading')}
          </div>
        ) : error && notifications.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState icon={AlertTriangle} title={t('loadError')} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : Bell}
              title={filtersActive ? t('noResults') : t('empty')}
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((n) => (
              <NotificationItemRow
                key={n.id}
                notification={n}
                onAcknowledge={handleAcknowledge}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
