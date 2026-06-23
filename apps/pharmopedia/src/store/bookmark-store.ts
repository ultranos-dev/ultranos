import { create } from 'zustand'
import type * as SQLite from 'expo-sqlite'
import {
  addBookmark, removeBookmark, getBookmarks, type BookmarkRow,
  addBrandBookmark, removeBrandBookmark, getBrandBookmarks, type BrandBookmarkInput,
} from '@/db/bookmarks'

export interface BookmarkEntry {
  atcCode: string
  innName: string
  therapeuticClass: string | null
  savedAt: string
}

export interface BrandBookmarkEntry {
  id: string
  brandName: string
  genericAtcCode: string
  genericInnName: string | null
  manufacturer: string | null
  doseForm: string | null
  referencePrice: number | null
  currency: string | null
  savedAt: string
}

interface BookmarkState {
  bookmarkedAtcCodes: string[]
  bookmarks: BookmarkEntry[]
  bookmarkedBrandIds: string[]
  brandBookmarks: BrandBookmarkEntry[]
  initialized: boolean
  init: (db: SQLite.SQLiteDatabase) => Promise<void>
  toggle: (
    db: SQLite.SQLiteDatabase,
    entry: { atcCode: string; innName: string; therapeuticClass?: string },
  ) => Promise<void>
  isBookmarked: (atcCode: string) => boolean
  toggleBrand: (db: SQLite.SQLiteDatabase, brand: BrandBookmarkInput) => Promise<void>
  isBrandBookmarked: (id: string) => boolean
  reset: () => void
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarkedAtcCodes: [],
  bookmarks: [],
  bookmarkedBrandIds: [],
  brandBookmarks: [],
  initialized: false,

  async init(db) {
    if (get().initialized) return
    const rows: BookmarkRow[] = await getBookmarks(db)
    const brandRows = await getBrandBookmarks(db)
    set({
      bookmarks: rows.map((r) => ({
        atcCode: r.atc_code,
        innName: r.inn_name,
        therapeuticClass: r.therapeutic_class,
        savedAt: r.saved_at,
      })),
      bookmarkedAtcCodes: rows.map((r) => r.atc_code),
      brandBookmarks: brandRows.map((r) => ({
        id: r.id,
        brandName: r.brand_name,
        genericAtcCode: r.generic_atc_code,
        genericInnName: r.generic_inn_name,
        manufacturer: r.manufacturer,
        doseForm: r.dose_form,
        referencePrice: r.reference_price,
        currency: r.currency,
        savedAt: r.saved_at,
      })),
      bookmarkedBrandIds: brandRows.map((r) => r.id),
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

  async toggleBrand(db, brand) {
    if (get().bookmarkedBrandIds.includes(brand.id)) {
      await removeBrandBookmark(db, brand.id)
      set((s) => ({
        bookmarkedBrandIds: s.bookmarkedBrandIds.filter((id) => id !== brand.id),
        brandBookmarks: s.brandBookmarks.filter((b) => b.id !== brand.id),
      }))
    } else {
      const savedAt = new Date().toISOString()
      await addBrandBookmark(db, brand)
      set((s) => ({
        bookmarkedBrandIds: [...s.bookmarkedBrandIds, brand.id],
        brandBookmarks: [
          {
            id: brand.id,
            brandName: brand.brandName,
            genericAtcCode: brand.genericAtcCode,
            genericInnName: brand.genericInnName ?? null,
            manufacturer: brand.manufacturer ?? null,
            doseForm: brand.doseForm ?? null,
            referencePrice: brand.referencePrice ?? null,
            currency: brand.currency ?? null,
            savedAt,
          },
          ...s.brandBookmarks,
        ],
      }))
    }
  },

  isBrandBookmarked(id) {
    return get().bookmarkedBrandIds.includes(id)
  },

  reset() {
    set({ bookmarkedAtcCodes: [], bookmarks: [], bookmarkedBrandIds: [], brandBookmarks: [], initialized: false })
  },
}))
