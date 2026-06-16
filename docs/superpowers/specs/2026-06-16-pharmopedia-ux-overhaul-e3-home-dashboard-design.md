# Pharmopedia UX Overhaul — E3: Home Dashboard (Design Spec)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/`
**Branch:** `ux-v1.5`
**Status:** Approved for planning
**Builds on:** E1 (native UI kit) + E2 (app shell, collapsing headers) — both committed. See the E1/E2 specs.

---

## 1. Background

E2 gave every tab a collapsing header but kept the original four tabs (Search · Browse · Saved · Profile), with Search as the landing screen. The product direction is now: **the app should open to a Home dashboard, not a bare search box.**

Per the latest decision, **Home replaces the Search tab** (not added alongside it). Search remains fully available but is reached from Home and rendered as a pushed full-screen route rather than a tab. Profile stays a tab (its content rebuild is **E4**).

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Tab bar | **Home · Browse · Saved · Profile** (Search removed as a tab) |
| Search access | Home has a search field that **pushes a full-screen `/search` route** (the existing Search screen, relocated — all current search logic preserved) |
| Safety-alerts source | **Local catalog**, scanning Tier-3 recall data; **role-gated to pharmacist/admin**; the section **hides when there are none** (no backend) |
| Recents | New persistent **recent-search store** (Zustand + SecureStore, capped) |
| Greeting name | Time-of-day greeting; **name comes from E4** — until then Home falls back to role (or a generic greeting) |
| Profile | Unchanged in E3 (still the E2-wrapped existing content); full rebuild + Hub endpoint is **E4** |

## 3. Scope

### 3.1 Navigation change
`apps/pharmopedia/app/(tabs)/_layout.tsx`: the first tab (`index`) becomes **Home** — update its `title` to `t('tabs.home')` and icon to `Home` (lucide). Browse/Saved/Profile `Tabs.Screen` entries are unchanged. No Search tab.

New i18n key `tabs.home` added to all four locales (`en/prs/ps/ar`) to preserve `Translations = typeof en` parity.

