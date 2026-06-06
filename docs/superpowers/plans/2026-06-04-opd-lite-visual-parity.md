# OPD Lite — Visual Parity with Admin Portal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded and legacy Tailwind color classes throughout opd-lite with the shared oklch semantic token system from `@ultranos/ui-kit`, add dark mode infrastructure, and make the app's visual design consistent with admin-portal.

**Architecture:** Three phases. Phase 1 fixes the foundation: dark mode detection, `bg-background/text-foreground` on body, `@layer base` reset, and the font variable mismatch. Phase 2 fixes every primitive component that uses broken or hardcoded classes (`Card`, `Button`, `AllergyBanner`, `SearchInput`, `PediatricDosingBanner`). Phase 3 does page-level components and a final grep sweep. Each task is a self-contained commit.

**The root cause of "looks exactly like before":** The preset was wired in Task 1 (previous plan), but the app's existing components do not use the semantic oklch tokens the preset provides (`bg-background`, `text-foreground`, `bg-card`, `border-border`, etc.). They still use `bg-neutral-50`, `text-gray-900`, `bg-card-bg` (which is undefined and renders transparent), `bg-white`, `bg-red-600` etc. The preset only adds the _vocabulary_ — this plan migrates every component to _use_ it.

**Tech Stack:** Tailwind CSS v3, Next.js 15, oklch color space, `@ultranos/ui-kit` preset and tokens.

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/opd-lite/src/components/ThemeProvider.tsx` |
| Modify | `apps/opd-lite/src/app/layout.tsx` |
| Modify | `apps/opd-lite/src/app/globals.css` |
| Modify | `apps/opd-lite/package.json` |
| Modify | `apps/opd-lite/tailwind.config.ts` |
| Modify | `apps/opd-lite/src/components/Card.tsx` |
| Modify | `apps/opd-lite/src/components/ui/Button.tsx` |
| Modify | `apps/opd-lite/src/components/clinical/AllergyBanner.tsx` |
| Modify | `apps/opd-lite/src/components/search-input.tsx` |
| Modify | `apps/opd-lite/src/components/clinical/PediatricDosingBanner.tsx` |
| Modify | `apps/opd-lite/src/components/patients/PatientDirectory.tsx` |
| Modify | `apps/opd-lite/src/components/patient-result-list.tsx` |
| Modify | `apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx` |
| Modify | `apps/opd-lite/src/components/dashboard/TodayEncountersCard.tsx` |
| Modify | `apps/opd-lite/src/components/encounter-dashboard.tsx` |

---

## Phase 1: Foundation

---

### Task 1: ThemeProvider + layout.tsx

**What this fixes:** The body uses `bg-neutral-50 text-neutral-900` (HSL tokens). It must use `bg-background text-foreground` (oklch semantic tokens from preset). Without this, the background, text color, and dark mode selector never activate. Also: `data-theme` must be set on `<html>` before hydration so dark mode works on first paint without flicker.

**Files:**
- Create: `apps/opd-lite/src/components/ThemeProvider.tsx`
- Modify: `apps/opd-lite/src/app/layout.tsx`

- [ ] **Step 1: Create ThemeProvider.tsx**

Create `apps/opd-lite/src/components/ThemeProvider.tsx` with this exact content:

```typescript
'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    const resolved = stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', next)
      document.documentElement.setAttribute('data-theme', next)
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

- [ ] **Step 2: Update layout.tsx**

Replace the full content of `apps/opd-lite/src/app/layout.tsx` with:

```typescript
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { getLocale } from 'next-intl/server'
import { getDirection } from '@ultranos/ui-kit'
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'

const urbanist = localFont({
  src: '../../public/fonts/Urbanist-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-urbanist',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#1e40af',
}

export const metadata: Metadata = {
  title: 'OPD Lite — Patient Search',
  description: 'Ultranos OPD Lite PWA for clinical encounters',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OPD Lite',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  const isRtl = dir === 'rtl'

  return (
    <html lang={locale} dir={dir} className={urbanist.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
        {isRtl && <link rel="stylesheet" href="/fonts-arabic.css" />}
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <ThemeProvider>
          <ClientErrorBoundary>
            {children}
          </ClientErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

> **Changes vs. original:** Added `ThemeProvider` import and wrapper. Added inline `data-theme` detection script in `<head>` (synchronous, runs before paint — prevents dark mode flicker). Added `suppressHydrationWarning` on `<html>` (needed because the script sets `data-theme` on the server-rendered element, causing a mismatch Next.js would otherwise warn about). Changed `bg-neutral-50 text-neutral-900` → `bg-background text-foreground` on `<body>`.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/ThemeProvider.tsx apps/opd-lite/src/app/layout.tsx
git commit -m "feat(opd-lite): add ThemeProvider, fix body to use semantic tokens, add data-theme script"
```

