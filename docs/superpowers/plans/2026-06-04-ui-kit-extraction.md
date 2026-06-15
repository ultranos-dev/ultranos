# UI Kit Extraction — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the 14 ShadCN UI components from `apps/admin-portal/src/components/ui/` into `packages/ui-kit/src/components/ui/`, add shared oklch semantic tokens, create a shared Tailwind preset, and convert admin-portal's `src/components/ui/` files to thin re-exports — with zero changes to any existing import statement in the admin-portal.

**Architecture:** All 14 ShadCN components live in the shared package; each consumer app imports from `@ultranos/ui-kit/components/ui/<name>`. Admin-portal files become one-line re-exports so no existing `@/components/ui/` import path changes. The oklch semantic token variables move to `packages/ui-kit/src/tokens.css`; a new `packages/ui-kit/src/tailwind.preset.ts` captures the Tailwind color/radius/shadow config so every future spoke app gets the same design system from a single source.

**Tech Stack:** Tailwind CSS v3, ShadCN (radix-ui ^1.4.3, class-variance-authority ^0.7.1, clsx ^2.1.1, tailwind-merge ^3.6.0), Next.js 15, TypeScript 5.4, pnpm workspaces.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `packages/ui-kit/package.json` — add runtime deps, new exports |
| Create | `packages/ui-kit/src/lib/utils.ts` |
| Create | `packages/ui-kit/src/hooks/use-mobile.ts` |
| Modify | `packages/ui-kit/tsconfig.json` — remove `src/hooks` from exclude |
| Modify | `packages/ui-kit/src/tokens.css` — append oklch semantic vars |
| Create | `packages/ui-kit/src/tailwind.preset.ts` |
| Create | `packages/ui-kit/src/components/ui/badge.tsx` |
| Create | `packages/ui-kit/src/components/ui/breadcrumb.tsx` |
| Create | `packages/ui-kit/src/components/ui/button.tsx` |
| Create | `packages/ui-kit/src/components/ui/dialog.tsx` |
| Create | `packages/ui-kit/src/components/ui/dropdown-menu.tsx` |
| Create | `packages/ui-kit/src/components/ui/input.tsx` |
| Create | `packages/ui-kit/src/components/ui/label.tsx` |
| Create | `packages/ui-kit/src/components/ui/select.tsx` |
| Create | `packages/ui-kit/src/components/ui/separator.tsx` |
| Create | `packages/ui-kit/src/components/ui/sheet.tsx` |
| Create | `packages/ui-kit/src/components/ui/sidebar.tsx` |
| Create | `packages/ui-kit/src/components/ui/skeleton.tsx` |
| Create | `packages/ui-kit/src/components/ui/textarea.tsx` |
| Create | `packages/ui-kit/src/components/ui/tooltip.tsx` |
| Replace | `apps/admin-portal/src/components/ui/*.tsx` — 14 re-export wrappers |
| Modify | `apps/admin-portal/tailwind.config.ts` — use preset, remove color defs |
| Modify | `apps/admin-portal/src/app/globals.css` — remove inline oklch :root block |

---

### Task 1: Add runtime dependencies to ui-kit

**Files:**
- Modify: `packages/ui-kit/package.json`

- [ ] **Step 1: Add missing dependencies**

Open `packages/ui-kit/package.json`. Add these to `"dependencies"`:

```json
"class-variance-authority": "^0.7.1",
"clsx": "^2.1.1",
"radix-ui": "^1.4.3",
"tailwind-merge": "^3.6.0"
```

Full updated `dependencies` block:

```json
"dependencies": {
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "lucide-react": "^1.17.0",
  "radix-ui": "^1.4.3",
  "tailwind-merge": "^3.6.0"
}
```

- [ ] **Step 2: Install**

Run from the repo root:

```bash
pnpm install
```

