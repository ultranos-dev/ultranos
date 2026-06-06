# Pharmacy Lite Sidebar Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy ui-kit `Sidebar` wrapper in `AppShellWrapper` with the shadcn sidebar primitives used by admin-portal, giving pharmacy-lite a collapsible icon-mode sidebar with `NavMain`, `NavUser`, and pharmacy-specific footer widgets.

**Architecture:** Create a `src/components/sidebar/` directory mirroring admin-portal's structure (`app-sidebar.tsx`, `nav-config.ts`, `nav-main.tsx`, `nav-user.tsx`, `pharmacy-header.tsx`). Update `[locale]/layout.tsx` to use `SidebarProvider` + `AppSidebar` + `SidebarInset` directly, removing the `AppShellWrapper` entirely. Nav items retain i18n keys resolved at render time via `useTranslations('sidebar')` — the same translation namespace already used in `AppShellWrapper`. Badge counts (`pending`/`failed`) are driven from `useSyncStore` inside `app-sidebar.tsx` and passed as a typed `badges` prop to `NavMain`. The three existing pharmacy footer widgets (`SyncPulse`, `SyncCapacityBanner`, `SessionExpiryBanner`) and `LanguageSelectorClient` are moved into `SidebarFooter` inside `AppSidebar`.

**Tech Stack:** Next.js 15, `@ultranos/ui-kit` shadcn sidebar primitives (via `src/components/ui/sidebar.tsx` re-export from Plan 1), `next-intl`, Zustand (`auth-session-store`, `sync-store`)

**Prerequisite:** Plan 1 must be complete — specifically `apps/pharmacy-lite/src/components/ui/sidebar.tsx` must exist as a re-export from `@ultranos/ui-kit/components/ui/sidebar`.

---

## File map

| Action | Path |
|--------|------|
| Create | `apps/pharmacy-lite/src/components/sidebar/nav-config.ts` |
| Create | `apps/pharmacy-lite/src/components/sidebar/pharmacy-header.tsx` |
| Create | `apps/pharmacy-lite/src/components/sidebar/nav-main.tsx` |
| Create | `apps/pharmacy-lite/src/components/sidebar/nav-user.tsx` |
| Create | `apps/pharmacy-lite/src/components/sidebar/app-sidebar.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/layout.tsx` |
| Delete | `apps/pharmacy-lite/src/components/AppShellWrapper.tsx` |

---

## Tasks

### Task 1: Create nav-config.ts

This file defines the static navigation structure for the sidebar. It mirrors the groups from the old `AppShellWrapper` nav array but restructures them as typed `NavGroup[]` compatible with the shadcn sidebar pattern. Icons are typed as `LucideIcon` so `NavMain` can render them as `<item.icon />` JSX.

