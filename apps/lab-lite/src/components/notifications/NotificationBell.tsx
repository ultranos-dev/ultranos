'use client'

import { useState, useEffect } from 'react'
import { getUnreadCount } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useDataBudgetStore } from '@/stores/data-budget-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getActiveInstrumentNotifications } from '@/lib/equipment-service'
import { NotificationPanel } from './NotificationPanel'
import { Bell } from '@ultranos/ui-kit/icons'

/**
 * Bell icon with unread count badge. Polls Hub API every 30 seconds (10 min in low data mode).
 * Story 17.4 — Task 1 (AC #1, #5)
 */
export function NotificationBell() {
  const lowDataMode = useDataBudgetStore((s) => s.lowDataMode)
  const pollIntervalMs = lowDataMode ? 600_000 : 30_000 // 10 min in low data mode, 30s normal

  const [unreadCount, setUnreadCount] = useState(0)
  const [instrumentNotifCount, setInstrumentNotifCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const techId = useAuthSessionStore((s) => s.session?.practitionerId ?? '')

  useEffect(() => {
    let active = true

    const poll = async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token || !active) {
          if (active) setHasSession(false)
          return
        }

        if (active) setHasSession(true)
        const count = await getUnreadCount(token)
        if (active) setUnreadCount(count)
      } catch {
        // Silently handle — network may be unavailable (offline-first)
      }
    }

    poll()
    const interval = setInterval(poll, pollIntervalMs)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [lowDataMode, pollIntervalMs])

  // P10: poll Dexie instrument notifications so they surface in the badge
  // even when the tech is not on the equipment page
  useEffect(() => {
    if (!techId) return
    let active = true
    const poll = async () => {
      try {
        const notifs = await getActiveInstrumentNotifications(techId)
        if (active) setInstrumentNotifCount(notifs.length)
      } catch {
        // Dexie unavailable — no badge increment
      }
    }
    poll()
    const interval = setInterval(poll, pollIntervalMs)
    return () => { active = false; clearInterval(interval) }
  }, [techId, pollIntervalMs])

  const totalUnread = unreadCount + instrumentNotifCount

  if (!hasSession) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-full p-2 text-muted-foreground [@media(hover:hover)and(pointer:fine)]:hover:bg-muted [@media(hover:hover)and(pointer:fine)]:hover:text-foreground active:brightness-[0.88] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label={`Notifications${totalUnread > 0 ? ` (${totalUnread} unread)` : ''}`}
      >
        {/* Bell SVG */}
        <Bell size={24} aria-hidden="true" />

        {/* Unread badge */}
        {totalUnread > 0 && (
          <span
            className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white"
            data-testid="unread-badge"
          >
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationPanel
          onClose={() => setIsOpen(false)}
          onCountChange={setUnreadCount}
        />
      )}
    </div>
  )
}
