# Content Area Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the app shell header height to h-14 and eliminate all double-padding, inconsistent gap values, and rogue header bars from page content across all four apps.

**Architecture:** Pure className sweep — no new components, no logic changes. Layer 1 fixes three shell files (header height + accessibility). Layer 2 removes `mt-6`/`mt-4` margin overrides, strips `px-6 pb-6` double-padding wrappers, normalizes `gap-5`/`gap-6`/`gap-8` to `gap-4`, and removes duplicate border-b header bars inside page content. The shell `<main>` stays `flex flex-1 flex-col gap-4 p-4`; all gap/spacing between page sections comes from the parent flex gap, not explicit margins.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS v3, pnpm monorepo. All files are `.tsx`.

---

## Governing Rules (read before every edit)

1. **Header height:** `h-14` on all `BreadcrumbHeader` / `PageHeader` components.
2. **Page root div:** `flex flex-col gap-4` — remove any `mt-*` from child divs; the parent gap handles spacing.
3. **No extra wrapper padding:** Never have `px-6`, `py-6`, `pb-6`, `p-6` on the page root or a direct child wrapper when the shell `<main>` already provides `p-4`.
4. **Gap values:** Only `gap-4` on page root divs and inner grids. Change `gap-5`/`gap-6`/`gap-8` → `gap-4`. Change `space-y-6` → `space-y-4`.
5. **max-w constraints:** Kept. If on the page root div, also add `flex flex-col gap-4` to it. If on a nested wrapper div with extra `px-*`/`py-*`, strip the padding and keep the max-w.
6. **Custom border-b page headers:** Remove entirely — the shell `BreadcrumbHeader` is the only sticky header.

---

## Task 1: App Shell — header heights and accessibility

**Files:**
- Modify: `apps/admin-portal/src/components/BreadcrumbHeader.tsx:27`
- Modify: `apps/admin-portal/src/components/AuthGuard.tsx:214`
- Modify: `apps/lab-lite/src/components/PageHeader.tsx:25`

- [ ] **Step 1: Fix admin-portal BreadcrumbHeader height**

In `apps/admin-portal/src/components/BreadcrumbHeader.tsx`, change line 27:

```tsx
// Before
<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">

// After
<header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
```

- [ ] **Step 2: Add id="main-content" to admin-portal AuthGuard**

In `apps/admin-portal/src/components/AuthGuard.tsx`, change line 214:

```tsx
// Before
<main className="flex flex-1 flex-col gap-4 p-4">

// After
<main id="main-content" className="flex flex-1 flex-col gap-4 p-4">
```

- [ ] **Step 3: Fix lab-lite PageHeader height**

In `apps/lab-lite/src/components/PageHeader.tsx`, change line 25:

```tsx
// Before
<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">

// After
<header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors introduced by these changes.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal/src/components/BreadcrumbHeader.tsx \
        apps/admin-portal/src/components/AuthGuard.tsx \
        apps/lab-lite/src/components/PageHeader.tsx
git commit -m "fix(shell): standardize header height to h-14 and add id=main-content"
```

---

## Task 2: Admin Portal — remove mt-* overrides and fix gap values

All admin-portal page files live under `apps/admin-portal/src/app/[locale]/`. The fix pattern is identical throughout: remove `mt-6` and `mt-4` class names from div elements (the parent `flex flex-col gap-4` already handles spacing), and change `gap-6`/`gap-8` to `gap-4` on grids and root containers.

**Files:**
- Modify: `apps/admin-portal/src/app/[locale]/dashboard/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/alerts/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/alerts/[alertId]/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/ai-models/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/audit/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/inventory/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/certifications/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/labs/[labId]/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/labs/[labId]/staff/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/network/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/patients/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/patients/[patientId]/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/patients/merge/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/providers/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/subscriptions/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/subscriptions/billing/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/subscriptions/invoices/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/mentorship/page.tsx`
- Modify: `apps/admin-portal/src/app/[locale]/settings/page.tsx`

- [ ] **Step 1: dashboard/page.tsx — remove 3× mt-6**

Lines 56, 131, 141. Remove `mt-6` from the className of each div:

