# Admin Portal Visual Rebrand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full visual rebrand of the admin-portal with OKLCH color system, light/dark mode via CSS variables, collapsible sidebar, new top header bar, and restyled components across all 21 files.

**Architecture:** CSS custom properties on `data-theme` attribute, consumed by Tailwind via `var()` references. No `dark:` prefixes. Theme toggle persists to localStorage, defaults to OS preference. Sidebar collapse state persisted to localStorage.

**Tech Stack:** Next.js 15, Tailwind CSS 3.4, TypeScript, CSS custom properties (OKLCH)

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/components/ThemeProvider.tsx` | Client component: reads localStorage/matchMedia, sets `data-theme` on `<html>`, provides toggle function via context |
| `src/components/TopHeader.tsx` | Sticky header bar: page title slot, search/notifications/theme-toggle/date/avatar |
| `src/hooks/useSidebarCollapse.ts` | Custom hook: collapsed state + toggle, persisted to localStorage |

### Modified files
| File | Change |
|------|--------|
| `tailwind.config.ts` | Replace hardcoded colors with `var(--color-*)` references |
| `src/app/globals.css` | Add `:root` + `[data-theme="dark"]` CSS variable blocks, remove `wavy-divider` |
| `src/app/layout.tsx` | Add blocking theme script, `data-theme` attribute, wrap children in ThemeProvider |
| `src/components/AuthGuard.tsx` | Update shell: sidebar + TopHeader + content wrapper |
| `src/components/Sidebar.tsx` | Collapsible rewrite with new colors, tooltip labels, collapse toggle |
| All 12 page files + 6 component files | Swap Tailwind classes to new semantic tokens |

---

## Task 1: CSS Variables & Tailwind Config

**Files:**
- Modify: `apps/admin-portal/src/app/globals.css`
- Modify: `apps/admin-portal/tailwind.config.ts`

- [ ] **Step 1: Replace globals.css with theme variables**

Replace the entire contents of `globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import '@ultranos/ui-kit/tokens.css';

/* ── Light theme (default) ── */
:root {
  --color-canvas: oklch(0.97 0.005 100);
  --color-surface: oklch(0.99 0.003 100);
  --color-surface-raised: oklch(1.0 0.0 0);
  --color-sidebar: oklch(0.18 0.01 150);
  --color-text-primary: oklch(0.15 0.005 100);
  --color-text-secondary: oklch(0.45 0.005 100);
  --color-text-on-dark: oklch(0.92 0.005 100);
  --color-accent: oklch(0.82 0.19 128);
  --color-accent-hover: oklch(0.87 0.15 128);
  --color-accent-subtle: oklch(0.82 0.19 128 / 0.1);
  --color-border: oklch(0.90 0.005 100);
  --color-danger: oklch(0.63 0.2 25);
  --color-danger-subtle: oklch(0.63 0.2 25 / 0.1);
  --color-warning: oklch(0.75 0.15 70);
  --color-warning-subtle: oklch(0.75 0.15 70 / 0.1);
  --color-success: oklch(0.72 0.17 145);
  --color-success-subtle: oklch(0.72 0.17 145 / 0.1);
  --shadow-card: 0 1px 3px oklch(0.15 0.005 100 / 0.06);
}