- [ ] Create `apps/pharmacy-lite/src/components/sidebar/nav-config.ts`:

  ```ts
  import type { LucideIcon } from '@ultranos/ui-kit/icons'
  import {
    LayoutGrid,
    Scan,
    FileText,
    List,
    Clock,
    Package,
    PackageCheck,
    BookOpen,
    UserPlus,
    ClipboardCheck,
    Share2,
    Receipt,
    Banknote,
    Users,
    ShieldAlert,
    AlertTriangle,
    BarChart3,
    RefreshCw,
    Settings,
  } from '@ultranos/ui-kit/icons'

  export interface NavItem {
    /**
     * Translation key within the 'sidebar' namespace, e.g. 'dashboard'.
     * Resolved via useTranslations('sidebar')(titleKey) at render time.
     */
    titleKey: string
    url: string
    icon: LucideIcon
    /**
     * If set, this item renders a numeric badge driven by the matching key in
     * the `badges` prop passed to NavMain.
     * Values: 'pending' | 'failed'
     */
    badgeKey?: 'pending' | 'failed'
  }

  export interface NavGroup {
    /**
     * Displayed as the sidebar group label.
     * Hardcoded English — not i18n (matches admin-portal pattern for group labels).
     */
    title: string
    icon: LucideIcon
    items: NavItem[]
  }

  export const navGroups: NavGroup[] = [
    {
      title: 'Dispensing',
      icon: LayoutGrid,
      items: [
        { titleKey: 'dashboard', url: '/',         icon: LayoutGrid },
        { titleKey: 'scanRx',    url: '/scan',      icon: Scan },
        { titleKey: 'paperRx',   url: '/paper-rx',  icon: FileText },
        { titleKey: 'queue',     url: '/queue',     icon: List,     badgeKey: 'pending' },
        { titleKey: 'history',   url: '/history',   icon: Clock },
      ],
    },
    {
      title: 'Inventory',
      icon: Package,
      items: [
        { titleKey: 'stockOverview', url: '/inventory',           icon: Package },
        { titleKey: 'receiveStock',  url: '/inventory/receive',   icon: PackageCheck },
        { titleKey: 'catalog',       url: '/inventory/catalog',   icon: BookOpen },
        { titleKey: 'suppliers',     url: '/inventory/suppliers', icon: UserPlus },
        { titleKey: 'stockCount',    url: '/inventory/count',     icon: ClipboardCheck },
        { titleKey: 'transfers',     url: '/inventory/transfers', icon: Share2 },
      ],
    },
    {
      title: 'Financial',
      icon: Receipt,
      items: [
        { titleKey: 'pos',             url: '/pos',             icon: Receipt },
        { titleKey: 'cashDrawer',      url: '/pos/cash-drawer', icon: Banknote },
        { titleKey: 'patientAccounts', url: '/pos/accounts',    icon: Users },
      ],
    },
    {
      title: 'Clinical',
      icon: ShieldAlert,
      items: [
        { titleKey: 'controlled', url: '/controlled', icon: ShieldAlert },
        { titleKey: 'unverified', url: '/unverified', icon: AlertTriangle },
      ],
    },
    {
      title: 'System',
      icon: Settings,
      items: [
        { titleKey: 'reports',   url: '/reports',  icon: BarChart3 },
        { titleKey: 'syncQueue', url: '/sync',     icon: RefreshCw, badgeKey: 'failed' },
        { titleKey: 'settings',  url: '/settings', icon: Settings },
      ],
    },
  ]
  ```

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/components/sidebar/nav-config.ts
  git commit -m "feat(pharmacy-lite): add sidebar nav-config with grouped nav items"
  ```

---

### Task 2: Create pharmacy-header.tsx

This is the `SidebarHeader` content — analogous to `LocationSwitcher` in admin-portal but simpler: it shows the pharmacy name (read from the auth session store) and a pill icon. It is `pointer-events-none` because it is informational, not a clickable control.

- [ ] Create `apps/pharmacy-lite/src/components/sidebar/pharmacy-header.tsx`:

  ```tsx
  'use client'

  import { Pill } from '@ultranos/ui-kit/icons'
  import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
  } from '@/components/ui/sidebar'
  import { useAuthSessionStore } from '@/stores/auth-session-store'

  export function PharmacyHeader() {
    const pharmacyName = useAuthSessionStore(
      (s) =>
        (s.session as { pharmacyName?: string } | null)?.pharmacyName ??
        'Pharmacy Lite',
    )

    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className="pointer-events-none select-none"
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Pill className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{pharmacyName}</span>
              <span className="truncate text-xs text-muted-foreground">
                Pharmacy
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }
  ```

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/components/sidebar/pharmacy-header.tsx
  git commit -m "feat(pharmacy-lite): add PharmacyHeader sidebar component"
  ```

---

### Task 3: Create nav-main.tsx

This component renders all nav groups. Unlike admin-portal's `NavMain` (which supports collapsible sub-groups), pharmacy-lite's navigation is flat within each group — all items have icons and none have sub-items — so the implementation is simpler: no `Collapsible`, no sub-menus. Badge counts are rendered as small filled circles beside the label when non-zero.

