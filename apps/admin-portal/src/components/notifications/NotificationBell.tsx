'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bell } from '@ultranos/ui-kit/icons'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import { NotificationPanel } from './NotificationPanel'

/**
 * Admin notification bell — unread badge + dropdown panel.
 * Mount in BreadcrumbHeader (right side, before LanguageSelectorClient).
 */
export function NotificationBell() {
  const t = useTranslations('notifications')
  const [open, setOpen] = useState(false)

  const { unreadCount, refetch } = useNotificationPoll()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unreadCount > 0 ? t('bellUnreadAria', { count: unreadCount }) : t('bellAria')}
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
        <NotificationPanel
          onClose={() => setOpen(false)}
          onChange={() => void refetch()}
        />
      )}
    </div>
  )
}
