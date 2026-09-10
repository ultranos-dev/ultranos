'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Bell } from '@ultranos/ui-kit/icons'
import { getUnreadNotificationCount } from '@/lib/trpc'
import { NotificationPanel } from './NotificationPanel'

/**
 * Pharmacy notification bell — unread badge + panel. Polls the Hub every 30s.
 * Surfaces pharmacist-directed notifications (e.g. DISPENSE_REVIEW_RESOLVED when
 * a physician resolves an interaction/allergy override the pharmacist raised).
 */
export function NotificationBell() {
  const t = useTranslations('notifications')
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    setCount(await getUnreadNotificationCount())
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => { void refresh() }, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? t('bellUnreadAria', { count }) : t('bellAria')}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span
            data-testid="notif-badge"
            className="absolute -end-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} onChange={() => void refresh()} />}
    </div>
  )
}
