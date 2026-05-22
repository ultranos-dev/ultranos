# Navigation Phase 1: AppShell Sidebar + OPD-Lite Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the shared `<AppShell>` component from a horizontal navbar to a collapsible sidebar with badge support, then adopt it in OPD-Lite with a full navigation system and patient directory page.

**Architecture:** The `<AppShell>` component in `@ultranos/ui-kit` is refactored to render a vertical sidebar with icon+label nav items, badge counts, grouped sections, and a footer with slots for sync/user/language. OPD-Lite's layout replaces `<AppHeader>` with the new sidebar `<AppShell>`, and a new `/patients` route provides a searchable patient directory. All styling uses the existing design tokens from `packages/ui-kit/src/tokens.ts` and inline styles (matching the current AppShell pattern — no Tailwind in ui-kit).

**Tech Stack:** React 18/19, TypeScript, Next.js 15 App Router, Vitest + @testing-library/react, Dexie.js (IndexedDB), next-intl, `@ultranos/ui-kit` design tokens

**Stories covered:** 37.1 (AppShell upgrade), 37.2 (OPD-Lite sidebar adoption), 37.3 (Patient Directory)

**Scope note:** Stories 37.4–37.10 (Pharmacy-Lite and Lab-Lite navigation) are separate plans that depend on Task 1–4 of this plan being complete. Story 37.11–37.19 (Scheduling) is a separate plan.

---

## File Structure

### New Files
- `packages/ui-kit/src/Sidebar.tsx` — New collapsible sidebar component (the upgraded AppShell variant)
- `packages/ui-kit/src/__tests__/Sidebar.test.tsx` — Tests for new sidebar
- `apps/opd-lite/src/components/AppSidebar.tsx` — OPD-Lite sidebar wrapper (configures nav items, badges, sign-out)
- `apps/opd-lite/src/hooks/useNavBadges.ts` — Hook that aggregates badge counts from various sources
- `apps/opd-lite/src/app/[locale]/patients/page.tsx` — Patient directory page
- `apps/opd-lite/src/components/patients/PatientDirectory.tsx` — Patient directory table component
- `apps/opd-lite/src/__tests__/patient-directory.test.tsx` — Tests for patient directory

### Modified Files
- `packages/ui-kit/src/index.ts` — Export new `Sidebar` + types
- `packages/ui-kit/src/AppShell.tsx:6-11` — Add deprecated JSDoc to `NavItem` pointing to `SidebarNavItem`
- `apps/opd-lite/src/app/[locale]/layout.tsx` — Replace `<AppHeader>` with `<AppSidebar>`
- `apps/opd-lite/src/components/AppHeader.tsx` — Simplify to search bar only (remove SyncPulse, NotificationBell, UserDropdown)
- `apps/opd-lite/messages/en.json` — Add `sidebar.*` and `patients.*` i18n keys
- `apps/opd-lite/messages/ar.json` — Add `sidebar.*` and `patients.*` i18n keys
- `apps/opd-lite/messages/prs.json` — Add `sidebar.*` and `patients.*` i18n keys

---

## Task 1: Create Sidebar Component in ui-kit

**Files:**
- Create: `packages/ui-kit/src/Sidebar.tsx`
- Create: `packages/ui-kit/src/__tests__/Sidebar.test.tsx`
- Modify: `packages/ui-kit/src/index.ts`

### Why a new file instead of modifying AppShell.tsx

The existing `AppShell` is a horizontal navbar used by Pharmacy-Lite in production. Rather than adding a `variant` prop and doubling the component complexity, we create `Sidebar` as a new component. The old `AppShell` stays untouched — Pharmacy-Lite will migrate to `Sidebar` in a separate plan (Story 37.4). This avoids breaking changes.

- [ ] **Step 1: Write failing tests for Sidebar**

