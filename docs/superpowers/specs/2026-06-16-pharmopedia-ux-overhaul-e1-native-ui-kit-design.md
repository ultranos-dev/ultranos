# Pharmopedia UX Overhaul — E1: Native UI Kit Foundation (Design Spec)

**Date:** 2026-06-16
**App:** `apps/pharmopedia/`
**Branch:** `ux-v1.5`
**Status:** Approved for planning
**This spec covers:** Epic E1 only (the shared native component foundation). E2–E6 are scoped at a high level here and each get their own spec → plan → implementation cycle.

---

## 1. Background & Motivation

A design-maturity review of Pharmopedia found that the app has a solid design-token foundation (`packages/ui-kit/src/tokens.native.ts`) that the screens barely use, and **no app-shell / information-architecture layer**:

- `headerShown: false` in `app/(tabs)/_layout.tsx` and no screen renders its own title — every tab opens with no header/title.
- No shared screen scaffold; each screen reinvents its structure inconsistently (Profile uses `Spacing[5]` padding; Search/Saved/Browse are edge-to-edge; Saved's empty state and Browse's loading state render bare `View`s with no `SafeAreaView`, sliding under the notch).
- The Profile screen is a stack of plain cards with 12px uppercase micro-labels, no identity header, no settings-list idiom, and missing entire sections (About/version, Help, Account, legal).
- The full type scale (`FontSize` up to `3xl`/36, Public Sans display face) and color ramp are unused; screens are flat green-and-gray.

The agreed remedy is a **full UX overhaul**, modeled on a **health-consumer "Clinical Calm"** aesthetic (Apple Health-like: neutral, restrained, bold black titles, subtle cards), delivered as six sequenced epics. E1 builds the reusable foundation everything else sits on.

## 2. Locked Decisions (apply to the whole program)

| Decision | Choice |
|---|---|
| Visual direction | **Clinical Calm** — neutral surfaces, bold Public Sans titles, subtle bordered cards, restrained use of Wise Green |
| Navigation | **Home dashboard** as the landing screen; tabs become Home · Search · Browse · Saved; Profile reached via an avatar in the Home header |
| Profile identity | **Full profile** — display name, optional photo, contact, facility name (requires a new Hub user-profile endpoint, built in E4) |
| Component home | **Shared native package** — components live in `packages/ui-kit` from the start, consumed via `@ultranos/ui-kit/native` |
| P0 functional bugs | **Folded into** the overhaul (addressed in E5) |
| Icons | **lucide-react-native lined icons** only, via `@ultranos/ui-kit/icons`; `DirectionalIcon` for navigation icons in RTL, never for medical icons |
| Sequencing | **Foundation-first** (E1 → E2 → … → E6); each step shippable and reviewable |

## 3. Program Overview (E1–E6)

| # | Epic | Delivers | Depends on |
|---|---|---|---|
| **E1** | **Native UI Kit foundation** | `@ultranos/ui-kit/native`: `Screen`, `ScreenHeader`, `Card`/`CardSection`, `ListRow`, `Button`, `Avatar`, `Chip`, `Banner`, `EmptyState` — Clinical Calm, theme/RTL/a11y-complete | — |
| **E2** | **App shell & IA** | Adopt `Screen`/`ScreenHeader` across tabs; restructure nav; fix SafeArea/Android-back/coach-mark bugs | E1 |
| **E3** | **Home dashboard** | New Home: greeting, quick search, recall/safety alerts, recent searches (new recents store), saved shortcuts | E1, E2 |
| **E4** | **Profile + Hub profile endpoint** | Hub `users.getProfile` (name, photo, contact, facility name); capture into auth store; rebuilt Profile | E1, E2 |
| **E5** | **Drug detail rework + P0 bugs** | Redesign detail + tabs; fix Share, mount FormularyTab (recalls), interaction text + "unavailable" state, contraindication prominence, drug-detail `lang` arg, currency/staleness | E1 |
| **E6** | **Cross-cutting polish** | Complete prs/ps/ar translations; RTL completion; a11y; motion; DrugCard redesign | E1–E5 |