Expected: no errors; `packages/ui-kit/node_modules` gets the new deps (or they hoist to root).

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/package.json pnpm-lock.yaml
git commit -m "chore(ui-kit): add shadcn runtime deps (cva, clsx, radix-ui, tailwind-merge)"
```

---

### Task 2: Create `packages/ui-kit/src/lib/utils.ts`

**Files:**
- Create: `packages/ui-kit/src/lib/utils.ts`

- [ ] **Step 1: Create the file**

```typescript
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: Verify TypeScript resolves it**

```bash
pnpm -F @ultranos/ui-kit typecheck
```

Expected: no errors on the new file. (Other errors may exist — ignore for now; they'll resolve in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/lib/utils.ts
git commit -m "chore(ui-kit): add cn utility"
```

---

### Task 3: Add `use-mobile` hook and update tsconfig

**Files:**
- Create: `packages/ui-kit/src/hooks/use-mobile.ts`
- Modify: `packages/ui-kit/tsconfig.json`

- [ ] **Step 1: Create the hook**

```typescript
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
```

- [ ] **Step 2: Remove `src/hooks` from tsconfig exclude**

Current `packages/ui-kit/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "dom", "dom.iterable"]
  },
  "include": ["src"],
  "exclude": ["src/__tests__", "src/hooks", "src/components/ConnectedLanguageSelector.tsx"]
}
```

Updated (remove `"src/hooks"` from the exclude array):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "dom", "dom.iterable"]
  },
  "include": ["src"],
  "exclude": ["src/__tests__", "src/components/ConnectedLanguageSelector.tsx"]
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/hooks/use-mobile.ts packages/ui-kit/tsconfig.json
git commit -m "chore(ui-kit): add use-mobile hook and include hooks in tsconfig"
```

---

### Task 4: Add oklch semantic tokens to `tokens.css`

**Files:**
- Modify: `packages/ui-kit/src/tokens.css`

- [ ] **Step 1: Append the oklch semantic variable blocks to the end of `tokens.css`**

Add after the final closing `}` of the `[dir="rtl"]` block:

```css
/* ── ShadCN / admin-portal semantic tokens (oklch L C H channels) ── */
/* These variables are consumed by tailwind.preset.ts via            */
/* oklch(var(--primary) / <alpha-value>) — supply raw L C H triplets  */

/* ── Light mode ── */
:root {
  --background:           1 0 0;
  --foreground:           0.145 0 0;
  --card:                 1 0 0;
  --card-foreground:      0.145 0 0;
  --popover:              1 0 0;
  --popover-foreground:   0.145 0 0;
  --primary:              0.527 0.154 150.069;
  --primary-foreground:   0.985 0 0;
  --secondary:            0.967 0.001 286.375;
  --secondary-foreground: 0.205 0.006 286.033;
  --muted:                0.97 0 0;
  --muted-foreground:     0.556 0.005 17.567;
  --accent:               0.97 0 0;
  --accent-foreground:    0.205 0 0;
  --destructive:          0.577 0.245 27.325;
  --border:               0.922 0 0;
  --input:                0.922 0 0;
  --ring:                 0.527 0.154 150.069;
  --radius:               0.625rem;

  /* Sidebar — light (near-white, border-separated) */
  --sidebar:                    0.985 0 0;
  --sidebar-foreground:         0.145 0 0;
  --sidebar-primary:            0.527 0.154 150.069;
  --sidebar-primary-foreground: 0.985 0 0;
  --sidebar-accent:             0.97 0 0;
  --sidebar-accent-foreground:  0.205 0 0;
  --sidebar-border:             0.922 0 0;
  --sidebar-ring:               0.527 0.154 150.069;

  /* Chart palette — teal-green scale */
  --chart-1: 0.871 0.15 154.449;
  --chart-2: 0.723 0.219 149.579;
  --chart-3: 0.627 0.194 149.214;
  --chart-4: 0.527 0.154 150.069;
  --chart-5: 0.448 0.119 151.328;

  /* Custom semantic extensions */
  --warning:  0.75 0.15 70;
  --success:  0.72 0.17 145;

  --shadow-card: 0 1px 3px oklch(0.145 0 0 / 0.06);
}

/* ── Dark mode ── */
[data-theme="dark"] {
  --background:           0.145 0 0;
  --foreground:           0.985 0 0;
  --card:                 0.205 0 0;
  --card-foreground:      0.985 0 0;
  --popover:              0.205 0 0;
  --popover-foreground:   0.985 0 0;
  --primary:              0.448 0.119 151.328;
  --primary-foreground:   0.985 0 0;
  --secondary:            0.274 0.006 286.033;
  --secondary-foreground: 0.985 0 0;
  --muted:                0.274 0.006 286.033;
  --muted-foreground:     0.707 0.005 286.286;
  --accent:               0.274 0.006 286.033;
  --accent-foreground:    0.985 0 0;
  --destructive:          0.704 0.191 22.216;
  --border:               0.274 0.006 286.033;
  --input:                0.322 0.006 286.033;
  --ring:                 0.448 0.119 151.328;

  /* Sidebar — dark */
  --sidebar:                    0.205 0 0;
  --sidebar-foreground:         0.985 0 0;
  --sidebar-primary:            0.448 0.119 151.328;
  --sidebar-primary-foreground: 0.985 0 0;
  --sidebar-accent:             0.274 0.006 286.033;
  --sidebar-accent-foreground:  0.985 0 0;
  --sidebar-border:             0.274 0.006 286.033;
  --sidebar-ring:               0.448 0.119 151.328;

  /* Chart palette — same hues */
  --chart-1: 0.871 0.15 154.449;
  --chart-2: 0.723 0.219 149.579;
  --chart-3: 0.627 0.194 149.214;
  --chart-4: 0.527 0.154 150.069;
  --chart-5: 0.448 0.119 151.328;

  --shadow-card: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui-kit/src/tokens.css
git commit -m "chore(ui-kit): add oklch semantic token variables (light + dark) to tokens.css"
```

---

### Task 5: Create shared Tailwind preset

**Files:**
- Create: `packages/ui-kit/src/tailwind.preset.ts`

- [ ] **Step 1: Create the preset file**

```typescript
import type { Config } from 'tailwindcss'

const preset: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: { DEFAULT: 'oklch(var(--background) / <alpha-value>)' },
        foreground: { DEFAULT: 'oklch(var(--foreground) / <alpha-value>)' },
        card: {
          DEFAULT:    'oklch(var(--card) / <alpha-value>)',
          foreground: 'oklch(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT:    'oklch(var(--popover) / <alpha-value>)',
          foreground: 'oklch(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT:    'oklch(var(--primary) / <alpha-value>)',
          foreground: 'oklch(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT:    'oklch(var(--secondary) / <alpha-value>)',
          foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT:    'oklch(var(--muted) / <alpha-value>)',
          foreground: 'oklch(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'oklch(var(--accent) / <alpha-value>)',
          foreground: 'oklch(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
        },
        border:  { DEFAULT: 'oklch(var(--border) / <alpha-value>)' },
        input:   { DEFAULT: 'oklch(var(--input) / <alpha-value>)' },
        ring:    { DEFAULT: 'oklch(var(--ring) / <alpha-value>)' },
        sidebar: {
          DEFAULT:              'oklch(var(--sidebar) / <alpha-value>)',
          foreground:           'oklch(var(--sidebar-foreground) / <alpha-value>)',
          primary:              'oklch(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'oklch(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent:               'oklch(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground':  'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
          border:               'oklch(var(--sidebar-border) / <alpha-value>)',
          ring:                 'oklch(var(--sidebar-ring) / <alpha-value>)',
        },
        warning: { DEFAULT: 'oklch(var(--warning) / <alpha-value>)' },
        success: { DEFAULT: 'oklch(var(--success) / <alpha-value>)' },
        chart: {
          '1': 'oklch(var(--chart-1) / <alpha-value>)',
          '2': 'oklch(var(--chart-2) / <alpha-value>)',
          '3': 'oklch(var(--chart-3) / <alpha-value>)',
          '4': 'oklch(var(--chart-4) / <alpha-value>)',
          '5': 'oklch(var(--chart-5) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg:    'var(--radius)',
        md:    'calc(var(--radius) - 2px)',
        sm:    'calc(var(--radius) - 4px)',
        '4xl': '2rem',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}

export default preset
```