/* ── Dark theme ── */
[data-theme="dark"] {
  --color-canvas: oklch(0.14 0.008 150);
  --color-surface: oklch(0.18 0.01 150);
  --color-surface-raised: oklch(0.22 0.01 150);
  --color-sidebar: oklch(0.11 0.01 150);
  --color-text-primary: oklch(0.92 0.005 100);
  --color-text-secondary: oklch(0.60 0.005 100);
  --color-text-on-dark: oklch(0.92 0.005 100);
  --color-accent: oklch(0.82 0.19 128);
  --color-accent-hover: oklch(0.87 0.15 128);
  --color-accent-subtle: oklch(0.82 0.19 128 / 0.1);
  --color-border: oklch(0.25 0.008 150);
  --color-danger: oklch(0.63 0.2 25);
  --color-danger-subtle: oklch(0.63 0.2 25 / 0.1);
  --color-warning: oklch(0.75 0.15 70);
  --color-warning-subtle: oklch(0.75 0.15 70 / 0.1);
  --color-success: oklch(0.72 0.17 145);
  --color-success-subtle: oklch(0.72 0.17 145 / 0.1);
  --shadow-card: none;
}
```

- [ ] **Step 2: Replace tailwind.config.ts**

Replace the entire contents of `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", 'system-ui', '-apple-system', "'Segoe UI'", 'Roboto', 'sans-serif'],
      },
      colors: {
        canvas: 'var(--color-canvas)',
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        sidebar: 'var(--color-sidebar)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-on-dark': 'var(--color-text-on-dark)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-subtle': 'var(--color-accent-subtle)',
        border: 'var(--color-border)',
        danger: 'var(--color-danger)',
        'danger-subtle': 'var(--color-danger-subtle)',
        warning: 'var(--color-warning)',
        'warning-subtle': 'var(--color-warning-subtle)',
        success: 'var(--color-success)',
        'success-subtle': 'var(--color-success-subtle)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 3: Verify Tailwind compiles**

Run: `cd apps/admin-portal && npx tailwindcss --content ./src/**/*.tsx --output /dev/null 2>&1 || echo "FAIL"`

Expected: No errors (warnings about unused classes are fine).

- [ ] **Step 4: Commit**

```bash
git add apps/admin-portal/tailwind.config.ts apps/admin-portal/src/app/globals.css
git commit -m "style(admin-portal): add OKLCH theme variables and semantic Tailwind tokens"
```

---

## Task 2: Theme Provider & Layout

**Files:**
- Create: `apps/admin-portal/src/components/ThemeProvider.tsx`
- Modify: `apps/admin-portal/src/app/layout.tsx`

- [ ] **Step 1: Create ThemeProvider component**

Create `apps/admin-portal/src/components/ThemeProvider.tsx`:

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

- [ ] **Step 2: Update layout.tsx**

Replace the entire contents of `apps/admin-portal/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { AuthGuard } from '@/components/AuthGuard'
import { ThemeProvider } from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'Ultranos Admin Portal',
  description: 'Back-office administration for provider verification, lab approvals, and operational alerts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-canvas text-text-primary antialiased">
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

Key changes: blocking script prevents flash, `bg-canvas` replaces `bg-surface`, `text-text-primary` replaces `text-black`, `suppressHydrationWarning` on `<html>` avoids data-theme mismatch warning.

- [ ] **Step 3: Verify the app loads without errors**

Run: `cd apps/admin-portal && pnpm dev`

Check browser console for hydration errors or missing CSS variable warnings. The page should render (may look broken because components still use old classes — that's expected).

- [ ] **Step 4: Commit**

```bash
git add apps/admin-portal/src/components/ThemeProvider.tsx apps/admin-portal/src/app/layout.tsx
git commit -m "feat(admin-portal): add ThemeProvider with light/dark toggle and blocking script"
```

---

## Task 3: Sidebar Collapse Hook

**Files:**
- Create: `apps/admin-portal/src/hooks/useSidebarCollapse.ts`

- [ ] **Step 1: Create the hook**

Create `apps/admin-portal/src/hooks/useSidebarCollapse.ts`:

```ts
'use client'

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'sidebar-collapsed'

export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  return { collapsed, toggle } as const
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/hooks/useSidebarCollapse.ts
git commit -m "feat(admin-portal): add useSidebarCollapse hook with localStorage persistence"
```

---

## Task 4: Sidebar Rewrite

**Files:**
- Modify: `apps/admin-portal/src/components/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar.tsx**

Replace the entire contents of `apps/admin-portal/src/components/Sidebar.tsx`:

```tsx
'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { label: 'Providers', href: '/providers', icon: UserIcon },
  { label: 'License Expiry', href: '/providers/expiry', icon: ClockIcon, indent: true },
  { label: 'Labs', href: '/labs', icon: FlaskIcon },
  { label: 'AI Models', href: '/ai-models', icon: CpuIcon },
  { label: 'Alerts', href: '/alerts', icon: BellIcon },
  { label: 'Audit Log', href: '/audit', icon: ScrollIcon },
  { label: 'Settings', href: '/settings', icon: GearIcon },
] as const

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} bg-sidebar flex flex-col shrink-0 min-h-screen transition-[width] duration-200 ease-out`}
    >
      {/* Logo */}
      <div className="p-4 border-b border-white/10">
        {collapsed ? (
          <span className="flex items-center justify-center text-lg font-bold text-accent">U</span>
        ) : (
          <h1 className="text-lg font-bold tracking-tight text-text-on-dark">
            <span className="text-accent">U</span>ltranos Admin
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4" aria-label="Admin navigation">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)
          const indent = 'indent' in item && item.indent

          return (
            <div key={item.href} className="relative group">
              <Link
                href={item.href}
                className={`flex items-center gap-3 ${collapsed ? 'justify-center px-2' : indent ? 'px-8' : 'px-4'} py-2.5 text-sm rounded-xl mx-2 transition-colors ${
                  isActive
                    ? 'bg-accent-subtle text-accent font-medium border-s-2 border-accent'
                    : 'text-text-on-dark/60 hover:bg-white/[0.08] hover:text-text-on-dark'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
              {/* Tooltip when collapsed */}
              {collapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-surface-raised text-text-primary text-xs font-medium shadow-card border border-border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                  {item.label}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full py-2 rounded-xl text-text-on-dark/60 hover:bg-white/[0.08] hover:text-text-on-dark transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className={`h-4 w-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </aside>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
    </svg>
  )
}

function FlaskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8 1a.75.75 0 0 1 .75.75v5.59l3.782 6.043A.75.75 0 0 1 11.895 15H8.105a.75.75 0 0 1-.637-1.117L11.25 7.34V1.75A.75.75 0 0 1 8 1Zm-2.72 11.218L8.5 6.5V2h3v4.5l3.22 5.718A2.25 2.25 0 0 1 12.762 16H7.238a2.25 2.25 0 0 1-1.958-3.282Z" clipRule="evenodd" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
    </svg>
  )
}

function ScrollIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
    </svg>
  )
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M14 6H6v8h8V6Z" />
      <path fillRule="evenodd" d="M9.25 3V1.75a.75.75 0 0 1 1.5 0V3h1.5V1.75a.75.75 0 0 1 1.5 0V3h.5A2.75 2.75 0 0 1 17 5.75v.5h1.25a.75.75 0 0 1 0 1.5H17v1.5h1.25a.75.75 0 0 1 0 1.5H17v1.5h1.25a.75.75 0 0 1 0 1.5H17v.5A2.75 2.75 0 0 1 14.25 17h-.5v1.25a.75.75 0 0 1-1.5 0V17h-1.5v1.25a.75.75 0 0 1-1.5 0V17h-1.5v1.25a.75.75 0 0 1-1.5 0V17h-.5A2.75 2.75 0 0 1 3 14.25v-.5H1.75a.75.75 0 0 1 0-1.5H3v-1.5H1.75a.75.75 0 0 1 0-1.5H3v-1.5H1.75a.75.75 0 0 1 0-1.5H3v-.5A2.75 2.75 0 0 1 5.75 3h.5V1.75a.75.75 0 0 1 1.5 0V3h1.5ZM4.5 5.75c0-.69.56-1.25 1.25-1.25h8.5c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25v-8.5Z" clipRule="evenodd" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
    </svg>
  )
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
    </svg>
  )
}
```

- [ ] **Step 2: Verify sidebar renders in both states**

Run the dev server. Manually test:
1. Sidebar renders at 240px with labels
2. All nav items visible and clickable
3. Active state shows accent color

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/components/Sidebar.tsx
git commit -m "style(admin-portal): rewrite Sidebar with collapsible layout and theme tokens"
```

---

## Task 5: Top Header Bar

**Files:**
- Create: `apps/admin-portal/src/components/TopHeader.tsx`

- [ ] **Step 1: Create TopHeader component**

Create `apps/admin-portal/src/components/TopHeader.tsx`:

```tsx
'use client'

import { useTheme } from '@/components/ThemeProvider'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { setAccessToken } from '@/lib/trpc'
import { useState } from 'react'

interface TopHeaderProps {
  title: string
  description?: string
}

export function TopHeader({ title, description }: TopHeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const email = useAuthSessionStore((s) => s.session?.email ?? '')
  const [showUserMenu, setShowUserMenu] = useState(false)

  const initials = email
    ? email.split('@')[0].slice(0, 2).toUpperCase()
    : 'AD'

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })

  async function handleSignOut() {
    useAuthSessionStore.getState().clearSession()
    setAccessToken(null)
    await getSupabaseBrowserClient().auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface px-8">
      {/* Left: page title */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {description && <p className="text-sm text-text-secondary">{description}</p>}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Search placeholder */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
          aria-label="Search"
        >
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Notifications placeholder */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
          aria-label="Notifications"
        >
          <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6ZM8.05 14.943a33.54 33.54 0 0 0 3.9 0 2 2 0 0 1-3.9 0Z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? (
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.06 1.06l1.06 1.06Z" />
            </svg>
          )}
        </button>

        {/* Date */}
        <span className="hidden lg:block text-sm text-text-secondary">{dateStr}</span>

        {/* User avatar */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-subtle text-accent text-xs font-semibold hover:bg-accent/20 transition-colors duration-200"
            aria-label="User menu"
          >
            {initials}
          </button>
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl border border-border bg-surface-raised p-2 shadow-card">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-text-primary">{email}</p>
                  <p className="text-xs text-text-secondary">Administrator</p>
                </div>
                <div className="my-1 border-t border-border" />
                <a href="/settings" className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-text-secondary hover:bg-accent-subtle hover:text-text-primary transition-colors">
                  Settings
                </a>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center rounded-xl px-3 py-2 text-sm text-danger hover:bg-danger-subtle transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin-portal/src/components/TopHeader.tsx
git commit -m "feat(admin-portal): add TopHeader with search, notifications, theme toggle, and user menu"
```

---

## Task 6: AuthGuard Shell Update

**Files:**
- Modify: `apps/admin-portal/src/components/AuthGuard.tsx`

- [ ] **Step 1: Update AuthGuard layout wrapper**

In `AuthGuard.tsx`, make these changes:

1. Add imports at top:
```tsx
import { useSidebarCollapse } from '@/hooks/useSidebarCollapse'
```

2. Replace the `access-denied` return block (lines 107-130) with theme-aware version:
```tsx
  if (state === 'access-denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="w-full max-w-md rounded-2xl border border-danger-subtle bg-danger-subtle p-8 text-center">
          <h1 className="text-xl font-bold text-danger">Access Denied</h1>
          <p className="mt-2 text-sm text-text-secondary">
            You do not have admin privileges. This portal is restricted to users with the ADMIN role.
          </p>
          <button
            type="button"
            onClick={() => {
              useAuthSessionStore.getState().clearSession()
              setAccessToken(null)
              getSupabaseBrowserClient().auth.signOut()
              window.location.href = '/login'
            }}
            className="mt-4 rounded-full bg-danger px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }
```

3. Replace the authenticated shell return block (lines 136-141) with:
```tsx
  return (
    <AuthenticatedShell>{children}</AuthenticatedShell>
  )
```

4. Add the `AuthenticatedShell` component inside the file (after `AuthGuard`, before the closing):
```tsx
function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { collapsed, toggle } = useSidebarCollapse()

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
```

Note: Page title is now rendered by each page via `TopHeader`, not by the shell.

- [ ] **Step 2: Verify the shell renders correctly**

Run: `cd apps/admin-portal && pnpm dev`

Navigate to `/dashboard`. Confirm: sidebar + content area render. Sidebar collapse toggle works.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/components/AuthGuard.tsx
git commit -m "style(admin-portal): update AuthGuard shell with collapsible sidebar and theme tokens"
```

---

## Task 7: Dashboard Page Restyle

**Files:**
- Modify: `apps/admin-portal/src/app/dashboard/page.tsx`

- [ ] **Step 1: Restyle dashboard page**

Replace the entire contents of `apps/admin-portal/src/app/dashboard/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