---

### Task 2: Fix globals.css — base layer + tw-animate-css

**What this fixes:** Without `@layer base`, the body background and borders don't reset to semantic token values. Without `tw-animate-css`, the CSS keyframe animations used across the design system are missing.

**Files:**
- Modify: `apps/opd-lite/package.json`
- Modify: `apps/opd-lite/src/app/globals.css`

- [ ] **Step 1: Add tw-animate-css to devDependencies**

In `apps/opd-lite/package.json`, add to `devDependencies`:

```json
"tw-animate-css": "^1.2.9",
```

The full devDependencies block should include it (add alphabetically near tailwindcss):

```json
"devDependencies": {
  "@serwist/next": "^9.0.0",
  "@testing-library/jest-dom": "^6.9.1",
  "@testing-library/react": "^16.0.0",
  "@testing-library/user-event": "^14.6.1",
  "@types/node": "^20.0.0",
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "@vitejs/plugin-react": "^4.3.0",
  "autoprefixer": "^10.4.0",
  "fake-indexeddb": "^6.0.0",
  "jsdom": "^24.0.0",
  "postcss": "^8.4.0",
  "serwist": "^9.0.0",
  "tailwindcss": "^3.4.0",
  "tw-animate-css": "^1.2.9",
  "typescript": "^5.4.0",
  "vitest": "^1.6.0"
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

- [ ] **Step 3: Update globals.css**

Replace the full content of `apps/opd-lite/src/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import '@ultranos/ui-kit/tokens.css';
@import "tw-animate-css";

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

@media print {
  body * {
    visibility: hidden;
  }
  .print-label,
  .print-label * {
    visibility: visible;
  }
  .print-label {
    position: relative;
    width: 100%;
    border: 1px solid #000;
    page-break-inside: avoid;
    page-break-after: always;
  }
  .print-label:last-child {
    page-break-after: auto;
  }
}
```

> **What changed:** Added `@import "tw-animate-css"` for CSS keyframe animations. Added `@layer base` block that resets all elements to `border-border` (so borders auto-use the semantic border token), resets body to `bg-background text-foreground`, and sets `html` to `font-sans`. This is identical to admin-portal's base layer.

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/package.json apps/opd-lite/src/app/globals.css
git commit -m "feat(opd-lite): add tw-animate-css, globals.css base layer reset"
```

---

### Task 3: Fix font variable in tailwind.config.ts

**What this fixes:** `var(--font-family-sans)` resolves to the string `'Urbanist'` from tokens.css. But `next/font/local` generates a mangled `@font-face` name (e.g. `'__Urbanist_abc123'`) stored in `--font-urbanist`. When you reference `'Urbanist'` as a font-family string, the browser can't find the @font-face and falls back to system fonts. Fix: use `var(--font-urbanist)` directly so Tailwind's `font-sans` class references the actual loaded font face.

**Files:**
- Modify: `apps/opd-lite/tailwind.config.ts`

- [ ] **Step 1: Update fontFamily.sans**

In `apps/opd-lite/tailwind.config.ts`, change only the `fontFamily.sans` value:

```typescript
fontFamily: {
  sans: ['var(--font-urbanist)', 'system-ui', 'sans-serif'],
},
```

The full file after this change:

```typescript
import type { Config } from 'tailwindcss'
import preset from '@ultranos/ui-kit/tailwind.preset'

const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-urbanist)', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        black: '900',
      },
      colors: {
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
        neutral: {
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          400: 'var(--color-neutral-400)',
          500: 'var(--color-neutral-500)',
          600: 'var(--color-neutral-600)',
          700: 'var(--color-neutral-700)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)',
        },
        'pill-green': '#9fe870',
        'pill-text': '#163300',
        danger: 'var(--color-danger)',
        allergy: 'var(--color-allergy)',
      },
      borderRadius: {
        pill: '9999px',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Run typecheck to verify**

```bash
pnpm -F opd-lite typecheck 2>&1 | grep -v "src/__tests__"
```

Expected: no errors outside `src/__tests__/` (pre-existing test type errors are ignored). Specifically, verify no `Cannot find module '@ultranos/ui-kit/tailwind.preset'` errors appear.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/tailwind.config.ts
git commit -m "fix(opd-lite): use var(--font-urbanist) so next/font loaded font actually applies"
```

---

## Phase 2: Primitive Components

---

### Task 4: Fix Card.tsx — bg-card-bg is undefined

**What this fixes:** `bg-card-bg` maps to nothing — no such class exists in Tailwind or the preset. This is why `Card`-wrapped sections render with no background. The correct semantic class is `bg-card`. The `ring-gray-400/40` should also use `ring-border/50`.

**Files:**
- Modify: `apps/opd-lite/src/components/Card.tsx`

- [ ] **Step 1: Update Card.tsx**