E2–E6 are **out of scope for this spec** and are listed only to show where E1 fits.

---

## 4. E1 Scope — Native UI Kit Foundation

### 4.1 Package structure & consumption

```
packages/ui-kit/
├── src/
│   ├── tokens.native.ts        # exists — source of all values
│   └── native/                 # NEW
│       ├── Screen.tsx
│       ├── ScreenHeader.tsx
│       ├── Card.tsx            # exports Card + CardSection
│       ├── ListRow.tsx
│       ├── Button.tsx
│       ├── Avatar.tsx
│       ├── Chip.tsx
│       ├── Banner.tsx
│       ├── EmptyState.tsx
│       ├── useThemeColors.ts   # promoted from app (see 4.4)
│       └── index.ts            # barrel
└── package.json                # add "./native" export
```

**Package export** (add to `packages/ui-kit/package.json`):
```json
"./native": "./src/native/index.ts"
```
Consistent with the existing `"./tokens.native": "./src/tokens.native.ts"` export. Components are shipped as **source `.tsx`** (Metro/Babel compiles them in-app, same as `tokens.native.ts`), so **no ui-kit build step is required** for the native subtree — unlike the web ShadCN components which resolve through `dist/`.

**App import rule:**
```typescript
import { Screen, ScreenHeader, ListRow, Card, Button } from '@ultranos/ui-kit/native'
```

### 4.2 Dependency note — `useThemeColors`

`useThemeColors` currently lives in `apps/pharmopedia/src/hooks/useThemeColors.ts` and reads the app's `theme-store`. Because every primitive must be theme-aware, the color resolver moves into the native package. To avoid coupling the shared package to the app's Zustand store, the contract is:

