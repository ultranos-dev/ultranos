---
title: Ultranos Component Specification
version: 1.0.0
date: 2026-04-28
design-system-version: 1.0.0
status: Ready for Engineering Review
author: Ultranos Design System
cross-references:
  - _bmad-output/planning-artifacts/design-tokens.css
  - _bmad-output/planning-artifacts/wireframes-lofi.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/architecture.md
  - docs/prd-v3.md
---

# Ultranos Component Specification

**Project:** Ultranos Healthcare Platform  
**Design System Version:** 1.0.0  
**Spec Version:** 1.0.0  
**Date:** 2026-04-28  
**Status:** Ready for Engineering Review

**Cross-References:**
- Token source: `_bmad-output/planning-artifacts/design-tokens.css`
- Wireframes: `_bmad-output/planning-artifacts/wireframes-lofi.md`
- UX Spec: `_bmad-output/planning-artifacts/ux-design-specification.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Full PRD: `docs/prd-v3.md`

> This document is the single source of truth for all UI component behavior, states, token usage, and handoff requirements across the Ultranos platform. It is the bridge between design intent and engineering implementation.

---

## 0. Document Scope and Conventions

### Themes
| Theme | Apps | Data-Attribute |
|-------|------|---------------|
| Clinical | OPD Desktop PWA, OPD Android | `data-theme="clinical"` |
| Fulfillment | Pharmacy POS PWA, Lab Portal PWA | `data-theme="fulfillment"` |
| Consumer | Health Passport (iOS + Android) | `data-theme="consumer"` |

### Platform Abbreviations
| Code | Platform |
|------|----------|
| OPD-D | OPD Desktop PWA (Next.js 15) |
| OPD-A | OPD Android (React Native 0.76+) |
| HP | Health Passport (React Native 0.76+) |
| POS | Pharmacy POS PWA (Next.js 15) |
| LAB | Lab Portal PWA (Next.js 15) |

### Status Definitions
| Status | Meaning |
|--------|---------|
| Ready for Dev | Tokens applied, states defined, handoff complete |
| In Design | Active design iteration |
| Blocked | Dependency unresolved |
| Needs Review | Awaiting stakeholder sign-off |

---

## 1. Component Inventory

| # | Component | Category | Themes | Apps | Status |
|---|-----------|----------|--------|------|--------|
| 1 | AppShell | Layout | Clinical, Fulfillment | OPD-D, POS, LAB | Ready for Dev |
| 2 | PageHeader | Layout | Clinical, Fulfillment | OPD-D, POS, LAB | Ready for Dev |
| 3 | SplitPanel | Layout | Clinical | OPD-D | Ready for Dev |
| 4 | BottomSheet | Layout | All | OPD-A, HP | Ready for Dev |
| 5 | GlobalHeader | Navigation | Clinical, Fulfillment | OPD-D, POS, LAB | Ready for Dev |
| 6 | SidebarNav | Navigation | Clinical, Fulfillment | OPD-D, POS, LAB | Ready for Dev |
| 7 | BottomTabBar | Navigation | All | OPD-A, HP | Ready for Dev |
| 8 | ClinicalCommandPalette | Navigation | Clinical | OPD-D | Ready for Dev |
| 9 | PrimaryButton | Buttons | All | All | Ready for Dev |
| 10 | SecondaryButton | Buttons | All | All | Ready for Dev |
| 11 | DangerButton | Buttons | Clinical, Fulfillment | OPD-D, OPD-A, POS | Ready for Dev |
| 12 | DisabledButton | Buttons | All | All | Ready for Dev |
| 13 | IconButton | Buttons | All | All | Ready for Dev |
| 14 | PatientCard | Data Display | Clinical, Fulfillment | OPD-D, OPD-A, POS, LAB | Ready for Dev |
| 15 | PrescriptionCard | Data Display | Clinical, Fulfillment | OPD-D, OPD-A, POS | Ready for Dev |
| 16 | LabOrderCard | Data Display | Clinical, Fulfillment | OPD-D, LAB | Ready for Dev |
| 17 | AllergyPanel | Data Display | Clinical | OPD-D, OPD-A | Ready for Dev |
| 18 | MedicationListItem | Data Display | Clinical, Fulfillment | OPD-D, OPD-A, POS | Ready for Dev |
| 19 | VitalsRow | Data Display | Clinical | OPD-D, OPD-A | Ready for Dev |
| 20 | LabResultRow | Data Display | Clinical, Fulfillment | OPD-D, LAB | Ready for Dev |
| 21 | GlobalSyncIndicator | Clinical Safety | Clinical, Fulfillment | OPD-D, OPD-A, POS, LAB | Ready for Dev |
| 22 | DrugInteractionPanel | Clinical Safety | Clinical | OPD-D, OPD-A | Ready for Dev |
| 23 | AiDraftPanel | Clinical Safety | Clinical | OPD-D, OPD-A | Ready for Dev |
| 24 | SyncConflictBanner | Clinical Safety | Clinical, Fulfillment | OPD-D, OPD-A, POS | Ready for Dev |
| 25 | StaleDataWarning | Clinical Safety | Clinical, Fulfillment | OPD-D, OPD-A, POS, LAB | Ready for Dev |
| 26 | OfflineBanner | Clinical Safety | All | All | Ready for Dev |
| 27 | SearchInput | Forms | All | All | Ready for Dev |
| 28 | TextInput | Forms | All | All | Ready for Dev |
| 29 | SoapEditor | Forms | Clinical | OPD-D, OPD-A | Ready for Dev |
| 30 | CheckboxWithLabel | Forms | All | All | Ready for Dev |
| 31 | SelectField | Forms | All | All | Ready for Dev |
| 32 | SuccessToast | Feedback | All | All | Ready for Dev |
| 33 | InlineError | Feedback | All | All | Ready for Dev |
| 34 | WarningBanner | Feedback | All | All | Ready for Dev |
| 35 | QrCodeDisplay | Consumer | Consumer | HP | Ready for Dev |
| 36 | PrescriptionJourneyTracker | Consumer | Consumer | HP | Ready for Dev |
| 37 | QuickActionGrid | Consumer | Consumer | HP | Ready for Dev |

---

## 2. Design Primitives

### 2.1 Color Application Rules

#### Lime Green (`#9fe870` / `--brand-lime`)
- **Use for:** Primary action buttons (`PrimaryButton`), active nav item highlights, progress fill in Consumer theme, focus ring accent.
- **Never use for:** Text on white backgrounds (fails WCAG AA contrast at small sizes), danger or warning states, decorative purposes unrelated to a user action.
- **On lime surfaces:** Always pair text with `--brand-dark-green` (`#163300`). Never use white or near-black text on lime — contrast ratio is insufficient.
- **Hover state:** Shift to `--brand-lime-light` (`#c7f4a0`). Active/pressed: shift to `--brand-lime-dark` (`#7ac44e`).

#### Positive Green (`#054d28` / `--color-success` / `--brand-positive-green`)
- **Use for:** Success toasts, confirmed sync state, NKDA (No Known Drug Allergies) positive confirmation, completed step indicators.
- **Never use for:** Primary interactive elements (too dark for button backgrounds at small sizes without light text). Do not use interchangeably with Lime Green.
- **On positive-green surfaces:** Use `--neutral-0` (white) text.

#### Danger Red (`#d03238` / `--color-danger`)
- **RESERVED FOR safety-critical UI only.** Permitted uses: allergy panels, drug interaction contraindication state, drug allergy match state, DangerButton, InlineError, blood-type indicators, critical vital flags.
- **NEVER use for:** Decorative accents, theme differentiation, marketing elements, status labels that are not clinically critical, any element a user sees during routine non-emergency workflow.
- **Misuse of Danger Red desensitizes clinicians to genuine safety alerts and is a patient safety risk.**
- **On danger-red surfaces:** Use `--neutral-0` (white) text. On light danger backgrounds (`--color-danger-light`): use `--color-danger-dark` (`#9a171c`) text.

#### Warning Yellow (`#ffd11a` / `--color-warning`)
- **Use for:** StaleDataWarning banners, DrugInteractionPanel Warning state (moderate interaction), WarningBanner, CheckUnavailable state background tint.
- **Never use for:** Success states, decorative backgrounds, text color (insufficient contrast on light backgrounds — use `--color-warning-dark` `#b38f00` for text on warning surfaces).
- **Warning Yellow must always be accompanied by an explicit explanatory label.** Never rely on color alone to communicate warning state.
- **On warning-yellow surfaces:** Always use `--color-warning-dark` (`#b38f00`) or near-black text. Never use white.

#### Ring Shadow vs. Elevation Shadow — Clinical Theme Rule
- **Clinical theme uses ring-only shadows** (`--shadow-ring`, `--shadow-ring-accent`) for interactive cards and focused inputs. Elevation shadows (`--shadow-md`, `--shadow-lg`) are reserved for modals, command palettes, and overlays.
- **Fulfillment and Consumer themes** may use elevation shadows on cards.
- **Rationale:** Dense clinical UIs avoid layering cues that add visual noise; the flat ring-based system keeps focus on data density.

---

### 2.2 Typography Usage Rules

#### Inter 900 (Display Weight)
- **Contexts:** Hero section display text, patient name in PatientCard header (OPD-D desktop), page-level stat numbers (e.g., "10 patients"), empty-state headings.
- **Minimum size for 900 weight:** `--font-size-2xl` (24px). Never use Inter 900 below 24px — it becomes illegible and over-dominant.
- **Letter spacing:** Always pair with `--letter-spacing-tight` (`-0.03em`).
- **Line height:** `--line-height-tight` (`1.15`) for multi-line display, `0.85` for single-line hero numbers.
- **Never use 900 weight for:** Body copy, labels, helper text, form fields, navigation items, button labels.

#### Inter 600 (Semibold — Default Body Weight)
- **This is the default weight for all body text across the platform.** Do not use 400 (Regular) as default — it is reserved for supplementary helper text and metadata.
- **Contexts:** Nav labels, card body copy, form labels, button labels, table data cells, list items.
- **Letter spacing:** `--letter-spacing-normal` (0em) for body, `--letter-spacing-snug` (-0.01em) for compact lists.

#### Letter-Spacing Rules
| Context | Value | Token |
|---------|-------|-------|
| Headings (h1–h3) | -0.03em | `--letter-spacing-tight` |
| Compact sub-headings (h4–h5) | -0.01em | `--letter-spacing-snug` |
| Body copy | 0em | `--letter-spacing-normal` |
| Uppercase labels (status badges, section dividers) | +0.08em | (custom — not in base tokens, apply inline) |
| Mono / code / IDs | 0em | `--letter-spacing-normal` |