Replace the full content of `apps/opd-lite/src/components/Card.tsx`:

```typescript
import type { ElementType, ComponentPropsWithoutRef } from 'react'

const variants = {
  primary:
    'rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50',
} as const

type CardVariant = keyof typeof variants

type CardProps<T extends ElementType = 'div'> = {
  as?: T
  variant?: CardVariant
} & ComponentPropsWithoutRef<T>

export function Card<T extends ElementType = 'div'>({
  as,
  variant = 'primary',
  className = '',
  children,
  ...rest
}: CardProps<T>) {
  const Comp = as || 'div'
  return (
    <Comp className={`${variants[variant]} ${className}`} {...rest}>
      {children}
    </Comp>
  )
}
```

> **Changes:** `bg-card-bg/70 backdrop-blur-md shadow-sm ring-gray-400/40` → `bg-card shadow-card ring-border/50`. Removed `backdrop-blur-md` (not used in admin-portal pattern; adds GPU cost with no visual benefit now that bg-card is a solid semantic color). `shadow-card` is provided by the ui-kit preset: `boxShadow: { card: 'var(--shadow-card)' }`.

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/Card.tsx
git commit -m "fix(opd-lite): Card — bg-card-bg/70 → bg-card, ring-border/50, shadow-card"
```

---

### Task 5: Migrate Button.tsx to semantic tokens

**What this fixes:** `bg-red-600`, `bg-amber-600`, `bg-white`, `text-primary-500`, `hover:bg-neutral-100`, `focus:ring-primary-300` are all hardcoded Tailwind scale values. They don't respond to dark mode or the oklch token system.

**Files:**
- Modify: `apps/opd-lite/src/components/ui/Button.tsx`

- [ ] **Step 1: Update Button.tsx**

Replace the full content of `apps/opd-lite/src/components/ui/Button.tsx`:

```typescript
import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'ghost'
  | 'outline'
  | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-pill-green text-pill-text',
  secondary: 'bg-secondary text-secondary-foreground',
  danger: 'bg-destructive text-white',
  warning: 'bg-warning/20 text-foreground border border-warning/50',
  ghost: 'bg-transparent text-primary',
  outline: 'border border-border bg-background text-foreground',
  icon: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
}

const baseText =
  'inline-flex items-center justify-center rounded-pill ' +
  'px-5 py-2 text-sm font-semibold ' +
  'transition-all duration-100 ease-out ' +
  'hover:brightness-[1.04] active:brightness-[0.88] ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'disabled:hover:brightness-100 ' +
  'motion-reduce:hover:brightness-100 motion-reduce:active:brightness-100'

