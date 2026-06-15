# Pharmopedia UX Polish — Design Spec

**Date:** 2026-06-14
**Branch:** `ux-v1.5`
**App:** `apps/pharmopedia/`
**Target devices:** Mid-range Android phones

---

## Overview

A three-epic polish pass that transforms Pharmopedia from functionally complete to visually refined and delightful. The app's architecture, data layer, and feature set are solid — this work focuses entirely on how it *feels*.

**Scope:**
- Epic 1: Dark Mode & Theme System
- Epic 2: Motion & Feedback
- Epic 3: Visual Refinement & Onboarding

**Out of scope:** New clinical features, new data integrations, backend changes, new API endpoints.

---

## Epic 1: Dark Mode & Theme System

### Theme Store

New Zustand store: `src/store/theme-store.ts`

- Three modes: `light`, `dark`, `system`
- On `system` mode: reads `Appearance.getColorScheme()` and listens for changes via `Appearance.addChangeListener`
- Persists preference to `expo-secure-store` under key `theme-preference` (same pattern as `lang-store.ts`)
- Exposes: `mode`, `resolvedTheme` (always `'light'` or `'dark'`), `setMode()`

### Dark Palette

Added to `packages/ui-kit/src/tokens.native.ts` as a `ColorsDark` export alongside the existing `Colors`.

New semantic color keys added to **both** `Colors` and `ColorsDark`:

| Key | Light value | Dark value | Usage |
|---|---|---|---|
| `surface` | `#ffffff` | `#121212` | Primary background |
| `surfaceElevated` | `#ffffff` | `#1e1e1e` | Card/modal background |
| `surfaceSubtle` | `#f5f5f5` | `#2a2a2a` | Input fields, secondary bg |
| `textPrimary` | `neutral900` | `#f0f0f0` | Primary text |
| `textSecondary` | `neutral600` | `#a0a0a0` | Secondary text |
| `textMuted` | `neutral400` | `#666666` | Tertiary/hint text |
| `border` | `neutral200` | `#333333` | Divider/card borders |
| `borderSubtle` | `neutral100` | `#262626` | Subtle separators |
| `overlay` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.7)` | Modal backdrop |

Accent colors (`primary500`, `danger`, `warning`, `success`, etc.) remain the same across themes — they're designed with sufficient contrast for both light and dark backgrounds.

### Theme Hook

`useThemeColors()` — returns the correct color set based on `resolvedTheme` from `theme-store`. All components migrate from direct `Colors` import to this hook.

```typescript
// Before
import { Colors } from '@ultranos/ui-kit/tokens.native'
const styles = StyleSheet.create({ card: { backgroundColor: Colors.white } })

