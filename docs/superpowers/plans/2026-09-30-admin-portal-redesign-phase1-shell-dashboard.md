# Admin Portal Redesign — Phase 1: Shared Foundation + App Shell + Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first increment of the admin-portal redesign — an enriched app-shell topbar (global ⌘K command search + connection status) and the Triage/Focus dashboard (greeting hero, severity-colored Needs-Attention band, compact KPIs, quick actions) — reusing existing ui-kit components and admin data.

**Architecture:** App-level composition in `apps/admin-portal` only (no ui-kit source changes in this phase, so no ui-kit rebuild). A new admin command palette adapts OPD Lite's `cmdk` pattern and mounts globally in the authenticated shell. The dashboard page is recomposed from small, focused presentational components fed by the existing `trpc.admin.dashboardStats`/`recentActivity` queries — no backend changes.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind (shared `@ultranos/ui-kit/tailwind.preset` — oklch tokens), `@ultranos/ui-kit` components, `next-intl` (en/ar/prs/ps), `cmdk`, Vitest + @testing-library/react + jest-axe.

**Spec:** `docs/admin-portal-ui-redesign-v1.md` (approved mockups: dashboard = "Triage/Focus" `admin-mockups-shots/dashboard-b.png`; shell = "light + enriched topbar" `admin-mockups-shots/shell-a-final.png`).

## Global Constraints

