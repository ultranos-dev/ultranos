# Admin Portal — sidebar-07 Layout + Location Switcher

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled admin-portal sidebar and header with the ShadCN sidebar-07 layout (collapsible icon sidebar, breadcrumb nav, inset content area), add a location switcher for filtering by lab/pharmacy/OPD, and wire location context into page data fetching.

**Architecture:** Two phases. Phase 1 builds the full sidebar-07 shell: SidebarProvider wraps AuthenticatedShell, AppSidebar contains a location-switcher (labs/pharmacies/OPD), grouped NavMain, and nav-user footer with DropdownMenu. A breadcrumb header bar replaces the TopHeader's action buttons. TopHeader is stripped to just `<h1>`/`<p>` (no user menu, no theme toggle). Phase 2 wires the selected location into tRPC queries so pages filter their data by facility.

**Tech Stack:** ShadCN sidebar + breadcrumb + sheet + tooltip + skeleton, Radix UI, Tailwind CSS v3.4, Next.js 15, TypeScript, Zustand (existing auth store pattern)

**Prerequisites:** Plan 1 (Button, Badge, Input) and Plan 2 (Dialog, DropdownMenu, color tokens) completed.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `apps/admin-portal/src/components/ui/sidebar.tsx` | ShadCN Sidebar primitives |
| Create | `apps/admin-portal/src/components/ui/sheet.tsx` | ShadCN Sheet (mobile sidebar) |
| Create | `apps/admin-portal/src/components/ui/tooltip.tsx` | ShadCN Tooltip |
| Create | `apps/admin-portal/src/components/ui/skeleton.tsx` | ShadCN Skeleton (loading states) |
| Create | `apps/admin-portal/src/components/ui/breadcrumb.tsx` | ShadCN Breadcrumb |
| Create | `apps/admin-portal/src/hooks/use-mobile.ts` | Mobile detection hook |
| Create | `apps/admin-portal/src/stores/location-store.ts` | Zustand store for selected location |
| Create | `apps/admin-portal/src/components/sidebar/location-switcher.tsx` | Location dropdown (labs/pharmacies/OPD) |
| Create | `apps/admin-portal/src/components/sidebar/nav-main.tsx` | Grouped navigation with collapsible sections |
| Create | `apps/admin-portal/src/components/sidebar/nav-user.tsx` | User menu in sidebar footer |
| Create | `apps/admin-portal/src/components/sidebar/app-sidebar.tsx` | Main sidebar orchestrator |
| Create | `apps/admin-portal/src/components/sidebar/nav-config.ts` | Navigation item definitions |
| Create | `apps/admin-portal/src/components/BreadcrumbHeader.tsx` | SidebarTrigger + Breadcrumb header bar |
| Create | `apps/admin-portal/src/lib/route-map.ts` | Route-to-breadcrumb mapping |
| Modify | `apps/admin-portal/src/components/TopHeader.tsx` | Strip to title + description only |
| Modify | `apps/admin-portal/src/components/AuthGuard.tsx` | Rewire AuthenticatedShell with SidebarProvider |
| Delete | `apps/admin-portal/src/hooks/useSidebarCollapse.ts` | Replaced by SidebarProvider |
| Delete | `apps/admin-portal/src/components/Sidebar.tsx` | Replaced by app-sidebar |

### Phase 2 files

| Action | File | Purpose |
|--------|------|---------|
| Create | `apps/admin-portal/src/hooks/useLocationFilter.ts` | Hook to get selected location for queries |
| Modify | `apps/admin-portal/src/app/dashboard/page.tsx` | Wire location filter into dashboard stats |
| Modify | `apps/admin-portal/src/app/labs/page.tsx` | Wire location filter into lab list |
| Modify | `apps/admin-portal/src/app/inventory/page.tsx` | Wire location filter into inventory |
| Modify | `apps/admin-portal/src/app/alerts/page.tsx` | Wire location filter into alerts |
| Modify | `apps/admin-portal/src/app/audit/page.tsx` | Wire location filter into audit log |

---

## Phase 1: Layout Migration

---

## Task 1: Install ShadCN sidebar dependencies

**Files:**
- Create: `apps/admin-portal/src/components/ui/sidebar.tsx`
- Create: `apps/admin-portal/src/components/ui/sheet.tsx`
- Create: `apps/admin-portal/src/components/ui/tooltip.tsx`
- Create: `apps/admin-portal/src/components/ui/skeleton.tsx`
- Create: `apps/admin-portal/src/components/ui/breadcrumb.tsx`
- Create: `apps/admin-portal/src/hooks/use-mobile.ts`