Create `packages/ui-kit/src/__tests__/Sidebar.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '../Sidebar.js'
import type { SidebarProps, SidebarNavItem, SidebarUser } from '../Sidebar.js'

const mockUser: SidebarUser = {
  name: 'Dr. Ahmad',
  email: 'ahmad@clinic.org',
  role: 'Physician',
  initials: 'DA',
}

const mockNavItems: SidebarNavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: <span data-testid="icon-dashboard">D</span>,
    active: true,
    group: 'core',
  },
  {
    label: 'Patients',
    href: '/patients',
    icon: <span data-testid="icon-patients">P</span>,
    group: 'core',
  },
  {
    label: 'Notifications',
    href: '/notifications',
    icon: <span data-testid="icon-notif">N</span>,
    badge: 5,
    group: 'clinical',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <span data-testid="icon-settings">S</span>,
    group: 'system',
  },
]

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    appName: 'OPD Lite',
    navItems: mockNavItems,
    user: mockUser,
    onSignOut: vi.fn(),
    children: <main>Main Content</main>,
    ...overrides,
  }
  return { ...render(<Sidebar {...props} />), props }
}

describe('Sidebar', () => {
  it('renders app name', () => {
    renderSidebar()
    expect(screen.getByText('OPD Lite')).toBeInTheDocument()
  })

  it('renders nav items as links with correct labels', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Patients/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Notifications/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument()
  })

  it('renders aria-current="page" on active item', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Patients/i })).not.toHaveAttribute('aria-current')
  })

  it('renders badge count on nav item', () => {
    renderSidebar()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders badge as 99+ when count exceeds 99', () => {
    const items = [{ ...mockNavItems[2]!, badge: 150 }]
    renderSidebar({ navItems: items })
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('does not render badge when value is 0', () => {
    const items = [{ ...mockNavItems[2]!, badge: 0 }]
    renderSidebar({ navItems: items })
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('does not render badge when value is null', () => {
    const items = [{ ...mockNavItems[2]!, badge: null }]
    renderSidebar({ navItems: items })
    // Should render item but no badge element
    expect(screen.getByRole('link', { name: /Notifications/i })).toBeInTheDocument()
  })

  it('renders group dividers between different groups', () => {
    const { container } = renderSidebar()
    const dividers = container.querySelectorAll('[data-testid="group-divider"]')
    // 3 groups (core, clinical, system) = 2 dividers
    expect(dividers).toHaveLength(2)
  })

  it('collapse toggle hides labels, keeps icons', () => {
    renderSidebar()
    const toggle = screen.getByRole('button', { name: /collapse/i })
    fireEvent.click(toggle)

    // Labels should be visually hidden (sr-only) but icons remain
    expect(screen.getByTestId('icon-dashboard')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapse toggle restores labels on second click', () => {
    renderSidebar()
    const toggle = screen.getByRole('button', { name: /collapse/i })
    fireEvent.click(toggle) // collapse
    fireEvent.click(toggle) // expand
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders user section with name and role', () => {
    renderSidebar()
    expect(screen.getByText('Dr. Ahmad')).toBeInTheDocument()
    expect(screen.getByText('Physician')).toBeInTheDocument()
  })

  it('sign out button calls onSignOut', () => {
    const onSignOut = vi.fn()
    renderSidebar({ onSignOut })
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('renders syncIndicator slot', () => {
    renderSidebar({ syncIndicator: <span data-testid="sync">Sync</span> })
    expect(screen.getByTestId('sync')).toBeInTheDocument()
  })

  it('renders languageSelector slot', () => {
    renderSidebar({ languageSelector: <span data-testid="lang">EN</span> })
    expect(screen.getByTestId('lang')).toBeInTheDocument()
  })

  it('renders children as main content area', () => {
    renderSidebar()
    expect(screen.getByText('Main Content')).toBeInTheDocument()
  })

  it('has navigation landmark with label', () => {
    renderSidebar()
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
  })

  it('keyboard: Enter activates collapse toggle', () => {
    renderSidebar()
    const toggle = screen.getByRole('button', { name: /collapse/i })
    fireEvent.keyDown(toggle, { key: 'Enter' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  // Snapshot tests
  it('snapshot: expanded sidebar LTR', () => {
    const { container } = renderSidebar()
    expect(container).toMatchSnapshot()
  })

  it('snapshot: expanded sidebar RTL', () => {
    const { container } = render(
      <div dir="rtl">
        <Sidebar
          appName="OPD Lite"
          navItems={mockNavItems}
          user={mockUser}
          onSignOut={vi.fn()}
        >
          <main>Main Content</main>
        </Sidebar>
      </div>,
    )
    expect(container).toMatchSnapshot()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui-kit && pnpm test -- --run src/__tests__/Sidebar.test.tsx`
Expected: FAIL — module `../Sidebar.js` not found

- [ ] **Step 3: Implement Sidebar component**

Create `packages/ui-kit/src/Sidebar.tsx`:

