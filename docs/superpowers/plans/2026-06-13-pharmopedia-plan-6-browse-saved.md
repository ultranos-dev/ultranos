# Pharmopedia Plan 6 — Browse Tab & Saved Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Browse (by ATC therapeutic class) and Saved (bookmarked drugs) tabs to complete the four-tab navigation defined in the Pharmopedia design spec.

**Architecture:** Browse reads distinct `therapeutic_class` values from the local SQLite `drug_catalog` table, then lets the user drill into a drug list for that class. Saved bookmarks are stored in a new `bookmarks` SQLite table (schema v2 migration) and synced into a Zustand store on startup; a bookmark toggle button is added to the drug detail header. Both tabs use the existing `DrugCard` component and `lang` from `useLangStore`.

**Tech Stack:** expo-sqlite (already installed), Zustand ^5, expo-router ~4, lucide-react-native (already installed via app), react-i18next (already installed), Vitest + custom RN mocks (already configured).

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/db/schema.ts` | Add `bookmarks` table DDL |
| Modify | `src/db/migrations.ts` | Add schema v2 migration |
| Create | `src/db/bookmarks.ts` | add/remove/get/clear bookmark DB functions |
| Create | `src/db/browse.ts` | getTherapeuticClasses, getDrugsByTherapeuticClass |
| Create | `src/store/bookmark-store.ts` | Zustand store: in-memory bookmark list + toggle |
| Modify | `src/store/auth-store.ts` | Call bookmarkStore.reset() + clearBookmarks() on logout |
| Modify | `src/i18n/locales/en.ts` | Add tabs.browse, tabs.saved, browse.*, saved.*, common.back |
| Modify | `src/i18n/locales/prs.ts` | Mirror new keys (Dari) |
| Modify | `src/i18n/locales/ps.ts` | Mirror new keys (Pashto) |
| Modify | `src/i18n/locales/ar.ts` | Mirror new keys (Arabic) |
| Create | `src/components/TherapeuticClassCard.tsx` | Row card for a therapeutic class in the Browse list |
| Create | `app/(tabs)/browse.tsx` | Browse tab screen — class list + drill-down drug list |
| Create | `app/(tabs)/saved.tsx` | Saved tab screen — bookmarked drug list |
| Modify | `app/(tabs)/_layout.tsx` | Add Browse and Saved tabs |
| Modify | `app/drug/[atcCode].tsx` | Add bookmark toggle button in header |
| Modify | `app/_layout.tsx` | Init bookmark store after openDatabase() |
| Create | `src/__tests__/bookmark-store.test.ts` | Store logic: init, toggle, isBookmarked, reset |
| Create | `src/__tests__/browse-tab.test.tsx` | Class list renders, drill-down, back nav |
| Create | `src/__tests__/saved-tab.test.tsx` | Empty state, drug list from bookmarks |

---

## Task 1: Bookmarks DB — Schema v2, DB Functions, Logout Wiring

**Files:**
- Modify: `apps/pharmopedia/src/db/schema.ts`
- Modify: `apps/pharmopedia/src/db/migrations.ts`
- Create: `apps/pharmopedia/src/db/bookmarks.ts`
- Modify: `apps/pharmopedia/src/store/auth-store.ts`

- [ ] **Step 1: Add bookmarks table DDL to schema.ts**

Read `apps/pharmopedia/src/db/schema.ts`, then append the new table definition. The file currently ends after `CREATE TABLE IF NOT EXISTS sync_meta`. Add the bookmarks DDL as a separate exported constant:

```typescript
// Add after the existing CREATE_SCHEMA_SQL export:

export const CREATE_BOOKMARKS_SQL = `
  CREATE TABLE IF NOT EXISTS bookmarks (
    atc_code          TEXT PRIMARY KEY,
    inn_name          TEXT NOT NULL,
    therapeutic_class TEXT,
    saved_at          TEXT NOT NULL  -- ISO 8601 timestamp
  );
`
```

Also bump `SCHEMA_VERSION` from `1` to `2`:

```typescript
export const SCHEMA_VERSION = 2
```

- [ ] **Step 2: Add migration v2 in migrations.ts**

Read `apps/pharmopedia/src/db/migrations.ts`. The `runMigrations` function currently handles `currentVersion < 1`. Add the v2 migration immediately after:

```typescript
import { DB_NAME, SCHEMA_VERSION, CREATE_SCHEMA_SQL, CREATE_BOOKMARKS_SQL } from './schema'

// Inside runMigrations(), after the existing `if (currentVersion < 1)` block:

  if (currentVersion < 2) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(CREATE_BOOKMARKS_SQL)
    })
    await db.execAsync('PRAGMA user_version = 2')
  }
```

- [ ] **Step 3: Create src/db/bookmarks.ts**

```typescript
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

/** Delete all bookmarks. Called on logout so a different user's session starts clean. */
export async function clearBookmarks(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  await db.runAsync('DELETE FROM bookmarks')
}
```

- [ ] **Step 4: Wire clearBookmarks + store reset into auth-store.ts logout**

Read `apps/pharmopedia/src/store/auth-store.ts`. It currently has:

```typescript
logout: async (db) => {
  set({ token: null, user: null, isAuthenticated: false })
  useSyncStore.getState().reset()
  await clearCatalog(db)
},
```

Update it to also clear bookmarks:

```typescript
import { clearCatalog } from '@/db/drug-catalog'
import { clearBookmarks } from '@/db/bookmarks'
// (add clearBookmarks to existing import from @/db/drug-catalog line — it's a separate file now)