const baseIcon =
  'inline-flex items-center justify-center rounded-full ' +
  'p-2 ' +
  'transition-all duration-100 ease-out ' +
  'active:brightness-[0.88] ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'motion-reduce:active:brightness-100'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      fullWidth,
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    const base = variant === 'icon' ? baseIcon : baseText

    const classes = [
      base,
      variantClasses[variant],
      fullWidth && 'w-full',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
```

> **Changes per variant:**
> - `primary`: unchanged — `bg-pill-green text-pill-text` is OPD's brand identity
> - `secondary`: `bg-neutral-200 text-neutral-700` → `bg-secondary text-secondary-foreground`
> - `danger`: `bg-red-600 text-white` → `bg-destructive text-white` (destructive token from preset, text-white explicit since destructive-foreground not in preset)
> - `warning`: `bg-amber-600 text-white` → `bg-warning/20 text-foreground border border-warning/50` (subtle, accessible; warning token from preset)
> - `ghost`: `text-primary-500` → `text-primary` (oklch primary.DEFAULT from preset)
> - `outline`: `border-neutral-300 bg-white text-neutral-700` → `border-border bg-background text-foreground`
> - `icon`: `text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700` → `text-muted-foreground hover:bg-muted hover:text-foreground`
> - focus ring: `focus:ring-primary-300` → `focus:ring-ring` (ring token = primary color)

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/ui/Button.tsx
git commit -m "fix(opd-lite): Button — migrate all variants to semantic oklch tokens"
```

---

### Task 6: Fix AllergyBanner.tsx — semantic tokens for safety-critical states

**What this fixes:** Loading and NKA states use `bg-card-bg/70` (undefined/transparent). Warning state uses `bg-yellow-50`. Active allergy state uses `bg-red-50 text-red-800` — these are Tailwind defaults that don't respond to dark mode. CLAUDE.md Rule #4 requires the allergy banner to be in red, prominent, never collapsed.

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/AllergyBanner.tsx`

- [ ] **Step 1: Update AllergyBanner.tsx**

Replace the full content of `apps/opd-lite/src/components/clinical/AllergyBanner.tsx`:

```typescript
'use client'

import { useEffect } from 'react'
import { useAllergyStore } from '@/stores/allergy-store'

interface AllergyBannerProps {
  patientId: string
}

/**
 * Persistent allergy banner — CLAUDE.md Rule #4.
 * Renders FIRST in the DOM, in red, never collapsed, never behind a tab.
 *
 * Three states:
 * - Red: active allergies present — lists all substances
 * - Neutral (gray): no known allergies (NKA)
 * - Yellow (warning): allergy data unavailable (load error)
 *
 * CSS: sticky top, z-50 — always visible, never scrolls off.
 * Accessibility: role="alert", aria-live="assertive", contrast >= 4.5:1.
 */
export function AllergyBanner({ patientId }: AllergyBannerProps) {
  const allergies = useAllergyStore((s) => s.allergies)
  const isLoading = useAllergyStore((s) => s.isLoading)
  const loadError = useAllergyStore((s) => s.loadError)
  const loadAllergies = useAllergyStore((s) => s.loadAllergies)

  useEffect(() => {
    if (patientId?.trim()) {
      loadAllergies(patientId)
    }
  }, [patientId, loadAllergies])

  if (isLoading) {
    return (
      <div
        className="mb-4 rounded-xl bg-card px-5 py-3 shadow-card ring-[0.65px] ring-border/50 text-center text-sm font-semibold text-muted-foreground transition-colors duration-200"
        role="alert"
        aria-live="polite"
        data-testid="allergy-banner"
        data-banner-state="loading"
      >
        Loading allergy data...
      </div>
    )
  }

  // Warning state: data unavailable — CLAUDE.md Rule #3
  if (loadError) {
    return (
      <div
        className="mb-4 rounded-xl bg-warning/10 px-5 py-3 shadow-card ring-[0.65px] ring-warning/40 text-center text-sm font-bold text-foreground transition-colors duration-200"
        role="alert"
        aria-live="assertive"
        data-testid="allergy-banner"
        data-banner-state="warning"
      >
        Allergy data unavailable — verify before prescribing
      </div>
    )
  }

  // Red state: active allergies present — CLAUDE.md Rule #4: in red, prominent
  if (allergies.length > 0) {
    const substanceList = allergies
      .map((a) => a._ultranos.substanceFreeText || a.code.text || 'Unknown substance')
      .join(', ')

    return (
      <div
        className="mb-4 rounded-xl bg-destructive/10 p-5 shadow-card ring-[0.65px] ring-destructive/50 text-center text-sm font-bold text-destructive transition-colors duration-200"
        role="alert"
        aria-live="assertive"
        data-testid="allergy-banner"
        data-banner-state="active"
      >
        <span aria-label={`Patient has ${allergies.length} known allergies`}>
          ALLERGIES: {substanceList}
        </span>
      </div>
    )
  }

  // Neutral state: no known allergies
  return (
    <div
      className="mb-4 rounded-xl bg-card px-5 py-3 shadow-card ring-[0.65px] ring-border/50 text-center text-sm font-semibold text-muted-foreground transition-colors duration-200"
      role="alert"
      aria-live="polite"
      data-testid="allergy-banner"
      data-banner-state="nka"
    >
      No Known Allergies (NKA)
    </div>
  )
}
```

> **Changes:** Loading/NKA: `bg-card-bg/70 ring-gray-400/40 text-neutral-600` → `bg-card ring-border/50 text-muted-foreground`. Warning: `bg-yellow-50/70 ring-yellow-400/40 text-yellow-900` → `bg-warning/10 ring-warning/40 text-foreground`. Active allergy: `bg-red-50/70 ring-red-400/40 text-red-800` → `bg-destructive/10 ring-destructive/50 text-destructive`. All states use `shadow-card` from preset.

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/clinical/AllergyBanner.tsx
git commit -m "fix(opd-lite): AllergyBanner — semantic destructive/warning/card tokens, fix broken bg-card-bg"
```

---

### Task 7: Fix search-input.tsx

**What this fixes:** `bg-white/70` is hardcoded white (invisible in dark mode). `ring-gray-400/40` bypasses token system. `focus:ring-primary-200` is the HSL-based scale token, not the ring semantic token.

**Files:**
- Modify: `apps/opd-lite/src/components/search-input.tsx`

- [ ] **Step 1: Update search-input.tsx**

Replace the full content of `apps/opd-lite/src/components/search-input.tsx`:

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search by name or National ID...' }: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external value changes (e.g., clearSearch resets store query to '')
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setLocalValue(raw)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange(raw)
    }, 250)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="w-full">
      <input
        type="search"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label="Patient search"
        className="w-full rounded-xl border-none bg-background/80 px-4 py-3 text-base font-semibold
          text-foreground placeholder:text-muted-foreground placeholder:font-normal
          ring-[0.65px] ring-border/50
          focus:ring-2 focus:ring-ring focus:outline-none
          transition-colors"
      />
    </div>
  )
}
```

> **Changes:** `bg-white/70` → `bg-background/80`. `text-neutral-900` → `text-foreground`. `placeholder:text-neutral-400` → `placeholder:text-muted-foreground`. `ring-gray-400/40` → `ring-border/50`. `focus:ring-primary-200` → `focus:ring-ring`. Removed `backdrop-blur-md`.

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/search-input.tsx
git commit -m "fix(opd-lite): search-input — bg-background, ring-border, focus:ring-ring"
```

