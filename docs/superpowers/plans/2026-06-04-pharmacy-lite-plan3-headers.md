# Pharmacy Lite — Plan 3: Page Headers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consistent `TopHeader` and `BreadcrumbHeader` components to all 21 pharmacy-lite routes, matching admin-portal's page-level header pattern.

**Architecture:** Create two shared header components in `src/components/`. Update all route `page.tsx` files to add the appropriate header at the top. Remove ad-hoc inline h1/h2 elements from page files and the PharmacyDashboard welcome block. The components are identical to admin-portal's TopHeader and BreadcrumbHeader.

**Tech Stack:** Next.js 15, shadcn `Breadcrumb`/`Separator`/`SidebarTrigger` from `@/components/ui/` (re-exported via Plan 1), `next-intl` (for register-patient page)

**Prerequisite:** Plan 1 must be complete — `src/components/ui/breadcrumb.tsx`, `src/components/ui/separator.tsx`, and `src/components/ui/sidebar.tsx` must exist as re-exports from `@ultranos/ui-kit`.

---

## File Map

| Action | Path |
|--------|------|
| Create | `apps/pharmacy-lite/src/components/TopHeader.tsx` |
| Create | `apps/pharmacy-lite/src/components/BreadcrumbHeader.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/queue/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/scan/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/history/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/paper-rx/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/settings/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/register-patient/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/sync/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/reports/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/inventory/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/controlled/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/unverified/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/pos/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/inventory/receive/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/inventory/catalog/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/inventory/suppliers/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/inventory/count/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/inventory/transfers/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/pos/cash-drawer/page.tsx` |
| Modify | `apps/pharmacy-lite/src/app/[locale]/pos/accounts/page.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx` |

---

## Task 1: Create TopHeader.tsx

- [ ] Write the failing test first.

  Create `apps/pharmacy-lite/src/__tests__/top-header.test.tsx` with this exact content:

  ```tsx
  import { render, screen } from '@testing-library/react'
  import { TopHeader } from '@/components/TopHeader'

  test('renders title', () => {
    render(<TopHeader title="Dashboard" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard')
  })

  test('renders description when provided', () => {
    render(<TopHeader title="Dashboard" description="Manage your pharmacy" />)
    expect(screen.getByText('Manage your pharmacy')).toBeInTheDocument()
  })

  test('omits description when not provided', () => {
    const { container } = render(<TopHeader title="Dashboard" />)
    expect(container.querySelector('p')).toBeNull()
  })
  ```

- [ ] Run the test to confirm it fails with "Cannot find module":

  ```bash
  pnpm -F pharmacy-lite test top-header
  ```

  Expected: FAIL with `Cannot find module '@/components/TopHeader'`