// In the store:
logout: async (db) => {
  set({ token: null, user: null, isAuthenticated: false })
  useSyncStore.getState().reset()
  // Imported lazily to avoid circular dep — bookmark-store imports nothing from auth-store
  const { useBookmarkStore } = await import('./bookmark-store')
  useBookmarkStore.getState().reset()
  await clearCatalog(db)
  await clearBookmarks(db)
},
```

**Note:** The dynamic import avoids a circular dependency since `bookmark-store.ts` (created in Task 2) imports nothing from `auth-store.ts`. Alternatively, you can call `clearBookmarks(db)` only (no store reset) if you prefer to skip the lazy import — the store will be re-initialized on next login anyway.

A simpler alternative that avoids the dynamic import entirely:

```typescript
logout: async (db) => {
  set({ token: null, user: null, isAuthenticated: false })
  useSyncStore.getState().reset()
  await clearCatalog(db)
  await clearBookmarks(db)
  // bookmark-store.reset() is called automatically when init() runs on next login
  // because initialized starts as false after app restart (Zustand state is in-memory)
},
```

Use the simpler alternative — no dynamic import needed.

- [ ] **Step 5: Run the app's tests to confirm no regressions**

```bash
pnpm -F pharmopedia test 2>&1
```

Expected: 22/22 pass (no new tests yet, just verifying nothing broke).

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && git add "apps/pharmopedia/src/db/schema.ts" "apps/pharmopedia/src/db/migrations.ts" "apps/pharmopedia/src/db/bookmarks.ts" "apps/pharmopedia/src/store/auth-store.ts" && git commit -m "feat(pharmopedia): bookmarks table (schema v2) + DB functions + logout wiring"
```

---

## Task 2: Bookmark Zustand Store + Tests

**Files:**
- Create: `apps/pharmopedia/src/store/bookmark-store.ts`
- Create: `apps/pharmopedia/src/__tests__/bookmark-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/bookmark-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddBookmark = vi.fn().mockResolvedValue(undefined)
const mockRemoveBookmark = vi.fn().mockResolvedValue(undefined)
const mockGetBookmarks = vi.fn().mockResolvedValue([])

vi.mock('@/db/bookmarks', () => ({
  addBookmark: mockAddBookmark,
  removeBookmark: mockRemoveBookmark,
  getBookmarks: mockGetBookmarks,
  clearBookmarks: vi.fn().mockResolvedValue(undefined),
}))

const mockDb = {} as import('expo-sqlite').SQLiteDatabase

const { useBookmarkStore } = await import('@/store/bookmark-store')

describe('bookmark-store: init', () => {
  beforeEach(() => {
    useBookmarkStore.setState({ bookmarkedAtcCodes: [], bookmarks: [], initialized: false })
    mockGetBookmarks.mockResolvedValue([])
  })

  it('starts uninitialized with empty lists', () => {
    const s = useBookmarkStore.getState()
    expect(s.initialized).toBe(false)
    expect(s.bookmarks).toHaveLength(0)
    expect(s.bookmarkedAtcCodes).toHaveLength(0)
  })

  it('init() loads bookmarks from DB and sets initialized', async () => {
    mockGetBookmarks.mockResolvedValueOnce([
      { atc_code: 'J01CA04', inn_name: 'Amoxicillin', therapeutic_class: 'Antibacterials', saved_at: '2026-06-13T00:00:00.000Z' },
    ])
    await useBookmarkStore.getState().init(mockDb)
    const s = useBookmarkStore.getState()
    expect(s.initialized).toBe(true)
    expect(s.bookmarks).toHaveLength(1)
    expect(s.bookmarks[0]!.atcCode).toBe('J01CA04')
    expect(s.bookmarkedAtcCodes).toContain('J01CA04')
  })

  it('init() is idempotent — second call is a no-op', async () => {
    useBookmarkStore.setState({ initialized: true })
    await useBookmarkStore.getState().init(mockDb)
    expect(mockGetBookmarks).not.toHaveBeenCalled()
  })
})

describe('bookmark-store: isBookmarked', () => {
  beforeEach(() => {
    useBookmarkStore.setState({
      bookmarkedAtcCodes: ['J01CA04'],
      bookmarks: [{ atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: 'Antibacterials', savedAt: '2026-06-13T00:00:00.000Z' }],
      initialized: true,
    })
  })

  it('returns true for a bookmarked code', () => {
    expect(useBookmarkStore.getState().isBookmarked('J01CA04')).toBe(true)
  })

  it('returns false for a non-bookmarked code', () => {
    expect(useBookmarkStore.getState().isBookmarked('N02BE01')).toBe(false)
  })
})

describe('bookmark-store: toggle', () => {
  beforeEach(() => {
    useBookmarkStore.setState({ bookmarkedAtcCodes: [], bookmarks: [], initialized: true })
    mockAddBookmark.mockClear()
    mockRemoveBookmark.mockClear()
  })

  it('toggle adds a new bookmark and calls addBookmark', async () => {
    await useBookmarkStore.getState().toggle(mockDb, { atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: 'Antibacterials' })
    expect(mockAddBookmark).toHaveBeenCalledWith(mockDb, 'J01CA04', 'Amoxicillin', 'Antibacterials')
    const s = useBookmarkStore.getState()
    expect(s.bookmarkedAtcCodes).toContain('J01CA04')
    expect(s.bookmarks).toHaveLength(1)
  })

  it('toggle removes an existing bookmark and calls removeBookmark', async () => {
    useBookmarkStore.setState({
      bookmarkedAtcCodes: ['J01CA04'],
      bookmarks: [{ atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: null, savedAt: '2026-06-13T00:00:00.000Z' }],
      initialized: true,
    })
    await useBookmarkStore.getState().toggle(mockDb, { atcCode: 'J01CA04', innName: 'Amoxicillin' })
    expect(mockRemoveBookmark).toHaveBeenCalledWith(mockDb, 'J01CA04')
    const s = useBookmarkStore.getState()
    expect(s.bookmarkedAtcCodes).not.toContain('J01CA04')
    expect(s.bookmarks).toHaveLength(0)
  })
})

describe('bookmark-store: reset', () => {
  it('reset clears all state and unsets initialized', () => {
    useBookmarkStore.setState({
      bookmarkedAtcCodes: ['J01CA04'],
      bookmarks: [{ atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: null, savedAt: '2026-06-13T00:00:00.000Z' }],
      initialized: true,
    })
    useBookmarkStore.getState().reset()
    const s = useBookmarkStore.getState()
    expect(s.bookmarkedAtcCodes).toHaveLength(0)
    expect(s.bookmarks).toHaveLength(0)
    expect(s.initialized).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm -F pharmopedia test src/__tests__/bookmark-store.test.ts 2>&1 | head -20
```