- [ ] Create `apps/pharmacy-lite/src/components/sidebar/nav-main.tsx`:

  ```tsx
  'use client'

  import Link from 'next/link'
  import { usePathname } from 'next/navigation'
  import { useTranslations } from 'next-intl'
  import { type NavGroup } from './nav-config'
  import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
  } from '@/components/ui/sidebar'

  interface NavMainProps {
    groups: NavGroup[]
    /**
     * Runtime badge counts keyed by badgeKey ('pending' | 'failed').
     * Non-zero values render a small numeric badge beside the nav item label.
     * Zero values render nothing.
     */
    badges?: Partial<Record<'pending' | 'failed', number>>
  }

  export function NavMain({ groups, badges = {} }: NavMainProps) {
    const pathname = usePathname()
    const t = useTranslations('sidebar')

    return (
      <>
        {groups.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive =
                  item.url === '/'
                    ? pathname === '/' || pathname === ''
                    : pathname === item.url ||
                      pathname.startsWith(`${item.url}/`)

                const badgeCount =
                  item.badgeKey !== undefined
                    ? (badges[item.badgeKey] ?? 0)
                    : 0

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={t(item.titleKey)}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{t(item.titleKey)}</span>
                        {badgeCount > 0 && (
                          <span className="ms-auto flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </>
    )
  }
  ```

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/components/sidebar/nav-main.tsx
  git commit -m "feat(pharmacy-lite): add NavMain sidebar component with i18n and badge support"
  ```

---

### Task 4: Create nav-user.tsx

This component is the `SidebarFooter` user section. It mirrors admin-portal's `NavUser` but adapted for the pharmacy session store: shows `displayName` (from `session.name` or derived from email), `role`, and `email`. Sign-out performs the same cleanup sequence as the old `AppShellWrapper`: wipe encryption key, stop sync drain, stop KRL sync, stop audit drain, clear session, call Supabase sign-out, redirect.

- [ ] Create `apps/pharmacy-lite/src/components/sidebar/nav-user.tsx`:

  ```tsx
  'use client'

  import { useCallback } from 'react'
  import { useTheme } from '@/components/ThemeProvider'
  import { useAuthSessionStore } from '@/stores/auth-session-store'
  import { encryptionKeyStore } from '@/lib/encryption-key-store'
  import { stopSyncDrain } from '@/lib/sync-drain-init'
  import { stopKrlSync } from '@/lib/krl-sync-worker'
  import { stopAuditDrain } from '@/lib/audit'
  import { getSupabaseBrowserClient } from '@/lib/supabase'
  import {
    ChevronsUpDown,
    LogOut,
    Settings,
    Moon,
    Sun,
  } from '@ultranos/ui-kit/icons'
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
  import Link from 'next/link'

  function getInitials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w[0] ?? '').toUpperCase())
      .slice(0, 2)
      .join('')
  }

  export function NavUser() {
    const { isMobile } = useSidebar()
    const { theme, toggleTheme } = useTheme()
    const session = useAuthSessionStore((s) => s.session)

    const displayName =
      (session as { name?: string } | null)?.name ??
      session?.email?.split('@')[0] ??
      'Pharmacist'
    const email = session?.email ?? ''
    const role = session?.role ?? 'pharmacist'
    const initials = getInitials(displayName)

    const handleSignOut = useCallback(async () => {
      encryptionKeyStore.wipe()
      stopSyncDrain()
      stopKrlSync()
      stopAuditDrain()
      useAuthSessionStore.getState().clearSession()
      try {
        await getSupabaseBrowserClient().auth.signOut()
      } finally {
        window.location.href = '/login'
      }
    }, [])

    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex shrink-0 size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground capitalize">
                    {role}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
              side={isMobile ? 'top' : 'right'}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <div className="flex shrink-0 size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {initials}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {email}
                    </span>
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
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 size-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }
  ```

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/components/sidebar/nav-user.tsx
  git commit -m "feat(pharmacy-lite): add NavUser sidebar component with theme toggle and sign-out"
  ```

---

### Task 5: Create app-sidebar.tsx

This is the top-level sidebar assembly component. It reads `pendingCount` and `failedCount` from `useSyncStore`, passes them as the `badges` prop to `NavMain`, and places all footer widgets in `SidebarFooter`. The `LanguageSelectorClient` is wrapped in a thin helper that reads the sidebar collapse state so it can adjust its own rendering accordingly.