```tsx
// Line 56 — Before
<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
// After
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

// Line 131 — Before
<div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
// After
<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

// Line 141 — Before
<div className="mt-6">
// After (remove the wrapper entirely — its only child is <RecentActivityFeed />)
<RecentActivityFeed />
```

- [ ] **Step 2: alerts/page.tsx — remove mt-6, mt-4**

Find and remove `mt-6` and `mt-4` from div classNames. Do not remove other classes — only remove the `mt-6` or `mt-4` token from the className string.

Examples of what to search for and fix:
```tsx
// Before (anywhere in the file)
className="mt-6 flex items-center gap-3"
// After
className="flex items-center gap-3"

// Before
className="mt-4 rounded-2xl border border-border overflow-hidden"
// After
className="rounded-2xl border border-border overflow-hidden"
```

- [ ] **Step 3: alerts/[alertId]/page.tsx — remove mt-* and fix gap-6**

Remove all `mt-6` and `mt-4` tokens from div classNames. Also change `gap-6` to `gap-4` on any grid div:

```tsx
// Before (find this pattern)
className="... gap-6 ..."
// After
className="... gap-4 ..."
```

- [ ] **Step 4: ai-models/page.tsx — fix root gap**

Find the root div (line ~101):
```tsx
// Before
<div className="flex flex-col gap-6">
// After
<div className="flex flex-col gap-4">
```

- [ ] **Step 5: audit/page.tsx — remove 5× mt-***

Remove all `mt-6` and `mt-4` tokens from div classNames in this file. Same pattern as Step 2.

- [ ] **Step 6: inventory/page.tsx — remove mt-6 and fix space-y**

```tsx
// Before
<div className="mt-6 space-y-6">
// After
<div className="space-y-4">
```

- [ ] **Step 7: certifications/page.tsx — remove mt-6 and mt-4**

Remove `mt-6` and `mt-4` tokens from div classNames. Same pattern as Step 2.

- [ ] **Step 8: labs/[labId]/page.tsx — remove mt-* and fix gap-6**

Remove `mt-6` and `mt-4` tokens. Change `gap-6` → `gap-4` on any grid. Same pattern as Step 3.

- [ ] **Step 9: labs/[labId]/staff/page.tsx — remove mt-6**

```tsx
// Before (find)
className="mt-6 overflow-x-auto ..."
// After
className="overflow-x-auto ..."
```

- [ ] **Step 10: network/page.tsx — remove mt-*, preserve border-t**

Remove `mt-4` and `mt-8` tokens. Keep `border-t` and `pt-6` if present (they serve as section dividers):

```tsx
// Before (find)
className="mt-4 flex gap-1 ..."
// After
className="flex gap-1 ..."

// Before (find)
className="mt-4 grid gap-4 ..."
// After
className="grid gap-4 ..."

// Before (find — the border-t divider)
className="mt-8 border-t border-border pt-6"
// After — remove mt-8, keep the divider styling
className="border-t border-border pt-6"
```

- [ ] **Step 11: patients/page.tsx — remove mt-4**

```tsx
// Before (find)
className="mt-4 overflow-hidden ..."
// After
className="overflow-hidden ..."
```

- [ ] **Step 12: patients/[patientId]/page.tsx — remove mt-* and fix gap-6**

Remove `mt-6` tokens. Change `gap-6` → `gap-4`. Same pattern as Step 3.

- [ ] **Step 13: patients/merge/page.tsx — remove 3× mt-6 and fix space-y**

```tsx
// Before (find — appears 3 times)
className="mt-6 space-y-6"
// After
className="space-y-4"
```

- [ ] **Step 14: providers/page.tsx — remove mt-4**

```tsx
// Before (find)
className="mt-4 overflow-hidden ..."
// After
className="overflow-hidden ..."
```

- [ ] **Step 15: subscriptions/page.tsx — remove mt-6 and fix gap-6**

Line 113 has `<div className="mt-6">` wrapping some content. Line 195 has `<div className="mt-6 flex gap-6">`.

