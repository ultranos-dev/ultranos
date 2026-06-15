# Admin Portal — Radix Rhea Theme Migration

**Date:** 2026-06-02  
**Scope:** `apps/admin-portal/` only  
**Preset:** ShadCN `b2dK6DFnXe` (Radix Rhea)  
**Approach:** Automated codemod — migrate to ShadCN token naming convention

---

## 1. Background & Goals

The admin-portal currently uses a custom OKLCH-based design token system (`--color-canvas`, `--color-accent`, etc.) with matching Tailwind utility classes (`bg-canvas`, `text-accent`, etc.). The goal is to replace this with the ShadCN Radix Rhea theme so that:

1. The portal's visual design matches the Rhea aesthetic (teal-green primary, Manrope + Public Sans typography, 0.625rem radius, clean neutral palette).
2. Token names match ShadCN's convention (`--background`, `--primary`, `--destructive`, etc.), enabling copy-paste of future ShadCN components without manual token translation.
3. No ShadCN component library is installed — only the CSS variables and Tailwind config change.

---

## 2. Theme: Radix Rhea

| Property | Value |
|---|---|
| Preset ID | `b2dK6DFnXe` |
| Style | `radix-rhea` |
| Base color | Neutral |
| Primary | Teal-green `oklch(0.527 0.154 150.069)` |
| Fonts | Manrope (body) + Public Sans (headings) |
| Border radius | `0.625rem` |
| Icon library | lucide (already in use via `@ultranos/ui-kit`) |
| Sidebar | Light (near-white, border-separated) |
| Dark mode | Dark charcoal `oklch(0.145 0 0)` |

---

## 3. Token Mapping

### 3.1 Direct renames

| Current Tailwind class | New Tailwind class | CSS var |
|---|---|---|
| `bg-canvas` | `bg-background` | `--color-canvas` → `--background` |
| `bg-surface` | `bg-card` | `--color-surface` → `--card` |
| `bg-surface-raised` | `bg-popover` | `--color-surface-raised` → `--popover` |
| `bg-sidebar` | `bg-sidebar` | `--color-sidebar` → `--sidebar` (value changes to light) |
| `text-text-primary` | `text-foreground` | `--color-text-primary` → `--foreground` |
| `text-text-secondary` | `text-muted-foreground` | `--color-text-secondary` → `--muted-foreground` |
| `text-text-on-dark` | `text-primary-foreground` | `--color-text-on-dark` → `--primary-foreground` |
| `bg-accent` | `bg-primary` | `--color-accent` → `--primary` |
| `text-accent` | `text-primary` | same |
| `border-accent` | `border-primary` | same |
| `text-danger` | `text-destructive` | `--color-danger` → `--destructive` |
| `bg-danger` | `bg-destructive` | same |
| `border-danger` | `border-destructive` | same |
| `border-border` | `border-border` | `--color-border` → `--border` |
| `shadow-card` | `shadow-card` | kept, value updated |

### 3.2 Opacity modifier conversions

Separate subtle/hover tokens are replaced by Tailwind opacity modifiers. No dedicated CSS vars needed.

| Current class | New class |
|---|---|
| `bg-accent-hover` | `bg-primary/90` |
| `bg-accent-subtle` | `bg-primary/10` |
| `border-accent/20` | `border-primary/20` |
| `bg-danger-subtle` | `bg-destructive/10` |
| `border-danger/20` | `border-destructive/20` |
| `bg-warning-subtle` | `bg-warning/10` |
| `bg-success-subtle` | `bg-success/10` |

### 3.3 Custom extensions (no ShadCN equivalent)

`warning` and `success` are not part of ShadCN's base token set. They are kept as custom CSS vars and Tailwind extensions alongside the ShadCN tokens:

```css
--warning: 0.75 0.15 70;   /* oklch L C H channels */
--success: 0.72 0.17 145;
```

```ts
warning: 'oklch(var(--warning) / <alpha-value>)',
success: 'oklch(var(--success) / <alpha-value>)',
```

---

## 4. globals.css

