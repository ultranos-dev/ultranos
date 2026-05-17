# Story 19.1: Pharmacy Lite Sync Drain Worker

Status: done

## Story

As a pharmacist,
I want my queued dispensing records to automatically sync to the Hub when connectivity returns,
so that I don't have to manually retry failed operations.

## Acceptance Criteria

1. **Given** pending entries in the Pharmacy Lite `syncQueue` Dexie table, **When** the device comes online (via `online` event) or every 30 seconds while online, **Then** a drain worker reads pending entries ordered by sync priority and attempts to push them to the Hub API
2. **Given** a successful sync, **When** the Hub confirms receipt, **Then** the entry is marked as `synced` and removed after confirmation
3. **Given** a failed sync, **When** the Hub rejects or is unreachable, **Then** `retryCount` increments with exponential backoff (1s → 2s → 4s → 8s → 60s cap; failed after 5 retries)
4. **Given** the drain worker running, **When** items are drained, **Then** the SyncPulse indicator updates in real-time as items are drained
5. **Given** duplicate entries for the same `resourceId`, **When** the drain worker processes them, **Then** duplicates are deduplicated before push
6. **Given** an expired JWT token (401 response), **When** the drain worker encounters it, **Then** the drain pauses and triggers re-authentication (does NOT exhaust retries on auth failures)

## Tasks / Subtasks

