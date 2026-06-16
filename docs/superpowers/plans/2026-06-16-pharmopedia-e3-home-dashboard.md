# Pharmopedia E3 — Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Search tab with a Home dashboard (greeting, search entry, role-gated safety alerts, recent searches, saved shortcuts), relocate the full Search screen to a pushed `/search` route, and add a persistent recent-search store.

**Architecture:** The first tab file `(tabs)/index.tsx` becomes the Home dashboard built on E2's `CollapsibleScreen`. Today's Search screen moves verbatim to `app/search.tsx` (a root-Stack route, pushed from Home, accepting `?q=`). A new Zustand `recent-search-store` (SecureStore-persisted) and a local-catalog `getActiveRecalls` query feed Home. No network/backend.

**Tech Stack:** Expo Router, React Native, Zustand, expo-secure-store, Vitest + react-test-renderer. Reuses `@ultranos/ui-kit/native` (CollapsibleScreen, Banner, Chip, ListRow, EmptyState).

**Conventions (keep):** tokens-only; theme via `useThemeColors`; RTL via `useRtl`/`isRtlLang`; icons from `lucide-react-native`. **Commits:** repo forbids autonomous commits — run `Commit` steps only on the user's go-ahead, with the `Co-Authored-By` trailer.

---

## File Structure

**Created:**
- `apps/pharmopedia/src/store/recent-search-store.ts` — recent-search Zustand store (SecureStore).
- `apps/pharmopedia/src/db/recalls.ts` — `getActiveRecalls(db, role, limit)` + `RecallSummary`.
- `apps/pharmopedia/app/search.tsx` — the relocated full Search screen (from `(tabs)/index.tsx`), `?q=` seed + records recents.
- `apps/pharmopedia/src/components/HomeSearchField.tsx` — non-interactive search-styled pressable that pushes `/search`.
- Tests: `src/__tests__/recent-search-store.test.ts`, `src/__tests__/recalls.test.ts`, `src/__tests__/home-screen.test.tsx`. The existing `src/__tests__/search-screen.test.tsx` is repointed to `@/app/search`.

**Modified:**
- `apps/pharmopedia/app/(tabs)/index.tsx` — replaced by the Home dashboard.
- `apps/pharmopedia/app/(tabs)/_layout.tsx` — first tab becomes Home (title + `Home` icon).
- `apps/pharmopedia/app/_layout.tsx` — register the `search` Stack route + init the recent-search store.
- `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts` — `tabs.home` + a `home` namespace.

---

## Task 1: i18n keys (tabs.home + home namespace)

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`, `prs.ts`, `ps.ts`, `ar.ts`

- [ ] **Step 1: Add `home` to the `tabs` block in each locale**

In each locale's `tabs` object add a `home` key:
- `en.ts`: `home: 'Home',`
- `prs.ts`: `home: 'خانه',`
- `ps.ts`: `home: 'کور',`
- `ar.ts`: `home: 'الرئيسية',`

- [ ] **Step 2: Add a `home` namespace block to each locale**

Add a new top-level `home` object (place it right after the `tabs` block in every file so the four stay structurally identical). `en.ts`:
```ts
  home: {
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    searchPlaceholder: 'Search medicines…',
    safetyAlerts: 'Safety alerts',
    recent: 'Recent',
    saved: 'Saved',
    seeAll: 'See all',
    browseCta: 'Browse medicines',
    savedEmpty: 'Bookmark medicines to find them fast.',
  },
```
`prs.ts`:
```ts
  home: {
    greetingMorning: 'صبح بخیر',
    greetingAfternoon: 'ظهر بخیر',
    greetingEvening: 'شب بخیر',
    searchPlaceholder: 'جستجوی داروها…',
    safetyAlerts: 'هشدارهای ایمنی',
    recent: 'اخیر',
    saved: 'ذخیره‌شده',
    seeAll: 'مشاهده همه',
    browseCta: 'مرور داروها',
    savedEmpty: 'داروها را نشانه‌گذاری کنید تا سریع پیدا شوند.',
  },