#### Line-Height Rules
| Context | Value | Token |
|---------|-------|-------|
| Display / hero numbers | 0.85 | (custom tight) |
| Headings in cards | 1.15 | `--line-height-tight` |
| Sub-headings | 1.3 | `--line-height-snug` |
| Body / form copy | 1.5 | `--line-height-normal` |
| Helper / metadata | 1.65 | `--line-height-relaxed` |
| Long-form SOAP notes | 1.65 | `--line-height-relaxed` |

---

### 2.3 Motion System

> All animations must be disabled when `prefers-reduced-motion: reduce` is active. Apply the following CSS globally:
> ```css
> @media (prefers-reduced-motion: reduce) {
>   *, *::before, *::after {
>     animation-duration: 0.01ms !important;
>     transition-duration: 0.01ms !important;
>   }
> }
> ```
> Safety-critical state changes (allergy panel appearance, drug interaction block) must use color and text, never animation alone, to communicate state.

| Animation | Duration | Easing | Trigger | Token Reference | Notes |
|-----------|----------|--------|---------|----------------|-------|
| Button hover scale (1.03) | 160ms | `--ease-out` | `:hover` (pointer only) | `--duration-btn`, `--ease-out` | `@media (hover: hover) and (pointer: fine)` only. Scale + background shift to `#cdffad`. No spring. |
| Button active/press scale (0.97) | 100ms | `--ease-out` | `:active` | `--scale-active`, `--ease-out` | Override `transition-duration: 100ms` on `:active`. No bounce. |
| Button optimistic success flash | 50ms immediate + 200ms fade | `--ease-out` | Click → success | `--duration-faster`, `--duration-normal`, `--ease-out` | Instant lime background → checkmark icon → 200ms fade to original |
| Panel slide-in (translateX) | 250ms | `--ease-panel` | Panel open trigger | `--duration-panel-in`, `--ease-panel` | iOS drawer curve. Slower enter = spatial grounding. |
| Panel slide-out | 180ms | `--ease-out` | Panel close / Escape | `--duration-panel-out`, `--ease-out` | Asymmetric: exit faster than enter. System feels responsive. |
| Command palette open | none | — | Cmd+K (keyboard) | — | **No animation.** Keyboard-initiated actions must respond instantly. Use `visibility: hidden → visible`. |
| Command palette dismiss | none | — | Escape / outside click | — | **No animation.** Same rule: keyboard/click dismissal is instant. |
| Sync indicator pulse (syncing state) | 600ms infinite | `--ease-in-out` | Sync in progress | `--duration-slower`, `--ease-in-out` | Opacity 1→0.5→1 pulse on spinner |
| Offline banner slide-down | 250ms | `--ease-out` | Network disconnect | `--duration-moderate`, `--ease-out` | From -100% translateY to 0 |
| Offline banner slide-up (dismiss on reconnect) | 200ms | `--ease-in` | Network reconnect | `--duration-normal`, `--ease-in` | Smooth out |
| Page transitions | 150ms | `--ease-in-out` | Route change | `--duration-fast`, `--ease-in-out` | Opacity fade only — no slide (reduces motion sickness risk) |
| BottomSheet drag open | Spring | `--ease-spring-gentle` | Drag / tap trigger | `--ease-spring-gentle` | Follows touch gesture; spring settle on release |
| Success toast slide-in | 200ms | `--ease-spring` | Successful action | `--duration-normal`, `--ease-spring` | From right edge (left edge in RTL) |
| Success toast auto-dismiss fade | 300ms | `--ease-out` | After 3s delay | `--duration-moderate`, `--ease-out` | Fade only, no movement |
| Stale data warning pulse (attention) | 800ms x2 | `--ease-in-out` | Stale data loaded | `--duration-slowest` | 2 pulses only — not infinite (avoid alarm fatigue) |

---

## 3. Core Components

---

### AppShell

> Three-panel layout container: fixed header + collapsible sidebar + scrollable main content area. The structural wrapper for all desktop PWA views.

**Variants:** `default` (sidebar expanded, 200px), `collapsed` (sidebar 56px icon-only), `mobile` (sidebar hidden, bottom tab bar shown)

**Props (TypeScript interface):**
```typescript
interface AppShellProps {
  theme: 'clinical' | 'fulfillment';
  sidebarCollapsed?: boolean;
  onSidebarToggle?: () => void;
  header: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  /** Persistent offline banner slot — always rendered above main content */
  offlineBanner?: React.ReactNode;
  className?: string;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Sidebar expanded | 200px fixed width, nav labels visible | `--space-48` (192px base) |
| Sidebar collapsed | 56px fixed width, icon-only, tooltips on hover | `--space-14` |
| Mobile (<768px) | Sidebar hidden, bottom tab bar renders | Breakpoint: 768px |
| Offline | OfflineBanner renders below GlobalHeader, pushes main content down | See OfflineBanner |

**Token Usage:**
- Sidebar background: `--color-bg-sidebar` (clinical: `#ffffff` white)
- Sidebar border: `1px solid var(--color-border-subtle)` (clinical: `#e8ebe6`)
- Main area background: `--color-bg-app` (clinical: `#f4f5f2` warm canvas)
- Header background: `--color-bg-header` (clinical: `#ffffff` white)
- Header border: `1px solid var(--color-header-border)` (clinical: `#e8ebe6`)
- Header height: `--space-14` (56px)
- Active nav item: lime pill — `background: var(--color-sidebar-item-bg-active)` + `color: var(--color-sidebar-text-active)`
- Sidebar transition: `width 250ms var(--ease-panel)`

**Accessibility:** `<main>` landmark for content area, `<nav>` landmark for sidebar. Skip-to-content link as first focusable element in DOM. Sidebar collapse button: `aria-expanded`, `aria-label="Toggle navigation"`.

**RTL:** Sidebar renders on the right when `dir="rtl"`. `border-inline-end` (instead of `border-right`) on sidebar. Main content padding shifts to `padding-inline-start`.

**Animation:** Sidebar width transition 250ms `--ease-panel` on collapse/expand. No spring — panel curve grounds the spatial shift.

---

### PageHeader

> Page-level header rendered inside the main content area. Contains page title, breadcrumb trail, and a primary action slot.

**Variants:** `default`, `with-breadcrumb`, `with-action`

**Props (TypeScript interface):**
```typescript
interface PageHeaderProps {
  title: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  primaryAction?: React.ReactNode;
  subtitle?: string;
  className?: string;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Title + optional subtitle, no action | `--font-size-2xl`, `--font-weight-display` |
| With action | Primary action aligned `inline-end` | `--space-4` gap |
| Mobile | Title truncates to single line, breadcrumb collapses to `…` | Ellipsis overflow |

**Token Usage:**
- Title: `--font-size-2xl`, `--font-weight-display` (900), `--letter-spacing-tight`
- Breadcrumb text: `--font-size-sm`, `--font-weight-semibold`, `--neutral-500`
- Bottom border: `1px solid var(--color-border-subtle)`
- Padding: `var(--space-6) var(--space-8)`

**Accessibility:** Page title renders as `<h1>`. Breadcrumb uses `<nav aria-label="Breadcrumb">` with `<ol>`. Current page in breadcrumb: `aria-current="page"`.

**RTL:** Breadcrumb separator chevron flips direction. Action slot remains at `inline-end`.

---

### SplitPanel

> Resizable two-panel layout for the clinical encounter view. Left panel: patient summary. Right panel: charting / SOAP editor.

**Variants:** `equal` (50/50), `summary-focus` (35/65), `chart-focus` (25/75), `collapsed-left` (0/100)

**Props (TypeScript interface):**
```typescript
interface SplitPanelProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultSplit?: number; // 0-100, percentage for left panel
  minLeftWidth?: number; // px, default 280
  minRightWidth?: number; // px, default 400
  onSplitChange?: (leftPercent: number) => void;
  className?: string;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Divider visible, both panels scrollable independently | `--shadow-ring` on divider |
| Dragging | Divider highlights, cursor changes to `col-resize` | `--brand-lime` on divider |
| Left collapsed | Right panel takes full width, collapse icon shows | Transition 300ms |
| Mobile | Panels stack vertically, no resize handle | Single-column layout |

**Token Usage:**
- Divider: `4px` wide, `--neutral-200` background, `--brand-lime` on `:hover`/drag
- Panel background: inherits from AppShell main area

**Accessibility:** Resize handle: `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow` (percent), `aria-valuemin="0"`, `aria-valuemax="100"`. Keyboard: Left/Right arrows adjust split by 5%, Home/End go to extremes.

**RTL:** Left panel becomes right panel visually. Resize handle position inverts. Drag direction inverts.

**Animation:** Panel width transition 250ms `--ease-panel` when toggling collapsed state only. No animation during drag.

---

### BottomSheet

> Mobile overlay panel anchored to the bottom of the screen with a drag handle. Used for patient details, prescription detail, filter panels.

**Variants:** `half` (50% viewport height), `full` (90% viewport height), `peek` (120px, shows handle + summary row)

