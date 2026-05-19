/**
 * Notification data layer — SQLCipher persistence for offline viewing.
 * Story 18.6, Task 1: Local notification cache.
 *
 * AC #1: Notifications fetched from Hub API
 * AC #8: Cached locally in SQLCipher for offline viewing
 */
import type * as SQLite from 'expo-sqlite'

export interface LocalNotification {
  id: string
  type: string
  title: string
  body: string
  metadata: string // JSON string
  is_read: number // 0 or 1
  created_at: string // ISO 8601
  acknowledged_at: string | null
}

/**
 * Read cached notifications from SQLCipher, newest-first.
 * Capped at 200 rows to protect memory on low-resource devices.
 */
export async function getLocalNotifications(
  db: SQLite.SQLiteDatabase,
): Promise<LocalNotification[]> {
  const rows = await db.getAllAsync<LocalNotification>(
    'SELECT id, type, title, body, metadata, is_read, created_at, acknowledged_at FROM notifications ORDER BY created_at DESC LIMIT 200',
  )
  return rows
}

/**
 * Upsert notifications into SQLCipher (INSERT OR REPLACE).
 * Preserves local is_read state if the notification was already acknowledged locally.
 */
export async function saveNotifications(
  db: SQLite.SQLiteDatabase,
  notifications: LocalNotification[],
): Promise<void> {
  if (notifications.length === 0) return

  await db.execAsync('BEGIN')
  try {
    for (const n of notifications) {
      await db.runAsync(
        `INSERT INTO notifications (id, type, title, body, metadata, is_read, created_at, acknowledged_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           title = excluded.title,
           body = excluded.body,
           metadata = excluded.metadata,
           is_read = MAX(notifications.is_read, excluded.is_read),
           created_at = excluded.created_at,
           acknowledged_at = COALESCE(excluded.acknowledged_at, notifications.acknowledged_at)`,
        [n.id, n.type, n.title, n.body, n.metadata, n.is_read, n.created_at, n.acknowledged_at],
      )
    }
    await db.execAsync('COMMIT')
  } catch (e) {
    await db.execAsync('ROLLBACK')
    throw e
  }
}

/**
 * Mark a single notification as read locally.
 */
export async function markAsRead(
  db: SQLite.SQLiteDatabase,
  notificationId: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE notifications SET is_read = 1, acknowledged_at = ? WHERE id = ?',
    [new Date().toISOString(), notificationId],
  )
}
