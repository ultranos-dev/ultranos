# Lab Lite Component Layer — Visual Parity Plan (Phase 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add missing ShadCN component re-exports (matching admin-portal's `components/ui/` directory), replace the custom `Button.tsx` with a ShadCN-backed wrapper, and fix page-level padding/color conflicts introduced by the new `SidebarInset` shell.

**Architecture:** Every missing component (`input`, `select`, `badge`, `label`, `skeleton`, `sheet`, `dialog`, `textarea`) gets a one-line re-export file at `@/components/ui/<name>.tsx` — identical to how admin-portal resolves them. The custom `Button.tsx` is replaced with a thin wrapper around the ShadCN button from ui-kit. Variant mapping: `primary` → ShadCN `default` (teal), `secondary` → `secondary`, `danger` → `destructive`, `ghost` → `ghost`, `outline` → `outline`, `warning` → a local override (amber), `brand` → new variant for explicit lime-green pill color (used in patient-token display contexts). No JSX in other files needs to change — `<Button variant="primary">` will now render teal instead of lime-green.

**Tech Stack:** Next.js 15, TypeScript 5.4, `@ultranos/ui-kit` ShadCN components, Tailwind CSS v3.

**Execution order:** Run `2026-06-04-lab-lite-shell-redesign.md` first. This plan requires the `SidebarInset` shell and semantic base layer from Phase 1.

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/lab-lite/src/components/ui/input.tsx` |
| Create | `apps/lab-lite/src/components/ui/select.tsx` |
| Create | `apps/lab-lite/src/components/ui/badge.tsx` |
| Create | `apps/lab-lite/src/components/ui/label.tsx` |
| Create | `apps/lab-lite/src/components/ui/skeleton.tsx` |
| Create | `apps/lab-lite/src/components/ui/sheet.tsx` |
| Create | `apps/lab-lite/src/components/ui/dialog.tsx` |
| Create | `apps/lab-lite/src/components/ui/textarea.tsx` |
| Replace | `apps/lab-lite/src/components/ui/Button.tsx` — ShadCN-backed wrapper |
| Modify | `apps/lab-lite/src/components/MetadataForm.tsx` — remove explicit `variant="primary"` |
| Audit | `apps/lab-lite/src/app/[locale]/page.tsx` — fix double padding from SidebarInset |

---

### Task 1: Add missing ShadCN component re-exports

**Files:**
- Create: `apps/lab-lite/src/components/ui/input.tsx`
- Create: `apps/lab-lite/src/components/ui/select.tsx`
- Create: `apps/lab-lite/src/components/ui/badge.tsx`
- Create: `apps/lab-lite/src/components/ui/label.tsx`
- Create: `apps/lab-lite/src/components/ui/skeleton.tsx`
- Create: `apps/lab-lite/src/components/ui/sheet.tsx`
- Create: `apps/lab-lite/src/components/ui/dialog.tsx`
- Create: `apps/lab-lite/src/components/ui/textarea.tsx`

These complete the `components/ui/` directory to match admin-portal's full set. Each file is a single `export *` line. Once present, any lab-lite component can do `import { Input } from '@/components/ui/input'` and get the ShadCN-styled input with semantic tokens.

- [ ] **Step 1: Create `apps/lab-lite/src/components/ui/input.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/input'
```

- [ ] **Step 2: Create `apps/lab-lite/src/components/ui/select.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/select'
```

- [ ] **Step 3: Create `apps/lab-lite/src/components/ui/badge.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/badge'
```

- [ ] **Step 4: Create `apps/lab-lite/src/components/ui/label.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/label'
```

- [ ] **Step 5: Create `apps/lab-lite/src/components/ui/skeleton.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/skeleton'
```

- [ ] **Step 6: Create `apps/lab-lite/src/components/ui/sheet.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/sheet'
```

- [ ] **Step 7: Create `apps/lab-lite/src/components/ui/dialog.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/dialog'
```

- [ ] **Step 8: Create `apps/lab-lite/src/components/ui/textarea.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/textarea'
```

- [ ] **Step 9: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors.

- [ ] **Step 10: Commit**

```bash
git add apps/lab-lite/src/components/ui/input.tsx \
        apps/lab-lite/src/components/ui/select.tsx \
        apps/lab-lite/src/components/ui/badge.tsx \
        apps/lab-lite/src/components/ui/label.tsx \
        apps/lab-lite/src/components/ui/skeleton.tsx \
        apps/lab-lite/src/components/ui/sheet.tsx \
        apps/lab-lite/src/components/ui/dialog.tsx \
        apps/lab-lite/src/components/ui/textarea.tsx
