# Pharmopedia UX Overhaul — E2: App Shell & IA (Design Spec)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/`
**Branch:** `ux-v1.5`
**Status:** Approved for planning
**Builds on:** E1 (Native UI Kit foundation — `@ultranos/ui-kit/native`, complete). See `2026-06-16-pharmopedia-ux-overhaul-e1-native-ui-kit-design.md`.

---

## 1. Background

E1 delivered the shared Clinical-Calm RN primitives (`Screen`, `ScreenHeader`, `Card`/`CardSection`, `ListRow`, `Button`, `Avatar`, `Chip`, `Banner`, `EmptyState`, `UiKitProvider`). They are built and tested but **not yet wired into the app** — every Pharmopedia screen still opens with no header, and the shell has structural bugs (bare-`View` screens that ignore SafeArea, Android back broken on Browse drill-down, two coach-marks stacked on Profile, no offline banner on Profile).

E2 wires the provider and rebuilds the **app shell and information architecture** so every screen gets a proper header and consistent structure, in the approved **collapsing large-title** (Apple Health) style.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Navigation structure | **Keep today's 4 tabs** (Search · Browse · Saved · Profile). The Home-tab + Profile-via-avatar restructure is **deferred to E3** (lands with the Home screen). |
| Header style | **Collapsing large title** — large Public Sans title that shrinks into a compact sticky bar on scroll. |
| Test harness | **Fixed in E2** — add Expo/native module mocks so the 11 currently-broken screen-level suites run, enabling real verification of screen retrofits. |
| Provider | `UiKitProvider` wired at the app root, fed by the existing `theme-store` (mode) and `lang-store` (rtl). |

## 3. Scope

### 3.1 Test-harness fix (do first)

The 11 screen-level Vitest suites (`browse-tab`, `saved-tab`, `login-screen`, `register-screen`, `profile-lang-selector`, `profile-theme-toggle`, `share-button`, `sync-status-banner`, `clinical-tab-extended`, `drug-detail-i18n`, `formulary-tab`) fail with `ReferenceError: __DEV__ is not defined` because real Expo native modules load in the node test env.

**Approach:** mirror the existing mock pattern (`react-native`, `lucide-react-native`, `react-native-safe-area-context` are aliased to hand-written mocks in `apps/pharmopedia/src/__mocks__/` via `vitest.config.ts`). Add lightweight mocks + aliases for the Expo/native modules the screens import. The exact set is discovered by running the failing suites; expected list:
- `expo-haptics`, `expo-secure-store`, `expo-location`, `expo-router`, `expo-updates`, `expo-constants`, `expo-linking`, `@react-native-community/netinfo`.

Each mock exposes only the surface the app uses (e.g. `expo-router`: `useRouter`, `useLocalSearchParams`, `Link`, `Stack`, `Tabs`; `@react-native-community/netinfo`: `addEventListener`, `fetch`). Alternatively, define `__DEV__` as a global in the Vitest config (`define: { __DEV__: true }` or a setup file) to neutralize the root cause, **plus** the per-module mocks for ones that still need API surface. The plan decides the minimal combination empirically.

**Success:** the 11 suites load and run (assertions may still need per-test mocks, but no module-resolution / `__DEV__` crashes). No regression to the 35 currently-passing suites.

### 3.2 Provider wiring

`apps/pharmopedia/app/_layout.tsx`: wrap the app tree in `<UiKitProvider mode={resolvedTheme} rtl={isRtlLang(lang)}>`, with `resolvedTheme` from `useThemeStore` and `lang` from `useLangStore`. The provider must sit inside the existing font/i18n/theme initialization and above the navigators so every screen is covered. The app's existing `@/hooks/useThemeColors` (reads `theme-store` directly) is left intact — it resolves to the same palette, so old and new code stay consistent during the retrofit.

### 3.3 New collapsing-header components (`packages/ui-kit/src/native/`)

Decomposed into three focused units:

**`CollapsibleHeaderBar` (internal building block)**
Renders the visual header and is driven by an `Animated.Value` (scroll offset):
- A **large title** (`FontFamily.headingBold`, `FontSize['2xl']`) + optional `subtitle` + optional `action`, that translates up and fades as `scrollY` increases.
- A **compact sticky bar** (small centered/leading title, `borderBottom` hairline) that fades in once `scrollY` passes the large-title height.
- Theme-aware (`useThemeColors`), RTL-aware (`useRtl` → logical alignment, Arabic font, `row-reverse`).
- Opacity/translate interpolations use `useNativeDriver: true`.

**`CollapsibleList<T>`** — the FlatList screen container (Search/Browse/Saved; preserves virtualization):
```typescript
interface CollapsibleListProps<T> {
  title: string
  subtitle?: string
  action?: React.ReactNode
  subHeader?: React.ReactNode          // e.g. SearchBar — pinned below the compact bar
  data: T[]
  renderItem: (info: { item: T; index: number }) => React.ReactElement | null
  keyExtractor: (item: T, index: number) => string
  ListEmptyComponent?: React.ReactElement
  refreshing?: boolean
  onRefresh?: () => void
  onEndReached?: () => void
  testID?: string
}
```
Internally an `Animated.FlatList` whose `onScroll` drives the shared `scrollY`; the large title is the `ListHeaderComponent`; the compact bar overlays at the top. Wrapped in `Screen` (SafeArea + `surfaceSubtle` bg).

