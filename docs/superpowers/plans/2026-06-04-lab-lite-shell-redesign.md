# Lab Lite Shell Redesign — Visual Parity Plan (Phase 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark inline-styled legacy `Sidebar` component with the ShadCN compound sidebar, add a `PageHeader` with `SidebarTrigger`, wire up dark mode with `ThemeProvider`, and update the root layout to semantic color tokens — making the lab-lite shell visually match the admin-portal.

**Architecture:** The monolithic `AppSidebar` (which wraps children) is decomposed into three focused pieces: `NavLab` (nav items rendered with ShadCN `SidebarGroup`/`SidebarMenu`), `NavLabUser` (footer user dropdown with theme toggle and sign-out), and `AppSidebar` (the compound sidebar container — no children). A new `AppShell` client component holds the `SidebarProvider` + `SidebarInset` + auth gate, replacing the current pattern where `AppSidebar` wraps page content. The legacy `Sidebar` from `@ultranos/ui-kit` barrel is no longer imported. `ThemeProvider` adds `localStorage`-backed `data-theme="dark"` support, identical to admin-portal.

**Tech Stack:** Next.js 15, TypeScript 5.4, `@ultranos/ui-kit` ShadCN compound sidebar, `tw-animate-css`, Tailwind CSS v3, `next-intl`.

**Execution order:** Run this plan **before** `2026-06-04-lab-lite-component-layer.md`. After this plan, the shell looks like admin-portal; individual page components still use old color classes (addressed in Phase 2).

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/lab-lite/package.json` — add `tw-animate-css` |
| Modify | `apps/lab-lite/src/app/globals.css` — add `@layer base` semantic reset |
| Create | `apps/lab-lite/src/components/ThemeProvider.tsx` |
| Modify | `apps/lab-lite/src/app/layout.tsx` — theme script, ThemeProvider, semantic body |
| Create | `apps/lab-lite/src/components/ui/sidebar.tsx` — ShadCN re-export |
| Create | `apps/lab-lite/src/components/ui/dropdown-menu.tsx` — ShadCN re-export |
| Create | `apps/lab-lite/src/components/ui/separator.tsx` — ShadCN re-export |
| Create | `apps/lab-lite/src/components/ui/breadcrumb.tsx` — ShadCN re-export |
| Create | `apps/lab-lite/src/lib/route-map.ts` — pathname → label lookup |
| Create | `apps/lab-lite/src/components/PageHeader.tsx` — SidebarTrigger + current page breadcrumb |
| Create | `apps/lab-lite/src/components/sidebar/NavLab.tsx` — nav items using ShadCN SidebarMenu |
| Create | `apps/lab-lite/src/components/sidebar/NavLabUser.tsx` — user footer with theme toggle |
| Modify | `apps/lab-lite/src/components/AppSidebar.tsx` — use ShadCN compound components, no children |
| Create | `apps/lab-lite/src/components/AppShell.tsx` — SidebarProvider + SidebarInset + auth gate |
| Modify | `apps/lab-lite/src/app/[locale]/layout.tsx` — use AppShell, remove AppSidebar wrapper |

---

### Task 1: Install `tw-animate-css` and add semantic `@layer base` to `globals.css`

**Files:**
- Modify: `apps/lab-lite/package.json`
- Modify: `apps/lab-lite/src/app/globals.css`

The `@layer base` reset applies semantic border/outline colors to all elements and sets `body` to use `bg-background text-foreground`. Without it, elements keep browser-default borders even though semantic tokens are available. `tw-animate-css` provides the `animate-in`/`animate-out` utility classes that ShadCN sidebar and dropdown components use for open/close transitions.

- [ ] **Step 1: Install `tw-animate-css`**

```bash
pnpm -F lab-lite add tw-animate-css
```

Expected: `tw-animate-css` added to `apps/lab-lite/package.json` dependencies.

- [ ] **Step 2: Replace `apps/lab-lite/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import '@ultranos/ui-kit/tokens.css';

@import 'tw-animate-css';

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