### 3.2 Search relocation
- Create `apps/pharmopedia/app/search.tsx` containing the **current Search screen** (the body of today's `(tabs)/index.tsx`: `CollapsibleList` titled `t('tabs.search')`, `SearchBar` subHeader, results, empty/loading states, all `handleSearch`/`lastVersion`/`token`/`onRefresh` logic — moved verbatim, with one addition: it accepts an optional initial query via `useLocalSearchParams<{ q?: string }>()` and seeds the search on mount when present).
- Register the route in the root Stack (`apps/pharmopedia/app/_layout.tsx`): add `<Stack.Screen name="search" options={{ headerShown: true, title: '', animation: 'slide_from_bottom' }} />` (mirrors the existing `drug/[atcCode]` screen pattern).
- `(tabs)/index.tsx` is **replaced** by the Home dashboard (3.4).
- On opening a result from Search, record the query in the recents store (3.3).

### 3.3 Recent-search store
`apps/pharmopedia/src/store/recent-search-store.ts` — Zustand store, persisted to `expo-secure-store` (same pattern as `coach-mark-store`/`lang-store`):
```typescript
interface RecentSearchState {
  recents: string[]          // most-recent-first, deduped, capped at 10
  initialized: boolean
  init: () => Promise<void>
  add: (query: string) => Promise<void>   // trims, dedupes (case-insensitive), unshifts, caps, persists
  clear: () => Promise<void>
}
```
Key: `'pharmopedia.recent-searches'`. `add` ignores blank/whitespace queries. Initialized in `app/_layout.tsx`'s startup `init()` alongside the other stores.

### 3.4 Home screen (`app/(tabs)/index.tsx`)
Built on E2's `CollapsibleScreen`. Title = time-of-day greeting; subtitle = role label (E3 fallback; E4 swaps in the name). Sections in order:

1. **Search field** — a **non-interactive pressable styled like a search input** (a row with a `Search` icon + placeholder text, surface background, rounded), NOT the live `SearchBar` — typing happens on the `/search` screen. On press, `router.push('/search')`. Lives in a small `HomeSearchField` component (or inline in Home) and carries `accessibilityRole="button"` with a "Search medicines" label.
2. **Safety alerts** — `getActiveRecalls(db, role)` (3.5); for each, a tappable `Banner` (variant `warning`) → `router.push('/drug/<atcCode>')`. **Rendered only when `role ∈ {PHARMACIST, ADMIN}` and the list is non-empty**; otherwise the whole section is omitted.
3. **Recent** — `Chip`s from `recent-search-store.recents`; tapping a chip `router.push({ pathname: '/search', params: { q } })`. Section hidden when empty.
4. **Saved** — up to 5 bookmarks (from `bookmark-store`) as `ListRow`s → `router.push('/drug/<atcCode>')`; if there are more, a "See all" row → Saved tab. When there are no bookmarks, show an `EmptyState`-style prompt with a "Browse medicines" action → Browse tab.

Section headers use `CardSection` labels or simple labeled groups, consistent with the Clinical-Calm system.

### 3.5 `getActiveRecalls` DB query
`apps/pharmopedia/src/db/recalls.ts` (new): `getActiveRecalls(db, role, limit = 5): Promise<RecallSummary[]>` where `RecallSummary = { atcCode: string; innName: string; description: string }`.
- Returns `[]` immediately if `role` is not pharmacist/admin.
- Scans `drug_catalog` rows, parses the Tier-3 JSON, and collects entries whose recall-alerts array has an active recall (`status` indicating active). Returns at most `limit`, newest first by recall initiation date when available.
- Tolerant of missing/malformed Tier-3 JSON (skip the row).

### 3.6 i18n keys (all four locales)
- `tabs.home` (e.g. "Home")
- `home.greetingMorning` / `home.greetingAfternoon` / `home.greetingEvening`
- `home.searchPlaceholder`, `home.recent`, `home.saved`, `home.safetyAlerts`, `home.seeAll`, `home.browseCta`, `home.savedEmpty`
All added with real translations in `prs/ps/ar` (not English placeholders), placed to keep the four locale objects structurally identical.

## 4. Testing
- **recent-search-store**: add dedupes (case-insensitive) + caps at 10 + ignores blanks; clear empties; init loads persisted.
- **getActiveRecalls**: returns `[]` for non-pharmacist roles; returns active recalls for pharmacist/admin; skips malformed Tier-3 JSON.
- **Home screen**: renders greeting + search entry; safety-alerts section hidden for a patient role and shown for pharmacist with recall data; recent chips render and navigate; saved list renders / empty CTA shows; tapping the search field pushes `/search`.
- **Search route** (`app/search.tsx`): the relocated search tests (moved from the old `(tabs)/index.tsx` search test) still pass; seeding via `?q=` runs an initial search.
- No regression to E1/E2 tests.

## 5. Out of Scope (E3)
- Profile content rebuild + Hub `users.getProfile` endpoint + the greeting **name** — all **E4**.
- A server-side / cross-role recall feed (E3 uses local Tier-3 data only).
- Drug-detail rework + P0 bugs — **E5**.
- Remaining prs/ps/ar translation of older blocks, DrugCard redesign — **E6**.

## 6. Success Criteria
- App opens to Home; tab bar is Home · Browse · Saved · Profile (no Search tab).
- Home shows greeting, a search entry that pushes `/search`, recent chips, and saved shortcuts; safety-alerts appears only for pharmacist/admin with active recalls and is hidden otherwise.
- Full search works from the `/search` route with all prior behavior; recent searches persist across launches.
- New i18n keys present in all four locales with real translations; `pnpm --filter @ultranos/pharmopedia typecheck` adds no new native errors; ui-kit typecheck passes; new/relocated tests pass with no regressions.

## 7. Risks / Open Questions
- **Search-route header:** the pushed `/search` uses the root Stack header (`headerShown: true, title: ''`) like `drug/[atcCode]`; confirm the back affordance reads well. The screen keeps its own collapsing in-content title.
- **`getActiveRecalls` performance:** full-table JSON scan is fine for a few-thousand-row catalog; if the catalog grows large, revisit with an indexed column. Logged, not solved here.
- **Greeting name fallback:** until E4, subtitle shows the role; ensure the swap to a real name in E4 is a one-line change (Home reads `auth-store.user?.name ?? roleLabel`).
- **Recents privacy:** recent *search queries* are stored in SecureStore; these are drug-name queries, not PHI, consistent with the app's no-PHI-local stance.