- [ ] Create `apps/pharmacy-lite/src/components/sidebar/app-sidebar.tsx`:

  ```tsx
  'use client'

  import * as React from 'react'
  import { navGroups } from './nav-config'
  import { PharmacyHeader } from './pharmacy-header'
  import { NavMain } from './nav-main'
  import { NavUser } from './nav-user'
  import { SyncPulse } from '@/components/pharmacy/SyncPulse'
  import { SyncCapacityBanner } from '@/components/pharmacy/SyncCapacityBanner'
  import { SessionExpiryBanner } from '@/components/pharmacy/SessionExpiryBanner'
  import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    useSidebar,
  } from '@/components/ui/sidebar'
  import { useSyncStore } from '@/stores/sync-store'

  /**
   * Thin wrapper so LanguageSelectorClient can read sidebar collapse state
   * without the parent component needing to be aware of it.
   */
  function SidebarLanguageSelector() {
    const { state } = useSidebar()
    return <LanguageSelectorClient collapsed={state === 'collapsed'} />
  }

  export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
    const pendingCount = useSyncStore((s) => s.pendingCount)
    const failedCount  = useSyncStore((s) => s.failedCount)

    const badges = {
      pending: pendingCount,
      failed:  failedCount,
    } as const

    return (
      <Sidebar collapsible="icon" variant="inset" {...props}>
        <SidebarHeader>
          <PharmacyHeader />
        </SidebarHeader>

        <SidebarContent>
          <NavMain groups={navGroups} badges={badges} />
        </SidebarContent>

        <SidebarFooter>
          <SyncCapacityBanner />
          <SessionExpiryBanner />
          <SyncPulse />
          <SidebarLanguageSelector />
          <NavUser />
        </SidebarFooter>
      </Sidebar>
    )
  }
  ```

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/components/sidebar/app-sidebar.tsx
  git commit -m "feat(pharmacy-lite): add AppSidebar component using shadcn sidebar primitives"
  ```

---

### Task 6: Update [locale]/layout.tsx

The current `[locale]/layout.tsx` wraps children in `AppShellWrapper`. Replace it with a direct `SidebarProvider` + `AppSidebar` + `SidebarInset` layout. The `SyncProvider` stays — it must remain wrapping `SidebarProvider` so that sync state is available to `AppSidebar` via `useSyncStore`.

The skip-to-content link is moved here (it was inside `AppShellWrapper` before) and its classes are updated to use semantic tokens (`bg-background`, `text-foreground`, `outline-ring`) instead of hardcoded colours.

The `<main>` wrapper no longer carries `px-4 py-6 sm:px-6 lg:px-8` padding — individual page components own their own padding. This matches admin-portal's pattern where `SidebarInset` provides the layout frame and pages handle their own spacing.

- [ ] Replace `apps/pharmacy-lite/src/app/[locale]/layout.tsx`:

  ```tsx
  import { NextIntlClientProvider } from 'next-intl'
  import { getMessages } from 'next-intl/server'
  import { SyncProvider } from '@/components/providers/SyncProvider'
  import { AppSidebar } from '@/components/sidebar/app-sidebar'
  import {
    SidebarInset,
    SidebarProvider,
  } from '@/components/ui/sidebar'

  export default async function LocaleLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    const messages = await getMessages()

    return (
      <NextIntlClientProvider messages={messages}>
        <SyncProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-ring"
              >
                Skip to content
              </a>
              <main id="main-content">
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>
        </SyncProvider>
      </NextIntlClientProvider>
    )
  }
  ```

- [ ] Commit:
  ```bash
  git add apps/pharmacy-lite/src/app/[locale]/layout.tsx
  git commit -m "refactor(pharmacy-lite): replace AppShellWrapper with SidebarProvider + AppSidebar"
  ```

---

### Task 7: Delete AppShellWrapper.tsx

The `AppShellWrapper` is now fully replaced. All its responsibilities have been distributed:
- Nav items → `nav-config.ts` + `NavMain`
- User section + sign-out → `NavUser`
- Sync indicator → `SyncPulse` in `SidebarFooter`
- Language selector → `SidebarLanguageSelector` in `SidebarFooter`
- `SyncCapacityBanner` + `SessionExpiryBanner` → `SidebarFooter`
- The auth gate (the `if (!isAuthenticated...)` early return) → handled by the existing `AuthGuard` or login redirect; the login page itself does not use the locale layout sidebar, so no sidebar renders there.
- Keyboard shortcuts (`useKeyboardShortcuts`), catalog sync (`useCatalogSync`), expiry watchdog (`useExpiryWatchdog`) → these hooks were called inside `AppShellWrapper`. They must be moved.

- [ ] Before deleting, check which hooks are called in `AppShellWrapper` and are not yet called elsewhere:
  ```bash
  grep -n "useKeyboardShortcuts\|useCatalogSync\|useExpiryWatchdog" \
    apps/pharmacy-lite/src/components/AppShellWrapper.tsx
  ```
  Expected output shows three hooks at lines ~81-83.

- [ ] These hooks need a new home. The best place is `AppSidebar` since it's always mounted when the authenticated shell is active. Add them to `app-sidebar.tsx` after the store reads:

  Open `apps/pharmacy-lite/src/components/sidebar/app-sidebar.tsx` and add these imports after the existing imports block:
  ```tsx
  import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
  import { useCatalogSync } from '@/hooks/useCatalogSync'
  import { useExpiryWatchdog } from '@/hooks/useExpiryWatchdog'
  ```

  Then add the hook calls inside `AppSidebar` immediately after the `badges` const:
  ```tsx
  useKeyboardShortcuts()
  useCatalogSync()
  useExpiryWatchdog()
  ```

  The complete updated `AppSidebar` function body:
  ```tsx
  export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
    const pendingCount = useSyncStore((s) => s.pendingCount)
    const failedCount  = useSyncStore((s) => s.failedCount)

    const badges = {
      pending: pendingCount,
      failed:  failedCount,
    } as const

    useKeyboardShortcuts()
    useCatalogSync()
    useExpiryWatchdog()

    return (
      <Sidebar collapsible="icon" variant="inset" {...props}>
        <SidebarHeader>
          <PharmacyHeader />
        </SidebarHeader>

        <SidebarContent>
          <NavMain groups={navGroups} badges={badges} />
        </SidebarContent>

        <SidebarFooter>
          <SyncCapacityBanner />
          <SessionExpiryBanner />
          <SyncPulse />
          <SidebarLanguageSelector />
          <NavUser />
        </SidebarFooter>
      </Sidebar>
    )
  }
  ```

- [ ] Amend the app-sidebar commit to include the hook calls (or create a new commit):
  ```bash
  git add apps/pharmacy-lite/src/components/sidebar/app-sidebar.tsx
  git commit -m "feat(pharmacy-lite): move useKeyboardShortcuts/useCatalogSync/useExpiryWatchdog into AppSidebar"
  ```

- [ ] Now delete `AppShellWrapper.tsx`:
  ```bash
  git rm apps/pharmacy-lite/src/components/AppShellWrapper.tsx
  git commit -m "chore(pharmacy-lite): remove AppShellWrapper (replaced by sidebar/ directory)"
  ```

---

### Task 8: Verify Plan 2

- [ ] Check for any remaining imports of `AppShellWrapper` in the codebase:
  ```bash
  grep -r "AppShellWrapper" apps/pharmacy-lite/src/
  ```
  Expected: no output.

- [ ] Run typecheck on non-test files:
  ```bash
  pnpm -F pharmacy-lite typecheck 2>&1 | grep "error TS" | grep -v "__tests__"
  ```
  Expected: no output.

  If you see errors about `useSidebar` being used outside a `SidebarProvider`, check that `SidebarLanguageSelector` is only rendered inside the `Sidebar` tree (it is — it's inside `AppSidebar` which is inside `SidebarProvider` in the layout).

  If you see errors about `session.name` not existing on the session type, check `apps/pharmacy-lite/src/stores/auth-session-store.ts` for the session interface. The cast `(session as { name?: string } | null)?.name` in `PharmacyHeader` and `NavUser` is intentional to avoid modifying the session type for an optional field.

- [ ] Run the test suite:
  ```bash
  pnpm -F pharmacy-lite test 2>&1 | tail -10
  ```
  Expected: same pass count as before Plan 2. If any snapshot tests reference `AppShellWrapper`, delete those snapshots and re-run with `--update-snapshots`:
  ```bash
  pnpm -F pharmacy-lite test -- --update-snapshots 2>&1 | tail -10
  ```

- [ ] Run the build:
  ```bash
  pnpm -F pharmacy-lite build 2>&1 | tail -15
  ```
  Expected: successful build with no errors. Common failure modes:
  - `Module not found: Can't resolve '@/components/ui/sidebar'` → Plan 1 Task 6 was not completed; create `src/components/ui/sidebar.tsx` as described in Plan 1.
  - `useTheme must be used within ThemeProvider` → verify `ThemeProvider` wraps the root layout (Plan 1 Task 3) and that `nav-user.tsx` is only rendered inside the sidebar which is inside the locale layout which is inside the root layout.
  - `Cannot find module '@/components/pharmacy/SyncPulse'` → the import path is correct; verify the file exists at `apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx`.