- **Full-width pages:** page root is exactly `<div className="flex flex-col gap-4">`. Never add `mx-auto`, `max-w-*`, nested `<main>`, or `p-6`/`px-6` wrappers (the shell `<main>` already provides `p-4`).
- **Semantic oklch tokens only:** use `bg-card`, `text-muted-foreground`, `bg-primary`, `text-primary`, `text-destructive`, `bg-warning/10 text-warning`, `bg-success/10 text-success`, `shadow-card`. Never hardcode hex or raw `oklch(...)` in component classes.
- **Card idiom:** content surfaces = `rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50` (match the existing `UserSummaryWidget` pattern already in the repo).
- **Icons:** import from `@ultranos/ui-kit/icons` (lucide) subpath only. Navigation arrows/chevrons wrap in `DirectionalIcon category="navigation"`; medical icons never mirror.
- **RTL:** logical properties only — `ps-*/pe-*`, `ms-*/me-*`, `text-start/end`, `start-*/end-*`. Never `pl/pr/ml/mr/left/right/text-left`.
- **i18n:** every user-facing string comes from a `useTranslations('<ns>')` key that exists in **all four** locale files `apps/admin-portal/messages/{en,ar,prs,ps}.json`. Non-en values may be machine-translated and must be appended to `apps/admin-portal/messages/TRANSLATION_REVIEW.md`.
- **Healthcare safety:** the dashboard shows only aggregate counts (no PHI). Do not log any PHI; do not remove any consent/audit calls.
- **No autonomous commits/staging** beyond the explicit `git commit` step at the end of each task (each task = one commit). Never `git push` without the human asking.
- **Verify commands** (run from repo root): typecheck `pnpm -F admin-portal typecheck`; tests `pnpm -F admin-portal test`; lint `pnpm -F admin-portal lint`; dev server `pnpm -F admin-portal dev` (package.json default port 3004; the human's running instance is on **:3003** — use whichever is live for screenshot verification).
- **Screenshot verification:** after the shell and dashboard tasks, render the real page in the browser (Playwright MCP against the running instance) in **both LTR (en) and RTL (ar)** and **light + dark** (`data-theme="dark"`), and confirm before claiming done — do not claim from reading class strings.

## Review Focus

- **Null/loading stats:** dashboard tiles and KPIs must render `—` (not crash, not blank) when `stats` is `null` or a field is `undefined` — the repo has a prior crash-on-undefined class of bug (remediation guide §6.8). → tests in Task 6 and Task 8.
- **⌘K cross-platform:** the palette must open on both `Cmd+K` (mac, `metaKey`) and `Ctrl+K` (win/linux, `ctrlKey`), and Esc must close it. → tests in Task 2.
- **RTL mirroring:** the enriched topbar (search trigger, status pill) and the Needs-Attention tiles must use logical properties so they mirror in ar/prs/ps; assert no `left/right/ml/mr/pl/pr` literals and correct `ms-auto`/`end-*` usage. → tests in Task 4 (topbar) and Task 6 (band).
- **4-locale key parity:** every new i18n key exists in en/ar/prs/ps with identical key sets (a missing key renders the raw key string in production). → test in Task 7.
- **Offline connection state:** the topbar status pill must reflect `navigator.onLine` and flip to an "Offline" state on the `offline` event (not stay green) — a false "Connected" is misleading. → test in Task 5.

---

## File Structure

**New files (all under `apps/admin-portal/src/`):**
- `components/command/command-items.ts` — static list of searchable admin destinations (label + href + icon + group), derived from `nav-config.ts`.
- `components/command/use-command-palette.tsx` — React context (`CommandPaletteProvider`, `useCommandPalette`) + global `Cmd/Ctrl+K` listener.
- `components/command/AdminCommandPalette.tsx` — cmdk dialog listing destinations; navigates on select.
- `components/topbar/GlobalSearchTrigger.tsx` — the topbar search "button that looks like an input" (`Search users, patients, labs…  ⌘K`) that opens the palette.
- `components/topbar/ConnectionStatus.tsx` — online/offline pill (`Connected` / `Offline`) driven by `navigator.onLine`.
- `components/dashboard/DashboardGreeting.tsx` — date + "Welcome back, <name>" + role·org line.
- `components/dashboard/NeedsAttentionBand.tsx` — card wrapping a grid of severity tiles (exports `NeedsAttentionBand` and internal `NeedsAttentionTile`).
- `components/dashboard/QuickActionsPanel.tsx` — quick-action buttons (Create user, Add module, Review KYC, View audit log).

**Modified files:**
- `components/BreadcrumbHeader.tsx` — insert `GlobalSearchTrigger` (center) + `ConnectionStatus` (right, before NotificationBell).
- `components/AuthGuard.tsx` — wrap `AuthenticatedShell` in `CommandPaletteProvider` and mount `<AdminCommandPalette />`.
- `app/[locale]/dashboard/page.tsx` — recompose into Triage/Focus layout.
- `messages/{en,ar,prs,ps}.json` — new `dashboard.*` and `topbar.*`/`commandPalette.*` keys.
- `messages/TRANSLATION_REVIEW.md` — log machine-translated values.
- `package.json` — add `cmdk` dependency.

**New test files (under `apps/admin-portal/src/__tests__/`):**
- `command-palette.test.tsx`, `topbar-connection-status.test.tsx`, `needs-attention-band.test.tsx`, `dashboard-greeting.test.tsx`, `quick-actions-panel.test.tsx`, `i18n-phase1-parity.test.ts`
- Modify: `dashboard.test.tsx`

---

### Task 1: Command palette — searchable destinations + dialog

**Files:**
- Create: `apps/admin-portal/src/components/command/command-items.ts`
- Create: `apps/admin-portal/src/components/command/AdminCommandPalette.tsx`
- Test: `apps/admin-portal/src/__tests__/command-palette.test.tsx`
- Modify: `apps/admin-portal/package.json` (add `cmdk`)

**Interfaces:**
- Consumes: `Dialog`, `DialogContent` from `@ultranos/ui-kit/components/ui/dialog`; icons from `@ultranos/ui-kit/icons`; `useRouter` from `next/navigation`.
- Produces:
  - `command-items.ts` → `export interface CommandItem { label: string; href: string; group: string; icon: LucideIcon }` and `export const commandItems: CommandItem[]`.
  - `AdminCommandPalette.tsx` → `export function AdminCommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }): JSX.Element`.

- [ ] **Step 1: Add the cmdk dependency**

Run: `pnpm -F admin-portal add cmdk`
Expected: `cmdk` appears in `apps/admin-portal/package.json` dependencies (match the version already used by `apps/opd-lite`).

- [ ] **Step 2: Write the failing test**

```tsx
// apps/admin-portal/src/__tests__/command-palette.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { AdminCommandPalette } from '../components/command/AdminCommandPalette'
import { commandItems } from '../components/command/command-items'

describe('AdminCommandPalette', () => {
  it('lists admin destinations when open', () => {
    render(<AdminCommandPalette open onOpenChange={() => {}} />)
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('exposes at least the core destinations', () => {
    const hrefs = commandItems.map((i) => i.href)
    expect(hrefs).toEqual(expect.arrayContaining(['/dashboard', '/users', '/patients', '/labs', '/audit']))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -F admin-portal test -- command-palette`
Expected: FAIL — cannot find module `../components/command/AdminCommandPalette`.

- [ ] **Step 4: Implement `command-items.ts`**

```ts
// apps/admin-portal/src/components/command/command-items.ts
import type { LucideIcon } from '@ultranos/ui-kit/icons'
import {
  Home, User, Users, Clock, Bell, Hospital, Building2, FlaskConical,
  Package, Globe, FileCheck, Cpu, FileText, CreditCard, Wallet, Receipt, Settings,
} from '@ultranos/ui-kit/icons'

export interface CommandItem {
  label: string
  href: string
  group: string
  icon: LucideIcon
}

// Mirrors apps/admin-portal/src/components/sidebar/nav-config.ts destinations.
export const commandItems: CommandItem[] = [
  { label: 'Dashboard', href: '/dashboard', group: 'Overview', icon: Home },
  { label: 'Providers', href: '/providers', group: 'Clinical', icon: User },
  { label: 'License Expiry', href: '/providers/expiry', group: 'Clinical', icon: Clock },
  { label: 'Patients', href: '/patients', group: 'Clinical', icon: User },
  { label: 'Alerts', href: '/alerts', group: 'Clinical', icon: Bell },
  { label: 'Clinics & Hospitals', href: '/clinics', group: 'Operations', icon: Hospital },
  { label: 'Pharmacies', href: '/pharmacies', group: 'Operations', icon: Building2 },
  { label: 'Labs', href: '/labs', group: 'Operations', icon: FlaskConical },
  { label: 'Inventory', href: '/inventory', group: 'Operations', icon: Package },
  { label: 'Network', href: '/network', group: 'Operations', icon: Globe },
  { label: 'Certifications', href: '/certifications', group: 'Operations', icon: FileCheck },
  { label: 'Users', href: '/users', group: 'Administration', icon: Users },
  { label: 'AI Models', href: '/ai-models', group: 'Administration', icon: Cpu },
  { label: 'Audit Log', href: '/audit', group: 'Administration', icon: FileText },
  { label: 'Subscriptions', href: '/subscriptions', group: 'Billing', icon: CreditCard },
  { label: 'Billing', href: '/subscriptions/billing', group: 'Billing', icon: Wallet },
  { label: 'Invoices', href: '/subscriptions/invoices', group: 'Billing', icon: Receipt },
  { label: 'Settings', href: '/settings', group: 'System', icon: Settings },
]
```

- [ ] **Step 5: Implement `AdminCommandPalette.tsx`**

```tsx
// apps/admin-portal/src/components/command/AdminCommandPalette.tsx
'use client'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent } from '@ultranos/ui-kit/components/ui/dialog'
import { commandItems } from './command-items'

export function AdminCommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const t = useTranslations('commandPalette')
  const groups = Array.from(new Set(commandItems.map((i) => i.group)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <Command className="[&_[cmdk-input]]:h-11">
          <Command.Input placeholder={t('placeholder')} className="w-full border-b border-border bg-transparent px-4 text-sm outline-none" />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">{t('empty')}</Command.Empty>
            {groups.map((group) => (
              <Command.Group key={group} heading={group} className="px-1 py-1 text-xs text-muted-foreground">
                {commandItems.filter((i) => i.group === group).map((item) => {
                  const Icon = item.icon
                  return (
                    <Command.Item
                      key={item.href}
                      value={`${item.label} ${item.href}`}
                      onSelect={() => { onOpenChange(false); router.push(item.href) }}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground aria-selected:bg-muted"
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      {item.label}
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Add the i18n keys used here** — add to `apps/admin-portal/messages/en.json` a `"commandPalette": { "placeholder": "Search users, patients, labs, invoices…", "empty": "No results found." }` block (and stubs in ar/prs/ps — done fully in Task 7; add the en block now so the test resolves).

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm -F admin-portal test -- command-palette`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/admin-portal/src/components/command apps/admin-portal/src/__tests__/command-palette.test.tsx apps/admin-portal/package.json apps/admin-portal/messages/en.json
git commit -m "feat(admin): add command palette destinations + dialog"
```

---

### Task 2: Command palette provider + global ⌘K/Ctrl+K shortcut

**Files:**
- Create: `apps/admin-portal/src/components/command/use-command-palette.tsx`
- Modify: `apps/admin-portal/src/components/AuthGuard.tsx` (wrap shell + mount palette)
- Test: `apps/admin-portal/src/__tests__/command-palette.test.tsx` (extend)

**Interfaces:**
- Consumes: `AdminCommandPalette` (Task 1).
- Produces: `export function CommandPaletteProvider({ children }: { children: ReactNode }): JSX.Element` and `export function useCommandPalette(): { open: boolean; setOpen: (o: boolean) => void }`.

- [ ] **Step 1: Write the failing test (append to command-palette.test.tsx)**

```tsx
import { fireEvent, renderHook, act } from '@testing-library/react'
import { CommandPaletteProvider, useCommandPalette } from '../components/command/use-command-palette'

describe('useCommandPalette', () => {
  it('opens on Ctrl+K and Meta+K, closes on repeat', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <CommandPaletteProvider>{children}</CommandPaletteProvider>
    const { result } = renderHook(() => useCommandPalette(), { wrapper })
    expect(result.current.open).toBe(false)
    act(() => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }) })
    expect(result.current.open).toBe(true)
    act(() => { fireEvent.keyDown(window, { key: 'k', metaKey: true }) })
    expect(result.current.open).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal test -- command-palette`
Expected: FAIL — cannot find `use-command-palette`.

- [ ] **Step 3: Implement `use-command-palette.tsx`**

```tsx
// apps/admin-portal/src/components/command/use-command-palette.tsx
'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AdminCommandPalette } from './AdminCommandPalette'

const Ctx = createContext<{ open: boolean; setOpen: (o: boolean) => void } | null>(null)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <Ctx.Provider value={{ open, setOpen }}>
      {children}
      <AdminCommandPalette open={open} onOpenChange={setOpen} />
    </Ctx.Provider>
  )
}