---

### Task 8: Fix PediatricDosingBanner.tsx — remove inline styles

**What this fixes:** Inline `style={{ backgroundColor: '#ffd11a', color: '#0e0f0c' }}` bypasses the entire token system. Should use `bg-warning/25 text-foreground`.

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/PediatricDosingBanner.tsx`

- [ ] **Step 1: Update PediatricDosingBanner.tsx**

Replace the full content:

```typescript
import { calculateAge } from '@/lib/clinical-utils'

interface PediatricDosingBannerProps {
  patientBirthDate: string
  birthYearOnly?: boolean
}

export function PediatricDosingBanner({ patientBirthDate, birthYearOnly }: PediatricDosingBannerProps) {
  if (birthYearOnly) return null

  const age = calculateAge(patientBirthDate)

  if (isNaN(age) || age >= 18) return null

  return (
    <div
      role="alert"
      data-testid="pediatric-dosing-banner"
      dir="auto"
      className="mb-4 rounded-lg border border-warning/40 bg-warning/20 py-3 ps-4 pe-4 font-semibold text-foreground"
    >
      Weight-based dosing not supported — calculate manually
    </div>
  )
}
```

> **Changes:** Removed inline `style` entirely. Added `border border-warning/40 bg-warning/20 text-foreground` using semantic warning token. Added `mb-4` for consistent spacing with other banners.

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/clinical/PediatricDosingBanner.tsx
git commit -m "fix(opd-lite): PediatricDosingBanner — remove inline styles, use warning token"
```

---

## Phase 3: Page Components

---

### Task 9: Migrate PatientDirectory.tsx — full semantic sweep

**What this fixes:** The entire table uses `text-gray-*`, `bg-gray-*`, `dark:text-white`, `dark:bg-gray-*`, `border-gray-*`, `focus:border-blue-500` etc. None of these respond to dark mode via `data-theme` (they use the old `dark:` class prefix approach). Every single class must migrate to semantic tokens.

**Files:**
- Modify: `apps/opd-lite/src/components/patients/PatientDirectory.tsx`

The component logic is unchanged — only class names change. Read the current file at `apps/opd-lite/src/components/patients/PatientDirectory.tsx` and apply the following systematic replacements throughout (all occurrences):

**Replacement mapping (apply all):**

| Old class | New class |
|-----------|-----------|
| `text-gray-900 dark:text-white` | `text-foreground` |
| `text-gray-900` | `text-foreground` |
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` |
| `text-gray-500` | `text-muted-foreground` |
| `text-gray-600` | `text-muted-foreground` |
| `bg-gray-50 dark:bg-gray-800` | `bg-muted` |
| `bg-white dark:bg-gray-900` | `bg-background` |
| `bg-white` | `bg-background` |
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `border-gray-300 dark:border-gray-600` | `border-border` |
| `border-gray-300` | `border-border` |
| `divide-gray-200 dark:divide-gray-700` | `divide-border` |
| `focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white` | `focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring` |
| `border-2 border-dashed border-gray-300 dark:border-gray-600` | `border-2 border-dashed border-border` |
| `text-lg font-medium text-gray-900 dark:text-white` | `text-lg font-medium text-foreground` |
| `text-sm text-gray-500 dark:text-gray-400` | `text-sm text-muted-foreground` |
| `text-sm text-gray-500` | `text-sm text-muted-foreground` |
| `cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800` | `cursor-pointer hover:bg-muted/50 transition-colors` |
| `text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200` | `text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground` |
| `text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400` | `text-xs font-medium uppercase tracking-wider text-muted-foreground` |
| `rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800` | `rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning` |
| `bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200` | `bg-success/20 text-success` |
| `bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300` | `bg-muted text-muted-foreground` |
| `h-2 w-2 animate-pulse rounded-full bg-blue-400` | `h-2 w-2 animate-pulse rounded-full bg-primary` |
| `text-xs text-gray-400` | `text-xs text-muted-foreground` |
| `overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700` | `overflow-x-auto rounded-2xl border border-border` |
| `inline-block h-3 w-3 rounded-full bg-red-500` | `inline-block h-3 w-3 rounded-full bg-destructive` |

Also replace the search/filter input classes:
```
className="min-w-[200px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
```
→
```
className="min-w-[200px] flex-1 rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
```

Replace select/filter dropdowns:
```
className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
```
→
```
className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
```

Replace loading state text:
```
className="flex min-h-[50vh] items-center justify-center"
  <p className="text-gray-500">
