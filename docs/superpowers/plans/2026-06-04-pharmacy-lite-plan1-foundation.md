# Pharmacy Lite Design System Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire pharmacy-lite to the admin-portal design system foundation — fonts, ThemeProvider, globals.css base resets, and all 14 shadcn component re-exports.

**Architecture:** Replace the Urbanist variable font with self-hosted Manrope (body) + Public Sans (headings) via `next/font/local`. Add a ThemeProvider wrapping the root layout with a dark-mode flash-prevention inline script. Update `globals.css` to add `@layer base` resets and `tw-animate-css` import matching admin-portal exactly. Create 14 shadcn re-export stubs in `src/components/ui/` by re-exporting from `@ultranos/ui-kit` subpath exports, and replace the hand-rolled `Button.tsx` with the same pattern while migrating all 35+ call-sites.

**Tech Stack:** Next.js 15, `next/font/local`, Tailwind CSS v3, `@ultranos/ui-kit`, `tw-animate-css`

---

## File map

| Action | Path |
|--------|------|
| Modify | `apps/pharmacy-lite/src/app/layout.tsx` |
| Modify | `apps/pharmacy-lite/src/app/globals.css` |
| Modify | `apps/pharmacy-lite/tailwind.config.ts` |
| Modify | `apps/pharmacy-lite/package.json` |
| Create | `apps/pharmacy-lite/src/components/ThemeProvider.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/button.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/badge.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/breadcrumb.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/dialog.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/dropdown-menu.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/input.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/label.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/select.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/separator.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/sheet.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/sidebar.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/skeleton.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/textarea.tsx` |
| Create | `apps/pharmacy-lite/src/components/ui/tooltip.tsx` |
| Delete | `apps/pharmacy-lite/src/components/ui/Button.tsx` |
| Add fonts | `apps/pharmacy-lite/public/fonts/manrope/` (4 woff2 files) |
| Add fonts | `apps/pharmacy-lite/public/fonts/public-sans/` (4 woff2 files) |

---

## Tasks

### Task 1: Download and commit font files

- [ ] Create the font directories:
  ```bash
  mkdir -p apps/pharmacy-lite/public/fonts/manrope
  mkdir -p apps/pharmacy-lite/public/fonts/public-sans
  ```

- [ ] Download Manrope woff2 files (weights 400, 500, 600, 700, latin subset) from Google Fonts.

  **Instructions:** Go to https://fonts.google.com/specimen/Manrope, select weights Regular 400, Medium 500, SemiBold 600, Bold 700. Click "Get font" then "Download all". Extract the zip. You will have TTF files. Convert each to woff2 using fonttools:

  ```bash
  pip install fonttools brotli
  pyftsubset Manrope-Regular.ttf \
    --output-file=apps/pharmacy-lite/public/fonts/manrope/Manrope-Regular.woff2 \
    --flavor=woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  pyftsubset Manrope-Medium.ttf \
    --output-file=apps/pharmacy-lite/public/fonts/manrope/Manrope-Medium.woff2 \
    --flavor=woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  pyftsubset Manrope-SemiBold.ttf \
    --output-file=apps/pharmacy-lite/public/fonts/manrope/Manrope-SemiBold.woff2 \
    --flavor=woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  pyftsubset Manrope-Bold.ttf \
    --output-file=apps/pharmacy-lite/public/fonts/manrope/Manrope-Bold.woff2 \
    --flavor=woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  ```

  The four files must be named exactly:
  - `apps/pharmacy-lite/public/fonts/manrope/Manrope-Regular.woff2`
  - `apps/pharmacy-lite/public/fonts/manrope/Manrope-Medium.woff2`
  - `apps/pharmacy-lite/public/fonts/manrope/Manrope-SemiBold.woff2`
  - `apps/pharmacy-lite/public/fonts/manrope/Manrope-Bold.woff2`