/* Print styles: isolate token card for printing */
@media print {
  body > *:not(.token-card-print-wrapper) {
    display: none !important;
  }

  .token-card-print-wrapper {
    display: flex !important;
    align-items: center;
    justify-content: center;
    height: 100vh;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: No new TypeScript errors. If `Cannot find module 'tw-animate-css'` appears, run `pnpm install` first.

- [ ] **Step 4: Commit**

```bash
git add apps/lab-lite/package.json apps/lab-lite/src/app/globals.css pnpm-lock.yaml
git commit -m "chore(lab-lite): add tw-animate-css and semantic @layer base to globals.css"
```

---

### Task 2: Create `ThemeProvider` and update `app/layout.tsx`

**Files:**
- Create: `apps/lab-lite/src/components/ThemeProvider.tsx`
- Modify: `apps/lab-lite/src/app/layout.tsx`

`ThemeProvider` is identical to admin-portal's. It reads `localStorage.theme`, applies `data-theme="dark"` to `<html>`, and exposes `useTheme()` / `toggleTheme()`. The inline `<script>` in `<head>` runs before hydration to prevent flash-of-wrong-theme (FOWT). The body changes from `bg-neutral-50 text-neutral-900` to `bg-background text-foreground` so the semantic tokens drive the base colors.

- [ ] **Step 1: Create `apps/lab-lite/src/components/ThemeProvider.tsx`**

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
    const resolved =
      stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
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

- [ ] **Step 2: Replace `apps/lab-lite/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
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

export const metadata: Metadata = {
  title: 'Lab Diagnostics Portal \u2014 Ultranos',
  description: 'Ultranos Lab Lite PWA for diagnostic result upload',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  const isRtl = dir === 'rtl'

  return (
    <html lang={locale} dir={dir} className={urbanist.variable} suppressHydrationWarning>
      <head>
        {isRtl && <link rel="stylesheet" href="/fonts-arabic.css" />}
        {/* Inline theme detection: runs before hydration to avoid flash-of-wrong-theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
        >
          Skip to main content
        </a>
        <ClientErrorBoundary>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </ClientErrorBoundary>
      </body>
    </html>
  )
}
```

> Note: The `<main id="main-content">` wrapper is removed here. `AppShell` (Task 8) adds it for authenticated pages; the login page's own markup provides the `<main>` landmark for unauthenticated routes.

- [ ] **Step 3: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors. If `Cannot find module '@/components/ThemeProvider'` appears, check the file was created at the correct path.

- [ ] **Step 4: Commit**

```bash
git add apps/lab-lite/src/components/ThemeProvider.tsx apps/lab-lite/src/app/layout.tsx
git commit -m "feat(lab-lite): add ThemeProvider and update root layout to semantic tokens + dark mode"
```

---

### Task 3: Add ShadCN component re-exports needed by the shell

**Files:**
- Create: `apps/lab-lite/src/components/ui/sidebar.tsx`
- Create: `apps/lab-lite/src/components/ui/dropdown-menu.tsx`
- Create: `apps/lab-lite/src/components/ui/separator.tsx`
- Create: `apps/lab-lite/src/components/ui/breadcrumb.tsx`

These thin re-exports give lab-lite components a local `@/components/ui/*` import path that resolves to the shared ShadCN implementations in ui-kit — identical to the admin-portal pattern.

- [ ] **Step 1: Create `apps/lab-lite/src/components/ui/sidebar.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/sidebar'
```

- [ ] **Step 2: Create `apps/lab-lite/src/components/ui/dropdown-menu.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/dropdown-menu'
```

- [ ] **Step 3: Create `apps/lab-lite/src/components/ui/separator.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/separator'
```

- [ ] **Step 4: Create `apps/lab-lite/src/components/ui/breadcrumb.tsx`**

```tsx
export * from '@ultranos/ui-kit/components/ui/breadcrumb'
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/lab-lite/src/components/ui/sidebar.tsx \
        apps/lab-lite/src/components/ui/dropdown-menu.tsx \
        apps/lab-lite/src/components/ui/separator.tsx \
        apps/lab-lite/src/components/ui/breadcrumb.tsx
git commit -m "feat(lab-lite): add ShadCN sidebar, dropdown-menu, separator, breadcrumb re-exports"
```

---

### Task 4: Create `lib/route-map.ts` and `PageHeader`

**Files:**
- Create: `apps/lab-lite/src/lib/route-map.ts`
- Create: `apps/lab-lite/src/components/PageHeader.tsx`

`route-map.ts` maps lab-lite pathnames to human-readable labels. The locale segment (`/en`, `/ar`, `/prs`, `/ps`) is stripped before lookup since `usePathname()` from `next/navigation` returns the full path including locale prefix. `PageHeader` renders the ShadCN `SidebarTrigger` (hamburger that collapses/expands the sidebar) + a `Separator` + the current page name — identical in structure to admin-portal's `BreadcrumbHeader`.

- [ ] **Step 1: Create `apps/lab-lite/src/lib/route-map.ts`**

```ts
interface BreadcrumbSegment {
  label: string
  href: string
}

const SUPPORTED_LOCALES = ['en', 'ar', 'prs', 'ps']

/** Strip the locale prefix from next/navigation pathname if present. */
function stripLocale(pathname: string): string {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}`) return '/'
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1)
  }
  return pathname
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/upload': 'Upload Results',
  '/orders': 'Orders',
  '/worklist': 'Worklist',
  '/reports': 'Reports',
  '/reports/daily': 'Daily Log',
  '/patients/register': 'Register Patient',
  '/history': 'Result History',
  '/queue': 'Patient Queue',
  '/consent': 'Consent',
  '/sops': 'SOPs',
  '/atlas': 'Visual Atlas',
  '/peer-network': 'Peer Network',
  '/safety-reporting': 'Safety Reporting',
  '/equipment': 'Equipment',
  '/shift-handover': 'Shift Handover',
  '/quality': 'Quality Dashboard',
  '/achievements': 'Team Achievements',
  '/certification': 'Certification',
  '/mentorship': 'Mentorship',
  '/finance/payment': 'New Payment',
  '/finance/receipts': 'Receipts',
  '/finance/reconciliation': 'Reconciliation',
  '/finance/reagents': 'Reagents',
  '/finance/cost-analysis': 'Cost Analysis',
  '/finance/cost-settings': 'Cost Settings',
  '/authorization': 'Authorization Queue',
  '/notifications': 'Notifications',
  '/readiness': 'Readiness Board',
  '/network': 'Network',
  '/inventory/network': 'Network Inventory',
  '/settings': 'Settings',
}