export function useCommandPalette() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCommandPalette must be used within CommandPaletteProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F admin-portal test -- command-palette`
Expected: PASS (3 tests).

- [ ] **Step 5: Mount in the shell** — in `apps/admin-portal/src/components/AuthGuard.tsx`, import `CommandPaletteProvider` and wrap the shell body. The existing `AuthenticatedShell` (currently lines ~290–306) becomes:

```tsx
function AuthenticatedShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <CommandPaletteProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <BreadcrumbHeader />
            <main id="main-content" className="flex flex-1 flex-col gap-4 p-4">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
        <NotificationToaster />
      </CommandPaletteProvider>
    </TooltipProvider>
  )
}
```

(Add `import { CommandPaletteProvider } from '@/components/command/use-command-palette'` at the top.)

- [ ] **Step 6: Verify typecheck + tests**

Run: `pnpm -F admin-portal typecheck && pnpm -F admin-portal test -- command-palette`
Expected: no new type errors; command-palette tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin-portal/src/components/command/use-command-palette.tsx apps/admin-portal/src/components/AuthGuard.tsx apps/admin-portal/src/__tests__/command-palette.test.tsx
git commit -m "feat(admin): global Cmd/Ctrl+K command palette mounted in shell"
```

---

### Task 3: Topbar global search trigger

