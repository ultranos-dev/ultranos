# OPD Lite — Component Architecture Migration (ShadCN Sidebar + Layout Parity)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OPD Lite's custom sidebar (inline-style `Sidebar` from `@ultranos/ui-kit`) with the ShadCN sidebar primitives pattern used by pharmacy-lite and admin-portal, fix the locale layout to use `SidebarProvider`/`SidebarInset`, create a `TopHeader` component, update all page layouts to use wider containers and consistent headers, and align the primary button variant with the design system token.

**Architecture:** Three phases. Phase 1 adds the ShadCN UI re-exports and the new sidebar module (nav-config, nav-main, opd-header, nav-user). Phase 2 rewires `AppSidebar` and `layout.tsx` to use ShadCN primitives. Phase 3 updates pages and shared components. The old custom `Sidebar` component from `@ultranos/ui-kit` is replaced entirely — it used hundreds of inline `style={}` props with hardcoded HSL values that bypass Tailwind and can never pick up semantic tokens. After this plan, OPD Lite's chrome renders identically to pharmacy-lite: collapsible-icon sidebar with inset content, themed header, and consistent page containers.

**Tech Stack:** Next.js 15, Tailwind CSS, `@ultranos/ui-kit` ShadCN sidebar primitives, `next-intl`, Zustand, Vitest + React Testing Library.

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/opd-lite/src/components/ui/sidebar.tsx` |
| Create | `apps/opd-lite/src/components/ui/dropdown-menu.tsx` |
| Create | `apps/opd-lite/src/components/sidebar/nav-config.ts` |
| Create | `apps/opd-lite/src/components/sidebar/nav-main.tsx` |
| Create | `apps/opd-lite/src/components/sidebar/opd-header.tsx` |
| Create | `apps/opd-lite/src/components/sidebar/nav-user.tsx` |
| Create | `apps/opd-lite/src/components/TopHeader.tsx` |
| Create | `apps/opd-lite/src/__tests__/sidebar.test.tsx` |
| Modify | `apps/opd-lite/src/components/AppSidebar.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/layout.tsx` |
| Modify | `apps/opd-lite/src/components/ui/Button.tsx` |
| Modify | `apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/appointments/page.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/notifications/page.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/conflicts/page.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/settings/page.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/duplicate-review/page.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/expiring-consents/page.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/register-patient/page.tsx` |
| Modify | `apps/opd-lite/src/app/[locale]/kyc/page.tsx` |

---

## Phase 1: ShadCN UI re-exports + new sidebar module

---

### Task 1: Add ui/sidebar.tsx and ui/dropdown-menu.tsx re-exports

**Context:** `apps/opd-lite/src/components/ui/` currently only has `Button.tsx`. Nav-main and nav-user will import from `@/components/ui/sidebar` and `@/components/ui/dropdown-menu`. These thin re-exports match the exact same pattern used by pharmacy-lite: both files are one-liners that barrel-export from `@ultranos/ui-kit`.

**Files:**
- Create: `apps/opd-lite/src/components/ui/sidebar.tsx`
- Create: `apps/opd-lite/src/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Create sidebar.tsx re-export**

```typescript
// apps/opd-lite/src/components/ui/sidebar.tsx
export * from '@ultranos/ui-kit/components/ui/sidebar'
```

- [ ] **Step 2: Create dropdown-menu.tsx re-export**

```typescript
// apps/opd-lite/src/components/ui/dropdown-menu.tsx
export * from '@ultranos/ui-kit/components/ui/dropdown-menu'
```

- [ ] **Step 3: Verify the re-exports resolve**