CSS variables stored as **raw OKLCH channel values** (`L C H`, no `oklch()` wrapper). This enables Tailwind opacity modifiers (`bg-primary/10`, `bg-destructive/20`, etc.) to work correctly.

Dark mode selector remains `[data-theme="dark"]` — no change to `ThemeProvider.tsx` or the inline script in `layout.tsx`.

### ui-kit/tokens.css import

The `@import '@ultranos/ui-kit/tokens.css'` line at the top of globals.css **must be kept**. It provides:

- `--directional-icon-transform` — required by `DirectionalIcon` from `@ultranos/ui-kit` for RTL icon mirroring.
- `--font-family-sans-ar` / `--font-family-serif-ar` — Arabic font stacks for RTL mode.
- `--color-allergy-*` — critical safety tokens (though not currently used directly in admin-portal components).

There is no conflict: ui-kit's `--color-danger/warning/success` use HSL format and different variable names from the new `--destructive/warning/success` OKLCH channel tokens. They coexist without collision.

### Light mode (`:root`)

```css
:root {
  --background:          1 0 0;
  --foreground:          0.145 0 0;
  --card:                1 0 0;
  --card-foreground:     0.145 0 0;
  --popover:             1 0 0;
  --popover-foreground:  0.145 0 0;
  --primary:             0.527 0.154 150.069;
  --primary-foreground:  0.985 0 0;
  --secondary:           0.967 0.001 286.375;
  --secondary-foreground: 0.205 0.006 286.033;
  --muted:               0.97 0 0;
  --muted-foreground:    0.556 0.005 17.567;
  --accent:              0.97 0 0;
  --accent-foreground:   0.205 0 0;
  --destructive:         0.577 0.245 27.325;
  --border:              0.922 0 0;
  --input:               0.922 0 0;
  --ring:                0.527 0.154 150.069;
  --radius:              0.625rem;

  /* Sidebar — light */
  --sidebar:                    0.985 0 0;
  --sidebar-foreground:         0.145 0 0;
  --sidebar-primary:            0.527 0.154 150.069;
  --sidebar-primary-foreground: 0.985 0 0;
  --sidebar-accent:             0.97 0 0;
  --sidebar-accent-foreground:  0.205 0 0;
  --sidebar-border:             0.922 0 0;
  --sidebar-ring:               0.527 0.154 150.069;

  /* Custom extensions */
  --warning:   0.75 0.15 70;
  --success:   0.72 0.17 145;

  --shadow-card: 0 1px 3px oklch(0.145 0 0 / 0.06);
}
```

### Dark mode (`[data-theme="dark"]`)

```css
[data-theme="dark"] {
  --background:          0.145 0 0;
  --foreground:          0.985 0 0;
  --card:                0.205 0 0;
  --card-foreground:     0.985 0 0;
  --popover:             0.205 0 0;
  --popover-foreground:  0.985 0 0;
  --primary:             0.448 0.119 151.328;
  --primary-foreground:  0.985 0 0;
  --secondary:           0.274 0.006 286.033;
  --secondary-foreground: 0.985 0 0;
  --muted:               0.274 0.006 286.033;
  --muted-foreground:    0.707 0.005 286.286;
  --accent:              0.274 0.006 286.033;
  --accent-foreground:   0.985 0 0;
  --destructive:         0.704 0.191 22.216;
  --border:              0.274 0.006 286.033;
  --input:               0.322 0.006 286.033;
  --ring:                0.448 0.119 151.328;

  /* Sidebar — dark */
  --sidebar:                    0.205 0 0;
  --sidebar-foreground:         0.985 0 0;
  --sidebar-primary:            0.448 0.119 151.328;
  --sidebar-primary-foreground: 0.985 0 0;
  --sidebar-accent:             0.274 0.006 286.033;
  --sidebar-accent-foreground:  0.985 0 0;
  --sidebar-border:             0.274 0.006 286.033;
  --sidebar-ring:               0.448 0.119 151.328;

  --shadow-card: none;
}
```

---

## 5. tailwind.config.ts