**Files:**
- Create: `apps/admin-portal/src/components/topbar/GlobalSearchTrigger.tsx`
- Test: `apps/admin-portal/src/__tests__/command-palette.test.tsx` (extend) — trigger opens palette.

**Interfaces:**
- Consumes: `useCommandPalette` (Task 2); `Search` icon from `@ultranos/ui-kit/icons`; `useTranslations`.
- Produces: `export function GlobalSearchTrigger(): JSX.Element`.

- [ ] **Step 1: Write the failing test (append)**

```tsx
import { GlobalSearchTrigger } from '../components/topbar/GlobalSearchTrigger'

describe('GlobalSearchTrigger', () => {
  it('opens the palette on click', () => {
    function Probe() {
      const { open } = useCommandPalette()
      return <span data-testid="state">{open ? 'open' : 'closed'}</span>
    }
    render(
      <CommandPaletteProvider>
        <GlobalSearchTrigger />
        <Probe />
      </CommandPaletteProvider>,
    )
    expect(screen.getByTestId('state').textContent).toBe('closed')
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    expect(screen.getByTestId('state').textContent).toBe('open')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal test -- command-palette`
Expected: FAIL — cannot find `GlobalSearchTrigger`.

- [ ] **Step 3: Implement `GlobalSearchTrigger.tsx`**

```tsx
// apps/admin-portal/src/components/topbar/GlobalSearchTrigger.tsx
'use client'
import { useTranslations } from 'next-intl'
import { Search } from '@ultranos/ui-kit/icons'
import { useCommandPalette } from '@/components/command/use-command-palette'

export function GlobalSearchTrigger() {
  const t = useTranslations('topbar')
  const { setOpen } = useCommandPalette()
  return (
    <button
      type="button"
      aria-label={t('searchAria')}
      onClick={() => setOpen(true)}
      className="mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-full border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
    >
      <Search className="size-4" />
      <span className="flex-1 text-start">{t('searchPlaceholder')}</span>
      <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium">⌘K</span>
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F admin-portal test -- command-palette`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/components/topbar/GlobalSearchTrigger.tsx apps/admin-portal/src/__tests__/command-palette.test.tsx
git commit -m "feat(admin): topbar global search trigger opens command palette"
```

---

### Task 4: Wire enriched topbar into BreadcrumbHeader (+ RTL check)

**Files:**
- Modify: `apps/admin-portal/src/components/BreadcrumbHeader.tsx`
- Test: `apps/admin-portal/src/__tests__/breadcrumb-header.test.tsx` (create)

**Interfaces:**
- Consumes: `GlobalSearchTrigger` (Task 3), `ConnectionStatus` (Task 5 — imported here but added in Task 5; to keep this task independently testable, gate on the search trigger only and add `ConnectionStatus` import in Task 5's step).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin-portal/src/__tests__/breadcrumb-header.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/notifications/NotificationBell', () => ({ NotificationBell: () => <div data-testid="bell" /> }))
vi.mock('@/components/LanguageSelectorClient', () => ({ LanguageSelectorClient: () => <div data-testid="lang" /> }))

import { CommandPaletteProvider } from '../components/command/use-command-palette'
import { BreadcrumbHeader } from '../components/BreadcrumbHeader'

describe('BreadcrumbHeader (enriched)', () => {
  it('renders the global search trigger alongside bell + language', () => {
    render(<CommandPaletteProvider><BreadcrumbHeader /></CommandPaletteProvider>)
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
    expect(screen.getByTestId('bell')).toBeInTheDocument()
    expect(screen.getByTestId('lang')).toBeInTheDocument()
  })

  it('keeps the header height and right-aligned controls with logical properties', () => {
    const { container } = render(<CommandPaletteProvider><BreadcrumbHeader /></CommandPaletteProvider>)
    const header = container.querySelector('header')!
    expect(header.className).toContain('h-14')
    // right cluster uses ms-auto (logical), not ml-auto
    expect(container.innerHTML).toContain('ms-auto')
    expect(container.innerHTML).not.toMatch(/\bml-auto\b/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal test -- breadcrumb-header`
Expected: FAIL — no search button.

- [ ] **Step 3: Edit `BreadcrumbHeader.tsx`**

Add `import { GlobalSearchTrigger } from '@/components/topbar/GlobalSearchTrigger'`. Insert `<GlobalSearchTrigger />` after the `</Breadcrumb>` close and before the `<div className="ms-auto …">` right cluster, so layout is: `[trigger][separator][breadcrumb] … [search grows centered] … [ms-auto: badge · bell · language]`. Do not change `h-14`, the existing `ms-auto` cluster, or add any avatar (the topbar intentionally has none — profile lives in the sidebar footer per the approved shell).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F admin-portal test -- breadcrumb-header`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/components/BreadcrumbHeader.tsx apps/admin-portal/src/__tests__/breadcrumb-header.test.tsx
git commit -m "feat(admin): enrich topbar with global search trigger"
```