- [ ] **Step 1: Install sidebar and breadcrumb**

  ```bash
  cd apps/admin-portal
  pnpm dlx shadcn@latest add sidebar breadcrumb
  ```

  The CLI will warn about overwriting `button.tsx` and `input.tsx`. **Allow the overwrite** — we'll restore our customized versions immediately after.

- [ ] **Step 2: Restore customized button.tsx and input.tsx**

  The sidebar install overwrites our customized Button (rounded-full, success variant) and Input (rounded-xl). Restore from git:

  ```bash
  cd ../..
  git checkout -- apps/admin-portal/src/components/ui/button.tsx apps/admin-portal/src/components/ui/input.tsx
  ```

  Verify restored files:
  ```bash
  grep "rounded-full" apps/admin-portal/src/components/ui/button.tsx && echo "Button OK"
  grep "rounded-xl" apps/admin-portal/src/components/ui/input.tsx && echo "Input OK"
  ```

- [ ] **Step 3: Fix lucide-react imports in new files**

  Check all newly created files for `lucide-react` imports and replace with `@ultranos/ui-kit/icons`:

  ```bash
  grep -rn "from.*lucide-react" apps/admin-portal/src/components/ui/sidebar.tsx apps/admin-portal/src/components/ui/sheet.tsx apps/admin-portal/src/components/ui/breadcrumb.tsx apps/admin-portal/src/components/ui/tooltip.tsx apps/admin-portal/src/components/ui/skeleton.tsx
  ```

  For each match:
  ```tsx
  // Before:
  import { PanelLeft } from "lucide-react"
  // After:
  import { PanelLeft } from "@ultranos/ui-kit/icons"

  // Before:
  import { X } from "lucide-react"
  // After:
  import { X } from "@ultranos/ui-kit/icons"

  // Before:
  import { ChevronRight } from "lucide-react"
  // After:
  import { ChevronRight } from "@ultranos/ui-kit/icons"
  ```

  Also check for `@radix-ui/react-*` individual package imports and change to unified `radix-ui`:
  ```bash
  grep -rn "from.*@radix-ui" apps/admin-portal/src/components/ui/sidebar.tsx apps/admin-portal/src/components/ui/sheet.tsx apps/admin-portal/src/components/ui/tooltip.tsx
  ```

  ```tsx
  // Before:
  import * as SheetPrimitive from "@radix-ui/react-dialog"
  // After:
  import { Dialog as SheetPrimitive } from "radix-ui"

  // Before:
  import * as TooltipPrimitive from "@radix-ui/react-tooltip"
  // After:
  import { Tooltip as TooltipPrimitive } from "radix-ui"
  ```

- [ ] **Step 4: Verify all files exist**

  ```bash
  ls apps/admin-portal/src/components/ui/sidebar.tsx apps/admin-portal/src/components/ui/sheet.tsx apps/admin-portal/src/components/ui/tooltip.tsx apps/admin-portal/src/components/ui/skeleton.tsx apps/admin-portal/src/components/ui/breadcrumb.tsx apps/admin-portal/src/hooks/use-mobile.ts
  ```

- [ ] **Step 5: TypeScript check**

  ```bash
  pnpm -F @ultranos/admin-portal typecheck 2>&1 | grep "ui/sidebar\|ui/sheet\|ui/tooltip\|ui/skeleton\|ui/breadcrumb\|use-mobile" || echo "No new errors"
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add apps/admin-portal/src/components/ui/ apps/admin-portal/src/hooks/use-mobile.ts apps/admin-portal/package.json pnpm-lock.yaml
  git commit -m "feat(admin-portal): install ShadCN sidebar, sheet, tooltip, skeleton, breadcrumb"
  ```

---

## Task 2: Create navigation config and route map

**Files:**
- Create: `apps/admin-portal/src/components/sidebar/nav-config.ts`
- Create: `apps/admin-portal/src/lib/route-map.ts`

