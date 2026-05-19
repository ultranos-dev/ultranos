# Admin Portal Visual Rebrand

Full visual rebrand of the admin-portal app, inspired by a bento-grid health dashboard screenshot. Light and dark mode support, collapsible sidebar, new top header bar, two-tier card surface system, and unified component vocabulary across all pages. Zero regressions to logic, routing, auth, or data fetching.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full visual rebrand (option C) | Strongest visual uplift; coherent new identity |
| Color strategy | Dark sidebar + softened warm body | Sidebar anchors navigation; warm canvas invites |
| Theme modes | Manual toggle with system default (option B) | Respects OS preference; gives clinician control |
| Sidebar | Collapsible: 240px labeled default, 64px icon-only collapsed (option A) | Accessible defaults + power-user compactness |
| Surface system | Two-tier: elevated cards for primary content, inline for secondary UI (option B) | Avoids over-carding; creates natural hierarchy |
| Border radius | Generous rounding: `rounded-2xl` to `rounded-3xl` cards, `rounded-full` pills (option A) | Modern, approachable, matches screenshot DNA |

---

## 1. Color System

CSS custom properties on `:root` (light) and `[data-theme="dark"]` (dark). Tailwind consumes via `var(--color-*)`. No `dark:` prefix usage anywhere; theme changes propagate automatically through variable switching.

### Light Mode

| Token | OKLCH Value | Usage |
|-------|-------------|-------|
| `canvas` | `oklch(0.97 0.005 100)` | Page background (warm off-white) |
| `surface` | `oklch(0.99 0.003 100)` | Card/panel backgrounds |
| `surface-raised` | `oklch(1.0 0 0)` + `shadow-sm` | Elevated cards (stats, table wrappers) |
| `sidebar` | `oklch(0.18 0.01 150)` | Sidebar background (deep charcoal-green) |
| `text-primary` | `oklch(0.15 0.005 100)` | Headings, body text |
| `text-secondary` | `oklch(0.45 0.005 100)` | Labels, muted copy |
| `text-on-dark` | `oklch(0.92 0.005 100)` | Text on sidebar/dark surfaces |
| `accent` | `oklch(0.82 0.19 128)` | Primary actions, active nav, focus rings (~Wise Green) |
| `accent-hover` | `oklch(0.87 0.15 128)` | Hover state for accent elements |
| `accent-subtle` | `oklch(0.82 0.19 128 / 0.1)` | Tinted backgrounds for active states |
| `border` | `oklch(0.90 0.005 100)` | Card borders, dividers |
| `danger` | `oklch(0.63 0.2 25)` | Error states, destructive actions |
| `warning` | `oklch(0.75 0.15 70)` | Caution states |
| `success` | `oklch(0.72 0.17 145)` | Positive states |

### Dark Mode

| Token | OKLCH Value | Usage |
|-------|-------------|-------|
| `canvas` | `oklch(0.14 0.008 150)` | Page background (dark green-tinted) |
| `surface` | `oklch(0.18 0.01 150)` | Card backgrounds |
| `surface-raised` | `oklch(0.22 0.01 150)` + subtle border | Elevated cards |
| `sidebar` | `oklch(0.11 0.01 150)` | Sidebar (darker than canvas) |
| `text-primary` | `oklch(0.92 0.005 100)` | Headings, body |
| `text-secondary` | `oklch(0.60 0.005 100)` | Labels, muted |
| `text-on-dark` | `oklch(0.92 0.005 100)` | Same as text-primary in dark mode |
| `accent` | `oklch(0.82 0.19 128)` | Same lime across both modes |
| `accent-hover` | `oklch(0.87 0.15 128)` | Same |
| `accent-subtle` | `oklch(0.82 0.19 128 / 0.1)` | Same |
| `border` | `oklch(0.25 0.008 150)` | Subtle dividers |
| `danger` | `oklch(0.63 0.2 25)` | Same hue, works on dark bg |
| `warning` | `oklch(0.75 0.15 70)` | Same |
| `success` | `oklch(0.72 0.17 145)` | Same |

### Principle

Accent lime stays identical across themes. Every neutral is warm-tinted toward the brand hue (chroma 0.005-0.01). No pure `#000` or `#fff` anywhere.

---