- [ ] Download Public Sans woff2 files (weights 400, 500, 600, 700) from https://fonts.google.com/specimen/Public+Sans using the same process:

  ```bash
  pyftsubset "PublicSans-Regular.ttf" \
    --output-file=apps/pharmacy-lite/public/fonts/public-sans/PublicSans-Regular.woff2 \
    --flavor=woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  pyftsubset "PublicSans-Medium.ttf" \
    --output-file=apps/pharmacy-lite/public/fonts/public-sans/PublicSans-Medium.woff2 \
    --flavor=woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  pyftsubset "PublicSans-SemiBold.ttf" \
    --output-file=apps/pharmacy-lite/public/fonts/public-sans/PublicSans-SemiBold.woff2 \
    --flavor=woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  pyftsubset "PublicSans-Bold.ttf" \
    --output-file=apps/pharmacy-lite/public/fonts/public-sans/PublicSans-Bold.woff2 \
    --flavor=woff2 \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
  ```

  The four files must be named exactly:
  - `apps/pharmacy-lite/public/fonts/public-sans/PublicSans-Regular.woff2`
  - `apps/pharmacy-lite/public/fonts/public-sans/PublicSans-Medium.woff2`
  - `apps/pharmacy-lite/public/fonts/public-sans/PublicSans-SemiBold.woff2`
  - `apps/pharmacy-lite/public/fonts/public-sans/PublicSans-Bold.woff2`

- [ ] Verify both directories contain exactly 4 files each:
  ```bash
  ls apps/pharmacy-lite/public/fonts/manrope/
  ls apps/pharmacy-lite/public/fonts/public-sans/
  ```
  Expected output for each:
  ```
  Manrope-Bold.woff2  Manrope-Medium.woff2  Manrope-Regular.woff2  Manrope-SemiBold.woff2
  PublicSans-Bold.woff2  PublicSans-Medium.woff2  PublicSans-Regular.woff2  PublicSans-SemiBold.woff2
  ```

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/public/fonts/
  git commit -m "chore(pharmacy-lite): add Manrope and Public Sans woff2 font files"
  ```

---

### Task 2: Create ThemeProvider

- [ ] Create `apps/pharmacy-lite/src/components/ThemeProvider.tsx` — identical to admin-portal's ThemeProvider:

  ```tsx
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

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/components/ThemeProvider.tsx
  git commit -m "feat(pharmacy-lite): add ThemeProvider for dark mode support"
  ```

---

### Task 3: Update layout.tsx

- [ ] Replace `apps/pharmacy-lite/src/app/layout.tsx` entirely. The current file uses `localFont` for Urbanist — replace it with two `localFont` calls for Manrope and Public Sans, add `suppressHydrationWarning` on `<html>`, inject the theme flash-prevention script in `<head>`, and wrap children with `ThemeProvider`:

  ```tsx
  import type { Metadata } from 'next'
  import localFont from 'next/font/local'
  import { getLocale } from 'next-intl/server'
  import { getDirection } from '@ultranos/ui-kit'
  import { ClientErrorBoundary } from '@/components/ClientErrorBoundary'
  import { ThemeProvider } from '@/components/ThemeProvider'
  import './globals.css'

  const manrope = localFont({
    src: [
      { path: '../../public/fonts/manrope/Manrope-Regular.woff2',  weight: '400', style: 'normal' },
      { path: '../../public/fonts/manrope/Manrope-Medium.woff2',   weight: '500', style: 'normal' },
      { path: '../../public/fonts/manrope/Manrope-SemiBold.woff2', weight: '600', style: 'normal' },
      { path: '../../public/fonts/manrope/Manrope-Bold.woff2',     weight: '700', style: 'normal' },
    ],
    variable: '--font-manrope',
    display: 'swap',
  })

  const publicSans = localFont({
    src: [
      { path: '../../public/fonts/public-sans/PublicSans-Regular.woff2',  weight: '400', style: 'normal' },
      { path: '../../public/fonts/public-sans/PublicSans-Medium.woff2',   weight: '500', style: 'normal' },
      { path: '../../public/fonts/public-sans/PublicSans-SemiBold.woff2', weight: '600', style: 'normal' },
      { path: '../../public/fonts/public-sans/PublicSans-Bold.woff2',     weight: '700', style: 'normal' },
    ],
    variable: '--font-public-sans',
    display: 'swap',
  })

  const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()` 

  export const metadata: Metadata = {
    title: 'Pharmacy Lite — Prescription Fulfillment',
    description: 'Ultranos Pharmacy Lite PWA for medication dispensing',
  }

  export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale()
    const dir = getDirection(locale)
    const isRtl = dir === 'rtl'

    return (
      <html
        lang={locale}
        dir={dir}
        suppressHydrationWarning
        className={`${manrope.variable} ${publicSans.variable}`}
      >
        <head>
          {isRtl && <link rel="stylesheet" href="/fonts-arabic.css" />}
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/app/layout.tsx
  git commit -m "feat(pharmacy-lite): add Manrope/PublicSans fonts, ThemeProvider, dark mode flash script"
  ```

