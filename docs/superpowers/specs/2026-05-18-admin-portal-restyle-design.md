# Admin Portal Restyle — Design Spec

## Goal

Restyle the entire Admin Portal (`apps/admin-portal/`) to match the eHealth PMR design guide (`sample-ui-guide.md`). Transfer the visual identity — color palette, typography, border-radius scale, button shapes, card styles — while preserving admin-appropriate layout patterns (sidebar nav, data tables, forms). Zero functional regressions.

## Approach

**Design language transfer (Option B):** Adopt the guide's visual identity but keep admin-appropriate structural patterns. No bottom navigation docks, no swipeable carousels, no map overlays. Status colors preserved for healthcare safety.

---

## 1. Color System

### Primary Palette

| Token | Value | CSS Variable | Usage |
|-------|-------|-------------|-------|
| Brand Lime | `#D4FF00` | `--color-brand-lime` | Primary CTAs, active states, key highlights, dashboard accent cards |
| Deep Black | `#000000` | `--color-deep-black` | Sidebar bg, heavy typography, dark card variant, table headers |
| Pure White | `#FFFFFF` | `--color-pure-white` | Page backgrounds, primary surface cards, negative text |

### Neutral Palette

| Token | Value | CSS Variable | Usage |
|-------|-------|-------------|-------|
| Surface Gray | `#F3F4F6` | `--color-surface` | Page background, secondary card bg, inactive elements |
| Border Gray | `#E5E7EB` | `--color-border` | Dividers, table cell borders, inactive ticks |
| Text Muted | `#6B7280` | `--color-text-muted` | Secondary text, timestamps, sublabels, placeholders |
| Success Green | `#A3E635` | `--color-success-green` | Verified badges, active status dots (sparingly) |

### Status Colors (Preserved)

Status colors are a safety affordance in this healthcare admin context. They keep their semantic meaning but get restyled as pills.

| Status | Background | Text | Usage |
|--------|-----------|------|-------|
| Pending/Unreviewed | `bg-amber-100` | `text-amber-800` | KYC pending, lab pending |
| Active/Approved | `bg-green-100` | `text-green-800` | Active providers, approved labs |
| Rejected/Suspended | `bg-red-100` | `text-red-800` | Rejected KYC, suspended providers |
| Escalated | `bg-purple-100` | `text-purple-800` | Escalated alerts |
| Dismissed | `bg-neutral-100` | `text-neutral-600` | Dismissed alerts |
| High Severity | `bg-red-100` | `text-red-800` | Critical alerts |
| Medium Severity | `bg-orange-100` | `text-orange-800` | Warning alerts |

### Button Colors

| Variant | Background | Text | Hover |
|---------|-----------|------|-------|
| Primary | `#D4FF00` | `#000000` | `brightness-95` + `scale-[1.02]` |
| Secondary | `#FFFFFF` | `#000000` | `bg-neutral-50` + `scale-[1.02]` |
| Danger | `bg-red-600` | `#FFFFFF` | `bg-red-700` + `scale-[1.02]` |
| Ghost | transparent | `#6B7280` | `bg-neutral-50` |

---

## 2. Typography