```
→
```
className="flex min-h-[50vh] items-center justify-center"
  <p className="text-muted-foreground">
```

- [ ] **Step 1: Apply all replacements in PatientDirectory.tsx**

Read the current file, apply every replacement from the table above systematically (no logic changes, only class strings), then write the updated file.

- [ ] **Step 2: Run typecheck to verify no regressions**

```bash
pnpm -F opd-lite typecheck 2>&1 | grep -v "src/__tests__"
```

Expected: no new errors in source files.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/patients/PatientDirectory.tsx
git commit -m "fix(opd-lite): PatientDirectory — migrate all gray/white/blue classes to semantic tokens"
```

---

### Task 10: Fix patient-result-list.tsx

**What this fixes:** The "register new patient" link uses `border-gray-300 hover:border-blue-400 hover:text-blue-600` (Tailwind scale defaults). The divider uses `divide-neutral-100` (HSL token, not semantic).

**Files:**
- Modify: `apps/opd-lite/src/components/patient-result-list.tsx`

- [ ] **Step 1: Apply replacements in patient-result-list.tsx**

Apply these replacements:

```
"divide-neutral-100"
→ "divide-border"
```

```
"border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors min-h-[44px]"
→ "border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors min-h-[44px]"
```

The full link className becomes:
```
className="mt-4 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors min-h-[44px]"
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/components/patient-result-list.tsx
git commit -m "fix(opd-lite): patient-result-list — border-border, hover:border-primary, divide-border"
```

---

### Task 11: Fix ClinicalDashboard.tsx and TodayEncountersCard.tsx

**What this fixes:** Dashboard heading uses `text-neutral-900` (HSL token, no dark mode). Role subtitle uses `text-neutral-500`. `TodayEncountersCard` uses the same pattern across heading, count, and stat text.

**Files:**
- Modify: `apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx`
- Modify: `apps/opd-lite/src/components/dashboard/TodayEncountersCard.tsx`

- [ ] **Step 1: Update ClinicalDashboard.tsx**

Apply these replacements:

```
"text-3xl font-black tracking-tight text-neutral-900"
→ "text-3xl font-black tracking-tight text-foreground"
```

```
"mt-1 text-sm font-semibold text-neutral-500"
→ "mt-1 text-sm font-semibold text-muted-foreground"
```

- [ ] **Step 2: Update TodayEncountersCard.tsx**

Apply these replacements:

```
"text-sm font-black text-neutral-500 uppercase tracking-wide"
→ "text-sm font-black text-muted-foreground uppercase tracking-wide"
```