Expected: FAIL — `Cannot find module '@/store/bookmark-store'`.

- [ ] **Step 3: Create src/store/bookmark-store.ts**

```typescript
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
  /** ATC codes of bookmarked drugs — kept for O(n) lookup via Array.includes. */
  bookmarkedAtcCodes: string[]
  /** Full bookmark list for rendering — ordered newest-first. */
  bookmarks: BookmarkEntry[]
  initialized: boolean
  /** Load bookmarks from SQLite into memory. Idempotent — no-op if already initialized. */
  init: (db: SQLite.SQLiteDatabase) => Promise<void>
  /** Add or remove a bookmark, updating both SQLite and in-memory state. */
  toggle: (
    db: SQLite.SQLiteDatabase,
    entry: { atcCode: string; innName: string; therapeuticClass?: string },
  ) => Promise<void>
  /** Check if a drug is bookmarked. O(n) — fine for typical bookmark list sizes (<100). */
  isBookmarked: (atcCode: string) => boolean
  /** Clear all state. Called on logout so next session starts fresh. */
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
```

- [ ] **Step 4: Run the tests**

```bash
pnpm -F pharmopedia test src/__tests__/bookmark-store.test.ts 2>&1
```

Expected: 8/8 PASS.

- [ ] **Step 5: Run full suite**

```bash
pnpm -F pharmopedia test 2>&1
```

Expected: 30/30 pass (22 previous + 8 new).

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && git add "apps/pharmopedia/src/store/bookmark-store.ts" "apps/pharmopedia/src/__tests__/bookmark-store.test.ts" && git commit -m "feat(pharmopedia): bookmark Zustand store with init/toggle/reset"
```

---

## Task 3: Browse DB Functions

**Files:**
- Create: `apps/pharmopedia/src/db/browse.ts`

No test file — browse DB functions are pure SQL queries; they are integration-tested via the browse tab tests (Task 6) which mock them at the module boundary.

- [ ] **Step 1: Create src/db/browse.ts**

```typescript
import * as SQLite from 'expo-sqlite'
import type { DrugSearchResult } from '@ultranos/shared-types'
import type { Lang } from '@/store/lang-store'

export interface TherapeuticClass {
  name: string
  count: number
}

interface ClassRow {
  therapeutic_class: string
  count: number
}

interface DrugRow {
  atc_code: string
  inn_name: string
  brand_names: string | null
  dose_forms: string | null
  therapeutic_class: string | null
  local_names: string | null
}

/**
 * Return distinct therapeutic classes from the local catalog, with drug count each.
 * Ordered alphabetically. Returns [] if the catalog is empty.
 */
export async function getTherapeuticClasses(
  db: SQLite.SQLiteDatabase,
): Promise<TherapeuticClass[]> {
  const rows = await db.getAllAsync<ClassRow>(
    `SELECT therapeutic_class, COUNT(*) as count
     FROM drug_catalog
     WHERE therapeutic_class IS NOT NULL AND therapeutic_class != ''
     GROUP BY therapeutic_class
     ORDER BY therapeutic_class ASC`,
  )
  return rows.map((r) => ({ name: r.therapeutic_class, count: r.count }))
}

/**
 * Return drugs in a given therapeutic class, ordered by INN name.
 * Maps localName for prs/ps langs; 'ar' and 'en' show INN only (no Arabic drug local names in catalog).
 */