---

### Task 5: Connection status pill (online/offline)

**Files:**
- Create: `apps/admin-portal/src/components/topbar/ConnectionStatus.tsx`
- Modify: `apps/admin-portal/src/components/BreadcrumbHeader.tsx` (add to right cluster)
- Test: `apps/admin-portal/src/__tests__/topbar-connection-status.test.tsx`

**Interfaces:**
- Produces: `export function ConnectionStatus(): JSX.Element`.

> Note: admin-portal is online (queries the Hub via trpc); it is **not** offline-first with a Dexie sync queue like OPD Lite. So this is a lightweight connectivity indicator (`navigator.onLine` + `online`/`offline` events), not OPD's `SyncPulse`. Label: `Connected` (success) / `Offline` (destructive).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin-portal/src/__tests__/topbar-connection-status.test.tsx
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ConnectionStatus } from '../components/topbar/ConnectionStatus'

describe('ConnectionStatus', () => {
  it('shows Connected when online', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    render(<ConnectionStatus />)
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
  })

  it('flips to Offline on the offline event', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    render(<ConnectionStatus />)
    act(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); window.dispatchEvent(new Event('offline')) })
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal test -- topbar-connection-status`
Expected: FAIL — cannot find `ConnectionStatus`.

- [ ] **Step 3: Implement `ConnectionStatus.tsx`**

```tsx
// apps/admin-portal/src/components/topbar/ConnectionStatus.tsx
'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