Full replacement. Key changes:
- `darkMode` switches to `['selector', '[data-theme="dark"]']`
- All colors use `oklch(var(--token) / <alpha-value>)` pattern for opacity modifier support
- Font family updated to Manrope (sans) and Public Sans (heading)
- `borderRadius` uses the `--radius` variable

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Manrope'", 'system-ui', '-apple-system', 'sans-serif'],
        heading: ["'Public Sans'", 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        background:  { DEFAULT: 'oklch(var(--background) / <alpha-value>)' },
        foreground:  { DEFAULT: 'oklch(var(--foreground) / <alpha-value>)' },
        card:        { DEFAULT: 'oklch(var(--card) / <alpha-value>)',        foreground: 'oklch(var(--card-foreground) / <alpha-value>)' },
        popover:     { DEFAULT: 'oklch(var(--popover) / <alpha-value>)',     foreground: 'oklch(var(--popover-foreground) / <alpha-value>)' },
        primary:     { DEFAULT: 'oklch(var(--primary) / <alpha-value>)',     foreground: 'oklch(var(--primary-foreground) / <alpha-value>)' },
        secondary:   { DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',   foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)' },
        muted:       { DEFAULT: 'oklch(var(--muted) / <alpha-value>)',       foreground: 'oklch(var(--muted-foreground) / <alpha-value>)' },
        accent:      { DEFAULT: 'oklch(var(--accent) / <alpha-value>)',      foreground: 'oklch(var(--accent-foreground) / <alpha-value>)' },
        destructive: { DEFAULT: 'oklch(var(--destructive) / <alpha-value>)' },
        border:      { DEFAULT: 'oklch(var(--border) / <alpha-value>)' },
        input:       { DEFAULT: 'oklch(var(--input) / <alpha-value>)' },
        ring:        { DEFAULT: 'oklch(var(--ring) / <alpha-value>)' },
        sidebar: {
          DEFAULT:             'oklch(var(--sidebar) / <alpha-value>)',
          foreground:          'oklch(var(--sidebar-foreground) / <alpha-value>)',
          primary:             'oklch(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground':'oklch(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent:              'oklch(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
          border:              'oklch(var(--sidebar-border) / <alpha-value>)',
          ring:                'oklch(var(--sidebar-ring) / <alpha-value>)',
        },
        // Custom extensions
        warning: { DEFAULT: 'oklch(var(--warning) / <alpha-value>)' },
        success: { DEFAULT: 'oklch(var(--success) / <alpha-value>)' },
      },
      borderRadius: {
        lg:  'var(--radius)',
        md:  'calc(var(--radius) - 2px)',
        sm:  'calc(var(--radius) - 4px)',
        '4xl': '2rem',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}

export default config
```

---

## 6. Font Loading — layout.tsx

Add Manrope and Public Sans via `next/font/google`. Apply CSS variable classes to the `<html>` element.

```tsx
import { Manrope, Public_Sans } from 'next/font/google'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
})

// In RootLayout — add variables to <html>:
<html
  lang="en"
  dir="ltr"
  suppressHydrationWarning
  className={`${manrope.variable} ${publicSans.variable}`}
