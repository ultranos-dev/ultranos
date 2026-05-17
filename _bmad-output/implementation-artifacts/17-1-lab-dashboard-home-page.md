# Story 17.1: Lab Dashboard Home Page

Status: done

## Story

As a lab technician,
I want to see a dashboard after login showing my lab's activity at a glance,
so that I can quickly understand what needs my attention.

## Acceptance Criteria

1. **Given** an authenticated lab technician, **when** they arrive at the `/` route, **then** the "Coming Soon" placeholder is replaced with a functional dashboard
2. **And** the dashboard displays a lab identity card showing the lab name and technician name (from auth session store)
3. **And** an upload queue status card shows: pending count, uploading count, expired count, failed count (read from Dexie `uploadQueue` table)
4. **And** a today's activity summary card shows: uploads completed today, results pending review (from Hub API `diagnosticReport.listByLab`)
5. **And** a quick action button "Upload New Result" navigates to `/upload` (Story 17.2)
6. **And** a recent uploads list shows the last 10 uploads with status badges (success/pending/failed/expired) — sourced from both local Dexie queue and Hub API `diagnosticReport.listByLab`
7. **And** the dashboard auto-refreshes every 60 seconds (both local queue counts and Hub API data)
8. **And** the layout is responsive, uses Tailwind CSS, and follows the fulfillment theme (action-oriented, greens/ambers for task completion tracking)

## Tasks / Subtasks