export function ConnectionStatus() {
  const t = useTranslations('topbar')
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const cls = online ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
  const dot = online ? 'bg-success' : 'bg-destructive'
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {online ? t('connected') : t('offline')}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F admin-portal test -- topbar-connection-status`
Expected: PASS (2 tests).

- [ ] **Step 5: Add to the topbar** — in `BreadcrumbHeader.tsx`, import `ConnectionStatus` and place it inside the `ms-auto` right cluster, before `<NotificationBell />`.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/components/topbar/ConnectionStatus.tsx apps/admin-portal/src/components/BreadcrumbHeader.tsx apps/admin-portal/src/__tests__/topbar-connection-status.test.tsx
git commit -m "feat(admin): topbar connection status pill"
```

---

### Task 6: Needs-Attention band + severity tiles

**Files:**
- Create: `apps/admin-portal/src/components/dashboard/NeedsAttentionBand.tsx`
- Test: `apps/admin-portal/src/__tests__/needs-attention-band.test.tsx`

**Interfaces:**
- Consumes: `useRouter` (`next/navigation`); icons from `@ultranos/ui-kit/icons`; `useTranslations('dashboard')`.
- Produces: `export interface NeedsAttentionTileData { key: string; label: string; count: number | undefined; severity: 'warning' | 'destructive' | 'neutral'; icon: LucideIcon; href: string }` and `export function NeedsAttentionBand({ tiles }: { tiles: NeedsAttentionTileData[] }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin-portal/src/__tests__/needs-attention-band.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import { NeedsAttentionBand, type NeedsAttentionTileData } from '../components/dashboard/NeedsAttentionBand'
import { UserRoundPlus, FlaskConical } from '@ultranos/ui-kit/icons'

const tiles: NeedsAttentionTileData[] = [
  { key: 'invites', label: 'Pending invites', count: 3, severity: 'warning', icon: UserRoundPlus, href: '/users' },
  { key: 'labs', label: 'Lab approvals', count: undefined, severity: 'neutral', icon: FlaskConical, href: '/labs' },
]

describe('NeedsAttentionBand', () => {
  it('renders tile labels and counts', () => {
    render(<NeedsAttentionBand tiles={tiles} />)
    expect(screen.getByText('Pending invites')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
  it('renders an em dash when a count is undefined (no crash)', () => {
    render(<NeedsAttentionBand tiles={tiles} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
  it('uses logical properties only (no left/right literals)', () => {
    const { container } = render(<NeedsAttentionBand tiles={tiles} />)
    expect(container.innerHTML).not.toMatch(/\b(ml-|mr-|pl-|pr-|left-|right-|text-left|text-right)/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal test -- needs-attention-band`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `NeedsAttentionBand.tsx`**

```tsx
// apps/admin-portal/src/components/dashboard/NeedsAttentionBand.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { LucideIcon } from '@ultranos/ui-kit/icons'

export interface NeedsAttentionTileData {
  key: string
  label: string
  count: number | undefined
  severity: 'warning' | 'destructive' | 'neutral'
  icon: LucideIcon
  href: string
}

const styles: Record<NeedsAttentionTileData['severity'], { box: string; icon: string }> = {
  warning: { box: 'border-warning/30 bg-warning/5 hover:bg-warning/10', icon: 'text-warning' },
  destructive: { box: 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10', icon: 'text-destructive' },
  neutral: { box: 'border-border bg-background hover:bg-muted/40', icon: 'text-muted-foreground' },
}

function NeedsAttentionTile({ tile }: { tile: NeedsAttentionTileData }) {
  const router = useRouter()
  const Icon = tile.icon
  const s = styles[tile.severity]
  return (
    <button
      type="button"
      onClick={() => router.push(tile.href)}
      className={`flex flex-col gap-2 rounded-xl border p-4 text-start transition-colors ${s.box}`}
    >
      <div className="flex items-center justify-between">
        <Icon className={`size-5 ${s.icon}`} />
        <span className="text-2xl font-semibold tracking-tight">{tile.count ?? '—'}</span>
      </div>
      <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
    </button>
  )
}

export function NeedsAttentionBand({ tiles }: { tiles: NeedsAttentionTileData[] }) {
  const t = useTranslations('dashboard')
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('needsAttention')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => <NeedsAttentionTile key={tile.key} tile={tile} />)}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F admin-portal test -- needs-attention-band`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/components/dashboard/NeedsAttentionBand.tsx apps/admin-portal/src/__tests__/needs-attention-band.test.tsx
git commit -m "feat(admin): dashboard needs-attention severity tiles"
```

---

### Task 7: Dashboard greeting, quick actions + i18n keys (4-locale parity)

**Files:**
- Create: `apps/admin-portal/src/components/dashboard/DashboardGreeting.tsx`
- Create: `apps/admin-portal/src/components/dashboard/QuickActionsPanel.tsx`
- Modify: `apps/admin-portal/messages/{en,ar,prs,ps}.json` + `messages/TRANSLATION_REVIEW.md`
- Test: `apps/admin-portal/src/__tests__/dashboard-greeting.test.tsx`, `quick-actions-panel.test.tsx`, `i18n-phase1-parity.test.ts`

**Interfaces:**
- Produces:
  - `export function DashboardGreeting({ name, role, org }: { name: string; role: string; org: string }): JSX.Element`
  - `export function QuickActionsPanel(): JSX.Element`

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/admin-portal/src/__tests__/dashboard-greeting.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DashboardGreeting } from '../components/dashboard/DashboardGreeting'

describe('DashboardGreeting', () => {
  it('renders name, role and org', () => {
    render(<DashboardGreeting name="Dr. Watan Wal" role="Administrator" org="Watan Hospital" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dr. Watan Wal')
    expect(screen.getByText(/Administrator/)).toBeInTheDocument()
    expect(screen.getByText(/Watan Hospital/)).toBeInTheDocument()
  })
})
```

```tsx
// apps/admin-portal/src/__tests__/quick-actions-panel.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
import { QuickActionsPanel } from '../components/dashboard/QuickActionsPanel'

describe('QuickActionsPanel', () => {
  it('renders the core quick actions', () => {
    render(<QuickActionsPanel />)
    expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /audit log/i })).toBeInTheDocument()
  })
})
```

```ts
// apps/admin-portal/src/__tests__/i18n-phase1-parity.test.ts
import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import ar from '../../messages/ar.json'
import prs from '../../messages/prs.json'
import ps from '../../messages/ps.json'

const NEW_KEYS = [
  'dashboard.greetingWelcome', 'dashboard.needsAttention', 'dashboard.quickActions',
  'dashboard.tilePendingInvites', 'dashboard.tileLabApprovals', 'dashboard.tileKycSubmissions', 'dashboard.tileActiveAlerts',
  'dashboard.actionCreateUser', 'dashboard.actionAddModule', 'dashboard.actionReviewKyc', 'dashboard.actionViewAudit',
  'topbar.searchPlaceholder', 'topbar.searchAria', 'topbar.connected', 'topbar.offline',
  'commandPalette.placeholder', 'commandPalette.empty',
]
function get(obj: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}
describe('phase-1 i18n parity', () => {
  for (const key of NEW_KEYS) {
    it(`"${key}" exists in all four locales`, () => {
      for (const [name, msgs] of [['en', en], ['ar', ar], ['prs', prs], ['ps', ps]] as const) {
        expect(typeof get(msgs as Record<string, unknown>, key), `${name}:${key}`).toBe('string')
      }
    })
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F admin-portal test -- dashboard-greeting quick-actions-panel i18n-phase1-parity`
Expected: FAIL (missing modules + missing keys).

- [ ] **Step 3: Add the i18n keys to all four locale files**

In `apps/admin-portal/messages/en.json`, extend the existing `"dashboard"` block and add a `"topbar"` block (and confirm the `"commandPalette"` block from Task 1). English values:

```json
"dashboard": {
  "greetingWelcome": "Welcome back, {name}",
  "needsAttention": "Needs attention",
  "quickActions": "Quick actions",
  "tilePendingInvites": "Pending invites",
  "tileLabApprovals": "Lab approvals",
  "tileKycSubmissions": "KYC submissions",
  "tileActiveAlerts": "Active alerts",
  "actionCreateUser": "Create user",
  "actionAddModule": "Add module",
  "actionReviewKyc": "Review KYC",
  "actionViewAudit": "View audit log"
},
"topbar": {
  "searchPlaceholder": "Search users, patients, labs, invoices…",
  "searchAria": "Open search",
  "connected": "Connected",
  "offline": "Offline"
}
```

Add the **same keys** with machine-translated values to `ar.json`, `prs.json`, `ps.json` (keep existing keys; append into the matching `dashboard`/`topbar`/`commandPalette` objects). Append every non-en value to `apps/admin-portal/messages/TRANSLATION_REVIEW.md` under a "Phase 1 redesign" section (one row per key: en/ar/prs/ps), flagged for native review.

- [ ] **Step 4: Implement `DashboardGreeting.tsx`**

```tsx
// apps/admin-portal/src/components/dashboard/DashboardGreeting.tsx
'use client'
import { useLocale, useTranslations } from 'next-intl'

export function DashboardGreeting({ name, role, org }: { name: string; role: string; org: string }) {
  const t = useTranslations('dashboard')
  const locale = useLocale()
  const today = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  return (
    <div className="flex flex-col gap-0.5 pt-1">
      <p className="text-sm font-medium text-primary">{today}</p>
      <h1 className="text-2xl font-semibold text-foreground">{t('greetingWelcome', { name })}</h1>
      <p className="text-sm text-muted-foreground">{role} · {org}</p>
    </div>
  )
}
```

- [ ] **Step 5: Implement `QuickActionsPanel.tsx`**

```tsx
// apps/admin-portal/src/components/dashboard/QuickActionsPanel.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { UserPlus, PackagePlus, ShieldCheck, ScrollText } from '@ultranos/ui-kit/icons'

export function QuickActionsPanel() {
  const router = useRouter()
  const t = useTranslations('dashboard')
  const actions = [
    { key: 'create', label: t('actionCreateUser'), icon: UserPlus, href: '/users/create', primary: true },
    { key: 'module', label: t('actionAddModule'), icon: PackagePlus, href: '/subscriptions', primary: false },
    { key: 'kyc', label: t('actionReviewKyc'), icon: ShieldCheck, href: '/providers', primary: false },
    { key: 'audit', label: t('actionViewAudit'), icon: ScrollText, href: '/audit', primary: false },
  ]
  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
      <p className="mb-4 text-base font-semibold text-foreground">{t('quickActions')}</p>
      <div className="flex flex-col gap-2">
        {actions.map((a) => {
          const Icon = a.icon
          const cls = a.primary
            ? 'bg-primary text-primary-foreground'
            : 'border border-border bg-background hover:bg-muted/40'
          return (
            <button key={a.key} type="button" onClick={() => router.push(a.href)}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium ${cls}`}>
              <Icon className="size-4" /> {a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm -F admin-portal test -- dashboard-greeting quick-actions-panel i18n-phase1-parity`
Expected: PASS (greeting 1, quick-actions 1, parity — one per key).

- [ ] **Step 7: Commit**

```bash
git add apps/admin-portal/src/components/dashboard/DashboardGreeting.tsx apps/admin-portal/src/components/dashboard/QuickActionsPanel.tsx apps/admin-portal/messages apps/admin-portal/src/__tests__/dashboard-greeting.test.tsx apps/admin-portal/src/__tests__/quick-actions-panel.test.tsx apps/admin-portal/src/__tests__/i18n-phase1-parity.test.ts
git commit -m "feat(admin): dashboard greeting + quick actions + phase-1 i18n keys"
```

---

### Task 8: Recompose the dashboard page (Triage/Focus)

**Files:**
- Modify: `apps/admin-portal/src/app/[locale]/dashboard/page.tsx`
- Modify: `apps/admin-portal/src/__tests__/dashboard.test.tsx`

**Interfaces:**
- Consumes: `DashboardGreeting`, `NeedsAttentionBand` (+ `NeedsAttentionTileData`), `QuickActionsPanel`, existing `UserSummaryWidget`, `RecentActivityFeed`, `DunningBanner`, and `trpc.admin.dashboardStats` (existing shape: `pendingKycReviews`, `pendingLabApprovals`, `activeAlerts`, `highSeverityAlertCount`, `recentAuditEvents`, `auditChainHealthy`, `userCounts.{total,active,suspended,pendingInvite,withoutMfa}`).

- [ ] **Step 1: Update the failing test** — extend `dashboard.test.tsx` to assert the new structure. Keep the existing trpc mock (`@/lib/trpc`) returning a stats object; add:

```tsx
it('renders the triage layout: greeting, needs-attention, quick actions', async () => {
  render(<DashboardPage />)
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/welcome back/i)
  expect(screen.getByText(/needs attention/i)).toBeInTheDocument()
  expect(screen.getByText(/quick actions/i)).toBeInTheDocument()
  // needs-attention tile from existing stats
  expect(screen.getByText(/pending invites/i)).toBeInTheDocument()
})

