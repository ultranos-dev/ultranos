# Admin Portal — Radix Rhea Theme Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `apps/admin-portal` from its custom OKLCH token system to ShadCN's Radix Rhea naming convention, applying the teal-green palette, Manrope + Public Sans fonts, and 0.625rem border radius throughout.

**Architecture:** Three config files establish the new token foundation (`globals.css`, `tailwind.config.ts`, `layout.tsx`). A tested Node.js codemod script then renames all Tailwind utility classes across ~90 component files in one deterministic pass. `Sidebar.tsx` is excluded from the codemod and updated manually because it uses hardcoded dark-background classes that have no mechanical mapping.

**Tech Stack:** Tailwind CSS v3.4, Next.js 15 `next/font/google`, Node.js ESM (`node:fs`, `node:path`), Node.js built-in test runner (`node:test`)

**Design spec:** `docs/superpowers/specs/2026-06-02-admin-portal-radix-rhea-theme-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `apps/admin-portal/src/app/globals.css` | Replace custom tokens with ShadCN Radix Rhea CSS vars (raw OKLCH channels) |
| Modify | `apps/admin-portal/tailwind.config.ts` | New color map, font families, radius, darkMode selector |
| Modify | `apps/admin-portal/src/app/layout.tsx` | Load Manrope + Public Sans via `next/font/google` |
| Create | `scripts/migrate-admin-tokens.mjs` | Codemod: rename all Tailwind token classes across admin-portal |
| Create | `scripts/__tests__/migrate-admin-tokens.test.mjs` | Tests for the `migrateContent` function |
| Modify | `apps/admin-portal/src/components/Sidebar.tsx` | Manual update: replace hardcoded dark-bg classes with sidebar tokens |
| Modify | `apps/admin-portal/src/**/*.test.tsx` (snapshots) | Update snapshots after class renames |

---

## Task 1: Replace globals.css

**Files:**
- Modify: `apps/admin-portal/src/app/globals.css`

- [ ] **Step 1: Replace the entire file contents**

  The key change is storing raw OKLCH channel values (`L C H`, not `oklch(…)` wrappers) so Tailwind opacity modifiers like `bg-primary/10` work. The `@import '@ultranos/ui-kit/tokens.css'` line is kept — it provides RTL infrastructure and allergy safety tokens that other packages depend on.

  Replace the entire file with:

  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  @import '@ultranos/ui-kit/tokens.css';

  /* ── Light mode ── */
  :root {
    /* Raw L C H channel values — enables bg-primary/10, text-destructive/80, etc. */
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

    /* Custom extensions — no ShadCN equivalent */
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

    --shadow-card: none;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/admin-portal/src/app/globals.css
  git commit -m "feat(admin-portal): replace custom OKLCH tokens with ShadCN Radix Rhea CSS vars"
  ```

---

## Task 2: Replace tailwind.config.ts

**Files:**
- Modify: `apps/admin-portal/tailwind.config.ts`

- [ ] **Step 1: Replace the entire file contents**

  Note: `darkMode: ['selector', '[data-theme="dark"]']` works with Tailwind v3.4+. The `<alpha-value>` placeholder is Tailwind v3's mechanism for opacity modifiers — it is a literal string in the config, not a typo.

  ```ts
  import type { Config } from 'tailwindcss'

  const config: Config = {
    darkMode: ['selector', '[data-theme="dark"]'],
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
      extend: {
        fontFamily: {
          sans:    ["'Manrope'", 'system-ui', '-apple-system', 'sans-serif'],
          heading: ["'Public Sans'", 'system-ui', '-apple-system', 'sans-serif'],
        },
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

  export default config
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/admin-portal/tailwind.config.ts
  git commit -m "feat(admin-portal): adopt ShadCN token naming in Tailwind config, add Manrope/Public Sans"
  ```

---

## Task 3: Load Manrope + Public Sans fonts

**Files:**
- Modify: `apps/admin-portal/src/app/layout.tsx`