- [ ] **Step 1: Create `nav-config.ts`**

  This file defines the grouped navigation structure. It replaces the flat `navItems` array from the old Sidebar.

  ```tsx
  import type { LucideIcon } from 'lucide-react'
  import {
    Home,
    User,
    FlaskConical,
    Package,
    Bell,
    FileText,
    Clock,
    Settings,
    Users,
    Receipt,
    Globe,
    SlidersHorizontal,
    FileCheck,
    Cpu,
    CreditCard,
    Wallet,
  } from '@ultranos/ui-kit/icons'

  export interface NavItem {
    title: string
    url: string
    icon?: LucideIcon
  }

  export interface NavGroup {
    title: string
    icon: LucideIcon
    items: NavItem[]
  }

  export const navGroups: NavGroup[] = [
    {
      title: 'Overview',
      icon: Home,
      items: [
        { title: 'Dashboard', url: '/dashboard', icon: Home },
      ],
    },
    {
      title: 'Clinical',
      icon: User,
      items: [
        { title: 'Providers', url: '/providers', icon: User },
        { title: 'License Expiry', url: '/providers/expiry', icon: Clock },
        { title: 'Patients', url: '/patients', icon: User },
        { title: 'Merge Tool', url: '/patients/merge' },
        { title: 'Alerts', url: '/alerts', icon: Bell },
        { title: 'Alert Config', url: '/alerts/configuration', icon: SlidersHorizontal },
      ],
    },
    {
      title: 'Operations',
      icon: FlaskConical,
      items: [
        { title: 'Labs', url: '/labs', icon: FlaskConical },
        { title: 'Create Lab', url: '/labs/create' },
        { title: 'Inventory', url: '/inventory', icon: Package },
        { title: 'Suppliers', url: '/inventory/suppliers' },
        { title: 'Network', url: '/network', icon: Globe },
        { title: 'Mentorship', url: '/mentorship', icon: Users },
        { title: 'Certifications', url: '/certifications', icon: FileCheck },
      ],
    },
    {
      title: 'Administration',
      icon: Users,
      items: [
        { title: 'Users', url: '/users', icon: Users },
        { title: 'Create User', url: '/users/create' },
        { title: 'AI Models', url: '/ai-models', icon: Cpu },
        { title: 'Audit Log', url: '/audit', icon: FileText },
      ],
    },
    {
      title: 'Billing',
      icon: CreditCard,
      items: [
        { title: 'Subscriptions', url: '/subscriptions', icon: CreditCard },
        { title: 'Billing', url: '/subscriptions/billing', icon: Wallet },
        { title: 'Invoices', url: '/subscriptions/invoices', icon: Receipt },
      ],
    },
    {
      title: 'System',
      icon: Settings,
      items: [
        { title: 'Settings', url: '/settings', icon: Settings },
      ],
    },
  ]
  ```

- [ ] **Step 2: Create `route-map.ts`**

  This file maps URL paths to breadcrumb labels for the header.

  ```tsx
  interface BreadcrumbSegment {
    label: string
    href: string
  }

  const ROUTE_LABELS: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/providers': 'Providers',
    '/providers/expiry': 'License Expiry',
    '/patients': 'Patients',
    '/patients/merge': 'Merge Tool',
    '/alerts': 'Alerts',
    '/alerts/configuration': 'Alert Config',
    '/labs': 'Labs',
    '/labs/create': 'Create Lab',
    '/inventory': 'Inventory',
    '/inventory/suppliers': 'Suppliers',
    '/network': 'Network',
    '/mentorship': 'Mentorship',
    '/certifications': 'Certifications',
    '/users': 'Users',
    '/users/create': 'Create User',
    '/ai-models': 'AI Models',
    '/audit': 'Audit Log',
    '/subscriptions': 'Subscriptions',
    '/subscriptions/billing': 'Billing',
    '/subscriptions/invoices': 'Invoices',
    '/settings': 'Settings',
  }

  /**
   * Build breadcrumb trail from pathname.
   * E.g. "/providers/expiry" → [{ label: "Providers", href: "/providers" }, { label: "License Expiry", href: "/providers/expiry" }]
   * Dynamic segments like "[labId]" are handled by checking prefix matches.
   */
  export function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
    // Direct match first
    if (ROUTE_LABELS[pathname]) {
      const segments = pathname.split('/').filter(Boolean)
      const crumbs: BreadcrumbSegment[] = []

      // Build parent chain
      let path = ''
      for (const segment of segments) {
        path += `/${segment}`
        const label = ROUTE_LABELS[path]
        if (label) {
          crumbs.push({ label, href: path })
        }
      }

      return crumbs.length > 0 ? crumbs : [{ label: ROUTE_LABELS[pathname], href: pathname }]
    }

    // Dynamic route — find the longest prefix match
    // e.g. "/labs/abc123" → match "/labs" then show "Lab Detail"
    // e.g. "/users/abc/page" → match "/users"
    const segments = pathname.split('/').filter(Boolean)
    const crumbs: BreadcrumbSegment[] = []
    let path = ''

    for (let i = 0; i < segments.length; i++) {
      path += `/${segments[i]}`
      const label = ROUTE_LABELS[path]
      if (label) {
        crumbs.push({ label, href: path })
      } else if (i === segments.length - 1) {
        // Last segment is a known sub-page name
        const subPageLabels: Record<string, string> = {
          staff: 'Staff',
          certifications: 'Certifications',
          health: 'Health',
          profile: 'Profile',
          create: 'Create',
          merge: 'Merge',
          billing: 'Billing',
          invoices: 'Invoices',
        }
        if (subPageLabels[segments[i]]) {
          crumbs.push({ label: subPageLabels[segments[i]], href: pathname })
        } else {
          // Dynamic ID segment — show "Detail"
          crumbs.push({ label: 'Detail', href: pathname })
        }
      } else if (!ROUTE_LABELS[path]) {
        // Middle segment is a dynamic ID — skip it (parent already added)
      }
    }

    return crumbs
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add apps/admin-portal/src/components/sidebar/nav-config.ts apps/admin-portal/src/lib/route-map.ts
  git commit -m "feat(admin-portal): add navigation config and breadcrumb route map"
  ```

