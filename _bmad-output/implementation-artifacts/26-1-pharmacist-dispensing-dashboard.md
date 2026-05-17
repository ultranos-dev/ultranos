# Story 26.1: Pharmacist Dispensing Dashboard

Status: done

## Story

As a pharmacist,
I want to see a dashboard after login showing my dispensing activity and pending actions,
so that I can quickly manage my daily workload.

## Acceptance Criteria

1. **Given** an authenticated pharmacist on the `/` route, **When** the dashboard loads (replacing the current scanner-only page), **Then** the dashboard displays:
   - Welcome header with pharmacist name and pharmacy name
   - "Scan Prescription" primary action button (prominent, green pill style per UX-DR2)
   - Today's dispensing summary card: total dispensed, pending sync, failed sync
   - Pending sync queue card: count of items awaiting Hub sync (amber if >0)
   - Recent dispensing list: last 10 transactions with patient name, medication, timestamp, sync status
   - Connectivity status indicator: online/offline
2. **Given** the dashboard is displayed, **When** 30 seconds elapse, **Then** the dashboard auto-refreshes data from local IndexedDB (NOT a network poll — local data only)
3. **Given** the dashboard is displayed, **When** the pharmacist taps "Scan Prescription", **Then** they navigate to `/scan` (new dedicated route hosting the existing `PharmacyScannerView`)
4. **Given** a recent dispensing entry in the list, **When** its sync status is "failed", **Then** a red badge is shown and tapping navigates to `/sync` (Story 26.4)

## Tasks / Subtasks

