'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X } from '@ultranos/ui-kit/icons'
import { listNotifications, acknowledgeNotification, type NotificationItem } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { NotificationItemRow } from './NotificationItem'

/**
 * Notification dropdown panel anchored below the bell icon.
 * Fetches notifications on open, supports click-outside and Escape to dismiss.
 * Story 17.4 — Task 3 (AC #1, #2, #3, #6)
 */
export function NotificationPanel({
  onClose,
  onCountChange,
}: {
  onClose: () => void
  onCountChange: (count: number) => void
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fetch notifications on open
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token || !active) return

        const items = await listNotifications(token)
        if (active) {
          setNotifications(items)
          onCountChange(items.filter((n) => n.status !== 'ACKNOWLEDGED').length)
        }
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onCountChange is stable setState
  }, [])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Don't close if clicking the bell button itself (parent handles toggle)
        const bell = panelRef.current.closest('.relative')
        if (bell && bell.contains(e.target as Node)) return
        onClose()
      }
    }
    // Use timeout to avoid catching the click that opened the panel
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleAcknowledge = useCallback(async (id: string) => {
    // Optimistic update — update UI immediately, fire API in background
    setNotifications((prev) => {
      const updated = prev.map((n) =>
        n.id === id
          ? { ...n, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() }
          : n,
      )
      onCountChange(updated.filter((n) => n.status !== 'ACKNOWLEDGED').length)
      return updated
    })
    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) return

      await acknowledgeNotification(id, token)
    } catch {
      // Best-effort — if offline, notification reappears as unread on next panel open
    }
  }, [onCountChange])

  return (
    <>
      <style>{`
  @keyframes notifBackdropIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes notifPanelIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
`}</style>
      <div className="fixed inset-0 z-40 animate-[notifBackdropIn_100ms_ease-out_forwards]" />
      <div
        ref={panelRef}
        className="absolute end-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-[notifPanelIn_150ms_ease-out_forwards] [transform-origin:top_right]"
        role="dialog"
        aria-label="Notifications"
        data-testid="notification-panel"
      >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-muted-foreground [@media(hover:hover)and(pointer:fine)]:hover:text-muted-foreground active:brightness-[0.88] transition-all duration-150"
          aria-label="Close notifications"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2 justify-center">
              <svg className="animate-spin h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.938l3-2.647z" />
              </svg>
              Loading...
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-8 text-center text-sm text-amber-600" data-testid="notification-error">
            Unable to load notifications. Check your connection.
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No notifications
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
    </>
  )
}