```tsx
// Line 113 — Before
<div className="mt-6">
// After — remove the wrapper div, render its children directly

// Line 195 — Before
<div className="mt-6 flex gap-6">
// After
<div className="flex gap-4">
```

- [ ] **Step 16: subscriptions/billing/page.tsx — remove mt-6**

Find `<div className="mt-6">` and remove the wrapper div, rendering its children directly.

- [ ] **Step 17: subscriptions/invoices/page.tsx — remove mt-6 and mt-4**

Remove `mt-6` and `mt-4` tokens. Same pattern as Step 2.

- [ ] **Step 18: mentorship/page.tsx — remove mt-6 and mt-4**

Remove `mt-6` and `mt-4` tokens. Same pattern as Step 2.

- [ ] **Step 19: settings/page.tsx — fix root gap**

Find the root div of the page's return statement:
```tsx
// Before
<div className="flex flex-col gap-8">
// After
<div className="flex flex-col gap-4">
```

- [ ] **Step 20: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 21: Commit**

```bash
git add apps/admin-portal/src/app/
git commit -m "fix(admin-portal): remove mt-* overrides and normalize gap values in page content"
```

---

## Task 3: OPD Lite — strip px-6 pb-6 double-padding wrappers

Each affected page wraps its main component in a `<div className="px-6 pb-6">` (or similar) inside a `<div className="flex flex-col gap-4">`. The fix: remove the wrapper div and render the child component directly inside the outer flex container.

**Files:**
- Modify: `apps/opd-lite/src/app/[locale]/(app)/appointments/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(app)/conflicts/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(app)/duplicate-review/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(app)/expiring-consents/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(app)/kyc/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(app)/notifications/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(app)/register-patient/page.tsx`
- Modify: `apps/opd-lite/src/app/[locale]/(app)/settings/page.tsx`

- [ ] **Step 1: appointments/page.tsx**

This page has two wrapper divs with extra padding:

```tsx
// Before
export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const { viewMode, setViewMode } = useAppointmentStore()

  return (
    <div className="flex flex-col gap-4">
      {/* Day / Week toggle */}
      <div className="flex justify-end px-6 pb-4">
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          ...buttons...
        </div>
      </div>
      <div className="px-6 pb-6">
        {viewMode === 'day' ? <DayScheduleView /> : <WeekScheduleView />}
      </div>
    </div>
  )
}

// After — remove px-6 pb-4 and px-6 pb-6 wrappers, keep inner content
export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const { viewMode, setViewMode } = useAppointmentStore()

  return (
    <div className="flex flex-col gap-4">
      {/* Day / Week toggle */}
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          ...buttons...
        </div>
      </div>
      {viewMode === 'day' ? <DayScheduleView /> : <WeekScheduleView />}
    </div>
  )
}
```

- [ ] **Step 2: conflicts/page.tsx**

```tsx
// Before
export default function ConflictsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="px-6 pb-6">
        <ConflictList />
      </div>
    </div>
  )
}

// After
export default function ConflictsPage() {
  return (
    <div className="flex flex-col gap-4">
      <ConflictList />
    </div>
  )
}
```

- [ ] **Step 3: duplicate-review/page.tsx**

Find the `<div className="px-6 pb-6">` wrapper (line ~11) and unwrap it — render its child directly.

```tsx
// Before
<div className="flex flex-col gap-4">
  <div className="px-6 pb-6">
    <DuplicateReviewTable />
  </div>
</div>

// After
<div className="flex flex-col gap-4">
  <DuplicateReviewTable />
</div>
```

- [ ] **Step 4: expiring-consents/page.tsx**

Find the `<div className="px-6 pb-6">` wrapper (line ~66) and unwrap it.

```tsx
// Before
<div className="flex flex-col gap-4">
  ...other content...
  <div className="px-6 pb-6">
    <ExpiringConsentsList />
  </div>
</div>

// After
<div className="flex flex-col gap-4">
  ...other content...
  <ExpiringConsentsList />
</div>
```

- [ ] **Step 5: kyc/page.tsx — strip padding, keep max-w-2xl**

Find the `<div className="px-6 pb-6 max-w-2xl">` (line ~259) and remove only the padding classes:

```tsx
// Before
<div className="px-6 pb-6 max-w-2xl">

// After
<div className="max-w-2xl">
```

- [ ] **Step 6: notifications/page.tsx**

Find the `<div className="px-6 pb-6">` wrapper (line ~8) and unwrap it.

```tsx
// Before
<div className="flex flex-col gap-4">
  <div className="px-6 pb-6">
    <NotificationPanel />
  </div>
</div>

// After
<div className="flex flex-col gap-4">
  <NotificationPanel />
</div>
```

- [ ] **Step 7: register-patient/page.tsx — strip padding, keep max-w-3xl**

Find the `<div className="px-6 pb-6 max-w-3xl">` (line ~14) and remove only the padding classes:

```tsx
// Before
<div className="px-6 pb-6 max-w-3xl">

// After
<div className="max-w-3xl">
```

- [ ] **Step 8: settings/page.tsx — strip padding, keep max-w-2xl and space-y-6→space-y-4**

Find the `<div className="px-6 pb-6 max-w-2xl space-y-6">` (line ~34):

```tsx
// Before
<div className="px-6 pb-6 max-w-2xl space-y-6">

// After
<div className="max-w-2xl space-y-4">
```

- [ ] **Step 9: settings/data-budget/page.tsx — add flex col, remove mb-6 from heading**

```tsx
// Before
return (
  <div className="mx-auto max-w-3xl">
    <div className="flex items-center gap-2 mb-6">

// After
return (
  <div className="mx-auto max-w-3xl flex flex-col gap-4">
    <div className="flex items-center gap-2">
```

Remove `mb-6` from the heading row div (the parent `gap-4` provides the spacing).

- [ ] **Step 10: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/opd-lite/src/app/
git commit -m "fix(opd-lite): strip double-padding wrappers from page content"
```

---

## Task 4: Pharmacy Lite — add flex col gap-4 to page roots missing it

Both affected files have `<div className="mx-auto max-w-3xl">` as the page root without `flex flex-col gap-4`. Add the flex column layout to match the standard.

**Files:**
- Modify: `apps/pharmacy-lite/src/app/[locale]/(app)/settings/data-budget/page.tsx`
- Modify: `apps/pharmacy-lite/src/app/[locale]/(app)/register-patient/page.tsx`

- [ ] **Step 1: settings/data-budget/page.tsx**

Find the page's return root div. Add `flex flex-col gap-4`:

```tsx
// Before
<div className="mx-auto max-w-3xl">

// After
<div className="mx-auto max-w-3xl flex flex-col gap-4">
```

- [ ] **Step 2: register-patient/page.tsx**

Find the page's return root div. Add `flex flex-col gap-4`:

```tsx
// Before
<div className="mx-auto max-w-3xl">

// After
<div className="mx-auto max-w-3xl flex flex-col gap-4">
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/pharmacy-lite/src/app/
git commit -m "fix(pharmacy-lite): add flex col gap-4 to page roots"
```

---

## Task 5: Lab Lite — remove custom headers, fix gaps, strip double-padding

Lab Lite has three categories of fixes: remove custom in-page border-b header bars (achievements, portfolio), normalize gap values (7 pages), strip double-padding (certification, competency, mentorship), and add flex col layout to max-w root divs (5 pages).

**Files:**
- Modify: `apps/lab-lite/src/app/[locale]/(app)/achievements/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/portfolio/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/history/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/orders/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/sendouts/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/planner/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/network/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/certification/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/competency/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/mentorship/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/notifications/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/escalations/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/queue/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/consent/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/patients/register/page.tsx`
- Modify: `apps/lab-lite/src/app/[locale]/(app)/settings/data-budget/page.tsx`

**Category A — Remove custom border-b header bars**

- [ ] **Step 1: achievements/page.tsx — remove duplicate header, fix nested main tag**

The page currently has a custom border-b header div and uses a `<main>` tag inside the page content (wrong — the shell already has a `<main>`). Remove the header block entirely. Replace the nested `<main>` with a `<div>` and strip `px-6 py-6`. Keep `max-w-4xl mx-auto`.

```tsx
// Before
export default function AchievementsPage() {
  const t = useTranslations('achievements')

  return (
    <AuthGuard>
      <div className="border-b border-border bg-background">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Trophy size={24} className="text-primary" aria-hidden />
          <h1 className="text-lg font-semibold text-foreground">{t('teamAchievements')}</h1>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <TeamAchievementDashboard />
      </main>
    </AuthGuard>
  )
}