**`CollapsibleScreen`** — the ScrollView container (short content like Profile):
```typescript
interface CollapsibleScreenProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  testID?: string
}
```
Internally an `Animated.ScrollView` with the same header behavior.

The static `Screen`/`ScreenHeader` from E1 remain for non-scrolling/simple cases.

### 3.4 Screen retrofits

| Screen | Change |
|---|---|
| **Search** (`app/(tabs)/index.tsx`) | `CollapsibleList` titled `t('tabs.search')`; `SearchBar` as `subHeader`; results as `data`; `EmptyState` (no-query and no-results variants) as `ListEmptyComponent`; `SkeletonCard` list while loading; keep `SyncStatusBanner`/`NetStatusBanner`. |
| **Browse** (`app/(tabs)/browse.tsx`) | `CollapsibleList` titled `t('tabs.browse')` for classes; drill-down keeps internal state **but** adds a `BackHandler` effect so Android hardware back returns to the class list (not exit the tab); loading skeletons and empty state render inside the container (fixes bare-`View` SafeArea bug). The in-screen "Back" text button stays for visible affordance. |
| **Saved** (`app/(tabs)/saved.tsx`) | `CollapsibleList` titled `t('tabs.saved')`; empty state uses `EmptyState` with an action `{ label: t('saved.browseCta'), onPress: → Browse tab }` (fixes the bare-`View`/no-SafeArea empty bug). |
| **Profile** (`app/(tabs)/profile.tsx`) | Wrap existing content in `CollapsibleScreen` titled `t('tabs.profile')`; **fix coach-mark stacking** (render the `profile-sync` mark only after `profile-lang` is dismissed — sequence via `coach-mark-store` state); add the missing `NetStatusBanner`. Content/layout rebuild stays in **E4**. |

New i18n key required: `saved.browseCta` (e.g. "Browse medicines") added to all four locales (`en/prs/ps/ar`) to keep structural parity (`Translations = typeof en`).

### 3.5 Bug fixes folded in
- Saved-empty & Browse-loading now always inside a SafeArea container (structural fix).
- Browse Android hardware-back returns to class list.
- Profile coach-marks no longer stack (sequenced).
- Profile gets an offline `NetStatusBanner`.

## 4. Testing

- **New components** (`CollapsibleHeaderBar`, `CollapsibleList`, `CollapsibleScreen`): tests under `apps/pharmopedia/src/__tests__/ui-native/` asserting — title/subtitle/action render; list renders items; `ListEmptyComponent` shows when `data` empty; `subHeader` renders; theme (dark) + RTL (Arabic font / `row-reverse`) applied. Animation isn't exercised (mocked `Animated`), so tests assert structure and that `onScroll` is wired (an `Animated.Value` prop is threaded).
- **Harness**: after 3.1, the 11 screen suites load. Update the retrofitted screen tests (`browse-tab`, `saved-tab`, profile tests, search) to assert the new headers/empty states where they previously asserted ad-hoc markup. Add a Browse `BackHandler` test (simulating hardware back returns to class list).
- No regression to E1's 36 ui-native tests or the existing passing suites.

## 5. Out of Scope (E2)
- Home dashboard + nav restructure (Home tab, Profile→avatar) — **E3**.
- Profile content rebuild (identity header, grouped settings, About/Support) + Hub profile endpoint — **E4**.
- Drug-detail rework + P0 bugs — **E5**.
- Translation completion for prs/ps/ar, DrugCard redesign, deeper a11y/motion — **E6**.

## 6. Success Criteria
- `UiKitProvider` wraps the app; all 4 tabs render a collapsing large-title header in the Clinical-Calm style, light/dark/RTL.
- Saved/Browse no longer render content outside SafeArea; Browse Android back works; Profile coach-marks sequence; Profile shows an offline banner.
- The 11 previously-broken screen suites load and run; new collapsing-header component tests pass; no regression to existing passing tests.
- `pnpm --filter @ultranos/ui-kit typecheck` passes; pharmopedia native typecheck adds zero new errors.

## 7. Risks / Open Questions
- **Collapsing animation under RN 0.81 + Reanimated coexistence:** use the core `Animated` API (already mocked in tests) with `useNativeDriver` for opacity/translate; avoid mixing with Reanimated. The plan validates on at least one screen before retrofitting all.
- **`Animated.FlatList` + RTL:** verify the list and header flip correctly; the plan includes an RTL check.
- **Harness minimization:** prefer a single `__DEV__` global define + the smallest set of module mocks; the plan determines the minimal combination by running the suites.
- **SearchBar as sticky subHeader:** if pinning proves fiddly, fall back to rendering SearchBar in the list header (scrolls with content) for E2 and revisit in E6.