- [ ] **Step 1: Add font imports and apply CSS variable classes to `<html>`**

  `next/font/google` is built into Next.js — no package installation needed. `display: 'swap'` prevents invisible text during font load.

  ```tsx
  import type { Metadata } from 'next'
  import { Manrope, Public_Sans } from 'next/font/google'
  import './globals.css'
  import { AuthGuard } from '@/components/AuthGuard'
  import { ThemeProvider } from '@/components/ThemeProvider'

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

  export const metadata: Metadata = {
    title: 'Ultranos Admin Portal',
    description: 'Back-office administration for provider verification, lab approvals, and operational alerts',
  }

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html
        lang="en"
        dir="ltr"
        suppressHydrationWarning
        className={`${manrope.variable} ${publicSans.variable}`}
      >
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
            }}
          />
        </head>
        <body className="font-sans bg-background text-foreground antialiased">
          <ThemeProvider>
            <AuthGuard>
              {children}
            </AuthGuard>
          </ThemeProvider>
        </body>
      </html>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/admin-portal/src/app/layout.tsx
  git commit -m "feat(admin-portal): load Manrope and Public Sans via next/font/google"
  ```

---

## Task 4: Write the codemod — tests first

**Files:**
- Create: `scripts/__tests__/migrate-admin-tokens.test.mjs`
- Create: `scripts/migrate-admin-tokens.mjs` (stub)

The codemod's logic lives in a pure `migrateContent(string): string` function that we can test without touching the filesystem.

- [ ] **Step 1: Create the test file**

  ```js
  // scripts/__tests__/migrate-admin-tokens.test.mjs
  import { test } from 'node:test'
  import assert from 'node:assert/strict'
  import { migrateContent } from '../migrate-admin-tokens.mjs'

  test('renames bg-canvas to bg-background', () => {
    assert.equal(
      migrateContent('className="bg-canvas"'),
      'className="bg-background"'
    )
  })

  test('renames bg-surface-raised before bg-surface (order matters)', () => {
    assert.equal(
      migrateContent('className="bg-surface-raised bg-surface"'),
      'className="bg-popover bg-card"'
    )
  })

  test('renames text-text-secondary and text-text-primary in one string', () => {
    assert.equal(
      migrateContent('className="text-text-secondary text-text-primary"'),
      'className="text-muted-foreground text-foreground"'
    )
  })

  test('renames text-text-muted to text-muted-foreground', () => {
    assert.equal(
      migrateContent('placeholder:text-text-muted'),
      'placeholder:text-muted-foreground'
    )
  })

  test('renames bg-accent-subtle to bg-primary/10', () => {
    assert.equal(
      migrateContent('className="bg-accent-subtle"'),
      'className="bg-primary/10"'
    )
  })

  test('does not rename bg-accent when bg-accent-subtle appears first', () => {
    assert.equal(
      migrateContent('className="bg-accent-subtle bg-accent"'),
      'className="bg-primary/10 bg-primary"'
    )
  })

  test('renames danger to destructive including border-s variant', () => {
    assert.equal(
      migrateContent('className="border-s-2 border-s-danger border-danger bg-danger-subtle text-danger"'),
      'className="border-s-2 border-s-destructive border-destructive bg-destructive/10 text-destructive"'
    )
  })

  test('handles opacity modifiers on renamed tokens', () => {
    assert.equal(
      migrateContent('border-accent/20'),
      'border-primary/20'
    )
  })

  test('handles responsive and variant prefixes', () => {
    assert.equal(
      migrateContent('hover:bg-surface-raised lg:text-text-primary'),
      'hover:bg-popover lg:text-foreground'
    )
  })

  test('handles template literal class strings', () => {
    assert.equal(
      migrateContent('`rounded-2xl bg-canvas p-6 ${condition ? "text-danger" : "text-text-secondary"}`'),
      '`rounded-2xl bg-background p-6 ${condition ? "text-destructive" : "text-muted-foreground"}`'
    )
  })

  test('does not rename partial token matches', () => {
    // mybg-canvas should not be touched
    assert.equal(
      migrateContent('mybg-canvas not-bg-surface'),
      'mybg-canvas not-bg-surface'
    )
  })

  test('renames ring-accent to ring-primary', () => {
    assert.equal(
      migrateContent('focus:ring-2 focus:ring-accent'),
      'focus:ring-2 focus:ring-primary'
    )
  })

  test('renames text-text-on-dark including with opacity modifier', () => {
    assert.equal(
      migrateContent('text-text-on-dark text-text-on-dark/40'),
      'text-primary-foreground text-primary-foreground/40'
    )
  })
  ```