- [ ] **Step 2: Add export to `packages/ui-kit/package.json`**

Add to the `"exports"` object:

```json
"./tailwind.preset": "./src/tailwind.preset.ts"
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/tailwind.preset.ts packages/ui-kit/package.json
git commit -m "chore(ui-kit): add shared Tailwind preset with oklch color mappings"
```

---

### Task 6: Move ShadCN components into ui-kit

**Files:**
- Create: `packages/ui-kit/src/components/ui/badge.tsx`
- Create: `packages/ui-kit/src/components/ui/breadcrumb.tsx`
- Create: `packages/ui-kit/src/components/ui/button.tsx`
- Create: `packages/ui-kit/src/components/ui/dialog.tsx`
- Create: `packages/ui-kit/src/components/ui/dropdown-menu.tsx`
- Create: `packages/ui-kit/src/components/ui/input.tsx`
- Create: `packages/ui-kit/src/components/ui/label.tsx`
- Create: `packages/ui-kit/src/components/ui/select.tsx`
- Create: `packages/ui-kit/src/components/ui/separator.tsx`
- Create: `packages/ui-kit/src/components/ui/sheet.tsx`
- Create: `packages/ui-kit/src/components/ui/sidebar.tsx`
- Create: `packages/ui-kit/src/components/ui/skeleton.tsx`
- Create: `packages/ui-kit/src/components/ui/textarea.tsx`
- Create: `packages/ui-kit/src/components/ui/tooltip.tsx`

> **Import translation rules — apply to ALL files:**
> - `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`
> - `import { ... } from "@/components/ui/button"` → `import { ... } from "./button"` (likewise for all `@/components/ui/*`)
> - `import { useIsMobile } from "@/hooks/use-mobile"` → `import { useIsMobile } from "../../hooks/use-mobile"`
> - `import { ... } from "@ultranos/ui-kit/icons"` → `import { ... } from "../../icons"` (avoid circular self-reference)

- [ ] **Step 1: Copy `badge.tsx` with updated imports**

Exact content (only `cn` import changes — no icon imports in this file):

```tsx
"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-primary/10 text-primary",
        secondary:   "border-transparent bg-card text-muted-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline:     "border-border text-foreground",
        success:     "border-transparent bg-success/10 text-success",
        warning:     "border-transparent bg-warning/10 text-warning",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        lg:      "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
```

- [ ] **Step 2: Copy `button.tsx` with updated imports**

