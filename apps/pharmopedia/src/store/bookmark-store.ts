import { create } from 'zustand'
import type * as SQLite from 'expo-sqlite'
import { addBookmark, removeBookmark, getBookmarks, type BookmarkRow } from '@/db/bookmarks'

export interface BookmarkEntry {
  atcCode: string
  innName: string
  therapeuticClass: string | null
  savedAt: string
}

interface BookmarkState {
  bookmarkedAtcCodes: string[]
  bookmarks: BookmarkEntry[]
  initialized: boolean
  init: (db: SQLite.SQLiteDatabase) => Promise<void>
  toggle: (
    db: SQLite.SQLiteDatabase,
    entry: { atcCode: string; innName: string; therapeuticClass?: string },
  ) => Promise<void>
  isBookmarked: (atcCode: string) => boolean
  reset: () => void
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarkedAtcCodes: [],
  bookmarks: [],
  initialized: false,

  async init(db) {
    if (get().initialized) return
    const rows: BookmarkRow[] = await getBookmarks(db)
    set({
      bookmarks: rows.map((r) => ({
        atcCode: r.atc_code,
        innName: r.inn_name,
        therapeuticClass: r.therapeutic_class,
        savedAt: r.saved_at,
      })),
      bookmarkedAtcCodes: rows.map((r) => r.atc_code),
      initialized: true,
    })
  },

  async toggle(db, { atcCode, innName, therapeuticClass }) {
    if (get().bookmarkedAtcCodes.includes(atcCode)) {
      await removeBookmark(db, atcCode)
      set((s) => ({
        bookmarkedAtcCodes: s.bookmarkedAtcCodes.filter((c) => c !== atcCode),
        bookmarks: s.bookmarks.filter((b) => b.atcCode !== atcCode),
      }))
    } else {
      const savedAt = new Date().toISOString()
      await addBookmark(db, atcCode, innName, therapeuticClass)
      set((s) => ({
        bookmarkedAtcCodes: [...s.bookmarkedAtcCodes, atcCode],
        bookmarks: [
          { atcCode, innName, therapeuticClass: therapeuticClass ?? null, savedAt },
          ...s.bookmarks,
        ],
      }))
    }
  },

  isBookmarked(atcCode) {
    return get().bookmarkedAtcCodes.includes(atcCode)
  },

  reset() {
    set({ bookmarkedAtcCodes: [], bookmarks: [], initialized: false })
  },
}))