export function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const stripped = stripLocale(pathname)

  // Direct match
  if (ROUTE_LABELS[stripped]) {
    return [{ label: ROUTE_LABELS[stripped]!, href: stripped }]
  }

  // Prefix match — find the longest matching ancestor segment
  const segments = stripped.split('/').filter(Boolean)
  const crumbs: BreadcrumbSegment[] = []
  let path = ''
  for (const segment of segments) {
    path += `/${segment}`
    const label = ROUTE_LABELS[path]
    if (label) crumbs.push({ label, href: path })
  }

  return crumbs.length > 0 ? crumbs : [{ label: 'Page', href: stripped }]
}
```

- [ ] **Step 2: Create `apps/lab-lite/src/components/PageHeader.tsx`**

```tsx
'use client'

import { usePathname } from 'next/navigation'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { buildBreadcrumbs } from '@/lib/route-map'

export function PageHeader() {
  const pathname = usePathname()
  const crumbs = buildBreadcrumbs(pathname ?? '/')

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb) => (
            <BreadcrumbItem key={crumb.href}>
              <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/lab-lite/src/lib/route-map.ts apps/lab-lite/src/components/PageHeader.tsx
git commit -m "feat(lab-lite): add route-map and PageHeader with SidebarTrigger + breadcrumb"
```

---

### Task 5: Create `NavLab` — nav items using ShadCN SidebarMenu

**Files:**
- Create: `apps/lab-lite/src/components/sidebar/NavLab.tsx`

`NavLab` takes the `SidebarNavItem[]` array (same type already used by `AppSidebar`) and renders it using ShadCN compound components. Items are grouped by their `group` property into `SidebarGroup` sections. The `SidebarMenuBadge` component renders the numeric badge (upload queue, orders, etc.). In icon-collapsed mode, `SidebarMenuButton`'s `tooltip` prop shows the item label on hover — no extra code needed, it's built into the ShadCN sidebar.

- [ ] **Step 1: Create `apps/lab-lite/src/components/sidebar/NavLab.tsx`**

```tsx
'use client'

import Link from 'next/link'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { SidebarNavItem } from '@ultranos/ui-kit'

const GROUP_LABELS: Record<string, string> = {
  primary: '',
  clinical: 'Clinical',
  finance: 'Finance',
  system: 'System',
}

const GROUP_ORDER = ['primary', 'clinical', 'finance', 'system'] as const

interface NavLabProps {
  items: SidebarNavItem[]
}

export function NavLab({ items }: NavLabProps) {
  const grouped = GROUP_ORDER.reduce<Record<string, SidebarNavItem[]>>(
    (acc, key) => ({ ...acc, [key]: [] }),
    {}
  )
  for (const item of items) {
    const g = (item.group ?? 'primary') as string
    if (g in grouped) grouped[g]!.push(item)
  }

  return (
    <>
      {GROUP_ORDER.map((groupKey) => {
        const groupItems = grouped[groupKey] ?? []
        if (groupItems.length === 0) return null
        const label = GROUP_LABELS[groupKey]

        return (
          <SidebarGroup key={groupKey}>
            {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
            <SidebarMenu>
              {groupItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}>
                    <Link href={item.href}>
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge != null && item.badge > 0 && (
                    <SidebarMenuBadge>
                      {item.badge > 99 ? '99+' : item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors. If `Cannot find module '@ultranos/ui-kit'` for `SidebarNavItem`, verify `packages/ui-kit/src/index.ts` exports `SidebarNavItem` (it does — from `./Sidebar.js`).

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/components/sidebar/NavLab.tsx
git commit -m "feat(lab-lite): add NavLab component using ShadCN SidebarMenu"
```

---

### Task 6: Create `NavLabUser` — footer user dropdown with theme toggle

**Files:**
- Create: `apps/lab-lite/src/components/sidebar/NavLabUser.tsx`

`NavLabUser` renders the sidebar footer: sync indicators (online status, data budget, language selector) that hide in icon-collapsed mode, then the user dropdown with theme toggle and sign-out. This matches admin-portal's `NavUser` pattern, adapted for lab-lite's extra indicators.

- [ ] **Step 1: Create `apps/lab-lite/src/components/sidebar/NavLabUser.tsx`**

```tsx
'use client'

import { ChevronsUpDown, LogOut, Moon, Sun } from '@ultranos/ui-kit/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useTheme } from '@/components/ThemeProvider'
import { OnlineStatusIndicator } from '@/components/OnlineStatusIndicator'
import { DataBudgetIndicator } from '@/components/DataBudgetIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

interface NavLabUserProps {
  name: string
  email: string | undefined
  role: string
  initials: string
  onSignOut: () => void
}

export function NavLabUser({ name, email, role, initials, onSignOut }: NavLabUserProps) {
  const { isMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()

  return (
    <SidebarMenu>
      {/* Sync indicators — hidden when sidebar is collapsed to icon mode */}
      <SidebarMenuItem>
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
          <OnlineStatusIndicator />
          <DataBudgetIndicator />
          <LanguageSelectorClient collapsed={false} />
        </div>
      </SidebarMenuItem>

      {/* User dropdown */}
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{role}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? 'top' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  {email && (
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === 'light' ? (
                <Moon className="mr-2 size-4" />
              ) : (
                <Sun className="mr-2 size-4" />
              )}
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={onSignOut}
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/components/sidebar/NavLabUser.tsx
git commit -m "feat(lab-lite): add NavLabUser footer with theme toggle and user dropdown"
```

---

### Task 7: Rewrite `AppSidebar.tsx` to use ShadCN compound components

**Files:**
- Modify: `apps/lab-lite/src/components/AppSidebar.tsx`

The rewrite keeps all business logic unchanged (four badge hooks, `usePendingHandovers`, role checks, nav items array, `handleSignOut`). Only the JSX changes: the legacy `<Sidebar appName=... navItems=... user=...>` wrapper is replaced with `<Sidebar collapsible="icon" variant="inset">` + `SidebarHeader` + `SidebarContent` + `SidebarFooter`. Children are **removed** — page content now lives in `SidebarInset` (Task 8). `AchievementNotification` moves to `AppShell` (Task 8) since it can no longer be placed inside `Sidebar`.

- [ ] **Step 1: Replace the entire content of `apps/lab-lite/src/components/AppSidebar.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutGrid,
  Upload,
  UserPlus,
  UserCheck,
  History,
  ListOrdered,
  Bell,
  Settings,
  ClipboardList,
  ClipboardCheck,
  Banknote,
  Receipt,
  Scale,
  ShieldCheck,
  BookOpen,
  MessageCircle,
  AlertTriangle,
  BarChart3,
  Calculator,
  Globe,
  Network,
  FileText,
  FlaskConical,
  Microscope,
  RefreshCw,
  TrendingUp,
  Award,
  Wrench,
} from '@ultranos/ui-kit/icons'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavLab } from '@/components/sidebar/NavLab'
import { NavLabUser } from '@/components/sidebar/NavLabUser'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getDb } from '@/lib/db'
import { LabRole } from '@ultranos/shared-types'
import { canAccessAuthorizationQueue } from '@/lib/permissions'
import { getPendingAuthorizationCount } from '@/lib/db'
import { usePendingHandovers } from '@/hooks/usePendingHandovers'
import type { SidebarNavItem } from '@ultranos/ui-kit'

// ── Badge hooks ───────────────────────────────────────────────────────────────

function useQueueBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    async function check() {
      try {
        const db = getDb()
        const c = await db.uploadQueue.where('status').anyOf(['pending', 'failed']).count()
        if (active) setCount(c > 0 ? c : null)
      } catch { /* Dexie unavailable — no badge */ }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => { active = false; clearInterval(interval) }
  }, [])
  return count
}

function usePatientQueueBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    async function check() {
      try {
        const db = getDb()
        const c = await db.table('queueEntries').where('status').equals('waiting').count()
        if (active) setCount(c > 0 ? c : null)
      } catch { /* Dexie unavailable — no badge */ }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => { active = false; clearInterval(interval) }
  }, [])
  return count
}

function useAuthorizationQueueBadge(labRole: LabRole | null): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!labRole || !canAccessAuthorizationQueue(labRole)) return
    let active = true
    async function check() {
      try {
        const c = await getPendingAuthorizationCount()
        if (active) setCount(c > 0 ? c : null)
      } catch { /* Dexie unavailable — no badge */ }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => { active = false; clearInterval(interval) }
  }, [labRole])
  return count
}

function useOrdersBadge(): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    async function check() {
      try {
        const db = getDb()
        const c = await db.orders.where('status').equals('RECEIVED').count()
        if (active) setCount(c > 0 ? c : null)
      } catch { /* Dexie unavailable — no badge */ }
    }
    check()
    const interval = setInterval(check, 10_000)
    return () => { active = false; clearInterval(interval) }
  }, [])
  return count
}

// ── AppSidebar ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const session = useAuthSessionStore((s) => s.session)
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const uploadQueueBadge = useQueueBadge()
  const ordersBadge = useOrdersBadge()
  const patientQueueBadge = usePatientQueueBadge()
  const authQueueBadge = useAuthorizationQueueBadge(session?.labRole as LabRole | null)
  const { pendingHandovers } = usePendingHandovers()
  const handoverBadge = pendingHandovers.length > 0 ? pendingHandovers.length : null

  const handleSignOut = useCallback(async () => {
    useAuthSessionStore.getState().clearSession()
    await getSupabaseBrowserClient().auth.signOut()
    window.location.href = '/login'
  }, [])

  const canAccessNetwork =
    session?.labRole === LabRole.LAB_MANAGER || session?.labRole === LabRole.SUPERVISOR
  const canAccessCostAnalysis = session?.labRole === LabRole.LAB_MANAGER
  const canAccessAuth = session?.labRole
    ? canAccessAuthorizationQueue(session.labRole as LabRole)
    : false

  const navItems: SidebarNavItem[] = [
    // Primary
    { label: t('dashboard'), href: '/', icon: <LayoutGrid size={20} />, active: pathname === '/', group: 'primary' },
    { label: t('orders'), href: '/orders', icon: <ClipboardList size={20} />, active: pathname === '/orders', badge: ordersBadge, group: 'primary' },
    { label: t('worklist'), href: '/worklist', icon: <ClipboardList size={20} />, active: pathname === '/worklist', group: 'primary' },
    { label: t('upload'), href: '/upload', icon: <Upload size={20} />, active: pathname === '/upload', badge: uploadQueueBadge, group: 'primary' },
    { label: t('reports'), href: '/reports', icon: <FileText size={20} />, active: pathname.startsWith('/reports') && pathname !== '/reports/daily', group: 'primary' },
    { label: t('dailyLog'), href: '/reports/daily', icon: <FileText size={20} />, active: pathname === '/reports/daily', group: 'primary' },
    { label: t('registerPatient'), href: '/patients/register', icon: <UserPlus size={20} />, active: pathname === '/patients/register', group: 'primary' },
    // Clinical
    { label: t('history'), href: '/history', icon: <History size={20} />, active: pathname === '/history', group: 'clinical' },
    { label: t('queue'), href: '/queue', icon: <ListOrdered size={20} />, active: pathname.startsWith('/queue'), badge: patientQueueBadge, group: 'clinical' },
    { label: t('consent'), href: '/consent', icon: <ShieldCheck size={20} />, active: pathname === '/consent', group: 'clinical' },
    { label: t('sops'), href: '/sops', icon: <BookOpen size={20} />, active: pathname === '/sops', group: 'clinical' },
    { label: t('visualAtlas'), href: '/atlas', icon: <Microscope size={20} />, active: pathname.startsWith('/atlas'), group: 'clinical' },
    { label: t('peerNetwork'), href: '/peer-network', icon: <MessageCircle size={20} />, active: pathname === '/peer-network', group: 'clinical' },
    { label: t('safetyReporting'), href: '/safety-reporting', icon: <AlertTriangle size={20} />, active: pathname === '/safety-reporting', group: 'clinical' },
    { label: t('equipment'), href: '/equipment', icon: <Wrench size={20} />, active: pathname.startsWith('/equipment'), group: 'clinical' },
    { label: t('shiftHandover'), href: '/shift-handover', icon: <RefreshCw size={20} />, active: pathname.startsWith('/shift-handover'), badge: handoverBadge, group: 'clinical' },
    { label: t('qualityDashboard'), href: '/quality', icon: <TrendingUp size={20} />, active: pathname.startsWith('/quality'), group: 'clinical' },
    { label: t('teamAchievements'), href: '/achievements', icon: <span aria-hidden="true" className="text-base leading-none">🏆</span>, active: pathname.startsWith('/achievements'), group: 'clinical' },
    { label: t('certification'), href: '/certification', icon: <Award size={20} />, active: pathname.startsWith('/certification'), group: 'clinical' },
    { label: t('mentorship'), href: '/mentorship', icon: <UserCheck size={20} />, active: pathname.startsWith('/mentorship'), group: 'clinical' as const },
    // Finance
    { label: t('newPayment'), href: '/finance/payment', icon: <Banknote size={20} />, active: pathname === '/finance/payment', group: 'finance' },
    { label: t('receipts'), href: '/finance/receipts', icon: <Receipt size={20} />, active: pathname === '/finance/receipts', group: 'finance' },
    { label: t('reconciliation'), href: '/finance/reconciliation', icon: <Scale size={20} />, active: pathname === '/finance/reconciliation', group: 'finance' },
    { label: t('reagents'), href: '/finance/reagents', icon: <FlaskConical size={20} />, active: pathname.startsWith('/finance/reagents'), group: 'finance' },
    ...(canAccessCostAnalysis
      ? [
          { label: t('costAnalysis'), href: '/finance/cost-analysis', icon: <BarChart3 size={20} />, active: pathname === '/finance/cost-analysis', group: 'finance' as const },
          { label: t('costSettings'), href: '/finance/cost-settings', icon: <Calculator size={20} />, active: pathname === '/finance/cost-settings', group: 'finance' as const },
        ]
      : []),
    ...(canAccessAuth
      ? [{ label: t('authorizationQueue'), href: '/authorization', icon: <ClipboardCheck size={20} />, active: pathname.startsWith('/authorization'), badge: authQueueBadge, group: 'clinical' as const }]
      : []),
    // System
    { label: t('notifications'), href: '/notifications', icon: <Bell size={20} />, active: pathname === '/notifications', group: 'system' },
    ...(canAccessNetwork
      ? [
          { label: t('readinessBoard'), href: '/readiness', icon: <BarChart3 size={20} />, active: pathname.startsWith('/readiness'), group: 'system' as const },
          { label: t('network'), href: '/network', icon: <Globe size={20} />, active: pathname.startsWith('/network'), group: 'system' as const },
          { label: t('networkInventory'), href: '/inventory/network', icon: <Network size={20} />, active: pathname.startsWith('/inventory/network'), group: 'system' as const },
        ]
      : []),
    { label: t('settings'), href: '/settings', icon: <Settings size={20} />, active: pathname === '/settings', group: 'system' },
  ]

  const displayName = session?.email?.split('@')[0] ?? 'Technician'
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('')

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="px-3 py-2">
        <span className="text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          Lab Lite
        </span>
      </SidebarHeader>
      <SidebarContent>
        <NavLab items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavLabUser
          name={displayName}
          email={session?.email}
          role={session?.role ?? ''}
          initials={initials}
          onSignOut={handleSignOut}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors. Common failures:
| Error | Fix |
|-------|-----|
| `Property 'children' does not exist on type 'SidebarProps'` | Confirm the old `Sidebar` import is gone; new one from `@/components/ui/sidebar` has no `children` prop on the `<Sidebar>` element itself |
| `Cannot find name 'ReactNode'` | The new file no longer imports `ReactNode` — that's correct, it's not needed |

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/components/AppSidebar.tsx
git commit -m "refactor(lab-lite): migrate AppSidebar to ShadCN compound sidebar components"
```

---

### Task 8: Create `AppShell` — auth-gated SidebarProvider + SidebarInset

**Files:**
- Create: `apps/lab-lite/src/components/AppShell.tsx`

`AppShell` replaces the role the old `AppSidebar` played as a children wrapper. It reads auth state: if unauthenticated or on a public path, it renders children in a plain `<main>`. If authenticated, it wraps with `TooltipProvider` + `SidebarProvider` + `AppSidebar` + `SidebarInset` (containing `PageHeader`, `<main>`, `InstallPrompt`). The `AchievementNotification` moves here (was previously inside the legacy Sidebar's children slot) so the achievement scheduler hook is co-located with the notification.

- [ ] **Step 1: Create `apps/lab-lite/src/components/AppShell.tsx`**

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { PageHeader } from '@/components/PageHeader'
import { InstallPrompt } from '@/components/InstallPrompt'
import { AchievementNotification } from '@/components/achievements/AchievementNotification'
import { useAchievementScheduler } from '@/hooks/useAchievementScheduler'
import type { SchedulerRunResult } from '@/lib/achievement-scheduler'

/** Paths that bypass the authenticated shell (no sidebar). */
const PUBLIC_SUFFIXES = ['/login', '/offline']

export function AppShell({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)
  const pathname = usePathname()
  const [pendingAchievements, setPendingAchievements] = useState<SchedulerRunResult | null>(null)
  useAchievementScheduler((result) => setPendingAchievements(result))

  const isPublic = PUBLIC_SUFFIXES.some((suffix) => pathname?.endsWith(suffix))
  const showShell = isAuthenticated && !!session && !isPublic

  if (!showShell) {
    return <main id="main-content">{children}</main>
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <PageHeader />
          <main className="flex flex-1 flex-col gap-4 p-4" id="main-content">
            {children}
          </main>
          <InstallPrompt />
        </SidebarInset>
      </SidebarProvider>
      <AchievementNotification
        result={pendingAchievements}
        onDismiss={() => setPendingAchievements(null)}
      />
    </TooltipProvider>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors. If `AchievementNotification` props have changed, check `@/components/achievements/AchievementNotification` for the current prop interface and adjust.

- [ ] **Step 3: Commit**

```bash
git add apps/lab-lite/src/components/AppShell.tsx
git commit -m "feat(lab-lite): add AppShell with SidebarProvider, SidebarInset, and auth gate"
```

---

### Task 9: Update `[locale]/layout.tsx` to use `AppShell`

**Files:**
- Modify: `apps/lab-lite/src/app/[locale]/layout.tsx`

The locale layout becomes a clean three-liner: provide i18n messages, mount `LockExpiryCheckerMount`, wrap with `AppShell`, and render `EmergencyButton` outside the shell (it's a floating button that must stay above the sidebar z-index stack).

- [ ] **Step 1: Replace the content of `apps/lab-lite/src/app/[locale]/layout.tsx`**

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppShell } from '@/components/AppShell'
import { EmergencyButton } from '@/components/safety/EmergencyButton'
import { LockExpiryCheckerMount } from '@/components/samples/LockExpiryCheckerMount'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <LockExpiryCheckerMount />
      <AppShell>
        {children}
      </AppShell>
      <EmergencyButton />
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm -F lab-lite typecheck
```

Expected: 0 new errors.

- [ ] **Step 3: Run tests**

```bash
pnpm -F lab-lite test 2>&1 | grep -E "(PASS|FAIL|✓|✗)" | head -40
```

Expected: same pass/fail count as before this plan. If any snapshot tests fail with sidebar-related diffs, update snapshots:

```bash
pnpm -F lab-lite test -- --updateSnapshot
```

Then review the diff to confirm only the sidebar structure changed (dark bg-neutral-900 replaced with ShadCN sidebar tokens), not any clinical data rendering. Commit the updated snapshots separately:

```bash
git add apps/lab-lite/src/__tests__/
git commit -m "test(lab-lite): update snapshots for ShadCN sidebar shell migration"
```

- [ ] **Step 4: Commit the layout change**

```bash
git add apps/lab-lite/src/app/[locale]/layout.tsx
git commit -m "refactor(lab-lite): use AppShell in locale layout (SidebarProvider + SidebarInset)"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| ShadCN compound sidebar replaces dark legacy Sidebar | Tasks 3, 7 |
| Light/dark mode via `data-theme="dark"` | Tasks 2 |
| Flash-of-wrong-theme prevented by inline `<script>` | Task 2 |
| `bg-background text-foreground` on body | Tasks 1, 2 |
| PageHeader with SidebarTrigger + current page label | Task 4 |
| Sidebar collapses to icon mode (`collapsible="icon"`) | Task 7 |
| Badge counts visible on nav items | Tasks 5, 7 |
| Sync indicators (online status, data budget, language) in sidebar footer | Task 6 |
| Theme toggle (dark/light) in user dropdown | Task 6 |
| Sign out in user dropdown | Task 6, 7 |
| `AchievementNotification` still rendered | Task 8 |
| `EmergencyButton` preserved outside shell | Task 9 |
| `InstallPrompt` preserved inside SidebarInset | Task 8 |
| All badge hooks (upload, orders, patient queue, auth queue, handover) preserved | Task 7 |
| Role-based nav access (network, cost analysis, auth queue) preserved | Task 7 |
| Typecheck passes after every task | Every task |

### Known Constraints

- The ShadCN sidebar uses `variant="inset"` which gives the content area a slight inset shadow/border. This is the same visual treatment as admin-portal.
- `SidebarNavItem.icon` is a `ReactNode` (already-rendered element), not a component type. The `NavLab` renders it as `{item.icon}` directly — do not try to call it as `<item.icon />`.
- The `🏆` emoji icon for Team Achievements is kept as-is (not a Lucide icon). It renders as a `<span>` inside the `NavLab` icon slot, which is fine.
- RTL: the ShadCN sidebar has built-in RTL support via CSS logical properties. The `SidebarRail` and `SidebarTrigger` will mirror correctly in Arabic/Dari/Pashto locales.
- Page content padding: `AppShell` adds `p-4` to the `<main>` inside `SidebarInset`. If existing page components have their own outer padding, there may be double padding. This is addressed in Phase 2 (`2026-06-04-lab-lite-component-layer.md`).