- [ ] Create `apps/pharmacy-lite/src/components/TopHeader.tsx` with this exact content:

  ```tsx
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

- [ ] Run the test to confirm it passes:

  ```bash
  pnpm -F pharmacy-lite test top-header
  ```

  Expected: PASS — 3 tests passing

- [ ] Commit:

  ```bash
  git add apps/pharmacy-lite/src/__tests__/top-header.test.tsx apps/pharmacy-lite/src/components/TopHeader.tsx
  git commit -m "feat(pharmacy-lite): add TopHeader component"
  ```

---

## Task 2: Create BreadcrumbHeader.tsx

- [ ] Write the failing test first.

  Create `apps/pharmacy-lite/src/__tests__/breadcrumb-header.test.tsx` with this exact content:

  ```tsx
  import { render, screen } from '@testing-library/react'
  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'

  // Mock sidebar context
  jest.mock('@/components/ui/sidebar', () => ({
    SidebarTrigger: () => <button aria-label="Toggle sidebar" />,
    useSidebar: () => ({ isMobile: false }),
  }))

  test('renders last crumb as current page (no link)', () => {
    render(
      <BreadcrumbHeader
        crumbs={[{ label: 'Inventory', href: '/inventory' }, { label: 'Receive Stock' }]}
      />
    )
    expect(screen.getByText('Receive Stock')).toBeInTheDocument()
    expect(screen.getByText('Inventory')).toBeInTheDocument()
  })

  test('renders breadcrumb link for non-last crumbs', () => {
    render(
      <BreadcrumbHeader
        crumbs={[{ label: 'Inventory', href: '/inventory' }, { label: 'Catalog' }]}
      />
    )
    const link = screen.getByRole('link', { name: 'Inventory' })
    expect(link).toHaveAttribute('href', '/inventory')
  })
  ```

- [ ] Run the test to confirm it fails with "Cannot find module":

  ```bash
  pnpm -F pharmacy-lite test breadcrumb-header
  ```

  Expected: FAIL with `Cannot find module '@/components/BreadcrumbHeader'`

- [ ] Create `apps/pharmacy-lite/src/components/BreadcrumbHeader.tsx` with this exact content:

  ```tsx
  import { SidebarTrigger } from '@/components/ui/sidebar'
  import { Separator } from '@/components/ui/separator'
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from '@/components/ui/breadcrumb'

  interface BreadcrumbCrumb {
    label: string
    href?: string
  }

  interface BreadcrumbHeaderProps {
    crumbs: BreadcrumbCrumb[]
  }

  export function BreadcrumbHeader({ crumbs }: BreadcrumbHeaderProps) {
    return (
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger className="-ms-1" />
        <Separator orientation="vertical" className="me-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <BreadcrumbItem key={crumb.label}>
                  {isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <>
                      <BreadcrumbLink href={crumb.href ?? '#'}>
                        {crumb.label}
                      </BreadcrumbLink>
                      <BreadcrumbSeparator />
                    </>
                  )}
                </BreadcrumbItem>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </header>
    )
  }
  ```

- [ ] Run the test to confirm it passes:

  ```bash
  pnpm -F pharmacy-lite test breadcrumb-header
  ```

  Expected: PASS — 2 tests passing

- [ ] Commit:

  ```bash
  git add apps/pharmacy-lite/src/__tests__/breadcrumb-header.test.tsx apps/pharmacy-lite/src/components/BreadcrumbHeader.tsx
  git commit -m "feat(pharmacy-lite): add BreadcrumbHeader component"
  ```

---

## Task 3: Replace inline headers in queue, scan, history, paper-rx pages

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/queue/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { PrescriptionQueueView } from '@/components/pharmacy/PrescriptionQueueView'

  export default function QueuePage() {
    return (
      <>
        <TopHeader title="Prescription Queue" />
        <PrescriptionQueueView />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/scan/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { PharmacyScannerView } from '@/components/pharmacy/PharmacyScannerView'

  export default function ScanPage() {
    return (
      <>
        <TopHeader title="Scan Prescription" />
        <PharmacyScannerView />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/history/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { DispensingHistoryView } from '@/components/pharmacy/DispensingHistoryView'

  export default function HistoryPage() {
    return (
      <>
        <TopHeader title="Dispensing History" />
        <DispensingHistoryView />
      </>
    )
  }
  ```

- [ ] Read `apps/pharmacy-lite/src/app/[locale]/paper-rx/page.tsx` to find the exact inline h2 header block and its wrapper div.

- [ ] In `apps/pharmacy-lite/src/app/[locale]/paper-rx/page.tsx`:
  - Add `import { TopHeader } from '@/components/TopHeader'` to the imports section.
  - Remove the entire inline div+h2 block that renders `Scan Paper Prescription` (and its wrapper `flex items-center justify-between` div).
  - Add `<TopHeader title="Paper Prescription" />` as the very first element in the return JSX, before any existing content.
  - Do not alter any other part of the file — ManualRxEntry and all other logic remains unchanged.

- [ ] Commit:

  ```bash
  git add apps/pharmacy-lite/src/app/[locale]/queue/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/scan/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/history/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/paper-rx/page.tsx
  git commit -m "refactor(pharmacy-lite): replace inline h2 headers with TopHeader in queue/scan/history/paper-rx pages"
  ```

---

## Task 4: Replace complex inline headers in settings and register-patient pages

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/settings/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'

  export default function SettingsPage() {
    return (
      <>
        <TopHeader title="Settings" />
        <PharmacySettingsView />
      </>
    )
  }
  ```

  Note: The back arrow link is removed — sidebar navigation provides context. The unused imports for `Link`, `DirectionalIcon`, and `ArrowLeft` are removed along with it.

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/register-patient/page.tsx`:

  ```tsx
  'use client'

  import { useSearchParams } from 'next/navigation'
  import { TopHeader } from '@/components/TopHeader'
  import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

  export default function RegisterPatientPage() {
    const searchParams = useSearchParams()
    const prefilledName = searchParams.get('nameGiven') ?? ''

    return (
      <>
        <TopHeader title="Register Patient" />
        <div className="mx-auto max-w-3xl px-4 pb-8">
          <PatientRegistrationForm prefilledNameGiven={prefilledName} />
        </div>
      </>
    )
  }
  ```

  Note: `useTranslations` import is removed — `TopHeader` uses a hardcoded English string, matching admin-portal's pattern of English group labels. The `max-w-3xl` container moves to wrap only the form, not the `TopHeader`.

- [ ] Commit:

  ```bash
  git add apps/pharmacy-lite/src/app/[locale]/settings/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/register-patient/page.tsx
  git commit -m "refactor(pharmacy-lite): replace complex inline headers in settings and register-patient pages"
  ```