```tsx
"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:     "border-border bg-background hover:bg-muted hover:text-foreground [data-theme=dark_&]:bg-transparent [data-theme=dark_&]:hover:bg-input/30",
        secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:       "hover:bg-muted hover:text-foreground",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        success:     "bg-success/10 text-success hover:bg-success/20 focus-visible:border-success/40 focus-visible:ring-success/20",
        link:        "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:   "h-9 gap-1.5 px-4",
        xs:        "h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm:        "h-8 gap-1 px-3",
        lg:        "h-10 gap-1.5 px-5",
        icon:      "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

- [ ] **Step 3: Copy `input.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/input.tsx` and copy verbatim, replacing `import { cn } from "@/lib/utils"` with `import { cn } from "../../lib/utils"`.

- [ ] **Step 4: Copy `label.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/label.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`

- [ ] **Step 5: Copy `textarea.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/textarea.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`

- [ ] **Step 6: Copy `separator.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/separator.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`

- [ ] **Step 7: Copy `skeleton.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/skeleton.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`

- [ ] **Step 8: Copy `tooltip.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/tooltip.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`

- [ ] **Step 9: Copy `breadcrumb.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/breadcrumb.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`
- Any `import { ... } from "@ultranos/ui-kit/icons"` → `import { ... } from "../../icons"`

- [ ] **Step 10: Copy `dialog.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/dialog.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`
- `import { X } from "@ultranos/ui-kit/icons"` → `import { X } from "../../icons"`

- [ ] **Step 11: Copy `dropdown-menu.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/dropdown-menu.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`
- Any `import { ... } from "@ultranos/ui-kit/icons"` → `import { ... } from "../../icons"`

- [ ] **Step 12: Copy `select.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/select.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`
- `import { ChevronDown as ChevronDownIcon, ChevronUp as ChevronUpIcon, Check as CheckIcon } from "@ultranos/ui-kit/icons"` → `import { ChevronDown as ChevronDownIcon, ChevronUp as ChevronUpIcon, Check as CheckIcon } from "../../icons"`

- [ ] **Step 13: Copy `sheet.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/sheet.tsx` and copy verbatim, replacing:
- `import { cn } from "@/lib/utils"` → `import { cn } from "../../lib/utils"`
- Any `import { ... } from "@ultranos/ui-kit/icons"` → `import { ... } from "../../icons"`
- Any `import { ... } from "@/components/ui/button"` → `import { ... } from "./button"`

- [ ] **Step 14: Copy `sidebar.tsx` with updated imports**

Read `apps/admin-portal/src/components/ui/sidebar.tsx` and copy verbatim, replacing every occurrence of the following:

| Old import | New import |
|-----------|-----------|
| `import { useIsMobile } from "@/hooks/use-mobile"` | `import { useIsMobile } from "../../hooks/use-mobile"` |
| `import { cn } from "@/lib/utils"` | `import { cn } from "../../lib/utils"` |
| `import { Button } from "@/components/ui/button"` | `import { Button } from "./button"` |
| `import { Input } from "@/components/ui/input"` | `import { Input } from "./input"` |
| `import { Separator } from "@/components/ui/separator"` | `import { Separator } from "./separator"` |
| `import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"` | `import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet"` |
| `import { Skeleton } from "@/components/ui/skeleton"` | `import { Skeleton } from "./skeleton"` |
| `import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"` | `import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"` |
| `import { PanelLeftIcon } from "@ultranos/ui-kit/icons"` | `import { PanelLeftIcon } from "../../icons"` |

- [ ] **Step 15: Typecheck ui-kit**

```bash
pnpm -F @ultranos/ui-kit typecheck
```

Expected: 0 errors. If there are errors about missing types, verify that the import path substitutions above were applied correctly.

- [ ] **Step 16: Commit**

```bash
git add packages/ui-kit/src/components/ui/
git commit -m "feat(ui-kit): add 14 shadcn components (badge, button, sidebar, ...)"
```

---

### Task 7: Update ui-kit package.json exports

**Files:**
- Modify: `packages/ui-kit/package.json`

- [ ] **Step 1: Add component and lib/hook exports**

Add all of the following to the `"exports"` object in `packages/ui-kit/package.json`:

```json
"./components/ui/badge":         "./src/components/ui/badge.tsx",
"./components/ui/breadcrumb":    "./src/components/ui/breadcrumb.tsx",
"./components/ui/button":        "./src/components/ui/button.tsx",
"./components/ui/dialog":        "./src/components/ui/dialog.tsx",
"./components/ui/dropdown-menu": "./src/components/ui/dropdown-menu.tsx",
"./components/ui/input":         "./src/components/ui/input.tsx",
"./components/ui/label":         "./src/components/ui/label.tsx",
"./components/ui/select":        "./src/components/ui/select.tsx",
"./components/ui/separator":     "./src/components/ui/separator.tsx",
"./components/ui/sheet":         "./src/components/ui/sheet.tsx",
"./components/ui/sidebar":       "./src/components/ui/sidebar.tsx",
"./components/ui/skeleton":      "./src/components/ui/skeleton.tsx",
"./components/ui/textarea":      "./src/components/ui/textarea.tsx",
"./components/ui/tooltip":       "./src/components/ui/tooltip.tsx",
"./tailwind.preset":             "./src/tailwind.preset.ts"
```

Full resulting `"exports"` block:

```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  },
  "./icons": {
    "import": "./dist/icons.js",
    "types": "./dist/icons.d.ts"
  },
  "./tokens.css": "./src/tokens.css",
  "./connected-language-selector": "./src/components/ConnectedLanguageSelector.tsx",
  "./components/ui/badge":         "./src/components/ui/badge.tsx",
  "./components/ui/breadcrumb":    "./src/components/ui/breadcrumb.tsx",
  "./components/ui/button":        "./src/components/ui/button.tsx",
  "./components/ui/dialog":        "./src/components/ui/dialog.tsx",
  "./components/ui/dropdown-menu": "./src/components/ui/dropdown-menu.tsx",
  "./components/ui/input":         "./src/components/ui/input.tsx",
  "./components/ui/label":         "./src/components/ui/label.tsx",
  "./components/ui/select":        "./src/components/ui/select.tsx",
  "./components/ui/separator":     "./src/components/ui/separator.tsx",
  "./components/ui/sheet":         "./src/components/ui/sheet.tsx",
  "./components/ui/sidebar":       "./src/components/ui/sidebar.tsx",
  "./components/ui/skeleton":      "./src/components/ui/skeleton.tsx",
  "./components/ui/textarea":      "./src/components/ui/textarea.tsx",
  "./components/ui/tooltip":       "./src/components/ui/tooltip.tsx",
  "./tailwind.preset":             "./src/tailwind.preset.ts"
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui-kit/package.json
git commit -m "chore(ui-kit): export all 14 shadcn components and tailwind preset"
```

---

### Task 8: Convert admin-portal component files to thin re-exports

**Files:**
- Replace: all 14 files in `apps/admin-portal/src/components/ui/`

> **Important:** The `sidebar.tsx` in admin-portal is already the fully-modified ShadCN sidebar-07 variant with all Tailwind v4→v3 fixes applied. The ui-kit version created in Task 6 Step 14 must match it exactly. Do **not** overwrite the ui-kit copy from the admin-portal copy — the ui-kit copy has different import paths and is the canonical source.

- [ ] **Step 1: Replace `badge.tsx`**

```tsx
export { Badge, badgeVariants } from '@ultranos/ui-kit/components/ui/badge'
```

- [ ] **Step 2: Replace `breadcrumb.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/breadcrumb'
```

- [ ] **Step 3: Replace `button.tsx`**

```tsx
export { Button, buttonVariants } from '@ultranos/ui-kit/components/ui/button'
```

- [ ] **Step 4: Replace `dialog.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/dialog'
```

- [ ] **Step 5: Replace `dropdown-menu.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/dropdown-menu'
```

- [ ] **Step 6: Replace `input.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/input'
```

- [ ] **Step 7: Replace `label.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/label'
```

- [ ] **Step 8: Replace `select.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/select'
```

- [ ] **Step 9: Replace `separator.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/separator'
```

- [ ] **Step 10: Replace `sheet.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/sheet'
```

- [ ] **Step 11: Replace `sidebar.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/sidebar'
```

- [ ] **Step 12: Replace `skeleton.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/skeleton'
```

- [ ] **Step 13: Replace `textarea.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/textarea'
```

- [ ] **Step 14: Replace `tooltip.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/tooltip'
```

- [ ] **Step 15: Typecheck admin-portal**

```bash
pnpm -F @ultranos/admin-portal typecheck
```

Expected: 0 new errors. Any pre-existing errors are out-of-scope. If you see `Module '"@ultranos/ui-kit/components/ui/button"' has no exported member 'Button'`, it means the export path in `packages/ui-kit/package.json` is wrong — double-check Task 7 Step 1.

- [ ] **Step 16: Commit**

```bash
git add apps/admin-portal/src/components/ui/
git commit -m "refactor(admin-portal): convert ui components to ui-kit re-exports"
```

---

### Task 9: Update admin-portal Tailwind config to use shared preset

**Files:**
- Modify: `apps/admin-portal/tailwind.config.ts`

- [ ] **Step 1: Replace the config**

New full content of `apps/admin-portal/tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'
import preset from '@ultranos/ui-kit/tailwind.preset'