```tsx
'use client'

import { useState, useCallback, type ReactNode } from 'react'
import { colors, typography, shadows, borderRadius, spacing, transitions } from './tokens.js'

export interface SidebarNavItem {
  label: string
  href: string
  icon?: ReactNode
  active?: boolean
  badge?: number | null
  group?: string
}

export interface SidebarUser {
  name: string
  email: string
  role: string
  initials: string
}

export interface SidebarProps {
  appName: string
  navItems?: SidebarNavItem[]
  user?: SidebarUser | null
  onSignOut?: () => void
  syncIndicator?: ReactNode
  languageSelector?: ReactNode
  children: ReactNode
  defaultCollapsed?: boolean
  persistKey?: string
}

const SIDEBAR_WIDTH_EXPANDED = '240px'
const SIDEBAR_WIDTH_COLLAPSED = '64px'

function getInitialCollapsed(persistKey?: string, defaultCollapsed?: boolean): boolean {
  if (typeof window === 'undefined') return defaultCollapsed ?? false
  if (!persistKey) return defaultCollapsed ?? false
  try {
    const stored = localStorage.getItem(persistKey)
    if (stored !== null) return stored === 'true'
  } catch {
    // localStorage unavailable
  }
  return defaultCollapsed ?? false
}

export function Sidebar({
  appName,
  navItems = [],
  user,
  onSignOut,
  syncIndicator,
  languageSelector,
  children,
  defaultCollapsed = false,
  persistKey,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => getInitialCollapsed(persistKey, defaultCollapsed))

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      if (persistKey) {
        try {
          localStorage.setItem(persistKey, String(next))
        } catch {
          // localStorage unavailable
        }
      }
      return next
    })
  }, [persistKey])

  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED

  // Group nav items and insert dividers
  const groupedItems: { item: SidebarNavItem; showDivider: boolean }[] = []
  let lastGroup: string | undefined
  for (const item of navItems) {
    const showDivider = lastGroup !== undefined && item.group !== lastGroup
    groupedItems.push({ item, showDivider })
    lastGroup = item.group
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          backgroundColor: colors.neutral[900],
          color: colors.neutral[0],
          display: 'flex',
          flexDirection: 'column',
          fontFamily: typography.fontFamily.sans,
          transition: `width ${transitions.normal}, min-width ${transitions.normal}`,
          overflow: 'hidden',
          position: 'sticky',
          insetBlockStart: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        {/* Header: App name + collapse toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            paddingInline: spacing[3],
            paddingBlock: spacing[4],
            borderBlockEnd: `1px solid ${colors.neutral[700]}`,
          }}
        >
          {!collapsed && (
            <span
              style={{
                fontWeight: typography.fontWeight.bold,
                fontSize: typography.fontSize.md,
                color: colors.primary[300],
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {appName}
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: colors.neutral[400],
              padding: spacing[1],
              borderRadius: borderRadius.sm,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: collapsed ? 'rotate(180deg)' : undefined,
                transition: `transform ${transitions.fast}`,
              }}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingBlock: spacing[2],
          }}
        >
          {groupedItems.map(({ item, showDivider }) => (
            <div key={item.href}>
              {showDivider && (
                <div
                  data-testid="group-divider"
                  style={{
                    height: '1px',
                    backgroundColor: colors.neutral[700],
                    marginBlock: spacing[2],
                    marginInline: spacing[3],
                  }}
                />
              )}
              <a
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing[3],
                  paddingInline: spacing[3],
                  paddingBlock: spacing[2],
                  marginInline: spacing[2],
                  borderRadius: borderRadius.md,
                  color: item.active ? colors.primary[300] : colors.neutral[300],
                  backgroundColor: item.active ? `${colors.primary[900]}` : 'transparent',
                  textDecoration: 'none',
                  fontSize: typography.fontSize.sm,
                  fontWeight: item.active ? typography.fontWeight.semibold : typography.fontWeight.medium,
                  whiteSpace: 'nowrap',
                  transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
                  position: 'relative',
                }}
              >
                {/* Icon */}
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </span>

                {/* Label (hidden when collapsed) */}
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}

                {/* Badge */}
                {item.badge != null && item.badge > 0 && (
                  <span
                    style={{
                      backgroundColor: colors.danger,
                      color: colors.neutral[0],
                      fontSize: '0.625rem',
                      fontWeight: typography.fontWeight.bold,
                      lineHeight: 1,
                      paddingInline: collapsed ? '0.25rem' : '0.375rem',
                      paddingBlock: '0.125rem',
                      borderRadius: borderRadius.full,
                      minWidth: '18px',
                      textAlign: 'center',
                      position: collapsed ? 'absolute' : 'static',
                      insetBlockStart: collapsed ? '2px' : undefined,
                      insetInlineEnd: collapsed ? '4px' : undefined,
                    }}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </a>
            </div>
          ))}
        </div>

        {/* Footer: sync, user, language */}
        <div
          style={{
            borderBlockStart: `1px solid ${colors.neutral[700]}`,
            paddingBlock: spacing[3],
            paddingInline: spacing[3],
          }}
        >
          {/* Sync indicator slot */}
          {syncIndicator && (
            <div style={{ marginBlockEnd: spacing[2], display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
              {syncIndicator}
            </div>
          )}

          {/* User section */}
          {user && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing[3],
                marginBlockEnd: spacing[2],
              }}
            >
              <span
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: borderRadius.full,
                  backgroundColor: colors.primary[700],
                  color: colors.primary[100],
                  fontWeight: typography.fontWeight.semibold,
                  fontSize: typography.fontSize.xs,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {user.initials}
              </span>
              {!collapsed && (
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div
                    style={{
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                      color: colors.neutral[100],
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {user.name}
                  </div>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      color: colors.primary[400],
                      fontWeight: typography.fontWeight.medium,
                    }}
                  >
                    {user.role}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Sign out */}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: spacing[3],
                width: '100%',
                paddingBlock: spacing[2],
                paddingInline: spacing[2],
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: borderRadius.md,
                color: colors.neutral[400],
                fontSize: typography.fontSize.sm,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: `color ${transitions.fast}`,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {!collapsed && 'Sign out'}
            </button>
          )}

          {/* Language selector slot */}
          {languageSelector && (
            <div style={{ marginBlockStart: spacing[2], display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
              {languageSelector}
            </div>
          )}
        </div>
      </nav>

      {/* Main content area */}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Export Sidebar from ui-kit index**

Add to `packages/ui-kit/src/index.ts` after the existing AppShell export:

```ts
export { Sidebar } from './Sidebar.js'
export type { SidebarProps, SidebarUser, SidebarNavItem } from './Sidebar.js'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/ui-kit && pnpm test -- --run src/__tests__/Sidebar.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Run existing AppShell tests to confirm no regression**

Run: `cd packages/ui-kit && pnpm test -- --run src/__tests__/AppShell.test.tsx`
Expected: All tests PASS (AppShell.tsx was not modified)

- [ ] **Step 7: Build ui-kit to verify TypeScript compilation**

Run: `pnpm -F @ultranos/ui-kit build`
Expected: Build succeeds with no errors

- [ ] **Step 8: Update snapshot files**

Run: `cd packages/ui-kit && pnpm test -- --run -u src/__tests__/Sidebar.test.tsx`
Expected: Snapshots created

- [ ] **Step 9: Commit**

```bash
git add packages/ui-kit/src/Sidebar.tsx packages/ui-kit/src/__tests__/Sidebar.test.tsx packages/ui-kit/src/index.ts packages/ui-kit/src/__tests__/__snapshots__/
git commit -m "feat(ui-kit): add collapsible Sidebar component with badges and grouped nav

New Sidebar component for spoke app navigation. Supports collapsible
state with localStorage persistence, badge counts on nav items, grouped
sections with dividers, footer slots for sync/user/language, and full
RTL support via logical CSS properties.

Refs: Epic 37, Story 37.1"
```

---

## Task 2: OPD-Lite i18n Keys for Sidebar and Patients

**Files:**
- Modify: `apps/opd-lite/messages/en.json`
- Modify: `apps/opd-lite/messages/ar.json`
- Modify: `apps/opd-lite/messages/prs.json`

- [ ] **Step 1: Add sidebar and patients i18n keys to en.json**

Add these keys to `apps/opd-lite/messages/en.json` (at top level alongside existing `nav`, `app`, etc.):

```json
"sidebar": {
  "dashboard": "Dashboard",
  "appointments": "Appointments",
  "patients": "Patients",
  "registerPatient": "Register Patient",
  "notifications": "Notifications",
  "conflicts": "Conflicts",
  "duplicateReviews": "Duplicate Reviews",
  "expiringConsents": "Expiring Consents",
  "kyc": "KYC Verification",
  "settings": "Settings",
  "signOut": "Sign out",
  "collapse": "Collapse navigation",
  "expand": "Expand navigation"
},
"patients": {
  "title": "Patient Directory",
  "searchPlaceholder": "Search by name or phone...",
  "name": "Name",
  "age": "Age",
  "gender": "Gender",
  "phone": "Phone",
  "lastVisit": "Last Visit",
  "status": "Status",
  "allergies": "Allergies",
  "active": "Active",
  "inactive": "Inactive",
  "merged": "Merged",
  "all": "All",
  "hasAllergies": "Has Allergies",
  "yes": "Yes",
  "no": "No",
  "lastVisitFilter": "Last Visit",
  "today": "Today",
  "thisWeek": "This Week",
  "thisMonth": "This Month",
  "registerNew": "Register New Patient",
  "noPatients": "No patients registered yet",
  "noPatientsDescription": "Get started by registering your first patient.",
  "noResults": "No patients match your filters",
  "previous": "Previous",
  "next": "Next",
  "pageOf": "Page {current} of {total}",
  "allergyFlag": "Has allergies"
}
```

