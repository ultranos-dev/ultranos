# Ultranos Mobile Design System — Pharmopedia

> **Scope:** The mobile (React Native / Expo) design system as implemented in the **Pharmopedia** app and the shared `@ultranos/ui-kit` native layer. This is the single reference for tokens, components, modals, layout, motion, haptics, RTL, and the healthcare-specific UI rules.
>
> **Source of truth:** Design tokens live in [`packages/ui-kit/src/tokens.native.ts`](../packages/ui-kit/src/tokens.native.ts); shared components in [`packages/ui-kit/src/native/`](../packages/ui-kit/src/native/); app/domain components in [`apps/pharmopedia/src/components/`](../apps/pharmopedia/src/components/). When this guide and the code disagree, the code wins — update this doc.
>
> **Platform note:** The web token system (`tokens.css`, Tailwind, ShadCN) does **not** apply to React Native. Native apps use the JS token file and the `@ultranos/ui-kit/native` component set described here.

---

## Table of contents

1. [Principles](#1-principles)
2. [Foundations — Color](#2-foundations--color)
3. [Foundations — Typography](#3-foundations--typography)
4. [Foundations — Spacing, Radius, Elevation](#4-foundations--spacing-radius-elevation)
5. [Theming (light / dark)](#5-theming-light--dark)
6. [RTL & Internationalization](#6-rtl--internationalization)
7. [Iconography](#7-iconography)
8. [Motion & Animation](#8-motion--animation)
9. [Haptics](#9-haptics)
10. [Layout & Navigation](#10-layout--navigation)
11. [Core components](#11-core-components)
12. [Domain components (drug/brand)](#12-domain-components-drugbrand)
13. [Modals & dialogs](#13-modals--dialogs)
14. [Interaction patterns](#14-interaction-patterns)
15. [Healthcare-specific UI rules](#15-healthcare-specific-ui-rules)
16. [Accessibility checklist](#16-accessibility-checklist)
17. [Quick reference](#17-quick-reference)

---

## 1. Principles

Pharmopedia is a **clinical reference app for low-resource, offline-prone environments**. The design language is "Clinical Calm":

- **Legibility first.** Generous type sizes, high contrast, no decorative density. A pharmacist reading on a cheap device in poor light must never squint.
- **Offline-first & instant.** No spinners where a skeleton or cached value works. Tab switches are instant; transitions are short.
- **Calm, not flashy.** Motion is functional (orientation, feedback, continuity), never ornamental. Every autonomous animation respects **Reduce Motion**.
- **Safety is visual.** Allergies and recall/safety alerts get the highest prominence; AI-translated content is always visibly marked as unverified.
- **One component, everywhere.** A drug card looks identical in Search, Saved, Home, and detail screens. Shared chrome lives in `@ultranos/ui-kit`, never duplicated per screen.
- **RTL is first-class.** Arabic, Dari, and Pashto are RTL; every component is built and tested in both directions.

**Token discipline (mandatory):**

```ts
import { Colors, FontFamily, FontSize, Spacing, Radius, Shadow } from '@ultranos/ui-kit/tokens.native'

// ✅ tokens in StyleSheet.create()
card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing[4], ...Shadow.sm }

// ❌ never hardcode hex, raw px, or font-name string literals
card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 }
```

Inside themed components, prefer the **theme-aware** values from `useThemeColors()` over the raw `Colors` object so dark mode works automatically.

---

## 2. Foundations — Color

### 2.1 Primary — "Wise Green" (`hsl(156, 55%, 40%)`)

| Token | Hex | Typical use |
|-------|-----|-------------|
| `primary50` | `#edfaf4` | chip/label tints, icon wells, price chip bg |
| `primary100` | `#d0f3e5` | subtle borders on tinted surfaces |
| `primary200` | `#a3e6cc` | — |
| `primary300` | `#6dd1ae` | — |
| `primary400` | `#3db88e` | — |
| `primary500` | `#2e9e71` | **canonical brand** — buttons, active states, links, filled bookmark |
| `primary600` | `#237d5a` | "Brand" tag icon, icon-well glyphs |
| `primary700` | `#1c6248` | text on `primary50` |
| `primary800` | `#154c37` | — |
| `primary900` | `#0e3326` | — |

Never use generic blue as a primary. (`info`/`#2563eb` is reserved for the "Generic" pill icon and informational banners only.)

### 2.2 Neutral — warm grays (`hsl(210, …)`)

`neutral0 #ffffff` · `50 #f7f9fb` · `100 #eef1f5` · `200 #d8dde6` · `300 #b0b8c7` · `400 #838e9d` · `500 #627080` · `600 #4a5568` · `700 #374052` · `800 #242d3b` · `900 #141c28`

### 2.3 Semantic — clinical

| Role | Base | Light bg | Dark/strong | Notes |
|------|------|----------|-------------|-------|
| **danger** | `#dc2626` | `dangerLight #fef2f2` | `dangerDark #991b1b` | errors, contraindications, destructive |
| **warning** | `#d97706` | `warningLight #fffbeb` | `warningDark #92400e` | recalls, "seek help", caution |
| **success** | `#16a34a` | `successLight #f0fdf4` | `successDark #14532d` | in-stock, sync OK |
| **info** | `#2563eb` | `infoLight #eff6ff` | `infoDark #1d4ed8` | "Generic" label, informational |
| **allergy** | `#b91c1c` | `allergyBg #fef2f2` | `allergyBorder #f87171` | **highest** clinical prominence (§15) |

### 2.4 Theme-aware semantic aliases

These are what components actually consume via `useThemeColors()` — they resolve per light/dark:

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `surface` | `#ffffff` | `#121212` | card / row background |
| `surfaceElevated` | `#ffffff` | `#1e1e1e` | modals, compact bar, tab bar, dialog card |
| `surfaceSubtle` | `#f5f5f5` | `#2a2a2a` | screen background, pressed states, skeleton bars |
| `textPrimary` | `#141c28` | `#f0f0f0` | titles, names |
| `textSecondary` | `#4a5568` | `#a0a0a0` | body, subtitles |
| `textMuted` | `#838e9d` | `#666666` | meta, captions, placeholder, inactive icons |
| `border` | `#d8dde6` | `#333333` | inputs, chips |
| `borderSubtle` | `#eef1f5` | `#262626` | card borders, dividers, hairlines |
| `overlay` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.7)` | modal scrim |

**Color usage rules**

- Card/list backgrounds → `surface`; screen background → `surfaceSubtle`; floating chrome (modal, tab bar, sticky bar) → `surfaceElevated`.
- Borders are **hairline** `borderSubtle` for cards/dividers, `border` (1px) for inputs/chips.
- Text hierarchy is exactly three steps: `textPrimary` → `textSecondary` → `textMuted`. Don't invent intermediate grays.
- Status color always comes in a pair (base text/icon + `…Light` background). Never put `danger` text on a white card without its tint when it's a status chip.

---

## 3. Foundations — Typography

### 3.1 Families

| Token | Font | Weight | Where loaded |
|-------|------|--------|--------------|
| `FontFamily.sans` | Manrope | 400 | body, meta, inputs |
| `FontFamily.sansMedium` | Manrope-Medium | 500 | list labels, tab labels |
| `FontFamily.sansSemibold` | Manrope-SemiBold | 600 | card names, section titles, buttons (secondary text) |
| `FontFamily.sansBold` | Manrope-Bold | 700 | uppercase section labels, kind labels, compact-bar title |
| `FontFamily.heading` | PublicSans | 400 | — |
| `FontFamily.headingBold` | PublicSans-Bold | 700 | screen titles, dialog titles, avatar initials, drug name on detail |
| `FontFamily.arabic` | NotoKufiArabic | — | **all** text when locale is RTL (ar/prs/ps) |

Fonts are registered in the app root `app/_layout.tsx` via `useFonts()`; the registered names must match these constants exactly. In RTL, `FontFamily.arabic` replaces both sans and heading.

```ts
// RTL override applied last in every style array so it wins over Manrope/Public Sans:
const align = rtl ? { textAlign: 'right', fontFamily: FontFamily.arabic } : { textAlign: 'left' }
<Text style={[styles.title, align]}>…</Text>
```

### 3.2 Type scale (`FontSize`)

| Token | px | Role |
|-------|---:|------|
| `xs` | 12 | meta, captions, chips, uppercase labels, tab labels |
| `sm` | 14 | secondary body, list values, button-secondary |
| `base` | 16 | primary body, card names, inputs, section titles |
| `md` | 18 | empty-state title |
| `lg` | 20 | dialog title, brand-detail price |
| `xl` | 24 | drug/brand detail name |
| `2xl` | 30 | screen large title |
| `3xl` | 36 | reserved (hero) |

`FontWeight` (`normal 400 / medium 500 / semibold 600 / bold 700`) exists for the rare case you need a weight without switching family, but **prefer the named `FontFamily.*` faces** — RN renders a real weight only when the matching font file is loaded.

`LineHeight`: `tight 20 / normal 24 / relaxed 28`. Most components set line height implicitly; use these for multi-line prose blocks.

### 3.3 Canonical text styles

| Pattern | Style |
|---------|-------|
| Screen large title | `headingBold`, `2xl`, `textPrimary` |
| Sticky compact-bar title | `sansBold`, `base` |
| Section label (eyebrow) | `sansBold`, `xs`, `letterSpacing 0.5`, `textTransform uppercase`, `textMuted`, `marginTop Spacing[2]` |
| Card name | `sansSemibold`, `base`, `textPrimary` |
| Body / secondary | `sans`, `sm`, `textSecondary` |
| Meta line | `sans`, `xs`, `textMuted`, `writingDirection ltr` for codes |
| Kind label (GENERIC/BRAND) | `sansBold`, `xs`, `letterSpacing 0.5`, uppercase, `info`/`primary600` |

---

## 4. Foundations — Spacing, Radius, Elevation

### 4.1 Spacing (`Spacing[n]`, base-4)

`1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 8=32 · 10=40 · 12=48 · 16=64`

**Rhythm rules**

- **Screen gutter:** `Spacing[4]` (16) horizontal padding on the content body.
- **Inter-card / inter-section gap:** `Spacing[2]` (8) within a section; `Spacing[4]` (16) between major sections (`CollapsibleScreen` body uses `gap: Spacing[4]`).
- **Card body padding:** `paddingHorizontal: Spacing[4]`, `paddingVertical: Spacing[3]`, inner `gap: 2`.
- **Touch rows:** `minHeight: 48`, `paddingHorizontal: Spacing[4]`, `paddingVertical: Spacing[3]`.
- Prefer `gap` on the container over per-child margins. The one allowed per-child margin is the eyebrow label's `marginTop: Spacing[2]`.

### 4.2 Radius (`Radius`)

`sm 4 · md 8 · lg 12 · xl 16 · full 9999`

- `md` — inputs, icon wells, small chips (price/rx).
- `lg` — buttons, banners, default `Card`.
- `xl` — modal/dialog card.
- `full` — pill chips, avatars (via `size/2`), bookmark/brand chips.
- **`0` (square)** — list cards & collapsible sections (`Card square`) for the edge-to-edge "grouped" rhythm.

### 4.3 Elevation (`Shadow`)

| Token | iOS | Android elevation | Use |
|-------|-----|------------------:|-----|
| `Shadow.sm` | `offset 0,1 · opacity .05 · radius 2` | 1 | cards, tab bar, price card |
| `Shadow.md` | `offset 0,4 · opacity .07 · radius 6` | 3 | raised menus |
| `Shadow.lg` | `offset 0,10 · opacity .1 · radius 15` | 5 | (reserved) |

Cards combine `Shadow.sm` + a hairline `borderSubtle` border so they read on both light and dark surfaces. Always pair `overflow: 'hidden'` with a card radius so children clip to the corner.

---

## 5. Theming (light / dark)

`UiKitProvider` supplies the theme + direction via context; components read it with `useThemeColors()` and `useRtl()`.

```tsx
import { UiKitProvider, useThemeColors, useRtl } from '@ultranos/ui-kit/native'

<UiKitProvider mode={resolvedTheme /* 'light' | 'dark' */} rtl={isRtlLang(lang)}>
  <App />
</UiKitProvider>

function Card() {
  const colors = useThemeColors()   // → Colors or ColorsDark
  const rtl = useRtl()
  …
}
```

- **Theme source:** `useThemeStore` (`light | dark | system`), persisted in SecureStore; `system` resolves via `Appearance` and updates live.
- **Selecting mode** is a Profile preference (radio group). Status bar style flips with the resolved theme.
- Dark mode keeps the **same primary scale** (it has sufficient contrast on dark surfaces) and inverts neutrals + dims the semantic `…Light` backgrounds.

> In the app, screens import `@/hooks/useThemeColors` (a thin wrapper over the ui-kit hook bound to the app's theme store). ui-kit's own components use the context hook directly.

---

## 6. RTL & Internationalization

The app does **not** rely on native `I18nManager.forceRTL`. RTL is handled **explicitly** in every component via `useRtl()` / `isRtlLang(lang)`.

**Languages:** `en` (LTR) · `ar`, `prs` (Dari), `ps` (Pashto) — all RTL.

**Rules**

1. **Direction:** reverse flex rows with `flexDirection: rtl ? 'row-reverse' : 'row'` (or a `rowRtl` style). Never assume left = start.
2. **Text alignment + font:** apply `{ textAlign: 'right', fontFamily: FontFamily.arabic }` as the **last** style entry so it overrides the Latin face.
3. **Logical spacing:** use `marginStart`/`marginInlineStart` (not `marginLeft`) for leading/trailing offsets.
4. **Codes stay LTR:** ATC codes, prices, and dose strings set `writingDirection: 'ltr'` even inside RTL text, with `textAlign` following the locale.
5. **Icon mirroring:**
   - **Navigational** (chevrons, back arrows) mirror — either swap the glyph (`ChevronRight`↔`ChevronLeft`) or `transform: [{ scaleX: -1 }]`.
   - **Medical/semantic** icons (pill, tag, flask, X-circle, heart) **never** mirror.
6. **Switching to/from an RTL language** triggers a themed confirm dialog warning a reload is needed (layout direction changes).

**i18n keys** live in `apps/pharmopedia/src/i18n/locales/{en,ar,prs,ps}.ts`. A `locale-parity` test enforces **exact key parity** and **no untranslated English stubs** — every new string must be added and translated in all four locales.

---

## 7. Iconography

- **Library:** `lucide-react-native`, imported directly in native components (e.g. `import { Heart, Pill } from 'lucide-react-native'`). The web `@ultranos/ui-kit/icons` subpath does not apply to RN.
- **Default sizes:** inline label icon `12`; row/control icon `16`–`18`; nav/back `20`–`26`; empty-state `44`; avatar fallback `User` at `size*0.5`.
- **Color:** icons take a semantic color prop — `textMuted` (inactive/meta), `primary500/600` (brand/active), status colors for banners, `info` for the Generic pill.
- **Canonical glyphs:**

| Glyph | Meaning |
|-------|---------|
| `Pill` | Generic drug |
| `Tag` | Brand product |
| `Heart` | Bookmark (filled `primary500` when saved, outline `textMuted` when not) |
| `XCircle` | Dismiss / clear (circular line close, gray `textMuted`) |
| `X` | Clear input |
| `AlertTriangle` | Warning / danger / safety |
| `Info` / `CheckCircle` | Info / success banner |
| `ChevronRight/Left/Down` | Navigation & collapsible state |
| `Home / Folder / Heart / User` | Tab bar |
| `MapPin` / `MapPinOff` | Pharmacy distance / no location |
| `FolderOpen / BookmarkPlus / SearchX` | Empty states |

---

## 8. Motion & Animation

### 8.1 Principles

Motion is **functional** and **short**. Two engines:
- **Reanimated** (`react-native-reanimated`) for gesture/spring/shared-value animations (tab icon, bookmark pop, skeleton, price-card entry).
- **`LayoutAnimation`** for collapsible expand/collapse.
- **Navigator transitions** via expo-router screen options.

### 8.2 Reduce Motion (mandatory)

Every autonomous animation is gated by `useReducedMotion()` (tracks the OS setting live). When reduced, render the **static end state** — no entry fade, no spring, no looping shimmer. Scroll-linked, user-driven motion (the collapsing header) is WCAG-exempt and may stay.

```ts
const reduced = useReducedMotion()
progress.value = reduced ? target : withSpring(target, SPRING)
```

### 8.3 Catalogue of motions

| Motion | Where | Spec | Reduced behavior |
|--------|-------|------|------------------|
| **Tab icon glide** | `AnimatedTabIcon` | inactive icon sits `+5px` lower; on focus springs up `{ mass 0.6, damping 16, stiffness 170 }`. Pure vertical, no scale/fill. | static icon |
| **Bookmark pop** | `DrugCard`, drug detail | on **save only**: `withSpring(1.25, { damping 8 })` → `withSpring(1)`. | no pop |
| **Skeleton shimmer** | `SkeletonCard` | opacity `0.4→1`, `withTiming(1200ms, Easing.inOut(ease))`, repeat ∞ reversed. | static bars at `opacity 0.5` |
| **Price-card entry** | `PriceCard` | `FadeInUp.delay(min(index*50, 500)).duration(300)`. | no entry animation |
| **Collapsible expand** | `CollapsibleSection` | `LayoutAnimation.Presets.easeInEaseOut`; chevron **swaps** glyph (down when open) rather than rotating. | instant toggle, no layout animation |
| **Collapsing header** | `CollapsibleScreen`/`List` | large title scrolls away; sticky `CompactBar` cross-fades in via `scrollY.interpolate([h*0.5, h] → [0,1])`, clamped. | unaffected (scroll-linked) |
| **Modal appear** | `ConfirmDialog` | RN `Modal` `animationType="fade"`. | `animationType="none"` |
| **Stack transition** | root `Stack` | `slide_from_right` (LTR) / `slide_from_left` (RTL), `animationDuration: 300`. | `fade` |
| **Tab switch** | `(tabs)` navigator | `animation: 'none'` (instant — a fade would flash shadowed cards). | n/a |
| **Pressables** | global | `opacity: pressed ? 0.85 : 1` on cards; `backgroundColor: surfaceSubtle` on rows. | n/a (instant) |

**Timing vocabulary:** micro-feedback springs are low-bounce (`damping 8–16`); transitions are `300ms`; shimmer is `1200ms`. Avoid durations > 300ms for navigational motion.

---

## 9. Haptics

Wrapped in [`apps/pharmopedia/src/lib/haptics.ts`](../apps/pharmopedia/src/lib/haptics.ts) (all silently no-op on unsupported devices):

| Helper | Feedback | Used for |
|--------|----------|----------|
| `hapticSelection()` | selection tick | bookmark toggle, language pick, theme pick, reappear-policy pick |
| `hapticImpact(style = Light)` | impact | drug-detail bookmark (Light) |
| `hapticNotification(type)` | success / error | sync completed (`Success`) / sync failed (`Error`) |

Rule: pair a haptic with a **discrete, user-initiated, consequential** action (save, select, sync result). Never on scroll, render, or passive events.

---

## 10. Layout & Navigation

### 10.1 Screen shell

All four tabs use a **collapsing large-title** shell:

```
SafeAreaView (edges: top, bg surfaceSubtle)
└─ Animated.ScrollView / FlatList
   ├─ LargeTitle  → ScreenHeader (title 2xl headingBold, optional subtitle/action)   ← scrolls away
   └─ body (paddingHorizontal Spacing[4], gap Spacing[4])
   CompactBar (sticky, h52, surfaceElevated, hairline bottom border, fades in)
```

- **`CollapsibleScreen`** — for content (Home, Profile): scroll view + body. Body gutter `px Spacing[4]`, `gap Spacing[4]`.
- **`CollapsibleList<T>`** — for lists (Browse, Saved): `FlatList` with the same header. **No horizontal padding or item gap by default** — list cards render edge-to-edge unless the screen insets them (see §14.1). `subHeader` (e.g. a search bar) gets `px Spacing[4]`, `pb Spacing[2]`.
- **`Screen`** — a simpler non-collapsing shell (`scroll?`, `padded?`, `edges?`) for auxiliary screens.
- **`ScreenHeader`** — the title row primitive (`title`, `subtitle`, `action`); `px Spacing[4]`, `pt Spacing[4]`, `pb Spacing[2]`; RTL row-reverse + right align.

### 10.2 Tab bar

- 4 tabs: **Home / Browse / Saved / Profile** (`Home`, `Folder`, `Heart`, `User`).
- `tabBarStyle`: `surfaceElevated` bg, hairline `borderSubtle` top border, `Shadow.sm`.
- Active tint `primary500`, inactive `textMuted`. Label: `xs`, `sansMedium` (or `arabic` in RTL).
- Icons use `AnimatedTabIcon` (glide on focus). Tab switch animation is **`none`** (instant).

### 10.3 Detail screens

Stacked screens (drug/brand detail) are **not** collapsing — they use a `ScrollView` with a custom header row (back chevron + name block + actions) and an **edge-to-edge, inset, gapped** section list (`gap: Spacing[2]`, `paddingHorizontal: Spacing[4]`). Back chevron mirrors in RTL.

### 10.4 Content rhythm rules

| Rule | Value |
|------|-------|
| Screen body gutter | `paddingHorizontal: Spacing[4]` |
| Section vertical gap | `gap: Spacing[4]` (major) / `Spacing[2]` (within a list) |
| Section eyebrow label | uppercase, `xs`, `sansBold`, `textMuted`, `marginTop: Spacing[2]` |
| Section header w/ action | row, `justifyContent: 'space-between'`, `alignItems: 'center'`; reverse in RTL so the action sits opposite the title |
| Card body | `px Spacing[4]` / `py Spacing[3]`, inner `gap: 2` |

---

## 11. Core components

All in `@ultranos/ui-kit/native`. Each is themed (`useThemeColors`), RTL-aware (`useRtl`), and accepts an optional `testID`.

### 11.1 `Card` / `CardSection`

The surface primitive.

```tsx
import { Card, CardSection } from '@ultranos/ui-kit/native'

<Card>…</Card>                 // rounded (Radius.lg), hairline border, Shadow.sm
<Card square>…</Card>          // square corners — list cards & collapsible sections
<Card padded>…</Card>          // adds padding: Spacing[4]
<CardSection label="Account">  // labeled group: eyebrow + Card with hairline dividers between children
  <ListRow … /><ListRow … />
</CardSection>
```

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `square` | `boolean` | `false` | drops corner radius for edge-to-edge lists |
| `padded` | `boolean` | `false` | `padding: Spacing[4]` |

- Base: `borderRadius: Radius.lg`, `borderWidth: hairline`, `borderColor: borderSubtle`, `overflow: 'hidden'`, `Shadow.sm`, `backgroundColor: surface`.
- `CardSection` inserts a `card-divider` (hairline `borderSubtle`) between each child and shows an uppercase eyebrow label.

### 11.2 `Button`

```tsx
<Button label="Sync Now" onPress={…} />                          // primary
<Button label="Cancel" variant="secondary" onPress={…} />
<Button label="Delete" variant="destructive" onPress={…} />
<Button label="Saving…" loading />                               // spinner, disabled
<Button label="Add" icon={Plus} />
```

| Variant | Background | Foreground | Border |
|---------|-----------|-----------|--------|
| `primary` | `primary500` | `white` | transparent |
| `secondary` | `surface` | `primary500` | `primary500` (1.5px) |
| `destructive` | `dangerLight` | `dangerDark` | transparent |

- Shape: `minHeight 48`, `borderRadius Radius.lg`, `borderWidth 1.5`, `px Spacing[4]`, `py Spacing[2]`.
- Label `sansBold base`; optional leading icon `16`. `loading` → `ActivityIndicator`; `disabled`/`loading` → `opacity 0.6` and `onPress` suppressed.
- A11y: `role button`, `state { disabled, busy }`.

### 11.3 `Chip`

Pill toggle/tag.

```tsx
<Chip label="All" selected onPress={…} />
<Chip label="metformin" onPress={…} />
```

- `Radius.full`, `borderWidth 1`, `px Spacing[3]`, `py Spacing[2]`.
- Selected → `primary500` bg, `white` `sansSemibold` text; else `surface` bg, `border`, `textSecondary` `sans`.

### 11.4 `Banner`

Inline status message.

```tsx
<Banner variant="warning" text="Calcium carbonate — recall" onPress={…}
        onDismiss={…} dismissLabel="Dismiss alert" />
```

| Prop | Notes |
|------|-------|
| `variant` | `info \| warning \| error \| success` (icon + colors auto) |
| `text` | message |
| `icon?` | override the default glyph |
| `onPress?` | makes the whole banner a button |
| `onDismiss?` | renders a trailing circular **`XCircle`** dismiss button |
| `dismissLabel?` | a11y label for the dismiss button (required with `onDismiss`) |

- Layout: row, `gap Spacing[2]`, `Radius.lg`, `px/py Spacing[3]`. Icon `16` left, text fills, optional dismiss `18` trailing (`hitSlop 8`).
- Colors: `{variant}Light` bg + `{variant}` fg. `warning`/`error` get `accessibilityRole="alert"`.

### 11.5 `ListRow`

Settings/detail row.

```tsx
<ListRow icon={Pill} label="Phone" value="+93…" onPress={…} />
<ListRow label="Log out" destructive onPress={…} />
```

- `minHeight 48`, `px Spacing[4]`, `py Spacing[3]`, `gap Spacing[3]`; reverses in RTL.
- Optional leading **icon well** (`32×32`, `Radius.md`, `primary50` bg, `primary600` glyph `18`).
- `label` `sansMedium base` (flex), optional `value` `sans sm textMuted`, optional `trailing` node or auto **chevron** (`18`, mirrored in RTL) when pressable. `destructive` → `danger` label. Pressed → `surfaceSubtle`.

### 11.6 `EmptyState`

```tsx
<EmptyState icon={BookmarkPlus} title="No saved drugs"
            description="Bookmark medicines to find them fast."
            action={{ label: 'Browse', onPress: … }} />
```

- Centered, `padding Spacing[8]`, `gap Spacing[3]`. Icon `44 textMuted`; title `sansSemibold md`; description `sans sm textSecondary`; optional **secondary** `Button`.
- Use for every zero-data / no-results state — never ad-hoc.

### 11.7 `Avatar`

```tsx
<Avatar name="Sara Ahmadi" photoUri={uri} size={60} />
```

- Circle (`borderRadius size/2`); default `size 46` (profile header uses `60`). Photo → `Image`; else **initials** (`headingBold`, `fontSize size*0.38`) on `primary500`; else `User` glyph (`size*0.5`).

### 11.8 `SkeletonCard`

Loading placeholder (see §8.3 for the shimmer). `lines` prop controls body rows; last body line is `60%` wide, others `85%`. Marked `importantForAccessibility="no-hide-descendants"`.

### 11.9 `SearchBar` (app component)

- Input row: `border` 1px, `Radius.md`, `surface` bg; `X` clear button when non-empty.
- **300ms debounce** on input before firing `onSearch`. `role="search"`, RTL text align + Arabic font.

---

## 12. Domain components (drug/brand)

These render the catalog/brand data and **must look identical everywhere** they appear. All use `<Card square>` chrome and the same body rhythm.

### 12.1 `DrugCard`

Generic-drug result.

```tsx
<DrugCard result={drug} lang={lang} onPress={…} query={q} />   // full
<DrugCard result={drug} lang={lang} onPress={…} compact />     // Home "Saved" preview
```

**Anatomy (full):**
1. **Kind label row** — `Pill` (`12`, `info`) + **"GENERIC"** (`sansBold xs`, uppercase, `letterSpacing 0.5`, `info`). Always shown.
2. **Top row** — primary **name** (`sansSemibold base`, fills) + **bookmark heart** (`18`; filled `primary500` when saved, else `textMuted`; pop animation on save).
3. **Secondary name** (the INN when a localized name leads) — `sans sm textSecondary`.
4. **Brand chips** — up to 3 (`MAX_BRAND_CHIPS`), `Radius.full`, `border`, `px Spacing[2]`, `py 2`, `xs sansSemibold`. Query-matched brand → `primary500/white`; others → `primary50/primary100/primary700`; overflow → `+N` chip.
5. **Meta line** — `xs sans textMuted`, `writingDirection ltr`: `ATC · class · forms`.

**Compact variant** (`compact`): no separate kind row — the kind label sits **inline, immediately after the name** (name `flexShrink`, a flex spacer pushes the bookmark to the trailing edge). RTL reverses the top row so the label still follows the name.

**Localization:** when `lang !== 'en'` and a `localName` exists, the local name becomes primary (Arabic font, RTL) and the INN drops to the secondary line.

### 12.2 `BrandResultCard`

Brand-product result. Same chrome; kind label is **`Tag` (`12`, `primary600`) + "BRAND"**.

- **Top row:** brand name (`sansSemibold base`) + optional **price chip** (`sm sansBold`, `primary50` bg, `primary700`, `Radius.md`) + bookmark heart.
- **Subtitle:** `generic INN · dose form` (`sans sm textSecondary`).
- **Manufacturer:** `xs sans textMuted`.
- **`compact`** variant mirrors `DrugCard`: inline "BRAND" label right after the name, spacer, then price + heart at the trailing edge.

### 12.3 `PriceCard`

Pharmacy price listing (drug-detail Pricing tab).

- `Card`-like chrome but **semantic colored border** by stock signal: `success` (in-stock) / `warning` (low) / `danger` (out) — square corners, `Shadow.sm`, `border 1px`, `px Spacing[4]`/`py Spacing[3]`, `marginHorizontal Spacing[4]`, `marginBottom Spacing[2]`.
- Top row: pharmacy name (`sansSemibold base`) + price (`primary500`, `lg`, `sansBold`). Bottom row: `MapPin` + distance (`textMuted`) and stock label (`{signal}Dark`). Entry animation per §8.3.

### 12.4 `SafetyZone`

The **highest-prominence** clinical block on a drug/brand page (see §15).

- `marginHorizontal Spacing[4]`, `gap Spacing[2]`; rendered **first**, **never collapsed**, `accessibilityRole="alert"`.
- Each row is a tinted banner (`AlertTriangle 18`, title `sansBold sm`, detail `xs`): "seek help" (`warning`), blocking interactions + contraindications (`danger`).

### 12.5 `BrandsSection`

The "Brands" list inside drug detail — a stack of `<Card square>` rows (`gap Spacing[2]`, `px Spacing[4]`): brand name + Rx/OTC chip (`primary50/primary700`, `Radius.full`), manufacturer line, and per-presentation lines (`strength · form · pack · price`, LTR).

### 12.6 `CollapsibleSection`

Drug/brand-detail accordion section.

```tsx
<CollapsibleSection title="Dosage & indications" defaultOpen={false}>…</CollapsibleSection>
```

- Built on **`<Card square>`** (hairline border, `Shadow.sm`).
- Header: `minHeight 52`, `px Spacing[4]`, `py Spacing[3]`, title `sansSemibold base`, optional `badge` (`xs textMuted`), trailing **chevron** that **swaps** (`ChevronDown` open, `ChevronRight`/`Left` closed). Pressed → `surfaceSubtle`.
- Body: hairline divider + `surfaceSubtle` panel (`px Spacing[4]`, `pt Spacing[3]`, `pb Spacing[4]`). Expand/collapse uses `LayoutAnimation` (gated by reduced motion).
- **All sections start collapsed.** In detail screens they are laid out inset + gapped (`gap Spacing[2]`, `px Spacing[4]`) so each reads as its own card.

---

## 13. Modals & dialogs

### 13.1 `ConfirmDialog` + `useConfirm` — the one confirmation primitive

There is a single themed confirmation modal. **Never use the native `Alert.alert`.** It replaces all confirm/cancel prompts (logout, language restart, dismiss safety alert, clear recent searches).

**Imperative usage (preferred):**

```tsx
import { useConfirm } from '@ultranos/ui-kit/native'

const { confirm, confirmDialog } = useConfirm()

async function onLogout() {
  const ok = await confirm({
    title: t('profile.logoutConfirmTitle'),
    message: t('profile.logoutConfirmMessage'),
    confirmLabel: t('profile.logoutConfirm'),
    cancelLabel: t('common.cancel'),
    destructive: true,
    testID: 'logout-dialog',
  })
  if (ok) doLogout()
}

return <Screen>…{confirmDialog}</Screen>   // render the element once
```

`confirm(options)` returns a `Promise<boolean>` — `true` on confirm, `false` on cancel / backdrop tap / hardware back.

**Declarative usage** (`ConfirmDialog`) is available for fully custom flows: `visible, title, message?, confirmLabel, cancelLabel, destructive?, onConfirm, onCancel, testID`.

**Anatomy & spec**

- RN `Modal`, `transparent`, `animationType` fade (none under reduce-motion), dismiss on **backdrop tap** and **hardware back**.
- **Scrim:** full-screen `colors.overlay`. The backdrop is a sibling of the card (not a parent) so action presses never bubble to dismiss.
- **Card:** `surfaceElevated` bg, `border`, `Radius.xl`, `padding Spacing[5]`, `gap Spacing[3]`, `maxWidth 420`, centered.
- **Title:** `headingBold lg textPrimary`. **Message:** `sans base textSecondary`, `lineHeight base*1.4`.
- **Actions:** a row (`gap Spacing[2]`, reversed in RTL), two `Button`s each `flex 1` — **Cancel** (`secondary`) + **Confirm** (`primary`, or `destructive` when `destructive`).
- A11y: card has `accessibilityViewIsModal` + `role="alert"`; backdrop is a labeled button.
- **testIDs:** `{testID}`, `{testID}-confirm`, `{testID}-cancel`, `{testID}-backdrop`.

### 13.2 When to use a confirm dialog

Use it for **destructive or hard-to-reverse** actions and **direction-changing** ones: sign out, clear history, dismiss a safety alert, switch to/from an RTL language. Don't gate trivially reversible toggles (theme, bookmark) behind a dialog.

---

## 14. Interaction patterns

### 14.1 Card-list rhythm

Two valid rhythms, applied consistently:

- **Inset + gapped** (search results, Saved tab, Home preview, detail section lists): wrap each card with `paddingHorizontal: Spacing[4]` and a `Spacing[2]` vertical gap. This is the default "distinct cards" look.
- **Edge-to-edge flush** (Browse class drill-down): cards touch the screen edges with no gap — used only where a dense, table-like list is wanted.

Cards are always `<Card square>` in lists; the gap/inset comes from the **container**, not the card.

### 14.2 Confirmation flow

Trigger → `confirm({…})` → themed `ConfirmDialog` → on confirm run the action (often `void`-ed because handlers are async), on cancel do nothing. Pair the trigger with the right `Button`/icon variant (destructive actions use `destructive` styling).

### 14.3 Dismissable safety alerts + reappear policy

- Home recall banners render with `onDismiss` (the circular `XCircle`).
- Dismiss is **confirmed** via `ConfirmDialog` (destructive), then recorded per-drug (`atcCode → timestamp`) in `useDismissedAlertsStore` (SecureStore).
- A **Profile → Safety alerts** radio group sets when dismissed alerts reappear: **15 / 30 / 60 / 90 days** or **Never**. Default **30 days**. The pure helper `isAlertHidden(dismissedAt, policyDays, now)` decides visibility; expired dismissals reappear.
- `getActiveRecalls` returns **one most-recent active alert per drug** (de-duped).

### 14.4 Bookmarking

Heart toggle on every drug/brand card and on detail headers. `hapticSelection()` + a save-only pop animation. Generic and brand bookmarks live in separate local tables and **merge, newest-first**, in the Saved tab (and the compact Home preview).

### 14.5 Search

Single search box; `All · Generics · Brands` filter **chips** narrow already-fetched results (not a mode switch). Generic hits → `DrugCard`, brand hits → `BrandResultCard`. 300ms input debounce. Empty/no-result → `EmptyState` (`SearchX`).

### 14.6 Loading / empty / error

- **Loading:** `SkeletonCard` (never a bare spinner for content); 2–4 placeholders matching the list shape.
- **Empty/no-results:** `EmptyState` with an icon, title, optional description + CTA.
- **Error:** inline message in the relevant status color with a retry affordance; **interaction-check failures must show an explicit warning, never "none found"** (§15).

### 14.7 Section header with trailing action

Title on the leading edge, action (link, `XCircle` clear, "See all") on the **opposite** edge via `justifyContent: 'space-between'` + RTL row-reverse. Example: the **RECENT** section's gray `XCircle` clears recent searches (behind a confirm dialog).

---

## 15. Healthcare-specific UI rules

These override aesthetics — they are safety requirements (see `CLAUDE.md`).

1. **Allergies = highest prominence.** Render **first, in red, never collapsed, never behind a tab.** Use the `allergy*` tokens / `SafetyZone`.
2. **Safety alerts (recalls)** are dismissable but **return** by default (30-day reappear); "Never" is an explicit opt-in. Dismissal is per-drug and confirmed.
3. **Drug-interaction checks never fail silently.** On error/timeout show "Interaction check unavailable" — never default to "no interactions found."
4. **AI-translated content is always marked unverified.** Machine-translated patient prose shows the always-on `MachineTranslationBanner` (rule #2); the user must see it's not clinician-verified.
5. **No PHI in logs.** (Engineering rule — catalog/brand data is non-PHI reference data; never log patient content.)
6. **Indicative price ≠ retail.** Brand `reference_price` is a trade/indicative price, visually and semantically distinct from per-pharmacy `PriceCard` retail prices.

---

## 16. Accessibility checklist

- **Touch targets ≥ 44–48px.** Rows/buttons use `minHeight 48`; small icon buttons add `hitSlop 8–10`.
- **Roles & state:** `button`, `radio`/`radiogroup`, `header`, `search`, `image`, `alert`; pass `accessibilityState { selected, disabled, busy, expanded }`.
- **Labels:** every icon-only control has an `accessibilityLabel` (translated); destructive/ambiguous actions add `accessibilityHint`.
- **Color is never the only signal:** stock status pairs color with a text label; selected chips change weight, not just color.
- **Reduce Motion** honored everywhere (§8.2). **Dynamic type:** the collapsing header measures real height so OS font scaling doesn't break the cross-fade.
- **RTL parity:** every patient-facing component is verified in LTR **and** RTL (snapshot tests).
- **Contrast:** the three-step text hierarchy + semantic pairs are chosen for contrast on both `surface` and `surfaceSubtle` in light and dark.

---

## 17. Quick reference

### 17.1 Import map

```ts
// Tokens
import { Colors, ColorsDark, FontFamily, FontSize, FontWeight, LineHeight,
         Spacing, Radius, Shadow, fontFamily } from '@ultranos/ui-kit/tokens.native'

// Theme + hooks
import { UiKitProvider, useThemeColors, useRtl, useReducedMotion } from '@ultranos/ui-kit/native'

// Components
import { Screen, ScreenHeader, CollapsibleScreen, CollapsibleList, CollapsibleSection,
         Card, CardSection, Button, Chip, Banner, ListRow, EmptyState, Avatar,
         ConfirmDialog, useConfirm } from '@ultranos/ui-kit/native'

// Icons (RN)
import { Pill, Tag, Heart, XCircle, AlertTriangle, ChevronRight } from 'lucide-react-native'
```

### 17.2 Token cheat-sheet

| Need | Token |
|------|-------|
| Brand color | `primary500` `#2e9e71` |
| Screen bg | `surfaceSubtle` |
| Card bg | `surface` · elevated chrome → `surfaceElevated` |
| Card border / divider | `borderSubtle` (hairline) |
| Input/chip border | `border` (1px) |
| Title / body / meta text | `textPrimary` / `textSecondary` / `textMuted` |
| Card radius | `Radius.lg` (rounded) · `square` (lists) · `Radius.xl` (modal) |
| Card shadow | `Shadow.sm` |
| Gutter / card padding | `Spacing[4]` / `px4 py3` |
| List gap | `Spacing[2]` |
| Touch row height | `48` |
| Title font | `headingBold` · names `sansSemibold` · body `sans` · eyebrow `sansBold xs uppercase` |

### 17.3 Component → use

| Need | Component |
|------|-----------|
| Surface / group | `Card` / `CardSection` |
| Action | `Button` (primary/secondary/destructive) |
| Toggle / tag | `Chip` |
| Inline status | `Banner` (+ `onDismiss`) |
| Settings/detail row | `ListRow` |
| Zero data | `EmptyState` |
| User identity | `Avatar` |
| Confirm/cancel | `useConfirm` + `ConfirmDialog` |
| Accordion | `CollapsibleSection` |
| Loading | `SkeletonCard` |
| Generic result | `DrugCard` (+ `compact`) |
| Brand result | `BrandResultCard` (+ `compact`) |
| Pharmacy price | `PriceCard` |
| Allergy/safety | `SafetyZone` |
| Screen shell | `CollapsibleScreen` / `CollapsibleList` / `Screen` |

### 17.4 Don'ts

- ❌ `Alert.alert` — use `useConfirm`.
- ❌ Hardcoded hex / px / font-name strings — use tokens.
- ❌ Per-app copies of shared components — change `@ultranos/ui-kit/src` and rebuild.
- ❌ Ungated autonomous animation — gate with `useReducedMotion`.
- ❌ Assuming left = start — branch on `useRtl()` / `isRtlLang`.
- ❌ Mirroring medical icons (pill, tag, heart, flask).
- ❌ Collapsing or de-emphasizing allergies/safety content.
- ❌ Defaulting a failed interaction check to "no interactions."

---

*Maintained alongside the code. After changing a shared component or token, update the relevant section here and rebuild `@ultranos/ui-kit` (`pnpm --filter @ultranos/ui-kit build`).*