- `packages/ui-kit/src/native/useThemeColors.ts` exposes `useThemeColors(mode: 'light' | 'dark')` (pure: maps mode → `Colors`/`ColorsDark`).
- A `ThemeProvider`/context in the native package supplies the resolved `mode` so components can call a zero-arg `useThemeColors()` internally.
- The app wraps its tree in `<ThemeProvider mode={resolvedMode}>` (resolvedMode derived from the app's `theme-store` + system appearance) in `app/_layout.tsx`.
- The app's existing `useThemeColors` hook is kept as a thin re-export for backwards-compatibility during migration, then removed in E2.

This keeps store ownership in the app while the package stays store-agnostic.

### 4.3 Component APIs

All measurements come from `tokens.native.ts`. Props below list only the meaningful ones; each also spreads through standard RN view/text/pressable props where natural.

**`Screen`**
```typescript
interface ScreenProps {
  children: React.ReactNode
  scroll?: boolean          // wrap content in a ScrollView (default false)
  edges?: Edge[]            // SafeArea edges (default ['top'])
  padded?: boolean          // apply horizontal content padding Spacing[4] (default true)
}
```
- `SafeAreaView` + `backgroundColor: colors.surfaceSubtle`, `flex: 1`.
- Replaces every ad-hoc `SafeAreaView`/bare `View` wrapper; fixes the Saved-empty and Browse-loading SafeArea bugs by construction.

**`ScreenHeader`**
```typescript
interface ScreenHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode  // trailing slot: Avatar, icon button, etc.
}
```
- Title: `FontFamily.headingBold` (Public Sans), `FontSize['2xl']` (30), `colors.textPrimary`.
- Subtitle: `FontSize.xs`, `colors.textMuted`.
- Row layout: title block + `action` pinned to the trailing (logical) edge.
- Padding: top `Spacing[4]`, horizontal `Spacing[4]`, bottom `Spacing[2]`.
- RTL: title/subtitle align to logical start; `action` to logical end.

**`Card` / `CardSection`**
```typescript
interface CardProps { children: React.ReactNode; padded?: boolean }      // bordered rounded surface
interface CardSectionProps { label?: string; children: React.ReactNode } // labeled group of rows
```
- `Card`: `backgroundColor: colors.surface`, `borderColor: colors.borderSubtle`, `borderRadius: Radius.lg`, `Shadow.sm`.
- `CardSection`: optional uppercase `label` (`FontSize.xs`, `FontFamily.sansBold`, `colors.textMuted`, letter-spacing 0.5) above a `Card`; children are `ListRow`s separated by hairline dividers (`StyleSheet.hairlineWidth`, `colors.borderSubtle`) inserted automatically between rows.

**`ListRow`**
```typescript
interface ListRowProps {
  icon?: LucideIcon            // lined icon component from @ultranos/ui-kit/icons
  label: string
  value?: string               // trailing muted value
  trailing?: React.ReactNode   // overrides chevron (e.g., Chip, switch)
  onPress?: () => void         // when set, shows chevron + press feedback
  destructive?: boolean
  accessibilityHint?: string
}
```
- Leading: icon in a `Radius.md` tinted square (`colors.primary500` @ ~12% / `primaryLight`), icon stroke `colors.primary600`.
- Label: `FontSize.base` (16), `FontFamily.sansMedium`, `colors.textPrimary`.
- Trailing: `value` (muted) then a `ChevronRight` (via `DirectionalIcon category="navigation"`) when `onPress` is set, unless `trailing` overrides.
- Min height **48px**; `hitSlop` ensures ≥44px target.
- a11y: `accessibilityRole="button"` when pressable; label composed from `label` + `value`; `accessibilityState={{ disabled }}`.

**`Button`**
```typescript
interface ButtonProps {
  label: string
  variant?: 'primary' | 'secondary' | 'destructive'   // default 'primary'
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  onPress: () => void
}
```
- Height 48, `Radius.lg`, `FontFamily.sansBold`, `FontSize.base`.
- `primary`: `colors.primary500` bg / white text. `secondary`: surface bg / `primary500` text + 1.5px border. `destructive`: `colors.dangerLight` bg / `colors.dangerDark` text.
- `loading` → `ActivityIndicator` replaces label; `disabled`/`loading` → opacity 0.6 and press blocked.
- a11y: `accessibilityRole="button"`, `accessibilityState={{ disabled, busy: loading }}`.

**`Avatar`**
```typescript
interface AvatarProps { name?: string; photoUri?: string; size?: number }  // default size 46
```
- `photoUri` → `Image`; else circle (`colors.primary500`) with up-to-2-letter initials from `name` (`FontFamily.headingBold`, white). Empty name → person glyph.
- a11y: `accessibilityLabel={name}` when present; decorative otherwise.

**`Chip`**
```typescript
interface ChipProps { label: string; selected?: boolean; onPress?: () => void }
```
- Pill (`Radius.full`); unselected: surface + `colors.border`, `colors.textSecondary`; selected: `colors.primary500` bg, white text, `FontFamily.sansSemibold`.
- a11y: `accessibilityRole="button"`, `accessibilityState={{ selected }}`.

**`Banner`**
```typescript
interface BannerProps {
  variant: 'info' | 'warning' | 'error' | 'success'
  text: string
  icon?: LucideIcon          // defaults per variant
  onPress?: () => void       // tappable banners (e.g., recall → detail)
}
```
- Color pairs from tokens: info `info`/`infoLight`, warning `warning`/`warningLight`, error `danger`/`dangerLight`, success `success`/`successLight`.
- `Radius.lg`, leading icon, `FontSize.sm`, `FontFamily.sansMedium`.
- a11y: `accessibilityRole="alert"` for `warning`/`error`; `"button"` added when `onPress` set.
- Used by E2/E3 for net/sync/recall surfaces (replaces today's `SyncStatusBanner`/`NetStatusBanner` styling, which become thin wrappers over `Banner`).

**`EmptyState`**
```typescript
interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: { label: string; onPress: () => void }   // renders a secondary Button
}
```
- Centered column; icon at ~30–48px in `colors.textMuted`; title `FontSize.md`/`sansSemibold`; description `FontSize.sm`/muted; optional **action button** (the missing CTA today).

### 4.4 Cross-cutting contract (every component)

1. **Tokens only** — no hardcoded hex, font names, or raw px. Everything from `tokens.native.ts`.
2. **Theme-aware** — colors via the package `useThemeColors()`; verified in light + dark.
3. **RTL-aware** — logical alignment (`textAlign` start/end derived from `isRtlLang`); Arabic font (`FontFamily.arabic`) for text in RTL locales; navigation icons wrapped in `DirectionalIcon category="navigation"`; medical icons never mirrored. (`isRtlLang` is imported from the app's `lang-store` via a small injected helper or a prop, to keep the package store-agnostic — final mechanism decided in the plan; default approach: a `rtl?: boolean` prop with the app passing `isRtlLang(lang)`.)
4. **Accessible** — every interactive element has `accessibilityRole`, a composed `accessibilityLabel`, and `accessibilityState` where stateful; touch targets ≥44px; respects `allowFontScaling` (no fixed heights that clip scaled text — use min-heights + padding).
5. **Icons** — `lucide-react-native` via `@ultranos/ui-kit/icons`, sized through tokens.

### 4.5 Tokens

No new color tokens required. Confirm header sizing uses `FontSize['2xl']`. If the plan finds a need for a larger display size, add a single `FontSize.display` (e.g., 34) to `tokens.native.ts` rather than hardcoding.

---

## 5. Testing (E1)

Runner: Vitest + `@testing-library/react-native` (existing setup). Each component gets a test file under `packages/ui-kit/` test path (or `apps/pharmopedia/__tests__` if the package has no runner yet — decided in the plan; prefer co-locating with ui-kit).

Per component, assert:
- **Renders** with required props; optional props change output (e.g., `Button loading` shows the spinner not the label; `ListRow onPress` renders a chevron).
- **Theme** — a dark-mode render differs from light (snapshot or resolved color assertion).
- **RTL** — RTL render applies logical alignment / Arabic font (snapshot).
- **a11y** — interactive components expose the expected `accessibilityRole` and `accessibilityState` (e.g., `Chip selected` → `selected: true`; `Button disabled` → `disabled: true`).
- **EmptyState action** invokes `onPress`; **ListRow** invokes `onPress`.

Minimum: one test file per primitive (9 files). No screen/integration tests in E1 (those land with E2+).

---

## 6. Deliverables & File List (E1)

**New:**
- `packages/ui-kit/src/native/{Screen,ScreenHeader,Card,ListRow,Button,Avatar,Chip,Banner,EmptyState}.tsx`
- `packages/ui-kit/src/native/useThemeColors.ts` (+ `ThemeProvider`)
- `packages/ui-kit/src/native/index.ts`
- Test files for each primitive.

**Modified:**
- `packages/ui-kit/package.json` — add `"./native"` export.
- `apps/pharmopedia/src/hooks/useThemeColors.ts` — becomes a re-export of the package hook (removed in E2).
- `apps/pharmopedia/app/_layout.tsx` — wrap tree in `<ThemeProvider mode={resolvedMode}>`.

**Not modified in E1:** existing screens/components keep working unchanged; migration onto the primitives happens in E2+.

---

## 7. Success Criteria (E1)

- `@ultranos/ui-kit/native` exports all 9 primitives; the app imports at least one in a throwaway/demo usage and renders it without a ui-kit build step.
- Every primitive renders correctly in light + dark + RTL and passes its test file.
- No hardcoded colors/fonts/px in any primitive (all from tokens).
- Existing app behavior and tests are unbroken (E1 is additive).

## 8. Out of Scope (E1)

- Any screen redesign, navigation change, Home screen, Profile rebuild, Hub endpoint, drug-detail changes, P0 bug fixes, translations — all are E2–E6.
- Web ShadCN components (`packages/ui-kit/src/components/ui/`) are untouched.

## 9. Risks / Open Questions

- **Store-agnostic RTL/theme** — exact mechanism (context vs props) to feed `mode` and `rtl` into package components is finalized in the plan; default is `ThemeProvider` for mode + `rtl` prop for direction.
- **Test runner location** — whether `packages/ui-kit` runs Vitest itself or tests live in the app; resolved in the plan.
- **Font scaling** — large OS font sizes must not clip; enforce min-height + padding, verify in tests where feasible.
```
