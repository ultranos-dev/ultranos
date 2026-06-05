# EmptyState Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared `EmptyState` component in `packages/ui-kit` and migrate all ad-hoc empty state patterns across all four spoke apps to use it.

**Architecture:** Single component at `packages/ui-kit/src/components/ui/empty-state.tsx`, exported via both the barrel (`packages/ui-kit/src/index.ts`) and a subpath (`@ultranos/ui-kit/components/ui/empty-state`). Two sizes: `md` (vertical centered, card sections) and `sm` (horizontal row, compact widgets). The pharmacy-lite local `EmptyState.tsx` is deleted after migration.

**Tech Stack:** React, TypeScript, Tailwind CSS v3, Lucide icons (via `@ultranos/ui-kit/icons`), Vitest + @testing-library/react for tests.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `packages/ui-kit/src/icons.ts` — add `Inbox` export |
| Create | `packages/ui-kit/src/components/ui/empty-state.tsx` |
| Create | `packages/ui-kit/src/__tests__/EmptyState.test.tsx` |
| Modify | `packages/ui-kit/src/index.ts` — add export |
| Modify | `packages/ui-kit/package.json` — add subpath export |
| Delete | `apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx` |
| Create | `apps/admin-portal/src/components/ui/empty-state.tsx` — proxy |
| Create | `apps/pharmacy-lite/src/components/ui/empty-state.tsx` — proxy |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx` |
| Modify | `apps/lab-lite/src/components/authorization/AuthorizationQueue.tsx` |
| Modify | `apps/lab-lite/src/components/workload/WorkloadDashboard.tsx` |
| Modify | `apps/lab-lite/src/components/procurement/MyOrdersView.tsx` |
| Modify | `apps/lab-lite/src/components/certification/CertificationDashboard.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/alerts/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/certifications/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/inventory/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/inventory/suppliers/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/labs/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/network/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/providers/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/providers/profile/[practitionerId]/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/staff/[practitionerId]/certifications/page.tsx` |
| Modify | `apps/admin-portal/src/app/[locale]/patients/merge/page.tsx` |
| Modify | `apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx` |
| Modify | `apps/admin-portal/src/components/inventory/HeatMapGrid.tsx` |
| Modify | `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx` |
| Modify | `apps/opd-lite/src/components/clinical/LabResultsList.tsx` |
| Modify | `apps/opd-lite/src/components/clinical/PatientResultTimeline.tsx` |
| Modify | `apps/opd-lite/src/components/duplicate-review/DuplicateReviewTable.tsx` |
| Modify | `apps/opd-lite/src/components/NotificationPanel.tsx` |
| Modify | `apps/opd-lite/src/components/notifications/NotificationCenter.tsx` |
| Modify | `apps/opd-lite/src/components/patient-result-list.tsx` |
| Modify | `apps/opd-lite/src/components/SyncDashboard.tsx` |

---

## Task 1: Add `Inbox` to the icons catalog

The `EmptyState` component uses `Inbox` as the default fallback icon. It is not currently in the catalog.

**Files:**
- Modify: `packages/ui-kit/src/icons.ts`

- [ ] **Step 1: Add Inbox to the Communication section**

In `packages/ui-kit/src/icons.ts`, find the Communication section (contains `Mail`, `MailCheck`, `MailOpen`). Add `Inbox` to that export block:

```ts
// BEFORE
export {
  MessageSquare,
  MessageCircle,
  Languages,
  QrCode,
  Mail,
  MailCheck,
  MailOpen,
} from 'lucide-react'

// AFTER
export {
  MessageSquare,
  MessageCircle,
  Languages,
  QrCode,
  Mail,
  MailCheck,
  MailOpen,
  Inbox,
} from 'lucide-react'
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui-kit/src/icons.ts
git commit -m "feat(ui-kit): add Inbox icon to catalog"
```

---

## Task 2: Write failing tests

Write all tests before touching implementation. Run them first to confirm they fail with "cannot find module".

**Files:**
- Create: `packages/ui-kit/src/__tests__/EmptyState.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../components/ui/empty-state.js'
import { Users } from '../icons.js'