```
`ps.ts`:
```ts
  home: {
    greetingMorning: 'سهار مو پخیر',
    greetingAfternoon: 'ماښام مو پخیر',
    greetingEvening: 'شپه مو پخیره',
    searchPlaceholder: 'درمل وپلټئ…',
    safetyAlerts: 'د خوندیتوب خبرتیاوې',
    recent: 'وروستي',
    saved: 'خوندي شوي',
    seeAll: 'ټول وګورئ',
    browseCta: 'درمل وپلټئ',
    savedEmpty: 'درمل نښه کړئ ترڅو ژر یې ومومئ.',
  },
```
`ar.ts`:
```ts
  home: {
    greetingMorning: 'صباح الخير',
    greetingAfternoon: 'مساء الخير',
    greetingEvening: 'مساء الخير',
    searchPlaceholder: 'ابحث عن الأدوية…',
    safetyAlerts: 'تنبيهات السلامة',
    recent: 'الأخيرة',
    saved: 'المحفوظة',
    seeAll: 'عرض الكل',
    browseCta: 'تصفّح الأدوية',
    savedEmpty: 'احفظ الأدوية للعثور عليها بسرعة.',
  },
```

- [ ] **Step 3: Typecheck locale parity**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -E "locales/(prs|ps|ar)\.ts" | grep -iE "home|tabs" | head`
Expected: empty (no missing-key errors for the new keys). Pre-existing unrelated `ps.ts` literal-type errors may remain — ignore those.

- [ ] **Step 4: Commit**

```bash
git add apps/pharmopedia/src/i18n/locales
git commit -m "i18n(pharmopedia): add home namespace + tabs.home"
```

---

## Task 2: recent-search store

**Files:**
- Create: `apps/pharmopedia/src/store/recent-search-store.ts`
- Test: `apps/pharmopedia/src/__tests__/recent-search-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/recent-search-store.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

const store: Record<string, string> = {}
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => store[k] ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => { store[k] = v }),
}))

import { useRecentSearchStore } from '@/store/recent-search-store'

describe('recent-search-store', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    useRecentSearchStore.setState({ recents: [], initialized: false })
  })

  it('adds queries most-recent-first', async () => {
    await useRecentSearchStore.getState().add('amox')
    await useRecentSearchStore.getState().add('paracetamol')
    expect(useRecentSearchStore.getState().recents).toEqual(['paracetamol', 'amox'])
  })

  it('dedupes case-insensitively and moves the match to the front', async () => {
    await useRecentSearchStore.getState().add('Amox')
    await useRecentSearchStore.getState().add('metformin')
    await useRecentSearchStore.getState().add('amox')
    expect(useRecentSearchStore.getState().recents).toEqual(['amox', 'metformin'])
  })

  it('ignores blank queries', async () => {
    await useRecentSearchStore.getState().add('   ')
    expect(useRecentSearchStore.getState().recents).toEqual([])
  })

  it('caps at 10', async () => {
    for (let i = 0; i < 12; i++) await useRecentSearchStore.getState().add(`q${i}`)
    expect(useRecentSearchStore.getState().recents).toHaveLength(10)
    expect(useRecentSearchStore.getState().recents[0]).toBe('q11')
  })

  it('clear empties the list', async () => {
    await useRecentSearchStore.getState().add('amox')
    await useRecentSearchStore.getState().clear()
    expect(useRecentSearchStore.getState().recents).toEqual([])
  })

  it('init loads persisted recents', async () => {
    store['pharmopedia.recent-searches'] = JSON.stringify(['a', 'b'])
    await useRecentSearchStore.getState().init()
    expect(useRecentSearchStore.getState().recents).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/recent-search-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

Create `apps/pharmopedia/src/store/recent-search-store.ts`:
```ts
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const RECENT_KEY = 'pharmopedia.recent-searches'
const MAX = 10

interface RecentSearchState {
  recents: string[]
  initialized: boolean
  init: () => Promise<void>
  add: (query: string) => Promise<void>
  clear: () => Promise<void>
}