git commit -m "feat(lab-lite): add ShadCN re-exports for input, select, badge, label, skeleton, sheet, dialog, textarea"
```

---

### Task 2: Replace `Button.tsx` with a ShadCN-backed wrapper

**Files:**
- Replace: `apps/lab-lite/src/components/ui/Button.tsx`

The current `Button.tsx` uses hardcoded `bg-pill-green text-pill-text` for its `primary` variant. This is replaced with a wrapper around the ShadCN button from ui-kit. Variant mapping is:

| Lab-lite variant | ShadCN variant | Notes |
|-----------------|----------------|-------|
| `primary` (default) | `default` | `bg-primary text-primary-foreground` — teal, matches admin-portal |
| `secondary` | `secondary` | `bg-secondary text-secondary-foreground` |
| `danger` | `destructive` | `bg-destructive/10 text-destructive` |
| `ghost` | `ghost` | transparent, text-foreground on hover |
| `outline` | `outline` | bordered, bg-background |
| `warning` | `outline` | amber color override via `className` |
| `brand` | `ghost` | lime-green override via `className` — for explicit pill-green contexts |

The `fullWidth` prop is preserved. No call sites need to change: all `<Button>` and `<Button variant="primary">` will now render teal. Code that intentionally needs lime-green (patient-token display) should add `variant="brand"`.

- [ ] **Step 1: Replace `apps/lab-lite/src/components/ui/Button.tsx`**

```tsx
import { forwardRef } from 'react'
import type React from 'react'
import { Button as UiButton } from '@ultranos/ui-kit/components/ui/button'

// Derive variant type directly from the UiButton component — no reliance on ButtonProps export
type UiVariant = 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'success' | 'link'

type LabButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'ghost'
  | 'outline'
  | 'brand'

interface ButtonProps extends Omit<React.ComponentPropsWithRef<typeof UiButton>, 'variant'> {
  variant?: LabButtonVariant
  fullWidth?: boolean
}

const VARIANT_MAP: Record<LabButtonVariant, UiVariant> = {
  primary: 'default',
  secondary: 'secondary',
  danger: 'destructive',
  warning: 'outline',
  ghost: 'ghost',
  outline: 'outline',
  brand: 'ghost',
}

