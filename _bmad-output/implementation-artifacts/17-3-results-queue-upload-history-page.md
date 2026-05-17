# Story 17.3: Results Queue & Upload History Page

Status: done

## Story

As a lab technician,
I want to view all my uploads and their processing status,
so that I can track pending items and re-upload expired ones.

## Acceptance Criteria

1. **Given** an authenticated lab technician navigating to `/history`, **when** the page loads, **then** a filterable list of all upload queue entries is displayed with: patient first name, test category, upload date, status (pending/uploading/completed/expired/failed)
2. **And** status badges are color-coded: green=completed, yellow=pending, orange=uploading, red=failed, gray=expired
3. **And** expired items show a "Re-upload" button that pre-fills the upload wizard with the same metadata
4. **And** failed items show the failure reason (generic, never PHI) and a "Discard" button with confirmation
5. **And** a search bar allows filtering by patient first name or test category
6. **And** pagination is used if >20 items exist
7. **And** the list merges local Dexie queue items (pending/uploading/failed/expired) with Hub API results (completed uploads from `diagnosticReport.listByLab`)

## Tasks / Subtasks

- [x] Task 1: Create the `/history` route (AC: #1)
  - [x] 1.1 Create `apps/lab-lite/src/app/history/page.tsx` — client component
  - [x] 1.2 Fetch local Dexie queue items + Hub API completed reports on mount

- [x] Task 2: Build the unified upload list (AC: #1, #7)
  - [x] 2.1 Create `apps/lab-lite/src/components/history/UploadHistoryList.tsx`
  - [x] 2.2 Create `apps/lab-lite/src/hooks/useUploadHistory.ts` — merges Dexie + Hub API data into unified list
  - [x] 2.3 Normalize both sources into common shape: `{ id, patientFirstName, testCategory, uploadDate, status, source: 'local'|'remote' }`
  - [x] 2.4 Sort by uploadDate descending (newest first)

- [x] Task 3: Status badges and actions (AC: #2, #3, #4)
  - [x] 3.1 Create `apps/lab-lite/src/components/history/StatusBadge.tsx` — color-coded status pill
  - [x] 3.2 Expired items: "Re-upload" navigates to `/upload?reupload={queueId}` — upload page reads metadata from Dexie and pre-fills wizard
  - [x] 3.3 Failed items: show generic reason ("Upload failed after 3 retries"), "Discard" with confirmation dialog → calls `removeQueueItem(id)` + emits `QUEUE_ITEM_DISCARDED` audit event

- [x] Task 4: Search and filtering (AC: #5)
  - [x] 4.1 Add search input at top of list
  - [x] 4.2 Filter both local and remote items by patient first name or test category (case-insensitive substring match)

- [x] Task 5: Pagination (AC: #6)
  - [x] 5.1 Client-side pagination for local items (all loaded from Dexie)
  - [x] 5.2 Cursor-based pagination for Hub API results (use `nextCursor` from `diagnosticReport.listByLab`)
  - [x] 5.3 Show 20 items per page with "Load More" button (not traditional page numbers)

- [x] Task 6: Tests (AC: all)
  - [x] 6.1 List renders both local and remote items in correct order
  - [x] 6.2 Status badges render correct colors
  - [x] 6.3 "Re-upload" navigates to upload wizard with pre-fill params
  - [x] 6.4 "Discard" shows confirmation and removes item + emits audit
  - [x] 6.5 Search filters items correctly
  - [x] 6.6 Pagination shows 20 items, "Load More" fetches next page

## Dev Notes

### Merging Local + Remote Data

**Local data (Dexie):** Pending/uploading/failed/expired items that haven't reached the Hub yet.
**Remote data (Hub API):** Successfully uploaded DiagnosticReports.

These are **disjoint sets** — an item is local until the drain worker uploads it, at which point it's removed from Dexie and exists only on the Hub. The merge is a simple concatenation, not a dedup.

**Unified item shape:**
```typescript
interface UploadHistoryItem {
  id: string                    // Dexie numeric id (as string) or Hub UUID
  patientFirstName: string      // From Dexie entry or Hub report (data-minimized)
  testCategory: string          // loincDisplay
  uploadDate: string            // queuedAt (local) or issued (remote)
  status: 'pending' | 'uploading' | 'completed' | 'expired' | 'failed'
  source: 'local' | 'remote'
  localQueueId?: number         // For re-upload/discard actions (local items only)
}
```

### Hub API `diagnosticReport.listByLab` Response Mapping

The endpoint returns:
```typescript
{ reports: Array<{ id, status, loincCode, loincDisplay, collectionDate, issued, ... }>, nextCursor? }
```

Map to unified shape:
- `status`: DiagnosticReport status 'preliminary' → 'completed' (it's on the Hub = upload succeeded)
- `patientFirstName`: NOT returned by this endpoint (data minimization — it returns `patientRef` which is opaque). For remote items, show "Patient verified" or the test category as the primary label. Do NOT call `verifyPatient` to reverse-lookup names — that defeats data minimization.

**Important:** The `listByLab` endpoint does NOT return patient names. Remote items in the history should display the test category as the primary identifier, not patient name. Only local items (from Dexie) have `patientFirstName` stored.

### Re-upload Flow

When "Re-upload" is clicked on an expired item:
1. Read the queue entry from Dexie by ID
2. Navigate to `/upload?reupload={queueId}`
3. Upload wizard page detects `reupload` query param
4. Loads metadata from Dexie: patientRef, patientFirstName, loincCode, collectionDate
5. Pre-fills wizard at Step 2 (file upload) since patient is already verified
6. The file itself may be stale — require new file upload but pre-fill metadata

After re-upload submit: reset the original expired item's status to `pending` and update `queuedAt` to now (same pattern as existing `UploadQueue.tsx` re-upload logic).

### Discard Flow

When "Discard" is clicked on a failed item:
1. Show confirmation: "Discard this upload? This cannot be undone."
2. On confirm: `removeQueueItem(id)` from Dexie
3. Emit `reportQueueAuditEvent({ action: 'QUEUE_ITEM_DISCARDED', queueEntryId: id, testCategory, patientRef, timestamp })`
4. Refresh the list

This mirrors the existing `UploadQueue.tsx` discard logic — reuse the same patterns.

### Existing `UploadQueue.tsx` Component

There is an existing `UploadQueue.tsx` component from Story 12.5 that displays the local queue. This story creates a **new, more comprehensive history page** that includes both local and remote data. The existing component can be kept for inline dashboard use or deprecated in favor of the history page. Do NOT delete it — the dashboard (17.1) may use it inline.

### Navigation

Add a "History" link to the app header (in `layout.tsx`) or as a dashboard card link. The header currently has only the title "Lab Diagnostics Portal". Consider adding a simple nav with: Dashboard | Upload | History.

This requires modifying `apps/lab-lite/src/app/layout.tsx` to add navigation links. Keep it minimal — three text links in the header bar.

### Project Structure Notes

**New files:**
- `apps/lab-lite/src/app/history/page.tsx` — history page route
- `apps/lab-lite/src/components/history/UploadHistoryList.tsx` — unified list component
- `apps/lab-lite/src/components/history/StatusBadge.tsx` — color-coded status pill
- `apps/lab-lite/src/hooks/useUploadHistory.ts` — data merging hook
- `apps/lab-lite/src/__tests__/upload-history.test.tsx`

**Modified files:**
- `apps/lab-lite/src/app/layout.tsx` — add navigation links (Dashboard, Upload, History)
- `apps/lab-lite/src/lib/trpc.ts` — add `listLabReports()` if not already added in 17.1

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-17.3] — Story acceptance criteria
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#LAB-G03] — Upload history gap
- [Source: apps/lab-lite/src/components/UploadQueue.tsx] — Existing queue display (local only)
- [Source: apps/lab-lite/src/lib/db.ts] — Dexie operations (getQueueItems, removeQueueItem, updateQueueItemStatus)
- [Source: apps/lab-lite/src/lib/queue-audit.ts] — Audit event reporting (QUEUE_ITEM_DISCARDED)
- [Source: apps/hub-api/src/trpc/routers/diagnostic-report.ts#listByLab] — Hub API endpoint for lab's reports

### Previous Epic Intelligence (from Epic 12)

- `UploadQueue.tsx` already has discard + re-upload patterns — follow the same UX flow
- `removeQueueItem()` and `updateQueueItemStatus()` are the Dexie mutation functions
- Queue audit events use `reportQueueAuditEvent()` fire-and-forget pattern
- Expired items use `updateQueueItemStatus(id, 'pending', { retryCount: 0, lastAttemptAt: null })` and update `queuedAt`
- Status badges should match the existing UploadQueue color scheme for consistency

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A — clean implementation, no debugging required.

### Completion Notes List
- Created `/history` route with AuthGuard wrapping, loading state, and error display
- Built `useUploadHistory` hook that merges local Dexie queue items with Hub API `diagnosticReport.listByLab` results into a unified `UploadHistoryItem` shape, sorted by date descending
- Remote items display test category as primary label (data minimization — no patient names from Hub API)
- Local items display patient first name + test category
- StatusBadge component with color-coded pills: green=completed, yellow=pending, orange=uploading, red=failed, gray=expired
- Re-upload button on expired items navigates to `/upload?reupload={queueId}` for wizard pre-fill
- Discard button on failed items shows inline confirmation dialog, calls `removeQueueItem()` + emits `QUEUE_ITEM_DISCARDED` audit event
- Search bar filters by patient first name or test category (case-insensitive substring match)
- Cursor-based pagination for Hub API results with "Load More" button (20 items per page)
- Added Dashboard | Upload | History navigation links to layout header
- 14 tests covering all acceptance criteria — all pass
- Pre-existing `patient-verify-scanner.test.tsx` failure is unrelated (QR scanning mock issue from prior story)

### File List
**New files:**
- `apps/lab-lite/src/app/history/page.tsx`
- `apps/lab-lite/src/components/history/UploadHistoryList.tsx`
- `apps/lab-lite/src/components/history/StatusBadge.tsx`
- `apps/lab-lite/src/hooks/useUploadHistory.ts`
- `apps/lab-lite/src/__tests__/upload-history.test.tsx`

**Modified files:**
- `apps/lab-lite/src/app/layout.tsx` — added Link import and Dashboard/Upload/History navigation links

### Review Findings

- [x] [Review][Patch] `patientRef` hardcoded as empty string in discard audit event — added `patientRef` to `UploadHistoryItem`, propagated from Dexie queue entry
- [x] [Review][Patch] Unused imports `getDb` and `updateQueueItemStatus` in UploadHistoryList — removed
- [x] [Review][Patch] `cancelledRef` not reset before `refresh()` calls — added reset at start of `fetchData`
- [x] [Review][Patch] `handleDiscard` has no error handling — wrapped in try/catch
- [x] [Review][Defer] Audit event missing auth token — `reportQueueAuditEvent` called without `token` param, Hub API may reject. Pre-existing pattern (matches `UploadQueue.tsx:57`) — deferred
- [x] [Review][Defer] `loadMore` silently fails when session expires mid-pagination — `token` is undefined, `if (token)` guard skips fetch with no user feedback — deferred, cross-cutting session handling

### Change Log
- 2026-05-11: Implemented Story 17.3 — Results Queue & Upload History page with full test coverage
- 2026-05-11: Code review — 4 patch findings, 2 deferred, 17 dismissed