export const useRecentSearchStore = create<RecentSearchState>((set, get) => ({
  recents: [],
  initialized: false,

  async init() {
    if (get().initialized) return
    let recents: string[] = []
    try {
      const saved = await SecureStore.getItemAsync(RECENT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) recents = parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX)
      }
    } catch {
      // SecureStore/parse failure — start empty
    }
    set({ recents, initialized: true })
  },

  async add(query: string) {
    const q = query.trim()
    if (!q) return
    const lower = q.toLowerCase()
    const next = [q, ...get().recents.filter((r) => r.toLowerCase() !== lower)].slice(0, MAX)
    set({ recents: next })
    try {
      await SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(next))
    } catch {
      // write failed — in-memory state is still updated
    }
  },

  async clear() {
    set({ recents: [] })
    try {
      await SecureStore.setItemAsync(RECENT_KEY, JSON.stringify([]))
    } catch {
      // silent
    }
  },
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/recent-search-store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/store/recent-search-store.ts apps/pharmopedia/src/__tests__/recent-search-store.test.ts
git commit -m "feat(pharmopedia): recent-search store (SecureStore-persisted)"
```

---

## Task 3: getActiveRecalls query

**Files:**
- Create: `apps/pharmopedia/src/db/recalls.ts`
- Test: `apps/pharmopedia/src/__tests__/recalls.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/recalls.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { getActiveRecalls } from '@/db/recalls'

function fakeDb(rows: Array<{ atc_code: string; inn_name: string; tier3_json: string | null }>) {
  return { getAllAsync: async () => rows } as unknown as Parameters<typeof getActiveRecalls>[0]
}

const recalled = {
  atc_code: 'A02BC01', inn_name: 'Omeprazole',
  tier3_json: JSON.stringify({ recallAlerts: [{ recallId: 'r1', description: 'Impurity found', initiationDate: '2026-05-01', status: 'active' }] }),
}
const completed = {
  atc_code: 'N02BE01', inn_name: 'Paracetamol',
  tier3_json: JSON.stringify({ recallAlerts: [{ recallId: 'r2', description: 'Old recall', initiationDate: '2025-01-01', status: 'completed' }] }),
}

describe('getActiveRecalls', () => {
  it('returns [] for non-pharmacist roles', async () => {
    expect(await getActiveRecalls(fakeDb([recalled]), 'DOCTOR')).toEqual([])
    expect(await getActiveRecalls(fakeDb([recalled]), 'PATIENT')).toEqual([])
  })

  it('returns active recalls for pharmacist', async () => {
    const out = await getActiveRecalls(fakeDb([recalled, completed]), 'PHARMACIST')
    expect(out).toEqual([{ atcCode: 'A02BC01', innName: 'Omeprazole', description: 'Impurity found' }])
  })

  it('works for admin too', async () => {
    const out = await getActiveRecalls(fakeDb([recalled]), 'ADMIN')
    expect(out).toHaveLength(1)
  })

  it('skips malformed tier3 json', async () => {
    const bad = { atc_code: 'X', inn_name: 'X', tier3_json: '{not json' }
    const out = await getActiveRecalls(fakeDb([bad, recalled]), 'PHARMACIST')
    expect(out).toHaveLength(1)
  })

  it('respects the limit', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      atc_code: `C${i}`, inn_name: `Drug${i}`,
      tier3_json: JSON.stringify({ recallAlerts: [{ recallId: `r${i}`, description: `d${i}`, initiationDate: `2026-0${(i % 9) + 1}-01`, status: 'active' }] }),
    }))
    expect(await getActiveRecalls(fakeDb(many), 'PHARMACIST', 3)).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/recalls.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the query**

