# Pharmacy Lite — Plan 4: Component Token Sweep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded Tailwind color classes in pharmacy-lite's 35+ components with semantic oklch tokens from the ui-kit design system, giving the app consistent dark mode support and visual parity with admin-portal.

**Architecture:** Mechanical search-and-replace of hardcoded neutral/status colors with semantic tokens, migration of inline badge spans to the shadcn `Badge` component, update of card container classes to `rounded-2xl bg-card border border-border shadow-card`, and button variant rename (`danger`→`destructive`). Snapshot tests are regenerated at the end — this is expected and acceptable.

**Tech Stack:** Tailwind CSS v3 with ui-kit preset (semantic tokens from Plan 1), shadcn `Badge` component (re-exported via Plan 1's `src/components/ui/badge.tsx`)

**Prerequisites:** Plans 1, 2, and 3 must be complete. Specifically: `src/components/ui/badge.tsx` must exist as a re-export from `@ultranos/ui-kit/components/ui/badge`, and all semantic tokens (`bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `shadow-card`, `rounded-2xl`, `bg-success`, `bg-destructive`, `bg-warning`, `bg-primary`) must resolve via the ui-kit tailwind preset.

---

## File Map

| Action | Files |
|--------|-------|
| Modify | `apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/DashboardActionHub.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/DispensingSummaryCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/DispensingHistoryView.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/HistoryItemRow.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/HistoryFilterBar.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/AllergyBanner.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/InteractionCheckBanner.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PrescriptionScanner.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/LabelPreviewPanel.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/MedicationLabel.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/ManualRxEntry.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/OfflineGraceForm.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PatientRegistrationForm.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PatientSearchBar.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PatientSearchResults.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/Pagination.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/ShiftSummary.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/SyncQueueDashboard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/SyncQueueCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/SyncQueueEntry.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/SyncCapacityBanner.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/SessionExpiryBanner.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/StockOverviewPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/InventoryAlertCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/StockAlertPanel.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockItemRow.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/FefoWarningBanner.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogSearchInput.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/procurement/SuppliersPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierForm.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountForm.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/pos/PosPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/pos/PaymentForm.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/pos/InvoiceSummary.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/pos/CashDrawerPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/pos/DrawerStatusCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/pos/PatientAccountsPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/reports/ReportsPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/reports/ConsumptionChart.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/reports/FinancialSummaryCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/reports/WastageCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/reports/ControlledDiscrepancyCard.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/transfers/TransfersPage.tsx` |
| Modify | `apps/pharmacy-lite/src/components/pharmacy/transfers/TransferCard.tsx` |
| Update snapshots | `apps/pharmacy-lite/src/__tests__/` (all snapshot files) |

---

## Token Mapping Reference

Apply this mapping throughout every task. When in doubt, consult this table.

| Old class | New class |
|-----------|-----------|
| `text-neutral-900` | `text-foreground` |
| `text-neutral-800` | `text-foreground` |
| `text-neutral-700` | `text-foreground` |
| `text-neutral-600` | `text-muted-foreground` |
| `text-neutral-500` | `text-muted-foreground` |
| `text-neutral-400` | `text-muted-foreground` |
| `bg-white` | `bg-card` |
| `bg-neutral-50` (page/section bg) | `bg-background` |
| `bg-neutral-50` (hover state) | `hover:bg-accent` |
| `bg-neutral-100` | `bg-muted` |
| `border-neutral-200` | `border-border` |
| `border-neutral-300` | `border-border` |
| `hover:bg-neutral-50` | `hover:bg-accent` |
| `hover:bg-neutral-100` | `hover:bg-accent` |
| `hover:text-neutral-600` | `hover:text-foreground` |
| `rounded-lg` on card containers | `rounded-2xl` |
| `rounded-xl` on card containers | `rounded-2xl` |
| `shadow-md` | `shadow-card` |
| `shadow-sm` | `shadow-card` |
| `bg-green-100 text-green-700` | `bg-success/10 text-success` |
| `bg-green-500` / `bg-green-600` | `bg-success` |
| `bg-red-100 text-red-700` | `bg-destructive/10 text-destructive` |
| `bg-red-500` | `bg-destructive` |
| `bg-amber-100 text-amber-700` | `bg-warning/10 text-warning` |
| `bg-orange-100 text-orange-700` | `bg-warning/10 text-warning` |
| `bg-blue-100 text-blue-700` | `bg-primary/10 text-primary` |
| `text-green-600` / `text-green-700` | `text-success` |
| `text-red-600` / `text-red-700` | `text-destructive` |
| `text-amber-600` / `text-amber-700` | `text-warning` |
| `divide-neutral-100` | `divide-border` |
| `border-primary-200` | `border-primary/20` |

**Exceptions — do NOT change:**
- `border-red-300 border-t-red-700` inside `animate-spin` spinners — animation class, leave as-is
- `bg-pill-green` / `text-pill-text` — pharmacy brand identity, leave as-is
- `motion-reduce:animate-none` classes — leave as-is
- Any color on `data-testid="connectivity-indicator"` dot if it still exists (was removed in Plan 3, but verify)

## Badge Pattern Migration Reference

Replace all inline badge `<span>` elements with the shadcn `Badge` component. Add the import at the top of the file if not already present:

```tsx
import { Badge } from '@/components/ui/badge'
```

**Before pattern:**
```tsx
<span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Synced</span>
```

**After pattern:**
```tsx
<Badge variant="outline" className="bg-success/10 text-success border-success/20">Synced</Badge>
```

Status badge className mappings:
- Synced / Completed / Active / In Stock → `variant="outline" className="bg-success/10 text-success border-success/20"`
- Pending / Reviewing / Dispensing / In-flight / Low Stock / Paper Rx / Manual Verify → `variant="outline" className="bg-warning/10 text-warning border-warning/20"`
- Failed / Error / Overdue / Out of Stock / Discrepancy → `variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"`
- Loaded / Info / Primary / Draft → `variant="outline" className="bg-primary/10 text-primary border-primary/20"`

When a badge has an `animate-pulse` class (e.g., for "Dispensing"), preserve it by appending to the `className`:
```tsx
<Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 animate-pulse motion-reduce:animate-none">
  Dispensing
</Badge>
```

## Button Variant Mapping Reference

The old `Button.tsx` had variants: `primary`, `secondary`, `danger`, `warning`, `ghost`, `outline`.
The ui-kit Button has: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`.

| Old variant | New variant | Notes |
|-------------|-------------|-------|
| `variant="primary"` | `variant="default"` | |
| `variant="secondary"` | `variant="secondary"` | unchanged |
| `variant="danger"` | `variant="destructive"` | |
| `variant="warning"` | `variant="outline" className="border-warning text-warning hover:bg-warning/10"` | no direct shadcn equivalent |
| `variant="ghost"` | `variant="ghost"` | unchanged |
| `variant="outline"` | `variant="outline"` | unchanged |

Also update the Button import from the old `@/components/ui/Button` (capital B) to `@/components/ui/button` (lowercase b).

## Card Container Pattern Reference

Any `<div>` used as a top-level card container should be updated to use these classes:
```
rounded-2xl bg-card border border-border p-6 shadow-card
```
Preserve the original padding value (`p-4` stays `p-4`, `p-6` stays `p-6`). Only the shape, background, border, and shadow classes change.

Before:
```tsx
<div className="rounded-lg bg-white border border-neutral-200 shadow-sm p-4">
```
After:
```tsx
<div className="rounded-2xl bg-card border border-border shadow-card p-4">
```

---

## Tasks

### Task 1: QueueItemCard.tsx — badge migration + button variant

This is the most complete example. Implement it first to establish the pattern for all subsequent tasks.

- [ ] Create the failing test file at `apps/pharmacy-lite/src/__tests__/queue-item-card-tokens.test.tsx` with the following content:

```tsx
import { render } from '@testing-library/react'
import { QueueItemCard } from '@/components/pharmacy/QueueItemCard'

const baseItem = {
  id: '1',
  patientFirstName: 'Ahmed',
  medicationCount: 2,
  timestamp: '2026-01-01T10:00:00Z',
  phase: 'completed' as const,
  syncStatus: 'synced' as const,
}

test('completed phase badge uses success semantic tokens', () => {
  const { getByTestId } = render(<QueueItemCard item={baseItem} />)
  const badge = getByTestId('phase-badge-1')
  expect(badge.className).toContain('text-success')
  expect(badge.className).toContain('bg-success/10')
})

test('failed sync badge uses destructive semantic tokens', () => {
  const { getByTestId } = render(
    <QueueItemCard item={{ ...baseItem, syncStatus: 'failed' }} showSyncBadge />
  )
  const badge = getByTestId('sync-badge-1')
  expect(badge.className).toContain('text-destructive')
})

test('retry button uses destructive variant', () => {
  const { getByTestId } = render(
    <QueueItemCard
      item={{ ...baseItem, syncStatus: 'failed' }}
      onRetry={() => {}}
    />
  )
  const btn = getByTestId('retry-btn-1')
  // shadcn destructive button renders with bg-destructive
  expect(btn.className).toContain('bg-destructive')
})
```

- [ ] Run the test to confirm it fails (pre-migration baseline):

```bash
pnpm -F pharmacy-lite test queue-item-card-tokens
```

Expected: **FAIL** — `text-success`, `bg-success/10`, `text-destructive`, `bg-destructive` are not present in the current file.

- [ ] Write the complete updated content of `apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx`:

```tsx
'use client'

import type { QueueItem, FulfillmentPhaseBadge, SyncStatus } from '@/lib/queue-data'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface QueueItemCardProps {
  item: QueueItem
  onSelect?: (item: QueueItem) => void
  showSyncBadge?: boolean
  onRetry?: (item: QueueItem) => void
  retrying?: boolean
  isPaperPrescription?: boolean
}

const phaseBadgeVariant: Record<
  FulfillmentPhaseBadge,
  { className: string; extra?: string }
> = {
  loaded:     { className: 'bg-primary/10 text-primary border-primary/20' },
  reviewing:  { className: 'bg-warning/10 text-warning border-warning/20' },
  dispensing: { className: 'bg-warning/10 text-warning border-warning/20', extra: 'animate-pulse motion-reduce:animate-none' },
  completed:  { className: 'bg-success/10 text-success border-success/20' },
}

const phaseLabels: Record<FulfillmentPhaseBadge, string> = {
  loaded:     'Loaded',
  reviewing:  'Reviewing',
  dispensing: 'Dispensing',
  completed:  'Completed',
}

const syncBadgeVariant: Record<SyncStatus, string> = {
  synced:  'bg-success/10 text-success border-success/20',
  pending: 'bg-warning/10 text-warning border-warning/20',
  failed:  'bg-destructive/10 text-destructive border-destructive/20',
}

const syncLabels: Record<SyncStatus, string> = {
  synced:  'Synced',
  pending: 'Pending',
  failed:  'Failed',
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    if (isNaN(date.getTime())) return '--:--'
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

export function QueueItemCard({
  item,
  onSelect,
  showSyncBadge,
  onRetry,
  retrying,
  isPaperPrescription,
}: QueueItemCardProps) {
  const isInteractive = !!onSelect
  const phaseVariant = phaseBadgeVariant[item.phase]

  return (
    <li
      data-testid={`queue-item-${item.id}`}
      className={`flex items-center justify-between px-4 py-3 transition-colors ${
        isInteractive ? 'cursor-pointer hover:bg-accent' : ''
      }`}
      onClick={isInteractive ? () => onSelect(item) : undefined}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(item)
              }
            }
          : undefined
      }
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">
          {item.patientFirstName}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {item.medicationCount} meds &middot; {formatTime(item.timestamp)}
        </div>
      </div>

      <div className="flex items-center gap-2 ms-2">
        {isPaperPrescription && (
          <Badge
            variant="outline"
            data-testid={`paper-badge-${item.id}`}
            className="bg-warning/10 text-warning border-warning/20"
          >
            PAPER
          </Badge>
        )}
        {isPaperPrescription && (
          <Badge
            variant="outline"
            data-testid={`manual-verify-flag-${item.id}`}
            className="bg-destructive/10 text-destructive border-destructive/20"
          >
            Manual Verification Required
          </Badge>
        )}
        <Badge
          variant="outline"
          data-testid={`phase-badge-${item.id}`}
          className={`${phaseVariant.className}${phaseVariant.extra ? ` ${phaseVariant.extra}` : ''}`}
        >
          {phaseLabels[item.phase]}
        </Badge>

        {showSyncBadge && (
          <Badge
            variant="outline"
            data-testid={`sync-badge-${item.id}`}
            className={syncBadgeVariant[item.syncStatus]}
          >
            {syncLabels[item.syncStatus]}
          </Badge>
        )}

        {onRetry && item.syncStatus === 'failed' && (
          <Button
            variant="destructive"
            size="sm"
            data-testid={`retry-btn-${item.id}`}
            onClick={(e) => {
              e.stopPropagation()
              onRetry(item)
            }}
            disabled={retrying}
          >
            {retrying ? (
              <span className="inline-block h-3 w-3 animate-spin motion-reduce:animate-none rounded-full border-2 border-red-300 border-t-red-700 me-1" />
            ) : null}
            Retry Sync
          </Button>
        )}
      </div>
    </li>
  )
}
```

- [ ] Run the test again to confirm it passes:

```bash
pnpm -F pharmacy-lite test queue-item-card-tokens
```

Expected: **PASS**

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/__tests__/queue-item-card-tokens.test.tsx \
        apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx
git commit -m "feat(pharmacy-lite): migrate QueueItemCard to semantic tokens and shadcn Badge"
```