// After
const colors = useThemeColors()
const styles = { card: { backgroundColor: colors.surfaceElevated } }
```

Components that need theme-reactive styles move from `StyleSheet.create()` (static) to inline style objects or a `useThemedStyles(colors)` pattern that returns a `StyleSheet` from a factory function.

### Component Migration

Every component in `src/components/` and every screen in `app/` migrates from `Colors` to `useThemeColors()`. Hardcoded background colors (`'#fff'`, `'#f9f9f9'`, etc.) are replaced with semantic tokens.

### Profile Screen Toggle

A new "Appearance" section below the existing Language selector on the Profile tab. Three-option segmented control: **Light / Dark / System**. Styled consistently with the existing language selector UI. Changing the theme applies immediately (no app reload needed — unlike RTL language changes).

### Status Bar

Root layout dynamically sets `<StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />` so status bar text is always readable against the current theme background.

---

## Epic 2: Motion & Feedback

### Screen Transitions (react-native-reanimated)

| Transition | Animation | Duration |
|---|---|---|
| Drug detail push (from search/browse/saved) | Slide-up with fade | 300ms spring |
| Tab switches | Crossfade | 150ms |
| Auth → Tabs | Fade-through | 250ms |

Custom transition configs set on the Stack/Tab navigator `screenOptions`.

### List Item Entrances

`DrugCard`, `TherapeuticClassCard`, and `PriceCard` get staggered fade-in-up animations on first render:
- Each item delays by `50ms × index`, capped at index 10 (items beyond 10 appear instantly)
- Uses `Animated.FlatList` with `itemLayoutAnimation` (reanimated `FadeInUp`)
- Animation only on initial mount — not on scroll reveal (avoids jank on fast scrolling)

### Drug Detail Tab Indicator

The role-based tab bar on the drug detail screen gets an animated underline that slides between tabs. Reanimated shared layout transition. Underline color: `primary500`. Width matches tab label width.

### Bookmark Toggle Animation

Heart icon scales `1.0 → 1.3 → 1.0` with a 200ms spring when toggled **on**. No animation on toggle off (instant swap — asymmetric feedback feels more intentional).

### Sync Progress Counter

`SyncStatusBanner` count animates numerically (smooth counting up) rather than snapping to new values. Uses reanimated's `useDerivedValue` with a timing animation on the displayed number.

### Haptic Feedback (expo-haptics)

New helper: `src/lib/haptics.ts` — thin wrapper around `expo-haptics`. No-ops silently on unsupported devices/emulators.

| Action | Haptic type |
|---|---|
| Bookmark toggled on | `ImpactFeedbackStyle.Light` |
| Share button pressed | `ImpactFeedbackStyle.Light` |
| Sync complete | `NotificationFeedbackType.Success` |
| Auth error / sync error | `NotificationFeedbackType.Error` |
| Pull-to-refresh trigger | `ImpactFeedbackStyle.Medium` |
| Enrich form submitted | `NotificationFeedbackType.Success` |
| Language/theme changed | `SelectionFeedback` |

### Skeleton Loaders

New component: `src/components/SkeletonCard.tsx` — shimmer animation (linear gradient sweep via reanimated) over a placeholder shape. Uses theme colors (`surfaceSubtle` → `surface` → `surfaceSubtle` sweep) for light/dark correctness.

| Screen | What gets skeletons | Replaces |
|---|---|---|
| Search tab | 4 skeleton cards while FTS query runs | ActivityIndicator |
| Browse tab | 3 skeleton class cards while classes load | ActivityIndicator |
| Drug detail | Skeleton blocks matching tab layout while entry loads | ActivityIndicator |
| Pricing tab | 3 skeleton price cards while geolocation resolves | ActivityIndicator |

### Pull-to-Refresh

`RefreshControl` added to FlatList/ScrollView on:

| Screen | Refresh action |
|---|---|
| Search tab | Clears results and re-runs current query (local + API) |
| Browse tab | Re-fetches therapeutic classes from SQLite |
| Saved tab | Re-reads bookmarks from SQLite |
| Pricing tab | Re-fetches prices with current location |

Spinner color: `primary500` (light) / `primary400` (dark).

### Offline Connectivity Indicator

New component: `src/components/NetStatusBanner.tsx`

- Uses `@react-native-community/netinfo` to detect connectivity
- Renders a slim banner below the header when offline: "You're offline — showing cached data"
- Slide-down entrance (200ms reanimated), auto-dismisses with slide-up when connectivity returns
- Warning styling: `warningLight` background, `warningDark` text
- Does **not** replace `SyncStatusBanner` — they address different concerns (network state vs. sync state)

### Error Boundaries

**App-level boundary:** Wraps the tab navigator. On unhandled component crash: renders a centered screen with error icon, "Something went wrong" message, and "Reload" button (`Updates.reloadAsync()`). Localized in all 4 languages.

**Tab-level boundary:** Each drug detail tab (`OverviewTab`, `ClinicalTab`, `FormularyTab`, `PricingTab`, `EnrichTab`) wrapped individually. A crash in one tab shows a fallback in that tab only — the rest of the detail screen remains functional.

---

## Epic 3: Visual Refinement & Onboarding

### Card Redesigns

**DrugCard:**
- Elevated card: `surfaceElevated` background, `Radius.lg` corners, `Shadow.sm`
- Left accent bar: 2px, `primary500` (flips to right in RTL)
- Therapeutic class rendered as a subtle badge chip below drug name
- Bookmark icon: filled/unfilled heart (replacing generic icon)

**TherapeuticClassCard:**
- Leading category icon from a lookup table (cardiovascular → Heart, analgesic → Pill, anti-infective → Shield, etc., generic fallback for unknown classes)
- Drug count badge: `primaryLight` background, `primary600` text
- Trailing chevron (RTL-mirrored via `DirectionalIcon`)

**PriceCard:**
- Colored left border by stock status: green (in stock), amber (low), red (out)
- Distance line with MapPin icon
- Price in larger font weight for scannability

### Drug Detail Header

Restructured layout above the tabs:

- **Primary name** — `FontFamily.headingBold`, `FontSize.xl`
- **INN name + ATC code** — Secondary line, `textSecondary`, separated by middle dot (`·`)
- **Therapeutic class** — Badge chip below names
- **Action row** — Bookmark heart + Share button, end-aligned (start-aligned in RTL)

Tab bar visual refinement: `textMuted` for inactive tabs, `primary500` + animated underline for active tab.

### Empty States

Upgraded from plain text to icon + title + description pattern:

| Screen | Icon | Title | Description |
|---|---|---|---|
| Search (no query) | `Search` | "Find a medication" | "Search by drug name, brand, or ATC code" |
| Search (no results) | `SearchX` | "No results" | "Try a different spelling or search term" |
| Browse (no classes) | `FolderOpen` | "No categories yet" | "Sync your catalog to browse by class" |
| Saved (empty) | `BookmarkPlus` | "No saved drugs" | "Bookmark drugs to find them quickly here" |
| Pricing (no results) | `MapPinOff` | "No prices nearby" | "Try again when connected to the internet" |
| Formulary (no subs) | `Pill` | "No substitutes listed" | *(no description)* |

Icons rendered at 48px in `textMuted` color. All strings localized in all 4 locale files.

### Tab Bar Polish

Bottom tab navigator refinements:
- Active icon: `primary500` with subtle filled background pill
- Inactive icon: `textMuted`
- Labels: `FontFamily.sansMedium`, `FontSize.xs`
- Tab bar container: subtle elevation shadow, theme-aware background (`surface` / `surfaceElevated`)

### Language Selector on Auth Screens

**Login screen:** Language selector at the top of the screen (above the form). Compact row of 4 tappable chips: **EN / دری / پښتو / عربي**. Active chip: `primary500` background, white text. Inactive chips: `surfaceSubtle` background, `textSecondary` text.

**Register screen:** Same language chip row at the top, matching login.

**SearchBar:** Language switcher **removed entirely**. SearchBar becomes a clean single-purpose input: search icon + text field + clear button.

**Profile tab:** Existing language selector unchanged. Post-login language changes happen here.

### Welcome Screen

Single full-screen welcome displayed on first launch only:
- Tracked via `hasSeenWelcome` flag in SecureStore
- App icon centered
- App name: "Pharmopedia" in `FontFamily.headingBold`
- Tagline: "Your offline drug reference" (localized)
- "Get Started" primary button → navigates to auth (if not logged in) or tabs (if already authenticated)
- Background: subtle gradient from `primaryLight` to `surface`
- No carousel, no swipe slides — one clean screen

### Progressive Coach Marks

**Component:** `src/components/CoachMark.tsx`

Semi-transparent overlay highlighting a target element (via `measure()` on a target ref) with a tooltip bubble. Tap anywhere to dismiss. One coach mark at a time, never stacked.

**Tracking:** `src/store/coach-mark-store.ts` — Zustand + SecureStore. Tracks dismissed marks by key string. Resets on sign-out (shared device support).

**Placement (5 marks):**

| Key | Screen | Target | Hint |
|---|---|---|---|
| `browse-class` | Browse | First TherapeuticClassCard | "Tap a category to see all drugs in that class" |
| `detail-bookmark` | Drug Detail | Bookmark heart icon | "Save drugs for quick access in the Saved tab" |
| `detail-tabs` | Drug Detail | Tab bar | "Swipe between tabs for clinical details, pricing, and more" |
| `profile-lang` | Profile | Language selector | "Change your language anytime from settings" |
| `profile-sync` | Profile | Sync Now button | "Keep your catalog updated — sync downloads the latest drugs" |

**Trigger timing:** Coach marks fire on the **second visit** to each screen (not the first). 300ms delay before showing to avoid overlap with screen transition animations.

---

## Implementation Dependencies

```
Epic 1 (Dark Mode & Theme System)
  └── Epic 2 (Motion & Feedback)      ← uses theme colors for skeletons, banners
  └── Epic 3 (Visual Refinement)       ← uses theme colors for cards, empty states