// After
export default function AchievementsPage() {
  return (
    <AuthGuard>
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <TeamAchievementDashboard />
      </div>
    </AuthGuard>
  )
}
```

Note: the `useTranslations` import and `t` variable can be removed if no longer used after this change. Remove the `Trophy` import too if unused.

- [ ] **Step 2: portfolio/page.tsx — remove custom border-b header bar**

Remove the `<div className="border-b border-border bg-background">` block and its children. The page title is already shown in the BreadcrumbHeader. The `<div className="flex">` layout block with the sidebar stays as-is.

```tsx
// Before (lines 44–62)
<AuthGuard>
  {/* Page header */}
  <div className="border-b border-border bg-background">
    <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
      <BarChart3 size={24} className="text-primary" aria-hidden />
      <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
      {selectedTechId && (
        <>
          <span className="text-muted-foreground">/</span>
          <button
            onClick={handleBackToSelf}
            className="text-sm text-primary hover:underline"
            aria-label="Back to my portfolio"
          >
            {t('backToMyPortfolio') || 'Back to my portfolio'}
          </button>
        </>
      )}
    </div>
  </div>

  <div className="flex">
    ...rest of layout...
  </div>
</AuthGuard>

// After — header block removed, flex layout stays
<AuthGuard>
  <div className="flex">
    ...rest of layout...
  </div>
</AuthGuard>
```

Note: Check if `BarChart3` import becomes unused after removing the header — remove it if so. Keep `Users` import (used in sidebar). Keep `t('backToMyPortfolio')` button logic since it's in the sidebar now... wait, `backToMyPortfolio` was in the removed header. If `t` is no longer used elsewhere, remove `useTranslations` too. Read the full file to confirm before removing.

**Category B — Normalize gap values**

- [ ] **Step 3: page.tsx (home dashboard) — gap-5 → gap-4**

```tsx
// Before (line 43)
<div className="flex flex-col gap-5">

// After
<div className="flex flex-col gap-4">
```

- [ ] **Step 4: history/page.tsx — gap-6 → gap-4 (2 occurrences)**

Find all `gap-6` in the file (2 occurrences on the flex-col div). Change both to `gap-4`.

```tsx
// Before (appears twice)
<div className="flex flex-col gap-6">

// After
<div className="flex flex-col gap-4">
```

- [ ] **Step 5: orders/page.tsx — gap-5 → gap-4**

```tsx
// Before (line 12)
<div className="flex flex-col gap-5">

// After
<div className="flex flex-col gap-4">
```

- [ ] **Step 6: sendouts/page.tsx — gap-6 → gap-4**

```tsx
// Before (line 74)
<div className="flex flex-col gap-6">

// After
<div className="flex flex-col gap-4">
```

- [ ] **Step 7: planner/page.tsx — gap-6 → gap-4, keep max-w-5xl**

```tsx
// Before (line 220)
<div className="mx-auto max-w-5xl flex flex-col gap-6">

// After
<div className="mx-auto max-w-5xl flex flex-col gap-4">
```

- [ ] **Step 8: network/page.tsx — gap-6 → gap-4**

```tsx
// Before (line 74)
<div className="flex flex-col gap-6">

// After
<div className="flex flex-col gap-4">
```

**Category C — Strip double-padding, fix space-y**

- [ ] **Step 9: certification/page.tsx — strip px-4 py-6, fix space-y-6**

```tsx
// Before (line 18)
<div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

// After
<div className="max-w-2xl mx-auto flex flex-col gap-4">
```

Note: `space-y-6` is replaced by the parent `flex flex-col gap-4`. Remove `space-y-6` entirely.

- [ ] **Step 10: competency/page.tsx — strip px-4 py-6, fix space-y-6**

```tsx
// Before (line 17)
<div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