- [ ] **Step 2: Create stub implementation so tests can be imported**

  ```js
  // scripts/migrate-admin-tokens.mjs
  export function migrateContent(content) {
    return content
  }
  ```

- [ ] **Step 3: Run tests to confirm they all fail**

  ```bash
  node --test scripts/__tests__/migrate-admin-tokens.test.mjs
  ```

  Expected: all 13 tests fail with assertion errors (stub returns content unchanged).

---

## Task 5: Implement the codemod

**Files:**
- Modify: `scripts/migrate-admin-tokens.mjs`

- [ ] **Step 1: Implement `migrateContent` and the file-walking main function**

  Replace the stub with the full implementation:

  ```js
  // scripts/migrate-admin-tokens.mjs
  import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
  import { join, extname } from 'node:path'
  import { fileURLToPath } from 'node:url'

  // Order matters: longer/more-specific tokens first to avoid partial-match collisions.
  // e.g. bg-surface-raised must be processed before bg-surface.
  const RENAMES = [
    // Surface hierarchy
    ['bg-surface-raised',   'bg-popover'],
    ['bg-surface',          'bg-card'],
    ['bg-canvas',           'bg-background'],

    // Text tokens — longest first
    ['text-text-secondary', 'text-muted-foreground'],
    ['text-text-primary',   'text-foreground'],
    ['text-text-on-dark',   'text-primary-foreground'],
    ['text-text-muted',     'text-muted-foreground'],

    // Accent → primary — longer variants first
    ['bg-accent-subtle',    'bg-primary/10'],
    ['bg-accent-hover',     'bg-primary/90'],
    ['bg-accent',           'bg-primary'],
    ['text-accent',         'text-primary'],
    ['border-accent',       'border-primary'],
    ['ring-accent',         'ring-primary'],

    // Danger → destructive — longer variants first
    ['bg-danger-subtle',    'bg-destructive/10'],
    ['border-s-danger',     'border-s-destructive'],
    ['bg-danger',           'bg-destructive'],
    ['text-danger',         'text-destructive'],
    ['border-danger',       'border-destructive'],
    ['ring-danger',         'ring-destructive'],

    // Warning/success subtle variants
    ['bg-warning-subtle',   'bg-warning/10'],
    ['bg-success-subtle',   'bg-success/10'],
  ]

  // Files where codemod must not run (handled manually — see Task 7).
  const EXCLUDED = [
    'apps/admin-portal/src/components/Sidebar.tsx',
  ]

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  export function migrateContent(content) {
    let result = content
    for (const [from, to] of RENAMES) {
      // Match `from` only when it's not preceded or followed by a word char or hyphen.
      // This handles: plain classes, :variant prefixes (hover:, focus:, lg:), and
      // opacity modifiers (border-accent/20 → border-primary/20).
      const regex = new RegExp(`(?<![\\w-])${escapeRegex(from)}(?![\\w-])`, 'g')
      result = result.replace(regex, to)
    }
    return result
  }

  function* walkDir(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        yield* walkDir(fullPath)
      } else if (entry.isFile()) {
        const ext = extname(entry.name)
        if (ext === '.tsx' || ext === '.ts' || ext === '.css') {
          yield fullPath
        }
      }
    }
  }

  // Main — only runs when script is executed directly, not when imported by tests.
  const isMain = process.argv[1] === fileURLToPath(import.meta.url)
  if (isMain) {
    const DRY_RUN = process.argv.includes('--dry-run')
    const TARGET_DIR = 'apps/admin-portal/src'

    // Normalise to forward slashes for cross-platform path comparison
    const excluded = EXCLUDED.map(p => p.replace(/\\/g, '/'))

    let changedCount = 0
    for (const file of walkDir(TARGET_DIR)) {
      const normalised = file.replace(/\\/g, '/')
      if (excluded.some(ex => normalised.endsWith(ex.split('/').slice(-3).join('/')))) {
        console.log(`Skipping (manual): ${file}`)
        continue
      }

      const original = readFileSync(file, 'utf-8')
      const migrated = migrateContent(original)
      if (migrated === original) continue

      changedCount++
      if (DRY_RUN) {
        console.log(`\n[DRY RUN] ${file}`)
        const origLines = original.split('\n')
        const migLines  = migrated.split('\n')
        for (let i = 0; i < origLines.length; i++) {
          if (origLines[i] !== migLines[i]) {
            console.log(`  - ${origLines[i].trimEnd()}`)
            console.log(`  + ${migLines[i].trimEnd()}`)
          }
        }
      } else {
        writeFileSync(file, migrated, 'utf-8')
        console.log(`Updated: ${file}`)
      }
    }

    console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${changedCount} file(s).`)
  }
  ```

- [ ] **Step 2: Run the tests — all should pass**

  ```bash
  node --test scripts/__tests__/migrate-admin-tokens.test.mjs
  ```

  Expected output: 13 passing tests, 0 failures.

- [ ] **Step 3: Commit**

  ```bash
  git add scripts/migrate-admin-tokens.mjs scripts/__tests__/migrate-admin-tokens.test.mjs
  git commit -m "feat: add tested token codemod for admin-portal Radix Rhea migration"
  ```

---

## Task 6: Run the codemod

**Files:**
- Modify: `apps/admin-portal/src/**/*.{tsx,ts,css}` (excluding `Sidebar.tsx`)

- [ ] **Step 1: Dry run — review the diff**

  ```bash
  node scripts/migrate-admin-tokens.mjs --dry-run 2>&1 | head -100
  ```

  Expected: lines like:
  ```
  [DRY RUN] apps/admin-portal/src/app/dashboard/page.tsx
    - className={`rounded-2xl bg-accent-subtle p-6 ...
    + className={`rounded-2xl bg-primary/10 p-6 ...
  Skipping (manual): apps/admin-portal/src/components/Sidebar.tsx
  Would update N file(s).
  ```

  Scan the output for unexpected replacements. The script should NOT touch `Sidebar.tsx`. If something looks wrong, fix the `RENAMES` table and re-run the dry-run before proceeding.

- [ ] **Step 2: Apply the codemod**

  ```bash
  node scripts/migrate-admin-tokens.mjs
  ```

  Expected: `Updated N file(s).` with no errors.

- [ ] **Step 3: Spot-check a few files**

  Open `apps/admin-portal/src/app/dashboard/page.tsx` and confirm:
  - `bg-accent-subtle` → `bg-primary/10`
  - `text-danger` → `text-destructive`
  - `bg-surface-raised` → `bg-popover`
  - `text-text-secondary` → `text-muted-foreground`
  - No occurrences of old token names remain (a quick grep confirms):

  ```bash
  grep -r "bg-canvas\|bg-surface\|text-text-primary\|text-text-secondary\|text-accent\|text-danger\|bg-accent" \
    apps/admin-portal/src \
    --include="*.tsx" \
    --include="*.ts" \
    -l 2>/dev/null
  ```

  Expected: only `Sidebar.tsx` appears (which was intentionally skipped).

- [ ] **Step 4: Commit**

  ```bash
  git add apps/admin-portal/src
  git commit -m "refactor(admin-portal): apply ShadCN token rename codemod (Radix Rhea migration)"
  ```

---

## Task 7: Update Sidebar.tsx manually

**Files:**
- Modify: `apps/admin-portal/src/components/Sidebar.tsx`

The sidebar switches from a dark green background to a light near-white background. Every class that assumed a dark background must be replaced with sidebar-specific tokens. This file was excluded from the codemod; all changes happen here.

- [ ] **Step 1: Apply all class changes**

  Make the following targeted edits (shown as before → after for each className):

  **`<aside>` element (line ~75)** — add border separator:
  ```tsx
  // Before:
  className={`${collapsed ? 'w-16' : 'w-60'} relative bg-sidebar flex flex-col shrink-0 min-h-screen transition-[width] duration-200 ease-out`}

  // After:
  className={`${collapsed ? 'w-16' : 'w-60'} relative bg-sidebar border-r border-sidebar-border flex flex-col shrink-0 min-h-screen transition-[width] duration-200 ease-out`}
  ```

  **Logo container border (line ~78)**:
  ```tsx
  // Before:
  <div className="p-4 border-b border-white/10">

  // After:
  <div className="p-4 border-b border-sidebar-border">
  ```

  **Collapsed logo span (line ~80)**:
  ```tsx
  // Before:
  <span className="flex items-center justify-center text-lg font-bold text-accent">U</span>

  // After:
  <span className="flex items-center justify-center text-lg font-bold text-sidebar-primary">U</span>
  ```

  **Expanded logo h1 (line ~83)**:
  ```tsx
  // Before:
  <h1 className="text-lg font-bold tracking-tight text-text-on-dark">
    <span className="text-accent">U</span>ltranos Admin

  // After:
  <h1 className="text-lg font-bold tracking-tight text-sidebar-foreground">
    <span className="text-sidebar-primary">U</span>ltranos Admin
  ```

  **Nav link active/inactive classes (line ~100)**:
  ```tsx
  // Before:
  className={`flex items-center gap-3 ${collapsed ? 'justify-center px-2' : indent ? 'px-8' : 'px-4'} py-2.5 text-sm rounded-xl mx-2 transition-colors ${
    isActive
      ? 'bg-white/[0.12] text-accent font-medium'
      : 'text-white/80 hover:bg-white/[0.08] hover:text-white'
  }`}

  // After:
  className={`flex items-center gap-3 ${collapsed ? 'justify-center px-2' : indent ? 'px-8' : 'px-4'} py-2.5 text-sm rounded-xl mx-2 transition-colors ${
    isActive
      ? 'bg-sidebar-accent text-sidebar-primary font-medium'
      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
  }`}
  ```

  **Footer container (line ~122)**:
  ```tsx
  // Before:
  <div className="border-t border-white/10 p-4 space-y-3">

  // After:
  <div className="border-t border-sidebar-border p-4 space-y-3">
  ```

  **Session email text (line ~125)**:
  ```tsx
  // Before:
  <p className="text-xs text-white/60 truncate">{session.email}</p>

  // After:
  <p className="text-xs text-sidebar-foreground/60 truncate">{session.email}</p>
  ```

  **Sign out button (line ~130)**:
  ```tsx
  // Before:
  className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'} w-full py-2 rounded-xl text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors text-sm`}

  // After:
  className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'} w-full py-2 rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors text-sm`}
  ```

  **Collapse toggle button (line ~142)** — these were excluded from the codemod so rename manually:
  ```tsx
  // Before:
  className="absolute top-1/2 -translate-y-1/2 -right-3 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary shadow-card hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"

  // After:
  className="absolute top-1/2 -translate-y-1/2 -right-3 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-card hover:bg-primary/10 hover:text-foreground transition-colors duration-200"
  ```

- [ ] **Step 2: Verify no old token names remain in Sidebar.tsx**

  ```bash
  grep -n "text-white\|bg-white\|border-white\|text-accent\|text-text-\|bg-surface\|bg-canvas\|bg-accent" \
    apps/admin-portal/src/components/Sidebar.tsx
  ```

  Expected: no matches.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/admin-portal/src/components/Sidebar.tsx
  git commit -m "feat(admin-portal): update Sidebar.tsx to light sidebar with ShadCN sidebar tokens"
  ```

---

## Task 8: Run tests to verify nothing broke

**Files:** None modified in this task — verification only.

The admin-portal test suite asserts rendered text, aria attributes, and behaviour — not class names. No snapshot updates are needed. This step confirms the codemod and Sidebar.tsx edits didn't accidentally break component logic.

- [ ] **Step 1: Run the full test suite**

  ```bash
  pnpm -F @ultranos/admin-portal test
  ```

  Expected: all tests pass, 0 failures.

  If you see failures, they indicate a logic regression (not a class-name issue). Investigate before committing. Common causes:
  - The codemod ran on a test fixture file and changed a string the test asserts on (check `git diff apps/admin-portal/src/__tests__/` for unintended changes)
  - Sidebar.tsx manual edit introduced a JSX syntax error

- [ ] **Step 2: If test files were modified by the codemod, revert them**

  The codemod targets class names in component files. If a test file contains class names in JSX fixtures (not in assertions), the codemod will rename those too — which is correct. If a test file asserts a specific old class name string, revert that file and update the assertion manually:

  ```bash
  git diff apps/admin-portal/src/__tests__/
  ```

  Check for any assertion string like `expect(...).toContain('bg-canvas')` that would now fail. Rename these to the new class name.

---

## Task 9: Visual smoke test

**No files changed in this task — verification only.**

- [ ] **Step 1: Start the dev server**

  ```bash
  pnpm -F @ultranos/admin-portal dev
  ```

  Open http://localhost:3004 in a browser.

- [ ] **Step 2: Light mode checklist**

  Visit each of these and verify visually:

  | Page | What to check |
  |------|--------------|
  | `/login` | Page background is white, form has visible border |
  | `/dashboard` | Sidebar is light (near-white), teal-green primary colour on KYC card |
  | `/dashboard` | Stat cards have correct borders and text contrast |
  | `/providers` | Table rows readable, danger badges visible in red-orange |
  | `/alerts` | Alert severity badges show destructive colour correctly |
  | Any page | Toggle dark mode — sidebar goes dark, content area goes dark charcoal |
  | Any page | Collapse sidebar — tooltip appears, collapse toggle visible |
  | Any form | Focus ring visible on inputs (teal-green ring) |

- [ ] **Step 3: Dark mode checklist**

  Toggle dark mode via the header moon icon. Verify:
  - Sidebar background goes to dark (`oklch(0.205 0 0)`)
  - Sidebar text is readable (near-white)
  - Active nav item still clearly highlighted
  - Cards and popovers are visually distinct from page background
  - Warning and success badge colours remain readable

- [ ] **Step 4: Final commit (if any touch-up needed)**

  If the smoke test reveals minor visual issues (e.g. a component that still has a hardcoded colour), fix them and commit:

  ```bash
  git add <changed files>
  git commit -m "fix(admin-portal): visual touch-ups after Radix Rhea migration"
  ```

---

## Appendix: Complete token rename reference

| Old class | New class |
|-----------|-----------|
| `bg-canvas` | `bg-background` |
| `bg-surface` | `bg-card` |
| `bg-surface-raised` | `bg-popover` |
| `bg-sidebar` | `bg-sidebar` (class unchanged, value changes to light) |
| `text-text-primary` | `text-foreground` |
| `text-text-secondary` | `text-muted-foreground` |
| `text-text-muted` | `text-muted-foreground` |
| `text-text-on-dark` | `text-primary-foreground` |
| `bg-accent` | `bg-primary` |
| `text-accent` | `text-primary` |
| `border-accent` | `border-primary` |
| `ring-accent` | `ring-primary` |
| `bg-accent-hover` | `bg-primary/90` |
| `bg-accent-subtle` | `bg-primary/10` |
| `bg-danger` | `bg-destructive` |
| `text-danger` | `text-destructive` |
| `border-danger` | `border-destructive` |
| `border-s-danger` | `border-s-destructive` |
| `ring-danger` | `ring-destructive` |
| `bg-danger-subtle` | `bg-destructive/10` |
| `bg-warning-subtle` | `bg-warning/10` |
| `bg-success-subtle` | `bg-success/10` |
| `text-warning` | `text-warning` (unchanged — custom extension) |
| `text-success` | `text-success` (unchanged — custom extension) |
| `border-border` | `border-border` (unchanged) |
| `shadow-card` | `shadow-card` (unchanged) |