const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["'Manrope'", 'system-ui', '-apple-system', 'sans-serif'],
        heading: ["'Public Sans'", 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

> The `darkMode` setting is now inherited from the preset. All oklch color definitions are now inherited from the preset. Font families are app-specific and stay in the app config.

- [ ] **Step 2: Verify the build compiles**

```bash
pnpm -F @ultranos/admin-portal build
```

Expected: Build succeeds. If you get `Cannot find module '@ultranos/ui-kit/tailwind.preset'`, verify the `./tailwind.preset` export was added to `packages/ui-kit/package.json` in Task 7.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/tailwind.config.ts
git commit -m "refactor(admin-portal): use shared ui-kit tailwind preset, remove duplicate color defs"
```

---

### Task 10: Remove inline oklch variable block from admin-portal globals.css

**Files:**
- Modify: `apps/admin-portal/src/app/globals.css`

- [ ] **Step 1: Remove the inline :root and [data-theme="dark"] blocks**

The oklch CSS custom properties are now provided by `packages/ui-kit/src/tokens.css`, which `globals.css` already imports via `@import '@ultranos/ui-kit/tokens.css'`.

Remove everything between (and including) the two inline variable blocks — the `:root { ... }` block (lines 9–54) and the `[data-theme="dark"] { ... }` block (lines 57–95).

New full content of `apps/admin-portal/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import '@ultranos/ui-kit/tokens.css';

@import "tw-animate-css";

/* ── Base resets ── */
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

- [ ] **Step 2: Start dev server and confirm no visual regression**

```bash
pnpm -F @ultranos/admin-portal dev
```

Open `http://localhost:3004` in a browser. Confirm:
- Background is white (not transparent/black)
- Primary green buttons still render green
- Sidebar renders with correct colors

If the page is unstyled (white on white or black on white), the `@import` is not resolving. Check that `tokens.css` is exported correctly from ui-kit and that the Tailwind build is picking it up.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/app/globals.css
git commit -m "refactor(admin-portal): remove inline oklch vars, tokens now from ui-kit"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| No hardcoded colors/styles | Task 4 (tokens.css), Task 5 (preset), Task 9 (tailwind.config), Task 10 (globals.css) |
| Extract 14 ShadCN components to ui-kit | Task 6 |
| Zero import changes in admin-portal | Task 8 (re-exports) |
| oklch semantic tokens in shared package | Task 4 |
| Shared Tailwind preset | Task 5 + Task 7 + Task 9 |
| `cn` utility in ui-kit | Task 2 |
| `useIsMobile` hook in ui-kit | Task 3 |
| Component exports in package.json | Task 7 |
| `darkMode` selector consistent across apps | Task 5 (preset inherits `[data-theme="dark"]`) |

### Known Import Quirks

- `sidebar.tsx` in ui-kit imports `PanelLeftIcon` from `../../icons` (NOT `@ultranos/ui-kit/icons`) to avoid circular reference.
- `sidebar.tsx` in ui-kit imports 6 peer components (`button`, `input`, `separator`, `sheet`, `skeleton`, `tooltip`) via relative `./` paths.
- All icon imports that previously said `@ultranos/ui-kit/icons` must become `../../icons` inside the ui-kit source tree.