- [x] Task 1: Replace the "Coming Soon" placeholder page (AC: #1)
  - [x] 1.1 Replace content of `apps/lab-lite/src/app/page.tsx` with dashboard component
  - [x] 1.2 Mark page as `'use client'` (needs hooks for data fetching, intervals)

- [x] Task 2: Build the dashboard layout with cards (AC: #2, #3, #4, #5)
  - [x] 2.1 Create `apps/lab-lite/src/components/dashboard/LabIdentityCard.tsx` — lab name + technician name from `useAuthSessionStore`
  - [x] 2.2 Create `apps/lab-lite/src/components/dashboard/QueueStatusCard.tsx` — reads Dexie queue counts by status
  - [x] 2.3 Create `apps/lab-lite/src/components/dashboard/ActivitySummaryCard.tsx` — calls Hub API for today's uploads/pending counts
  - [x] 2.4 Create `apps/lab-lite/src/components/dashboard/QuickActions.tsx` — "Upload New Result" button linking to `/upload`

- [x] Task 3: Build the recent uploads list (AC: #6)
  - [x] 3.1 Create `apps/lab-lite/src/components/dashboard/RecentUploadsList.tsx`
  - [x] 3.2 Merge local Dexie queue items (pending/uploading/failed/expired) with Hub API results (completed)
  - [x] 3.3 Sort by timestamp descending, limit to 10 items
  - [x] 3.4 Render status badges: green=completed, yellow=pending/uploading, red=failed, gray=expired

- [x] Task 4: Add tRPC client functions for dashboard data (AC: #4, #6)
  - [x] 4.1 Add `listLabReports(token, opts?)` to `apps/lab-lite/src/lib/trpc.ts` — calls `diagnosticReport.listByLab`
  - [x] 4.2 Returns: `{ reports: Array<{ id, status, loincDisplay, collectionDate, issued }>, nextCursor? }`

- [x] Task 5: Implement auto-refresh (AC: #7)
  - [x] 5.1 Create `apps/lab-lite/src/hooks/useDashboardData.ts` — custom hook managing both Dexie reads and Hub API calls
  - [x] 5.2 Set 60-second `setInterval` for refresh cycle
  - [x] 5.3 Include cleanup on unmount

- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Dashboard renders all 4 card sections
  - [x] 6.2 Queue status card reads correct counts from Dexie (mock `fake-indexeddb`)
  - [x] 6.3 Recent uploads list merges local + remote data correctly
  - [x] 6.4 Quick action button links to `/upload`
  - [x] 6.5 Auto-refresh interval fires and updates data

## Dev Notes

### Current State of `page.tsx`

The file at `apps/lab-lite/src/app/page.tsx` is a simple "Coming Soon" placeholder (12 lines). Replace entirely with the dashboard.

### Auth Session Store

`useAuthSessionStore` (in `apps/lab-lite/src/stores/auth-session-store.ts`) provides:
```typescript
{ userId, practitionerId, role, sessionId, email }
```
The lab name is NOT currently in the store — it's resolved server-side via `labRestrictedProcedure`. Options:
- **Option A (recommended):** Add a `labName` and `technicianName` field to the auth session store, populated during `AuthGuard` session setup (decode from JWT custom claims or fetch once from Hub API on login)
- **Option B:** Fetch lab name on dashboard mount via a new Hub API endpoint

Go with **Option A** — add `labName` and `technicianName` to the session store during auth initialization. The lab name is stable and caching it avoids a round-trip on every dashboard load.

### Queue Status from Dexie

Use `getQueueItems()` from `apps/lab-lite/src/lib/db.ts` and filter by status:
```typescript
const items = await getQueueItems()
const pending = items.filter(i => i.status === 'pending').length
const uploading = items.filter(i => i.status === 'uploading').length
const expired = items.filter(i => i.status === 'expired').length
const failed = items.filter(i => i.status === 'failed').length
```

### Hub API Endpoint for Activity Summary

Use `diagnosticReport.listByLab` (already implemented in Story 16.8):
- Scoped to the requesting technician's lab via `labRestrictedProcedure`
- Returns: `{ reports: DiagnosticReport[], nextCursor? }`
- Filter client-side for "today's" reports by comparing `issued` timestamp to start of current day
- Count completed vs pending (status = 'preliminary' vs 'final')

### Layout & Theme

The layout.tsx wraps content in `<main className="mx-auto max-w-2xl px-4 py-6">`. The dashboard may need wider layout — consider using `max-w-4xl` or full-width grid for the card layout. If changing layout width, update in `layout.tsx` or use a dashboard-specific wrapper.

**Fulfillment theme tokens** (from UX spec):
- Light surface background: `bg-[#e8ebe6]` or `bg-neutral-50` (already set in body)
- Positive green for completion: `text-green-700` / `bg-green-50`
- Amber for pending/warning: `text-amber-700` / `bg-amber-50`
- Red for failures: `text-red-700` / `bg-red-50`
- Gray for expired: `text-neutral-400` / `bg-neutral-100`

### Known Limitation: Activity Summary Count

`listLabReports` fetches a maximum of 20 reports. For labs processing >20 reports/day, the "Today's Activity" counts may under-report. A server-side count endpoint is the proper fix (future story).

### Data Minimization

The dashboard must NOT display patient names, IDs, or any PHI. Recent uploads list can show: test category (LOINC display), upload timestamp, status. Never patient demographics.

### Project Structure Notes

**New files:**
- `apps/lab-lite/src/components/dashboard/LabIdentityCard.tsx`
- `apps/lab-lite/src/components/dashboard/QueueStatusCard.tsx`
- `apps/lab-lite/src/components/dashboard/ActivitySummaryCard.tsx`
- `apps/lab-lite/src/components/dashboard/QuickActions.tsx`
- `apps/lab-lite/src/components/dashboard/RecentUploadsList.tsx`
- `apps/lab-lite/src/hooks/useDashboardData.ts`
- `apps/lab-lite/src/__tests__/dashboard.test.tsx`

**Modified files:**
- `apps/lab-lite/src/app/page.tsx` — replace Coming Soon with dashboard
- `apps/lab-lite/src/stores/auth-session-store.ts` — add `labName`, `technicianName` fields
- `apps/lab-lite/src/lib/trpc.ts` — add `listLabReports()` function
- `apps/lab-lite/src/components/AuthGuard.tsx` — populate labName/technicianName on session init

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-17.1] — Story acceptance criteria
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#LAB-G01] — Dashboard is "Coming Soon" placeholder (CRITICAL)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — Fulfillment theme: action-oriented, greens/ambers
- [Source: apps/lab-lite/src/app/page.tsx] — Current "Coming Soon" placeholder to replace
- [Source: apps/lab-lite/src/stores/auth-session-store.ts] — Auth session store (needs labName addition)
- [Source: apps/lab-lite/src/lib/db.ts] — Dexie queue operations (getQueueItems, getQueueCount)
- [Source: apps/hub-api/src/trpc/routers/diagnostic-report.ts#listByLab] — Hub API endpoint for lab's reports
- [Source: apps/lab-lite/src/lib/trpc.ts] — tRPC client (add listLabReports)

### Previous Epic Intelligence (from Epic 12)

- Lab-lite uses **raw fetch** for tRPC calls (not typed tRPC client) — follow the same pattern in `trpc.ts`
- Auth session store is Zustand — follow the existing `create<>()` pattern
- Test with `fake-indexeddb` for Dexie operations
- Vitest + React Testing Library for component tests
- `AuthGuard` already decodes JWT and populates session store — extend it there for labName

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — no blocking issues encountered.

### Completion Notes List

- Replaced "Coming Soon" placeholder with a fully functional dashboard page (`'use client'`)
- Added `labName` and `technicianName` fields to `AuthSession` interface and populated them from `user_metadata` in `AuthGuard`
- Built 5 dashboard components: LabIdentityCard, QueueStatusCard, ActivitySummaryCard, QuickActions, RecentUploadsList
- Added `listLabReports()` tRPC client function using raw fetch pattern (consistent with existing lab-lite approach)
- Created `useDashboardData` hook with 60-second auto-refresh (setInterval + cleanup on unmount)
- Merges local Dexie queue items with Hub API reports, sorted by timestamp descending, limited to 10
- Hub API failure is graceful — local queue data still displays (offline-friendly)
- No PHI displayed — only LOINC display names, timestamps, and status badges
- Fulfillment theme applied: green for completed, amber for pending/uploading, red for failed, gray for expired
- 11 comprehensive tests covering all 8 acceptance criteria — all pass
- 1 pre-existing test failure in `patient-verify-scanner.test.tsx` (unrelated to dashboard changes)

### File List

**New files:**
- `apps/lab-lite/src/components/dashboard/LabIdentityCard.tsx`
- `apps/lab-lite/src/components/dashboard/QueueStatusCard.tsx`
- `apps/lab-lite/src/components/dashboard/ActivitySummaryCard.tsx`
- `apps/lab-lite/src/components/dashboard/QuickActions.tsx`
- `apps/lab-lite/src/components/dashboard/RecentUploadsList.tsx`
- `apps/lab-lite/src/hooks/useDashboardData.ts`
- `apps/lab-lite/src/__tests__/dashboard.test.tsx`

**Modified files:**
- `apps/lab-lite/src/app/page.tsx` — replaced Coming Soon with dashboard
- `apps/lab-lite/src/stores/auth-session-store.ts` — added `labName`, `technicianName` fields
- `apps/lab-lite/src/lib/trpc.ts` — added `listLabReports()` function
- `apps/lab-lite/src/components/AuthGuard.tsx` — populated labName/technicianName from user_metadata

### Review Findings

- [x] [Review][Decision] "success" vs "completed" badge label — AC #6 specifies "success/pending/failed/expired" but code uses "completed". Spec Task 3.4 says "green=completed". Resolved: keep "Completed" — clearer for lab technicians.
- [x] [Review][Decision] Today's activity under-counts when >20 reports exist — `listLabReports` fetches limit:20, so todayUploadsCompleted/todayResultsPending may be inaccurate for busy labs. Resolved: accepted, documented as known limitation. Server-side count endpoint deferred to future story.
- [x] [Review][Patch] Hub API auth errors silently swallowed [useDashboardData.ts:110-112] — inner catch now sets warning: "Remote data unavailable — showing local queue only"
- [x] [Review][Patch] No abort/cleanup for in-flight fetches on unmount [useDashboardData.ts:128-135] — added cancelledRef guard, checked before all setState calls
- [x] [Review][Patch] getQueueItems() failure takes down entire dashboard [useDashboardData.ts:78] — local and remote fetches now wrapped independently