---

### Task 2: Token sweep — SyncQueue* components

Apply the token mapping to `SyncQueueCard.tsx`, `SyncQueueEntry.tsx`, and `SyncQueueDashboard.tsx`.

#### SyncQueueCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/SyncQueueCard.tsx`
- [ ] Apply all token substitutions from the mapping table:
  - Replace every `text-neutral-900`, `text-neutral-800`, `text-neutral-700` → `text-foreground`
  - Replace every `text-neutral-600`, `text-neutral-500`, `text-neutral-400` → `text-muted-foreground`
  - Replace `bg-white` → `bg-card`
  - Replace `bg-neutral-50` used as a page/section background → `bg-background`; as a hover state → `hover:bg-accent`
  - Replace `bg-neutral-100` → `bg-muted`
  - Replace `border-neutral-200`, `border-neutral-300` → `border-border`
  - Replace `hover:bg-neutral-50`, `hover:bg-neutral-100` → `hover:bg-accent`
  - Replace `hover:text-neutral-600` → `hover:text-foreground`
  - Replace `shadow-sm`, `shadow-md` → `shadow-card`
  - Replace `rounded-lg` and `rounded-xl` on card containers → `rounded-2xl`
  - Replace status color pairs (`bg-green-100 text-green-700`, `bg-amber-100 text-amber-700`, `bg-red-100 text-red-700`, `bg-blue-100 text-blue-700`) with semantic equivalents per the mapping table
  - Replace `text-green-600`/`text-green-700` → `text-success`, `text-red-600`/`text-red-700` → `text-destructive`, `text-amber-600`/`text-amber-700` → `text-warning`
  - Replace `bg-green-500`/`bg-green-600` → `bg-success`, `bg-red-500` → `bg-destructive`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update any card container `<div>` from `rounded-lg bg-white border border-neutral-200 shadow-sm p-N` to `rounded-2xl bg-card border border-border shadow-card p-N` (preserving the original padding value)