>
```

The `font-sans` Tailwind class resolves to Manrope everywhere by default. Use `font-heading` on page titles (`h1`) where the Public Sans weight distinction is desired.

---

## 7. Codemod Script — scripts/migrate-admin-tokens.mjs

A Node.js ESM script that reads every `.tsx` and `.ts` file under `apps/admin-portal/src/`, applies the rename table from Section 3, and writes the result back.

**Critical ordering rule:** Longer tokens must be replaced before shorter ones to prevent partial-match collisions (e.g. `bg-surface-raised` before `bg-surface`).

**Supports a `--dry-run` flag** that prints the diff without writing.

### Rename table (ordered longest-first within each group)

```js
const RENAMES = [
  // Surface hierarchy — longest first
  ['bg-surface-raised',      'bg-popover'],
  ['bg-surface',             'bg-card'],
  ['bg-canvas',              'bg-background'],

  // Text tokens
  ['text-text-secondary',    'text-muted-foreground'],
  ['text-text-primary',      'text-foreground'],
  ['text-text-on-dark',      'text-primary-foreground'],

  // Accent / primary
  ['bg-accent-subtle',       'bg-primary/10'],
  ['bg-accent-hover',        'bg-primary/90'],
  ['bg-accent',              'bg-primary'],
  ['text-accent',            'text-primary'],
  ['border-accent',          'border-primary'],

  // Danger / destructive
  ['bg-danger-subtle',       'bg-destructive/10'],
  ['bg-danger',              'bg-destructive'],
  ['text-danger',            'text-destructive'],
  ['border-danger',          'border-destructive'],

  // Semantic state — subtle variants
  ['bg-warning-subtle',      'bg-warning/10'],
  ['bg-success-subtle',      'bg-success/10'],

  // border-s-2 partial pattern handled by word-boundary regex
]
```

The script uses a **word-boundary-aware regex** (`\b<token>\b`) to avoid matching partial class names (e.g. avoid matching `border-canvas` when looking for `canvas`).

---

## 8. Sidebar.tsx — Manual Update

`Sidebar.tsx` uses hardcoded dark-background utility classes that the codemod cannot handle. These must be updated by hand after the codemod runs:

| Current class | Replacement |
|---|---|
| `text-white/80` | `text-sidebar-foreground/80` |
| `text-white/60` | `text-sidebar-foreground/60` |
| `hover:text-white` | `hover:text-sidebar-foreground` |
| `hover:bg-white/[0.08]` | `hover:bg-sidebar-accent` |
| `bg-white/[0.12]` (active nav) | `bg-sidebar-accent` |
| `border-white/10` | `border-sidebar-border` |
| `text-accent` (active nav item) | `text-sidebar-primary` |
| `bg-sidebar` (aside element) | `bg-sidebar` (class name same, value changes) |

The sidebar border in light mode (replacing the strong colour contrast) must be explicit: add `border-r border-sidebar-border` to the `<aside>` element.

---

## 9. Excluded Files

The following files contain intentional inline SVG with hardcoded colour values per CLAUDE.md. They must **not** be touched by the codemod or manual edits:

- `apps/lab-lite/src/components/queue/token-icons.tsx`
- `apps/lab-lite/src/components/results/ResultColorIndicator.tsx`
- `apps/lab-lite/src/components/ai/ConfidenceIndicator.tsx`
- `apps/lab-lite/src/components/qc/QcHistoryView.tsx`
- `apps/lab-lite/src/components/patients/CulturalFlagsBanner.tsx`
- `apps/lab-lite/src/components/patients/CulturalFlagsEditor.tsx`
- All `animate-spin` loading spinners

Note: these are all in `apps/lab-lite/`, not `apps/admin-portal/` — the codemod scope is limited to `apps/admin-portal/src/` so they are safe by default.

---

## 10. Testing

After the migration:

1. Run `pnpm -F admin-portal test` — expect snapshot failures only (class names changed).
2. Update snapshots: `pnpm -F admin-portal test -- -u`
3. Verify no non-snapshot test failures remain.
4. Visual smoke test: open the admin portal in a browser, toggle light/dark mode, check sidebar, dashboard stat cards, danger/warning/success states, dropdowns (popover), and the login page.

---

## 11. Execution Order

1. Update `apps/admin-portal/src/app/globals.css` (new token set)
2. Update `apps/admin-portal/tailwind.config.ts` (new color map + fonts)
3. Update `apps/admin-portal/src/app/layout.tsx` (add Manrope + Public Sans via `next/font/google`)
4. Write `scripts/migrate-admin-tokens.mjs` (codemod script)
5. Run codemod dry-run: `node scripts/migrate-admin-tokens.mjs --dry-run` — review diff
6. Apply codemod: `node scripts/migrate-admin-tokens.mjs`
7. Update `apps/admin-portal/src/components/Sidebar.tsx` manually
8. Run `pnpm -F admin-portal test -- -u` to update snapshots
9. Visual smoke test in browser (light + dark mode)