---

## Task 5: Add TopHeader to pages that delegate to components

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { PharmacyDashboard } from '@/components/pharmacy/PharmacyDashboard'

  export default function PharmacyHomePage() {
    return (
      <>
        <TopHeader title="Dashboard" />
        <PharmacyDashboard />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/sync/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { SyncQueueDashboard } from '@/components/pharmacy/SyncQueueDashboard'

  export default function SyncPage() {
    return (
      <>
        <TopHeader title="Sync Queue" description="Offline sync status and queue management." />
        <SyncQueueDashboard />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/reports/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { ReportsPage } from '@/components/pharmacy/reports/ReportsPage'

  export default function ReportsRoute() {
    return (
      <>
        <TopHeader title="Reports" />
        <ReportsPage />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/inventory/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { StockOverviewPage } from '@/components/pharmacy/inventory/StockOverviewPage'

  export default function InventoryRoute() {
    return (
      <>
        <TopHeader title="Inventory" />
        <StockOverviewPage />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/controlled/page.tsx`:

  ```tsx
  import { TopHeader } from '@/components/TopHeader'
  import { ControlledSubstancesView } from '@/components/pharmacy/ControlledSubstancesView'

  export default function ControlledPage() {
    return (
      <>
        <TopHeader title="Controlled Substances" />
        <ControlledSubstancesView />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/unverified/page.tsx`:

  ```tsx
  import { TopHeader } from '@/components/TopHeader'
  import { UnverifiedDispensesView } from '@/components/pharmacy/UnverifiedDispensesView'

  export default function UnverifiedPage() {
    return (
      <>
        <TopHeader title="Unverified Dispenses" />
        <UnverifiedDispensesView />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/pos/page.tsx`:

  ```tsx
  'use client'

  import { TopHeader } from '@/components/TopHeader'
  import { PosPage } from '@/components/pharmacy/pos/PosPage'

  export default function PosRoute() {
    return (
      <>
        <TopHeader title="Point of Sale" />
        <PosPage />
      </>
    )
  }
  ```

- [ ] Commit:

  ```bash
  git add apps/pharmacy-lite/src/app/[locale]/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/sync/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/reports/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/inventory/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/controlled/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/unverified/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/pos/page.tsx
  git commit -m "feat(pharmacy-lite): add TopHeader to all top-level page routes"
  ```

---

## Task 6: Add BreadcrumbHeader to sub-pages

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/inventory/receive/page.tsx`:

  ```tsx
  'use client'

  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
  import { ReceiveStockPage } from '@/components/pharmacy/inventory/ReceiveStockPage'

  export default function ReceiveStockRoute() {
    return (
      <>
        <BreadcrumbHeader
          crumbs={[
            { label: 'Inventory', href: '/inventory' },
            { label: 'Receive Stock' },
          ]}
        />
        <ReceiveStockPage />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/inventory/catalog/page.tsx`:

  ```tsx
  'use client'

  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
  import { CatalogBrowsePage } from '@/components/pharmacy/inventory/CatalogBrowsePage'

  export default function CatalogRoute() {
    return (
      <>
        <BreadcrumbHeader
          crumbs={[
            { label: 'Inventory', href: '/inventory' },
            { label: 'Catalog' },
          ]}
        />
        <CatalogBrowsePage />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/inventory/suppliers/page.tsx`:

  ```tsx
  'use client'

  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
  import { SuppliersPage } from '@/components/pharmacy/procurement/SuppliersPage'

  export default function SuppliersRoute() {
    return (
      <>
        <BreadcrumbHeader
          crumbs={[
            { label: 'Inventory', href: '/inventory' },
            { label: 'Suppliers' },
          ]}
        />
        <SuppliersPage />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/inventory/count/page.tsx`:

  ```tsx
  'use client'

  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
  import { StockCountPage } from '@/components/pharmacy/procurement/StockCountPage'

  export default function StockCountRoute() {
    return (
      <>
        <BreadcrumbHeader
          crumbs={[
            { label: 'Inventory', href: '/inventory' },
            { label: 'Stock Count' },
          ]}
        />
        <StockCountPage />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/inventory/transfers/page.tsx`:

  ```tsx
  'use client'

  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
  import { TransfersPage } from '@/components/pharmacy/transfers/TransfersPage'

  export default function TransfersRoute() {
    return (
      <>
        <BreadcrumbHeader
          crumbs={[
            { label: 'Inventory', href: '/inventory' },
            { label: 'Transfers' },
          ]}
        />
        <TransfersPage />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/pos/cash-drawer/page.tsx`:

  ```tsx
  'use client'

  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
  import { CashDrawerPage } from '@/components/pharmacy/pos/CashDrawerPage'

  export default function CashDrawerRoute() {
    return (
      <>
        <BreadcrumbHeader
          crumbs={[
            { label: 'Point of Sale', href: '/pos' },
            { label: 'Cash Drawer' },
          ]}
        />
        <CashDrawerPage />
      </>
    )
  }
  ```

- [ ] Replace the full content of `apps/pharmacy-lite/src/app/[locale]/pos/accounts/page.tsx`:

  ```tsx
  'use client'

  import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
  import { PatientAccountsPage } from '@/components/pharmacy/pos/PatientAccountsPage'

  export default function PatientAccountsRoute() {
    return (
      <>
        <BreadcrumbHeader
          crumbs={[
            { label: 'Point of Sale', href: '/pos' },
            { label: 'Patient Accounts' },
          ]}
        />
        <PatientAccountsPage />
      </>
    )
  }
  ```

- [ ] Commit:

  ```bash
  git add apps/pharmacy-lite/src/app/[locale]/inventory/receive/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/inventory/catalog/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/inventory/suppliers/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/inventory/count/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/inventory/transfers/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/pos/cash-drawer/page.tsx \
          apps/pharmacy-lite/src/app/[locale]/pos/accounts/page.tsx
  git commit -m "feat(pharmacy-lite): add BreadcrumbHeader to inventory and POS sub-pages"
  ```

---

## Task 7: Remove PharmacyDashboard inline welcome header

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx` to locate the exact lines of the inline welcome header block.

- [ ] Remove the entire `<div className="mb-8 flex items-center justify-between">...</div>` welcome block, which contains:

  ```tsx
  <div className="mb-8 flex items-center justify-between">
    <div>
      <h2 className="text-xl font-bold text-neutral-900">
        Welcome, {pharmacistName}
      </h2>
      <p className="text-sm text-neutral-500">Pharmacy Dashboard</p>
    </div>
    <div
      data-testid="connectivity-indicator"
      className="flex items-center gap-2"
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          isOnline ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className="text-xs text-neutral-500">
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  </div>
  ```

- [ ] Keep everything else unchanged — stats cards, action hub, queue cards, and all other sections remain exactly as they are.

  Note: The `data-testid="connectivity-indicator"` is removed along with the welcome header. The SyncPulse in the sidebar footer already shows sync status. If any snapshot tests reference `data-testid="connectivity-indicator"`, they will be updated in Task 8's snapshot regeneration step.

- [ ] Commit:

  ```bash
  git add apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx
  git commit -m "refactor(pharmacy-lite): remove inline welcome header from PharmacyDashboard"
  ```

---

## Task 8: Verify Plan 3

- [ ] Run typecheck and confirm no new errors:

  ```bash
  pnpm -F pharmacy-lite typecheck 2>&1 | grep "error TS" | grep -v "__tests__"
  ```

  Expected: no output (no new errors).

- [ ] Run all tests:

  ```bash
  pnpm -F pharmacy-lite test 2>&1 | tail -15
  ```

  Expected: `top-header.test.tsx` and `breadcrumb-header.test.tsx` PASS. Snapshot tests for `PharmacyDashboard` may fail because the welcome header block was removed.

- [ ] If snapshot tests fail due to the removed welcome block, update them:

  ```bash
  pnpm -F pharmacy-lite test -- --update-snapshots 2>&1 | tail -10
  ```

  Expected: snapshots updated, all tests PASS.

- [ ] Run the build:

  ```bash
  pnpm -F pharmacy-lite build 2>&1 | tail -15
  ```

  Expected: successful build with no errors.

- [ ] If build fails with `Cannot find module '@/components/ui/breadcrumb'`, create the re-export (Plan 1 Task 6 was not completed):

  Create `apps/pharmacy-lite/src/components/ui/breadcrumb.tsx`:

  ```tsx
  export * from '@ultranos/ui-kit/components/ui/breadcrumb'
  ```

- [ ] If build fails with `Cannot find module '@/components/ui/separator'`, create the re-export:

  Create `apps/pharmacy-lite/src/components/ui/separator.tsx`:

  ```tsx
  export * from '@ultranos/ui-kit/components/ui/separator'
  ```

- [ ] Manual verification — run `pnpm -F pharmacy-lite dev` and confirm:
  - Every page has a `<h1>` title in consistent `text-2xl font-semibold tracking-tight text-foreground` style.
  - Sub-pages (`inventory/receive`, `pos/cash-drawer`) show a breadcrumb bar with the sidebar trigger button.
  - Dashboard no longer shows the "Welcome, {name}" block.
  - Login page is unchanged (no `TopHeader`).