---

### Task 4: Update tailwind.config.ts

- [ ] The current `tailwind.config.ts` only has `font-sans` in `fontFamily`. Add the `heading` family. Replace the file entirely (all other existing keys are preserved verbatim):

  ```ts
  import type { Config } from 'tailwindcss'
  import preset from '@ultranos/ui-kit/tailwind.preset'

  const config: Config = {
    presets: [preset],
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
      extend: {
        fontFamily: {
          sans:    ['var(--font-family-sans)', 'system-ui', 'sans-serif'],
          heading: ['var(--font-family-heading)', 'system-ui', 'sans-serif'],
        },
        fontWeight: {
          black: '900',
        },
        colors: {
          primary: {
            50:  'var(--color-primary-50)',
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
            50:  'var(--color-neutral-50)',
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
          'pill-text':  '#163300',
          danger: 'var(--color-danger)',
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

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/tailwind.config.ts
  git commit -m "chore(pharmacy-lite): add heading font family to tailwind config"
  ```

---

### Task 5: Update globals.css and add tw-animate-css

- [ ] Replace `apps/pharmacy-lite/src/app/globals.css` with the version that adds the font CSS variables, the `@layer base` resets matching admin-portal, and the `tw-animate-css` import. The `@media print` block from the original is preserved:

  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  @import '@ultranos/ui-kit/tokens.css';

  @import "tw-animate-css";

  /* ── Font overrides: Manrope replaces Urbanist as body font ── */
  :root {
    --font-family-sans:    var(--font-manrope), system-ui, sans-serif;
    --font-family-heading: var(--font-public-sans), system-ui, sans-serif;
  }
  [dir="rtl"] {
    --font-family-sans: var(--font-family-sans-ar);
  }

  /* ── Base resets (matches admin-portal) ── */
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

- [ ] Add `tw-animate-css` to `devDependencies` in `apps/pharmacy-lite/package.json`. Open the file and add the entry inside `devDependencies` (alphabetically between `typescript` and `vitest`):

  ```json
  "tw-animate-css": "^1.2.0",
  ```

  The full `devDependencies` block after the edit:
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
    "tw-animate-css": "^1.2.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
  ```

- [ ] Install the new dependency:
  ```bash
  pnpm install
  ```
  Expected: `tw-animate-css` appears in `node_modules`, lockfile updated.

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/app/globals.css apps/pharmacy-lite/package.json pnpm-lock.yaml
  git commit -m "feat(pharmacy-lite): add base layer resets, font vars, tw-animate-css"
  ```

---

### Task 6: Create shadcn component re-exports

Create 13 files in `apps/pharmacy-lite/src/components/ui/` (excluding `button.tsx` — that is handled in Task 7 with the migration). Each file re-exports everything from the corresponding `@ultranos/ui-kit` subpath export.