- [ ] Update any Button imports from `@/components/ui/Button` (capital B) to `@/components/ui/button` and remap `variant="primary"` → `variant="default"`, `variant="danger"` → `variant="destructive"`
- [ ] Write the complete updated file

#### SyncQueueEntry.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/SyncQueueEntry.tsx`
- [ ] Apply all token substitutions from the mapping table (same set as above)
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update card container classes as described above
- [ ] Update Button import path and remap variants
- [ ] Write the complete updated file

#### SyncQueueDashboard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/SyncQueueDashboard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update card container classes as described above
- [ ] Update Button import path and remap variants
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/SyncQueueCard.tsx \
        apps/pharmacy-lite/src/components/pharmacy/SyncQueueEntry.tsx \
        apps/pharmacy-lite/src/components/pharmacy/SyncQueueDashboard.tsx
git commit -m "feat(pharmacy-lite): migrate SyncQueue components to semantic tokens"
```

---

### Task 3: Token sweep — Sync banner components

Apply the token mapping to `SyncCapacityBanner.tsx`, `SyncPulse.tsx`, and `SessionExpiryBanner.tsx`.

#### SyncCapacityBanner.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/SyncCapacityBanner.tsx`
- [ ] Apply all token substitutions from the mapping table:
  - Replace all `text-neutral-*` variants → `text-foreground` or `text-muted-foreground` per the mapping
  - Replace `bg-white` → `bg-card`, `bg-neutral-50` → `bg-background` or `hover:bg-accent` depending on context
  - Replace `border-neutral-200`, `border-neutral-300` → `border-border`
  - Replace status color pairs and individual status colors per the mapping table
  - Replace `shadow-sm`/`shadow-md` → `shadow-card`
  - Replace `rounded-lg`/`rounded-xl` on containers → `rounded-2xl`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Write the complete updated file