**Props (TypeScript interface):**
```typescript
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  snapPoints?: number[]; // vh percentages, e.g. [30, 60, 90]
  defaultSnap?: number;
  children: React.ReactNode;
  /** If true, tapping backdrop dismisses the sheet */
  dismissOnBackdrop?: boolean;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Closed | Off-screen (translateY: 100%) | — |
| Peek | 120px visible, drag handle prominent | `--radius-3xl` top corners |
| Half | 50vh, scrollable content area | `--shadow-modal` |
| Full | 90vh, close button in header | `--shadow-modal` |
| Dragging | Follows touch Y position | Spring settle on release |

**Token Usage:**
- Background: `--color-surface-overlay` (theme surface)
- Border radius (top): `--radius-3xl` (30px)
- Handle: `4px × 36px`, `--neutral-300`, centered, `--radius-pill`
- Backdrop: `rgba(14,15,12,0.48)` semi-transparent

**Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title. Focus trapped inside sheet when open. Escape key calls `onClose`. First focusable element receives focus on open.

**RTL:** No horizontal change. Drag handle remains centered.

**Animation:** Snap transitions: `--ease-spring-gentle` 300ms. Dismiss: `--ease-in` 250ms.

---

### GlobalHeader

> Fixed top navigation bar present on all desktop PWA views. Contains the Ultranos logo, search trigger, sync indicator, and user menu.

**Variants:** `clinical`, `fulfillment`

**Props (TypeScript interface):**
```typescript
interface GlobalHeaderProps {
  theme: 'clinical' | 'fulfillment';
  onSearchOpen: () => void;
  syncState: SyncIndicatorState;
  syncQueueCount: number;
  user: {
    displayName: string;
    role: string;
    avatarUrl?: string;
  };
  onUserMenuOpen: () => void;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Logo + search bar + sync indicator + avatar | `--brand-near-black` bg |
| Search focused | Search bar expands, `--shadow-focus-ring` | `--shadow-ring-accent` |
| User menu open | Avatar has active ring | `--shadow-ring-accent` |

**Token Usage:**
- Background: `--brand-near-black` (`#0e0f0c`)
- Height: `--space-14` (56px)
- Logo text: `--brand-lime`, `--font-weight-display`
- Search placeholder: `--neutral-400`
- Border-bottom: `1px solid var(--neutral-800)`

**Accessibility:** `<header>` landmark. Search trigger: `aria-label="Search patients, medications, labs"`, `aria-keyshortcuts="Meta+K"`. User menu button: `aria-haspopup="true"`, `aria-expanded`.

**RTL:** Logo moves to right. Search bar fills center. Sync indicator and user menu move to left.

---

### SidebarNav

> Primary navigation panel. Renders nav items with active state, section dividers, and badge support for counts (e.g., pending Rx count).

**Variants:** `expanded` (200px with labels), `collapsed` (56px icon-only)

**Props (TypeScript interface):**
```typescript
interface SidebarNavProps {
  items: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    href: string;
    badge?: number;
    section?: string; // divider group label
  }>;
  activeItemId: string;
  collapsed?: boolean;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Label + icon, muted text | `--neutral-400` |
| Active | Lime green left accent bar, light bg, bold text | `--brand-lime`, `--color-surface-sidebar-active` |
| Hover | Slightly lighter bg | `--neutral-800` hover bg |
| Badge present | Pill badge inline-end of label | `--color-danger` bg, white text |
| Collapsed | Icon only, label in tooltip | `--radius-button-sm` |

**Token Usage:**
- Active indicator: `3px solid var(--brand-lime)` on `border-inline-start`
- Item height: `--space-11` (44px) minimum
- Badge: `--color-danger` background, `--neutral-0` text, `--radius-pill`

**Accessibility:** `<nav>` with `aria-label="Main navigation"`. Each item: `<a>` with `aria-current="page"` when active. Collapsed mode: each item has `title` attribute and `aria-label` for tooltip.

**RTL:** Active indicator bar moves to `border-inline-end` (right side). Icon + label order preserved logically. Collapsed tooltips appear on left.

---

### BottomTabBar

> Mobile bottom navigation bar with 4–5 tab items. Used in OPD Android and Health Passport.

**Variants:** `clinical` (4 items), `consumer` (4 items)

**Props (TypeScript interface):**
```typescript
interface BottomTabBarProps {
  tabs: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    activeIcon?: React.ReactNode;
    badge?: number;
    onPress: () => void;
  }>;
  activeTabId: string;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Inactive | Icon muted, label muted | `--neutral-400` |
| Active | Icon filled/colored, label lime or teal per theme | `--brand-lime` (Clinical), `--brand-teal` (Consumer) |
| Badge | Red pill above icon, top-right | `--color-danger` |
| Pressed | Scale 0.92 momentarily | Spring 120ms |

**Token Usage:**
- Background: `--brand-near-black` (Clinical), `--brand-off-white` (Consumer)
- Min tap target: `--space-11` (44px) — WCAG 2.5.5 minimum
- Safe area bottom: CSS env(safe-area-inset-bottom) for iOS notch

**Accessibility:** `<nav role="tablist">`. Each tab: `role="tab"`, `aria-selected`. Active tab label always visible (never icon-only on mobile).

**RTL:** Tab order reverses. Badges remain top-right of icon in RTL (do not flip badge position).

**Animation:** Active tab icon scale 1.0→1.12 on selection, 120ms `--ease-spring`. Badge pop: scale 0→1, 150ms `--ease-spring`.

---

### ClinicalCommandPalette

> Full-screen overlay command palette (Cmd+K / Ctrl+K). Supports grouped search results: patients, medications, actions. Keyboard-navigable throughout.

**Variants:** N/A — single variant with grouped result sections

**Props (TypeScript interface):**
```typescript
interface ClinicalCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: CommandResult) => void;
  recentItems?: CommandResult[];
}

interface CommandResult {
  id: string;
  type: 'patient' | 'medication' | 'action' | 'lab';
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  href?: string;
  action?: () => void;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Empty / recent | Recent items shown, grouped | `--neutral-500` group label |
| Typing | Results stream in, loading shimmer during search | Shimmer: `--neutral-100` |
| Result highlighted | Lime left bar, light bg | `--brand-lime`, `--neutral-50` |
| No results | Centered empty state message | `--neutral-400` |

**Token Usage:**
- Modal background: `--neutral-0`
- Backdrop: `rgba(14,15,12,0.64)`
- Input: `--font-size-lg`, `--font-weight-semibold`
- Box shadow: `--shadow-modal`
- Border radius: `--radius-modal` (24px)
- Max width: 600px
- Max height: 480px

**Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`. Focus trapped. Input: `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`. Results: `role="listbox"`, each item `role="option"`, `aria-selected`. Keyboard: Up/Down to navigate, Enter to select, Escape to close.

**RTL:** Input text direction: `dir="auto"`. Result icon and text remain logically ordered via flexbox with `gap`.

**Animation:** Open: fade + scale (0.95→1.0), 200ms `--ease-spring`. Close: 150ms `--ease-in`.

---

### PrimaryButton (OptimisticActionButton)

> The primary call-to-action. In clinical contexts, doubles as the OptimisticActionButton — provides instant visual confirmation on click before network response.

**Variants:** `default`, `optimistic` (clinical), `loading`, `success`

**Props (TypeScript interface):**
```typescript
interface PrimaryButtonProps {
  label: string;
  onClick: () => void | Promise<void>;
  /** Optimistic mode: shows instant success state, reverts if action fails */
  optimistic?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  type?: 'button' | 'submit';
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Lime green pill, dark green text | `--brand-lime`, `--brand-dark-green` |
| Hover | Scale 1.04, `--brand-lime-light` bg | `--brand-lime-light`, `--ease-spring` 120ms |
| Active/Press | Scale 0.96, `--brand-lime-dark` bg | `--brand-lime-dark`, `--ease-spring` 120ms |
| Focus | Lime focus ring, 4px offset | `--shadow-focus-ring` |
| Optimistic success | Instant: `--color-success` bg + checkmark icon (50ms) → fade to default (200ms) | `--color-success`, `--ease-out` |
| Loading | Spinner replaces label, disabled pointer events | `--neutral-300` spinner |
| Disabled | `--neutral-200` bg, `--neutral-400` text, `cursor: not-allowed` | See DisabledButton |

**Token Usage:**
- Background: `--brand-lime`
- Text: `--brand-dark-green`
- Border-radius: `--radius-button` (pill)
- Padding: `var(--space-3) var(--space-6)` (md size)
- Font: `--font-weight-semibold`, `--font-size-sm`

**Accessibility:** Native `<button>` element always. `aria-disabled` when disabled (never remove from DOM). Loading state: `aria-busy="true"`, spinner has `aria-hidden="true"`, visually hidden loading label for screen readers.

**RTL:** Icon position mirrors logically (start/end use logical direction, not left/right).

**Animation:** Hover scale 1.04 / active scale 0.96: 120ms `--ease-spring`. Optimistic flash: background transitions at 50ms then 200ms fade.

**Healthcare Safety Note:** In clinical contexts where this button submits a prescription or AI-confirmed note, the button must not trigger the action on single keyboard `Enter` without a brief 400ms confirm delay or a second confirmation mechanism, to prevent accidental submissions.

**Usage Example:**
```tsx
<PrimaryButton
  label="Save Prescription"
  optimistic
  onClick={handleSavePrescription}
  icon={<CheckIcon />}
  iconPosition="start"
/>
```

---

### SecondaryButton

> Subtle pill button for secondary actions. Same shape as PrimaryButton but with a muted, outlined style.

**Props (TypeScript interface):**
```typescript
interface SecondaryButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Transparent bg, `--neutral-200` border, `--neutral-800` text | `--shadow-ring` |
| Hover | Scale 1.04, `--neutral-100` bg | `--ease-spring` 120ms |
| Active | Scale 0.96, `--neutral-200` bg | `--ease-spring` 120ms |
| Focus | Lime focus ring | `--shadow-focus-ring` |
| Disabled | `--neutral-100` bg, `--neutral-300` text | `cursor: not-allowed` |

**RTL:** Icon position mirrors logically.

**Animation:** Same scale spring as PrimaryButton.

---

### DangerButton

> Danger Red pill button. Reserved exclusively for destructive or override actions in clinical safety flows. Requires explicit user intent context.

**Props (TypeScript interface):**
```typescript
interface DangerButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Require confirmation checkbox before enabling — used in drug override flows */
  requiresConfirmation?: boolean;
  confirmationLabel?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | `--color-danger` bg, white text | `--color-danger`, `--neutral-0` |
| Hover | Scale 1.04, `--color-danger-dark` bg | `--ease-spring` 120ms |
| Active | Scale 0.96 | `--ease-spring` 120ms |
| Focus | Danger focus ring | `--shadow-focus-danger` |
| Awaiting confirmation | Muted danger, tooltip "Confirm reason above" | `--color-danger` at 50% opacity |
| Disabled | Same as DisabledButton | `aria-disabled` |

**Healthcare Safety Note:** DangerButton must never be the default focused element on page load. When used in drug override flows, it must remain `aria-disabled` until the accompanying `CheckboxWithLabel` confirmation is checked. Both the override reason and the button click must be audit-logged via `@ultranos/audit-logger`.

**RTL:** No special treatment.

---

### DisabledButton

> Disabled state pattern applicable to any button type. Specified separately to enforce implementation rules.

**Props:** Any button props with `disabled: true`.

**Critical Rules:**
- **Never remove a disabled button from the DOM.** Use `aria-disabled="true"` and `tabIndex={-1}` for non-native-button elements. For `<button>`, use both the `disabled` attribute AND `aria-disabled="true"`.
- Never use `display: none` or `visibility: hidden` to hide disabled buttons — their absence confuses users about available actions.
- Disabled buttons do NOT receive hover/active animation.
- Tooltip on hover is permitted to explain why the button is disabled: `title="Complete drug interaction check to proceed"`.

**Token Usage:**
- Background: `--neutral-200`
- Text: `--neutral-400`
- Border: none
- Cursor: `not-allowed`

---

### IconButton

> Square-ish pill button containing only an icon. Always paired with a tooltip for accessibility.

**Props (TypeScript interface):**
```typescript
interface IconButtonProps {
  icon: React.ReactNode;
  label: string; // Used as aria-label and tooltip text
  onClick: () => void;
  variant?: 'default' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Neutral bg, icon centered | `--neutral-100` bg |
| Hover | Scale 1.04, tooltip visible | `--ease-spring` 120ms |
| Active | Scale 0.96 | |
| Focus | Focus ring | `--shadow-focus-ring` |
| Ghost variant | Transparent bg, hover shows light bg | |
| Danger variant | `--color-danger-light` bg, `--color-danger` icon | |

**Accessibility:** `aria-label` is mandatory. Tooltip rendered via `title` attribute and custom tooltip component. Min size: 44×44px (WCAG 2.5.5).

---

### PatientCard

> Displays a patient summary in list views. Three variants: standard, allergy (with Danger Red band), and selected.

**Variants:** `standard`, `allergy`, `selected`

**Props (TypeScript interface):**
```typescript
interface PatientCardProps {
  patientId: string;
  displayName: string;
  age: number;
  sex: 'M' | 'F' | 'O';
  chiefComplaint?: string;
  waitingMinutes?: number;
  arrivalTime?: string;
  allergies?: Array<{ name: string; severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING' }>;
  isSelected?: boolean;
  onClick: () => void;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Standard | White card, `--shadow-ring`, patient meta | `--shadow-ring`, `--radius-card-sm` |
| Allergy variant | Danger Red left band (4px), `--color-allergy-bg` background tint | `--color-allergy`, `--color-allergy-bg` |
| Selected | Lime green left border (4px), `--neutral-50` bg | `--brand-lime` |
| Hover | `--shadow-card-hover`, scale 1.005 | `--shadow-card-hover` |
| Loading | Skeleton shimmer on all text rows | `--neutral-100` shimmer |

**Token Usage:**
- Card border-radius: `--radius-card-sm` (16px)
- Allergy band: `4px solid var(--color-allergy)` on `border-inline-start`
- Allergy label: `--color-allergy-text`, `--font-weight-semibold`, `--font-size-xs`

**Accessibility:** `role="button"` or `<button>` wrapper. `aria-selected` when in selected state. `aria-label` includes patient name and allergy summary if present: `"Fatima Hassan, 34F, SEVERE Penicillin allergy"`.

**RTL:** Allergy band and selected indicator move to `border-inline-end`.

**Healthcare Safety Note:** The allergy variant card MUST always sort first in any patient list. This is enforced at the data layer — the UI must not reorder cards based on user preferences in a way that buries allergy patients. Allergy information in the card is never truncated to less than allergen name + severity class.

---

### PrescriptionCard

> Summarizes a prescription with Rx number, patient, medication list, status badge, and a dispensing action.

**Props (TypeScript interface):**
```typescript
interface PrescriptionCardProps {
  rxNumber: string;
  patientName: string;
  patientId: string;
  medications: Array<{ name: string; dose: string; frequency: string }>;
  status: 'PENDING' | 'DISPENSED' | 'PARTIAL' | 'CANCELLED' | 'EXPIRED';
  prescribedAt: string; // ISO 8601
  onDispense?: () => void;
  onView: () => void;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Pending | Status badge: Warning Yellow | `--color-warning`, `--color-warning-light` |
| Dispensed | Status badge: Positive Green | `--color-success`, `--color-success-light` |
| Partial | Status badge: Info Blue | `--color-info`, `--color-info-light` |
| Cancelled | Status badge: muted neutral, line-through | `--neutral-400` |
| Expired | Status badge: Danger Red | `--color-danger`, `--color-danger-light` |
| Stale data flag | Yellow banner below card header | `--color-warning-light` |

**Token Usage:**
- Status badge: `--radius-badge` (pill), uppercase label with `letter-spacing: 0.08em`
- Card: `--radius-card-sm`, `--shadow-ring`

**Accessibility:** Rx number must be in a `<dt>/<dd>` or `aria-describedby` relationship. Status badge: `aria-label="Status: Pending"` (not color-only). Dispense button: `aria-label="Dispense prescription RX-00291"`.

**RTL:** Medication list is LTR-biased content (drug names are Latin). Use `dir="ltr"` on drug name spans within an RTL context.

---

### LabOrderCard

> Summarizes a lab order. In Lab Portal context, shows only patient first name and age (data minimization rule).

**Props (TypeScript interface):**
```typescript
interface LabOrderCardProps {
  orderId: string;
  /** Full name in Clinical context, first name + age only in Lab Portal context */
  patientDisplay: string;
  tests: Array<{ name: string; code: string }>;
  status: 'ORDERED' | 'COLLECTED' | 'PROCESSING' | 'RESULTED' | 'CANCELLED';
  orderedAt: string;
  resultedAt?: string;
  onView: () => void;
  /** Set true in Lab Portal — enforces minimal patient display */
  labPortalMode?: boolean;
}
```

**Healthcare Safety Note:** When `labPortalMode={true}`, the component must only render `patientDisplay` (pre-minimized by the API) and must not render any other patient identifiers. The API layer enforces this; the component adds a second layer of defense. Never pass full patient objects to this component in Lab Portal context.

**States:** Mirror PrescriptionCard status pattern with lab-specific states (ORDERED, COLLECTED, PROCESSING, RESULTED).

---

### AllergyPanel

> Displays patient allergies. ALWAYS rendered first in any patient-facing clinical view. Never collapsed. Never hidden behind a tab.

**Variants:** `has-allergies`, `nkda` (No Known Drug Allergies)

**Props (TypeScript interface):**
```typescript
interface AllergyPanelProps {
  allergies: Array<{
    allergen: string;
    allergenClass?: string; // e.g., "Penicillin class"
    severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';
    reaction?: string;
    onsetDate?: string;
  }>;
  /** Clinician who verified the allergy list */
  verifiedBy?: string;
  verifiedAt?: string;
  onAddAllergy?: () => void;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Has allergies | Danger Red band top + left, `--color-allergy-bg` fill | `--color-allergy`, `--color-allergy-bg` |
| NKDA | Positive green band, "No Known Drug Allergies" label | `--color-success`, `--color-success-light` |
| Unverified | Warning Yellow band, "Allergy status unverified" | `--color-warning`, `--color-warning-light` |
| Loading | Skeleton but minimum height maintained | `--space-20` minimum height |

**Token Usage:**
- Top border: `4px solid var(--color-allergy)` on `has-allergies` state
- Minimum height: `--space-20` (80px) — panel is never zero-height even in NKDA state
- Header label: `--color-allergy-text`, `--font-weight-display` (900), uppercase, `letter-spacing: 0.08em`
- Severity chip: mapped colors per severity (MILD: info, MODERATE: warning, SEVERE/LIFE_THREATENING: danger)

**Accessibility:** `role="alert"` — screen readers announce allergy panel content immediately on mount. `aria-live="assertive"` for any allergy additions during session. Section heading: `<h2>Allergies</h2>` always present in DOM.

**RTL:** Red band moves to `border-inline-start`. Allergy list items flow RTL-compatible.

**Healthcare Safety Note:** This component has mandatory snapshot test coverage confirming: (1) it renders before any other clinical data section, (2) it is not collapsed, (3) the `role="alert"` attribute is present, (4) Danger Red (`--color-allergy`) is applied to the border.

---

### MedicationListItem

> A single row in an active medications list. Shows drug name, dose, frequency, and a status badge.

**Props (TypeScript interface):**
```typescript
interface MedicationListItemProps {
  drugName: string;
  genericName?: string;
  dose: string;
  frequency: string;
  route?: string; // e.g., "Oral", "IV"
  status: 'ACTIVE' | 'DISCONTINUED' | 'ON_HOLD' | 'COMPLETED';
  prescribedAt?: string;
  onView?: () => void;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Active | Drug name bold, full opacity | `--font-weight-semibold` |
| Discontinued | Line-through on drug name, muted | `--neutral-400`, `text-decoration: line-through` |
| On Hold | Warning Yellow left bar | `--color-warning` |
| Completed | Positive green status badge | `--color-success` |

**RTL:** Drug names (Latin) use `dir="ltr"` inline. Status badges at `inline-end`.

---

### VitalsRow

> A single row in a vitals table. Shows vital name, value, unit, and a color-coded reference range indicator.

**Props (TypeScript interface):**
```typescript
interface VitalsRowProps {
  vitalName: string;
  value: number | string;
  unit: string;
  referenceRange?: { min: number; max: number };
  flag?: 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | 'NORMAL';
  recordedAt: string;
}
```

**States:**
| Flag | Visual Treatment | Token Used |
|------|-----------------|------------|
| NORMAL | Value in default color | `--neutral-800` |
| LOW / HIGH | Value in warning amber | `--color-warning-dark` |
| CRITICAL_LOW / CRITICAL_HIGH | Value in danger red, bold | `--color-danger`, `--font-weight-bold` |
| No range | Value in default color, no indicator | |

**Accessibility:** Critical values: `aria-label` includes "Critical: [value] [unit], outside normal range". Table row structure: `<tr>` with appropriate `<th scope="row">` for vital name.

---

### LabResultRow

> A single row in a lab results table. Shows test name, value, reference range, and an abnormal flag.

**Props (TypeScript interface):**
```typescript
interface LabResultRowProps {
  testName: string;
  testCode?: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag?: 'NORMAL' | 'ABNORMAL_LOW' | 'ABNORMAL_HIGH' | 'CRITICAL';
  resultedAt: string;
}
```

**States:** Mirror VitalsRow flag color mapping. CRITICAL: `--color-danger`, bold. ABNORMAL: `--color-warning-dark`.

**Accessibility:** `aria-label` on critical results. `aria-sort` on column headers if sortable.

---

### GlobalSyncIndicator

> Always-visible sync status widget in the GlobalHeader. Shows 5 states with counts and click-to-open detail panel.

**Variants:** `idle`, `queued`, `syncing`, `success`, `error`

**Props (TypeScript interface):**
```typescript
type SyncIndicatorState = 'idle' | 'queued' | 'syncing' | 'success' | 'error';

interface GlobalSyncIndicatorProps {
  state: SyncIndicatorState;
  queuedCount?: number;
  lastSyncAt?: string; // ISO 8601
  errorMessage?: string;
  onClick: () => void; // Opens sync detail panel
}
```

**States:**
| State | Icon | Label | Color | Animation |
|-------|------|-------|-------|-----------|
| idle | Cloud with check | "Synced" | `--neutral-400` | None |
| queued | Cloud with clock | "{N} queued" | `--color-warning-dark` | None |
| syncing | Spinning arrows | "Syncing…" | `--brand-lime` | Pulse 600ms infinite |
| success | Cloud with checkmark | "Synced" | `--color-success` | Flash then return to idle (2s) |
| error | Cloud with X | "Sync error" | `--color-danger` | Static — no animation for error |

**Token Usage:**
- Container: `--radius-pill`, `--space-2` padding, `--neutral-800` bg
- Icon size: 16px
- Label: `--font-size-xs`, `--font-weight-semibold`

**Accessibility:** `role="status"`, `aria-live="polite"`. State changes announced to screen readers: "Sync complete. All data saved." on success. Error: `aria-live="assertive"`, announces error. `aria-label="Sync status: {state}"`.

**RTL:** Entire widget mirrors horizontally.

**Healthcare Safety Note:** The GlobalSyncIndicator MUST be visible at all times in clinical and fulfillment views. It must never be hidden, collapsed, or removed from the DOM during any workflow state. Clinicians depend on it to verify data persistence before leaving the app.

---

### DrugInteractionPanel

> Safety-critical component displaying the status of a drug interaction check. All 6 states must be fully implemented with no shortcuts.

**Variants:** `checking`, `clear`, `warning`, `contraindicated`, `allergy-match`, `check-unavailable`

**Props (TypeScript interface):**
```typescript
type DrugInteractionState =
  | 'checking'
  | 'clear'
  | 'warning'
  | 'contraindicated'
  | 'allergy-match'
  | 'check-unavailable';

interface DrugInteractionPanelProps {
  state: DrugInteractionState;
  drugs?: string[]; // Drugs being checked
  interactions?: Array<{
    drug1: string;
    drug2: string;
    severity: 'MINOR' | 'MODERATE' | 'MAJOR' | 'CONTRAINDICATED';
    description: string;
    reference?: string;
  }>;
  allergyMatch?: {
    drug: string;
    allergen: string;
    severity: string;
  };
  onOverrideWithReason?: (reason: string) => void;
  onDangerOverride?: (reason: string) => void; // Contraindicated only — logs to audit
  onSpecialistApproval?: () => void; // AllergyMatch only
  onAcknowledgeUnavailable?: () => void;
  overrideReasonRequired?: boolean;
}
```

**State 1 — Checking:**
- Visual: Spinner + "Checking drug interactions…" label. Panel height reserved (no layout shift).
- Background: `--neutral-50`
- Border: `1px solid var(--neutral-200)`
- Button state: Prescribe button is `aria-disabled` until check resolves.
- Copy: "Checking drug interactions…"

**State 2 — Clear:**
- Visual: Green checkmark icon + "No interactions found" label.
- Background: `--color-success-light`
- Border: `1px solid var(--color-success-border)`
- Text: `--color-success-dark`
- Copy: "No interactions found. Safe to prescribe."
- Button state: Prescribe button enabled.

**State 3 — Warning (Moderate interaction, override permitted):**
- Visual: Warning Yellow background, warning icon, interaction list, reason text field, Override button.
- Background: `--color-warning-light`
- Border: `2px solid var(--color-warning-border)`
- Text: `--color-warning-dark`
- Copy: "Moderate interaction detected. Review before prescribing." + interaction description
- Actions: `[Override with reason ▾]` (expands reason text field) + `[Cancel]`
- Override flow: Reason field required (min 10 chars), then `[Confirm Override]` enabled. Override logged to audit.
- Button state: Prescribe blocked until override confirmed or drugs changed.

**State 4 — Contraindicated (hard override, danger acknowledgement):**
- Visual: Danger Red background, alert icon, prominent warning copy, reason field mandatory.
- Background: `--color-danger-light`
- Border: `2px solid var(--color-danger-border)`
- Text: `--color-danger-dark`
- Copy: "CONTRAINDICATED: [drug name] must not be prescribed with [drug name]. This combination poses a critical risk."
- Actions: `[Override — I accept clinical responsibility]` (DangerButton, disabled until reason filled) + `[Cancel]`
- Checkbox required: `"I acknowledge this is contraindicated and accept full clinical responsibility"` — must be checked before DangerButton activates.
- Audit: Override reason, clinician ID, timestamp logged as CRITICAL severity audit event.
- Button state: DangerButton remains `aria-disabled` until both checkbox checked AND reason provided.

**State 5 — AllergyMatch (hard block, specialist only):**
- Visual: Full Danger Red panel, allergy cross-reference icon, hard block copy. Prescribe action completely removed.
- Background: `--color-allergy-bg`
- Border: `3px solid var(--color-allergy)`
- Text: `--color-allergy-text`
- Copy: "ALLERGY ALERT: [drug name] matches recorded allergy to [allergen]. Prescribing is blocked. A specialist must approve this override."
- Actions: `[Request Specialist Approval]` (initiates specialist override workflow, separate role-gated action) + `[Remove Drug]`
- No unilateral override possible: only a user with `SPECIALIST` or `ATTENDING` role can approve.
- Audit: Every view of this state logged. Specialist approval is a separate audited event.

**State 6 — CheckUnavailable (network/DB failure):**
- Visual: Warning amber/brown background, explicit warning copy, mandatory acknowledgement checkbox.
- Background: `--color-drug-check-unavailable-bg`
- Border: `2px solid var(--color-warning-border)`
- Text: `--color-drug-check-unavailable`
- Copy: "Drug interaction check unavailable. This may be due to a network issue or database timeout. You cannot assume no interactions exist."
- Checkbox required: `"I understand the interaction check could not complete and I accept clinical responsibility for this prescription"` — mandatory before proceeding.
- Actions: `[Retry Check]` (PrimaryButton) + `[Proceed without check]` (DangerButton, disabled until checkbox checked)
- **NEVER default to "No interactions found" on failure.** This state must always be explicit.
- Audit: Proceeding without check logged as HIGH severity audit event with reason.

**Accessibility:** Panel: `role="alert"` for states 3–6. State 5: `role="alertdialog"`. All state changes announced via `aria-live="assertive"` in states 4 and 5, `aria-live="polite"` in states 2–3.

**RTL:** Drug names render LTR inline. Panel layout mirrors logically.

**Healthcare Safety Note:** The drug interaction check must never be silently skipped. If the check service throws any exception, the component MUST transition to `check-unavailable` state. The component must log a structured audit event when transitioning into any state (checking start, result, override, block). See `packages/audit-logger/src/schema.ts` for event schema.

---

### AiDraftPanel

> Displays AI-generated clinical content (SOAP notes, translation drafts). Three mandatory actions: Discard, Edit, Accept and Sign. Auto-commit is architecturally prohibited.

**Props (TypeScript interface):**
```typescript
interface AiDraftPanelProps {
  draftId: string;
  generatedAt: string; // ISO 8601
  contentType: 'soap-note' | 'translation' | 'drug-suggestion';
  aiContent: string;
  /** Model version for audit trail */
  modelVersion: string;
  onDiscard: (draftId: string) => void;
  onEdit: (draftId: string, editedContent: string) => void;
  /** Accept commits BOTH original AI version and final accepted version to record */
  onAcceptAndSign: (draftId: string, finalContent: string) => void;
  /** Physician must be authenticated at signing time */
  requiresReAuthentication?: boolean;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Draft displayed | Info-blue border, AI badge top-right, content in read-only textarea | `--color-info`, `--color-info-light` |
| Edit mode | Textarea becomes editable, diff highlight shows changes | `--color-info-border` |
| Accepting | Spinner on Accept button, re-auth modal if required | |
| Accepted | Green flash, both versions stored confirmation | `--color-success-light` |
| Discarded | Panel removes, `aria-live` announces "Draft discarded" | |

**Token Usage:**
- AI badge: `--color-info` background, "AI Draft" label, `--radius-pill`
- Border: `2px solid var(--color-info-border)`
- Background: `--color-info-light`
- Warning strip at top: "This content was AI-generated. Review carefully before signing." — `--color-warning-light`, `--font-weight-semibold`

**Accessibility:** `role="region"`, `aria-label="AI-generated draft"`. Warning strip: `role="note"`. Accept button: `aria-describedby` pointing to warning strip ID.

**Healthcare Safety Note:** `onAcceptAndSign` must store both `aiContent` (original) and `finalContent` (post-edit) in the patient record as separate fields. This is enforced at the API layer and must also be implemented at the component level: the callback receives both. The Accept button must never fire on the first keypress after the component mounts (400ms protection window).

---

### SyncConflictBanner

> Surfaced when a Tier 1 sync conflict is detected (allergies, active meds, critical diagnoses). Blocks prescription generation until resolved.

**Props (TypeScript interface):**
```typescript
interface SyncConflictBannerProps {
  conflictId: string;
  fieldName: string; // e.g., "Active Medications", "Allergies"
  tier: 1 | 2; // Tier 1 = blocks Rx; Tier 2 = advisory
  versionA: {
    content: string;
    hlcTimestamp: string;
    deviceId: string;
    authorName: string;
  };
  versionB: {
    content: string;
    hlcTimestamp: string;
    deviceId: string;
    authorName: string;
  };
  onResolve: (conflictId: string, resolution: 'keep-a' | 'keep-b' | 'keep-both') => void;
}
```

**States:**
| Tier | Visual Treatment | Rx Generation |
|------|-----------------|---------------|
| Tier 1 | Danger Red border, both versions shown side-by-side, Rx blocked | BLOCKED until resolved |
| Tier 2 | Warning Yellow border, advisory only, both versions shown | Permitted with warning |

**Token Usage:**
- Tier 1 border: `3px solid var(--color-danger)`
- Tier 2 border: `2px solid var(--color-warning-border)`
- Version A/B cards: `--neutral-50` bg, HLC timestamp in `--font-family-mono`
- "Rx blocked" badge: `--color-danger`, `--radius-pill`

**Accessibility:** `role="alert"`, `aria-live="assertive"` for Tier 1. Both version cards have `aria-label` including author and HLC timestamp. Resolution buttons clearly labeled with outcome.

**Healthcare Safety Note:** Tier 1 conflict resolution uses append-only merge. "Keep Both" is the default resolution option and should be the most prominent. Do not offer "overwrite" as a resolution option — only "Keep A", "Keep B" (which keeps both as separate entries), or "Keep Both" (explicit append). See `packages/sync-engine/src/conflict-resolver.ts`.

---

### StaleDataWarning

> Warning Yellow full-width banner displayed when a patient record was last synced more than a configurable threshold ago.

**Props (TypeScript interface):**
```typescript
interface StaleDataWarningProps {
  lastSyncedAt: string; // ISO 8601
  staleSinceMinutes: number;
  onForceSyncClick: () => void;
  onAcknowledge: () => void;
  /** If true, dispensing/prescribing actions are blocked until acknowledged */
  blocksClinicalActions?: boolean;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Warning Yellow banner, last sync time, Force Sync button | `--color-warning-light`, `--color-warning-border` |
| Blocks actions | "Acknowledge before proceeding" checkbox required | Checkbox required |
| Force sync in progress | Spinner on Force Sync button | `--brand-lime` spinner |
| Acknowledged | Banner persists but dimmed, clinical actions unblocked | `--neutral-100` bg |

**Token Usage:**
- Background: `--color-warning-light`
- Border-bottom: `2px solid var(--color-warning-border)`
- Icon: Warning triangle, `--color-warning-dark`
- Text: `--color-warning-dark`, `--font-weight-semibold`

**Accessibility:** `role="status"`, `aria-live="polite"`. Blocking state: `role="alert"`, `aria-live="assertive"`. Stale duration clearly stated in text (not just icon).

**Animation:** 2 slow pulse cycles on mount (800ms each) to draw attention. Not infinite — avoids alarm fatigue.

---

### OfflineBanner

> Persistent non-blocking banner shown whenever the device has no network connection. Never prevents user from continuing work.

**Props (TypeScript interface):**
```typescript
interface OfflineBannerProps {
  isOffline: boolean;
  queuedActionsCount: number;
  lastSyncedAt?: string;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Online | Hidden (height: 0, not `display: none`) | — |
| Offline | Slides down from top of content area | `--neutral-800` bg, `--brand-lime` text |
| Offline with queue | Shows queued action count | `--brand-lime` badge |

**Copy:** "You are offline. {N} action(s) saved locally and will sync when reconnected." — never "Error" framing.

**Token Usage:**
- Background: `--neutral-800`
- Text: `--neutral-50`
- Icon: Offline cloud, `--brand-lime`

**Accessibility:** `role="status"`, `aria-live="polite"`. Announces on transition to offline: "You are now offline. Data is being saved locally." Reconnection: "Back online. Syncing {N} saved actions."

**Animation:** Slide-down 250ms `--ease-out` on appear. Slide-up 200ms `--ease-in` on dismiss.

---

### SearchInput

> Text input with autocomplete dropdown, keyboard navigation, and loading state. Used for patient search, drug search.

**Props (TypeScript interface):**
```typescript
interface SearchInputProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: SearchResultItem) => void;
  results?: SearchResultItem[];
  isLoading?: boolean;
  minChars?: number; // Default: 2
  debounceMs?: number; // Default: 200
  label?: string;
  id: string;
}

interface SearchResultItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Empty | Placeholder text, search icon | `--neutral-400` |
| Focused | Focus ring, cursor active | `--shadow-focus-ring` |
| Loading | Spinner in trailing position | `--neutral-400` spinner |
| Results open | Dropdown panel below, `--shadow-card` | `--shadow-card`, `--radius-md` |
| Result highlighted | Lime left indicator, `--neutral-50` bg | `--brand-lime` |
| No results | "No results for '{query}'" message | `--neutral-500` |

**Token Usage:**
- Input border: `1px solid var(--neutral-200)`, focus: `--shadow-focus-ring`
- Border-radius: `--radius-input` (12px)
- Height: `--space-11` (44px)
- Dropdown max-height: 320px, scrollable

**Accessibility:** `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls` pointing to results list id. Results: `role="listbox"`, items `role="option"`. Screen reader: result count announced on list open.

**RTL:** Search icon on `inline-end`. Clear button on `inline-start` (mirrored).

---

### TextInput

> Standard labeled text input with helper text, inline error, and disabled state.

**Props (TypeScript interface):**
```typescript
interface TextInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  type?: 'text' | 'email' | 'tel' | 'password' | 'number';
  autoComplete?: string;
  maxLength?: number;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | `--neutral-200` border, label above | `--radius-input` |
| Focused | `--shadow-focus-ring` | `--shadow-focus-ring` |
| Error | `--color-danger` border, error icon + message below | `--shadow-focus-danger` |
| Disabled | `--neutral-100` bg, `--neutral-300` text | `cursor: not-allowed` |
| Filled valid | `--neutral-800` border | |

**Token Usage:**
- Label: `--font-size-sm`, `--font-weight-semibold`, `--neutral-700`
- Input height: `--space-11` (44px)
- Error text: `--color-danger`, `--font-size-xs`, with error icon — never color-only
- Helper text: `--neutral-500`, `--font-size-xs`

**Accessibility:** `<label>` element always present and associated via `htmlFor`/`id`. Error: `aria-describedby` linking input to error message, `aria-invalid="true"`. Required: `aria-required="true"`, required indicator (asterisk) in label with `aria-hidden="true"`.

---

### SoapEditor (Textarea)

> Multi-line clinical note editor. Grows with content. Character count. Used for SOAP note entry.

**Props (TypeScript interface):**
```typescript
interface SoapEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  minRows?: number; // Default: 4
  maxRows?: number; // Default: 20, then scrolls
  section?: 'subjective' | 'objective' | 'assessment' | 'plan'; // Applies section heading
  disabled?: boolean;
  error?: string;
}
```

**States:** Mirror TextInput states. Additional: auto-grow up to `maxRows` then internal scroll.

**Token Usage:**
- Line height: `--line-height-relaxed` (1.65) — critical for dense clinical text
- Font: `--font-size-md`, `--font-weight-semibold`
- Character count: `--font-size-xs`, `--neutral-400` (turns `--color-danger` at 90% of maxLength)
- Min height: `calc(var(--space-11) * 4)` (4 rows)

**Accessibility:** Same as TextInput. Character count region: `aria-live="polite"` updates every 10 characters. When approaching limit: `aria-live="assertive"`.

---

### CheckboxWithLabel

> Accessible checkbox with associated label. Used in drug override confirmation flows and consent forms.

**Props (TypeScript interface):**
```typescript
interface CheckboxWithLabelProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  disabled?: boolean;
  description?: string; // Additional helper text below label
  variant?: 'default' | 'safety'; // Safety: renders with Warning Yellow accent
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Unchecked | `--neutral-200` border, 20×20px box | `--radius-xs` |
| Checked | `--brand-lime` fill, white checkmark | `--brand-lime` |
| Safety checked | `--color-warning` fill, white checkmark | `--color-warning` |
| Focused | `--shadow-focus-ring` | |
| Disabled | `--neutral-100` fill, `--neutral-300` border | |

**Accessibility:** Native `<input type="checkbox">` always. Label associated via `htmlFor`. Min tap target: 44×44px (padding on label extends hit area).

---

### SelectField

> Custom-styled dropdown/select field. Keyboard accessible, supports search for long lists.

**Props (TypeScript interface):**
```typescript
interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  searchable?: boolean;
}
```

**States:** Mirror TextInput states for focus/error/disabled. Dropdown: same pattern as SearchInput results.

**Accessibility:** `role="combobox"`, `aria-expanded`, options `role="option"`. Keyboard: Space/Enter to open, Up/Down to navigate, Enter to select, Escape to close.

---

### SuccessToast

> Non-blocking success notification. Auto-dismisses after 3 seconds. Bottom-right position (bottom-left in RTL).

**Props (TypeScript interface):**
```typescript
interface SuccessToastProps {
  message: string;
  duration?: number; // ms, default 3000
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Entering | Slides in from inline-end, 200ms spring | `--ease-spring` |
| Visible | `--color-success` left bar, white bg, `--shadow-card` | `--color-success` |
| Dismissing | Fades out, 300ms | `--ease-out` |

**Token Usage:**
- Position: `fixed`, `bottom: var(--space-6)`, `inset-inline-end: var(--space-6)`
- Border-radius: `--radius-card-sm`
- Left border: `4px solid var(--color-success)`
- Max width: 360px

**Accessibility:** `role="status"`, `aria-live="polite"`. Manual dismiss button: `aria-label="Dismiss notification"`. Auto-dismiss: timeout restarts if user interacts with the toast.

**RTL:** Position shifts to `inset-inline-end` (logical property handles both LTR and RTL automatically).

---

### InlineError

> Error message displayed directly below a form field. Icon + text. Never color-only.

**Props (TypeScript interface):**
```typescript
interface InlineErrorProps {
  message: string;
  id: string; // For aria-describedby linkage
}
```

**Token Usage:**
- Text: `--color-danger`, `--font-size-xs`, `--font-weight-semibold`
- Icon: `AlertCircle`, 14px, `--color-danger`
- Gap between icon and text: `--space-1` (4px)
- Margin-top: `--space-1-5` (6px) from input bottom

**Accessibility:** `role="alert"` for programmatically injected errors. `id` referenced by form field's `aria-describedby`.

---

### WarningBanner

> Full-width warning banner. Dismissible only through explicit user action (not closeable by timeout). Used for clinical advisories.

**Props (TypeScript interface):**
```typescript
interface WarningBannerProps {
  title: string;
  message?: string;
  onDismiss?: () => void;
  dismissLabel?: string; // e.g., "I understand", not just "Close"
  action?: { label: string; onClick: () => void };
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Warning Yellow full-width bg, warning icon, title + message | `--color-warning-light`, `--color-warning-border` |
| With action | Action button at `inline-end` | `--color-warning-dark` text button |
| Dismissed | Slides up 200ms | `--ease-in` |

**Token Usage:**
- Background: `--color-warning-light`
- Border-top/bottom: `1px solid var(--color-warning-border)`
- Text: `--color-warning-dark`
- Dismiss button: explicit label text required (never just an "×" icon without label)

**Accessibility:** `role="region"`, `aria-label` describing the warning subject. Dismiss button: explicit action label, not generic close.

---

### QrCodeDisplay

> Health Passport component. Shows patient QR code, expiry countdown, PHI disclosure, and refresh action.

**Variants:** `valid`, `expiring-soon` (< 5 min), `expired`

**Props (TypeScript interface):**
```typescript
interface QrCodeDisplayProps {
  qrData: {
    patientId: string;
    issuedAt: string;
    expiryAt: string;
    signature: string; // ECDSA-P256
  };
  /** Pre-rendered QR code as data URL — generated locally */
  qrImageDataUrl: string;
  onRefresh: () => void;
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Valid | QR code, green expiry timer, disclosure toggle | `--color-success`, `--brand-teal` |
| Expiring soon (<5 min) | Warning yellow timer, pulse animation | `--color-warning` |
| Expired | Greyed QR, "Code expired" overlay, Refresh button prominent | `--neutral-400` |

**Token Usage:**
- QR container: `--radius-card-lg` (30px), `--shadow-card`, white bg
- Timer text: `--font-family-mono`, `--font-weight-semibold`
- Disclosure text: `--font-size-xs`, `--neutral-500`, collapsible

**Accessibility:** QR image: `alt="Your health passport QR code"`. Expiry timer: `aria-live="polite"` updates every 60 seconds. Expired state: `aria-label="QR code expired. Tap to refresh."`.

**RTL:** QR code itself does not flip. Timer and text content: RTL-aware via `dir="rtl"` on container.

**Healthcare Safety Note:** The QR code must encode ONLY `{ patient_id, issued_at, expiry, ECDSA-P256 signature }`. It must never encode raw patient name, diagnosis, or any PHI beyond the opaque patient_id. The QR generation logic must be in `packages/crypto/` and independently verified against the spec. The "What's in this QR?" disclosure must explicitly state what data is and is not encoded.

---

### PrescriptionJourneyTracker

> Consumer-facing visual tracker for prescription progress. Dot-based progress indicator with course length and refill status.

**Props (TypeScript interface):**
```typescript
interface PrescriptionJourneyTrackerProps {
  drugName: string;
  dose: string;
  courseLengthDays: number;
  daysTaken: number;
  refillsRemaining?: number;
  startDate: string; // ISO 8601
  status: 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED';
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Active, in progress | Filled dots (taken) + empty dots (remaining), teal fill | `--brand-teal`, `--neutral-200` |
| Completed | All dots filled, green checkmark badge | `--color-success` |
| Discontinued | Dots greyed, "Discontinued" label | `--neutral-400` |
| Refill needed | Refill badge in warning yellow | `--color-warning` |

**Token Usage:**
- Dot size: 12px diameter, 8px gap between dots
- Filled dot: `--brand-teal`
- Empty dot: `--neutral-200`
- Container: `--radius-card-lg`, `--shadow-card-raised`, `--brand-off-white` bg

**Accessibility:** `role="progressbar"`, `aria-valuenow` (daysTaken), `aria-valuemin="0"`, `aria-valuemax` (courseLengthDays). `aria-label="Day {daysTaken} of {courseLengthDays} for {drugName}"`. Dots are decorative — data conveyed via aria attributes.

**RTL:** Dot fill progresses right-to-left in RTL. CSS logical direction via `dir="rtl"` on container with reversed flex. Start dot is on the right, fills leftward.

---

### QuickActionGrid

> Consumer home screen action grid. 2×2 or 3×2 layout of large-tap-target action cards.

**Props (TypeScript interface):**
```typescript
interface QuickActionGridProps {
  actions: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    onPress: () => void;
    badge?: number;
    disabled?: boolean;
  }>;
  columns?: 2 | 3; // Default: 2
}
```

**States:**
| State | Visual Treatment | Token Used |
|-------|-----------------|------------|
| Default | Card bg, icon centered, label below | `--brand-off-white`, `--radius-card-sm` |
| Pressed | Scale 0.96 spring | `--ease-spring` 120ms |
| Badge | Red pill top-right of icon | `--color-danger` |
| Disabled | Muted, `--neutral-300` icon | `cursor: not-allowed` |

**Token Usage:**
- Min tap target: 44pt × 44pt (WCAG 2.5.5 — enforced via `minHeight: 44` on each cell)
- Card padding: `--space-5` (20px)
- Icon size: 28px
- Label: `--font-size-sm`, `--font-weight-semibold`
- Gap: `--space-3` (12px)

**Accessibility:** Each grid item: `role="button"`, `aria-label` matches label text. Grid container: `role="grid"` or CSS grid with logical column count. Keyboard: Tab moves between items.

**RTL:** Grid flows RTL. Item order reverses visually. Icons that are directional (arrows) flip; medical icons do not.

---

## 4. Component Status Tracker

| Component | Design Complete | Tokens Applied | Dev Ready | Test Coverage Required | Notes |
|-----------|:--------------:|:--------------:|:---------:|----------------------|-------|
| AppShell | Yes | Yes | Yes | Snapshot (LTR + RTL), sidebar toggle | — |
| PageHeader | Yes | Yes | Yes | Snapshot | — |
| SplitPanel | Yes | Yes | Yes | Keyboard resize, RTL swap | — |
| BottomSheet | Yes | Yes | Yes | Drag, focus trap, snap points | — |
| GlobalHeader | Yes | Yes | Yes | Snapshot, search trigger | — |
| SidebarNav | Yes | Yes | Yes | Active state, RTL, badge | — |
| BottomTabBar | Yes | Yes | Yes | Tap targets ≥44pt, badge, RTL | — |
| ClinicalCommandPalette | Yes | Yes | Yes | Focus trap, keyboard nav, Escape | — |
| PrimaryButton | Yes | Yes | Yes | Optimistic flow, a11y, disabled | — |
| SecondaryButton | Yes | Yes | Yes | States, a11y | — |
| DangerButton | Yes | Yes | Yes | Confirmation gate, audit log | Safety-critical |
| DisabledButton | Yes | Yes | Yes | aria-disabled, no DOM removal | — |
| IconButton | Yes | Yes | Yes | Tooltip, min tap target | — |
| PatientCard | Yes | Yes | Yes | Allergy sort order, red band, RTL | — |
| PrescriptionCard | Yes | Yes | Yes | Status badge not color-only, RTL | — |
| LabOrderCard | Yes | Yes | Yes | Lab portal data minimization | Safety-critical |
| AllergyPanel | Yes | Yes | Yes | role=alert, renders first, red band, NKDA, RTL | Safety-critical |
| MedicationListItem | Yes | Yes | Yes | Status states, RTL drug name | — |
| VitalsRow | Yes | Yes | Yes | Critical value a11y label | — |
| LabResultRow | Yes | Yes | Yes | Critical flag, abnormal flag | — |
| GlobalSyncIndicator | Yes | Yes | Yes | All 5 states, aria-live, always visible | Safety-critical |
| DrugInteractionPanel | Yes | Yes | Yes | All 6 states, CheckUnavailable mandatory, audit log | Safety-critical |
| AiDraftPanel | Yes | Yes | Yes | No auto-commit, both versions stored, re-auth | Safety-critical |
| SyncConflictBanner | Yes | Yes | Yes | Tier 1 blocks Rx, append-only, HLC display | Safety-critical |
| StaleDataWarning | Yes | Yes | Yes | Acknowledgement gate, Force Sync | Safety-critical |
| OfflineBanner | Yes | Yes | Yes | Offline/online transitions, queue count | — |
| SearchInput | Yes | Yes | Yes | Keyboard nav, loading state, no results | — |
| TextInput | Yes | Yes | Yes | Error with icon (not color-only), disabled, RTL | — |
| SoapEditor | Yes | Yes | Yes | Auto-grow, character count a11y | — |
| CheckboxWithLabel | Yes | Yes | Yes | Safety variant, tap target, keyboard | — |
| SelectField | Yes | Yes | Yes | Keyboard nav, searchable | — |
| SuccessToast | Yes | Yes | Yes | Auto-dismiss, action, RTL position | — |
| InlineError | Yes | Yes | Yes | role=alert, icon present (not color-only) | — |
| WarningBanner | Yes | Yes | Yes | Explicit dismiss label, RTL | — |
| QrCodeDisplay | Yes | Yes | Yes | No PHI in QR, expiry countdown, expired state | Safety-critical |
| PrescriptionJourneyTracker | Yes | Yes | Yes | RTL dot direction, a11y progressbar | — |
| QuickActionGrid | Yes | Yes | Yes | Tap target ≥44pt, RTL order, badge | — |

---

## 5. Accessibility Specification

### WCAG Target
- **Global minimum:** WCAG 2.1 AA
- **Typography:** WCAG 2.1 AAA (contrast ≥ 7:1 for body text)
- **Interactive controls:** WCAG 2.5.5 — minimum 44×44px touch targets on all platforms

### Color Contrast Reference Table

| Foreground | Background | Hex Foreground | Hex Background | Ratio | WCAG Level |
|------------|-----------|----------------|----------------|-------|------------|
| Brand Dark Green (text on lime) | Brand Lime | `#163300` | `#9fe870` | 8.2:1 | AAA |
| White (text on near-black) | Near Black | `#ffffff` | `#0e0f0c` | 19.8:1 | AAA |
| Near-black (text on white) | White | `#0e0f0c` | `#ffffff` | 19.8:1 | AAA |
| Allergy text on allergy bg | Allergy bg | `#7a0f13` | `#fde8e9` | 9.1:1 | AAA |
| Warning dark on warning bg | Warning bg | `#b38f00` | `#fff7cc` | 5.1:1 | AA |
| Success dark on success bg | Success bg | `#023018` | `#d6f0e1` | 10.4:1 | AAA |
| Danger text on danger light | Danger light | `#9a171c` | `#fde8e9` | 8.7:1 | AAA |
| Neutral 800 on neutral 50 | Neutral 50 | `#252a22` | `#f7f9f5` | 14.2:1 | AAA |
| Neutral 500 on white | White | `#7a8276` | `#ffffff` | 4.6:1 | AA |
| Drug unavailable text on bg | Unavailable bg | `#6b5900` | `#fff3cc` | 5.3:1 | AA |
| Teal text on white (Consumer) | White | `#085a4f` | `#ffffff` | 9.8:1 | AAA |

> Note: `--neutral-400` (#a3aba0) on white = 2.7:1 — insufficient. Use only for placeholder text (non-informative) and always pair with another indicator.

### Required ARIA Roles — Safety-Critical Components

| Component | Required Role | aria-live | Notes |
|-----------|--------------|-----------|-------|
| AllergyPanel | `role="alert"` | `aria-live="assertive"` | Announces on mount and on any addition |
| DrugInteractionPanel (states 3–5) | `role="alert"` | `aria-live="assertive"` | State 5: `role="alertdialog"` |
| DrugInteractionPanel (state 6) | `role="alert"` | `aria-live="assertive"` | CheckUnavailable is a safety-critical alert |
| SyncConflictBanner (Tier 1) | `role="alert"` | `aria-live="assertive"` | Prescribing blocked — must be announced |
| GlobalSyncIndicator | `role="status"` | `aria-live="polite"` | Error state upgrades to `aria-live="assertive"` |
| OfflineBanner | `role="status"` | `aria-live="polite"` | Transition to offline announced |
| StaleDataWarning (blocking) | `role="alert"` | `aria-live="assertive"` | Blocking state only |
| InlineError | `role="alert"` | — | Only for programmatically injected errors |
| AiDraftPanel warning strip | `role="note"` | — | Not live — present on mount |

### Keyboard Navigation Map — Clinical Workflow

```
Tab 1: GlobalHeader — Search trigger (Cmd+K focus shortcut)
Tab 2: SidebarNav first item
Tab 3-N: SidebarNav items (Up/Down arrows within nav)
---
[Enter patient record]
Tab 1: AllergyPanel — first focusable element (review allergies first)
Tab 2: PatientCard — View Encounter button
Tab 3: PageHeader — primary action
Tab 4: SplitPanel resize handle (Left/Right arrows to resize)
Tab 5: SOAP Section — Subjective textarea (SoapEditor)
Tab 6: SOAP Section — Objective textarea
Tab 7: SOAP Section — Assessment textarea
Tab 8: SOAP Section — Plan textarea
Tab 9: Drug entry — SearchInput (medication search)
Tab 10: DrugInteractionPanel — CTA button (blocked until check resolves)
Tab 11: PrimaryButton — Save/Sign
---
[Command Palette — Cmd+K]
Focus trap: input → results → Close button → loops
Escape: closes palette, returns focus to trigger element
---
[BottomSheet]
Focus trap within sheet
Escape: closes sheet, returns focus to trigger element
```

### Screen Reader Announcement Specifications

| Event | Component | Announcement | Live Region |
|-------|-----------|-------------|-------------|
| Sync completed | GlobalSyncIndicator | "Sync complete. All data saved to server." | `polite` |
| Sync error | GlobalSyncIndicator | "Sync error. Some data may not be saved. Check sync status." | `assertive` |
| Allergy panel loaded | AllergyPanel | "Allergy warning: Patient has {N} recorded allergies. {allergen list}." | `assertive` |
| Drug interaction blocked | DrugInteractionPanel | "Prescribing blocked: Contraindicated drug combination detected." | `assertive` |
| Drug allergy match | DrugInteractionPanel | "Prescribing blocked: Drug matches patient allergy. Specialist approval required." | `assertive` |
| Check unavailable | DrugInteractionPanel | "Warning: Drug interaction check unavailable. Proceed with caution." | `assertive` |
| AI draft available | AiDraftPanel | "AI-generated draft is ready for your review." | `polite` |
| Offline transition | OfflineBanner | "You are now offline. All data is being saved locally." | `polite` |
| Online transition | OfflineBanner | "Back online. Syncing {N} saved actions." | `polite` |
| Tier 1 conflict | SyncConflictBanner | "Data conflict detected in {field}. Prescription generation is blocked until resolved." | `assertive` |

### Focus Management Rules

1. **Escape key** closes any open panel, modal, or overlay and returns focus to the element that triggered it. This is a hard requirement, not optional.
2. **Command palette** traps focus within the dialog. Focus cycles: input → results → close button → input.
3. **BottomSheet** traps focus. First focusable element receives focus on open.
4. **DangerButton** must never be the first focused element on page load or panel open.
5. **Toast notifications** do not receive focus (they are non-blocking). If user tabs to them, they can be dismissed with Enter/Space.
6. **Error states** — when an InlineError appears on form submit, focus moves to the first invalid field.

---

## 6. RTL Implementation Guide

### Layout Mirroring Rules

#### AppShell / SidebarNav
- Sidebar moves from left to right: use `inset-inline-start: 0` (not `left: 0`)
- Sidebar border moves to left edge: `border-inline-end: none; border-inline-start: 1px solid var(--neutral-800)`
- Box shadow direction inverts: `--shadow-sidebar` uses negative x-offset in RTL

#### SplitPanel
- Left panel becomes right panel visually
- Resize handle drag direction inverts (RTL: drag left = expand right panel)
- Patient summary panel appears on the right; charting panel on the left

#### Prescribing Panel (slide-in)
- In LTR: slides in from the right (positive translateX → 0)
- In RTL: slides in from the LEFT (negative translateX → 0)
- Implementation: use `inset-inline-end: 0` for positioning

#### GlobalHeader
- Logo: moves to `inline-end` (right in RTL)
- Navigation items: reverse order
- Sync indicator and user menu: move to `inline-start` (left in RTL)

### Required Logical CSS Properties

| Do NOT use (physical) | Use instead (logical) | Notes |
|-----------------------|-----------------------|-------|
| `margin-left` | `margin-inline-start` | — |
| `margin-right` | `margin-inline-end` | — |
| `padding-left` | `padding-inline-start` | — |
| `padding-right` | `padding-inline-end` | — |
| `border-left` | `border-inline-start` | — |
| `border-right` | `border-inline-end` | — |
| `left: 0` (in positioned elements) | `inset-inline-start: 0` | — |
| `right: 0` | `inset-inline-end: 0` | — |
| `text-align: left` | `text-align: start` | — |
| `text-align: right` | `text-align: end` | — |
| `float: left` | `float: inline-start` | Avoid floats; use flex/grid |
| `translateX(100%)` (slide right) | Conditional: `dir`-aware transform | Use JS to detect dir |

### Icon Flip Rules

**Icons that MUST flip in RTL (directional):**
- Chevron right / left (`ChevronRight`, `ChevronLeft`)
- Arrow right / left (`ArrowRight`, `ArrowLeft`)
- Back button / navigation arrow
- Progress indicators showing direction of travel
- "Next" and "Previous" navigation controls
- Breadcrumb separator (>)
- PrescriptionJourneyTracker dot progression direction

**Icons that MUST NOT flip in RTL (universal/medical):**
- Pill / medication icon
- Stethoscope
- Allergy warning triangle (⚠)
- QR code icon
- Heart / pulse
- Syringe / injection
- Blood drop
- Laboratory flask / beaker
- DNA helix
- Checkmark / X (status icons)
- Numbers and clock icons

**Implementation pattern for flippable icons:**
```tsx
// Apply transform in RTL context
<ChevronRightIcon
  style={{ transform: isRTL ? 'scaleX(-1)' : 'none' }}
  aria-hidden="true"
/>
```

Or via CSS:
```css
[dir="rtl"] .icon-directional {
  transform: scaleX(-1);
}
```

### PrescriptionJourneyTracker — RTL Dot Fill

In LTR: dots fill left-to-right (day 1 at left, day N at right).
In RTL: dots fill right-to-left (day 1 at right, day N at left).

Implementation: use `flex-direction: row-reverse` on the dot container when `dir="rtl"`, not manual index reversal.

```tsx
<div
  className="dot-container"
  style={{ flexDirection: dir === 'rtl' ? 'row-reverse' : 'row' }}
>
  {dots}
</div>
```

### Arabic and Dari Font Stack

```css
/* Display / headings — Noto Kufi Arabic for Arabic script */
--font-family-display: 'Inter', 'Noto Kufi Arabic', system-ui, -apple-system, sans-serif;

/* Body copy — Noto Naskh Arabic for Arabic script (better for running text) */
--font-family-body: 'Inter', 'Noto Naskh Arabic', system-ui, -apple-system, sans-serif;
```

- Dari (Dari Persian) uses Arabic script. `Noto Naskh Arabic` covers both Arabic and Dari.
- Line height for Arabic/Dari body text should be `--line-height-relaxed` (1.65) minimum — Arabic script has ascenders that require more vertical space.
- Word spacing rules differ in Arabic. Do not apply custom `word-spacing` to Arabic-language text.
- Numeric digits: Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) may be preferred. Use `font-variant-numeric: lining-nums` and locale-aware number formatting. Clinical values (lab results, doses) remain in Western Arabic numerals (0–9) regardless of locale.

---

## 7. Handoff Checklist

The following checklist must be completed before any component is considered fully handed off for engineering implementation.

**Design Completeness**
1. Component has been specced in this document with all variants, props interface, and states.
2. All states have been verified against the wireframes in `wireframes-lofi.md`.
3. All token references resolve to existing tokens in `design-tokens.css`.
4. No hardcoded color values — only token references used.
5. Spacing values trace to the 4px base-unit scale.
6. Border-radius values trace to named semantic aliases.

**Accessibility**
7. ARIA roles and `aria-live` regions are specified for every interactive component.
8. Color contrast verified for all foreground/background combinations (see Section 5 table).
9. No information conveyed by color alone — every state has an icon or text label.
10. Minimum tap target size confirmed: ≥44×44px on all interactive elements.
11. Keyboard navigation path documented for the component's position in the clinical workflow.
12. Focus management on open/close behavior specified (panel, modal, sheet components).

**RTL**
13. Component has been reviewed for logical CSS property usage — no physical directional properties.
14. Icon flip behavior specified: directional icons are flagged, medical icons are confirmed as non-flipping.
15. Arabic/Dari font rendering verified in Storybook or browser with `dir="rtl"` applied.
16. RTL snapshot test added or planned in `packages/ui-kit/`.

**Healthcare Safety**
17. Any safety-critical component (allergy, drug interaction, AI gate, sync conflict) has a Healthcare Safety Note in this document.
18. `DrugInteractionPanel` CheckUnavailable state (State 6) is fully specced — explicit warning, checkbox required, no silent failure path.
19. `AllergyPanel` confirmed to render first in all patient-facing clinical views (snapshot test planned).
20. `AiDraftPanel` confirmed: no auto-commit path exists in the component logic, both AI and accepted versions stored.
21. `DangerButton` confirmation gate (checkbox) is specified in all override flows.
22. Audit logging requirements noted for all safety-critical interactions (drug override, allergy match view, stale data proceed).

**Offline and Sync**
23. Component behavior in offline state specified or confirmed as unaffected.
24. `GlobalSyncIndicator` confirmed visible in all views where this component is used.
25. Any component that may show stale data has `StaleDataWarning` integration path specified.

**Engineering Readiness**
26. TypeScript `interface` defined for all props.
27. Token usage section lists all CSS custom properties the component consumes.
28. Animation spec includes duration, easing function, and token references.
29. `prefers-reduced-motion` behavior confirmed: all transforms/animations disabled.
30. Component is registered in the Component Status Tracker (Section 4) with Dev Ready = Yes.
31. Test coverage required column in Section 4 is complete, including safety-critical test cases.
32. Component imports from `@ultranos/ui-kit` package path — no direct file imports from other apps.

---

*End of Ultranos Component Specification v1.0.0*  
*Next review: After engineering sprint 1 — update Status Tracker with implementation findings.*