Create `apps/pharmopedia/src/db/recalls.ts`:
```ts
import type * as SQLite from 'expo-sqlite'

export interface RecallSummary {
  atcCode: string
  innName: string
  description: string
}

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const TERMINAL_STATUSES = new Set(['completed', 'terminated', 'closed', 'resolved', 'cancelled'])

function isActive(status: unknown): boolean {
  if (typeof status !== 'string' || !status.trim()) return true
  return !TERMINAL_STATUSES.has(status.trim().toLowerCase())
}

/**
 * Scan the local catalog's Tier-3 data for drugs with an active recall.
 * Returns [] for roles without Tier-3 access. Tolerant of missing/malformed JSON.
 */
export async function getActiveRecalls(
  db: Pick<SQLite.SQLiteDatabase, 'getAllAsync'>,
  role: string,
  limit = 5,
): Promise<RecallSummary[]> {
  if (!PHARMACIST_ROLES.has(role)) return []
  const rows = await db.getAllAsync<{ atc_code: string; inn_name: string; tier3_json: string | null }>(
    'SELECT atc_code, inn_name, tier3_json FROM drug_catalog WHERE tier3_json IS NOT NULL',
  )
  const collected: Array<RecallSummary & { date: string }> = []
  for (const row of rows) {
    if (!row.tier3_json) continue
    try {
      const entry = JSON.parse(row.tier3_json) as { recallAlerts?: Array<{ description?: string; initiationDate?: string; status?: string }> }
      const alerts = Array.isArray(entry?.recallAlerts) ? entry.recallAlerts : []
      for (const a of alerts) {
        if (isActive(a?.status)) {
          collected.push({
            atcCode: row.atc_code,
            innName: row.inn_name,
            description: typeof a?.description === 'string' ? a.description : '',
            date: typeof a?.initiationDate === 'string' ? a.initiationDate : '',
          })
        }
      }
    } catch {
      // skip malformed Tier-3 JSON
    }
  }
  collected.sort((x, y) => y.date.localeCompare(x.date))
  return collected.slice(0, limit).map(({ atcCode, innName, description }) => ({ atcCode, innName, description }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/recalls.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/db/recalls.ts apps/pharmopedia/src/__tests__/recalls.test.ts
git commit -m "feat(pharmopedia): getActiveRecalls local-catalog query (role-gated)"
```

---

## Task 4: Relocate Search to /search route + Home nav wiring

**Files:**
- Create: `apps/pharmopedia/app/search.tsx`
- Modify: `apps/pharmopedia/app/_layout.tsx`, `apps/pharmopedia/app/(tabs)/_layout.tsx`
- Modify: `apps/pharmopedia/src/__tests__/search-screen.test.tsx`

- [ ] **Step 1: Repoint the existing search test to the new route**

In `apps/pharmopedia/src/__tests__/search-screen.test.tsx`, change the import from `@/app/(tabs)/index` to `@/app/search`. Add `vi.mock('@/store/recent-search-store', () => ({ useRecentSearchStore: Object.assign((sel: (s: { add: () => Promise<void> }) => unknown) => sel({ add: vi.fn() }), { getState: () => ({ add: vi.fn() }) }) }))` and `vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }), useLocalSearchParams: () => ({}) }))` if not already covered by the global expo-router mock (the global mock already provides both, so this may be unnecessary — keep the title assertion `getByText('tabs.search')`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/search-screen.test.tsx`
Expected: FAIL — cannot resolve `@/app/search`.

- [ ] **Step 3: Create `app/search.tsx` (relocated Search screen)**

Create `apps/pharmopedia/app/search.tsx` with today's Search screen body plus `?q=` seeding and recents recording:
```tsx
import { useState, useCallback, useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Search, SearchX } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { CollapsibleList } from '@ultranos/ui-kit/native'
import { SearchBar } from '@/components/SearchBar'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { NetStatusBanner } from '@/components/NetStatusBanner'
import { DrugCard } from '@/components/DrugCard'
import { SkeletonCard } from '@/components/SkeletonCard'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import { useRecentSearchStore } from '@/store/recent-search-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SearchScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string }>()
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const addRecent = useRecentSearchStore((s) => s.add)
  const [query, setQuery] = useState(params.q ?? '')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      if (lastVersion > 0) {
        try { setResults(await searchDrugs(getDatabase(), q, lang, 50)) } catch { setResults([]) }
      } else if (token) {
        try { setResults(await searchDrugsApi(q, lang, 20, token)) } catch { setResults([]) }
      }
    } finally { setLoading(false) }
  }, [lastVersion, lang, token])

  useEffect(() => {
    if (params.q && params.q.trim()) void handleSearch(params.q)
    // run once on mount with the seeded query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { if (query.trim()) await handleSearch(query) } finally { setRefreshing(false) }
  }, [query, handleSearch])

  const openDrug = (atcCode: string) => {
    if (query.trim()) void addRecent(query)
    router.push(`/drug/${atcCode}`)
  }

  const empty = loading ? (
    <View>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} testID={`skeleton-${i}`} />)}</View>
  ) : query.trim().length > 0 ? (
    <View style={[styles.empty, { backgroundColor: colors.surface }]}>
      <SearchX size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.noResultsTitle')}</Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('search.noResultsDescription')}</Text>
    </View>
  ) : (
    <View style={[styles.empty, { backgroundColor: colors.surface }]}>
      <Search size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.emptyTitle')}</Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('search.emptyDescription')}</Text>
    </View>
  )

  return (
    <CollapsibleList<DrugSearchResult>
      title={t('tabs.search')}
      subHeader={<View><SearchBar value={query} onSearch={handleSearch} /><SyncStatusBanner /><NetStatusBanner /></View>}
      data={results}
      keyExtractor={(item, index) => `${item.atcCode}-${index}`}
      renderItem={({ item }) => <DrugCard result={item} lang={lang} onPress={() => openDrug(item.atcCode)} />}
      ListEmptyComponent={empty}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', padding: Spacing[8], gap: Spacing[3], borderRadius: 12, margin: Spacing[4] },
  emptyTitle: { fontSize: FontSize.md, fontFamily: FontFamily.sansSemibold, textAlign: 'center' },
  emptyDesc: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, textAlign: 'center' },
})
```
NOTE: all identifiers are ASCII; `openDrug` is used in both its declaration and the `renderItem` call.

- [ ] **Step 4: Register the `search` route + init recents in `app/_layout.tsx`**

In `apps/pharmopedia/app/_layout.tsx`:
1. Add the recents-store init inside the startup `init()` (both the try and catch branches, next to `useCoachMarkStore.getState().init()`):
```ts
        await useRecentSearchStore.getState().init()