#### SyncPulse.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Note: SyncPulse likely contains pulse animation classes — preserve all `animate-*` and `motion-reduce:*` classes unchanged; only change color classes
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` if present
- [ ] Write the complete updated file

#### SessionExpiryBanner.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/SessionExpiryBanner.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` if present
- [ ] Update Button import path and remap `variant="danger"` → `variant="destructive"`, `variant="primary"` → `variant="default"` if present
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/SyncCapacityBanner.tsx \
        apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx \
        apps/pharmacy-lite/src/components/pharmacy/SessionExpiryBanner.tsx
git commit -m "feat(pharmacy-lite): migrate sync banner components to semantic tokens"
```

---

### Task 4: Token sweep — queue and history components

Apply the token mapping to `PrescriptionQueueView.tsx`, `DispensingHistoryView.tsx`, `HistoryItemRow.tsx`, `HistoryFilterBar.tsx`, `RecentDispensingList.tsx`, and `DispensingSummaryCard.tsx`.

#### PrescriptionQueueView.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update card container classes: `rounded-lg bg-white border border-neutral-200 shadow-sm` → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### DispensingHistoryView.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/DispensingHistoryView.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update card container classes
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### HistoryItemRow.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/HistoryItemRow.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Note: `hover:bg-neutral-50` on row items → `hover:bg-accent`
- [ ] Write the complete updated file

#### HistoryFilterBar.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/HistoryFilterBar.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] `bg-neutral-100` used as selected filter tab background → `bg-muted`; `hover:bg-neutral-50` on unselected tabs → `hover:bg-accent`
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### RecentDispensingList.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update card container classes
- [ ] Write the complete updated file

#### DispensingSummaryCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/DispensingSummaryCard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes: `rounded-lg bg-white border border-neutral-200 shadow-sm p-N` → `rounded-2xl bg-card border border-border shadow-card p-N`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx \
        apps/pharmacy-lite/src/components/pharmacy/DispensingHistoryView.tsx \
        apps/pharmacy-lite/src/components/pharmacy/HistoryItemRow.tsx \
        apps/pharmacy-lite/src/components/pharmacy/HistoryFilterBar.tsx \
        apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx \
        apps/pharmacy-lite/src/components/pharmacy/DispensingSummaryCard.tsx
git commit -m "feat(pharmacy-lite): migrate queue and history components to semantic tokens"
```

---

### Task 5: Token sweep — clinical banner components

Apply the token mapping to `AllergyBanner.tsx`, `InteractionCheckBanner.tsx`, `UnverifiedDispensesView.tsx`, `UnverifiedDispensesCard.tsx`, and `ControlledSubstancesView.tsx`.

#### AllergyBanner.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/AllergyBanner.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] **Healthcare safety note:** The allergy section's red prominence is preserved — `bg-red-100 text-red-700` maps to `bg-destructive/10 text-destructive`, which is the semantic equivalent and remains visually red. Do NOT mute, collapse, or reduce the visual weight of any allergy content. The mapping is a rename, not a dimming.
- [ ] Replace `bg-red-100 text-red-700` → `bg-destructive/10 text-destructive` on the banner container and allergy item rows
- [ ] Replace `border-red-200` or `border-red-300` → `border-destructive/20`
- [ ] Replace `text-red-700` on standalone text elements → `text-destructive`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap `variant="danger"` → `variant="destructive"` if present
- [ ] Write the complete updated file