---

## Task 3: Create location store and location-switcher

**Files:**
- Create: `apps/admin-portal/src/stores/location-store.ts`
- Create: `apps/admin-portal/src/components/sidebar/location-switcher.tsx`

- [ ] **Step 1: Create `location-store.ts`**

  Zustand store following the same pattern as `auth-session-store.ts`:

  ```tsx
  import { create } from 'zustand'

  export type LocationType = 'lab' | 'pharmacy' | 'opd'

  export interface Location {
    id: string
    name: string
    type: LocationType
  }

  /** Sentinel value meaning "show data for all locations" */
  export const ALL_LOCATIONS: Location = {
    id: '__all__',
    name: 'All Locations',
    type: 'lab',
  }

  interface LocationState {
    selected: Location
    locations: Location[]
    loading: boolean
    setSelected: (loc: Location) => void
    setLocations: (locs: Location[]) => void
    setLoading: (loading: boolean) => void
  }

  export const useLocationStore = create<LocationState>((set) => ({
    selected: ALL_LOCATIONS,
    locations: [],
    loading: true,
    setSelected: (loc) => set({ selected: loc }),
    setLocations: (locs) => set({ locations: locs }),
    setLoading: (loading) => set({ loading }),
  }))
  ```

- [ ] **Step 2: Create `location-switcher.tsx`**

  This component fetches locations from tRPC and renders a dropdown in the sidebar header.

  ```tsx
  'use client'

  import { useEffect } from 'react'
  import { ChevronsUpDown, Building2 } from '@ultranos/ui-kit/icons'
  import { FlaskConical, Pill, Stethoscope } from '@ultranos/ui-kit/icons'
  import { trpc } from '@/lib/trpc'
  import {
    useLocationStore,
    ALL_LOCATIONS,
    type Location,
    type LocationType,
  } from '@/stores/location-store'
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

  const TYPE_ICONS: Record<LocationType | 'all', typeof Building2> = {
    all: Building2,
    lab: FlaskConical,
    pharmacy: Pill,
    opd: Stethoscope,
  }

  const TYPE_LABELS: Record<LocationType, string> = {
    lab: 'Lab',
    pharmacy: 'Pharmacy',
    opd: 'OPD Clinic',
  }

  export function LocationSwitcher() {
    const { isMobile } = useSidebar()
    const { selected, locations, loading, setSelected, setLocations, setLoading } =
      useLocationStore()

    useEffect(() => {
      let cancelled = false

      async function fetchLocations() {
        try {
          const [labsResult] = await Promise.all([
            trpc.admin.listLabs.query({ page: 1, pageSize: 200 }),
          ])

          if (cancelled) return

          const locs: Location[] = labsResult.labs.map((lab: { id: string; name: string }) => ({
            id: lab.id,
            name: lab.name,
            type: 'lab' as LocationType,
          }))

          setLocations(locs)
        } catch {
          // Silently handle — locations list is non-critical
        } finally {
          if (!cancelled) setLoading(false)
        }
      }

      fetchLocations()
      return () => { cancelled = true }
    }, [setLocations, setLoading])

    const ActiveIcon = selected.id === ALL_LOCATIONS.id
      ? TYPE_ICONS.all
      : TYPE_ICONS[selected.type]

    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ActiveIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {selected.id === ALL_LOCATIONS.id ? 'Ultranos Admin' : selected.name}
                  </span>
                  <span className="truncate text-xs">
                    {selected.id === ALL_LOCATIONS.id
                      ? 'All locations'
                      : TYPE_LABELS[selected.type]}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
              align="start"
              side={isMobile ? 'bottom' : 'right'}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Locations
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setSelected(ALL_LOCATIONS)}>
                <Building2 className="mr-2 size-4" />
                All Locations
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {loading ? (
                <DropdownMenuItem disabled>Loading locations...</DropdownMenuItem>
              ) : locations.length === 0 ? (
                <DropdownMenuItem disabled>No locations registered</DropdownMenuItem>
              ) : (
                locations.map((loc) => {
                  const Icon = TYPE_ICONS[loc.type]
                  return (
                    <DropdownMenuItem key={loc.id} onClick={() => setSelected(loc)}>
                      <Icon className="mr-2 size-4" />
                      <span className="truncate">{loc.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {TYPE_LABELS[loc.type]}
                      </span>
                    </DropdownMenuItem>
                  )
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add apps/admin-portal/src/stores/location-store.ts apps/admin-portal/src/components/sidebar/location-switcher.tsx
  git commit -m "feat(admin-portal): add location store and location-switcher component"
  ```