```
   and import it at top: `import { useRecentSearchStore } from '@/store/recent-search-store'`.
2. Add a Stack screen for `search` after the `drug/[atcCode]` screen:
```tsx
          <Stack.Screen name="search" options={{ headerShown: true, title: '', animation: 'slide_from_bottom', animationDuration: 300 }} />
```

- [ ] **Step 5: Make the first tab Home in `(tabs)/_layout.tsx`**

In `apps/pharmopedia/app/(tabs)/_layout.tsx`: change the `Home` icon import (add `Home` to the lucide import, remove `Search` if now unused) and update the `index` `Tabs.Screen` options to `title: t('tabs.home')` with `tabBarIcon: ({ color, size }) => <Home color={color} size={size} />`. Browse/Saved/Profile screens unchanged.

- [ ] **Step 6: Run the search test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/search-screen.test.tsx`
Expected: PASS (`tabs.search` title renders from `app/search.tsx`).

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/app/search.tsx apps/pharmopedia/app/_layout.tsx "apps/pharmopedia/app/(tabs)/_layout.tsx" apps/pharmopedia/src/__tests__/search-screen.test.tsx
git commit -m "feat(pharmopedia): relocate Search to /search route; Home becomes first tab"
```

---

## Task 5: Home dashboard screen

**Files:**
- Create: `apps/pharmopedia/src/components/HomeSearchField.tsx`
- Modify (replace): `apps/pharmopedia/app/(tabs)/index.tsx`
- Test: `apps/pharmopedia/src/__tests__/home-screen.test.tsx`

- [ ] **Step 1: Create HomeSearchField**

Create `apps/pharmopedia/src/components/HomeSearchField.tsx`:
```tsx
import { Pressable, Text, StyleSheet } from 'react-native'
import { Search } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export function HomeSearchField({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  return (
    <Pressable
      testID="home-search-field"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('home.searchPlaceholder')}
      style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Search size={18} color={colors.textMuted} />
      <Text style={[styles.placeholder, { color: colors.textMuted }]}>{t('home.searchPlaceholder')}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3] },
  placeholder: { fontFamily: FontFamily.sans, fontSize: FontSize.base },
})
```

- [ ] **Step 2: Write the failing Home test**

Create `apps/pharmopedia/src/__tests__/home-screen.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