#### InteractionCheckBanner.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/InteractionCheckBanner.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] **Healthcare safety note:** Drug interaction severity must remain visually clear. CONTRAINDICATED/MAJOR banners use `bg-destructive/10 text-destructive`; WARNING/MODERATE banners use `bg-warning/10 text-warning`; CHECK UNAVAILABLE banners must be explicitly visible — use `bg-warning/10 text-warning border-warning/20` with the warning text, never default to a neutral/muted color.
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### UnverifiedDispensesView.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### UnverifiedDispensesCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesCard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes: `rounded-lg bg-white border border-neutral-200 shadow-sm p-N` → `rounded-2xl bg-card border border-border shadow-card p-N`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### ControlledSubstancesView.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/AllergyBanner.tsx \
        apps/pharmacy-lite/src/components/pharmacy/InteractionCheckBanner.tsx \
        apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesView.tsx \
        apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesCard.tsx \
        apps/pharmacy-lite/src/components/pharmacy/ControlledSubstancesView.tsx
git commit -m "feat(pharmacy-lite): migrate clinical banner components to semantic tokens"
```

---

### Task 6: Token sweep — scanner and rx-entry components

Apply the token mapping to `PharmacyScannerView.tsx`, `PrescriptionScanner.tsx`, `ManualRxEntry.tsx`, and `OfflineGraceForm.tsx`.

#### PharmacyScannerView.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### PrescriptionScanner.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PrescriptionScanner.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap `variant="primary"` → `variant="default"`, `variant="danger"` → `variant="destructive"` if present
- [ ] Write the complete updated file

#### ManualRxEntry.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/ManualRxEntry.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### OfflineGraceForm.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/OfflineGraceForm.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx \
        apps/pharmacy-lite/src/components/pharmacy/PrescriptionScanner.tsx \
        apps/pharmacy-lite/src/components/pharmacy/ManualRxEntry.tsx \
        apps/pharmacy-lite/src/components/pharmacy/OfflineGraceForm.tsx
git commit -m "feat(pharmacy-lite): migrate scanner and rx-entry components to semantic tokens"
```

---

### Task 7: Token sweep — dispensing workflow components

Apply the token mapping to `DispensingConfirmationModal.tsx`, `FulfillmentChecklist.tsx`, `LabelPreviewPanel.tsx`, and `MedicationLabel.tsx`.

#### DispensingConfirmationModal.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update modal container/backdrop classes: any `bg-white` container inside the modal → `bg-card`; overlay backgrounds (e.g., `bg-neutral-900/50`) are non-semantic — leave those unchanged
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap `variant="primary"` → `variant="default"`, `variant="danger"` → `variant="destructive"` if present
- [ ] Write the complete updated file

#### FulfillmentChecklist.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Checklist item rows: `hover:bg-neutral-50` → `hover:bg-accent`; checked item backgrounds: `bg-green-50` → `bg-success/5` (if present; `bg-green-50` is not in the main table — use `bg-success/5` as the closest low-opacity equivalent)
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Write the complete updated file

#### LabelPreviewPanel.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/LabelPreviewPanel.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Note: the label preview area may have a white paper-like background for print simulation. If a `bg-white` div is specifically for print/paper preview rendering (not a UI card), leave it as `bg-white` and add a comment: `{/* print simulation — intentionally white */}`
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### MedicationLabel.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/MedicationLabel.tsx`
- [ ] Apply all token substitutions from the mapping table that apply to UI wrapper elements
- [ ] Note: label content area (the printable label itself) may use `bg-white` for print simulation — leave those `bg-white` usages as-is with a comment `{/* print simulation */}`. Only migrate `bg-white` on surrounding UI chrome/card containers.
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx \
        apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx \
        apps/pharmacy-lite/src/components/pharmacy/LabelPreviewPanel.tsx \
        apps/pharmacy-lite/src/components/pharmacy/MedicationLabel.tsx
git commit -m "feat(pharmacy-lite): migrate dispensing workflow components to semantic tokens"
```

---

### Task 8: Token sweep — patient components

Apply the token mapping to `PatientRegistrationForm.tsx`, `PatientSearchBar.tsx`, `PatientSearchResults.tsx`, `EmptyState.tsx`, and `Pagination.tsx`.

#### PatientRegistrationForm.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PatientRegistrationForm.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card/section container classes
- [ ] `bg-neutral-50` used as form section background → `bg-background`; `border-neutral-200` on form section dividers → `border-border`
- [ ] Update Button import path and remap `variant="primary"` → `variant="default"`, `variant="danger"` → `variant="destructive"` if present
- [ ] Write the complete updated file

#### PatientSearchBar.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PatientSearchBar.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Input container: `border-neutral-300` → `border-border`; `bg-white` on input background → `bg-card`
- [ ] Focus ring classes (`focus:ring-*`, `focus:border-*`) that reference neutral colors → update to `focus:ring-ring` or `focus:border-primary` as appropriate
- [ ] Write the complete updated file

#### PatientSearchResults.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PatientSearchResults.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Result rows: `hover:bg-neutral-50` → `hover:bg-accent`; selected row: `bg-neutral-100` → `bg-muted`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Write the complete updated file

#### EmptyState.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] `text-neutral-400` on icon → `text-muted-foreground`; `text-neutral-600` on description → `text-muted-foreground`; `text-neutral-900` on heading → `text-foreground`
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### Pagination.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/Pagination.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Active page button: `bg-neutral-900 text-white` → `bg-foreground text-background` (or if using a primary color — `bg-primary text-primary-foreground`)
- [ ] Inactive page buttons: `hover:bg-neutral-100` → `hover:bg-accent`; `text-neutral-700` → `text-foreground`
- [ ] Disabled controls: `text-neutral-300` → `text-muted-foreground`
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/PatientRegistrationForm.tsx \
        apps/pharmacy-lite/src/components/pharmacy/PatientSearchBar.tsx \
        apps/pharmacy-lite/src/components/pharmacy/PatientSearchResults.tsx \
        apps/pharmacy-lite/src/components/pharmacy/EmptyState.tsx \
        apps/pharmacy-lite/src/components/pharmacy/Pagination.tsx
git commit -m "feat(pharmacy-lite): migrate patient components to semantic tokens"
```

