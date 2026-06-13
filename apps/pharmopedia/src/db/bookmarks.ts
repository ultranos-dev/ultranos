import * as SQLite from 'expo-sqlite'

export interface BookmarkRow {
  atc_code: string
  inn_name: string
  therapeutic_class: string | null
  saved_at: string
}

/** Insert a bookmark. No-op if already bookmarked (INSERT OR IGNORE). */
export async function addBookmark(
  db: SQLite.SQLiteDatabase,
  atcCode: string,
  innName: string,
  therapeuticClass?: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO bookmarks (atc_code, inn_name, therapeutic_class, saved_at)
     VALUES (?, ?, ?, ?)`,
    [atcCode, innName, therapeuticClass ?? null, new Date().toISOString()],
  )
}

/** Delete a bookmark by ATC code. No-op if not present. */
export async function removeBookmark(
  db: SQLite.SQLiteDatabase,
  atcCode: string,
): Promise<void> {
  await db.runAsync('DELETE FROM bookmarks WHERE atc_code = ?', [atcCode])
}

/** Return all bookmarks ordered newest-first. */
export async function getBookmarks(
  db: SQLite.SQLiteDatabase,
): Promise<BookmarkRow[]> {
  return db.getAllAsync<BookmarkRow>(
    'SELECT atc_code, inn_name, therapeutic_class, saved_at FROM bookmarks ORDER BY saved_at DESC',
  )
}

/** Delete all bookmarks. Called on logout so a different user starts clean. */
export async function clearBookmarks(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.runAsync('DELETE FROM bookmarks')
}