- [ ] Manual verification (start dev server):
  ```bash
  pnpm -F pharmacy-lite dev
  ```
  Navigate to http://localhost:3002 and confirm:
  - [ ] Collapsible sidebar renders with Pharmacy Lite header (pill icon + pharmacy name).
  - [ ] Five nav groups visible: Dispensing, Inventory, Financial, Clinical, System.
  - [ ] Active route is highlighted with `isActive` styling.
  - [ ] Clicking a nav item navigates to the correct route.
  - [ ] Sidebar collapse button collapses to icon-only mode; icons remain visible with tooltips on hover.
  - [ ] Badge appears on Queue item when `pendingCount > 0` in sync store.
  - [ ] Badge appears on Sync Queue item when `failedCount > 0`.
  - [ ] Theme toggle in user dropdown switches dark/light mode without flash on page reload.
  - [ ] Sign out wipes state and redirects to `/login`.
  - [ ] RTL: set locale to Arabic (`ar`) and confirm sidebar mirrors correctly (icons that are navigation-type mirror, pill icon does not).
  - [ ] Login page at `/login` renders without a sidebar (the login page is outside the `[locale]/layout.tsx` locale layout tree — it sits at `app/[locale]/login/page.tsx` which is inside the locale layout but `AppSidebar` does not gate on auth; verify that the login page still looks correct and the sidebar does not appear since `SyncProvider` and session state are empty at that point). If sidebar appears on login, add an `AuthGuard`-style early return in `LocaleLayout` or conditionally render `AppSidebar` based on session state.