describe('EmptyState', () => {
  it('snapshot — md size, all props', () => {
    const { container } = render(
      <EmptyState
        icon={Users}
        title="No patients found"
        description="Try adjusting your search or filters."
        action={{ label: 'Clear filters', onClick: vi.fn() }}
        size="md"
      />,
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('snapshot — sm size with all props', () => {
    const { container } = render(
      <EmptyState
        icon={Users}
        title="No prescriptions"
        description="Nothing dispensed today."
        action={{ label: 'Clear', onClick: vi.fn() }}
        size="sm"
      />,
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('uses Inbox icon as fallback when icon prop is omitted', () => {
    const { container } = render(<EmptyState title="No records yet" />)
    const svgEl = container.querySelector('svg[aria-hidden="true"]')
    expect(svgEl).not.toBeNull()
  })

  it('renders no button when action prop is omitted', () => {
    render(<EmptyState title="No results" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('snapshot — RTL md', () => {
    const { container } = render(
      <div dir="rtl">
        <EmptyState
          title="لا توجد نتائج"
          description="حاول تعديل بحثك."
          action={{ label: 'مسح', onClick: vi.fn() }}
          size="md"
        />
      </div>,
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('snapshot — RTL sm', () => {
    const { container } = render(
      <div dir="rtl">
        <EmptyState
          title="لا توجد وصفات"
          description="لم يتم صرف أي شيء اليوم."
          action={{ label: 'مسح', onClick: vi.fn() }}
          size="sm"
        />
      </div>,
    )
    expect(container.firstChild).toMatchSnapshot()
  })

  it('action button is a <button> element with a visible label', () => {
    render(
      <EmptyState
        title="No results"
        action={{ label: 'Clear filters', onClick: vi.fn() }}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Clear filters' }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose EmptyState
```

Expected: `FAIL` — `Error: Cannot find module '../components/ui/empty-state.js'`

---

## Task 3: Implement the EmptyState component

**Files:**
- Create: `packages/ui-kit/src/components/ui/empty-state.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import * as React from 'react'
import { Inbox, type LucideIcon } from '../../icons.js'
import { Button } from './button.js'
import { cn } from '../../lib/utils.js'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Primary message — required */
  title: string
  /** Supporting text below title */
  description?: string
  /** Any Lucide icon component. Defaults to `Inbox`. */
  icon?: LucideIcon
  /** Renders a single CTA button */
  action?: { label: string; onClick: () => void }
  /** `'md'` — vertical centered (default). `'sm'` — horizontal compact. */
  size?: 'md' | 'sm'
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  size = 'md',
  className,
  ...props
}: EmptyStateProps) {
  if (size === 'sm') {
    return (
      <div
        className={cn('flex items-center gap-2.5 p-4', className)}
        {...props}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-[13px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action && (
          <Button
            variant="outline"
            size="xs"
            onClick={action.onClick}
            className="ms-auto shrink-0"
          >
            {action.label}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4 py-8 text-center',
        className,
      )}
      {...props}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button
          variant="outline"
          size="sm"
          onClick={action.onClick}
          className="mt-1"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests — all should pass**

```bash
pnpm --filter @ultranos/ui-kit test -- --reporter=verbose EmptyState
```

Expected: `PASS` — 7 tests pass. Snapshot files are created at `packages/ui-kit/src/__tests__/__snapshots__/EmptyState.test.tsx.snap`.

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/components/ui/empty-state.tsx \
        packages/ui-kit/src/__tests__/EmptyState.test.tsx \
        packages/ui-kit/src/__tests__/__snapshots__/EmptyState.test.tsx.snap
git commit -m "feat(ui-kit): add EmptyState component with tests"
```

---

## Task 4: Register exports and rebuild

**Files:**
- Modify: `packages/ui-kit/src/index.ts`
- Modify: `packages/ui-kit/package.json`

- [ ] **Step 1: Add barrel export to `packages/ui-kit/src/index.ts`**

Add this line after the `PasswordStrengthBar` export (line 68):

```ts
export { EmptyState } from './components/ui/empty-state.js'
export type { EmptyStateProps } from './components/ui/empty-state.js'
```

- [ ] **Step 2: Add subpath export to `packages/ui-kit/package.json`**

In the `"exports"` object, add after the `"./components/ui/tooltip"` entry:

```json
"./components/ui/empty-state": "./src/components/ui/empty-state.tsx"
```

- [ ] **Step 3: Rebuild ui-kit**

```bash
pnpm --filter @ultranos/ui-kit build
```

Expected: exits 0 with no TypeScript errors. The `dist/` folder is updated.

- [ ] **Step 4: Commit**

```bash
git add packages/ui-kit/src/index.ts packages/ui-kit/package.json
git commit -m "feat(ui-kit): export EmptyState via barrel and subpath"
```

---

## Task 5: Migrate pharmacy-lite

The pharmacy-lite app has its own `EmptyState.tsx` with a string-keyed icon map and `actionHref` support. We delete it and switch its two callers to the ui-kit version. We also migrate `FulfillmentChecklist.tsx` which has its own ad-hoc dashed-border empty state.

**Files:**
- Delete: `apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx`
- Create: `apps/pharmacy-lite/src/components/ui/empty-state.tsx` (proxy)
- Modify: `apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`

- [ ] **Step 1: Create pharmacy-lite proxy file**

Create `apps/pharmacy-lite/src/components/ui/empty-state.tsx`:

```ts
export { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
export type { EmptyStateProps } from '@ultranos/ui-kit/components/ui/empty-state'
```

- [ ] **Step 2: Delete the local EmptyState.tsx**

```bash
rm apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx
```

- [ ] **Step 3: Update `PrescriptionQueueView.tsx`**

File: `apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx`

The old import (line 10):
```ts
import { EmptyState } from './EmptyState'
```

Replace with:
```ts
import { EmptyState } from '@/components/ui/empty-state'
import { List } from '@ultranos/ui-kit/icons'
```

The old usage (lines 175–182):
```tsx
<EmptyState
  icon="queue"
  title={emptyMessages[activeTab]}
  description={activeTab === 'active' ? 'Scan a prescription QR code to start filling orders.' : 'Completed and failed items will appear here.'}
  actionLabel={activeTab === 'active' ? 'Scan Prescription' : undefined}
  actionHref={activeTab === 'active' ? '/scan' : undefined}
/>
```

Replace with:
```tsx
<EmptyState
  icon={List}
  title={emptyMessages[activeTab]}
  description={activeTab === 'active' ? 'Scan a prescription QR code to start filling orders.' : 'Completed and failed items will appear here.'}
  action={activeTab === 'active' ? { label: 'Scan Prescription', onClick: () => router.push('/scan') } : undefined}
/>
```

(`router` is already imported and used in this component.)

- [ ] **Step 4: Update `RecentDispensingList.tsx`**

File: `apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx`

Add `useRouter` to imports. The file currently starts with:
```ts
'use client'

import { useTranslations } from 'next-intl'
import { EmptyState } from './EmptyState'
```

Replace with:
```ts
'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { Bookmark } from '@ultranos/ui-kit/icons'
```

Add `const router = useRouter()` inside the `RecentDispensingList` function, right after the `const t = useTranslations(...)` line.

The old usage (lines 52–59):
```tsx
<EmptyState
  icon="dispensing"
  title={t('noActivityToday')}
  description={t('noActivityDescription')}
  actionLabel={t('startScanning')}
  actionHref="/scan"
/>
```

Replace with:
```tsx
<EmptyState
  icon={Bookmark}
  title={t('noActivityToday')}
  description={t('noActivityDescription')}
  action={{ label: t('startScanning'), onClick: () => router.push('/scan') }}
  size="sm"
/>
```

- [ ] **Step 5: Update `FulfillmentChecklist.tsx`**

File: `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`

Add import at the top of the imports section:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

The old empty state (around line 33):
```tsx
<div data-testid="fulfillment-empty-state" className="rounded-2xl border border-border p-8 text-center">
  <p className="text-muted-foreground">{t('emptyState')}</p>
</div>
```

Replace with:
```tsx
<EmptyState data-testid="fulfillment-empty-state" title={t('emptyState')} />
```

- [ ] **Step 6: Run pharmacy-lite tests**

```bash
pnpm --filter pharmacy-lite test
```

Expected: all tests pass. The `PrescriptionQueueView` test at `shows empty state when no items in tab` still passes because it checks for the title text, not the old component structure. The `FulfillmentChecklist` test for `getByTestId('fulfillment-empty-state')` still passes because `data-testid` is spread onto the root div.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmacy-lite/src/components/ui/empty-state.tsx \
        apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx \
        apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx \
        apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx
git rm apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx
git commit -m "feat(pharmacy-lite): migrate to ui-kit EmptyState, delete local component"
```

---

## Task 6: Migrate lab-lite

Lab-lite has two files with private inline `EmptyState` functions and two files with ad-hoc icon+text empty state divs.

**Files:**
- Modify: `apps/lab-lite/src/components/authorization/AuthorizationQueue.tsx`
- Modify: `apps/lab-lite/src/components/workload/WorkloadDashboard.tsx`
- Modify: `apps/lab-lite/src/components/procurement/MyOrdersView.tsx`
- Modify: `apps/lab-lite/src/components/certification/CertificationDashboard.tsx`

- [ ] **Step 1: Update `AuthorizationQueue.tsx`**

File: `apps/lab-lite/src/components/authorization/AuthorizationQueue.tsx`

Add import at the top of the imports section:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { CircleCheck } from '@ultranos/ui-kit/icons'
```

Delete the entire private `EmptyState` function (approximately 8 lines):
```tsx
function EmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <CircleCheck size={56} className="mb-4 text-green-400" aria-hidden="true" />
      <p className="text-lg font-medium">{t('emptyTitle')}</p>
      <p className="mt-1 text-sm">{t('emptySubtitle')}</p>
    </div>
  )
}
```

The call site in the JSX uses `<EmptyState t={t} />`. Replace it with:
```tsx
<EmptyState
  icon={CircleCheck}
  title={t('emptyTitle')}
  description={t('emptySubtitle')}
/>
```

Also remove the now-unused `CircleCheck` import from whatever icon source it was in (`lucide-react` or `@ultranos/ui-kit/icons`) — since we now import it from `@ultranos/ui-kit/icons` above, check the existing imports and remove the duplicate.

- [ ] **Step 2: Update `WorkloadDashboard.tsx`**

File: `apps/lab-lite/src/components/workload/WorkloadDashboard.tsx`

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

Delete the private `EmptyState` function:
```tsx
function EmptyState({ t }: { t: ReturnType<typeof useTranslations<'workload'>> }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">{t('noAssignments')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('noAssignmentsHint')}</p>
    </div>
  )
}
```

Replace the call site `<EmptyState t={t} />` with:
```tsx
<EmptyState
  title={t('noAssignments')}
  description={t('noAssignmentsHint')}
  size="sm"
/>
```

- [ ] **Step 3: Update `MyOrdersView.tsx`**

File: `apps/lab-lite/src/components/procurement/MyOrdersView.tsx`

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Package } from '@ultranos/ui-kit/icons'
```

Remove the now-duplicate `Package` import from wherever it was imported (likely `lucide-react` or another path).

The old empty state (around line 268):
```tsx
<div className="flex flex-col items-center gap-2 py-12 text-gray-400">
  <Package size={40} />
  <p className="text-sm">{t(`orders.empty.${tab}`)}</p>
</div>
```

Replace with:
```tsx
<EmptyState
  icon={Package}
  title={t(`orders.empty.${tab}`)}
/>
```

- [ ] **Step 4: Update `CertificationDashboard.tsx`**

File: `apps/lab-lite/src/components/certification/CertificationDashboard.tsx`

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Award } from '@ultranos/ui-kit/icons'
```

Remove duplicate `Award` import from its current source.

The old empty state (around line 92):
```tsx
<div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
  <Award size={48} className="text-gray-300 dark:text-gray-600" />
  <p className="text-gray-500 dark:text-gray-400">{t('noCertificationPaths')}</p>
  <p className="text-sm text-gray-400 dark:text-gray-500">{t('noCertificationPathsHint')}</p>
</div>
```

Replace with:
```tsx
<EmptyState
  icon={Award}
  title={t('noCertificationPaths')}
  description={t('noCertificationPathsHint')}
/>
```

- [ ] **Step 5: Commit**

```bash
git add apps/lab-lite/src/components/authorization/AuthorizationQueue.tsx \
        apps/lab-lite/src/components/workload/WorkloadDashboard.tsx \
        apps/lab-lite/src/components/procurement/MyOrdersView.tsx \
        apps/lab-lite/src/components/certification/CertificationDashboard.tsx
git commit -m "feat(lab-lite): migrate to ui-kit EmptyState"
```

---

## Task 7: Migrate admin-portal

Admin-portal has ~13 ad-hoc empty states. All are text-only dashed-border boxes (`<div className="...border-dashed...p-8 text-center"><p>...</p></div>`). Replace each with `<EmptyState title="..." />` (no icon passed — `Inbox` fallback renders automatically).

**Files:**
- Create: `apps/admin-portal/src/components/ui/empty-state.tsx` (proxy)
- Modify: 13 pages/components listed below

- [ ] **Step 1: Create admin-portal proxy**

Create `apps/admin-portal/src/components/ui/empty-state.tsx`:

```ts
export { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
export type { EmptyStateProps } from '@ultranos/ui-kit/components/ui/empty-state'
```

- [ ] **Step 2: `apps/admin-portal/src/app/[locale]/alerts/page.tsx`**

Add import at the top of file imports:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No anomaly alerts found{filter !== 'ALL' ? ` with status ${filter.toLowerCase()}` : ''}.</p>
</div>
```

With:
```tsx
<EmptyState className="mt-6" title={`No anomaly alerts found${filter !== 'ALL' ? ` with status ${filter.toLowerCase()}` : ''}.`} />
```

- [ ] **Step 3: `apps/admin-portal/src/app/[locale]/certifications/page.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No certification pathways found{filter !== 'ALL' ? ` with status ${filter}` : ''}.</p>
</div>
```

With:
```tsx
<EmptyState className="mt-6" title={`No certification pathways found${filter !== 'ALL' ? ` with status ${filter}` : ''}.`} />
```

- [ ] **Step 4: `apps/admin-portal/src/app/[locale]/inventory/page.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No purchase orders yet.</p>
</div>
```

With:
```tsx
<EmptyState title="No purchase orders yet." />
```

- [ ] **Step 5: `apps/admin-portal/src/app/[locale]/inventory/suppliers/page.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No suppliers registered yet.</p>
</div>
```

With:
```tsx
<EmptyState className="mt-6" title="No suppliers registered yet." />
```

- [ ] **Step 6: `apps/admin-portal/src/app/[locale]/labs/page.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No lab registrations found{filter !== 'ALL' ? ` with status ${filter}` : ''}.</p>
</div>
```

With:
```tsx
<EmptyState className="mt-6" title={`No lab registrations found${filter !== 'ALL' ? ` with status ${filter}` : ''}.`} />
```

- [ ] **Step 7: `apps/admin-portal/src/app/[locale]/network/page.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">
    No labs found{filter !== 'ALL' ? ` with status ${filter}` : ''}.
  </p>
</div>
```

With:
```tsx
<EmptyState className="mt-6" title={`No labs found${filter !== 'ALL' ? ` with status ${filter}` : ''}.`} />
```

- [ ] **Step 8: `apps/admin-portal/src/app/[locale]/providers/page.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No pending KYC submissions{filter !== 'ALL' ? ` matching filter "${FILTER_LABELS[filter]}"` : ''}.</p>
</div>
```

With:
```tsx
<EmptyState className="mt-6" title={`No pending KYC submissions${filter !== 'ALL' ? ` matching filter "${FILTER_LABELS[filter]}"` : ''}.`} />
```

- [ ] **Step 9: `apps/admin-portal/src/app/[locale]/providers/profile/[practitionerId]/page.tsx`**

This file has two empty states. Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace first occurrence:
```tsx
<div className="mt-4 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No KYC submissions found.</p>
</div>
```
With:
```tsx
<EmptyState className="mt-4" title="No KYC submissions found." />
```

Replace second occurrence:
```tsx
<div className="mt-4 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No prescribing alerts.</p>
</div>
```
With:
```tsx
<EmptyState className="mt-4" title="No prescribing alerts." />
```

- [ ] **Step 10: `apps/admin-portal/src/app/[locale]/staff/[practitionerId]/certifications/page.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No certification pathways assigned to this practitioner.</p>
</div>
```
With:
```tsx
<EmptyState title="No certification pathways assigned to this practitioner." />
```

- [ ] **Step 11: `apps/admin-portal/src/app/[locale]/patients/merge/page.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="rounded-3xl border border-dashed border-border bg-card p-6 text-center">
  <p className="text-sm text-muted-foreground">
    No survivor selected. Navigate from a patient detail page or provide a <code className="text-xs bg-card rounded px-1">?survivor=</code> URL parameter.
  </p>
</div>
```
With:
```tsx
<EmptyState
  title="No survivor selected."
  description="Navigate from a patient detail page or provide a ?survivor= URL parameter."
/>
```

- [ ] **Step 12: `apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="mt-6 rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">
    No surveillance alerts found{filter !== 'ALL' ? ` with status ${filter.toLowerCase()}` : ''}.
  </p>
</div>
```
With:
```tsx
<EmptyState className="mt-6" title={`No surveillance alerts found${filter !== 'ALL' ? ` with status ${filter.toLowerCase()}` : ''}.`} />
```

- [ ] **Step 13: `apps/admin-portal/src/components/inventory/HeatMapGrid.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
  <p className="text-muted-foreground">No inventory data available. Stock snapshots will appear here once labs report their reagent levels.</p>
</div>
```
With:
```tsx
<EmptyState
  title="No inventory data available."
  description="Stock snapshots will appear here once labs report their reagent levels."
/>
```

- [ ] **Step 14: `apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx`**

Add import:
```ts
import { EmptyState } from '@/components/ui/empty-state'
```

Replace:
```tsx
<div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
  <p className="text-muted-foreground">You&apos;re subscribed to all available modules.</p>
</div>
```
With:
```tsx
<EmptyState className="mt-4" title="You're subscribed to all available modules." />
```

- [ ] **Step 15: Commit**

```bash
git add apps/admin-portal/src/components/ui/empty-state.tsx \
        apps/admin-portal/src/app/\[locale\]/alerts/page.tsx \
        apps/admin-portal/src/app/\[locale\]/certifications/page.tsx \
        apps/admin-portal/src/app/\[locale\]/inventory/page.tsx \
        apps/admin-portal/src/app/\[locale\]/inventory/suppliers/page.tsx \
        apps/admin-portal/src/app/\[locale\]/labs/page.tsx \
        apps/admin-portal/src/app/\[locale\]/network/page.tsx \
        apps/admin-portal/src/app/\[locale\]/providers/page.tsx \
        "apps/admin-portal/src/app/[locale]/providers/profile/[practitionerId]/page.tsx" \
        "apps/admin-portal/src/app/[locale]/staff/[practitionerId]/certifications/page.tsx" \
        apps/admin-portal/src/app/\[locale\]/patients/merge/page.tsx \
        apps/admin-portal/src/components/alerts/SurveillanceAlertHistory.tsx \
        apps/admin-portal/src/components/inventory/HeatMapGrid.tsx \
        apps/admin-portal/src/components/subscriptions/AddModuleDialog.tsx
git commit -m "feat(admin-portal): migrate to ui-kit EmptyState"
```

---

## Task 8: Migrate OPD-lite

OPD-lite has 7 text-only inline empty states. These are compact in-panel contexts — use `size="sm"` throughout. Import directly from `@ultranos/ui-kit/components/ui/empty-state` (the local `src/components/ui/` directory uses a different custom `Button.tsx` implementation, so do not create a proxy there).

**Files:**
- Modify: `apps/opd-lite/src/components/clinical/LabResultsList.tsx`
- Modify: `apps/opd-lite/src/components/clinical/PatientResultTimeline.tsx`
- Modify: `apps/opd-lite/src/components/duplicate-review/DuplicateReviewTable.tsx`
- Modify: `apps/opd-lite/src/components/NotificationPanel.tsx`
- Modify: `apps/opd-lite/src/components/notifications/NotificationCenter.tsx`
- Modify: `apps/opd-lite/src/components/patient-result-list.tsx`
- Modify: `apps/opd-lite/src/components/SyncDashboard.tsx`

- [ ] **Step 1: `LabResultsList.tsx`**

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

Replace (the `reports.length === 0` branch, around line 153):
```tsx
<div className="py-4 text-center text-sm text-muted-foreground">
  No lab results available for this patient.
</div>
```
With:
```tsx
<EmptyState title="No lab results available for this patient." size="sm" />
```

- [ ] **Step 2: `PatientResultTimeline.tsx`**

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

Replace (the `groups.length === 0` branch, around line 345):
```tsx
<div className="py-4 text-center text-sm text-muted-foreground" data-testid="timeline-empty">
  No lab results available for this patient.
</div>
```
With:
```tsx
<EmptyState
  data-testid="timeline-empty"
  title="No lab results available for this patient."
  size="sm"
/>
```

- [ ] **Step 3: `DuplicateReviewTable.tsx`**

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

Replace:
```tsx
<p className="py-12 text-center text-sm text-muted-foreground">{t('noReviews')}</p>
```
With:
```tsx
<EmptyState title={t('noReviews')} />
```

(This is a table-level empty state replacing the whole table, so `md` size is appropriate here despite being inline.)

- [ ] **Step 4: `NotificationPanel.tsx`**

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

Replace the `notifications.length === 0` empty state div (around line 167):
```tsx
<div className="px-4 py-8 text-center text-sm text-muted-foreground">
  No notifications
</div>
```
With:
```tsx
<EmptyState title="No notifications" size="sm" />
```

- [ ] **Step 5: `NotificationCenter.tsx`**

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

Replace the `filtered.length === 0` empty state (around line 198):
```tsx
<div className="py-12 text-center text-sm text-muted-foreground">
  No notifications
</div>
```
With:
```tsx
<EmptyState title="No notifications" size="sm" />
```

- [ ] **Step 6: `patient-result-list.tsx`**

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

Replace:
```tsx
<div className="py-8 text-center text-sm text-muted-foreground">
  {t('noResults')}
</div>
```
With:
```tsx
<EmptyState title={t('noResults')} size="sm" />
```

- [ ] **Step 7: `SyncDashboard.tsx`**

Add import:
```ts
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
```

Replace:
```tsx
<div className="px-5 py-12 text-center text-sm text-muted-foreground">
  All synced — no pending items
</div>
```
With:
```tsx
<EmptyState title="All synced — no pending items" size="sm" />
```

- [ ] **Step 8: Commit**

```bash
git add apps/opd-lite/src/components/clinical/LabResultsList.tsx \
        apps/opd-lite/src/components/clinical/PatientResultTimeline.tsx \
        apps/opd-lite/src/components/duplicate-review/DuplicateReviewTable.tsx \
        apps/opd-lite/src/components/NotificationPanel.tsx \
        apps/opd-lite/src/components/notifications/NotificationCenter.tsx \
        apps/opd-lite/src/components/patient-result-list.tsx \
        apps/opd-lite/src/components/SyncDashboard.tsx
git commit -m "feat(opd-lite): migrate to ui-kit EmptyState"
```

---

## Task 9: Full test suite and type-check

Verify nothing broke across the monorepo.

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: all tests pass. If a snapshot test fails because of the EmptyState migration (the component renders differently than a raw div), update the affected snapshot:

```bash
pnpm --filter <app-name> test -- --update-snapshots
```

- [ ] **Step 2: TypeScript check**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit snapshot updates if any**

If snapshot files changed:

```bash
git add "**/__snapshots__/*.snap"
git commit -m "test: update snapshots after EmptyState migration"
```