## 2. Layout

### Page Shell

```
+----------------------------------------------------+
| Sidebar (240/64px) |  Top Header (sticky, h-16)     |
|                    |--------------------------------|
|  Logo              |                                |
|  -----             |  Content Area                  |
|  Nav items         |  - max-w-7xl centered          |
|                    |  - px-8 py-6                   |
|                    |  - scrollable                  |
|                    |                                |
|  -----             |                                |
|  Collapse toggle   |                                |
+----------------------------------------------------+
```

- Sidebar: fixed position, full viewport height
- Content area: `flex-1`, scrollable independently
- Max content width: `max-w-7xl` (1280px) centered with auto margins
- Sidebar collapse animates at 200ms ease-out

### Sidebar (Expanded: 240px)

| Property | Value |
|----------|-------|
| Background | `sidebar` token |
| Nav text inactive | `text-on-dark` at 60% opacity |
| Nav text active | `accent` color, full opacity |
| Nav item active | `accent-subtle` bg + 2px `border-inline-start` in accent |
| Nav item hover | `white/8%` background |
| Nav item shape | `rounded-xl`, `px-3 py-2.5` |
| Logo | "U" in accent + "ltranos" in `text-on-dark`. Collapsed: "U" only, centered |
| Bottom | Collapse toggle chevron only |
| Section dividers | `white/10%` horizontal rule |

### Sidebar (Collapsed: 64px)

Icons only, centered. Tooltip on hover shows label. Collapse toggle and logo glyph stack vertically.

### Top Header Bar

| Property | Value |
|----------|-------|
| Height | `h-16` (64px) |
| Background | `surface` |
| Bottom border | `border-b border-border` |
| Position | Sticky top of content area |
| Padding | `px-8` matching content |
| Layout | `flex items-center justify-between` |

**Left side:** Page title (`text-2xl font-semibold tracking-tight`) + description (`text-sm text-secondary`).

**Right side (left to right):**

| Element | Size | Design | Behavior |
|---------|------|--------|----------|
| Search | 36px circle | `surface-raised` bg, `border`, magnifying glass icon | Command palette overlay (or placeholder) |
| Notifications | 36px circle | Same treatment, bell icon | Badge dot in accent when unread. Dropdown panel. |
| Theme toggle | 36px circle | Sun/moon icon | Toggles light/dark, persists to localStorage |
| Date | Text | `text-secondary text-sm` | "Mon, 19 May" format. Hides on narrow viewports. |
| User avatar | 36px circle | Initials on `accent-subtle` bg, accent text | Dropdown: name, role, org, divider, Settings, Sign Out |

Quick-action circles: `rounded-full`, hover transitions to `accent-subtle` bg, 200ms transition.

---

## 3. Component Vocabulary

### Two-Tier Surface System

**Tier 1 -- Elevated Cards** (primary content containers):

| Property | Light | Dark |
|----------|-------|------|
| Background | `surface-raised` | `surface-raised` |
| Border | `border` token, 1px | `border` token, 1px |
| Shadow | `shadow-sm` (warm-tinted) | None (border only) |
| Radius | `rounded-2xl` (16px) | Same |
| Padding | `p-6` | Same |

Used for: stat cards, table wrappers, detail panels, modal bodies.

**Tier 2 -- Inline Elements** (no card wrapper):

Filter pill bars, pagination, breadcrumbs, page headers, empty states. Sit directly on canvas. Grouped by spacing and typography.

### Dashboard Stat Cards

Varied card treatments instead of identical hero-metric pattern:

| Card Type | Treatment |
|-----------|-----------|
| **Primary KPI** | 2-col span. `text-3xl font-semibold` number. `accent-subtle` bg tint. Optional sparkline. |
| **Secondary stats** | Standard card. `text-xl font-semibold` number. `text-secondary text-sm` label. Optional delta badge. |
| **Status/alert card** | Standard card. 2px `border-inline-start` in danger/warning when value > 0. Number + label + link to filtered view. |

Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. Primary KPI spans `sm:col-span-2`.

### Tables