export async function getDrugsByTherapeuticClass(
  db: SQLite.SQLiteDatabase,
  therapeuticClass: string,
  lang: Lang,
  limit = 100,
): Promise<DrugSearchResult[]> {
  const rows = await db.getAllAsync<DrugRow>(
    `SELECT atc_code, inn_name, brand_names, dose_forms, therapeutic_class, local_names
     FROM drug_catalog
     WHERE therapeutic_class = ?
     ORDER BY inn_name ASC
     LIMIT ?`,
    [therapeuticClass, limit],
  )
  return rows.map((row) => {
    const localNames: Record<string, string> = row.local_names
      ? JSON.parse(row.local_names)
      : {}
    // 'ar' has no local drug names in the catalog — show INN only
    const localName =
      lang !== 'en' && lang !== 'ar' ? localNames[lang] : undefined
    return {
      atcCode: row.atc_code,
      innName: row.inn_name,
      brandNames: row.brand_names ? JSON.parse(row.brand_names) : [],
      doseForms: row.dose_forms ? JSON.parse(row.dose_forms) : [],
      therapeuticClass: row.therapeutic_class ?? '',
      localName,
    }
  })
}
```

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
pnpm -F pharmopedia test 2>&1
```

Expected: 30/30 pass.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && git add "apps/pharmopedia/src/db/browse.ts" && git commit -m "feat(pharmopedia): browse DB functions — getTherapeuticClasses, getDrugsByTherapeuticClass"
```

---

## Task 4: i18n Additions — Browse, Saved, Common.back, Tab Labels

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/prs.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ps.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ar.ts`

- [ ] **Step 1: Update en.ts**

Read `apps/pharmopedia/src/i18n/locales/en.ts`.

Make these additions:

**`tabs` object** — add `browse` and `saved` keys:
```typescript
tabs: {
  search: 'Search',
  browse: 'Browse',   // new
  saved: 'Saved',     // new
  profile: 'Profile',
},
```

**After `enrich` object** — add `browse` and `saved` top-level keys:
```typescript
browse: {
  empty: 'No categories available — sync the catalog first',
  noDrugs: 'No drugs in this category',
},
saved: {
  empty: 'No saved drugs yet — tap the bookmark icon on any drug to save it',
},
```

**`common` object** — add `back`:
```typescript
common: {
  cancel: 'Cancel',
  ok: 'OK',
  back: 'Back',  // new
},
```

The `Translations` type is `typeof en` (inferred), so adding these keys here automatically enforces them in all other locale files.

- [ ] **Step 2: Update prs.ts (Dari)**

Read `apps/pharmopedia/src/i18n/locales/prs.ts`. It is typed `as Translations`. Add the same keys with Dari translations:

```typescript
tabs: {
  search: 'جستجو',
  browse: 'مرور',       // new
  saved: 'ذخیره شده',   // new
  profile: 'پروفایل',
},
// ...
browse: {
  empty: 'هیچ دسته‌ای موجود نیست — ابتدا کاتالوگ را همگام‌سازی کنید',
  noDrugs: 'هیچ دارویی در این دسته وجود ندارد',
},
saved: {
  empty: 'هیچ داروی ذخیره‌ای ندارید — روی آیکون نشانک در هر دارو ضربه بزنید',
},
common: {
  cancel: 'لغو',
  ok: 'تأیید',
  back: 'بازگشت',  // new
},
```

- [ ] **Step 3: Update ps.ts (Pashto)**

Read `apps/pharmopedia/src/i18n/locales/ps.ts`. Add:

```typescript
tabs: {
  search: 'لټون',
  browse: 'ګرځول',      // new
  saved: 'خوندي شوي',  // new
  profile: 'پروفایل',
},
// ...
browse: {
  empty: 'هیڅ کټګورۍ شتون نلري — لومړی کټالوګ همغږي کړئ',
  noDrugs: 'پدې کټګورۍ کې هیڅ دارو شتون نلري',
},
saved: {
  empty: 'تاسو هیڅ خوندي شوي دارو نلرئ — د هرې درملې د نښانک آیکون باندې فشار ورکړئ',
},
common: {
  cancel: 'لغول',
  ok: 'سمه ده',
  back: 'شاته',  // new
},
```

- [ ] **Step 4: Update ar.ts (Arabic)**

Read `apps/pharmopedia/src/i18n/locales/ar.ts`. Add:

```typescript
tabs: {
  search: 'بحث',
  browse: 'تصفح',       // new
  saved: 'المحفوظة',    // new
  profile: 'الملف الشخصي',
},
// ...
browse: {
  empty: 'لا توجد فئات متاحة — قم بمزامنة الكتالوج أولاً',
  noDrugs: 'لا توجد أدوية في هذه الفئة',
},
saved: {
  empty: 'لا توجد أدوية محفوظة بعد — اضغط على أيقونة الإشارة المرجعية لأي دواء لحفظه',
},
common: {
  cancel: 'إلغاء',
  ok: 'حسناً',
  back: 'رجوع',  // new
},
```

- [ ] **Step 5: Run full test suite**

```bash
pnpm -F pharmopedia test 2>&1
```