- [x] Task 1: Create Dexie SyncQueueStorage adapter (AC: #1, #2, #3, #5)
  - [x] 1.1 Create `src/lib/dexie-sync-adapter.ts` — implement `SyncQueueStorage` interface from `@ultranos/sync-engine`
  - [x] 1.2 Map `SyncQueueStorage` methods to Dexie `db.syncQueue` operations:
    - `put(entry)` → `db.syncQueue.put(entry)`
    - `getByResourceId(resourceId, status)` → `db.syncQueue.where({resourceId, status}).first()`
    - `getByStatus(status)` → `db.syncQueue.where('status').equals(status).toArray()`
    - `delete(id)` → `db.syncQueue.delete(id)`
    - `count(status)` → `db.syncQueue.where('status').equals(status).count()`
    - `getLatestSynced()` → `db.syncQueue.where('status').equals('synced').last()`
  - [x] 1.3 Handle Dexie status value mismatch: pharmacy db.ts uses `'in-flight'` vs sync-engine uses `'syncing'` — normalize in adapter (deferred work W1)
- [x] Task 2: Create sync function for Hub dispatch (AC: #1, #6)
  - [x] 2.1 Create `src/lib/drain-sync-fn.ts` — implement `syncFn(entry: SyncQueueEntry) => Promise<SyncResult>` for `DrainWorkerConfig`
  - [x] 2.2 Parse `entry.payload` (JSON) and POST to Hub API at `/medication.recordDispense`
  - [x] 2.3 Get auth token via `useAuthSessionStore.getState().getAccessToken()`
  - [x] 2.4 On 401 response: return `{ success: false, error: 'auth-expired' }` — do NOT count as a retry failure
  - [x] 2.5 On 409 response: return `{ success: false, conflict: { remoteVersion } }` for conflict handling
  - [x] 2.6 On success: return `{ success: true }`
  - [x] 2.7 On other errors: return `{ success: false, error: message }`
- [x] Task 3: Wire DrainWorker into app lifecycle (AC: #1, #4, #6)
  - [x] 3.1 Create `src/lib/sync-drain-init.ts` — singleton module that instantiates `DrainWorker` from `@ultranos/sync-engine`
  - [x] 3.2 Wire `DrainWorkerConfig`:
    - `queue`: `createSyncQueue(dexieSyncAdapter)` from sync-engine
    - `syncFn`: from Task 2
    - `onStatusUpdate`: update `useSyncStore` with pending/failed counts
    - `onAudit`: emit via `auditPhiAccess()` from `src/lib/audit.ts`
    - `pollIntervalMs`: 30_000
  - [x] 3.3 Start drain worker after successful login (in `ClientErrorBoundary` or `AuthGuard` after session is established)
  - [x] 3.4 Stop drain worker on logout/session expiry (add to existing cleanup flow in `SessionTimeoutWrapper`)
  - [x] 3.5 Handle auth-expired: when `syncFn` returns auth error, pause drain and trigger re-auth via existing `SessionTimeoutWrapper` mechanism
- [x] Task 4: Wire SyncPulse to drain worker status (AC: #4)
  - [x] 4.1 Update `sync-store.ts` to receive `onStatusUpdate` callbacks from drain worker
  - [x] 4.2 `SyncPulse` already reads from `fulfillment-store.syncStatus` — extend to also show drain worker pending/failed counts from `sync-store`
  - [x] 4.3 Merge both sources: fulfillment-store (in-session sync) + sync-store (background drain)
- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Unit test `dexie-sync-adapter.ts` — all SyncQueueStorage methods with fake-indexeddb
  - [x] 5.2 Unit test `drain-sync-fn.ts` — success, 401 auth-expired, 409 conflict, network error
  - [x] 5.3 Unit test drain worker lifecycle: start on login, stop on logout
  - [x] 5.4 Integration test: enqueue → drain → Hub sync → status update flow

## Dev Notes

### Architecture & Patterns

- **The sync-engine package already has DrainWorker and SyncQueue fully implemented.** This story is purely WIRING — creating the Dexie adapter and connecting the generic DrainWorker to pharmacy-lite's specific storage, auth, and UI.
- **Key gap:** The current `dispense-sync.ts` writes to `db.syncQueue` directly using Dexie raw API. The drain worker needs a `SyncQueueStorage` adapter that wraps these same Dexie operations to match the sync-engine interface.
- **Status value mismatch (W1):** Pharmacy `db.ts` schema uses `'in-flight'` for entries being synced, but sync-engine queue uses `'syncing'`. The adapter must handle this translation. Simplest fix: use sync-engine's status values (`'syncing'`) in the adapter; update existing `enqueueForRetry` in `dispense-sync.ts` to also use `'syncing'` instead of relying on the old `'in-flight'` value.
- **Auth token expiry (W7):** The drain worker must NOT burn retries on 401s. When the Hub returns 401, the drain should pause and let `SessionTimeoutWrapper` handle re-authentication. After re-auth, the drain resumes with fresh tokens.
- **Existing dispense-sync.ts stays.** The `syncDispenseToHub()` function does the initial "optimistic push" at dispense time. The drain worker handles the RETRY path for items that failed the optimistic push. Both use the same Hub endpoint.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `src/stores/sync-store.ts` | Receive `onStatusUpdate` from drain worker |
| `src/components/pharmacy/SyncPulse.tsx` | Read from both fulfillment-store AND sync-store |
| `src/components/ClientErrorBoundary.tsx` | Start drain worker after auth established |
| `src/components/SessionTimeoutWrapper.tsx` | Stop drain worker on session cleanup |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `src/lib/dexie-sync-adapter.ts` | `SyncQueueStorage` implementation wrapping Dexie |
| `src/lib/drain-sync-fn.ts` | Hub sync function for drain worker |
| `src/lib/sync-drain-init.ts` | Singleton drain worker setup and lifecycle |

### Key Interfaces (from `@ultranos/sync-engine`)

```typescript
// What the adapter must implement:
interface SyncQueueStorage {
  put(entry: SyncQueueEntry): Promise<void>
  getByResourceId(resourceId: string, status: string): Promise<SyncQueueEntry | null>
  getByStatus(status: string): Promise<SyncQueueEntry[]>
  delete(id: string): Promise<void>
  count(status: string): Promise<number>
  getLatestSynced(): Promise<SyncQueueEntry | null>
}

// What the sync function must return:
interface SyncResult {
  success: boolean
  conflict?: { remoteVersion: SyncRecord }
  error?: string
}

// DrainWorker config:
interface DrainWorkerConfig {
  queue: SyncQueue
  syncFn: (entry: SyncQueueEntry) => Promise<SyncResult>
  onConflict?: (entry: SyncQueueEntry, resolution: ConflictResolution) => Promise<void>
  onStatusUpdate?: (status: { isPending, isError, lastSyncedAt, pendingCount, failedCount }) => void
  onAudit?: (entry: SyncQueueEntry, outcome: 'success' | 'failure' | 'conflict') => void
  pollIntervalMs?: number  // default 30s
}
```

### Deferred Work Items Addressed

- **W1:** Status value mismatch (`'in-flight'` vs `'syncing'`) — normalized in adapter
- **W5:** No cleanup of synced/failed entries — drain worker marks as `synced`, entries can be pruned by story 26.4's cleanup logic
- **W7:** No handling for expired auth tokens — drain pauses on 401, resumes after re-auth
- **W8:** Status updates once per drain cycle — kept as-is (per-item updates would cause excessive renders)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 19.1]
- [Source: packages/sync-engine/src/queue.ts — SyncQueueStorage interface]
- [Source: packages/sync-engine/src/drain-worker.ts — DrainWorker class]
- [Source: apps/pharmacy-lite/src/lib/dispense-sync.ts — existing enqueueForRetry]
- [Source: apps/pharmacy-lite/src/lib/db.ts — syncQueue table]
- [Source: _bmad-output/implementation-artifacts/9-2-background-sync-worker-retry-logic.md — original sync drain story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes List

- Created Dexie SyncQueueStorage adapter with status value normalization (`in-flight` ↔ `syncing`)
- Updated db.ts SyncQueueEntry type to include `'synced'` status value
- Created drain sync function with auth-expired (401), conflict (409), and success handling
- Created singleton drain worker lifecycle module with start/stop functions
- Wired drain worker start into AuthGuard (after session established)
- Wired drain worker stop into SessionTimeoutWrapper (before session cleanup)
- On auth-expired: drain stops and dispatches `ultranos:session-expired` custom event
- Extended SyncPulse to merge fulfillment-store + sync-store, added red state for failed items
- sync-store.ts already had the correct interface — no changes needed
- 65 tests pass across 7 test files (42 new tests, 23 existing tests unchanged)
- Pre-existing test failures in MedicationLabel, prescription-verify, FulfillmentChecklist, krl-sync-worker are unrelated to this story

### File List

**New files:**
- `apps/pharmacy-lite/src/lib/dexie-sync-adapter.ts`
- `apps/pharmacy-lite/src/lib/drain-sync-fn.ts`
- `apps/pharmacy-lite/src/lib/sync-drain-init.ts`
- `apps/pharmacy-lite/src/__tests__/dexie-sync-adapter.test.ts`
- `apps/pharmacy-lite/src/__tests__/drain-sync-fn.test.ts`
- `apps/pharmacy-lite/src/__tests__/sync-drain-lifecycle.test.ts`

**Modified files:**
- `apps/pharmacy-lite/src/lib/db.ts` — added `'synced'` to SyncQueueEntry status union
- `apps/pharmacy-lite/src/components/AuthGuard.tsx` — start drain worker after auth
- `apps/pharmacy-lite/src/components/SessionTimeoutWrapper.tsx` — stop drain worker on session cleanup
- `apps/pharmacy-lite/src/components/pharmacy/SyncPulse.tsx` — merge fulfillment + drain worker status, added red state
- `apps/pharmacy-lite/src/__tests__/SyncPulse.test.tsx` — added drain worker integration tests

### Review Findings

- [x] [Review][Decision] D1: Auth-expired entry burns retry count (AC 6 violation) — FIXED: added `authExpired` flag to SyncResult, `markPending` to SyncQueue, DrainWorker reverts entry to pending without burning retry [packages/sync-engine/src/drain-worker.ts, queue.ts]
- [x] [Review][Decision] D2: ultranos:session-expired event has no listener — FIXED: added event listener in SessionTimeoutWrapper that triggers handleExpired on drain worker auth failure [SessionTimeoutWrapper.tsx]
- [x] [Review][Decision] D3: No onConflict handler — 409 conflicts silently marked as synced — FIXED: drainSyncFn now returns generic error on 409 (entry retries). Full conflict handling deferred to Story 26.4 [drain-sync-fn.ts]
- [x] [Review][Patch] P1: AuthGuard cleanup doesn't call stopSyncDrain() — FIXED: added stopSyncDrain() to useEffect cleanup [AuthGuard.tsx]
- [x] [Review][Patch] P2: JSON.parse(entry.payload) can throw on corrupt data — FIXED: wrapped in try/catch, returns { success: false, error: 'invalid-payload' } [drain-sync-fn.ts]
- [x] [Review][Defer] W1: Synced entries accumulate without cleanup (AC 2) — spec defers to story 26.4 pruning logic; getLatestSynced loads all synced entries into memory
- [x] [Review][Defer] W2: Unsafe JWT decoding in AuthGuard — jwt.split('.')[1] can be undefined; pre-existing, not introduced by this story [apps/pharmacy-lite/src/components/AuthGuard.tsx:36-37]

### Change Log

- 2026-05-12: Implemented Story 19.1 — Pharmacy Lite Sync Drain Worker (all 5 tasks complete)
- 2026-05-12: Code review complete — 3 decision-needed, 2 patch, 2 deferred, 5 dismissed. All findings resolved and patched.