---

## Task 4: Create nav-main (grouped navigation)

**Files:**
- Create: `apps/admin-portal/src/components/sidebar/nav-main.tsx`

- [ ] **Step 1: Create `nav-main.tsx`**

  ```tsx
  'use client'

  import { usePathname } from 'next/navigation'
  import Link from 'next/link'
  import { ChevronRight } from '@ultranos/ui-kit/icons'
  import { DirectionalIcon } from '@ultranos/ui-kit'
  import { type NavGroup } from './nav-config'
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from 'radix-ui'
  import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
  } from '@/components/ui/sidebar'

  interface NavMainProps {
    groups: NavGroup[]
  }

  export function NavMain({ groups }: NavMainProps) {
    const pathname = usePathname()

    return (
      <>
        {groups.map((group) => {
          // A group is "active" if any of its items match the current path
          const isGroupActive = group.items.some(
            (item) => pathname === item.url || pathname?.startsWith(`${item.url}/`)
          )

          // Single-item groups (Overview, System) render without collapsible
          if (group.items.length === 1) {
            const item = group.items[0]
            const Icon = item.icon ?? group.icon
            const isActive = pathname === item.url || pathname?.startsWith(`${item.url}/`)

            return (
              <SidebarGroup key={group.title}>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link href={item.url}>
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )
          }

          return (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items
                  .filter((item) => item.icon) // Only top-level items with icons show in menu
                  .map((item) => {
                    const isActive = pathname === item.url || pathname?.startsWith(`${item.url}/`)
                    // Find sub-items (items without icons that belong to this parent)
                    const subItems = group.items.filter(
                      (sub) => !sub.icon && sub.url.startsWith(item.url + '/')
                    )

                    if (subItems.length === 0) {
                      return (
                        <SidebarMenuItem key={item.url}>
                          <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                            <Link href={item.url}>
                              {item.icon && <item.icon />}
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      )
                    }

                    // Has sub-items — render as collapsible
                    return (
                      <Collapsible.Root
                        key={item.url}
                        asChild
                        defaultOpen={isActive || subItems.some((s) => pathname === s.url)}
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={item.title} isActive={isActive}>
                              {item.icon && <item.icon />}
                              <span>{item.title}</span>
                              <DirectionalIcon category="navigation">
                                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                              </DirectionalIcon>
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          {/* Direct link on the item title for navigation */}
                          <SidebarMenuButton asChild isActive={isActive} className="hidden">
                            <Link href={item.url}>{item.title}</Link>
                          </SidebarMenuButton>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {/* Parent as first sub-item for direct navigation */}
                              <SidebarMenuSubItem>
                                <SidebarMenuSubButton asChild isActive={pathname === item.url}>
                                  <Link href={item.url}>Overview</Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              {subItems.map((sub) => (
                                <SidebarMenuSubItem key={sub.url}>
                                  <SidebarMenuSubButton asChild isActive={pathname === sub.url}>
                                    <Link href={sub.url}>{sub.title}</Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible.Root>
                    )
                  })}
              </SidebarMenu>
            </SidebarGroup>
          )
        })}
      </>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/admin-portal/src/components/sidebar/nav-main.tsx
  git commit -m "feat(admin-portal): add NavMain grouped navigation component"
  ```

---

## Task 5: Create nav-user (sidebar footer with DropdownMenu)

**Files:**
- Create: `apps/admin-portal/src/components/sidebar/nav-user.tsx`