- [ ] Create `apps/pharmacy-lite/src/components/ui/badge.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/badge'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/breadcrumb.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/breadcrumb'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/dialog.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/dialog'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/dropdown-menu.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/dropdown-menu'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/input.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/input'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/label.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/label'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/select.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/select'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/separator.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/separator'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/sheet.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/sheet'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/sidebar.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/sidebar'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/skeleton.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/skeleton'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/textarea.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/textarea'
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/tooltip.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/tooltip'
  ```

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/components/ui/badge.tsx \
          apps/pharmacy-lite/src/components/ui/breadcrumb.tsx \
          apps/pharmacy-lite/src/components/ui/dialog.tsx \
          apps/pharmacy-lite/src/components/ui/dropdown-menu.tsx \
          apps/pharmacy-lite/src/components/ui/input.tsx \
          apps/pharmacy-lite/src/components/ui/label.tsx \
          apps/pharmacy-lite/src/components/ui/select.tsx \
          apps/pharmacy-lite/src/components/ui/separator.tsx \
          apps/pharmacy-lite/src/components/ui/sheet.tsx \
          apps/pharmacy-lite/src/components/ui/sidebar.tsx \
          apps/pharmacy-lite/src/components/ui/skeleton.tsx \
          apps/pharmacy-lite/src/components/ui/textarea.tsx \
          apps/pharmacy-lite/src/components/ui/tooltip.tsx
  git commit -m "feat(pharmacy-lite): add 13 shadcn ui component re-exports from ui-kit"
  ```

---

### Task 7: Replace hand-rolled Button.tsx with ui-kit re-export and migrate all usages

The existing `Button.tsx` uses variants `primary`, `secondary`, `danger`, `warning`, `ghost`, `outline` and a `fullWidth` boolean prop. The shadcn Button from ui-kit uses `default`, `secondary`, `destructive`, `outline`, `ghost`, `link` variants and no `fullWidth` prop (use `className="w-full"` instead). The mapping is:

| Old variant | New variant | Notes |
|-------------|-------------|-------|
| `primary` | `default` | |
| `secondary` | `secondary` | no change |
| `danger` | `destructive` | |
| `warning` | `outline` + extra className | add `className="border-warning text-warning hover:bg-warning/10"` |
| `ghost` | `ghost` | no change |
| `outline` | `outline` | no change |
| `fullWidth` prop | `className="w-full"` | merge with any existing className |

**Step 1:** Delete the old Button and create the re-export.

- [ ] Delete `apps/pharmacy-lite/src/components/ui/Button.tsx`:
  ```bash
  git rm apps/pharmacy-lite/src/components/ui/Button.tsx
  ```

- [ ] Create `apps/pharmacy-lite/src/components/ui/button.tsx`:
  ```ts
  export * from '@ultranos/ui-kit/components/ui/button'
  ```

**Step 2:** Migrate `apps/pharmacy-lite/src/app/[locale]/login/page.tsx`

- [ ] Change the import from `@/components/ui/Button` to `@/components/ui/button` (lowercase).
- [ ] Change `<Button variant="primary" type="submit" disabled={loading} fullWidth>` to:
  ```tsx
  <Button variant="default" type="submit" disabled={loading} className="w-full">
  ```
- [ ] Change `<Button variant="primary" type="submit" disabled={loading || totpCode.length !== 6} fullWidth>` to:
  ```tsx
  <Button variant="default" type="submit" disabled={loading || totpCode.length !== 6} className="w-full">
  ```
- [ ] Change `<Button variant="ghost" fullWidth type="button" onClick={handleBackToSignIn}>` to:
  ```tsx
  <Button variant="ghost" type="button" onClick={handleBackToSignIn} className="w-full">
  ```

**Step 3:** Migrate `apps/pharmacy-lite/src/app/[locale]/paper-rx/page.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Find all `variant="primary"` → `variant="default"`.
- [ ] Find all `fullWidth` (standalone prop) → `className="w-full"` (if there is already a `className` prop, append `w-full` to the existing string; if no `className`, add `className="w-full"`).
- [ ] `variant="secondary"` stays as `variant="secondary"`.
- [ ] Any `variant="danger"` → `variant="destructive"`.
- [ ] Any `variant="warning"` → `variant="outline" className="border-warning text-warning hover:bg-warning/10"`.