- [ ] **Step 2: Add sidebar and patients i18n keys to ar.json**

Add the same structure to `apps/opd-lite/messages/ar.json` with Arabic translations:

```json
"sidebar": {
  "dashboard": "لوحة المعلومات",
  "appointments": "المواعيد",
  "patients": "المرضى",
  "registerPatient": "تسجيل مريض",
  "notifications": "الإشعارات",
  "conflicts": "التعارضات",
  "duplicateReviews": "مراجعة التكرارات",
  "expiringConsents": "الموافقات المنتهية",
  "kyc": "التحقق من الهوية",
  "settings": "الإعدادات",
  "signOut": "تسجيل الخروج",
  "collapse": "طي القائمة",
  "expand": "توسيع القائمة"
},
"patients": {
  "title": "دليل المرضى",
  "searchPlaceholder": "بحث بالاسم أو رقم الهاتف...",
  "name": "الاسم",
  "age": "العمر",
  "gender": "الجنس",
  "phone": "الهاتف",
  "lastVisit": "آخر زيارة",
  "status": "الحالة",
  "allergies": "الحساسية",
  "active": "نشط",
  "inactive": "غير نشط",
  "merged": "مدمج",
  "all": "الكل",
  "hasAllergies": "لديه حساسية",
  "yes": "نعم",
  "no": "لا",
  "lastVisitFilter": "آخر زيارة",
  "today": "اليوم",
  "thisWeek": "هذا الأسبوع",
  "thisMonth": "هذا الشهر",
  "registerNew": "تسجيل مريض جديد",
  "noPatients": "لا يوجد مرضى مسجلين بعد",
  "noPatientsDescription": "ابدأ بتسجيل أول مريض لديك.",
  "noResults": "لا يوجد مرضى يطابقون الفلاتر",
  "previous": "السابق",
  "next": "التالي",
  "pageOf": "صفحة {current} من {total}",
  "allergyFlag": "لديه حساسية"
}
```

- [ ] **Step 3: Add sidebar and patients i18n keys to prs.json**

Add the same structure to `apps/opd-lite/messages/prs.json` with Dari translations:

```json
"sidebar": {
  "dashboard": "داشبورد",
  "appointments": "وختونه",
  "patients": "ناروغان",
  "registerPatient": "ثبت ناروغ",
  "notifications": "خبرتیاوې",
  "conflicts": "تضادونه",
  "duplicateReviews": "د تکرار بیاکتنه",
  "expiringConsents": "پای ته رسیدونکې رضایتونه",
  "kyc": "د پیژندنې تایید",
  "settings": "تنظیمات",
  "signOut": "وتل",
  "collapse": "د لیست تړل",
  "expand": "د لیست خلاصول"
},
"patients": {
  "title": "د ناروغانو لاریست",
  "searchPlaceholder": "د نوم یا تلیفون په واسطه لټون...",
  "name": "نوم",
  "age": "عمر",
  "gender": "جنسیت",
  "phone": "تلیفون",
  "lastVisit": "وروستۍ لیدنه",
  "status": "حالت",
  "allergies": "حساسیت",
  "active": "فعال",
  "inactive": "غیر فعال",
  "merged": "یوځای شوی",
  "all": "ټول",
  "hasAllergies": "حساسیت لري",
  "yes": "هو",
  "no": "نه",
  "lastVisitFilter": "وروستۍ لیدنه",
  "today": "نن",
  "thisWeek": "دا اونۍ",
  "thisMonth": "دا میاشت",
  "registerNew": "نوی ناروغ ثبت کړئ",
  "noPatients": "تر اوسه هیڅ ناروغ ثبت شوی نه دی",
  "noPatientsDescription": "د خپل لومړي ناروغ ثبت کولو سره پیل وکړئ.",
  "noResults": "ستاسو فلترونو سره هیڅ ناروغ سمون نه خوري",
  "previous": "مخکینی",
  "next": "راتلونکی",
  "pageOf": "مخ {current} له {total}",
  "allergyFlag": "حساسیت لري"
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/opd-lite/messages/en.json apps/opd-lite/messages/ar.json apps/opd-lite/messages/prs.json
git commit -m "feat(opd-lite): add i18n keys for sidebar navigation and patient directory

Adds sidebar.* and patients.* namespaces to all three locale files
(en, ar, prs) for the upcoming sidebar navigation and patient
directory features.

Refs: Epic 37, Stories 37.2, 37.3"
```

---

## Task 3: OPD-Lite Nav Badges Hook

**Files:**
- Create: `apps/opd-lite/src/hooks/useNavBadges.ts`

This hook aggregates badge counts from the various data sources that already exist in the app (notification polling, dashboard card fetch patterns, sync store).

- [ ] **Step 1: Create the useNavBadges hook**

Create `apps/opd-lite/src/hooks/useNavBadges.ts`:

```ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchUnreadCount } from '@/lib/notification-api'
import { useAuthSessionStore } from '@/stores/auth-session-store'

interface NavBadges {
  notifications: number
  conflicts: number
  duplicateReviews: number
  expiringConsents: number
}

const POLL_INTERVAL_MS = 30_000

/**
 * Aggregates badge counts for sidebar navigation items.
 * Polls the Hub API for counts every 30 seconds (matches existing NotificationBell pattern).
 * Returns 0 for counts that fail to fetch (fail-silent, no false positives).
 */
export function useNavBadges(): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({
    notifications: 0,
    conflicts: 0,
    duplicateReviews: 0,
    expiringConsents: 0,
  })
  const session = useAuthSessionStore((s) => s.session)

  const fetchBadges = useCallback(async () => {
    if (!session) return

    const hubUrl =
      process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (session.accessToken) {
      headers['Authorization'] = `Bearer ${session.accessToken}`
    }

    const emptyInput = encodeURIComponent(JSON.stringify({ json: {} }))

    // Fetch all counts in parallel — each fails independently
    const [notifResult, conflictResult, dupeResult, consentResult] =
      await Promise.allSettled([
        fetchUnreadCount(),
        fetch(`${hubUrl}/patient.unresolvedConflictCount?input=${emptyInput}`, {
          method: 'GET',
          headers,
        }).then((r) => r.json()),
        fetch(`${hubUrl}/duplicateReview.pendingCount?input=${emptyInput}`, {
          method: 'GET',
          headers,
        }).then((r) => r.json()),
        fetch(`${hubUrl}/consent.expiringCount?input=${emptyInput}`, {
          method: 'GET',
          headers,
        }).then((r) => r.json()),
      ])

    setBadges({
      notifications:
        notifResult.status === 'fulfilled'
          ? notifResult.value.count ?? 0
          : 0,
      conflicts:
        conflictResult.status === 'fulfilled'
          ? conflictResult.value?.result?.data?.json ?? 0
          : 0,
      duplicateReviews:
        dupeResult.status === 'fulfilled'
          ? dupeResult.value?.result?.data?.json ?? 0
          : 0,
      expiringConsents:
        consentResult.status === 'fulfilled'
          ? consentResult.value?.result?.data?.json ?? 0
          : 0,
    })
  }, [session])

  useEffect(() => {
    fetchBadges()
    const interval = setInterval(fetchBadges, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchBadges])

  return badges
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/opd-lite/src/hooks/useNavBadges.ts
git commit -m "feat(opd-lite): add useNavBadges hook for sidebar badge counts

Aggregates notification, conflict, duplicate review, and expiring
consent counts from Hub API. Polls every 30s matching existing
notification pattern. Each count fails independently to 0.

Refs: Epic 37, Story 37.2"
```

---

## Task 4: OPD-Lite AppSidebar Wrapper + Layout Integration

**Files:**
- Create: `apps/opd-lite/src/components/AppSidebar.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/layout.tsx`
- Modify: `apps/opd-lite/src/components/AppHeader.tsx`

- [ ] **Step 1: Create the AppSidebar component**

Create `apps/opd-lite/src/components/AppSidebar.tsx`:

```tsx
'use client'

import { useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sidebar, type SidebarNavItem } from '@ultranos/ui-kit'
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
import { SyncPulse } from '@/components/SyncPulse'
import { useNavBadges } from '@/hooks/useNavBadges'

// Inline SVG icons (matching codebase pattern — no icon library)
const icons = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  userPlus: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  alertTriangle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  userSearch: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="4" /><path d="M10.3 15H7a4 4 0 0 0-4 4v2" /><circle cx="17" cy="17" r="3" /><path d="M21 21l-1.9-1.9" />
    </svg>
  ),
  fileWarning: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  ),
  shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
}

export function AppSidebar({ children }: { children: ReactNode }) {
  const session = useAuthSessionStore((s) => s.session)
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const badges = useNavBadges()

  const handleSignOut = useCallback(async () => {
    // Clear all PHI stores
    useEncounterStore.getState().clearEncounter()
    useVitalsStore.getState().reset()
    useDiagnosisStore.getState().reset()
    useSoapNoteStore.getState().reset()
    usePrescriptionStore.getState().reset()
    useAllergyStore.getState().reset()

    await auditPhiAccess({
      action: AuditAction.PHI_CLEANUP,
      resourceType: AuditResourceType.SESSION,
      resourceId: session?.sessionId ?? 'unknown',
    })

    await clearPhiTables()
    encryptionKeyStore.wipe()
    clearSigningKeys()
    useAuthSessionStore.getState().clearSession()

    try {
      await getSupabaseBrowserClient().auth.signOut()
    } finally {
      window.location.href = '/login'
    }
  }, [session?.sessionId])

  // Don't render sidebar on login page or when unauthenticated
  if (!isAuthenticated || !session || pathname === '/login') {
    return <>{children}</>
  }

  const navItems: SidebarNavItem[] = [
    { label: t('dashboard'), href: '/', icon: icons.dashboard, active: pathname === '/', group: 'core' },
    { label: t('appointments'), href: '/appointments', icon: icons.calendar, active: pathname === '/appointments', group: 'core' },
    { label: t('patients'), href: '/patients', icon: icons.users, active: pathname === '/patients', group: 'core' },
    { label: t('registerPatient'), href: '/register-patient', icon: icons.userPlus, active: pathname === '/register-patient', group: 'core' },
    { label: t('notifications'), href: '/notifications', icon: icons.bell, active: pathname === '/notifications', badge: badges.notifications, group: 'clinical' },
    { label: t('conflicts'), href: '/conflicts', icon: icons.alertTriangle, active: pathname === '/conflicts', badge: badges.conflicts, group: 'clinical' },
    { label: t('duplicateReviews'), href: '/duplicate-review', icon: icons.userSearch, active: pathname === '/duplicate-review', badge: badges.duplicateReviews, group: 'clinical' },
    { label: t('expiringConsents'), href: '/expiring-consents', icon: icons.fileWarning, active: pathname === '/expiring-consents', badge: badges.expiringConsents, group: 'clinical' },
    { label: t('kyc'), href: '/kyc', icon: icons.shield, active: pathname === '/kyc', group: 'admin' },
    { label: t('settings'), href: '/settings', icon: icons.settings, active: pathname === '/settings', group: 'system' },
  ]

  const initials = session.name
    ? session.name
        .split(' ')
        .map((p) => p[0]?.toUpperCase() ?? '')
        .slice(0, 2)
        .join('')
    : session.email?.split('@')[0]?.slice(0, 2)?.toUpperCase() ?? '??'

  return (
    <Sidebar
      appName="OPD Lite"
      navItems={navItems}
      user={{
        name: session.name || session.email?.split('@')[0] || 'Clinician',
        email: session.email,
        role: session.role,
        initials,
      }}
      onSignOut={handleSignOut}
      syncIndicator={<SyncPulse />}
      persistKey="opd-lite-sidebar-collapsed"
    >
      {children}
    </Sidebar>
  )
}
```