interface DashboardStats {
  pendingKycReviews: number
  pendingLabApprovals: number
  activeAlerts: number
  recentAuditEvents: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => {
    trpc.admin.dashboardStats.query().then(setStats).catch(() => setStatsError(true))
  }, [])

  return (
    <>
      <TopHeader title="Dashboard" description="Overview of pending actions and system health." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {statsError && (
          <div className="rounded-2xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">
            Failed to load dashboard stats. Data shown may be stale.
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Primary KPI — spans 2 cols */}
          <div
            onClick={() => router.push('/providers')}
            className="sm:col-span-2 rounded-2xl bg-accent-subtle border border-accent/20 p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card"
          >
            <p className="text-sm font-medium text-text-secondary">Pending KYC Reviews</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{stats?.pendingKycReviews ?? '\u2014'}</p>
          </div>

          {/* Secondary stats */}
          <div
            onClick={() => router.push('/labs')}
            className="rounded-2xl bg-surface-raised border border-border p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card"
          >
            <p className="text-sm font-medium text-text-secondary">Pending Lab Approvals</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-text-primary">{stats?.pendingLabApprovals ?? '\u2014'}</p>
          </div>

          {/* Status card — conditional urgency */}
          <div
            onClick={() => router.push('/alerts')}
            className={`rounded-2xl bg-surface-raised border p-6 cursor-pointer hover:scale-[1.02] transition-transform duration-200 shadow-card ${
              stats && stats.activeAlerts > 0
                ? 'border-s-2 border-s-danger border-border'
                : 'border-border'
            }`}
          >
            <p className="text-sm font-medium text-text-secondary">Active Alerts</p>
            <p className={`mt-2 text-xl font-semibold tracking-tight ${stats && stats.activeAlerts > 0 ? 'text-danger' : 'text-text-primary'}`}>
              {stats?.activeAlerts ?? '\u2014'}
            </p>
          </div>
        </div>

        {/* Recent audit — non-clickable info card */}
        <div className="mt-4 rounded-2xl bg-surface-raised border border-border p-6 shadow-card max-w-xs">
          <p className="text-sm font-medium text-text-secondary">Recent Audit Events</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-text-primary">{stats?.recentAuditEvents ?? '\u2014'}</p>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify dashboard renders in both themes**

Run dev server. Navigate to `/dashboard`. Toggle theme. Check:
- Cards use semantic colors
- Primary KPI card spans 2 columns and has accent tint
- Alert card shows danger border when alerts > 0

- [ ] **Step 3: Commit**

```bash
git add apps/admin-portal/src/app/dashboard/page.tsx
git commit -m "style(admin-portal): restyle dashboard with varied card treatments and theme tokens"
```

---

## Task 8: Restyle Table Pages (Providers, Labs, Alerts, Audit, AI Models, Subscriptions)

This is the bulk of the restyle. Every table page follows the same class substitution pattern. Apply these substitutions systematically to each file.

### Class Substitution Reference

These are the find-and-replace patterns to apply. Every file in this task uses the same substitutions.

**Page headers:**
- Remove `wavy-divider` from all `h1` className strings
- Remove any `<h1>` tags entirely — they are replaced by `TopHeader`
- Remove any `<p className="mt-4 text-text-muted">` description lines (moved to TopHeader)
- Add `<TopHeader title="..." description="..." />` before the page content div
- Add import: `import { TopHeader } from '@/components/TopHeader'`
- Wrap page content in `<div className="mx-auto max-w-7xl px-8 py-6">` (replace existing `max-w-6xl` or bare `<div>`)

**Filter pills container:**
- `bg-black` → `bg-surface`
- No other changes needed (accent and text-secondary tokens handle active/inactive states automatically)

**Filter pill active state:**
- `bg-brand-lime text-black` → `bg-accent text-text-primary`

**Filter pill inactive state:**
- `text-neutral-400 hover:text-white` → `text-text-secondary hover:text-text-primary`

**Tables:**
- `thead className="bg-black"` → `thead className="bg-surface"`
- `text-white` in `th` elements → `text-text-secondary`
- `tracking-wider` in `th` → `tracking-wide`
- `tbody` `bg-white` → `bg-surface-raised`
- `divide-border` stays (token already maps correctly)
- `hover:bg-brand-lime/5` → `hover:bg-accent-subtle`

**Status badges:**
- `bg-amber-100 text-amber-800` → `bg-warning-subtle text-warning`
- `bg-green-100 text-green-800` → `bg-success-subtle text-success`
- `bg-red-100 text-red-800` → `bg-danger-subtle text-danger`
- `bg-orange-100 text-orange-800` → `bg-warning-subtle text-warning`
- `bg-purple-100 text-purple-800` → keep as-is (no purple token; this is a unique status)
- `bg-neutral-100 text-neutral-600` → `bg-surface text-text-secondary`
- `bg-emerald-100 text-emerald-800` → `bg-success-subtle text-success` (audit page)

**Text colors:**
- `text-black` (on light surfaces) → `text-text-primary`
- `text-text-muted` → `text-text-secondary`
- `text-neutral-600` → `text-text-secondary`
- `text-neutral-500` → `text-text-secondary`
- `text-neutral-400` (in body content) → `text-text-secondary`
- `text-neutral-700` → `text-text-primary`
- `text-red-600` → `text-danger`
- `text-red-700` → `text-danger`
- `text-red-800` → `text-danger`
- `text-amber-600` → `text-warning`
- `text-green-800` → `text-success`
- `text-emerald-600` → `text-success`
- `text-emerald-800` → `text-success`

**Backgrounds:**
- `bg-surface` (as page bg) → `bg-canvas` (only in full-screen centered layouts like login)
- `bg-white` (cards, table body) → `bg-surface-raised`
- `bg-red-50` → `bg-danger-subtle`
- `bg-green-50` → `bg-success-subtle`
- `bg-amber-50` → `bg-warning-subtle`

**Borders:**
- `border-red-200` → `border-danger/20`
- `border-green-200` → `border-success/20`
- `border-amber-200` → `border-warning/20`
- `border-black` (on buttons) → `border-border`
- `border-brand-lime` → `border-accent`
- `border-brand-lime/30` → `border-accent/30`

**Buttons:**
- `bg-brand-lime` → `bg-accent`
- `hover:brightness-95` → remove (not needed with OKLCH)
- `hover:scale-[1.02] transition-all` → `hover:scale-[1.02] transition-transform duration-200` (only on primary buttons)
- `transition-all` elsewhere → `transition-colors duration-200`
- `bg-brand-lime/10` → `bg-accent-subtle`
- `focus:ring-brand-lime/30` → `focus:ring-accent/30`
- `focus:border-brand-lime` → `focus:border-accent`
- `focus:ring-brand-lime/50` → `focus:ring-accent/50`

**Cards:**
- `rounded-3xl bg-white p-5 border border-border` → `rounded-2xl bg-surface-raised p-6 border border-border shadow-card`
- `rounded-3xl` → `rounded-2xl` (on content cards; pills stay `rounded-full`)

**Specific semantic fixes:**
- SLA breached rows: `bg-red-50 hover:bg-red-100` → `bg-danger-subtle hover:bg-danger-subtle`
- Section tabs `border-brand-lime` → `border-accent`
- `hover:bg-neutral-50` → `hover:bg-surface`
- `bg-brand-lime/5` → `bg-accent-subtle`
- `accent-[#D4FF00]` → `text-accent`

**MetricCard borders (alerts page):**
- `border-green-200 bg-green-50` → `border-success/20 bg-success-subtle`
- `border-amber-200 bg-amber-50` → `border-warning/20 bg-warning-subtle`
- `border-red-200 bg-red-50` → `border-danger/20 bg-danger-subtle`
- `bg-green-500` → `bg-success`
- `bg-amber-500` → `bg-warning`
- `bg-red-500` → `bg-danger`

**Trend chart (audit page):**
- `bg-emerald-500` → `bg-success`
- `bg-red-500` → `bg-danger`
- `bg-amber-400` → `bg-warning`
- `bg-neutral-200` → `bg-border`

**Files to apply these substitutions to:**

- [ ] **Step 1: Restyle `providers/page.tsx`**

Apply the substitution reference above. Add `TopHeader` import and component. Replace `h1`/description with TopHeader. Wrap content in `max-w-7xl px-8 py-6`. Update all filter pills, table, badges, pagination buttons, error states, empty states.

- [ ] **Step 2: Restyle `providers/[submissionId]/page.tsx`**

Same substitution patterns. This is the detail view with OCR fields, document viewer, and confirmation dialogs. Apply to all cards, buttons, badges, text colors, and borders.

- [ ] **Step 3: Restyle `providers/expiry/page.tsx`**

Same patterns. Table + RenewLicenseModal trigger.

- [ ] **Step 4: Restyle `labs/page.tsx`**

Same patterns. Filter pills + table + badges.

- [ ] **Step 5: Restyle `labs/[labId]/page.tsx`**

Same patterns. Detail view with status history and action buttons.

- [ ] **Step 6: Restyle `alerts/page.tsx`**

Same patterns plus MetricCard border/bg colors. Section tabs `border-brand-lime` → `border-accent`.

- [ ] **Step 7: Restyle `alerts/[alertId]/page.tsx`**

Same patterns. Timeline visualization and review dialog.

- [ ] **Step 8: Restyle `ai-models/page.tsx`**

Same patterns. Model manifest table, stats table, publish form.

- [ ] **Step 9: Restyle `audit/page.tsx`**

Same patterns plus trend chart colors (`bg-emerald-500` → `bg-success` etc). Status cards and verification history table.

- [ ] **Step 10: Restyle `settings/page.tsx`**

Same patterns. Security key cards, enroll button, alert banners.

- [ ] **Step 11: Restyle `subscriptions/page.tsx`**

Same patterns. Org card, modules table with tfoot, Add/Remove button styling.

- [ ] **Step 12: Verify all table pages render in both themes**

Run dev server. Navigate to each page. Toggle theme. Spot-check:
- Table headers use `bg-surface` (not black)
- Status badges use semantic tokens
- Filter pills container uses `bg-surface` (not black)
- All text is readable in both themes
- No hardcoded hex colors remain

- [ ] **Step 13: Commit**

```bash
git add apps/admin-portal/src/app/providers/ apps/admin-portal/src/app/labs/ apps/admin-portal/src/app/alerts/ apps/admin-portal/src/app/ai-models/ apps/admin-portal/src/app/audit/ apps/admin-portal/src/app/settings/ apps/admin-portal/src/app/subscriptions/
git commit -m "style(admin-portal): restyle all table pages with semantic theme tokens"
```

---

## Task 9: Restyle Public Pages (Landing, Login, Register)

**Files:**
- Modify: `apps/admin-portal/src/app/page.tsx`
- Modify: `apps/admin-portal/src/app/login/page.tsx`
- Modify: `apps/admin-portal/src/app/register/page.tsx`

Public pages don't have sidebar/header. They use full-screen centered layouts.

- [ ] **Step 1: Restyle landing page (`page.tsx`)**

Apply substitutions:
- `bg-surface` → `bg-canvas`
- `text-black` → `text-text-primary`
- `wavy-divider` → remove
- `text-text-muted` → `text-text-secondary`
- `bg-white` → `bg-surface-raised`
- `bg-brand-lime` → `bg-accent`
- `hover:brightness-95` → remove
- `border border-black bg-white` → `border border-border bg-surface-raised`
- `hover:bg-neutral-50` → `hover:bg-surface`
- `focus:ring-brand-lime/50` → `focus:ring-accent/50`
- `hover:text-brand-lime` → `hover:text-accent`

- [ ] **Step 2: Restyle login page (`login/page.tsx`)**

Apply substitutions:
- `bg-surface` → `bg-canvas`
- `bg-white` → `bg-surface-raised`
- `text-black` → `text-text-primary`
- `text-text-muted` → `text-text-secondary`
- `border-brand-lime` → `border-accent`
- `focus:ring-brand-lime/30` → `focus:ring-accent/30`
- `focus:border-brand-lime` → `focus:border-accent`
- `bg-brand-lime` → `bg-accent`
- `hover:brightness-95` → remove
- `bg-brand-lime/10` → `bg-accent-subtle`
- `border-brand-lime/30` → `border-accent/30`
- `border-red-200 bg-red-50` → `border-danger/20 bg-danger-subtle`
- `text-red-800` → `text-danger`
- `hover:text-brand-lime` → `hover:text-accent`

- [ ] **Step 3: Restyle register page (`register/page.tsx`)**

Apply the same substitution patterns to all form elements, step indicators, buttons, and error states.

- [ ] **Step 4: Restyle registration step components**

Apply to all three files in `src/components/registration/`:
- `AdminCredentialsStep.tsx`
- `ModuleSelectionStep.tsx`
- `OrgDetailsStep.tsx`

Same input, button, and text color substitutions.

- [ ] **Step 5: Verify public pages in both themes**

Navigate to `/`, `/login`, `/register`. Toggle theme. Confirm all text is readable, inputs are visible, buttons have correct accent color.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/app/page.tsx apps/admin-portal/src/app/login/ apps/admin-portal/src/app/register/ apps/admin-portal/src/components/registration/
git commit -m "style(admin-portal): restyle public pages (landing, login, register) with theme tokens"
```

---

## Task 10: Restyle Modal/Dialog Components

**Files:**
- Modify: `apps/admin-portal/src/components/providers/RenewLicenseModal.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx`
- Modify: `apps/admin-portal/src/components/subscriptions/RemoveModuleDialog.tsx`

- [ ] **Step 1: Restyle RenewLicenseModal.tsx**

Apply substitutions:
- Overlay: add `bg-black/50` backdrop if not present
- Modal container: `bg-white` → `bg-surface-raised`, `rounded-3xl` → `rounded-2xl`, add `shadow-xl`
- All text, input, button classes per the substitution reference
- Error/success banners: same danger/success token swaps

- [ ] **Step 2: Restyle AddModuleDialog.tsx**

Same substitution patterns.

- [ ] **Step 3: Restyle RemoveModuleDialog.tsx**

Same substitution patterns. Danger-themed confirm button.

- [ ] **Step 4: Verify modals in both themes**

Navigate to subscriptions page, open Add Module / Remove Module dialogs. Navigate to providers/expiry, open Renew License modal. Toggle theme. Confirm overlays, card backgrounds, and buttons render correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/components/providers/ apps/admin-portal/src/components/subscriptions/
git commit -m "style(admin-portal): restyle modal and dialog components with theme tokens"
```

---

## Task 11: Final Verification & Cleanup

- [ ] **Step 1: Search for remaining hardcoded colors**

Run:
```bash
cd apps/admin-portal && grep -rn "bg-black\|bg-white\|text-black\|text-white\|bg-surface\b\|text-text-muted\|bg-brand-lime\|border-brand-lime\|#D4FF00\|#F3F4F6\|#E5E7EB\|#6B7280\|#A3E635\|wavy-divider\|bg-neutral-50\|hover:brightness" src/ --include="*.tsx" --include="*.ts" || echo "CLEAN"
```

Note: `text-white` may appear in the Sidebar icon SVGs (valid — `fill="currentColor"` handles theme). Any remaining hardcoded colors in page/component files should be fixed.

- [ ] **Step 2: Fix any remaining hardcoded colors found in Step 1**

For each file with remaining hardcoded colors, apply the substitution reference from Task 8.

- [ ] **Step 3: Run TypeScript check**

Run: `cd apps/admin-portal && pnpm exec tsc --noEmit`

Expected: No type errors. The restyle is purely class-name changes — types shouldn't be affected.

- [ ] **Step 4: Visual smoke test — both themes**

Run dev server. For each page:
1. Load in light mode. Check layout, readability, card borders.
2. Toggle to dark mode. Check same elements.
3. Pages to test: `/`, `/login`, `/register`, `/dashboard`, `/providers`, `/labs`, `/alerts`, `/audit`, `/settings`, `/subscriptions`, `/ai-models`

- [ ] **Step 5: Test sidebar collapse**

1. Click collapse toggle. Sidebar narrows to 64px, icons only.
2. Hover nav items — tooltips appear.
3. Click expand. Sidebar returns to 240px with labels.
4. Refresh page — collapse state persists.

- [ ] **Step 6: Test theme persistence**

1. Set dark mode. Refresh page — stays dark (no flash of light).
2. Set light mode. Refresh — stays light.
3. Clear localStorage, reload — follows OS preference.

- [ ] **Step 7: Commit cleanup if any fixes were made**

```bash
git add -A apps/admin-portal/src/
git commit -m "style(admin-portal): fix remaining hardcoded colors from visual rebrand"
```

- [ ] **Step 8: Final commit — remove unused old color tokens**

Check if `brand-lime`, `success-green`, or old `surface`/`border`/`text-muted` tokens are still referenced anywhere. If not, they were already removed in Task 1 when we replaced `tailwind.config.ts`. Confirm with:

```bash
grep -rn "brand-lime\|success-green" apps/admin-portal/src/ --include="*.tsx" --include="*.ts" || echo "CLEAN"
```

If clean, no further action needed.