**Step 4:** Migrate `apps/pharmacy-lite/src/components/InstallPrompt.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.

**Step 5:** Migrate `apps/pharmacy-lite/src/components/patient/PatientEditModal.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.

**Step 6:** Migrate `apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="secondary"` stays.

**Step 7:** Migrate `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `fullWidth` → `className="w-full"`.
- [ ] `variant="secondary"` stays.

**Step 8:** Migrate `apps/pharmacy-lite/src/components/pharmacy/DispensingHistoryView.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="secondary"` stays.

**Step 9:** Migrate `apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.

**Step 10:** Migrate `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="secondary"` stays.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `fullWidth` → `className="w-full"`.

**Step 11:** Migrate `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping as above.

**Step 12:** Migrate `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockItemRow.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping as above.

**Step 13:** Migrate `apps/pharmacy-lite/src/components/pharmacy/inventory/StockOverviewPage.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.

**Step 14:** Migrate `apps/pharmacy-lite/src/components/pharmacy/LabelPreviewPanel.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.

**Step 15:** Migrate `apps/pharmacy-lite/src/components/pharmacy/ManualRxEntry.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `variant="warning"` → `variant="outline" className="border-warning text-warning hover:bg-warning/10"`.

**Step 16:** Migrate `apps/pharmacy-lite/src/components/pharmacy/OfflineGraceForm.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="warning"` → `variant="outline" className="border-warning text-warning hover:bg-warning/10"`.

**Step 17:** Migrate `apps/pharmacy-lite/src/components/pharmacy/Pagination.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="secondary"` stays.

**Step 18:** Migrate `apps/pharmacy-lite/src/components/pharmacy/PatientRegistrationForm.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `fullWidth` → `className="w-full"`.
- [ ] `variant="secondary"` stays.

**Step 19:** Migrate `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `variant="secondary"` stays.
- [ ] `variant="danger"` → `variant="destructive"`.
- [ ] `variant="warning"` → `variant="outline" className="border-warning text-warning hover:bg-warning/10"`.
- [ ] `fullWidth` → `className="w-full"` (merge with existing `className` if present).

**Step 20:** Migrate `apps/pharmacy-lite/src/components/pharmacy/pos/CashDrawerPage.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"` (the `className="w-full"` is already present on these buttons — keep it).

**Step 21:** Migrate `apps/pharmacy-lite/src/components/pharmacy/pos/PatientAccountsPage.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="secondary"` stays.
- [ ] `variant="primary"` → `variant="default"`.

**Step 22:** Migrate `apps/pharmacy-lite/src/components/pharmacy/pos/PaymentForm.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"` (`className="w-full"` already present).

**Step 23:** Migrate `apps/pharmacy-lite/src/components/pharmacy/pos/PosPage.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="secondary"` stays.
- [ ] `variant="primary"` → `variant="default"`.

**Step 24:** Migrate `apps/pharmacy-lite/src/components/pharmacy/PrescriptionScanner.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `variant="secondary"` stays.
- [ ] `variant="warning"` → `variant="outline" className="border-warning text-warning hover:bg-warning/10"`.
- [ ] `fullWidth` → `className="w-full"`.

**Step 25:** Migrate `apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountForm.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping.

**Step 26:** Migrate `apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountPage.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `variant="secondary"` stays.
- [ ] `variant="danger"` → `variant="destructive"`.
- [ ] `fullWidth` → `className="w-full"`.

**Step 27:** Migrate `apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierForm.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping.

**Step 28:** Migrate `apps/pharmacy-lite/src/components/pharmacy/procurement/SuppliersPage.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping.

**Step 29:** Migrate `apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="danger"` → `variant="destructive"`.

**Step 30:** Migrate `apps/pharmacy-lite/src/components/pharmacy/SyncCapacityBanner.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping.