| Property | Light | Dark |
|----------|-------|------|
| Wrapper | Tier 1 card | Same minus shadow |
| Header row bg | `surface` (warm gray, NOT black) | `surface` |
| Header text | `text-secondary text-xs font-medium uppercase tracking-wide` | Same |
| Body rows | `surface-raised` | `surface-raised` |
| Row divider | `border-b border-border` | Same |
| Row hover | `accent-subtle` bg | Same |
| SLA-breached rows | `danger` bg at 5%, danger text | Same |

### Buttons

| Variant | Shared | Light | Dark |
|---------|--------|-------|------|
| **Primary** | `rounded-full px-5 py-2.5 text-sm font-medium` | `accent` bg, near-black text | Same |
| **Secondary** | `rounded-full px-5 py-2.5 text-sm font-medium` | `surface-raised` bg, `border`, `text-primary` | `surface` bg, `border`, `text-primary` |
| **Ghost** | `rounded-xl px-5 py-2.5 text-sm font-medium` | Transparent, `text-secondary`, hover `accent-subtle` | Same |
| **Danger** | `rounded-full px-5 py-2.5 text-sm font-medium` | `danger` at 10% bg + danger text; hover 100% bg + white text | Same |

Primary only: `hover:scale-[1.02]`. All: `transition-colors duration-200 ease-out`.

### Filter Pills

| Property | Light | Dark |
|----------|-------|------|
| Container | `surface` bg, `rounded-full`, `p-1` | `surface` bg |
| Active pill | `accent` bg, near-black text | Same |
| Inactive pill | `text-secondary`, hover `text-primary` | Same |

### Status Badges

| Status | Treatment (both modes) |
|--------|----------------------|
| Active/Success | `success` at 10% bg, `success` text |
| Pending/Warning | `warning` at 10% bg, `warning` text |
| Rejected/Error | `danger` at 10% bg, `danger` text |

All: `rounded-full px-2.5 py-0.5 text-xs font-medium`.

### Form Inputs

| Property | Light | Dark |
|----------|-------|------|
| Background | `surface-raised` | `surface` |
| Border | `border` token | `border` token |
| Focus | `accent` ring (2px), `accent-subtle` border | Same |
| Radius | `rounded-xl` | Same |
| Text | `text-primary` | `text-primary` |
| Placeholder | `text-secondary` at 50% opacity | Same |

### Modals/Dialogs

| Property | Value |
|----------|-------|
| Overlay | `black/50%` backdrop |
| Container | `surface-raised`, `rounded-2xl`, `shadow-xl`, `max-w-md`, `p-6` |
| Header | `text-lg font-semibold` + ghost close button (X icon) |
| Footer | Right-aligned: secondary + primary buttons |

---

## 4. Typography

Single family: **Inter**. Tighter scale ratio (~1.2) appropriate for product UI.

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `display` | `text-3xl` (30px) | 600 | 1.2 | Primary KPI number only |
| `heading-1` | `text-2xl` (24px) | 600 | 1.3 | Page titles |
| `heading-2` | `text-lg` (18px) | 600 | 1.4 | Section headings, card titles |
| `heading-3` | `text-base` (16px) | 600 | 1.5 | Sub-sections |
| `body` | `text-sm` (14px) | 400 | 1.5 | Default text, table cells |
| `body-medium` | `text-sm` (14px) | 500 | 1.5 | Emphasis, nav labels |
| `caption` | `text-xs` (12px) | 500 | 1.5 | Table headers, badges, metadata |
| `stat-value` | `text-xl` (20px) | 600 | 1.2 | Secondary stat card numbers |

Key changes: page titles `text-4xl` -> `text-2xl`. `wavy-divider` removed.

---

## 5. Spacing

| Context | Value |
|---------|-------|
| Content area padding | `px-8 py-6` |
| Between page sections | `mt-8` |
| Between related elements | `mt-4` |
| Card internal padding | `p-6` |
| Table cell padding | `px-4 py-3` |
| Nav item padding | `px-3 py-2.5` |
| Stat card grid gap | `gap-4` |
| Nav item gap | `gap-1` |

Rhythm rule: alternate `mt-4` (tight/related) and `mt-8` (section break).

---

## 6. Transitions & Motion

- Interactive elements: `transition-colors duration-200 ease-out`. Never `transition-all`.
- Sidebar collapse: `transition-[width] duration-200 ease-out` + `transition-opacity duration-150` on labels.
- Primary button hover: `hover:scale-[1.02]` with `transition-transform duration-200`.
- No bounce, elastic, or orchestrated page-load sequences.