Run from repo root:
```bash
pnpm -F opd-lite typecheck
```
Expected: no new errors on the two new files (they may not be imported yet, that's fine).

- [ ] **Step 4: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add apps/opd-lite/src/components/ui/sidebar.tsx apps/opd-lite/src/components/ui/dropdown-menu.tsx
git commit -m "feat(opd-lite): add ShadCN sidebar and dropdown-menu ui re-exports"
```

---

### Task 2: Create sidebar/nav-config.ts

**Context:** This is the navigation data layer — pure TypeScript, no JSX. It defines `NavItem` and `NavGroup` interfaces plus the `navGroups` array used by `NavMain`. The OPD Lite badge keys (`'notifications' | 'conflicts' | 'duplicateReviews' | 'expiringConsents' | 'todayAppointments'`) come from the existing `useNavBadges` hook at `src/hooks/useNavBadges.ts` — they match exactly so that `AppSidebar` can pass the badges object directly with no adaptation.

**Files:**
- Create: `apps/opd-lite/src/components/sidebar/nav-config.ts`

- [ ] **Step 1: Create nav-config.ts**

```typescript
// apps/opd-lite/src/components/sidebar/nav-config.ts
import type { LucideIcon } from '@ultranos/ui-kit/icons'
import {
  LayoutGrid,
  Calendar,
  Users,
  UserPlus,
  Bell,
  AlertTriangle,
  UserSearch,
  FileWarning,
  Shield,
  Settings,
} from '@ultranos/ui-kit/icons'

export type NavBadgeKey =
  | 'todayAppointments'
  | 'notifications'
  | 'conflicts'
  | 'duplicateReviews'
  | 'expiringConsents'

export interface NavItem {
  /**
   * Translation key within the 'sidebar' namespace.
   * Resolved via useTranslations('sidebar')(titleKey) at render time.
   */
  titleKey: string
  url: string
  icon: LucideIcon
  /**
   * If set, renders a numeric badge driven by the matching key in the `badges` prop.
   */
  badgeKey?: NavBadgeKey
}

export interface NavGroup {
  /** Displayed as the sidebar group label. English, not i18n. */
  title: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    title: 'Core',
    items: [
      { titleKey: 'dashboard',       url: '/',                 icon: LayoutGrid },
      { titleKey: 'appointments',    url: '/appointments',     icon: Calendar,     badgeKey: 'todayAppointments' },
      { titleKey: 'patients',        url: '/patients',         icon: Users },
      { titleKey: 'registerPatient', url: '/register-patient', icon: UserPlus },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { titleKey: 'notifications',   url: '/notifications',    icon: Bell,         badgeKey: 'notifications' },
      { titleKey: 'conflicts',       url: '/conflicts',        icon: AlertTriangle, badgeKey: 'conflicts' },
      { titleKey: 'duplicateReviews', url: '/duplicate-review', icon: UserSearch,  badgeKey: 'duplicateReviews' },
      { titleKey: 'expiringConsents', url: '/expiring-consents', icon: FileWarning, badgeKey: 'expiringConsents' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { titleKey: 'kyc',             url: '/kyc',              icon: Shield },
    ],
  },
  {
    title: 'System',
    items: [
      { titleKey: 'settings',        url: '/settings',         icon: Settings },
    ],
  },
]
```

- [ ] **Step 2: Write a unit test for nav-config**

```typescript
// apps/opd-lite/src/__tests__/sidebar.test.tsx
import { describe, it, expect } from 'vitest'
import { navGroups } from '../components/sidebar/nav-config'

describe('navGroups', () => {
  it('has exactly 4 groups', () => {
    expect(navGroups).toHaveLength(4)
  })

  it('group titles are Core, Clinical, Admin, System', () => {
    const titles = navGroups.map((g) => g.title)
    expect(titles).toEqual(['Core', 'Clinical', 'Admin', 'System'])
  })

  it('every item has a titleKey, url, and icon', () => {
    for (const group of navGroups) {
      for (const item of group.items) {
        expect(item.titleKey).toBeTruthy()
        expect(item.url).toBeTruthy()
        expect(item.icon).toBeTruthy()
      }
    }
  })

  it('all badgeKeys are valid NavBadgeKey values', () => {
    const validKeys = new Set([
      'todayAppointments',
      'notifications',
      'conflicts',
      'duplicateReviews',
      'expiringConsents',
    ])
    for (const group of navGroups) {
      for (const item of group.items) {
        if (item.badgeKey !== undefined) {
          expect(validKeys.has(item.badgeKey)).toBe(true)
        }
      }
    }
  })
})
```

- [ ] **Step 3: Run the test**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
pnpm -F opd-lite test -- --reporter=verbose src/__tests__/sidebar.test.tsx
```

Expected: 4 passing tests.

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/sidebar/nav-config.ts apps/opd-lite/src/__tests__/sidebar.test.tsx
git commit -m "feat(opd-lite): add sidebar nav-config with OPD nav groups and badge keys"
```

---

### Task 3: Create sidebar/nav-main.tsx

**Context:** This component renders the ShadCN `SidebarGroup`/`SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton` tree from `navGroups`. Active state detection: exact match for `/`, prefix match for everything else. Badge rendering: a small filled circle with count only when `badgeCount > 0`. This is an exact port of `apps/pharmacy-lite/src/components/sidebar/nav-main.tsx` with the OPD badge type.

**Files:**
- Create: `apps/opd-lite/src/components/sidebar/nav-main.tsx`

- [ ] **Step 1: Create nav-main.tsx**

```typescript
// apps/opd-lite/src/components/sidebar/nav-main.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type NavGroup, type NavBadgeKey } from './nav-config'
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
   * Runtime badge counts keyed by NavBadgeKey.
   * Non-zero values render a small numeric badge beside the nav item label.
   */
  badges?: Partial<Record<NavBadgeKey, number>>
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
                  : pathname === item.url || pathname.startsWith(`${item.url}/`)

              const badgeCount =
                item.badgeKey !== undefined ? (badges[item.badgeKey] ?? 0) : 0

              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={t(item.titleKey)}>
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

- [ ] **Step 2: Add render tests to sidebar.test.tsx**

Add to `apps/opd-lite/src/__tests__/sidebar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

// Additional mocks needed for NavMain
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/components/ui/sidebar', () => ({
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({ children, isActive }: { children: React.ReactNode; isActive?: boolean }) => (
    <button data-active={isActive}>{children}</button>
  ),
}))

import { NavMain } from '../components/sidebar/nav-main'
import { navGroups } from '../components/sidebar/nav-config'

describe('NavMain', () => {
  it('renders all group labels', () => {
    render(<NavMain groups={navGroups} />)
    expect(screen.getByText('Core')).toBeInTheDocument()
    expect(screen.getByText('Clinical')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('renders badge when count > 0', () => {
    render(<NavMain groups={navGroups} badges={{ notifications: 5 }} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('does not render badge when count is 0', () => {
    render(<NavMain groups={navGroups} badges={{ notifications: 0 }} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows 99+ when badge count exceeds 99', () => {
    render(<NavMain groups={navGroups} badges={{ conflicts: 150 }} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm -F opd-lite test -- --reporter=verbose src/__tests__/sidebar.test.tsx
```

Expected: all tests passing (navGroups unit tests + NavMain render tests).

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/sidebar/nav-main.tsx apps/opd-lite/src/__tests__/sidebar.test.tsx
git commit -m "feat(opd-lite): add NavMain sidebar component with badge support"
```

---

### Task 4: Create sidebar/opd-header.tsx

**Context:** Renders the app branding at the top of the sidebar — icon + "OPD Lite" text + "Clinic" subtitle. Follows pharmacy-lite's `PharmacyHeader` pattern exactly. Uses `Stethoscope` icon from `@ultranos/ui-kit/icons`. The `pointer-events-none select-none` on the button ensures clicking the branding header does nothing. `bg-sidebar-primary` and `text-sidebar-primary-foreground` are the ShadCN sidebar token names.

**Files:**
- Create: `apps/opd-lite/src/components/sidebar/opd-header.tsx`

- [ ] **Step 1: Create opd-header.tsx**

```typescript
// apps/opd-lite/src/components/sidebar/opd-header.tsx
'use client'

import { Stethoscope } from '@ultranos/ui-kit/icons'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export function OpdHeader() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="pointer-events-none select-none">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Stethoscope className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">OPD Lite</span>
            <span className="truncate text-xs text-muted-foreground">Clinic</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
```

- [ ] **Step 2: Add render test to sidebar.test.tsx**

Add to `apps/opd-lite/src/__tests__/sidebar.test.tsx`:

```typescript
vi.mock('@/components/ui/sidebar', () => ({
  // existing mock entries from Task 3 plus:
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

import { OpdHeader } from '../components/sidebar/opd-header'

describe('OpdHeader', () => {
  it('renders OPD Lite branding text', () => {
    render(<OpdHeader />)
    expect(screen.getByText('OPD Lite')).toBeInTheDocument()
    expect(screen.getByText('Clinic')).toBeInTheDocument()
  })
})
```

Note: The `vi.mock('@/components/ui/sidebar', ...)` call must cover all exports used across the entire test file. Merge this with the mock from Task 3 — both tasks import from `@/components/ui/sidebar`.

- [ ] **Step 3: Run tests**

```bash
pnpm -F opd-lite test -- --reporter=verbose src/__tests__/sidebar.test.tsx
```

Expected: all tests passing.

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/sidebar/opd-header.tsx apps/opd-lite/src/__tests__/sidebar.test.tsx
git commit -m "feat(opd-lite): add OpdHeader sidebar branding component"
```

---

### Task 5: Create sidebar/nav-user.tsx

**Context:** This is the PHI-safe sign-out dropdown. The current `AppSidebar.tsx` contains the full sign-out logic: clear 6 PHI stores, emit audit event, `clearPhiTables()`, wipe encryption key, clear signing keys, clear auth session, then call Supabase `signOut()`, redirect to `/login`. That logic must be extracted here verbatim — this is the only place sign-out should live. The component also has a theme toggle (Moon/Sun) and Settings link, matching pharmacy-lite's pattern.

**Files:**
- Create: `apps/opd-lite/src/components/sidebar/nav-user.tsx`

- [ ] **Step 1: Create nav-user.tsx**

```typescript
// apps/opd-lite/src/components/sidebar/nav-user.tsx
'use client'

import { useCallback } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useEncounterStore } from '@/stores/encounter-store'
import { useVitalsStore } from '@/stores/vitals-store'
import { useDiagnosisStore } from '@/stores/diagnosis-store'
import { useSoapNoteStore } from '@/stores/soap-note-store'
import { usePrescriptionStore } from '@/stores/prescription-store'
import { useAllergyStore } from '@/stores/allergy-store'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { clearSigningKeys } from '@/lib/signing-key-store'
import { clearPhiTables } from '@/lib/phi-cleanup'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
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
    'Clinician'
  const email = session?.email ?? ''
  const role = session?.role ?? 'clinician'
  const initials = getInitials(displayName)

  const handleSignOut = useCallback(async () => {
    // Clear PHI stores first (order matters — PHI before keys before auth)
    useEncounterStore.getState().clearPhiState()
    useVitalsStore.getState().clearPhiState()
    useDiagnosisStore.getState().clearPhiState()
    useSoapNoteStore.getState().clearPhiState()
    usePrescriptionStore.getState().clearPhiState()
    useAllergyStore.getState().clearPhiState()

    auditPhiAccess(AuditAction.LOGOUT, AuditResourceType.USER_ACCOUNT, 'user-logout')
    await clearPhiTables()

    encryptionKeyStore.wipe()
    clearSigningKeys()
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

- [ ] **Step 2: Run typecheck to verify imports**

```bash
pnpm -F opd-lite typecheck
```

Expected: no new errors from nav-user.tsx. (Note: sign-out logic imports are copied verbatim from the existing `AppSidebar.tsx`, so they are known-good.)

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/sidebar/nav-user.tsx
git commit -m "feat(opd-lite): add NavUser sidebar component with PHI-safe sign-out"
```

---

## Phase 2: Rewire AppSidebar + locale layout

---

### Task 6: Refactor AppSidebar.tsx to use ShadCN sidebar primitives

**Context:** `AppSidebar.tsx` currently wraps `Sidebar` from `@ultranos/ui-kit` (the legacy monolithic component with inline HSL styles). This task replaces that entirely. The new implementation:
- Uses ShadCN `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter` from `@/components/ui/sidebar`
- Renders `OpdHeader` in the header slot
- Renders `NavMain` with nav groups + badges in the content slot
- Renders `SyncPulse` + `SidebarLanguageSelector` + `NavUser` in the footer slot
- The `handleSignOut` logic moves to `nav-user.tsx` (Task 5) — do NOT duplicate it here
- Keep `useNavBadges` call in `AppSidebar` and pass down to `NavMain`
- The `getInitials` helper and user display name logic also move to `NavUser` — remove them from `AppSidebar`
- The `isAuthenticated` guard (don't render sidebar on `/login`) stays in `AppSidebar`
- The `SidebarLanguageSelector` thin wrapper (reads `useSidebar()` collapse state) also stays here, same pattern as pharmacy-lite

**Files:**
- Modify: `apps/opd-lite/src/components/AppSidebar.tsx`

- [ ] **Step 1: Rewrite AppSidebar.tsx**

```typescript
// apps/opd-lite/src/components/AppSidebar.tsx
'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useNavBadges } from '@/hooks/useNavBadges'
import { navGroups } from '@/components/sidebar/nav-config'
import { OpdHeader } from '@/components/sidebar/opd-header'
import { NavMain } from '@/components/sidebar/nav-main'
import { NavUser } from '@/components/sidebar/nav-user'
import { SyncPulse } from '@/components/SyncPulse'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar'

/**
 * Thin wrapper so LanguageSelectorClient can read sidebar collapse state
 * without the parent needing to be aware of it.
 */
function SidebarLanguageSelector() {
  const { state } = useSidebar()
  return <LanguageSelectorClient collapsed={state === 'collapsed'} />
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)
  const pathname = usePathname()
  const badges = useNavBadges()

  // Don't render sidebar on login page or when unauthenticated
  if (!isAuthenticated || !session || pathname.endsWith('/login')) {
    return null
  }

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <OpdHeader />
      </SidebarHeader>

      <SidebarContent>
        <NavMain groups={navGroups} badges={badges} />
      </SidebarContent>

      <SidebarFooter>
        <SyncPulse />
        <SidebarLanguageSelector />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm -F opd-lite typecheck
```

Expected: no errors from AppSidebar.tsx.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/AppSidebar.tsx
git commit -m "feat(opd-lite): refactor AppSidebar to use ShadCN sidebar primitives"
```

---

### Task 7: Update locale layout.tsx to use SidebarProvider + SidebarInset

**Context:** The current `apps/opd-lite/src/app/[locale]/layout.tsx` wraps everything in `<AppSidebar>` with children. After Task 6, `AppSidebar` no longer wraps children — it is a sidebar component passed as a peer to `SidebarInset`. The layout must adopt `SidebarProvider` + `SidebarInset` from `@/components/ui/sidebar`, add a skip-to-content link for accessibility, and remove the now-null `AppHeader`. `SyncDashboard` is a floating overlay — it stays outside `SidebarInset` but inside `SyncProvider`.

**Files:**
- Modify: `apps/opd-lite/src/app/[locale]/layout.tsx`

- [ ] **Step 1: Rewrite locale layout.tsx**

```typescript
// apps/opd-lite/src/app/[locale]/layout.tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppSidebar } from '@/components/AppSidebar'
import { SyncProvider } from '@/components/providers/SyncProvider'
import { SyncDashboard } from '@/components/SyncDashboard'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
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
        <SyncDashboard />
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm -F opd-lite typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/app/[locale]/layout.tsx
git commit -m "feat(opd-lite): adopt SidebarProvider + SidebarInset layout pattern"
```

---

## Phase 3: TopHeader, Button alignment, and page updates

---

### Task 8: Create TopHeader.tsx

**Context:** Every interior page (appointments, conflicts, notifications, etc.) currently has a bespoke `<header>` block with `Back to Dashboard` link + `text-3xl font-black` h1 + `text-neutral-500` description. `TopHeader` replaces all of that with the standard `px-6 pt-6 pb-4` container, `text-2xl font-semibold tracking-tight text-foreground` title, and optional `text-sm text-muted-foreground` description. This is an exact copy of `apps/pharmacy-lite/src/components/TopHeader.tsx`.

**Files:**
- Create: `apps/opd-lite/src/components/TopHeader.tsx`

- [ ] **Step 1: Create TopHeader.tsx**

```typescript
// apps/opd-lite/src/components/TopHeader.tsx
interface TopHeaderProps {
  title: string
  description?: string
}

export function TopHeader({ title, description }: TopHeaderProps) {
  return (
    <div className="px-6 pt-6 pb-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write test for TopHeader**

Add to `apps/opd-lite/src/__tests__/sidebar.test.tsx` (or create a new file `top-header.test.tsx` — either works):

```typescript
import { TopHeader } from '../components/TopHeader'

describe('TopHeader', () => {
  it('renders the title', () => {
    render(<TopHeader title="Appointments" />)
    expect(screen.getByRole('heading', { name: 'Appointments' })).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<TopHeader title="Appointments" description="Your schedule for today" />)
    expect(screen.getByText('Your schedule for today')).toBeInTheDocument()
  })

  it('omits description element when not provided', () => {
    const { container } = render(<TopHeader title="Appointments" />)
    expect(container.querySelector('p')).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm -F opd-lite test -- --reporter=verbose src/__tests__/sidebar.test.tsx
```

Expected: all tests passing.

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/TopHeader.tsx apps/opd-lite/src/__tests__/sidebar.test.tsx
git commit -m "feat(opd-lite): add TopHeader component"
```

---

### Task 9: Update Button.tsx — primary variant + remove pill styling

**Context:** `Button.tsx` primary variant is currently `bg-pill-green text-pill-text` (custom OPD green), and all button variants use `rounded-pill` (border-radius: 9999px) with `hover:brightness` effects. Admin-portal uses `bg-primary text-primary-foreground` for primary, `rounded-md` corner radius, and `hover:bg-primary/90` pattern. This task aligns the primary variant and base shape. All other variants keep their logic but get `rounded-md` base shape. The `icon` variant keeps `rounded-full` since it's circular. The `pill-button.tsx` component will be updated to use `Button` internally at the end of this task.

**Files:**
- Modify: `apps/opd-lite/src/components/ui/Button.tsx`
- Modify: `apps/opd-lite/src/components/pill-button.tsx`

- [ ] **Step 1: Rewrite Button.tsx**

```typescript
// apps/opd-lite/src/components/ui/Button.tsx
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
  primary:   'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  danger:    'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  warning:   'bg-warning/20 text-foreground border border-warning/50 hover:bg-warning/30',
  ghost:     'bg-transparent text-primary hover:bg-muted',
  outline:   'border border-border bg-background text-foreground hover:bg-muted',
  icon:      'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
}

const baseText =
  'inline-flex items-center justify-center rounded-md ' +
  'px-4 py-2 text-sm font-medium ' +
  'transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const baseIcon =
  'inline-flex items-center justify-center rounded-full ' +
  'p-2 ' +
  'transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

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

- [ ] **Step 2: Update pill-button.tsx to delegate to Button**

```typescript
// apps/opd-lite/src/components/pill-button.tsx
'use client'

import { Button } from '@/components/ui/Button'

interface PillButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}

export function PillButton({ children, onClick, disabled = false }: PillButtonProps) {
  return (
    <Button variant="primary" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  )
}
```

- [ ] **Step 3: Run typecheck + tests**

```bash
pnpm -F opd-lite typecheck
pnpm -F opd-lite test -- --reporter=verbose
```

Expected: typecheck clean; no new test failures caused by the Button change. (The `components.test.tsx` file tests Button rendering — verify it still passes.)

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/src/components/ui/Button.tsx apps/opd-lite/src/components/pill-button.tsx
git commit -m "feat(opd-lite): align Button primary variant with design system tokens, use rounded-md"
```

---

### Task 10: Update ClinicalDashboard

**Context:** `ClinicalDashboard` currently uses `mx-auto max-w-3xl px-4 py-8`. Wider container (`max-w-7xl px-8 py-6`) matches admin-portal. The welcome heading is a personalized `text-3xl font-black` h1 — keep the content but update to `text-2xl font-semibold tracking-tight text-foreground` to match TopHeader pattern. The inline pill Link (`className="inline-flex ... rounded-pill bg-pill-green ..."`) should become a `<Button variant="primary">` rendered as an anchor via the native `<a>` tag approach (or just keep as Link with Button's className). The simplest fix: replace the inline className on the `Link` with a `<Button variant="primary">` wrapping the Link's text, and keep using Next's `<Link>` for navigation by making it an anchor-style button using `asChild` — but since our Button doesn't support `asChild`, just use a `<Link>` and apply the button classes manually using the `buttonClasses` helper export.

The simplest approach: add a named export `buttonClasses` from Button.tsx that returns class strings, then the dashboard `Link` can use it. Or even simpler: just use Button's className directly since we know its value.

Easiest, zero-abstraction approach: apply the same classes from the `primary` variant directly to the Link element:

```tsx
<Link
  href="/register-patient"
  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
>
  {t('registerNew')}
</Link>
```

**Files:**
- Modify: `apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx`

- [ ] **Step 1: Update ClinicalDashboard.tsx**

```typescript
// apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx
'use client'

import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { usePatientStore } from '@/stores/patient-store'
import { usePatientSearch } from '@/lib/use-patient-search'
import { SearchInput } from '@/components/search-input'
import { PatientResultList } from '@/components/patient-result-list'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { TodayEncountersCard } from './TodayEncountersCard'
import { PendingLabResultsCard } from './PendingLabResultsCard'
import { UnresolvedConflictsCard } from './UnresolvedConflictsCard'
import { DuplicateReviewsCard } from './DuplicateReviewsCard'
import { RecentEncountersList } from './RecentEncountersList'
import type { FhirPatient } from '@ultranos/shared-types'

function formatRole(role: string): string {
  if (!role) return 'Clinician'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

export function ClinicalDashboard() {
  const router = useRouter()
  const t = useTranslations('dashboard')
  const session = useAuthSessionStore((s) => s.session)
  const { query, results, isSearching, selectPatient } = usePatientStore()
  const { search } = usePatientSearch()
  const searchRef = useRef<HTMLDivElement>(null)

  const handleQueryChange = useCallback(
    (value: string) => {
      search(value)
    },
    [search],
  )

  const handleSelect = useCallback(
    (patient: FhirPatient) => {
      selectPatient(patient)
      router.push(`/encounter/${patient.id}`)
    },
    [selectPatient, router],
  )

  const handleStartEncounter = useCallback(() => {
    searchRef.current?.querySelector('input')?.focus()
  }, [])

  const displayName = session?.email?.split('@')[0] || 'Clinician'
  const displayRole = formatRole(session?.role ?? '')

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      {/* Welcome message */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t('welcome', { name: displayName })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{displayRole}</p>
      </div>

      {/* Primary CTAs */}
      <div className="mb-8 flex items-center gap-3">
        <Button variant="primary" onClick={handleStartEncounter}>
          {t('startEncounter')}
        </Button>
        <Link
          href="/register-patient"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {t('registerNew')}
        </Link>
      </div>

      {/* Inline patient search */}
      <section className="mb-8" ref={searchRef}>
        <SearchInput value={query} onChange={handleQueryChange} />
        {(results.length > 0 || isSearching || query.length > 0) && (
          <div className="mt-2">
            <PatientResultList
              results={results}
              isSearching={isSearching}
              onSelect={handleSelect}
              query={query}
            />
          </div>
        )}
      </section>

      {/* Summary cards grid */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TodayEncountersCard />
        <PendingLabResultsCard />
        <UnresolvedConflictsCard />
        <DuplicateReviewsCard />
      </section>

      {/* Recent encounters */}
      <section>
        <RecentEncountersList />
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
pnpm -F opd-lite test -- --reporter=verbose src/__tests__/clinical-dashboard.test.tsx
```

Expected: existing clinical dashboard tests pass. (The test mocks useRouter, usePatientSearch etc. — the interface hasn't changed, only layout classes.)

- [ ] **Step 3: Commit**

```bash
git add apps/opd-lite/src/components/dashboard/ClinicalDashboard.tsx
git commit -m "feat(opd-lite): update ClinicalDashboard to max-w-7xl container and standard button styles"
```

---

### Task 11: Update page files — appointments, notifications, conflicts

**Context:** Three pages with the same pattern: `max-w-3xl` container + back-link header + `text-3xl font-black text-neutral-900` h1. Replace with `max-w-7xl px-8 py-6` container + `TopHeader`. Remove all back-link elements (sidebar handles navigation). For appointments page: the view toggle buttons inside the header use `ring-[0.65px] ring-gray-400/40` wrapper — replace with `ring-border/50` (already in the token migration, but double-check). Retain all functional elements (view toggle, etc.) and just restructure the container.

**Files:**
- Modify: `apps/opd-lite/src/app/[locale]/appointments/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/notifications/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/conflicts/page.tsx`

- [ ] **Step 1: Update appointments/page.tsx**

```typescript
// apps/opd-lite/src/app/[locale]/appointments/page.tsx
'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { TopHeader } from '@/components/TopHeader'
import { useAppointmentStore } from '@/stores/appointment-store'
import { DayScheduleView } from '@/components/appointments/DayScheduleView'
import { WeekScheduleView } from '@/components/appointments/WeekScheduleView'

export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const { viewMode, setViewMode } = useAppointmentStore()

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <div className="flex items-center justify-between">
        <TopHeader title={t('title')} />

        {/* Day / Week toggle */}
        <div className="me-8 flex overflow-hidden rounded-xl ring-[0.65px] ring-border/50">
          <Button
            variant={viewMode === 'day' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('day')}
          >
            {t('dayView')}
          </Button>
          <Button
            variant={viewMode === 'week' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('week')}
          >
            {t('weekView')}
          </Button>
        </div>
      </div>

      <div className="px-6 pb-6">
        {viewMode === 'day' ? <DayScheduleView /> : <WeekScheduleView />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update notifications/page.tsx**

```typescript
// apps/opd-lite/src/app/[locale]/notifications/page.tsx
'use client'

import { TopHeader } from '@/components/TopHeader'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader
        title="Notification Center"
        description="Manage all your notifications — lab results, prescriptions, and system alerts."
      />
      <div className="px-6 pb-6">
        <NotificationCenter />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update conflicts/page.tsx**

```typescript
// apps/opd-lite/src/app/[locale]/conflicts/page.tsx
'use client'

import { TopHeader } from '@/components/TopHeader'
import { ConflictList } from '@/components/conflicts/ConflictList'

export default function ConflictsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader
        title="Conflict Resolution"
        description="Review and resolve Tier 1 safety-critical sync conflicts."
      />
      <div className="px-6 pb-6">
        <ConflictList />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm -F opd-lite test -- --reporter=verbose src/__tests__/appointments.test.tsx
```

Expected: existing appointment tests pass. (They test component logic, not page structure.)

- [ ] **Step 5: Commit**

```bash
git add \
  apps/opd-lite/src/app/[locale]/appointments/page.tsx \
  apps/opd-lite/src/app/[locale]/notifications/page.tsx \
  apps/opd-lite/src/app/[locale]/conflicts/page.tsx
git commit -m "feat(opd-lite): migrate appointments, notifications, conflicts pages to TopHeader layout"
```

---

### Task 12: Update page files — settings, duplicate-review, expiring-consents, register-patient, kyc

**Context:** Remaining pages. Same treatment: remove back-link headers, apply `max-w-7xl px-8 py-6` container, add `TopHeader`. KYC is the most complex (inline JSX, no separate component) — just wrap the existing JSX body in the new container and add TopHeader. Settings page had `max-w-2xl` + `ArrowLeft` back-link — replace with TopHeader (settings doesn't need to be narrow; the content cards handle their own max-width). For register-patient: the `<main id="main-content">` tag is now handled by locale layout — the page just renders its content in a div.

**Files:**
- Modify: `apps/opd-lite/src/app/[locale]/settings/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/duplicate-review/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/expiring-consents/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/register-patient/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/kyc/page.tsx`

- [ ] **Step 1: Update settings/page.tsx**

Remove the `ArrowLeft` back-link header block (lines 14–25 in the current file). Add `TopHeader`:

```typescript
// apps/opd-lite/src/app/[locale]/settings/page.tsx
'use client'

import { TopHeader } from '@/components/TopHeader'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { SessionInfoCard } from '@/components/settings/SessionInfoCard'
import { MfaManagementCard } from '@/components/settings/MfaManagementCard'
import { PreferencesCard } from '@/components/settings/PreferencesCard'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader title="Settings" />
      <div className="px-6 pb-6 max-w-2xl space-y-6">
        <ProfileCard />
        <SessionInfoCard />
        <MfaManagementCard />
        <PreferencesCard />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update duplicate-review/page.tsx**

```typescript
// apps/opd-lite/src/app/[locale]/duplicate-review/page.tsx
'use client'

import { useTranslations } from 'next-intl'
import { TopHeader } from '@/components/TopHeader'
import { DuplicateReviewTable } from '@/components/duplicate-review/DuplicateReviewTable'

export default function DuplicateReviewPage() {
  const t = useTranslations('duplicateReview')

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader title={t('title')} />
      <div className="px-6 pb-6">
        <DuplicateReviewTable />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update expiring-consents/page.tsx**

Keep all existing logic (state, effects, handlers). Replace only the container div and the inline h1 at the top. The existing JSX body starts with `<main id="main-content" className="max-w-5xl mx-auto px-4 py-6">` — change to:

```typescript
// apps/opd-lite/src/app/[locale]/expiring-consents/page.tsx
// ... (keep all imports and logic unchanged) ...

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader title="Expiring Consents" />
      <div className="px-6 pb-6">

        {loading && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}

        {!loading && consents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No consents expiring within 90 days.
          </p>
        )}

        {!loading && consents.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl ring-[0.65px] ring-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">Patient ID</th>
                    <th className="px-4 py-3 text-start font-semibold">Expiry Date</th>
                    <th className="px-4 py-3 text-start font-semibold">Days Until Expiry</th>
                    <th className="px-4 py-3 text-start font-semibold">Version</th>
                    <th className="px-4 py-3 text-start font-semibold">Grantor Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {consents.map((c) => {
                    const days = daysUntilExpiry(c.provision_end)
                    return (
                      <tr key={c.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-mono text-xs">
                          {extractPatientId(c.patient_ref)}
                        </td>
                        <td className="px-4 py-3">
                          {new Date(c.provision_end).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              days <= 30
                                ? 'font-semibold text-destructive'
                                : days <= 60
                                  ? 'font-semibold text-warning'
                                  : 'text-foreground'
                            }
                          >
                            {days}
                          </span>
                        </td>
                        <td className="px-4 py-3">{c.consent_version}</td>
                        <td className="px-4 py-3">{c.grantor_role}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
                Previous
              </Button>
              <Button variant="outline" disabled={consents.length < limit} onClick={() => setOffset(offset + limit)}>
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
```

Also add `import { TopHeader } from '@/components/TopHeader'` to the imports. (The `Button` import is already there.)

- [ ] **Step 4: Update register-patient/page.tsx**

```typescript
// apps/opd-lite/src/app/[locale]/register-patient/page.tsx
'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TopHeader } from '@/components/TopHeader'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('registration')
  const searchParams = useSearchParams()
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader title={t('title')} />
      <div className="px-6 pb-6 max-w-3xl">
        <PatientRegistrationForm prefilledNameGiven={prefilledName} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update kyc/page.tsx**

Keep all existing logic unchanged. Replace the outermost `<main className="mx-auto max-w-2xl px-4 py-8">` with:

```typescript
// apps/opd-lite/src/app/[locale]/kyc/page.tsx
// ... (keep all imports, state, handlers, and sub-components unchanged) ...
// Add to imports:
import { TopHeader } from '@/components/TopHeader'

// In the JSX, replace:
//   <main className="mx-auto max-w-2xl px-4 py-8">
//     <h1 className="mb-2 text-2xl font-bold text-neutral-900">KYC Document Verification</h1>
//     <p className="mb-6 text-neutral-600">Submit your professional documents for account verification.</p>
// With:
  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <TopHeader
        title="KYC Document Verification"
        description="Submit your professional documents for account verification."
      />
      <div className="px-6 pb-6 max-w-2xl">
        {/* Keep all existing JSX from the rejection banner onwards */}
        {isRejected && rejectionReason && step !== 'submitted' && (
          // ... rest of existing JSX unchanged ...
```

Also update the inline semantic classes in kyc/page.tsx while touching it:
- `bg-blue-600 text-white` (step indicator active) → `bg-primary text-primary-foreground`
- `bg-green-100 text-green-700` (step indicator done) → `bg-success/20 text-success`
- `bg-neutral-100 text-neutral-400` (step indicator inactive) → `bg-muted text-muted-foreground`
- `cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700` (file select label) → `cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90`
- `text-blue-600` (upload progress text) → `text-primary`
- `border-yellow-400 bg-yellow-50` (low confidence input) → `border-warning/50 bg-warning/10`
- `ms-2 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800` (low confidence badge) → `ms-2 rounded bg-warning/20 px-2 py-0.5 text-xs text-warning`
- `text-neutral-500`, `text-neutral-700`, `text-neutral-800`, `text-neutral-900`, `text-neutral-600` → `text-muted-foreground`, `text-foreground`, `text-foreground`, `text-foreground`, `text-muted-foreground`
- `border-neutral-300 bg-white` → `border-border bg-background`

- [ ] **Step 6: Run tests**

```bash
pnpm -F opd-lite test -- --reporter=verbose src/__tests__/settings-page.test.tsx
```

Expected: settings tests pass.

- [ ] **Step 7: Commit**

```bash
git add \
  apps/opd-lite/src/app/[locale]/settings/page.tsx \
  apps/opd-lite/src/app/[locale]/duplicate-review/page.tsx \
  apps/opd-lite/src/app/[locale]/expiring-consents/page.tsx \
  apps/opd-lite/src/app/[locale]/register-patient/page.tsx \
  apps/opd-lite/src/app/[locale]/kyc/page.tsx
git commit -m "feat(opd-lite): migrate remaining pages to TopHeader layout and semantic tokens"
```

---

### Task 13: Final typecheck + test run + snapshot refresh

**Context:** After all 12 tasks, run a full typecheck and test suite. Snapshot tests will need refresh because the sidebar markup, button classes, and page containers changed significantly. Update all stale snapshots in one batch.

**Files:**
- Modify: `apps/opd-lite/src/__tests__/__snapshots__/*.snap` (auto-updated by vitest -u)

- [ ] **Step 1: Run full typecheck**

```bash
pnpm -F opd-lite typecheck
```

Expected: zero errors.

- [ ] **Step 2: Run full test suite**

```bash
pnpm -F opd-lite test -- --reporter=verbose 2>&1 | tail -40
```

Note the count of passing/failing tests and any new failures (not pre-existing ones). The pre-existing baseline at the end of the token migration was 16 failing tests. New failures introduced by this plan must be zero.

- [ ] **Step 3: Update snapshots**

```bash
pnpm -F opd-lite test -- --update-snapshots
```

Expected: snapshots updated, all snapshot tests now pass.

- [ ] **Step 4: Commit snapshot updates**

```bash
git add apps/opd-lite/src/__tests__/__snapshots__/
git commit -m "test(opd-lite): refresh snapshots after component architecture migration"
```

---

## Self-Review

**Spec coverage check:**
- [x] ShadCN sidebar primitives used — Tasks 1, 6
- [x] nav-config.ts with OPD groups + badge keys — Task 2
- [x] nav-main.tsx renders SidebarGroup tree — Task 3
- [x] opd-header.tsx with OPD Lite branding — Task 4
- [x] nav-user.tsx with full PHI-safe sign-out — Task 5
- [x] AppSidebar refactored to use ShadCN Sidebar — Task 6
- [x] locale layout.tsx uses SidebarProvider + SidebarInset — Task 7
- [x] TopHeader.tsx component — Task 8
- [x] ClinicalDashboard wider container — Task 10
- [x] Button primary variant uses `bg-primary text-primary-foreground` — Task 9
- [x] All pages updated: appointments, notifications, conflicts, settings, duplicate-review, expiring-consents, register-patient, kyc — Tasks 11, 12
- [x] Final typecheck + test run + snapshot refresh — Task 13

**Type consistency check:**
- `NavBadgeKey` defined in nav-config.ts, used in nav-main.tsx `badges` prop type
- `NavGroup`/`NavItem` interfaces defined in nav-config.ts, consumed by nav-main.tsx
- `AppSidebar` receives `badges` from `useNavBadges()` which returns `NavBadges` interface — the keys exactly match `NavBadgeKey`

**Placeholder check:** No TBD, TODO, or "similar to" patterns found in plan tasks.