- [ ] **Step 2: Update locale layout to use AppSidebar**

Replace the contents of `apps/opd-lite/src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppSidebar } from '@/components/AppSidebar'
import { AppHeader } from '@/components/AppHeader'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()
  return (
    <NextIntlClientProvider messages={messages}>
      <AppSidebar>
        <AppHeader />
        {children}
      </AppSidebar>
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 3: Simplify AppHeader to search-only**

Replace `apps/opd-lite/src/components/AppHeader.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { SearchInput } from '@/components/SearchInput'
import { PatientResultList } from '@/components/PatientResultList'
import { useState } from 'react'

export function AppHeader() {
  const t = useTranslations('app')
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <header className="mx-auto max-w-5xl px-4 pt-4 pb-2">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('searchPatient')}
          />
        </div>
      </div>
      {searchQuery.length >= 2 && (
        <PatientResultList query={searchQuery} />
      )}
    </header>
  )
}
```

**Note:** If `SearchInput` and `PatientResultList` are currently embedded in `ClinicalDashboard` rather than the header, leave `AppHeader` as a minimal empty header and keep search on the dashboard. Check actual imports in `ClinicalDashboard.tsx` before implementing. The key change is: **remove `SyncPulse`, `NotificationBell`, and `UserDropdown`** from AppHeader — those now live in the sidebar.

Simpler fallback if search lives in the dashboard:

```tsx
'use client'

export function AppHeader() {
  return (
    <header className="mx-auto max-w-5xl px-4 pt-4 pb-2">
      {/* Patient search lives in ClinicalDashboard; header is now minimal */}
    </header>
  )
}
```

- [ ] **Step 4: Verify the app compiles**

Run: `pnpm -F opd-lite build`
Expected: Build succeeds. If there are import issues, fix them.

- [ ] **Step 5: Commit**

```bash
git add apps/opd-lite/src/components/AppSidebar.tsx apps/opd-lite/src/app/\[locale\]/layout.tsx apps/opd-lite/src/components/AppHeader.tsx
git commit -m "feat(opd-lite): adopt sidebar navigation with badge counts

Replace header-only layout with collapsible sidebar. SyncPulse,
notifications, and user menu move to sidebar. AppHeader simplified
to search-only. Badge counts from Hub API drive urgency indicators
on Notifications, Conflicts, Duplicate Reviews, and Expiring Consents.

Refs: Epic 37, Story 37.2"
```

---

## Task 5: Patient Directory Page

**Files:**
- Create: `apps/opd-lite/src/app/[locale]/patients/page.tsx`
- Create: `apps/opd-lite/src/components/patients/PatientDirectory.tsx`
- Create: `apps/opd-lite/src/__tests__/patient-directory.test.tsx`

- [ ] **Step 1: Write failing test for PatientDirectory**

Create `apps/opd-lite/src/__tests__/patient-directory.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { PatientDirectory } from '@/components/patients/PatientDirectory'

// Mock Dexie database
const mockPatients = [
  {
    id: 'p-001',
    nameGiven: 'Ahmad',
    nameFather: 'Khalil',
    birthDate: '1985-03-15',
    gender: 'male',
    phone: '+93700123456',
    active: true,
    mergedInto: null,
    lastEncounterDate: '2026-05-20T08:30:00Z',
    allergies: [{ code: 'penicillin', display: 'Penicillin' }],
  },
  {
    id: 'p-002',
    nameGiven: 'Fatima',
    nameFather: 'Rahman',
    birthDate: '1990-07-22',
    gender: 'female',
    phone: '+93700654321',
    active: true,
    mergedInto: null,
    lastEncounterDate: null,
    allergies: [],
  },
  {
    id: 'p-003',
    nameGiven: 'Omar',
    nameFather: 'Hassan',
    birthDate: '1978-11-05',
    gender: 'male',
    phone: '+93700111222',
    active: false,
    mergedInto: null,
    lastEncounterDate: '2026-04-10T14:00:00Z',
    allergies: [],
  },
]

vi.mock('@/lib/db', () => ({
  db: {
    patients: {
      toArray: vi.fn().mockResolvedValue(mockPatients),
    },
  },
}))

const messages = {
  patients: {
    title: 'Patient Directory',
    searchPlaceholder: 'Search by name or phone...',
    name: 'Name',
    age: 'Age',
    gender: 'Gender',
    phone: 'Phone',
    lastVisit: 'Last Visit',
    status: 'Status',
    allergies: 'Allergies',
    active: 'Active',
    inactive: 'Inactive',
    merged: 'Merged',
    all: 'All',
    hasAllergies: 'Has Allergies',
    yes: 'Yes',
    no: 'No',
    lastVisitFilter: 'Last Visit',
    today: 'Today',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    registerNew: 'Register New Patient',
    noPatients: 'No patients registered yet',
    noPatientsDescription: 'Get started by registering your first patient.',
    noResults: 'No patients match your filters',
    previous: 'Previous',
    next: 'Next',
    pageOf: 'Page {current} of {total}',
    allergyFlag: 'Has allergies',
  },
}

function renderDirectory() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PatientDirectory />
    </NextIntlClientProvider>,
  )
}