// After
<div className="max-w-3xl mx-auto flex flex-col gap-4">
```

- [ ] **Step 11: mentorship/page.tsx — remove p-6, remove mb-6 from heading**

The root div is `<div className="p-6">` with an h1 that has `mb-6`. Replace with a flex column container and remove the heading margin:

```tsx
// Before
<AuthGuard>
  <div className="p-6">
    <h1 className="text-2xl font-semibold mb-6">{t('pageTitle')}</h1>
    {session ? (
      <MentorshipDashboard currentUserId={session.userId} />
    ) : (
      <div className="animate-pulse h-8 w-32 bg-gray-200 rounded" />
    )}
  </div>
</AuthGuard>

// After
<AuthGuard>
  <div className="flex flex-col gap-4">
    <h1 className="text-2xl font-semibold">{t('pageTitle')}</h1>
    {session ? (
      <MentorshipDashboard currentUserId={session.userId} />
    ) : (
      <div className="animate-pulse h-8 w-32 bg-gray-200 rounded" />
    )}
  </div>
</AuthGuard>
```

**Category D — Add flex col layout to max-w root divs**

For each of these files, the page root is a `<div className="mx-auto max-w-*">` without `flex flex-col gap-4`. Add the flex column layout.

- [ ] **Step 12: notifications/page.tsx**

```tsx
// Before (line ~80)
<div className="mx-auto max-w-3xl">

// After
<div className="mx-auto max-w-3xl flex flex-col gap-4">
```

- [ ] **Step 13: escalations/page.tsx**

```tsx
// Before (line 5)
<div className="mx-auto max-w-3xl">

// After
<div className="mx-auto max-w-3xl flex flex-col gap-4">
```

- [ ] **Step 14: queue/page.tsx**

```tsx
// Before (line 10)
<div className="mx-auto max-w-3xl">

// After
<div className="mx-auto max-w-3xl flex flex-col gap-4">
```

- [ ] **Step 15: consent/page.tsx**

```tsx
// Before (line 152)
<div className="mx-auto max-w-2xl">

// After
<div className="mx-auto max-w-2xl flex flex-col gap-4">
```

- [ ] **Step 16: patients/register/page.tsx**

```tsx
// Before (line 10)
<div className="mx-auto max-w-lg">

// After
<div className="mx-auto max-w-lg flex flex-col gap-4">
```

- [ ] **Step 17: settings/data-budget/page.tsx**

```tsx
// Before (line 13)
<div className="mx-auto max-w-3xl">

// After
<div className="mx-auto max-w-3xl flex flex-col gap-4">
```

- [ ] **Step 18: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors. If there are errors about unused imports (e.g., `Trophy`, `BarChart3`, `useTranslations`), remove those imports.

- [ ] **Step 19: Commit**

```bash
git add apps/lab-lite/src/app/
git commit -m "fix(lab-lite): remove custom page headers, normalize gaps, strip double-padding"
```

---

## Self-review notes for implementer

- In `achievements/page.tsx`, verify `useTranslations` and `Trophy` imports are removed if unused after stripping the header.
- In `portfolio/page.tsx`, verify `BarChart3` import is removed if unused. Check whether `t('backToMyPortfolio')` appears elsewhere in the file; if not, remove `useTranslations` too.
- In `mentorship/page.tsx` (lab-lite), read the surrounding code at line 23 before deciding whether to unwrap the `<div className="p-6">` or just strip the class.
- In `dashboard/page.tsx` (admin-portal) line 141, the `<div className="mt-6">` wraps only `<RecentActivityFeed />`. Remove the wrapper div and render `<RecentActivityFeed />` directly.
- In `subscriptions/page.tsx` and `subscriptions/billing/page.tsx`, if the `<div className="mt-6">` wrapper has no other children besides one component, remove the wrapper div.
- All `space-y-6` replacements: replace with `space-y-4` unless the div is being converted to `flex flex-col gap-4`, in which case remove `space-y-*` entirely (flex gap replaces it).