---

## 7. Theme Toggle Implementation

### Strategy

`data-theme` attribute on `<html>`. CSS variables switch on `[data-theme="dark"]`.

### Logic

1. On load: read `localStorage.getItem('theme')`
2. If null: read `window.matchMedia('(prefers-color-scheme: dark)')`, apply result
3. If found: apply stored preference
4. On toggle: flip `data-theme` attribute, persist to localStorage
5. Script in `<head>` (blocking) prevents flash of wrong theme

### Tailwind Integration

```css
:root {
  --color-canvas: oklch(0.97 0.005 100);
  --color-surface: oklch(0.99 0.003 100);
  /* ... all light tokens */
}

[data-theme="dark"] {
  --color-canvas: oklch(0.14 0.008 150);
  --color-surface: oklch(0.18 0.01 150);
  /* ... all dark tokens */
}
```

```ts
// tailwind.config.ts
colors: {
  canvas: 'var(--color-canvas)',
  surface: 'var(--color-surface)',
  'surface-raised': 'var(--color-surface-raised)',
  // ... all tokens
}
```

Components use `bg-canvas`, `text-primary`, `border-border`. No `dark:` prefixes.

---

## 8. File Change Manifest

### New files

| File | Purpose |
|------|---------|
| `src/components/TopHeader.tsx` | Header bar: title, search, notifications, theme toggle, avatar |
| `src/components/ThemeToggle.tsx` | Sun/moon button, localStorage + matchMedia logic |
| `src/components/SidebarToggle.tsx` | Chevron button for collapse/expand (optional: may inline in Sidebar) |

### Modified files

| File | Change |
|------|--------|
| `tailwind.config.ts` | Replace hardcoded colors with CSS variable references |
| `src/app/globals.css` | Add `:root` + `[data-theme="dark"]` variable blocks. Remove `wavy-divider`. |
| `src/app/layout.tsx` | Add blocking theme script in `<head>`, `data-theme` on `<html>` |
| `src/components/Sidebar.tsx` | Collapsible rewrite: new colors, tooltip labels, collapse toggle |
| `src/components/AuthGuard.tsx` | Update shell layout: sidebar + header + content structure |
| `src/app/dashboard/page.tsx` | Restyle stat cards (varied treatment, new tokens) |
| `src/app/providers/page.tsx` | Restyle table, filter pills, badges |
| `src/app/providers/[submissionId]/page.tsx` | Restyle detail view |
| `src/app/providers/expiry/page.tsx` | Restyle table |
| `src/app/labs/page.tsx` | Restyle table, filter pills, badges |
| `src/app/labs/[labId]/page.tsx` | Restyle detail view |
| `src/app/alerts/page.tsx` | Restyle tabs, metric cards, tables |
| `src/app/alerts/[alertId]/page.tsx` | Restyle detail view |
| `src/app/ai-models/page.tsx` | Restyle page |
| `src/app/audit/page.tsx` | Restyle table |
| `src/app/settings/page.tsx` | Restyle form, security key cards |
| `src/app/subscriptions/page.tsx` | Restyle cards, dialogs |
| `src/app/login/page.tsx` | Restyle card, form, theme-aware |
| `src/app/register/page.tsx` | Restyle multi-step form |
| `src/app/page.tsx` | Restyle landing page, theme-aware |
| `src/components/providers/RenewLicenseModal.tsx` | Restyle modal |
| `src/components/subscriptions/AddModuleDialog.tsx` | Restyle dialog |
| `src/components/subscriptions/RemoveModuleDialog.tsx` | Restyle dialog |
| `src/components/registration/AdminCredentialsStep.tsx` | Restyle form step |
| `src/components/registration/ModuleSelectionStep.tsx` | Restyle form step |
| `src/components/registration/OrgDetailsStep.tsx` | Restyle form step |

### Unchanged

- All page logic, tRPC calls, Zustand stores, data fetching
- Route structure and auth flows (FIDO2, sessions)
- Component hierarchy (no structural refactoring beyond sidebar/header)
- Shared packages (`packages/ui-kit`, `packages/shared-types`, etc.)