```
"mt-2 text-3xl font-black text-neutral-900"
→ "mt-2 text-3xl font-black text-foreground"
```

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx apps/opd-lite/src/components/dashboard/TodayEncountersCard.tsx
git commit -m "fix(opd-lite): dashboard — text-neutral → text-foreground/muted-foreground"
```

---

### Task 12: Fix encounter-dashboard.tsx — prescription banners and inline card styles

**What this fixes:** Prescription status banners use `bg-amber-50 border-amber-300 text-amber-*`, `bg-green-50 border-green-300 text-green-*`, and `bg-red-50 border-red-*` — all Tailwind defaults. Prescription list items use `bg-white`. Several headings use `text-neutral-900`, `text-neutral-500`. Active encounter uses `text-green-700` and `bg-green-500` dot.

**Files:**
- Modify: `apps/opd-lite/src/components/encounter-dashboard.tsx`

- [ ] **Step 1: Apply all replacements in encounter-dashboard.tsx**

Apply every replacement below (all occurrences):

```
"text-3xl font-black tracking-tight text-neutral-900"
→ "text-3xl font-black tracking-tight text-foreground"
```

```
"text-xl font-bold text-neutral-900"
→ "text-xl font-bold text-foreground"
```

```
"text-lg font-bold text-neutral-900"
→ "text-lg font-bold text-foreground"
```

```
"font-semibold text-neutral-900"
→ "font-semibold text-foreground"
```

```
"font-semibold text-neutral-500"
→ "font-semibold text-muted-foreground"
```

```
"text-sm text-neutral-500"
→ "text-sm text-muted-foreground"
```

```
"text-sm font-semibold text-neutral-500"
→ "text-sm font-semibold text-muted-foreground"
```

```
"mt-3 flex gap-4 text-sm font-semibold text-neutral-600"
→ "mt-3 flex gap-4 text-sm font-semibold text-muted-foreground"
```

```
"text-sm text-neutral-600"
→ "text-sm text-muted-foreground"
```

```
"text-sm font-bold text-neutral-700"
→ "text-sm font-bold text-foreground"
```

Active encounter state (green dot + label):
```
"inline-block h-3 w-3 rounded-full bg-green-500"
→ "inline-block h-3 w-3 rounded-full bg-success"
```

```
"text-lg font-bold text-green-700"
→ "text-lg font-bold text-success"
```

Medication history unavailable banner (amber):
```
"mb-4 rounded-lg border border-amber-300 bg-amber-50 ps-4 pe-4 py-3"
→ "mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"
```

```
"text-sm font-bold text-amber-800"
→ "text-sm font-bold text-foreground"
```

```
"text-xs text-amber-700"
→ "text-xs text-muted-foreground"
```

Drug interaction check unavailable banner (amber):
```
"mb-4 rounded-lg border border-amber-300 bg-amber-50 ps-4 pe-4 py-3"
→ "mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"
```

Drug interaction checking active banner (green):
```
"mb-4 rounded-lg border border-green-300 bg-green-50 ps-4 pe-4 py-3"
→ "mb-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3"
```

```
"text-sm font-bold text-green-800"
→ "text-sm font-bold text-foreground"
```

```
"text-xs text-green-700"
→ "text-xs text-muted-foreground"
```

Prescription blocked banner (red):
```
"mb-4 rounded-lg border border-red-200 bg-red-50 p-3"
→ "mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
```

```
"text-sm font-semibold text-red-800"
→ "text-sm font-semibold text-destructive"
```

Prescription error banner (red):
```
"mt-3 rounded-lg border border-red-300 bg-red-50 ps-4 pe-4 py-3"
→ "mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
```

Prescription list items (bg-white):
```
"flex items-center justify-between rounded-xl ring-[0.65px] ring-gray-400/40 bg-white ps-4 pe-4 py-3"
→ "flex items-center justify-between rounded-xl ring-[0.65px] ring-border/50 bg-card px-4 py-3"
```

Prescription separator:
```
"border-t border-neutral-200 pt-6"
→ "border-t border-border pt-6"
```

Prescription separator text:
```
"text-neutral-300"
→ "text-border"
```

Interaction badge — warning:
```
"rounded-full bg-amber-100 ps-3 pe-3 py-1 text-xs font-bold text-amber-700"
→ "rounded-full bg-warning/20 px-3 py-1 text-xs font-bold text-foreground"
```

Interaction badge — blocked/override (red):
```
"rounded-full bg-red-100 ps-3 pe-3 py-1 text-xs font-bold text-red-700"
→ "rounded-full bg-destructive/20 px-3 py-1 text-xs font-bold text-destructive"
```

Interaction badge — clear (green):
```
"rounded-full bg-green-100 ps-3 pe-3 py-1 text-xs font-bold text-green-700"
→ "rounded-full bg-success/20 px-3 py-1 text-xs font-bold text-success"
```

Interaction badge — unchecked (neutral):
```
"rounded-full bg-neutral-100 ps-3 pe-3 py-1 text-xs font-bold text-neutral-500"
→ "rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"
```

Pending fulfillment badge:
```
"rounded-full bg-amber-100 ps-3 pe-3 py-1 text-xs font-bold text-amber-700"
→ "rounded-full bg-warning/20 px-3 py-1 text-xs font-bold text-foreground"
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm -F opd-lite typecheck 2>&1 | grep -v "src/__tests__"
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/encounter-dashboard.tsx
git commit -m "fix(opd-lite): encounter-dashboard — semantic tokens for all banners, badges, and text"
```

---

## Phase 4: Final Sweep

---

### Task 13: Grep and fix remaining hardcoded classes

**What this does:** Catches any remaining files with hardcoded Tailwind scale colors or `bg-white`/`dark:` that weren't covered in Tasks 4–12.

**Files:**
- Varies — whatever the grep finds

- [ ] **Step 1: Grep for bg-white in src (excluding tests and already-fixed files)**

```bash
grep -r "bg-white\b" apps/opd-lite/src/components/ --include="*.tsx" --include="*.ts" -l | grep -v "__tests__"
```

For each file found, replace `bg-white` with `bg-background` (for full-page backgrounds) or `bg-card` (for card/panel surfaces). Read each file first to determine context before replacing.

- [ ] **Step 2: Grep for remaining dark: Tailwind classes**

```bash
grep -r "dark:bg-gray\|dark:text-gray\|dark:border-gray\|dark:text-white" apps/opd-lite/src/components/ --include="*.tsx" -l
```

For each file found, remove `dark:*` prefixed classes and replace the entire `text-gray-*/dark:text-gray-*` pair with the single semantic token equivalent (see mapping in Task 9).

- [ ] **Step 3: Grep for remaining text-gray- and bg-gray- outside already-fixed files**

```bash
grep -r "text-gray-\|bg-gray-" apps/opd-lite/src/components/ --include="*.tsx" -l | grep -v "__tests__"
```

Apply the same mapping table from Task 9 to any files found.

- [ ] **Step 4: Grep for remaining inline style color attributes**

```bash
grep -r "style={{.*background\|style={{.*color:" apps/opd-lite/src/components/ --include="*.tsx" -l | grep -v "__tests__"
```

For each found, replace with semantic token classes where possible. Note: skip chart/visualization components listed in CLAUDE.md as intentionally keeping inline SVG colors.

- [ ] **Step 5: Run tests to verify no new failures**

```bash
pnpm -F opd-lite test 2>&1 | tail -20
```

Compare pass/fail counts to the pre-existing baseline (63 test files pass, 20 fail from pre-existing issues). Verify count has not gotten worse.

- [ ] **Step 6: Commit all sweep changes**

```bash
git add apps/opd-lite/src/components/
git commit -m "fix(opd-lite): final sweep — remaining hardcoded gray/white/dark: classes to semantic tokens"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| `bg-background text-foreground` on body | Task 1 |
| Dark mode `data-theme` detection script | Task 1 |
| `ThemeProvider` for client-side toggle | Task 1 |
| `@layer base` resets (border-border, bg-background) | Task 2 |
| `tw-animate-css` for animations | Task 2 |
| Correct font loading via `var(--font-urbanist)` | Task 3 |
| `Card.tsx` `bg-card-bg` broken → `bg-card` | Task 4 |
| `Button.tsx` semantic tokens (danger, warning, secondary, ghost, outline, icon) | Task 5 |
| `AllergyBanner.tsx` allergy state = red (`bg-destructive/10 text-destructive`) | Task 6 |
| `AllergyBanner.tsx` warning state uses `bg-warning/10` | Task 6 |
| `AllergyBanner.tsx` loading/NKA states use `bg-card` | Task 6 |
| `search-input.tsx` bg-background, ring-border, focus:ring-ring | Task 7 |
| `PediatricDosingBanner.tsx` inline styles removed | Task 8 |
| `PatientDirectory.tsx` full table/filter semantic migration | Task 9 |
| `PatientDirectory.tsx` dark: prefix classes removed | Task 9 |
| `patient-result-list.tsx` border-border, hover:border-primary | Task 10 |
| `ClinicalDashboard.tsx` text-foreground/muted-foreground | Task 11 |
| `TodayEncountersCard.tsx` text-foreground/muted-foreground | Task 11 |
| `encounter-dashboard.tsx` prescription banners semantic | Task 12 |
| `encounter-dashboard.tsx` prescription list items bg-card | Task 12 |
| Remaining bg-white/dark: classes swept | Task 13 |

