import type * as SQLite from 'expo-sqlite'

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

/** Delete all bookmarks (generic + brand). Called on logout so a different user starts clean. */
export async function clearBookmarks(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.runAsync('DELETE FROM bookmarks')
  await db.runAsync('DELETE FROM brand_bookmarks')
}

// ── Branded-medication bookmarks ─────────────────────────────────────────────

export interface BrandBookmarkRow {
  id: string
  brand_name: string
  generic_atc_code: string
  generic_inn_name: string | null
  manufacturer: string | null
  dose_form: string | null
  reference_price: number | null
  currency: string | null
  saved_at: string
}

export interface BrandBookmarkInput {
  id: string
  brandName: string
  genericAtcCode: string
  genericInnName?: string
  manufacturer?: string
  doseForm?: string
  referencePrice?: number
  currency?: string
}

/** Insert a brand bookmark. No-op if already bookmarked. */
export async function addBrandBookmark(db: SQLite.SQLiteDatabase, b: BrandBookmarkInput): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO brand_bookmarks
       (id, brand_name, generic_atc_code, generic_inn_name, manufacturer, dose_form, reference_price, currency, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.id, b.brandName, b.genericAtcCode, b.genericInnName ?? null, b.manufacturer ?? null,
      b.doseForm ?? null, b.referencePrice ?? null, b.currency ?? null, new Date().toISOString()],
  )
}

/** Delete a brand bookmark by id. No-op if not present. */
export async function removeBrandBookmark(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM brand_bookmarks WHERE id = ?', [id])
}

/** Return all brand bookmarks ordered newest-first. */
export async function getBrandBookmarks(db: SQLite.SQLiteDatabase): Promise<BrandBookmarkRow[]> {
  return db.getAllAsync<BrandBookmarkRow>(
    `SELECT id, brand_name, generic_atc_code, generic_inn_name, manufacturer, dose_form, reference_price, currency, saved_at
     FROM brand_bookmarks ORDER BY saved_at DESC`,
  )
}