```

Epic 2 and Epic 3 can run in parallel after Epic 1 ships. No dependency between them.

---

## Files Created (New)

| File | Epic | Purpose |
|---|---|---|
| `src/store/theme-store.ts` | 1 | Theme mode + persistence |
| `src/hooks/useThemeColors.ts` | 1 | Resolved color set hook |
| `src/lib/haptics.ts` | 2 | Haptic feedback wrapper |
| `src/components/SkeletonCard.tsx` | 2 | Shimmer skeleton loader |
| `src/components/NetStatusBanner.tsx` | 2 | Offline connectivity banner |
| `src/components/CrashFallback.tsx` | 2 | Error boundary fallback UI |
| `src/components/CoachMark.tsx` | 3 | Progressive tooltip overlay |
| `src/store/coach-mark-store.ts` | 3 | Coach mark dismissal tracking |
| `app/welcome.tsx` | 3 | First-launch welcome screen |

## Files Modified (Key Changes)

| File | Epic | Change |
|---|---|---|
| `packages/ui-kit/src/tokens.native.ts` | 1 | Add `ColorsDark`, semantic keys to both palettes |
| `app/_layout.tsx` | 1, 2 | ThemeProvider wrap, StatusBar, error boundary |
| `app/(tabs)/_layout.tsx` | 2, 3 | Tab bar styling, transition config |
| `app/drug/[atcCode].tsx` | 2, 3 | Animated tab indicator, header redesign |
| `app/(auth)/login.tsx` | 3 | Language chip selector at top |
| `app/(auth)/register.tsx` | 3 | Language chip selector at top |
| `app/(tabs)/index.tsx` | 2, 3 | Skeletons, pull-to-refresh, empty state |
| `app/(tabs)/browse.tsx` | 2, 3 | Skeletons, pull-to-refresh, empty state |
| `app/(tabs)/saved.tsx` | 2, 3 | Pull-to-refresh, empty state |
| `app/(tabs)/profile.tsx` | 1, 3 | Appearance toggle, coach marks |
| `src/components/SearchBar.tsx` | 3 | Remove language switcher |
| `src/components/DrugCard.tsx` | 2, 3 | Card redesign, entrance animation |
| `src/components/TherapeuticClassCard.tsx` | 2, 3 | Icon, badge, animation |
| `src/components/PriceCard.tsx` | 2, 3 | Border redesign, animation |
| `src/components/SyncStatusBanner.tsx` | 1, 2 | Theme colors, animated counter |
| `src/components/DrugDetail/*.tsx` | 1, 2 | Theme migration, error boundaries |
| `src/i18n/locales/*.ts` | 3 | Empty state strings, coach mark hints, welcome screen copy |

## New Dependencies

| Package | Epic | Purpose |
|---|---|---|
| `expo-haptics` | 2 | Haptic feedback |
| `@react-native-community/netinfo` | 2 | Connectivity detection |

`react-native-reanimated` is already installed but unused — Epic 2 activates it.
