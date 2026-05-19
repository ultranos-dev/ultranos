/**
 * Notification Store — Zustand store for notification state.
 * Story 18.6, Task 2.
 *
 * AC #6: Unread count for tab badge, real-time updates
 * AC #7: 30-second polling when Notifications tab is active
 * AC #8: Merge API results with SQLCipher cache
 */
import { create } from 'zustand'
import {
  fetchNotifications as apiFetchNotifications,
  acknowledgeNotification as apiAcknowledge,
  type NotificationItem,
} from '@/lib/notification-api'
import { supabase } from '@/lib/supabase'
import { getEncryptedDbConnection, isDatabaseOpen } from '@/lib/encrypted-db'
import {
  getLocalNotifications,
  saveNotifications,
  markAsRead as localMarkAsRead,
  type LocalNotification,
} from '@/data/notification-queries'

const POLL_INTERVAL_MS = 30_000

async function getAuthToken(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? undefined
  } catch {
    return undefined
  }
}

export interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number
  isLoading: boolean
  lastFetched: Date | null

  fetchNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  startPolling: () => void
  stopPolling: () => void
  loadFromCache: () => Promise<void>
}

let pollInterval: ReturnType<typeof setInterval> | null = null

function toLocalNotification(item: NotificationItem): LocalNotification {
  return {
    id: item.id,
    type: item.type,
    title: item.title ?? '',
    body: item.body ?? '',
    metadata: JSON.stringify(item.payload ?? {}),
    is_read: item.status === 'ACKNOWLEDGED' ? 1 : 0,
    created_at: item.createdAt,
    acknowledged_at: item.acknowledgedAt,
  }
}

function fromLocalNotification(row: LocalNotification): NotificationItem {
  let payload = {}
  try {
    payload = JSON.parse(row.metadata)
  } catch {
    // Corrupted metadata — use empty object
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    payload: payload as NotificationItem['payload'],
    status: row.is_read ? 'ACKNOWLEDGED' : 'PENDING',
    createdAt: row.created_at,
    deliveredAt: null,
    acknowledgedAt: row.acknowledged_at,
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  lastFetched: null,

  fetchNotifications: async () => {
    set({ isLoading: true })
    try {
      const token = await getAuthToken()
      const { notifications: items } = await apiFetchNotifications(token)
      const sorted = items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )

      // Persist to SQLCipher if DB is open
      if (isDatabaseOpen()) {
        try {
          const db = await getEncryptedDbConnection()
          await saveNotifications(db, sorted.map(toLocalNotification))
        } catch {
          // DB write failure is non-fatal — API data still usable
        }
      }

      const unreadCount = sorted.filter(n => n.status !== 'ACKNOWLEDGED').length
      set({ notifications: sorted, unreadCount, isLoading: false, lastFetched: new Date() })
    } catch {
      // Network failure — fall back to cache
      set({ isLoading: false })
      if (get().notifications.length === 0) {
        await get().loadFromCache()
      }
    }
  },

  loadFromCache: async () => {
    if (!isDatabaseOpen()) return
    try {
      const db = await getEncryptedDbConnection()
      const rows = await getLocalNotifications(db)
      const items = rows.map(fromLocalNotification)
      const unreadCount = items.filter(n => n.status !== 'ACKNOWLEDGED').length
      set({ notifications: items, unreadCount })
    } catch {
      // Cache read failure is non-fatal
    }
  },

  markAsRead: async (id: string) => {
    // Optimistic update
    set(state => {
      const notifications = state.notifications.map(n =>
        n.id === id
          ? { ...n, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() }
          : n,
      )
      return {
        notifications,
        unreadCount: notifications.filter(n => n.status !== 'ACKNOWLEDGED').length,
      }
    })

    // Persist locally
    if (isDatabaseOpen()) {
      try {
        const db = await getEncryptedDbConnection()
        await localMarkAsRead(db, id)
      } catch {
        // Local write failure is non-fatal
      }
    }

    // Fire-and-forget API call (offline-tolerant)
    getAuthToken().then(token =>
      apiAcknowledge(id, token).catch(() => {
        // Offline — will sync later
      }),
    )
  },

  startPolling: () => {
    if (pollInterval) return
    // Immediate fetch on start
    get().fetchNotifications()
    pollInterval = setInterval(() => {
      get().fetchNotifications()
    }, POLL_INTERVAL_MS)
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  },
}))
