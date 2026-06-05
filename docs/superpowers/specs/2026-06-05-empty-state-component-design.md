# EmptyState Component — Design Spec

**Date:** 2026-06-05  
**Status:** Approved  
**Scope:** `packages/ui-kit` + migration across all 4 spoke apps

---

## Problem

Five inconsistent empty state patterns exist across the four apps with no shared component. Padding, icon usage, border treatment, and typography are all different. Only `pharmacy-lite` had a reusable component, not shared with the other apps.

---

## Decision

Build a single `EmptyState` component in `packages/ui-kit/src/components/ui/empty-state.tsx`, exported alongside the 14 existing ShadCN components. Migrate all existing ad-hoc empty state patterns across all apps to use it.

---

## Component API

```tsx
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Users } from '@ultranos/ui-kit/icons'

// Minimal
<EmptyState title="No records yet" />

// Full
<EmptyState
  icon={Users}
  title="No patients found"
  description="Try adjusting your search or filters."
  action={{ label: 'Clear filters', onClick: () => clearFilters() }}
/>

// Compact widget
<EmptyState
  icon={Pill}
  title="No prescriptions"
  description="Nothing dispensed today."
  size="sm"
/>
```

### Props

| Prop | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| `title` | `string` | ✅ | — | Primary message |
| `description` | `string` | — | — | Supporting text below title |
| `icon` | `LucideIcon` | — | `Inbox` | Any Lucide icon component. Falls back to `Inbox` from ui-kit if omitted |
| `action` | `{ label: string; onClick: () => void }` | — | — | Renders a single CTA button |
| `size` | `'md' \| 'sm'` | — | `'md'` | Controls layout and proportions |
| `className` | `string` | — | — | Forwarded to the root element |

---

## Visual Design

### Default size (`size="md"`)

Vertical, centered layout. Used for card sections and full-page content areas.

```
┌─────────────────────────────┐
│                             │
│     ┌───┐                   │
│     │ ⬜ │  ← bg-muted circle, w-11 h-11
│     └───┘                   │
│                             │
│    No patients found        │  ← text-sm font-semibold text-foreground
│  Try adjusting your search  │  ← text-xs text-muted-foreground max-w-xs
│                             │
│    [ Clear filters ]        │  ← Button variant="outline" size="sm"
│                             │
└─────────────────────────────┘
padding: py-8 px-4
```

### Compact size (`size="sm"`)

Horizontal layout. Used for sidebar widgets, narrow cards, and inline list panels.

```
┌──────────────────────────────────────┐
│  ┌──┐  No prescriptions  [ Clear ]   │
│  │⬜│  Nothing dispensed today.       │
│  └──┘                                │
└──────────────────────────────────────┘
icon: w-7 h-7 circle
padding: p-4
button: Button variant="outline" size="xs"
```

### Token reference

| Element | Tailwind classes |
|---------|-----------------|
| Icon circle | `flex items-center justify-center rounded-full bg-muted text-muted-foreground` |
| Icon circle (md) | `w-11 h-11` |
| Icon circle (sm) | `w-7 h-7` |
| Icon size (md) | `size-5` (20px) |
| Icon size (sm) | `size-[13px]` (13px) |
| Title (md) | `text-sm font-semibold text-foreground` |
| Title (sm) | `text-xs font-semibold text-foreground` |
| Description (md) | `text-xs text-muted-foreground max-w-xs text-center` |
| Description (sm) | `text-xs text-muted-foreground` |
| Action button (md) | `Button variant="outline" size="sm"` |
| Action button (sm) | `Button variant="outline" size="xs"` |
| Root padding (md) | `py-8 px-4` |
| Root padding (sm) | `p-4` |

**Icon background is always gray** (`bg-muted`/`text-muted-foreground`). No primary tinting. When no icon is provided, renders `Inbox` from `@ultranos/ui-kit/icons` with the same muted gray styling.

---

## File location

```
packages/ui-kit/src/components/ui/empty-state.tsx   ← new component
packages/ui-kit/src/index.ts                         ← add export
packages/ui-kit/src/__tests__/EmptyState.test.tsx    ← new test file
packages/ui-kit/src/__tests__/__snapshots__/         ← snapshot updated
```

### Export path

```ts
// packages/ui-kit/src/index.ts — add:
export { EmptyState } from './components/ui/empty-state'

// Consumers import via subpath (tree-shakeable):
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

---

## Table rows — not in scope

Table row empty states (`<td colSpan={n}>`) are explicitly excluded from this component. They are a single-line text-only pattern that renders correctly inside a `<tbody>` and gains nothing from a component wrapper. Standard pattern for table rows:

```tsx
<tr>
  <td colSpan={n} className="px-4 py-8 text-center text-sm text-muted-foreground">
    {t('noItems')}
  </td>
</tr>
```

---

## Migration scope

Replace all ad-hoc empty state patterns across the four apps. Approximate count by app:

| App | Estimated occurrences | Notes |
|-----|-----------------------|-------|
| `admin-portal` | ~12 | Mix of dashed-border and text-only patterns |
| `opd-lite` | ~8 | Mostly text-only inline |
| `pharmacy-lite` | ~6 | Replace local `EmptyState.tsx` with ui-kit version |
| `lab-lite` | ~15 | Most complete patterns; some already icon+text |

The `pharmacy-lite/src/components/pharmacy/EmptyState.tsx` local component is **deleted** after migration — its callers switch to the ui-kit import.

---

## Testing

Add to `packages/ui-kit/src/__tests__/EmptyState.test.tsx`:

1. **Snapshot — default size, all props:** renders icon circle, title, description, outline pill button
2. **Snapshot — size="sm":** renders horizontal layout
3. **Fallback icon:** omitting `icon` prop renders the `Inbox` icon
4. **No action:** omitting `action` prop renders no button
5. **RTL snapshot:** both sizes render correctly with `dir="rtl"` — the `sm` horizontal layout must mirror correctly using logical CSS (`gap`, `flex-row`)
6. **Accessibility:** root element has no interactive role; action button is a `<button>` with visible label

---

## RTL

The `sm` size uses `flex` row layout. All spacing must use logical properties:
- Use `gap-*` (not `mr-*`/`ml-*`) between icon and text
- Use `ms-auto` (not `ml-auto`) to push the action button to the end

The `md` size is centered so RTL requires no additional handling.

---

## Out of scope

- Loading/skeleton states — handled separately by `Skeleton` component
- Error states — handled separately (distinct visual language)
- Illustration support — no image/SVG illustrations; icon-only keeps bundle lean and avoids i18n/cultural issues
- More than one action button — no current use case warrants it