**Step 31:** Migrate `apps/pharmacy-lite/src/components/pharmacy/SyncQueueDashboard.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="danger"` → `variant="destructive"`.

**Step 32:** Migrate `apps/pharmacy-lite/src/components/pharmacy/SyncQueueEntry.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `variant="warning"` → `variant="outline" className="border-warning text-warning hover:bg-warning/10"`.

**Step 33:** Migrate `apps/pharmacy-lite/src/components/pharmacy/transfers/TransferCard.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `variant="danger"` → `variant="destructive"`.

**Step 34:** Migrate `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `variant="danger"` → `variant="destructive"`.

**Step 35:** Migrate `apps/pharmacy-lite/src/components/registration/ConsentSection.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping.

**Step 36:** Migrate `apps/pharmacy-lite/src/components/registration/ConsentTextModal.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.

**Step 37:** Migrate `apps/pharmacy-lite/src/components/registration/MpiResultModal.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `fullWidth` → `className="w-full"`.
- [ ] `variant="secondary"` stays.
- [ ] `variant="warning"` → `variant="outline" className="border-warning text-warning hover:bg-warning/10"`.

**Step 38:** Migrate `apps/pharmacy-lite/src/components/registration/PatientRegistrationForm.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.
- [ ] `fullWidth` → `className="w-full"`.

**Step 39:** Migrate `apps/pharmacy-lite/src/components/shared/DistrictAutocomplete.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping.

**Step 40:** Migrate `apps/pharmacy-lite/src/components/shared/ProvinceAutocomplete.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] Apply variant mapping.

**Step 41:** Migrate `apps/pharmacy-lite/src/components/SwUpdateNotification.tsx`

- [ ] Change import to `@/components/ui/button`.
- [ ] `variant="primary"` → `variant="default"`.

**Step 42:** Run a grep to confirm no remaining old Button imports exist:
```bash
grep -r "from '@/components/ui/Button'" apps/pharmacy-lite/src/
```
Expected: no output (zero matches).

**Step 43:** Run a grep to confirm no remaining old variant names that don't exist in shadcn Button:
```bash
grep -rn 'variant="primary"\|variant="danger"\| fullWidth' apps/pharmacy-lite/src/ --include="*.tsx" --include="*.ts"
```
Expected: no output (zero matches). Note: `variant="warning"` no longer exists either — the mapping replaces it with `variant="outline"` + className, so there should be no remaining `variant="warning"` either.

**Step 44:** Commit:
```bash
git add apps/pharmacy-lite/src/
git commit -m "refactor(pharmacy-lite): replace hand-rolled Button with ui-kit re-export, migrate variants"
```

---

### Task 8: Verify Plan 1

- [ ] Run typecheck and confirm zero new errors in non-test source files:
  ```bash
  pnpm -F pharmacy-lite typecheck 2>&1 | grep "error TS" | grep -v "__tests__"
  ```
  Expected: no output.

- [ ] Run tests and confirm same pass/fail count as baseline:
  ```bash
  pnpm -F pharmacy-lite test 2>&1 | tail -5
  ```
  Expected: test suite passes with same results as before this plan (the button-accessibility test may need its import path updated — if so, change `@/components/ui/Button` to `@/components/ui/button` in the test file).

- [ ] Run build to confirm successful compilation:
  ```bash
  pnpm -F pharmacy-lite build 2>&1 | tail -10
  ```
  Expected: `Route (app)` table printed, `✓ Compiled successfully` (or Next.js equivalent). If build fails with font-related `Cannot find module`, verify the 8 woff2 files exist in `public/fonts/`.

- [ ] If the `__tests__/button-accessibility.test.tsx` imports from `@/components/ui/Button`, update it:
  ```bash
  grep -n "Button" apps/pharmacy-lite/src/__tests__/button-accessibility.test.tsx
  ```
  If found, change `from '@/components/ui/Button'` → `from '@/components/ui/button'` and update any `variant="primary"` in the test to `variant="default"`.