---

### Task 9: Token sweep — settings, shift, and dashboard components

Apply the token mapping to `PharmacySettingsView.tsx`, `ShiftSummary.tsx`, `PharmacyDashboard.tsx`, and `DashboardActionHub.tsx`.

#### PharmacySettingsView.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card/section container classes
- [ ] Settings section dividers: `border-neutral-200` → `border-border`; section backgrounds: `bg-neutral-50` → `bg-background`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap `variant="primary"` → `variant="default"`, `variant="danger"` → `variant="destructive"` if present
- [ ] Write the complete updated file

#### ShiftSummary.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/ShiftSummary.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Update card container classes
- [ ] Summary stat numbers: `text-neutral-900` → `text-foreground`; stat labels: `text-neutral-600` → `text-muted-foreground`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Write the complete updated file

#### PharmacyDashboard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx`
- [ ] **Note:** The welcome header section was removed in Plan 3. This task applies the token sweep to all remaining content — stats cards, action cards, section wrappers, any remaining status indicators.
- [ ] Apply all token substitutions from the mapping table to all remaining hardcoded colors
- [ ] Update stats card containers: `rounded-lg bg-white border border-neutral-200 shadow-sm p-N` → `rounded-2xl bg-card border border-border shadow-card p-N`
- [ ] Migrate any inline badge `<span>` elements to `<Badge variant="outline" className="...">` using the badge mapping; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### DashboardActionHub.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/DashboardActionHub.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Action hub card containers: `rounded-lg bg-white border border-neutral-200 shadow-sm p-N` → `rounded-2xl bg-card border border-border shadow-card p-N`
- [ ] Action button hover states: `hover:bg-neutral-50` → `hover:bg-accent`
- [ ] Icon containers: `bg-blue-100 text-blue-700` → `bg-primary/10 text-primary`; `bg-green-100 text-green-700` → `bg-success/10 text-success`; `bg-amber-100 text-amber-700` → `bg-warning/10 text-warning`; `bg-red-100 text-red-700` → `bg-destructive/10 text-destructive`
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx \
        apps/pharmacy-lite/src/components/pharmacy/ShiftSummary.tsx \
        apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx \
        apps/pharmacy-lite/src/components/pharmacy/DashboardActionHub.tsx
git commit -m "feat(pharmacy-lite): migrate settings, shift, and dashboard components to semantic tokens"
```

---

### Task 10: Token sweep — inventory subdirectory

Apply the token mapping to all 10 inventory components.

#### StockOverviewPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/StockOverviewPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background: `bg-neutral-50` → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Stock level status colors: low stock `bg-amber-100 text-amber-700` → `bg-warning/10 text-warning`; out of stock `bg-red-100 text-red-700` → `bg-destructive/10 text-destructive`; in stock `bg-green-100 text-green-700` → `bg-success/10 text-success`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### StockTable.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/StockTable.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Table header: `bg-neutral-50 text-neutral-600` → `bg-muted text-muted-foreground`
- [ ] Table rows: `hover:bg-neutral-50` → `hover:bg-accent`; `border-neutral-200` on row dividers → `border-border`; `divide-neutral-100` → `divide-border`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Write the complete updated file

#### InventoryAlertCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/InventoryAlertCard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Alert card container: `rounded-lg bg-white border border-neutral-200 shadow-sm p-N` → `rounded-2xl bg-card border border-border shadow-card p-N`
- [ ] Severity indicator colors: critical → `bg-destructive/10 text-destructive`; warning → `bg-warning/10 text-warning`; info → `bg-primary/10 text-primary`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### StockAlertPanel.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/StockAlertPanel.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Panel container: → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Write the complete updated file

#### ReceiveStockPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page container: `bg-neutral-50` → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Update Button import path and remap `variant="primary"` → `variant="default"` if present
- [ ] Write the complete updated file

#### ReceiveStockForm.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockForm.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Form card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Section dividers: `border-neutral-200` → `border-border`
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### ReceiveStockItemRow.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/ReceiveStockItemRow.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Row hover: `hover:bg-neutral-50` → `hover:bg-accent`; divider: `border-neutral-100` → `border-border`
- [ ] Write the complete updated file

#### FefoWarningBanner.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/FefoWarningBanner.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] **FEFO-specific:** The banner container for FEFO (First Expired First Out) warnings must use `bg-warning/10 text-warning border-warning/20` — these map from any existing `bg-amber-*` or `bg-orange-*` banner background. The warning icon and heading text must use `text-warning`. Expiry date highlights that are near-expiry: `text-amber-700` → `text-warning`; already expired: `text-red-700` → `text-destructive`.
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Write the complete updated file

#### CatalogBrowsePage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogBrowsePage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background: `bg-neutral-50` → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Catalog item rows: `hover:bg-neutral-50` → `hover:bg-accent`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### CatalogSearchInput.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/inventory/CatalogSearchInput.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Input: `border-neutral-300` → `border-border`; `bg-white` on input → `bg-card`
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/inventory/
git commit -m "feat(pharmacy-lite): migrate inventory components to semantic tokens"
```