const push = vi.fn()
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { user: { role: string } | null }) => unknown) => s({ user: { role: 'PATIENT' } }) }))
vi.mock('@/store/bookmark-store', () => ({ useBookmarkStore: (s: (x: { bookmarks: [] }) => unknown) => s({ bookmarks: [] }) }))
vi.mock('@/store/recent-search-store', () => ({ useRecentSearchStore: (s: (x: { recents: string[] }) => unknown) => s({ recents: ['amox', 'metformin'] }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/db/recalls', () => ({ getActiveRecalls: vi.fn(async () => []) }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))

import HomeTab from '@/app/(tabs)/index'

describe('HomeTab', () => {
  it('renders a greeting and the search field', () => {
    const { getByTestId } = render(<HomeTab />)
    expect(getByTestId('home-search-field')).toBeTruthy()
  })

  it('pushes /search when the search field is tapped', () => {
    const { getByTestId } = render(<HomeTab />)
    fireEvent.press(getByTestId('home-search-field'))
    expect(push).toHaveBeenCalledWith('/search')
  })

  it('renders recent chips and navigates with the query on tap', () => {
    const { getByText } = render(<HomeTab />)
    expect(getByText('amox')).toBeTruthy()
    fireEvent.press(getByText('metformin'))
    expect(push).toHaveBeenCalledWith({ pathname: '/search', params: { q: 'metformin' } })
  })

  it('hides the safety-alerts section for a patient role', () => {
    const { queryByText } = render(<HomeTab />)
    expect(queryByText('home.safetyAlerts')).toBeNull()
  })

  it('shows the saved-empty CTA when there are no bookmarks', () => {
    const { getByText } = render(<HomeTab />)
    expect(getByText('home.browseCta')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/home-screen.test.tsx`
Expected: FAIL — Home not implemented (still the old Search screen).

- [ ] **Step 4: Replace `(tabs)/index.tsx` with the Home dashboard**

Replace `apps/pharmopedia/app/(tabs)/index.tsx` entirely:
```tsx
import { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pill } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { CollapsibleScreen, Banner, Chip, ListRow, EmptyState } from '@ultranos/ui-kit/native'
import { HomeSearchField } from '@/components/HomeSearchField'
import { getActiveRecalls, type RecallSummary } from '@/db/recalls'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { useRecentSearchStore } from '@/store/recent-search-store'
import { useThemeColors } from '@/hooks/useThemeColors'

const ROLE_LABELS: Record<string, string> = {
  PATIENT: 'Patient', DOCTOR: 'Doctor', NURSE: 'Nurse', LAB_TECH: 'Lab technician', PHARMACIST: 'Pharmacist', ADMIN: 'Admin',
}

function greetingKey(hour: number): 'home.greetingMorning' | 'home.greetingAfternoon' | 'home.greetingEvening' {
  if (hour < 12) return 'home.greetingMorning'
  if (hour < 18) return 'home.greetingAfternoon'
  return 'home.greetingEvening'
}

export default function HomeTab() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const recents = useRecentSearchStore((s) => s.recents)
  const role = user?.role ?? 'PATIENT'
  const [recalls, setRecalls] = useState<RecallSummary[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await getActiveRecalls(getDatabase(), role)
        if (!cancelled) setRecalls(r)
      } catch {
        if (!cancelled) setRecalls([])
      }
    })()
    return () => { cancelled = true }
  }, [role])

  const greeting = t(greetingKey(new Date().getHours()))
  const subtitle = ROLE_LABELS[role] ?? role
  const savedTop = bookmarks.slice(0, 5)

  return (
    <CollapsibleScreen title={greeting} subtitle={subtitle}>
      <HomeSearchField onPress={() => router.push('/search')} />

      {recalls.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('home.safetyAlerts')}</Text>
          <View style={styles.alerts}>
            {recalls.map((r) => (
              <Banner
                key={r.atcCode}
                variant="warning"
                text={`${r.innName}${r.description ? ` — ${r.description}` : ''}`}
                onPress={() => router.push(`/drug/${r.atcCode}`)}
              />
            ))}
          </View>
        </View>
      )}

      {recents.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('home.recent')}</Text>
          <View style={styles.chips}>
            {recents.map((q) => (
              <Chip key={q} label={q} onPress={() => router.push({ pathname: '/search', params: { q } })} />
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.savedHeader}>
          <Text style={[styles.label, { color: colors.textMuted }]}>{t('home.saved')}</Text>
          {bookmarks.length > 5 && (
            <Pressable onPress={() => router.push('/(tabs)/saved')} accessibilityRole="button" accessibilityLabel={t('home.seeAll')}>
              <Text style={[styles.seeAll, { color: colors.primary500 }]}>{t('home.seeAll')}</Text>
            </Pressable>
          )}
        </View>
        {savedTop.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            {savedTop.map((b) => (
              <ListRow key={b.atcCode} icon={Pill} label={b.innName} trailing={<ChevronRight size={18} color={colors.textMuted} />} onPress={() => router.push(`/drug/${b.atcCode}`)} />
            ))}
          </View>
        ) : (
          <EmptyState icon={Pill} title={t('home.savedEmpty')} action={{ label: t('home.browseCta'), onPress: () => router.push('/(tabs)/browse') }} />
        )}
      </View>
    </CollapsibleScreen>
  )
}

const styles = StyleSheet.create({
  section: { gap: Spacing[2] },
  label: { fontFamily: FontFamily.sansBold, fontSize: FontSize.xs, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: Spacing[2] },
  alerts: { gap: Spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  savedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing[2] },
  seeAll: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.sm },
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/home-screen.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add "apps/pharmopedia/app/(tabs)/index.tsx" apps/pharmopedia/src/components/HomeSearchField.tsx apps/pharmopedia/src/__tests__/home-screen.test.tsx
git commit -m "feat(pharmopedia): Home dashboard replaces Search tab"
```

---

## Task 6: Finalize — full suite + typechecks

**Files:** none (verification only)

- [ ] **Step 1: Full Pharmopedia suite**

Run: `pnpm --filter @ultranos/pharmopedia test 2>&1 | grep -E "Test Files|Tests "`
Expected: more tests pass than before (the 3 new test files added); the only failing suites should be the same pre-existing content ones (`clinical-tab-extended`, `login-screen` register-link) carried from E2 — confirm no NEW failures.

- [ ] **Step 2: ui-native unaffected**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native 2>&1 | grep -E "Test Files|Tests "`
Expected: 12 files / 41 tests pass (unchanged from E2).

- [ ] **Step 3: Typechecks**

Run: `pnpm --filter @ultranos/ui-kit typecheck >/dev/null 2>&1 && echo UIKIT_PASS; pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -c "native/"`
Expected: `UIKIT_PASS` and native error count `0`.

- [ ] **Step 4: Commit (only if verification-driven fixes were needed)**

```bash
git add -A
git commit -m "chore(pharmopedia): E3 Home dashboard complete"
```

---

## Self-Review

**Spec coverage (E3 spec §3–§6):**
- §3.1 nav change (Home first tab + `tabs.home`) → Tasks 1, 4. ✓
- §3.2 Search relocation to `app/search.tsx` (+ `?q=` seed + root Stack route) → Task 4. ✓
- §3.3 recent-search store → Task 2; init in `_layout` → Task 4 Step 4. ✓
- §3.4 Home sections (search field, role-gated alerts hidden-if-empty, recent chips, saved + empty CTA) → Task 5. ✓
- §3.5 `getActiveRecalls` → Task 3. ✓
- §3.6 i18n keys (all locales, real translations) → Task 1. ✓
- §4 testing: recents store (Task 2), recalls (Task 3), Home (Task 5), search route (Task 4), finalize (Task 6). ✓
- §6 success criteria → Task 6. ✓

**Placeholder scan:** All steps carry complete code/commands. The one identifier hazard (a non-ASCII `openДrug` slipped into the Task 4 code block) is explicitly called out with a correction note to use `openDrug`. No TBD/TODO. ✓

**Type consistency:** `useRecentSearchStore` (recents/add/clear/init) consistent across Tasks 2/4/5; `getActiveRecalls(db, role, limit)` + `RecallSummary` consistent across Tasks 3/5; `HomeSearchField({onPress})` consistent across Tasks 5; i18n keys used in Task 5 (`home.*`, `tabs.home`) all defined in Task 1; `CollapsibleScreen`/`Banner`/`Chip`/`ListRow`/`EmptyState` imported from `@ultranos/ui-kit/native` (E1/E2). ✓

**Carried risk:** Home greeting uses `new Date().getHours()` (fine in app + test env). The pushed `/search` header uses the root Stack header like `drug/[atcCode]`. Collapse animation still needs a real Expo run (unchanged caveat).
```