it('shows em dashes when stats fail to load (no crash)', async () => {
  // configure the trpc mock to reject for this test (see mock setup at top of file)
  render(<DashboardPage />)
  expect(await screen.findAllByText('—')).not.toHaveLength(0)
})
```

(Adjust the existing `dashboardStats` mock so one test resolves with data and one rejects — follow the file's existing `mockQuery` pattern.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F admin-portal test -- dashboard`
Expected: FAIL — new headings/text not present.

- [ ] **Step 3: Rewrite `dashboard/page.tsx`**

Replace the render body (keep the existing `useEffect` stats fetch, `statsError` handling, and `DunningBanner`) with the Triage/Focus composition. Page root stays `<div className="flex flex-col gap-4">` (full-width). Build the tiles array from existing stats and pass to `NeedsAttentionBand`; keep `UserSummaryWidget` + the three existing KPI cards in the compact KPI row; render `RecentActivityFeed` (2/3) beside `QuickActionsPanel` (1/3):

```tsx
// key excerpt — inside the component return
const name = /* from session store, existing source */ profileName ?? ''
const tiles: NeedsAttentionTileData[] = [
  { key: 'invites', label: t('tilePendingInvites'), count: stats?.userCounts?.pendingInvite, severity: (stats?.userCounts?.pendingInvite ?? 0) > 0 ? 'warning' : 'neutral', icon: UserRoundPlus, href: '/users' },
  { key: 'labs', label: t('tileLabApprovals'), count: stats?.pendingLabApprovals, severity: (stats?.pendingLabApprovals ?? 0) > 0 ? 'warning' : 'neutral', icon: FlaskConical, href: '/labs' },
  { key: 'kyc', label: t('tileKycSubmissions'), count: stats?.pendingKycReviews, severity: (stats?.pendingKycReviews ?? 0) > 0 ? 'warning' : 'neutral', icon: UserRoundPlus, href: '/providers' },
  { key: 'alerts', label: t('tileActiveAlerts'), count: stats?.activeAlerts, severity: (stats?.highSeverityAlertCount ?? 0) > 0 ? 'destructive' : 'neutral', icon: Bell, href: '/alerts' },
]

return (
  <div className="flex flex-col gap-4">
    <DashboardGreeting name={name} role={roleLabel} org={orgName} />
    <DunningBanner />
    {statsError && (/* keep existing error card */)}
    <NeedsAttentionBand tiles={tiles} />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UserSummaryWidget counts={stats?.userCounts} />
      {/* keep the 3 existing KPI cards: pendingLabApprovals, activeAlerts, recentAuditEvents */}
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2"><RecentActivityFeed /></div>
      <QuickActionsPanel />
    </div>
  </div>
)
```

