/**
 * Hook that reads unread notification count from the Zustand store.
 * Story 18.6, Task 5: Real-time badge updates.
 *
 * Previously polled the API directly; now derives count from the
 * notification store so badge updates instantly when a notification
 * is marked as read within the app.
 */
import { useNotificationStore } from '@/stores/notification-store'

export function useUnreadNotificationCount(): number {
  return useNotificationStore(state => state.unreadCount)
}
