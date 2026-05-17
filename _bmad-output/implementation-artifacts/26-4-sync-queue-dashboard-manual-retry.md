# Story 26.4: Sync Queue Dashboard & Manual Retry

Status: done

## Story

As a pharmacist,
I want to see what's stuck in the sync queue and manually retry,
so that I can ensure all dispensing records reach the Hub.

## Acceptance Criteria

1. **Given** the SyncPulse indicator is tapped or the `/sync` route is accessed, **When** the sync dashboard loads, **Then** pending, in-flight, failed, and synced entries are listed with: resource type, patient ref (opaque), enqueue timestamp, retry count, last error (generic message)
2. **Given** a failed entry, **When** "Retry Now" is tapped, **Then** the entry is immediately re-attempted to push to the Hub
3. **Given** multiple failed entries, **When** "Retry All Failed" is tapped, **Then** all failed entries are retried in sequence
4. **Given** an entry stuck in "syncing" status for >2 minutes, **When** displayed, **Then** a "Stale — Reset" option appears that resets it to "pending" for retry
5. **Given** a successfully synced entry, **When** 24 hours have passed, **Then** it is automatically removed from the sync queue view

## Tasks / Subtasks

- [x] Task 1: Create sync dashboard page (AC: #1)
  - [x] 1.1 Create `src/app/sync/page.tsx` — hosts `SyncQueueDashboard`
  - [x] 1.2 Create `src/components/pharmacy/SyncQueueDashboard.tsx` — categorized list: Pending, In-Flight, Failed, Recently Synced
  - [x] 1.3 Create `src/components/pharmacy/SyncQueueEntry.tsx` — single entry card with: resource type icon, patient ref (opaque ID only — NO name), enqueue time (relative: "3 min ago"), retry count badge, last error (generic: "Network error" / "Server error" / "Timeout")
  - [x] 1.4 Query `db.syncQueue` for pending/failed; derive "in-flight" from entries with `lastAttemptAt` within 2 minutes and no error
- [x] Task 2: SyncPulse navigation (AC: #1)
  - [x] 2.1 Make existing `SyncPulse` component clickable — wrap in `<Link href="/sync">` or `onClick` with `router.push('/sync')`
  - [x] 2.2 Preserve existing `aria-label` and status indicator behavior
- [x] Task 3: Manual retry actions (AC: #2, #3)
  - [x] 3.1 "Retry Now" on individual entry: call `syncDispenseToHub()` with the queued dispense data, remove from `syncQueue` on success, update retry count on failure
  - [x] 3.2 "Retry All Failed" button: iterate failed entries sequentially, retry each, show progress (e.g., "Retrying 3 of 7...")
  - [x] 3.3 Disable retry buttons during in-flight operations to prevent double-sends
- [x] Task 4: Stale entry reset (AC: #4)
  - [x] 4.1 Detect stale entries: `lastAttemptAt` > 2 minutes ago AND no success/error result → mark as "stale"
  - [x] 4.2 "Stale — Reset" button: reset entry's `lastAttemptAt` to null, `retryCount` stays, moves back to "pending" category
- [x] Task 5: Auto-cleanup of synced entries (AC: #5)
  - [x] 5.1 On dashboard load, delete `syncQueue` entries where `syncedAt` exists and `syncedAt` < (now - 24h)
  - [x] 5.2 This is a local cleanup — no Hub interaction needed
- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Unit test `SyncQueueDashboard` renders categorized entries
  - [x] 6.2 Unit test retry triggers `syncDispenseToHub` and updates queue on success/failure
  - [x] 6.3 Unit test stale detection (>2 min threshold)
  - [x] 6.4 Unit test auto-cleanup removes entries >24h old
  - [x] 6.5 Unit test `SyncPulse` click navigates to `/sync`

## Dev Notes

### Architecture & Patterns

- **Patient reference must be OPAQUE.** Display only the reference string (e.g., `Patient/abc123`), never the patient name. The sync queue stores opaque references — do not join with `dispenses` table to resolve names. This prevents PHI exposure in a diagnostic view.
- **Error messages must be GENERIC.** Never display raw server error messages (could contain PHI). Map errors:
  - Network/timeout → "Network error — check connectivity"
  - 4xx → "Server rejected — will retry"
  - 5xx → "Server error — will retry"
  - Unknown → "Unknown error"
- **Idempotency:** `syncDispenseToHub()` in `dispense-sync.ts` already handles idempotent dispatch. Re-sending the same dispense to the Hub is safe — the Hub's idempotency guard (Epic 16, Story 16.4) prevents double-dispensing.
- **SyncPulse modification:** The existing `SyncPulse` component reads from `fulfillment-store.syncStatus`. Making it clickable is a minor change — wrap the existing `<div>` in a `<Link>` from `next/link`.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `src/components/pharmacy/SyncPulse.tsx` | Wrap in `<Link href="/sync">` for click navigation |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `src/app/sync/page.tsx` | Sync dashboard route page |
| `src/components/pharmacy/SyncQueueDashboard.tsx` | Main sync queue layout |
| `src/components/pharmacy/SyncQueueEntry.tsx` | Individual queue entry card |

### Dexie syncQueue Schema Reference

From `db.ts` the `syncQueue` table has indexes on `id`. The entries contain:
- `id` — unique ID
- `dispenseId` — reference to the dispense record
- `payload` — the sync payload (serialized MedicationDispense)
- `retryCount` — number of retry attempts
- `lastAttemptAt` — ISO timestamp of last attempt
- `error` — last error message (if failed)
- `createdAt` — when the entry was queued

### Deferred Work Items

- **D112:** `dispense-sync` `enqueue` can fail silently, losing dispense data. This dashboard gives visibility into what's in the queue, partially mitigating this. The underlying bug should be addressed separately.
- **D113:** `confirmDispense` partial failure leaves items in inconsistent state. The sync dashboard helps pharmacists identify and retry these.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 26.4]
- [Source: apps/pharmacy-lite/src/lib/dispense-sync.ts — syncDispenseToHub, enqueueForRetry]
- [Source: apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx — existing component]
- [Source: apps/pharmacy-lite/src/lib/db.ts — syncQueue table]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- No debug issues encountered

### Completion Notes List

- Created SyncQueueDashboard with categorized sections: Failed, In-Flight, Pending, Recently Synced (AC #1)
- Created SyncQueueEntry card showing: resource type, opaque patient ref (no PHI), relative timestamp, retry count badge, generic error messages (AC #1)
- Wrapped SyncPulse in `<Link href="/sync">` for click navigation; all 11 existing SyncPulse tests pass (AC #1)
- Implemented "Retry Now" per-entry and "Retry All Failed" sequential retry with progress display (AC #2, #3)
- Retry buttons disabled during in-flight operations to prevent double-sends (AC #3)
- Stale detection: in-flight entries with lastAttemptAt > 2 minutes show "Stale — Reset" button; reset moves to pending, preserves retryCount (AC #4)
- Auto-cleanup on dashboard load: synced entries older than 24h deleted locally (AC #5)
- 20 unit tests covering all 5 acceptance criteria
- Note: `SyncQueueEntry` in db.ts has no `error` field (story Dev Notes inaccurate); error display uses generic messages based on retry count/status per PHI safety rules
- Note: Used `lastAttemptAt` for synced entry age since `syncedAt` field doesn't exist in schema

### Review Findings

- [x] [Review][Decision] Error messages use retry-count heuristic instead of error-type mapping per spec — Dev Notes require mapping by error type (Network/4xx/5xx/Unknown) but `SyncQueueEntry` schema has no `error` or `lastHttpStatus` field; current impl uses `retryCount` thresholds as proxy. **Accepted as deliberate deviation** — heuristic achieves PHI safety goal; schema-level error-type mapping deferred to sync-engine improvement pass.
- [x] [Review][Patch] `handleRetry` lacks mutual exclusion — no `in-flight` status set before network call [SyncQueueDashboard.tsx:89-150] — **Fixed**
- [x] [Review][Patch] `handleRetryAllFailed` iterates stale snapshot — can double-retry already-synced entries [SyncQueueDashboard.tsx:156-168] — **Fixed**
- [x] [Review][Patch] PHI risk: `patientRef` rendered without FHIR reference format validation [SyncQueueEntry.tsx:18-25,73] — **Fixed**
- [x] [Review][Patch] `handleRetry` has no status guard — can fire on non-`failed` entries after state race [SyncQueueDashboard.tsx:88] — **Fixed**
- [x] [Review][Patch] Auto-cleanup fallback to `createdAt` can prematurely delete freshly-synced entries [SyncQueueDashboard.tsx:53-56] — **Fixed**
- [x] [Review][Patch] `JSON.parse(entry.payload)` called before needed — throws on malformed payload even when dispense record exists [SyncQueueDashboard.tsx:92] — **Fixed**
- [x] [Review][Patch] Fallback retry path duplicates URL construction from `dispense-sync.ts` — drift risk [SyncQueueDashboard.tsx:117-118] — **Fixed**
- [x] [Review][Patch] No retry count cap — `retryCount` grows unbounded, badge overflows at 2+ digits [SyncQueueEntry.tsx:62-64] — **Fixed**
- [x] [Review][Patch] `SyncPulse` red error state with `drainFailed === 0` shows no count badge [SyncPulse.tsx:69-77] — **Fixed**
- [x] [Review][Patch] `STALE_THRESHOLD_MS` constant duplicated in Dashboard (dead code) and Entry [SyncQueueDashboard.tsx:8] — **Fixed**
- [x] [Review][Defer] No error boundary or loading state for IndexedDB read failures [SyncQueueDashboard.tsx:74-85] — deferred, pre-existing pattern
- [x] [Review][Defer] No live subscription (`useLiveQuery`) — dashboard goes stale while open [SyncQueueDashboard.tsx:74-85] — deferred, pre-existing
- [x] [Review][Defer] `cleanupOldSynced` has no multi-tab coordination — concurrent tab races [SyncQueueDashboard.tsx:46-61] — deferred, pre-existing

### Change Log

- 2026-05-12: Initial implementation — all tasks complete, 20 tests passing
- 2026-05-12: Code review — 10 patches applied, 1 decision accepted, 3 deferred. 22 tests passing (2 new tests added).

### File List

- apps/pharmacy-lite/src/app/sync/page.tsx (NEW)
- apps/pharmacy-lite/src/components/pharmacy/SyncQueueDashboard.tsx (NEW)
- apps/pharmacy-lite/src/components/pharmacy/SyncQueueEntry.tsx (NEW)
- apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx (MODIFIED — wrapped in Link, red badge fix)
- apps/pharmacy-lite/src/lib/dispense-sync.ts (MODIFIED — added retrySyncPayload export)
- apps/pharmacy-lite/src/__tests__/SyncQueueDashboard.test.tsx (NEW — 22 tests)