const VARIANT_EXTRA_CLASSES: Partial<Record<LabButtonVariant, string>> = {
  warning: 'border-amber-500 bg-amber-600 text-white hover:bg-amber-700 hover:brightness-100',
  brand: 'bg-pill-green text-pill-text hover:bg-pill-green hover:brightness-105 hover:text-pill-text',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', fullWidth, className = '', ...props }, ref) => {
    const uiVariant = VARIANT_MAP[variant]
    const extraClass = VARIANT_EXTRA_CLASSES[variant] ?? ''

    const computedClass = [
      fullWidth ? 'w-full' : '',
      extraClass,
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <UiButton
        ref={ref}
        variant={uiVariant}
        className={computedClass || undefined}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
```

> Note: `UiButton` from ui-kit uses `class-variance-authority` internally and merges `className` with `tailwind-merge`. The `VARIANT_EXTRA_CLASSES` strings are appended, so any conflicting base classes (e.g., `bg-ghost` vs `bg-amber-600`) are resolved by `tailwind-merge` in favor of the later class.

- [ ] **Step 2: Verify the Button renders correctly in a dev server**

```bash
pnpm -F lab-lite dev
```

Navigate to any page with a form (e.g., `/upload`). Verify:
- Primary buttons are teal (`bg-primary`), not lime-green
- Button has `h-9` height and `rounded-xl` (ShadCN defaults), not `rounded-pill`
- Focus ring is `ring-ring/30` (semantic), not `ring-primary-300`

If `rounded-pill` was intentional for lab-lite buttons, add `className="rounded-pill"` to the `computedClass` in the wrapper to override. **Discuss with product before doing this.**

Stop the dev server (`Ctrl+C`) before proceeding.

- [ ] **Step 3: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors. The `ButtonProps` type is derived via `React.ComponentPropsWithRef<typeof UiButton>` so no named export from ui-kit is required.

- [ ] **Step 4: Run tests**

```bash
pnpm -F lab-lite test 2>&1 | grep -E "(PASS|FAIL)" | head -30
```

Expected: same pass/fail count as after Phase 1. If snapshot tests fail because button class names changed (e.g., `bg-pill-green` → `bg-primary`), update snapshots:

```bash
pnpm -F lab-lite test -- --updateSnapshot
```

Review the diff to confirm only button variant classes changed, then commit.

- [ ] **Step 5: Commit**

```bash
git add apps/lab-lite/src/components/ui/Button.tsx
git commit -m "refactor(lab-lite): replace custom Button with ShadCN-backed wrapper (primary → teal)"
```

---

### Task 3: Fix double-padding on dashboard page

**Files:**
- Audit: `apps/lab-lite/src/app/[locale]/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/page.tsx` (if double padding found)

Phase 1's `AppShell` adds `p-4` to the `<main>` inside `SidebarInset`. If the dashboard page (and other pages) also have outer `p-4` or `px-4 py-6` wrappers, content will be double-padded. This task audits and fixes the dashboard; the same pattern applies to other pages.

- [ ] **Step 1: Read `apps/lab-lite/src/app/[locale]/page.tsx` (first 60 lines)**

Read the file and identify the outermost div/section className. Look for padding classes like `p-4`, `p-6`, `px-4`, `py-6`, `container`, `max-w-*`.

- [ ] **Step 2: Remove outer padding if it duplicates `AppShell`'s `p-4`**

If the page has an outer wrapper like:

```tsx
<div className="p-4 ...">
  ...content...
</div>
```

Change it to:

```tsx
<div className="...">
  ...content...
</div>
```

The rule: `AppShell` provides `p-4` as the base page padding. Pages should NOT add their own outer padding on top. Inner section padding (cards, form fields) is fine to keep.

If the page uses a `max-w-*` container for content width, keep that — it's not padding, it's a width constraint.

- [ ] **Step 3: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 errors (this is a className change, TypeScript won't catch issues).

- [ ] **Step 4: Verify visually**

```bash
pnpm -F lab-lite dev
```

Navigate to the dashboard. Verify content is not double-padded (no excess whitespace between sidebar and content). Stop the dev server.

- [ ] **Step 5: Commit if changes were made**

```bash
git add apps/lab-lite/src/app/[locale]/page.tsx
git commit -m "fix(lab-lite): remove duplicate outer padding on dashboard page (AppShell provides p-4)"
```

---

### Task 4: Verify full visual parity

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck across the full monorepo**

```bash
pnpm typecheck
```

Expected: pre-existing errors only (test files with type errors that existed before this plan). No new errors in `apps/lab-lite/src/` outside of `__tests__/`.

- [ ] **Step 2: Run lab-lite tests**

```bash
pnpm -F lab-lite test
```

Expected: same pass/fail count as before Phase 1.

- [ ] **Step 3: Visual checklist (requires dev server)**

```bash
pnpm -F lab-lite dev
```

Navigate to the login page, then log in and visit several pages. Verify each item:

| Check | Expected |
|-------|----------|
| Sidebar background | Light (`bg-sidebar`, not dark neutral-900) |
| Sidebar text | Dark on light, legible |
| Sidebar collapses | Clicking trigger collapses to icon-only mode |
| Sidebar tooltips | Icon-only mode shows item label on hover |
| Active nav item | Highlighted with `bg-sidebar-accent` |
| Badges | Red badge visible on items with pending counts |
| PageHeader | Shows current page name and SidebarTrigger |
| Dark mode | User dropdown → "Dark mode" → page goes dark |
| Dark mode persistence | Refresh → dark mode persists |
| Body background | White in light mode, near-black in dark mode |
| Buttons | Teal, not lime-green, in standard forms |
| User dropdown | Shows initials, role, theme toggle, sign out |

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| All admin-portal `components/ui/` re-exports present | Task 1 |
| Button `primary` variant uses ShadCN teal | Task 2 |
| Button `danger` variant uses ShadCN destructive | Task 2 |
| Button `brand` variant preserves `pill-green` | Task 2 |
| Button `fullWidth` prop preserved | Task 2 |
| No call sites break | Task 2 (variant names unchanged) |
| Double-padding from `AppShell + page` fixed | Task 3 |
| Full visual checklist passes | Task 4 |

### Known Constraints

- **`rounded-pill` is gone from Button** — the ShadCN button uses `rounded-xl` by default. If the product requires the fully-rounded pill shape on lab-lite buttons, add `className="rounded-pill"` when calling `UiButton` inside the wrapper (the `className` prop is passed through and merged by `tailwind-merge`). Discuss with product before restoring it.
- **Page-level color migration is NOT in scope** — 173+ lab-lite component files still use hardcoded classes like `bg-white`, `text-neutral-700`, `border-neutral-200`. These components will look correct in light mode (neutral grays ≈ semantic background/border), but dark mode will show light backgrounds where dark is expected. A full token migration across all pages is a separate effort.
- **`pill-green` and `pill-text` are still in `tailwind.config.ts`** — they remain as valid Tailwind classes for the `brand` button variant and any other intentional uses (patient token display). Do not remove them.
- **RTL: Button layout** — ShadCN button uses `inline-flex items-center` which respects `dir="rtl"` correctly. Icon positioning inside buttons will mirror as expected.