Import the new components + the icons (`UserRoundPlus`, `FlaskConical`, `Bell`) from `@ultranos/ui-kit/icons`. Source `name`/`roleLabel`/`orgName` from the existing session store the page/`NavUser` already uses (`formatUserRole` etc.); if org name isn't readily available, use the org/location from `useLocationStore` (`ALL_LOCATIONS.name`) — do not invent a new backend call.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -F admin-portal test -- dashboard`
Expected: PASS.

- [ ] **Step 5: Full app test + typecheck + lint**

Run: `pnpm -F admin-portal typecheck && pnpm -F admin-portal test && pnpm -F admin-portal lint`
Expected: no new type errors; suite green (no NEW failures vs baseline); lint clean.

- [ ] **Step 6: Screenshot verification (LTR/RTL + light/dark)**

Start/confirm the dev server (`pnpm -F admin-portal dev`; the human's instance is on :3003). With the Playwright MCP browser, navigate to `/dashboard` and capture: (a) en + light, (b) en + dark (`data-theme="dark"` on `<html>`), (c) ar (RTL) + light. Confirm: greeting hero, Needs-Attention band mirrored correctly in RTL, tiles show counts/`—`, KPI row uniform, activity + quick actions row, ⌘K search + connection pill in the topbar. Fix any visual issues before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/admin-portal/src/app/[locale]/dashboard/page.tsx apps/admin-portal/src/__tests__/dashboard.test.tsx
git commit -m "feat(admin): triage/focus dashboard layout"
```

---

## Subsequent phases (each its own plan, written after this ships)

- **Phase 2 — List/table:** power-table (`RowSelect` + floating `BulkActionBar` + `ColumnToggle`) as a ui-kit primitive (or admin composition), applied to Users first, then Providers/Patients/Labs (with stat strip) and remaining lists. Spec §2.2.
- **Phase 3 — Detail/profile:** tabs-in-header shadowed card + Summary-first + click-to-reveal tabs; patient variant renders allergy-first banner. Applied to Users, Providers, Labs, Patients detail. Spec §2.3.
- **Phase 4 — Forms:** sectioned form + summary rail + clickable-avatar photo upload dialog; Users create/edit first, then settings/other forms. Spec §2.4.
- **Phase 5 — Modals:** retire the green-header `AddModuleDialog`; adopt ui-kit `Dialog` (short) / `Sheet` (long) by purpose across the app. Spec §2.5.
- **Phase 6 — Sweep + polish:** remaining routes, minor form tweaks flagged at approval, ⌘K palette scope expansion (search real records, not just destinations), promote the command palette to ui-kit if a second app needs it.

## Self-review notes
- **Spec coverage:** Phase 1 covers spec §2.1 (dashboard) and §2.6 (shell). §2.2–2.5 are explicitly deferred to Phases 2–5 above.
- **No backend changes** in Phase 1 — all tiles/KPIs use existing `dashboardStats` fields; "Licenses expiring" tile from the mockup is deferred to a phase that adds the backend field (not included here to keep Phase 1 frontend-only).
- **Types consistent:** `NeedsAttentionTileData` defined in Task 6 is consumed unchanged in Task 8; `useCommandPalette` shape (`{ open, setOpen }`) defined in Task 2 is consumed in Task 3.
- **Deviation from mockup, intentional:** the topbar "Synced" pill is implemented as an online/offline **Connection status** (Task 5) because admin-portal is not offline-first; noted in the spec's open items.