describe('PatientDirectory', () => {
  it('renders the page title', async () => {
    renderDirectory()
    await waitFor(() => {
      expect(screen.getByText('Patient Directory')).toBeInTheDocument()
    })
  })

  it('renders patient rows from IndexedDB', async () => {
    renderDirectory()
    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeInTheDocument()
      expect(screen.getByText('Fatima')).toBeInTheDocument()
      expect(screen.getByText('Omar')).toBeInTheDocument()
    })
  })

  it('shows allergy flag indicator for patients with allergies', async () => {
    renderDirectory()
    await waitFor(() => {
      const allergyFlags = screen.getAllByLabelText('Has allergies')
      expect(allergyFlags).toHaveLength(1) // Only Ahmad has allergies
    })
  })

  it('filters patients by search query', async () => {
    renderDirectory()
    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search by name or phone...')
    fireEvent.change(searchInput, { target: { value: 'Fatima' } })

    await waitFor(() => {
      expect(screen.queryByText('Ahmad')).not.toBeInTheDocument()
      expect(screen.getByText('Fatima')).toBeInTheDocument()
    })
  })

  it('filters by status', async () => {
    renderDirectory()
    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeInTheDocument()
    })

    const statusFilter = screen.getByDisplayValue('All')
    fireEvent.change(statusFilter, { target: { value: 'inactive' } })

    await waitFor(() => {
      expect(screen.queryByText('Ahmad')).not.toBeInTheDocument()
      expect(screen.getByText('Omar')).toBeInTheDocument()
    })
  })

  it('shows register button when fewer than 3 results', async () => {
    renderDirectory()
    await waitFor(() => {
      expect(screen.getByText('Ahmad')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search by name or phone...')
    fireEvent.change(searchInput, { target: { value: 'Fatima' } })

    await waitFor(() => {
      expect(screen.getByText('Register New Patient')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/opd-lite && pnpm test -- --run src/__tests__/patient-directory.test.tsx`
Expected: FAIL — module `@/components/patients/PatientDirectory` not found

- [ ] **Step 3: Create PatientDirectory component**

Create `apps/opd-lite/src/components/patients/PatientDirectory.tsx`:

```tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'

interface PatientRow {
  id: string
  nameGiven: string
  nameFather?: string
  birthDate?: string
  gender?: string
  phone?: string
  active: boolean
  mergedInto?: string | null
  lastEncounterDate?: string | null
  allergies?: Array<{ code: string; display: string }>
}

type StatusFilter = 'all' | 'active' | 'inactive'
type AllergyFilter = 'all' | 'yes' | 'no'
type VisitFilter = 'all' | 'today' | 'week' | 'month'

const PAGE_SIZE = 25

function calculateAge(birthDate: string): number {
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString()
}

function isWithinPeriod(date: string, period: 'today' | 'week' | 'month'): boolean {
  const d = new Date(date)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period === 'today') return d >= startOfToday
  if (period === 'week') {
    const weekAgo = new Date(startOfToday)
    weekAgo.setDate(weekAgo.getDate() - 7)
    return d >= weekAgo
  }
  // month
  const monthAgo = new Date(startOfToday)
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  return d >= monthAgo
}

export function PatientDirectory() {
  const t = useTranslations('patients')
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [allergyFilter, setAllergyFilter] = useState<AllergyFilter>('all')
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('all')
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<keyof PatientRow>('nameGiven')
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    db.patients
      .toArray()
      .then((rows: PatientRow[]) => setPatients(rows))
      .catch(() => setPatients([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = patients

    // Search
    if (search.length >= 2) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.nameGiven?.toLowerCase().includes(q) ||
          p.nameFather?.toLowerCase().includes(q) ||
          p.phone?.includes(q),
      )
    }

    // Status
    if (statusFilter === 'active') result = result.filter((p) => p.active && !p.mergedInto)
    if (statusFilter === 'inactive') result = result.filter((p) => !p.active || !!p.mergedInto)

    // Allergies
    if (allergyFilter === 'yes') result = result.filter((p) => (p.allergies?.length ?? 0) > 0)
    if (allergyFilter === 'no') result = result.filter((p) => (p.allergies?.length ?? 0) === 0)

    // Last visit
    if (visitFilter !== 'all') {
      result = result.filter(
        (p) => p.lastEncounterDate && isWithinPeriod(p.lastEncounterDate, visitFilter),
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey] ?? ''
      const bVal = b[sortKey] ?? ''
      if (aVal < bVal) return sortAsc ? -1 : 1
      if (aVal > bVal) return sortAsc ? 1 : -1
      return 0
    })

    return result
  }, [patients, search, statusFilter, allergyFilter, visitFilter, sortKey, sortAsc])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
  }, [search, statusFilter, allergyFilter, visitFilter])

  function handleSort(key: keyof PatientRow) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  function getStatus(p: PatientRow): string {
    if (p.mergedInto) return t('merged')
    return p.active ? t('active') : t('inactive')
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-8 text-neutral-500">Loading...</div>
  }

  if (patients.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="text-lg font-semibold text-neutral-700">{t('noPatients')}</p>
        <p className="mt-2 text-sm text-neutral-500">{t('noPatientsDescription')}</p>
        <a
          href="/register-patient"
          className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white"
        >
          {t('registerNew')}
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold text-neutral-900 mb-4">{t('title')}</h1>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">{t('all')}</option>
          <option value="active">{t('active')}</option>
          <option value="inactive">{t('inactive')}</option>
        </select>
        <select
          value={allergyFilter}
          onChange={(e) => setAllergyFilter(e.target.value as AllergyFilter)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">{t('hasAllergies')}: {t('all')}</option>
          <option value="yes">{t('yes')}</option>
          <option value="no">{t('no')}</option>
        </select>
        <select
          value={visitFilter}
          onChange={(e) => setVisitFilter(e.target.value as VisitFilter)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">{t('lastVisitFilter')}: {t('all')}</option>
          <option value="today">{t('today')}</option>
          <option value="week">{t('thisWeek')}</option>
          <option value="month">{t('thisMonth')}</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">
          <p>{t('noResults')}</p>
          {search.length >= 2 && (
            <a
              href={`/register-patient?nameGiven=${encodeURIComponent(search)}`}
              className="mt-3 inline-block rounded-lg border-2 border-dashed border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:border-primary-400 hover:text-primary-600"
            >
              {t('registerNew')}
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  {(['nameGiven', 'birthDate', 'gender', 'phone', 'lastEncounterDate', 'active'] as const).map(
                    (key) => {
                      const labels: Record<string, string> = {
                        nameGiven: t('name'),
                        birthDate: t('age'),
                        gender: t('gender'),
                        phone: t('phone'),
                        lastEncounterDate: t('lastVisit'),
                        active: t('status'),
                      }
                      return (
                        <th
                          key={key}
                          onClick={() => handleSort(key)}
                          className="px-3 py-2 text-start font-medium cursor-pointer hover:text-neutral-900 select-none"
                        >
                          {labels[key]}
                          {sortKey === key && (sortAsc ? ' ▲' : ' ▼')}
                        </th>
                      )
                    },
                  )}
                  <th className="px-3 py-2 text-start font-medium">{t('allergies')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pageItems.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => (window.location.href = `/patient/${p.id}`)}
                    className="cursor-pointer hover:bg-neutral-50"
                  >
                    <td className="px-3 py-2 font-medium text-neutral-900">
                      {p.nameGiven}
                      {p.nameFather ? ` ${p.nameFather}` : ''}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">
                      {p.birthDate ? calculateAge(p.birthDate) : '—'}
                    </td>
                    <td className="px-3 py-2 text-neutral-600 capitalize">{p.gender ?? '—'}</td>
                    <td className="px-3 py-2 text-neutral-600">{p.phone ?? '—'}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {p.lastEncounterDate ? formatDate(p.lastEncounterDate) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.mergedInto
                            ? 'bg-neutral-100 text-neutral-600'
                            : p.active
                              ? 'bg-green-50 text-green-700'
                              : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {getStatus(p)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {(p.allergies?.length ?? 0) > 0 && (
                        <span
                          aria-label={t('allergyFlag')}
                          className="inline-block h-3 w-3 rounded-full bg-red-500"
                          title={t('allergyFlag')}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Register button when < 3 results */}
          {filtered.length < 3 && (
            <a
              href={`/register-patient${search ? `?nameGiven=${encodeURIComponent(search)}` : ''}`}
              className="mt-3 block w-full rounded-lg border-2 border-dashed border-neutral-300 px-4 py-3 text-center text-sm font-medium text-neutral-600 hover:border-primary-400 hover:text-primary-600"
            >
              {t('registerNew')}
            </a>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
              >
                {t('previous')}
              </button>
              <span>{t('pageOf', { current: page + 1, total: totalPages })}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
              >
                {t('next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create the page route**

Create `apps/opd-lite/src/app/[locale]/patients/page.tsx`:

```tsx
import { PatientDirectory } from '@/components/patients/PatientDirectory'

export default function PatientsPage() {
  return <PatientDirectory />
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/opd-lite && pnpm test -- --run src/__tests__/patient-directory.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Run full OPD-Lite test suite to check for regressions**

Run: `pnpm -F opd-lite test`
Expected: All existing tests pass. If snapshot tests fail due to AppHeader changes, update them.

- [ ] **Step 7: Build to verify compilation**

Run: `pnpm -F opd-lite build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add apps/opd-lite/src/app/\[locale\]/patients/page.tsx apps/opd-lite/src/components/patients/PatientDirectory.tsx apps/opd-lite/src/__tests__/patient-directory.test.tsx
git commit -m "feat(opd-lite): add patient directory page with search, filter, sort

New /patients route with a searchable, filterable, sortable patient
table. Reads from local IndexedDB (offline-first). Supports status,
allergy, and last-visit filters. Shows allergy flag as red dot per
safety rule 4. Register New Patient button appears when results < 3.

Refs: Epic 37, Story 37.3"
```

---

## Task 6: Snapshot Updates and Final Verification

**Files:**
- Various snapshot files that may need updating

- [ ] **Step 1: Update any broken snapshots across ui-kit**

Run: `cd packages/ui-kit && pnpm test -- --run -u`
Expected: All tests pass, snapshots updated

- [ ] **Step 2: Update any broken snapshots across opd-lite**

Run: `cd apps/opd-lite && pnpm test -- --run -u`
Expected: All tests pass. Review updated snapshots — AppHeader snapshot should now show the simplified version.

- [ ] **Step 3: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: No TypeScript errors

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: No new lint errors

- [ ] **Step 5: Commit snapshot updates if any**

```bash
git add -A '*__snapshots__*'
git commit -m "test: update snapshots for sidebar navigation changes

Refs: Epic 37"
```

- [ ] **Step 6: Final verification — start dev server**

Run: `pnpm -F opd-lite dev`
Expected: Dev server starts. Verify in browser:
- Sidebar renders on left (or right in RTL)
- Nav items visible with correct icons
- Collapse toggle works and persists across refresh
- Badge counts appear (if Hub API is running)
- Clicking nav items navigates correctly
- `/patients` page loads and shows patient data
- Login page does NOT show sidebar
- Patient search in header still works

---

## Summary

| Task | Story | What it delivers |
|------|-------|-----------------|
| 1 | 37.1 | `Sidebar` component in `@ultranos/ui-kit` with badges, groups, collapse, RTL |
| 2 | 37.2, 37.3 | i18n keys for sidebar and patient directory (en/ar/prs) |
| 3 | 37.2 | `useNavBadges` hook aggregating counts from Hub API |
| 4 | 37.2 | `AppSidebar` wrapper + layout integration + AppHeader simplification |
| 5 | 37.3 | Patient directory page with search, filter, sort, pagination |
| 6 | — | Snapshot updates and final verification |

**Next plans to create (can be parallelized):**
- `2026-05-22-navigation-phase2-pharmacy-sidebar.md` — Stories 37.4, 37.5, 37.6
- `2026-05-22-navigation-phase3-lab-sidebar.md` — Stories 37.7, 37.8, 37.9, 37.10
- `2026-05-22-navigation-phase4-scheduling.md` — Stories 37.11–37.19
