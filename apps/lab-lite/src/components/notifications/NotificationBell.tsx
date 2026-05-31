'use client'

import { useState, useEffect } from 'react'
import { getUnreadCount } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { NotificationPanel } from './NotificationPanel'
import { Bell } from '@ultranos/ui-kit/icons'

const POLL_INTERVAL_MS = 30_000 // 30s polling — meets 60s SLA (Epic 12 decision)

/**
 * Bell icon with unread count badge. Polls Hub API every 30 seconds.
 * Story 17.4 — Task 1 (AC #1, #5)
 */
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [hasSession, setHasSession] = useState(false)

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
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  if (!hasSession) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-full p-2 text-neutral-600 [@media(hover:hover)and(pointer:fine)]:hover:bg-neutral-100 [@media(hover:hover)and(pointer:fine)]:hover:text-neutral-900 active:brightness-[0.88] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        {/* Bell SVG */}
        <Bell size={24} aria-hidden="true" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white"
            data-testid="unread-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
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