**Font Family:** Inter (already in use — matches guide's Neo-Grotesque recommendation).

| Level | HTML | Weight | Size (Desktop) | Tracking | Line Height |
|-------|------|--------|----------------|----------|-------------|
| Display | h1 | Bold (700) | 36px (`text-4xl`) | `-0.02em` | 1.1 |
| Section | h2 | Semi-Bold (600) | 24px (`text-2xl`) | Normal | 1.2 |
| Card Title | h3 | Medium (500) | 18px (`text-lg`) | Normal | 1.3 |
| Body | p | Regular (400) | 14-16px (`text-sm`/`text-base`) | Normal | 1.5 |
| Micro | span | Medium (500) | 11px (`text-xs`) | Normal | 1.4 |

### Decorative Detail

Wavy divider (`〰` rendered as a small SVG or styled `<hr>`) beneath h1 page titles on major pages: Dashboard, Providers, Labs, Alerts, Audit, AI Models. Black color, approximately 40px wide, 2px stroke.

---

## 3. Border Radius Scale

| Element | Current | New |
|---------|---------|-----|
| Cards (standard) | `rounded-md` / `rounded-lg` (6-8px) | `rounded-3xl` (24px) |
| Dashboard stat cards | `rounded-lg` (8px) | `rounded-3xl` (24px) |
| Buttons | `rounded-md` (6px) | `rounded-full` (9999px) — pill shape |
| Status badges | `rounded` / `rounded-md` | `rounded-full` (9999px) — pill shape |
| Table containers | none / `rounded-lg` | `rounded-2xl` (16px) with `overflow-hidden` |
| Inputs | `rounded-md` (6px) | `rounded-xl` (12px) |
| Modals/Dialogs | `rounded-lg` (8px) | `rounded-3xl` (24px) |
| Icon buttons | varied | `rounded-full` (circle), 48px x 48px |

---

## 4. Component Specifications

### 4.1 Cards

**Standard Card:**
- `rounded-3xl bg-white` — no border, no shadow (relies on bg contrast against Surface Gray page)
- Padding: `p-6`

**Dashboard Stat Cards — Three Variants:**
- **Lime Card:** `bg-[#D4FF00] text-black rounded-3xl` — primary metric (e.g., "Pending KYC")
- **Dark Card:** `bg-black text-white rounded-3xl` — secondary metric
- **Light Card:** `bg-white text-black rounded-3xl border border-[#E5E7EB]` — tertiary metric

Stat number: `text-4xl font-bold tracking-tight`
Stat label: `text-sm text-muted font-medium`

### 4.2 Buttons

All buttons are pill-shaped (`rounded-full`).

**Primary:**
```
bg-[#D4FF00] text-black font-semibold px-6 py-2.5 rounded-full
hover:brightness-95 hover:scale-[1.02] transition-all
disabled:opacity-50 disabled:pointer-events-none
```

**Secondary:**
```
bg-white text-black font-medium px-6 py-2.5 rounded-full border border-black
hover:bg-neutral-50 hover:scale-[1.02] transition-all
```

**Danger:**
```
bg-red-600 text-white font-semibold px-6 py-2.5 rounded-full
hover:bg-red-700 hover:scale-[1.02] transition-all
```

**Icon Button:**
```
w-12 h-12 rounded-full bg-[#F3F4F6] flex items-center justify-center
hover:bg-neutral-200 transition-all
Active: bg-black text-white
```

### 4.3 Status Badges

Pill-shaped, micro text:
```
inline-flex items-center px-3 py-1 rounded-full text-xs font-medium
```

Checkmark badge (verified/active status):
```
w-5 h-5 rounded-full bg-[#A3E635] flex items-center justify-center
(black checkmark SVG icon inside)
```

### 4.4 Tables

**Container:** `rounded-2xl overflow-hidden border border-[#E5E7EB]`

**Header row:** `bg-black text-white text-xs font-medium uppercase tracking-wider`

**Body rows:** `bg-white divide-y divide-[#E5E7EB]`

**Row hover:** `hover:bg-[#D4FF00]/5 transition-colors` (very subtle lime tint)

**Cell padding:** `px-4 py-3 text-sm`

### 4.5 Forms & Inputs

**Labels:** `text-sm font-medium text-[#6B7280]`

**Inputs:**
```
w-full rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm
bg-white placeholder:text-[#6B7280]/50
focus:border-[#D4FF00] focus:outline-none focus:ring-2 focus:ring-[#D4FF00]/30
```

**Select dropdowns:** Same as inputs.

**Textareas:** Same as inputs, `min-h-[100px]`.

### 4.6 Modals & Dialogs

**Overlay:** `fixed inset-0 z-50 bg-black/50`

**Dialog:**
```
rounded-3xl bg-white p-6 shadow-xl max-w-md w-full mx-4
```

**Modal title:** `text-lg font-semibold text-black`

### 4.7 Navigation Sidebar

**Container:** `w-60 bg-black text-neutral-400 min-h-screen fixed`

**Logo area:** Brand Lime accent (lime-colored text or lime dot next to logo)

**Nav items:**
```
Default: text-neutral-400 px-4 py-2.5 rounded-xl mx-2
Hover: text-white bg-white/5
Active: text-[#D4FF00] bg-[#D4FF00]/10 font-medium border-l-2 border-[#D4FF00]
```

**Sub-items:** Indented, same pattern, slightly smaller text.

### 4.8 Alert/Toast Messages

Four variants, all with `rounded-2xl`:
- Error: `bg-red-50 border border-red-200 text-red-800`
- Success: `bg-green-50 border border-green-200 text-green-800`
- Warning: `bg-amber-50 border border-amber-200 text-amber-800`
- Info: `bg-[#D4FF00]/10 border border-[#D4FF00]/30 text-black` (lime-tinted instead of blue)

### 4.9 Progress Indicators (Registration Wizard)

Steps as pill-shaped numbered circles:
- Completed: `bg-[#D4FF00] text-black` with checkmark
- Current: `bg-black text-white`
- Upcoming: `bg-[#F3F4F6] text-[#6B7280]`
- Connector lines between steps

### 4.10 Empty States

```
rounded-3xl border-2 border-dashed border-[#E5E7EB] p-8
text-center text-[#6B7280]
```

---

## 5. Layout

### Page Background
`bg-[#F3F4F6]` (Surface Gray) — replaces any white/neutral-50 page backgrounds.

### Sidebar
`bg-black` (replaces `bg-neutral-900`). Full height, fixed position, `w-60`.

### Content Area
`ml-60 p-6 lg:p-8` — generous padding. Max-width constraints preserved per page.

### Dashboard Grid
Dashboard stat cards: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6` with mixed Lime/Dark/Light card variants.

### Two-Column Detail Views
Preserved as-is (KYC detail, lab detail, alert detail). Cards within get `rounded-3xl`.

### Registration Wizard
Full-screen centered card (no sidebar). Card gets `rounded-3xl bg-white shadow-xl`.

### Landing Page
Full-screen, no sidebar. Hero section uses Brand Lime accents, black typography, pill-shaped CTAs.

---

## 6. Interactions & Microanimations

| Element | Effect |
|---------|--------|
| All buttons | `transition-all duration-150` — `hover:scale-[1.02]` |
| Primary (lime) buttons | `hover:brightness-95` on hover |
| Table rows | `transition-colors duration-150` — `hover:bg-[#D4FF00]/5` |
| Nav items | `transition-colors duration-150` |
| Inputs on focus | `transition-colors` for border/ring |
| Modals | Fade-in overlay (CSS transition, no spring physics) |
| Cards | No hover animations (static content) |

---

## 7. Files to Modify

Every file under `apps/admin-portal/src/` that contains Tailwind classes:

### Configuration
1. `apps/admin-portal/tailwind.config.ts` — extend theme with brand colors, custom border-radius tokens
2. `apps/admin-portal/src/app/globals.css` — define CSS custom properties, add wavy divider utility class

### Layout & Shell
3. `apps/admin-portal/src/app/layout.tsx` — page background color
4. `apps/admin-portal/src/components/AuthGuard.tsx` — layout wrapper bg
5. `apps/admin-portal/src/components/Sidebar.tsx` — full sidebar restyle

### Pages (all need class updates)
6. `apps/admin-portal/src/app/page.tsx` — landing page
7. `apps/admin-portal/src/app/login/page.tsx` — login form
8. `apps/admin-portal/src/app/register/page.tsx` — registration wizard
9. `apps/admin-portal/src/app/dashboard/page.tsx` — dashboard stat cards
10. `apps/admin-portal/src/app/providers/page.tsx` — KYC queue table
11. `apps/admin-portal/src/app/providers/[submissionId]/page.tsx` — KYC detail
12. `apps/admin-portal/src/app/providers/expiry/page.tsx` — license expiry
13. `apps/admin-portal/src/app/labs/page.tsx` — labs queue
14. `apps/admin-portal/src/app/labs/[labId]/page.tsx` — lab detail
15. `apps/admin-portal/src/app/ai-models/page.tsx` — AI model manifest
16. `apps/admin-portal/src/app/alerts/page.tsx` — alerts list
17. `apps/admin-portal/src/app/alerts/[alertId]/page.tsx` — alert detail
18. `apps/admin-portal/src/app/audit/page.tsx` — audit chain
19. `apps/admin-portal/src/app/settings/page.tsx` — settings/FIDO2
20. `apps/admin-portal/src/app/subscriptions/page.tsx` — subscriptions
21. `apps/admin-portal/src/app/users/create/page.tsx` — user creation

### Components
22. `apps/admin-portal/src/components/providers/RenewLicenseModal.tsx`
23. `apps/admin-portal/src/components/registration/OrgDetailsStep.tsx`
24. `apps/admin-portal/src/components/registration/AdminCredentialsStep.tsx`
25. `apps/admin-portal/src/components/registration/ModuleSelectionStep.tsx`
26. `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx`
27. `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx`

---

## 8. What Does NOT Change

- **All business logic** — tRPC calls, Supabase auth, form validation, state management
- **Routing structure** — no pages added/removed
- **Component tree** — no structural React changes (no new components, no removed components)
- **AuthGuard behavior** — session validation, role checks, redirect logic
- **Status color semantics** — amber=pending, green=active, red=rejected, purple=escalated
- **Responsive breakpoints** — sm/md/lg patterns preserved
- **Accessibility** — focus states maintained (restyled with lime), aria attributes unchanged
- **TypeScript types** — no type changes
- **Dependencies** — no new npm packages

---

## 9. Acceptance Criteria

1. Every page renders with the new color palette (lime/black/white base)
2. All buttons are pill-shaped (`rounded-full`)
3. All cards use `rounded-3xl` (24px)
4. Sidebar is black with lime active indicators
5. Table headers are black with white text
6. Form inputs have `rounded-xl` and lime focus rings
7. Dashboard stat cards use mixed Lime/Dark/Light variants
8. Page titles have wavy decorative dividers
9. No functional regression — all forms submit, all navigation works, all modals open/close, all status badges display correctly
10. Status colors remain semantically correct for healthcare safety