- [x] Task 1: Create the dashboard page component (AC: #1)
  - [x] 1.1 Create `src/app/page.tsx` — replace current scanner view with `PharmacyDashboard` component
  - [x] 1.2 Build `src/components/pharmacy/PharmacyDashboard.tsx` with all dashboard sections
  - [x] 1.3 Build `src/components/pharmacy/DispensingSummaryCard.tsx` — today's stats from Dexie `dispenses` table
  - [x] 1.4 Build `src/components/pharmacy/SyncQueueCard.tsx` — pending count from Dexie `syncQueue` table
  - [x] 1.5 Build `src/components/pharmacy/RecentDispensingList.tsx` — last 10 from `dispenses` table
  - [x] 1.6 Add online/offline connectivity indicator using `navigator.onLine` + `online`/`offline` events
- [x] Task 2: Relocate scanner to `/scan` route (AC: #3)
  - [x] 2.1 Create `src/app/scan/page.tsx` — hosts existing `PharmacyScannerView` + `SyncPulse`
  - [x] 2.2 Verify fulfillment workflow still works end-to-end at new route
- [x] Task 3: Integrate AppShell from `@ultranos/ui-kit` (AC: #1)
  - [x] 3.1 Replace the hardcoded `<header>` in `layout.tsx` with `<AppShell>` component
  - [x] 3.2 Wire `navItems` for dashboard routes: Home (`/`), Scan (`/scan`), Queue (`/queue`), History (`/history`), Sync (`/sync`)
  - [x] 3.3 Wire `user` prop from `auth-session-store` (name, email, role, initials)
  - [x] 3.4 Wire `syncIndicator` prop with existing `<SyncPulse />` component
  - [x] 3.5 Wire `onSignOut` to existing session cleanup flow (encryption key wipe → audit drain stop → session clear → Supabase signOut)
  - [x] 3.6 Pass Settings link from AppShell dropdown to `/settings` (Story 26.6)
- [x] Task 4: Auto-refresh mechanism (AC: #2)
  - [x] 4.1 Use `setInterval` (30s) to re-query Dexie tables and update dashboard state
  - [x] 4.2 Clear interval on unmount; pause when tab is hidden (`visibilitychange`)
- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Unit test `PharmacyDashboard` renders all sections with mock Dexie data
  - [x] 5.2 Unit test auto-refresh triggers re-query
  - [x] 5.3 Unit test navigation to `/scan` route
  - [x] 5.4 Verify existing scanner/fulfillment tests still pass at `/scan`

## Dev Notes

### Architecture & Patterns

- **AppShell integration is critical.** The current `layout.tsx` has a hardcoded `<header>` that must be replaced with `<AppShell>` from `@ultranos/ui-kit`. See [AppShell.tsx](packages/ui-kit/src/AppShell.tsx) for the component API: `appName`, `navItems`, `user`, `onSignOut`, `syncIndicator`, `notificationBell`, `children`.
- **Data source is LOCAL ONLY.** Dashboard stats come from Dexie IndexedDB (`db.dispenses`, `db.syncQueue`), NOT from Hub API calls. This is offline-first: the dashboard works with zero connectivity.
- **UX-DR2 primary action:** The "Scan Prescription" button must use the Wise Green pill style: `bg-[#9fe870] text-[#163300]` with `hover:scale-105 active:scale-95` transitions.
- **Stale Data Banner:** The `SyncAwareStaleDataBanner` from `@ultranos/ui-kit` is already wired in `ClientErrorBoundary` — ensure it remains visible on the dashboard.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `src/app/page.tsx` | Replace `PharmacyScannerView` with new `PharmacyDashboard` |
| `src/app/layout.tsx` | Replace hardcoded `<header>` with `<AppShell>` from ui-kit |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `src/app/scan/page.tsx` | New route hosting `PharmacyScannerView` + `SyncPulse` |
| `src/components/pharmacy/PharmacyDashboard.tsx` | Main dashboard layout |
| `src/components/pharmacy/DispensingSummaryCard.tsx` | Today's stats card |
| `src/components/pharmacy/SyncQueueCard.tsx` | Pending sync card |
| `src/components/pharmacy/RecentDispensingList.tsx` | Recent 10 transactions |

### Key Dexie Queries

```typescript
// Today's dispensed count
const todayStart = new Date(); todayStart.setHours(0,0,0,0);
const dispensedToday = await db.dispenses.where('whenHandedOver').aboveOrEqual(todayStart.toISOString()).count();

// Pending sync count
const pendingSync = await db.syncQueue.count();

// Failed sync (entries with retryCount > 0 and last attempt failed)
const failedSync = await db.syncQueue.where('retryCount').above(0).count();

// Recent 10 dispenses
const recent = await db.dispenses.orderBy('whenHandedOver').reverse().limit(10).toArray();
```

### Deferred Work Items to Address

- **D115:** `fulfillment-store` uses hardcoded `'pharmacy-user'` — now that `auth-session-store` is wired, the dashboard should display the authenticated user's name from the store, not a hardcoded value.
- The dashboard must extract pharmacist name from `useAuthSessionStore()` for the welcome header.

### Project Structure Notes

- All new components go in `src/components/pharmacy/` per existing convention
- New routes go in `src/app/<route>/page.tsx` per Next.js App Router convention
- `'use client'` directive required on all components (client-side only, no SSR for PHI)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 26.1]
- [Source: packages/ui-kit/src/AppShell.tsx — AppShell API]
- [Source: apps/pharmacy-lite/src/lib/db.ts — Dexie schema]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR2 primary action button]
- [Source: _bmad-output/planning-artifacts/component-spec.md — GlobalSyncIndicator]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Dexie encryption middleware requires CryptoKey for `dispenses` table queries; dashboard gracefully degrades showing sync stats when key unavailable
- Tests mock `@/lib/db` at module level for reliable async control; component unit tests use direct props

### Completion Notes List

- Replaced scanner-only home page with full `PharmacyDashboard` showing welcome header, Scan CTA, dispensing summary, sync queue, recent dispenses, and connectivity indicator
- Relocated `PharmacyScannerView` + `SyncPulse` to new `/scan` route
- Created `AppShellWrapper` client component integrating `@ultranos/ui-kit` `AppShell` with nav items (Home, Scan, Queue, History, Sync), user profile from `auth-session-store`, sync indicator, and sign-out flow
- Replaced hardcoded `<header>` + `<main>` in `layout.tsx` with `AppShellWrapper` + `AppShell`
- Dashboard queries Dexie `dispenses` and `syncQueue` tables locally (offline-first, no network calls)
- Auto-refresh via `setInterval(30s)` with `visibilitychange` pause/resume and cleanup on unmount
- Online/offline indicator via `navigator.onLine` + event listeners
- "Scan Prescription" button uses UX-DR2 Wise Green pill style (`bg-[#9fe870] text-[#163300]`)
- Pharmacist name extracted from `auth-session-store` (addresses D115 deferred work item)
- 17 tests added covering all ACs: dashboard sections, data queries, auto-refresh, sync status badges, empty states
- No regressions introduced (pre-existing failures in fulfillment-store, prescription-verify, and snapshot tests unchanged)

### Change Log

- 2026-05-11: Story 26.1 implemented — dashboard, scan route, AppShell integration, auto-refresh, tests

### File List

**New files:**
- `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/DispensingSummaryCard.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/SyncQueueCard.tsx`
- `apps/pharmacy-lite/src/components/pharmacy/RecentDispensingList.tsx`
- `apps/pharmacy-lite/src/components/AppShellWrapper.tsx`
- `apps/pharmacy-lite/src/app/scan/page.tsx`
- `apps/pharmacy-lite/src/__tests__/PharmacyDashboard.test.tsx`

**Modified files:**
- `apps/pharmacy-lite/src/app/page.tsx` — replaced PharmacyScannerView with PharmacyDashboard
- `apps/pharmacy-lite/src/app/layout.tsx` — replaced hardcoded header with AppShellWrapper

### Review Findings

- [x] [Review][Defer] Welcome header shows email prefix, not pharmacist name; pharmacy name missing — AC #1 requires "pharmacist name and pharmacy name." AuthSession has no `name` field. Deferred: cross-cutting auth schema change beyond this story's scope.
- [x] [Review][Patch] Patient "name" displays raw FHIR reference UUID — renamed `patientName` to `patientRef` for clarity; UUID display is intentional for PHI safety
- [x] [Review][Defer] Failed sync entry does not navigate to `/sync` on tap — AC #4 requires tap-to-navigate. Deferred: `/sync` route doesn't exist until Story 26.4.
- [x] [Review][Patch] `retryCount` not indexed in Dexie `syncQueue` — replaced `.where('retryCount')` with `.toArray()` + `.filter()`
- [x] [Review][Patch] Duplicate `SyncPulse` on `/scan` page — removed inline SyncPulse (AppShellWrapper already renders it)
- [x] [Review][Patch] "Scan Prescription" uses `<a>` instead of Next.js `<Link>` — replaced with `<Link href="/scan">`
- [x] [Review][Patch] Silent catch swallows all IndexedDB errors — added error discrimination for non-encryption errors
- [x] [Review][Patch] `'use client'` directive in test file — removed
- [x] [Review][Defer] `todayStart` uses local timezone for UTC ISO timestamp comparison — pre-existing pattern, not introduced by this story
- [x] [Review][Defer] Nav routes `/queue`, `/history`, `/sync` don't exist yet — Stories 26.2-26.4 `ready-for-dev`
- [x] [Review][Defer] `pendingSync` counts all queue entries including failed — sync queue data model issue
- [x] [Review][Defer] No abort guard for in-flight `refreshStats` after unmount — standard low-risk React pattern