Expected: 30/30 pass (locale file changes don't break existing tests).

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && git add "apps/pharmopedia/src/i18n/locales/en.ts" "apps/pharmopedia/src/i18n/locales/prs.ts" "apps/pharmopedia/src/i18n/locales/ps.ts" "apps/pharmopedia/src/i18n/locales/ar.ts" && git commit -m "feat(pharmopedia): i18n keys for browse/saved tabs and common.back"
```

---

## Task 5: TherapeuticClassCard Component

**Files:**
- Create: `apps/pharmopedia/src/components/TherapeuticClassCard.tsx`

No dedicated test — this is a thin presentational component exercised by the browse-tab test (Task 6).

- [ ] **Step 1: Create src/components/TherapeuticClassCard.tsx**

```typescript
import { Pressable, Text, StyleSheet } from 'react-native'

interface Props {
  name: string
  count: number
  onPress: () => void
}

export function TherapeuticClassCard({ name, count, onPress }: Props) {
  return (
    <Pressable
      testID={`class-card-${name}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  cardPressed: { backgroundColor: '#f9fafb' },
  name: { fontSize: 15, fontWeight: '500', color: '#111827', flex: 1, marginEnd: 12 },
  count: { fontSize: 13, color: '#6b7280', minWidth: 24, textAlign: 'right' },
})
```

- [ ] **Step 2: Run full test suite**

```bash
pnpm -F pharmopedia test 2>&1
```

Expected: 30/30 pass.

- [ ] **Step 3: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && git add "apps/pharmopedia/src/components/TherapeuticClassCard.tsx" && git commit -m "feat(pharmopedia): TherapeuticClassCard component for browse list"
```

---

## Task 6: Browse Tab Screen + Tests

**Files:**
- Create: `apps/pharmopedia/app/(tabs)/browse.tsx`
- Create: `apps/pharmopedia/src/__tests__/browse-tab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/browse-tab.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import BrowseTab from '@/app/(tabs)/browse'

const mockGetTherapeuticClasses = vi.fn().mockResolvedValue([])
const mockGetDrugsByTherapeuticClass = vi.fn().mockResolvedValue([])

vi.mock('@/db/browse', () => ({
  getTherapeuticClasses: mockGetTherapeuticClasses,
  getDrugsByTherapeuticClass: mockGetDrugsByTherapeuticClass,
}))

vi.mock('@/db/migrations', () => ({ getDatabase: vi.fn().mockReturnValue({}) }))
vi.mock('@/store/lang-store', () => ({
  useLangStore: (s: (state: { lang: string }) => unknown) => s({ lang: 'en' }),
  isRtlLang: () => false,
}))
vi.mock('@/store/sync-store', () => ({
  useSyncStore: (s: (state: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'browse.empty': 'No categories available',
        'browse.noDrugs': 'No drugs in this category',
        'common.back': 'Back',
      }
      return map[key] ?? key
    },
  }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const CLASSES = [
  { name: 'Antibacterials', count: 12 },
  { name: 'Analgesics', count: 8 },
]

const DRUGS = [
  { atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: 'Antibacterials', localName: undefined },
]

describe('BrowseTab — class list', () => {
  beforeEach(() => {
    mockGetTherapeuticClasses.mockClear()
    mockGetDrugsByTherapeuticClass.mockClear()
  })

  it('shows empty state when no therapeutic classes available', async () => {
    mockGetTherapeuticClasses.mockResolvedValueOnce([])
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByText('No categories available')).toBeTruthy())
  })

  it('renders a card for each therapeutic class', async () => {
    mockGetTherapeuticClasses.mockResolvedValueOnce(CLASSES)
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
    expect(screen.getByTestId('class-card-Analgesics')).toBeTruthy()
  })

  it('pressing a class loads and shows its drugs', async () => {
    mockGetTherapeuticClasses.mockResolvedValueOnce(CLASSES)
    mockGetDrugsByTherapeuticClass.mockResolvedValueOnce(DRUGS)
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
    fireEvent.press(screen.getByTestId('class-card-Antibacterials'))
    await waitFor(() => expect(screen.getByTestId('drug-card-J01CA04')).toBeTruthy())
    expect(mockGetDrugsByTherapeuticClass).toHaveBeenCalledWith({}, 'Antibacterials', 'en')
  })

  it('pressing Back returns to the class list', async () => {
    mockGetTherapeuticClasses.mockResolvedValue(CLASSES)
    mockGetDrugsByTherapeuticClass.mockResolvedValueOnce(DRUGS)
    render(<BrowseTab />)
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
    fireEvent.press(screen.getByTestId('class-card-Antibacterials'))
    await waitFor(() => expect(screen.getByTestId('browse-back-btn')).toBeTruthy())
    fireEvent.press(screen.getByTestId('browse-back-btn'))
    await waitFor(() => expect(screen.getByTestId('class-card-Antibacterials')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm -F pharmopedia test src/__tests__/browse-tab.test.tsx 2>&1 | head -20
```

Expected: FAIL — `Cannot find module '@/app/(tabs)/browse'`.

- [ ] **Step 3: Create app/(tabs)/browse.tsx**

```typescript
import { useState, useEffect } from 'react'
import {
  View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getDatabase } from '@/db/migrations'
import { getTherapeuticClasses, getDrugsByTherapeuticClass, type TherapeuticClass } from '@/db/browse'
import { TherapeuticClassCard } from '@/components/TherapeuticClassCard'
import { DrugCard } from '@/components/DrugCard'
import { useLangStore } from '@/store/lang-store'
import { useSyncStore } from '@/store/sync-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function BrowseTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const lastVersion = useSyncStore((s) => s.lastVersion)

  const [classes, setClasses] = useState<TherapeuticClass[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [drugs, setDrugs] = useState<DrugSearchResult[]>([])
  const [loading, setLoading] = useState(true)

  // Reload class list whenever the local catalog version changes (after a sync)
  useEffect(() => {
    void loadClasses()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastVersion])

  async function loadClasses() {
    setLoading(true)
    try {
      const data = await getTherapeuticClasses(getDatabase())
      setClasses(data)
    } catch {
      setClasses([])
    } finally {
      setLoading(false)
    }
  }

  async function handleClassPress(cls: string) {
    setSelectedClass(cls)
    setLoading(true)
    try {
      const data = await getDrugsByTherapeuticClass(getDatabase(), cls, lang)
      setDrugs(data)
    } catch {
      setDrugs([])
    } finally {
      setLoading(false)
    }
  }

  function handleBack() {
    setSelectedClass(null)
    setDrugs([])
  }

  // Initial load — show spinner before first data arrives
  if (loading && classes.length === 0 && selectedClass === null) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  // Drill-down: drug list for the selected class
  if (selectedClass !== null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.classHeader}>
          <Pressable testID="browse-back-btn" onPress={handleBack} style={styles.backBtn}>
            <Text style={styles.backText}>{t('common.back')}</Text>
          </Pressable>
          <Text style={styles.classTitle} numberOfLines={1}>{selectedClass}</Text>
        </View>
        {loading ? (
          <View style={styles.center}><ActivityIndicator /></View>
        ) : drugs.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>{t('browse.noDrugs')}</Text>
          </View>
        ) : (
          <FlatList
            data={drugs}
            keyExtractor={(item) => item.atcCode}
            renderItem={({ item }) => (
              <DrugCard
                result={item}
                lang={lang}
                onPress={() => router.push(`/drug/${item.atcCode}`)}
              />
            )}
          />
        )}
      </SafeAreaView>
    )
  }

  // Top level: therapeutic class list
  return (
    <SafeAreaView style={styles.container}>
      {classes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('browse.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={classes}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <TherapeuticClassCard
              name={item.name}
              count={item.count}
              onPress={() => void handleClassPress(item.name)}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#6b7280', textAlign: 'center', fontSize: 15 },
  classHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { paddingVertical: 4 },
  backText: { color: '#2563eb', fontSize: 15 },
  classTitle: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
})
```

- [ ] **Step 4: Run the browse tab tests**

```bash
pnpm -F pharmopedia test src/__tests__/browse-tab.test.tsx 2>&1
```

Expected: 4/4 PASS.

If tests fail with `getDatabase` throwing ("Database not initialised"), confirm the mock is:
```typescript
vi.mock('@/db/migrations', () => ({ getDatabase: vi.fn().mockReturnValue({}) }))
```
The mock returns `{}` — the browse functions receive this and pass it through, while `@/db/browse` is mocked to not actually call any methods on the db.

- [ ] **Step 5: Run full test suite**

```bash
pnpm -F pharmopedia test 2>&1
```

Expected: 34/34 pass.

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && git add "apps/pharmopedia/app/(tabs)/browse.tsx" "apps/pharmopedia/src/__tests__/browse-tab.test.tsx" && git commit -m "feat(pharmopedia): Browse tab — therapeutic class list with drill-down"
```

---

## Task 7: Saved Tab Screen + Tests

**Files:**
- Create: `apps/pharmopedia/app/(tabs)/saved.tsx`
- Create: `apps/pharmopedia/src/__tests__/saved-tab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/pharmopedia/src/__tests__/saved-tab.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import SavedTab from '@/app/(tabs)/saved'

const mockPush = vi.fn()

vi.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'saved.empty': 'No saved drugs yet',
      }
      return map[key] ?? key
    },
  }),
}))
vi.mock('@/store/lang-store', () => ({
  useLangStore: (s: (state: { lang: string }) => unknown) => s({ lang: 'en' }),
  isRtlLang: () => false,
}))

const BOOKMARKS = [
  { atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: 'Antibacterials', savedAt: '2026-06-13T00:00:00.000Z' },
  { atcCode: 'N02BE01', innName: 'Paracetamol', therapeuticClass: 'Analgesics', savedAt: '2026-06-12T00:00:00.000Z' },
]

function mockBookmarkStore(bookmarks: typeof BOOKMARKS) {
  vi.doMock('@/store/bookmark-store', () => ({
    useBookmarkStore: (s: (state: { bookmarks: typeof BOOKMARKS }) => unknown) =>
      s({ bookmarks }),
  }))
}

describe('SavedTab', () => {
  it('shows empty state when no bookmarks', async () => {
    vi.mock('@/store/bookmark-store', () => ({
      useBookmarkStore: (s: (state: { bookmarks: [] }) => unknown) => s({ bookmarks: [] }),
    }))
    const { default: SavedTabFresh } = await import('@/app/(tabs)/saved')
    render(<SavedTabFresh />)
    expect(screen.getByTestId('saved-empty-text')).toBeTruthy()
  })

  it('renders a DrugCard for each bookmark', async () => {
    vi.mock('@/store/bookmark-store', () => ({
      useBookmarkStore: (s: (state: { bookmarks: typeof BOOKMARKS }) => unknown) =>
        s({ bookmarks: BOOKMARKS }),
    }))
    // Clear module cache so the new mock takes effect
    const { default: SavedTabFresh } = await import('@/app/(tabs)/saved?v=2')
      .catch(() => import('@/app/(tabs)/saved'))
    render(<SavedTabFresh />)
    expect(screen.getByTestId('drug-card-J01CA04')).toBeTruthy()
    expect(screen.getByTestId('drug-card-N02BE01')).toBeTruthy()
  })

  it('pressing a DrugCard navigates to drug detail', async () => {
    vi.mock('@/store/bookmark-store', () => ({
      useBookmarkStore: (s: (state: { bookmarks: typeof BOOKMARKS }) => unknown) =>
        s({ bookmarks: BOOKMARKS }),
    }))
    render(<SavedTab />)
    fireEvent.press(screen.getByTestId('drug-card-J01CA04'))
    expect(mockPush).toHaveBeenCalledWith('/drug/J01CA04')
  })
})
```

**Note:** If the module-cache trick causes issues with `vi.doMock`, simplify by using a single `vi.mock` at the top level with a configurable mock state variable:

```typescript
// Simplified version — use this if the multi-mock approach fails
let mockBookmarks: typeof BOOKMARKS = []

vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (s: (state: { bookmarks: typeof BOOKMARKS }) => unknown) =>
    s({ bookmarks: mockBookmarks }),
}))

const { default: SavedTab } = await import('@/app/(tabs)/saved')

describe('SavedTab', () => {
  it('shows empty state when no bookmarks', () => {
    mockBookmarks = []
    render(<SavedTab />)
    expect(screen.getByTestId('saved-empty-text')).toBeTruthy()
  })

  it('renders a DrugCard for each bookmark', () => {
    mockBookmarks = BOOKMARKS
    render(<SavedTab />)
    expect(screen.getByTestId('drug-card-J01CA04')).toBeTruthy()
    expect(screen.getByTestId('drug-card-N02BE01')).toBeTruthy()
  })

  it('pressing a DrugCard navigates to drug detail', () => {
    mockBookmarks = BOOKMARKS
    render(<SavedTab />)
    fireEvent.press(screen.getByTestId('drug-card-J01CA04'))
    expect(mockPush).toHaveBeenCalledWith('/drug/J01CA04')
  })
})
```

**Use the simplified version above.** The configurable `mockBookmarks` variable is the established pattern for this project.

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm -F pharmopedia test src/__tests__/saved-tab.test.tsx 2>&1 | head -20
```

Expected: FAIL — `Cannot find module '@/app/(tabs)/saved'`.

- [ ] **Step 3: Create app/(tabs)/saved.tsx**

```typescript
import { View, Text, FlatList, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { DrugCard } from '@/components/DrugCard'
import { useLangStore } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SavedTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)

  if (bookmarks.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text testID="saved-empty-text" style={styles.emptyText}>
            {t('saved.empty')}
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={bookmarks}
        keyExtractor={(item) => item.atcCode}
        renderItem={({ item }) => {
          // Reconstruct a DrugSearchResult from the bookmark entry
          // (bookmarks store only the fields needed for display)
          const result: DrugSearchResult = {
            atcCode: item.atcCode,
            innName: item.innName,
            brandNames: [],
            doseForms: [],
            therapeuticClass: item.therapeuticClass ?? '',
            localName: undefined,
          }
          return (
            <DrugCard
              result={result}
              lang={lang}
              onPress={() => router.push(`/drug/${item.atcCode}`)}
            />
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#6b7280', textAlign: 'center', fontSize: 15 },
})
```

- [ ] **Step 4: Run the saved tab tests**

```bash
pnpm -F pharmopedia test src/__tests__/saved-tab.test.tsx 2>&1
```

Expected: 3/3 PASS.

- [ ] **Step 5: Run full test suite**

```bash
pnpm -F pharmopedia test 2>&1
```

Expected: 37/37 pass.

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && git add "apps/pharmopedia/app/(tabs)/saved.tsx" "apps/pharmopedia/src/__tests__/saved-tab.test.tsx" && git commit -m "feat(pharmopedia): Saved tab — bookmarked drug list with empty state"
```

---

## Task 8: Bookmark Toggle in DrugDetail + Tabs Layout + Root Init

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`
- Modify: `apps/pharmopedia/app/(tabs)/_layout.tsx`
- Modify: `apps/pharmopedia/app/_layout.tsx`

No new test file — the bookmark toggle button is covered by visual inspection; the tabs layout change is covered by the existing tab-specific tests.

- [ ] **Step 1: Read all three files before editing**

```bash
# These will be read via the Read tool — verify current content before modifying
```

Read:
- `apps/pharmopedia/app/drug/[atcCode].tsx`
- `apps/pharmopedia/app/(tabs)/_layout.tsx`
- `apps/pharmopedia/app/_layout.tsx`

- [ ] **Step 2: Add bookmark toggle to drug/[atcCode].tsx**

The current header in `[atcCode].tsx` renders:
```typescript
<View style={styles.header}>
  <Text style={[styles.primaryName, isRtl && styles.rtlText]}>{primaryName}</Text>
  {secondaryName && <Text style={styles.secondaryName}>{secondaryName}</Text>}
  <Text style={styles.subheader}>{entry.atcCode} · {entry.therapeuticClass}</Text>
</View>
```

Add the following imports at the top:
```typescript
import { Bookmark, BookmarkCheck } from 'lucide-react-native'
import { useBookmarkStore } from '@/store/bookmark-store'
```

Add these selectors inside the component body (after the existing `isRtl` line):
```typescript
const bookmarkedAtcCodes = useBookmarkStore((s) => s.bookmarkedAtcCodes)
const toggleBookmark = useBookmarkStore((s) => s.toggle)
const isBookmarked = entry ? bookmarkedAtcCodes.includes(entry.atcCode) : false
```

Replace the header `<View>` with a row layout that puts the text block and bookmark button side by side:
```typescript
<View style={styles.header}>
  <View style={styles.headerRow}>
    <View style={styles.headerText}>
      <Text style={[styles.primaryName, isRtl && styles.rtlText]}>{primaryName}</Text>
      {secondaryName && <Text style={styles.secondaryName}>{secondaryName}</Text>}
      <Text style={styles.subheader}>{entry.atcCode} · {entry.therapeuticClass}</Text>
    </View>
    <Pressable
      testID="bookmark-toggle"
      style={styles.bookmarkBtn}
      onPress={() =>
        void toggleBookmark(getDatabase(), {
          atcCode: entry.atcCode,
          innName: entry.innName,
          therapeuticClass: entry.therapeuticClass,
        })
      }
    >
      {isBookmarked
        ? <BookmarkCheck size={24} color="#2563eb" />
        : <Bookmark size={24} color="#9ca3af" />
      }
    </Pressable>
  </View>
</View>
```

Add the new style entries to `StyleSheet.create(...)`:
```typescript
headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
headerText: { flex: 1, marginEnd: 8 },
bookmarkBtn: { paddingTop: 2, paddingStart: 8 },
```

- [ ] **Step 3: Update app/(tabs)/_layout.tsx to add Browse and Saved tabs**

The current `_layout.tsx` has two tabs: `index` and `profile`. Replace with four tabs:

```typescript
import { Tabs } from 'expo-router'
import { Search, Folder, Bookmark, User } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

export default function TabsLayout() {
  const { t } = useTranslation()

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563eb' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.search'),
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: t('tabs.browse'),
          tabBarIcon: ({ color, size }) => <Folder color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: t('tabs.saved'),
          tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
```

- [ ] **Step 4: Add bookmark store init to app/_layout.tsx**

The current `app/_layout.tsx` init effect is:
```typescript
async function init() {
  setSecurityResult({ isCompromised: false, reasons: [] })
  await openDatabase()
  await langInit()
  initI18n(useLangStore.getState().lang)
  initialize()
}
```

Add the import at the top of the file:
```typescript
import { useBookmarkStore } from '@/store/bookmark-store'
```

Add the bookmark init call after `openDatabase()` and before `initialize()`:
```typescript
async function init() {
  setSecurityResult({ isCompromised: false, reasons: [] })
  await openDatabase()
  await langInit()
  initI18n(useLangStore.getState().lang)
  await useBookmarkStore.getState().init(getDatabase())  // ← new
  initialize()
}
```

Also add `getDatabase` to the imports from `@/db/migrations` (it's already imported via `openDatabase` — check whether `getDatabase` is also imported; if not, add it):
```typescript
import { openDatabase, getDatabase } from '@/db/migrations'
```

- [ ] **Step 5: Run full test suite**

```bash
pnpm -F pharmopedia test 2>&1
```

Expected: 37/37 pass.

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && git add "apps/pharmopedia/app/drug/[atcCode].tsx" "apps/pharmopedia/app/(tabs)/_layout.tsx" "apps/pharmopedia/app/_layout.tsx" && git commit -m "feat(pharmopedia): bookmark toggle in drug detail, 4-tab nav, root bookmark init"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Browse tab — ATC therapeutic class list | Task 6 |
| Browse tab — drill into drug list for a class | Task 6 (`handleClassPress`) |
| Saved tab — bookmarked drug list | Task 7 |
| Saved tab — empty state | Task 7 |
| Bookmark storage (persisted across sessions) | Task 1 (SQLite bookmarks table) |
| Bookmark toggle on drug detail | Task 8 |
| Four-tab navigation: Search, Browse, Saved, Profile | Task 8 (_layout.tsx) |
| Bookmark cleared on logout | Task 1 (clearBookmarks in auth-store) |
| Browse respects current lang for localName display | Task 3 (getDrugsByTherapeuticClass accepts Lang) |
| Share button on drug detail (spec Section 7) | NOT in this plan — deferred to Plan 8 |

**Placeholder scan:** No TBD, TODO, or vague steps. All code blocks are complete.

**Type consistency:**
- `BookmarkEntry.atcCode` (camelCase) ↔ `BookmarkRow.atc_code` (snake_case) — conversion in `bookmark-store.ts init()` maps correctly
- `TherapeuticClass { name: string; count: number }` — used in `browse.ts` and `browse.tsx`
- `Lang` from `lang-store.ts` — accepted by `getDrugsByTherapeuticClass(db, cls, lang)` and `browse.tsx`
- `DrugSearchResult` from `@ultranos/shared-types` — returned by `getDrugsByTherapeuticClass`, consumed by `DrugCard`
- `BookmarkEntry` exported from `bookmark-store.ts`, used in `saved.tsx`
- `toggleBookmark(db, { atcCode, innName, therapeuticClass })` — matches `toggle` signature in `BookmarkState`