- [ ] **Step 1: Create `nav-user.tsx`**

  This replaces the TopHeader user menu and the old sidebar footer.

  ```tsx
  'use client'

  import Link from 'next/link'
  import { useAuthSessionStore } from '@/stores/auth-session-store'
  import { getSupabaseBrowserClient } from '@/lib/supabase'
  import { setAccessToken } from '@/lib/trpc'
  import { useTheme } from '@/components/ThemeProvider'
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
  import { SessionTimer } from '@/components/SessionTimer'

  export function NavUser() {
    const { isMobile } = useSidebar()
    const { theme, toggleTheme } = useTheme()
    const email = useAuthSessionStore((s) => s.session?.email ?? '')

    const initials = email
      ? email.split('@')[0].slice(0, 2).toUpperCase()
      : 'AD'

    async function handleSignOut() {
      useAuthSessionStore.getState().clearSession()
      setAccessToken(null)
      await getSupabaseBrowserClient().auth.signOut()
      window.location.href = '/login'
    }

    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{email}</span>
                  <SessionTimer />
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
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {initials}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{email}</span>
                    <span className="truncate text-xs text-muted-foreground">Administrator</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTheme}>
                {theme === 'light' ? <Moon className="mr-2 size-4" /> : <Sun className="mr-2 size-4" />}
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

- [ ] **Step 2: Commit**

  ```bash
  git add apps/admin-portal/src/components/sidebar/nav-user.tsx
  git commit -m "feat(admin-portal): add NavUser sidebar footer with DropdownMenu"
  ```

---

## Task 6: Create AppSidebar and BreadcrumbHeader

**Files:**
- Create: `apps/admin-portal/src/components/sidebar/app-sidebar.tsx`
- Create: `apps/admin-portal/src/components/BreadcrumbHeader.tsx`

- [ ] **Step 1: Create `app-sidebar.tsx`**

  ```tsx
  'use client'

  import * as React from 'react'
  import { navGroups } from './nav-config'
  import { LocationSwitcher } from './location-switcher'
  import { NavMain } from './nav-main'
  import { NavUser } from './nav-user'
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
  } from '@/components/ui/sidebar'

  export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
    return (
      <Sidebar collapsible="icon" variant="inset" {...props}>
        <SidebarHeader>
          <LocationSwitcher />
        </SidebarHeader>
        <SidebarContent>
          <NavMain groups={navGroups} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    )
  }
  ```

- [ ] **Step 2: Create `BreadcrumbHeader.tsx`**

  This is the header bar that replaces TopHeader's action buttons. It sits inside `SidebarInset` above the page content.

  ```tsx
  'use client'

  import { usePathname } from 'next/navigation'
  import { Separator } from '@/components/ui/separator'
  import { SidebarTrigger } from '@/components/ui/sidebar'
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from '@/components/ui/breadcrumb'
  import { buildBreadcrumbs } from '@/lib/route-map'
  import React from 'react'

  export function BreadcrumbHeader() {
    const pathname = usePathname()
    const crumbs = buildBreadcrumbs(pathname ?? '/dashboard')

    return (
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => (
              <React.Fragment key={crumb.href}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {i === crumbs.length - 1 ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </header>
    )
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add apps/admin-portal/src/components/sidebar/app-sidebar.tsx apps/admin-portal/src/components/BreadcrumbHeader.tsx
  git commit -m "feat(admin-portal): add AppSidebar orchestrator and BreadcrumbHeader"
  ```

---

## Task 7: Simplify TopHeader and rewire AuthenticatedShell

**Files:**
- Modify: `apps/admin-portal/src/components/TopHeader.tsx`
- Modify: `apps/admin-portal/src/components/AuthGuard.tsx`
- Delete: `apps/admin-portal/src/hooks/useSidebarCollapse.ts`
- Delete: `apps/admin-portal/src/components/Sidebar.tsx`

- [ ] **Step 1: Simplify TopHeader**

  Strip TopHeader to just title and description. Remove: user avatar/menu, search, notifications, theme toggle, date display. These now live in nav-user (theme, sign out, settings) and the breadcrumb header (trigger).

  Read `apps/admin-portal/src/components/TopHeader.tsx`, then replace with:

  ```tsx
  interface TopHeaderProps {
    title: string
    description?: string
  }

  export function TopHeader({ title, description }: TopHeaderProps) {
    return (
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
    )
  }
  ```

  Note: This is no longer `'use client'` — it's a simple server component now. Remove the `'use client'` directive and all imports (useState, useTheme, useAuthSessionStore, etc.).

- [ ] **Step 2: Rewire AuthenticatedShell in AuthGuard.tsx**

  Read `apps/admin-portal/src/components/AuthGuard.tsx`. Replace the `AuthenticatedShell` function at the bottom of the file:

  ```tsx
  // Add imports at top (alongside existing imports):
  import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
  import { AppSidebar } from '@/components/sidebar/app-sidebar'
  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'

  // Remove these imports (no longer needed):
  // import { Sidebar } from '@/components/Sidebar'
  // import { useSidebarCollapse } from '@/hooks/useSidebarCollapse'

  // Replace AuthenticatedShell:
  function AuthenticatedShell({ children }: { children: ReactNode }) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <BreadcrumbHeader />
          <main className="flex-1">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }
  ```

- [ ] **Step 3: Delete old files**

  ```bash
  rm apps/admin-portal/src/hooks/useSidebarCollapse.ts
  rm apps/admin-portal/src/components/Sidebar.tsx
  ```

- [ ] **Step 4: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -10
  ```

  Some tests may fail because they mock `useSidebarCollapse` or import `Sidebar`. Fix by updating test mocks:

  - Tests that mock `@/components/Sidebar` → mock `@/components/sidebar/app-sidebar` instead (or mock the SidebarProvider)
  - Tests that mock `@/hooks/useSidebarCollapse` → remove those mocks entirely
  - The simplest fix: mock `@/components/ui/sidebar` to return a no-op `SidebarProvider` and `SidebarInset`:

  ```tsx
  // In test files that need it:
  vi.mock('@/components/ui/sidebar', () => ({
    SidebarProvider: ({ children }: any) => <div>{children}</div>,
    SidebarInset: ({ children }: any) => <div>{children}</div>,
    SidebarTrigger: () => null,
    useSidebar: () => ({ isMobile: false, state: 'expanded' }),
  }))
  ```

- [ ] **Step 5: TypeScript check**

  ```bash
  pnpm -F @ultranos/admin-portal typecheck 2>&1 | head -30
  ```

  Fix any import errors from deleted files.

- [ ] **Step 6: Commit**

  ```bash
  git add -A apps/admin-portal/src
  git commit -m "feat(admin-portal): rewire layout with SidebarProvider, AppSidebar, BreadcrumbHeader"
  ```

---

## Task 8: Phase 1 verification

**Files:** No new modifications — verification pass.

- [ ] **Step 1: Verify old sidebar and useSidebarCollapse are gone**

  ```bash
  grep -rn "useSidebarCollapse\|from.*Sidebar.*import\|components/Sidebar" apps/admin-portal/src --include="*.tsx" --include="*.ts" | grep -v "__tests__" | grep -v "sidebar/"
  ```

  Expected: 0 results (all references to old Sidebar removed).

- [ ] **Step 2: Verify no lucide-react imports**

  ```bash
  grep -rn "from.*lucide-react" apps/admin-portal/src --include="*.tsx" --include="*.ts"
  ```

  Expected: 0 results.

- [ ] **Step 3: Run full test suite**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -10
  ```

- [ ] **Step 4: Build**

  ```bash
  pnpm -F @ultranos/admin-portal build 2>&1 | tail -10
  ```

  Expected: successful build with no errors.

- [ ] **Step 5: Commit cleanup if needed**

  ```bash
  git add apps/admin-portal/src
  git commit -m "fix(admin-portal): cleanup Phase 1 sidebar migration"
  ```

---

## Phase 2: Location Filtering

---

## Task 9: Create useLocationFilter hook

**Files:**
- Create: `apps/admin-portal/src/hooks/useLocationFilter.ts`

- [ ] **Step 1: Create the hook**

  This hook provides the selected location's ID to page queries. When "All Locations" is selected, it returns `undefined` so queries fetch unfiltered data.

  ```tsx
  import { useLocationStore, ALL_LOCATIONS } from '@/stores/location-store'

  /**
   * Returns the selected location ID for filtering tRPC queries.
   * Returns undefined when "All Locations" is selected (no filter).
   */
  export function useLocationFilter(): { locationId: string | undefined; locationName: string } {
    const selected = useLocationStore((s) => s.selected)

    return {
      locationId: selected.id === ALL_LOCATIONS.id ? undefined : selected.id,
      locationName: selected.name,
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/admin-portal/src/hooks/useLocationFilter.ts
  git commit -m "feat(admin-portal): add useLocationFilter hook for location-scoped queries"
  ```

---

## Task 10: Wire location filter into key pages

**Files:**
- Modify: `apps/admin-portal/src/app/dashboard/page.tsx`
- Modify: `apps/admin-portal/src/app/labs/page.tsx`
- Modify: `apps/admin-portal/src/app/inventory/page.tsx`
- Modify: `apps/admin-portal/src/app/alerts/page.tsx`
- Modify: `apps/admin-portal/src/app/audit/page.tsx`

Read each file before editing.

- [ ] **Step 1: Wire dashboard**

  Add at top:
  ```tsx
  import { useLocationFilter } from '@/hooks/useLocationFilter'
  ```

  Inside the component, get the filter:
  ```tsx
  const { locationId } = useLocationFilter()
  ```

  Pass `locationId` (as `labId`) to the dashboard stats tRPC query if the endpoint supports it. If the endpoint does not yet support `labId`, add a comment marking where it will be wired:

  ```tsx
  // TODO: Pass locationId to tRPC query once backend supports location filtering
  // const result = await trpc.admin.getDashboardStats.query({ labId: locationId })
  ```

- [ ] **Step 2: Wire labs page**

  Add `useLocationFilter` import. The `listLabs` query already supports filtering — if `locationId` is set, pre-select that lab in the list or filter the results.

  ```tsx
  const { locationId } = useLocationFilter()

  // When a specific location is selected, auto-filter the list
  // (the listLabs endpoint may not support labId filter — add TODO if not)
  ```

- [ ] **Step 3: Wire inventory page**

  Same pattern. Import hook, get `locationId`, pass to query or add TODO comment.

- [ ] **Step 4: Wire alerts page**

  Same pattern.

- [ ] **Step 5: Wire audit page**

  Same pattern.

- [ ] **Step 6: Run tests**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -5
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add apps/admin-portal/src/app/dashboard/page.tsx apps/admin-portal/src/app/labs/page.tsx apps/admin-portal/src/app/inventory/page.tsx apps/admin-portal/src/app/alerts/page.tsx apps/admin-portal/src/app/audit/page.tsx apps/admin-portal/src/hooks/useLocationFilter.ts
  git commit -m "feat(admin-portal): wire location filter into dashboard, labs, inventory, alerts, audit pages"
  ```

---

## Task 11: Phase 2 verification + location indicator

**Files:**
- Modify: `apps/admin-portal/src/components/BreadcrumbHeader.tsx` (add location badge)

- [ ] **Step 1: Add location indicator to breadcrumb header**

  When a specific location is selected (not "All Locations"), show a small badge in the header:

  Read `apps/admin-portal/src/components/BreadcrumbHeader.tsx` and add:

  ```tsx
  import { Badge } from '@/components/ui/badge'
  import { useLocationStore, ALL_LOCATIONS } from '@/stores/location-store'

  // Inside the component, before the return:
  const selected = useLocationStore((s) => s.selected)
  const isFiltered = selected.id !== ALL_LOCATIONS.id

  // Add after the Breadcrumb, before the closing </header>:
  {isFiltered && (
    <Badge variant="outline" className="ml-auto text-xs">
      {selected.name}
    </Badge>
  )}
  ```

- [ ] **Step 2: Run full test suite**

  ```bash
  pnpm -F @ultranos/admin-portal test 2>&1 | tail -10
  ```

- [ ] **Step 3: Build verification**

  ```bash
  pnpm -F @ultranos/admin-portal build 2>&1 | tail -10
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/admin-portal/src/components/BreadcrumbHeader.tsx
  git commit -m "feat(admin-portal): show location badge in breadcrumb header when filtered"
  ```

---

## Appendix: Component architecture

```
layout.tsx
└── ThemeProvider
    └── AuthGuard
        └── AuthenticatedShell
            └── SidebarProvider
                ├── AppSidebar (variant="inset", collapsible="icon")
                │   ├── SidebarHeader → LocationSwitcher
                │   ├── SidebarContent → NavMain (6 groups)
                │   ├── SidebarFooter → NavUser (DropdownMenu)
                │   └── SidebarRail (resize handle)
                └── SidebarInset
                    ├── BreadcrumbHeader (SidebarTrigger + Breadcrumb + location badge)
                    ├── TopHeader (title + description only)
                    └── Page content
```

## Appendix: Navigation group reference

| Group | Items | Collapsible? |
|-------|-------|-------------|
| Overview | Dashboard | No (single item) |
| Clinical | Providers (+License Expiry), Patients (+Merge Tool), Alerts (+Alert Config) | Yes |
| Operations | Labs (+Create Lab), Inventory (+Suppliers), Network, Mentorship, Certifications | Yes |
| Administration | Users (+Create User), AI Models, Audit Log | Yes |
| Billing | Subscriptions (+Billing, +Invoices) | Yes |
| System | Settings | No (single item) |

## Appendix: What gets deleted

| File | Replacement |
|------|-------------|
| `components/Sidebar.tsx` | `components/sidebar/app-sidebar.tsx` + sub-components |
| `hooks/useSidebarCollapse.ts` | SidebarProvider (built-in state management) |
| TopHeader user menu | `components/sidebar/nav-user.tsx` |
| TopHeader theme toggle | nav-user DropdownMenu |
| TopHeader search/notifications | Removed (placeholders that were never wired) |