---

### Task 11: Token sweep — procurement, pos, reports, and transfers subdirectories

Apply the token mapping to all remaining subdirectory components.

#### procurement/SuppliersPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/procurement/SuppliersPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Table header: `bg-neutral-50` → `bg-muted`; rows: `hover:bg-neutral-50` → `hover:bg-accent`; dividers: `border-neutral-200`/`divide-neutral-100` → `border-border`/`divide-border`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### procurement/SupplierForm.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/procurement/SupplierForm.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Form card container → `rounded-2xl bg-card border border-border shadow-card`; section dividers: `border-neutral-200` → `border-border`
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### procurement/StockCountPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### procurement/StockCountForm.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/procurement/StockCountForm.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Form card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### pos/PosPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/pos/PosPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background → `bg-background`; panel containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap `variant="primary"` → `variant="default"`, `variant="danger"` → `variant="destructive"` if present
- [ ] Write the complete updated file

#### pos/PaymentForm.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/pos/PaymentForm.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Payment method selected state: `bg-blue-100 border-blue-700` → `bg-primary/10 border-primary`; unselected: `bg-white border-neutral-200` → `bg-card border-border`
- [ ] Update Button import path and remap `variant="primary"` → `variant="default"` if present
- [ ] Write the complete updated file

#### pos/InvoiceSummary.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/pos/InvoiceSummary.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Invoice card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Total row: `border-neutral-200 text-neutral-900` → `border-border text-foreground`; subtotal/tax rows: `text-neutral-600` → `text-muted-foreground`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Write the complete updated file

#### pos/CashDrawerPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/pos/CashDrawerPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### pos/DrawerStatusCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/pos/DrawerStatusCard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Drawer open status badge: `bg-green-100 text-green-700` → `bg-success/10 text-success`; drawer closed/reconciled: `bg-neutral-100 text-neutral-700` → `bg-muted text-muted-foreground`; discrepancy: `bg-red-100 text-red-700` → `bg-destructive/10 text-destructive`
- [ ] Migrate all inline badge `<span>` to `<Badge variant="outline" className="...">` using the status mappings above; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Write the complete updated file

#### pos/PatientAccountsPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/pos/PatientAccountsPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Table header: `bg-neutral-50` → `bg-muted`; rows: `hover:bg-neutral-50` → `hover:bg-accent`
- [ ] Account balance status: overdue `bg-red-100 text-red-700` → `bg-destructive/10 text-destructive`; current `bg-green-100 text-green-700` → `bg-success/10 text-success`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### reports/ReportsPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/reports/ReportsPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Date range filter: `border-neutral-200` → `border-border`; selected range: `bg-blue-100 text-blue-700` → `bg-primary/10 text-primary`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### reports/ConsumptionChart.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/reports/ConsumptionChart.tsx`
- [ ] Apply all token substitutions from the mapping table for UI chrome only (wrappers, labels, headings)
- [ ] **Chart data colors:** If the file uses hardcoded hex colors for chart bars/lines/segments (e.g., `#22c55e`, `#ef4444`), leave those unchanged — chart colors are data visualization colors, not UI tokens, and changing them could break chart legibility. Only change Tailwind class-based color utilities on container/label elements.
- [ ] Chart container card → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Write the complete updated file

#### reports/FinancialSummaryCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/reports/FinancialSummaryCard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Revenue positive: `text-green-600` → `text-success`; revenue negative/loss: `text-red-600` → `text-destructive`
- [ ] Write the complete updated file

#### reports/WastageCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/reports/WastageCard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Wastage value: `text-amber-700` → `text-warning`; wastage over threshold: `text-red-700` → `text-destructive`
- [ ] Write the complete updated file

#### reports/ControlledDiscrepancyCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/reports/ControlledDiscrepancyCard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Discrepancy highlight: `bg-red-100 text-red-700` → `bg-destructive/10 text-destructive`; no discrepancy: `bg-green-100 text-green-700` → `bg-success/10 text-success`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Write the complete updated file

#### transfers/TransfersPage.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/transfers/TransfersPage.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Page background → `bg-background`; card containers → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Migrate any inline badge `<span>` to `<Badge>` using badge mapping; add import if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

#### transfers/TransferCard.tsx

