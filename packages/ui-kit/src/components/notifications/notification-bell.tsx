'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, ChevronRight } from '../../icons.js'
import { DirectionalIcon } from '../DirectionalIcon.js'
import { EmptyState } from '../ui/empty-state.js'

export interface NotificationBellProps {
  /** Number of unread notifications — drives the red badge. */
  unreadCount: number
  /** Data-fetch is in flight (first load) — shows a loading line. */
  loading?: boolean
  /** Data-fetch failed — shows an error line (never a false "no notifications"). */
  error?: boolean
  /** No notifications to show — renders the shared EmptyState. */
  empty?: boolean
  /** "See all notifications" handler; omit to hide the button (apps without a page). */
  onSeeAll?: () => void
  /** The rendered notification rows (each app maps its own data → NotificationRow + modal). */
  children?: ReactNode
}

/**
 * Shared header notification bell used by every Ultranos web app.
 *
 * Presentational shell only — it owns the bell button, unread badge, dropdown
 * chrome, "See all notifications" affordance, and the loading/error/empty
 * states. Each app injects its unread count and its own rows (which carry the
 * app-specific payload mapping, deep links, and i18n) via `children`, plus an
 * `onSeeAll` navigation callback. This mirrors the shared PatientSearchBar
 * adapter pattern.
 *
 * i18n: reads the app's `notifications` namespace (title, closeAria, loading,
 * error, empty, bellAria, bellUnreadAria, seeAll).
 */
export function NotificationBell({
  unreadCount,
  loading = false,
  error = false,
  empty = false,
  onSeeAll,
  children,
}: NotificationBellProps) {
  const t = useTranslations('notifications')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount > 0 ? t('bellUnreadAria', { count: unreadCount }) : t('bellAria')}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            data-testid="notif-badge"
            className="absolute -end-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notification-panel"
          className="absolute end-0 top-11 z-50 w-80 overflow-hidden rounded-xl bg-popover shadow-lg ring-[0.65px] ring-border/50"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-sm font-semibold text-foreground">{t('title')}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('closeAria')}
              className="text-lg leading-none text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </div>

          {onSeeAll && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSeeAll()
              }}
              className="flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-muted"
            >
              {t('seeAll')}
              <DirectionalIcon category="navigation">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </DirectionalIcon>
            </button>
          )}

          <div className="max-h-96 overflow-y-auto">
            {error ? (
              <p data-testid="notification-error" className="px-4 py-6 text-center text-sm text-destructive">
                {t('error')}
              </p>
            ) : loading ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('loading')}</p>
            ) : empty ? (
              <EmptyState title={t('empty')} size="sm" />
            ) : (
              <div className="divide-y divide-border">{children}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