### Known Token Mapping Reference

For any additional files encountered during sweep:

| Old (must replace) | New (semantic token) |
|--------------------|----------------------|
| `text-neutral-900` | `text-foreground` |
| `text-neutral-700` | `text-foreground` |
| `text-neutral-600` | `text-muted-foreground` |
| `text-neutral-500` | `text-muted-foreground` |
| `text-neutral-400` | `text-muted-foreground` |
| `text-gray-900` | `text-foreground` |
| `text-gray-600` | `text-muted-foreground` |
| `text-gray-500` | `text-muted-foreground` |
| `bg-white` | `bg-background` or `bg-card` |
| `bg-neutral-50` | `bg-background` |
| `bg-neutral-100` | `bg-muted` |
| `bg-neutral-200` | `bg-secondary` |
| `bg-gray-50` | `bg-muted` |
| `border-neutral-*` | `border-border` |
| `border-gray-*` | `border-border` |
| `ring-gray-400/40` | `ring-border/50` |
| `divide-neutral-*` | `divide-border` |
| `bg-red-50/70`, `bg-red-50` | `bg-destructive/10` |
| `text-red-800` | `text-destructive` |
| `bg-amber-50` | `bg-warning/10` |
| `text-amber-800`, `text-amber-700` | `text-foreground` (warning banners) |
| `bg-green-50` | `bg-success/10` |
| `text-green-800`, `text-green-700` | `text-foreground` (success banners) |
| `text-green-700` (active indicator) | `text-success` |
| `bg-green-500` (dot) | `bg-success` |
| `bg-red-500` (dot) | `bg-destructive` |
| `focus:ring-primary-*` | `focus:ring-ring` |
| `dark:*` (all dark: prefixes) | Remove — dark mode via `data-theme`, handled by tokens |

### Do Not Replace

- `bg-pill-green`, `text-pill-text` — OPD brand identity, intentional
- `rounded-pill` — OPD brand border radius
- `focus:ring-primary-300` in pill-button.tsx — acceptable (primary-300 is still defined)
- Inline SVG fills in components listed in CLAUDE.md § Icons as intentionally kept inline