- [ ] Read `apps/pharmacy-lite/src/components/pharmacy/transfers/TransferCard.tsx`
- [ ] Apply all token substitutions from the mapping table
- [ ] Card container → `rounded-2xl bg-card border border-border shadow-card`
- [ ] Transfer status badges: pending → `variant="outline" className="bg-warning/10 text-warning border-warning/20"`; in-transit → `variant="outline" className="bg-primary/10 text-primary border-primary/20"`; delivered/completed → `variant="outline" className="bg-success/10 text-success border-success/20"`; failed/rejected → `variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"`
- [ ] Migrate all status inline badge `<span>` to `<Badge variant="outline" className="...">` per the mappings above; add `import { Badge } from '@/components/ui/badge'` if not present
- [ ] Update Button import path and remap variants if present
- [ ] Write the complete updated file

- [ ] Commit:

```bash
git add apps/pharmacy-lite/src/components/pharmacy/procurement/ \
        apps/pharmacy-lite/src/components/pharmacy/pos/ \
        apps/pharmacy-lite/src/components/pharmacy/reports/ \
        apps/pharmacy-lite/src/components/pharmacy/transfers/
git commit -m "feat(pharmacy-lite): migrate procurement/pos/reports/transfers components to semantic tokens"
```

---

### Task 12: Verify no hardcoded colors remain

- [ ] Run a grep to confirm no hardcoded neutral/status colors remain in pharmacy-lite component source:

```bash
grep -rn \
  "text-neutral-\|bg-neutral-\|border-neutral-\|bg-green-[0-9]\|text-green-[0-9]\|bg-red-[0-9]\|text-red-[0-9]\|bg-amber-[0-9]\|text-amber-[0-9]\|bg-blue-[0-9]\|text-blue-[0-9]\|bg-orange-[0-9]\|text-orange-[0-9]\|bg-white\b" \
  apps/pharmacy-lite/src/components/pharmacy/ \
  --include="*.tsx" \
  | grep -v "animate-spin\|border-red-300\|border-t-red-700\|bg-pill-green\|__tests__\|print simulation"
```

Expected: **no output**. If any lines appear, fix each occurrence before proceeding to Task 13.

- [ ] Verify all Button imports have been updated to lowercase path:

```bash
grep -rn "from '@/components/ui/Button'" apps/pharmacy-lite/src/
```

Expected: **no output**.

- [ ] Verify no `variant="danger"` remains:

```bash
grep -rn 'variant="danger"' apps/pharmacy-lite/src/
```

Expected: **no output**.

- [ ] Verify no `variant="primary"` remains:

```bash
grep -rn 'variant="primary"' apps/pharmacy-lite/src/
```

Expected: **no output**.

- [ ] If any of the above greps produce output, fix each file and add it to the prior task's commit or create a follow-up commit before continuing.

---

### Task 13: Regenerate all snapshots

After all token changes, existing snapshot tests will fail because class names changed from hardcoded colors to semantic tokens. This is expected and acceptable — update them all at once.

- [ ] Run snapshot update:

```bash
pnpm -F pharmacy-lite test -- --update-snapshots 2>&1 | tail -20
```

Expected output includes lines like:
```
✓ Updated N snapshots.
```

- [ ] Review the snapshot diff to confirm only class name changes:

```bash
git diff apps/pharmacy-lite/src/__tests__/__snapshots__/
```

Confirm the diff shows **only class name changes** (semantic tokens replacing hardcoded colors — e.g., `text-neutral-900` replaced by `text-foreground`, `bg-green-100` replaced by `bg-success/10`). If you see structural HTML changes (elements added or removed, different nesting, new/missing data-testid attributes), that is unexpected — stop, investigate the affected component, fix the regression, and re-run the snapshot update.

- [ ] Commit the snapshot updates:

```bash
git add apps/pharmacy-lite/src/__tests__/__snapshots__/
git commit -m "chore(pharmacy-lite): regenerate snapshots after token sweep"
```

---

### Task 14: Final verification

- [ ] TypeScript check (excluding test files):

```bash
pnpm -F pharmacy-lite typecheck 2>&1 | grep "error TS" | grep -v "__tests__"
```

Expected: **no output** (no new TypeScript errors).

- [ ] Full test suite:

```bash
pnpm -F pharmacy-lite test
```

Expected: **all tests pass** (snapshots were updated in Task 13; the new token-assertion tests from Task 1 pass).

- [ ] Build:

```bash
pnpm -F pharmacy-lite build 2>&1 | tail -15
```

Expected: **successful build** with no errors.

**Common failure modes and fixes:**

- `unknown variant: "danger"` in Button → run `grep -rn 'variant="danger"' apps/pharmacy-lite/src/` and change each to `variant="destructive"`
- `unknown variant: "primary"` in Button → run `grep -rn 'variant="primary"' apps/pharmacy-lite/src/` and change each to `variant="default"`
- `Cannot find module '@/components/ui/Badge'` (capital B) → the import must be `@/components/ui/badge` (lowercase b); run `grep -rn "ui/Badge" apps/pharmacy-lite/src/` to find all occurrences
- `bg-success/10 has no value` or `text-success is undefined` → the ui-kit preset is not loaded in `tailwind.config.ts`; verify `apps/pharmacy-lite/tailwind.config.ts` includes `presets: [preset]` from `@ultranos/ui-kit/tailwind`
- `shadow-card is undefined` → same cause as above; verify the preset is loaded
- `rounded-2xl is undefined` → Tailwind v3 includes `rounded-2xl` by default; if this occurs, check that `tailwind.config.ts` is not overriding the `borderRadius` theme key entirely
