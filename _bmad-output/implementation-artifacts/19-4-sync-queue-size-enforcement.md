# Story 19.4: Sync Queue Size Enforcement

Status: done

## Story

As a system architect,
I want sync queues to enforce maximum size limits,
so that devices don't exhaust IndexedDB storage and Tier 1 events are never dropped.

## Acceptance Criteria

1. **Given** a sync queue with growing entries, **When** the queue reaches 2,000 events OR 50 MB (whichever comes first), **Then** new non-Tier-1 entries are rejected with a "Queue full — please sync" warning to the user
2. **Given** a Tier 1 event (allergies, active medications, consent), **When** the queue is full, **Then** it is NEVER rejected — Tier 1 always queues regardless of limits
3. **Given** each `enqueue()` call, **When** the queue is checked, **Then** the size is validated before the entry is added
4. **Given** a queue at 80% capacity, **When** the threshold is crossed, **Then** a "Sync queue nearly full" warning is shown to the user

## Tasks / Subtasks

- [x] Task 1: Add size enforcement to sync-engine queue (AC: #1, #2, #3)
  - [x] 1.1 Extend `createSyncQueue()` in `packages/sync-engine/src/queue.ts` to accept optional `maxEntries` (default 2000) and `maxSizeBytes` (default 50 MB) config
  - [x] 1.2 Add a `totalCount()` method to `SyncQueueStorage` interface — counts ALL entries regardless of status
  - [x] 1.3 Add an `estimateSizeBytes()` method to `SyncQueueStorage` interface — returns approximate total payload size
  - [x] 1.4 In `enqueue()`, before adding:
    - Check `totalCount()` against `maxEntries`
    - Check `estimateSizeBytes()` against `maxSizeBytes`
    - If either limit reached AND `resourceType` is NOT Tier 1 (use `getConflictTier()` to check): reject with `QueueFullError`
    - If Tier 1: always allow (bypass limits)
  - [x] 1.5 Export `QueueFullError` class from sync-engine for callers to catch
- [x] Task 2: Implement storage methods in Dexie adapter (AC: #1, #3)
  - [x] 2.1 In pharmacy-lite's `dexie-sync-adapter.ts` (from Story 19.1):
    - `totalCount()` → `db.syncQueue.count()`
    - `estimateSizeBytes()` → sum of `payload.length` for all entries (approximate via `db.syncQueue.toArray()` then sum `.payload.length * 2` for UTF-16)
  - [x] 2.2 In patient-lite's `sqlite-sync-adapter.ts` (from Story 19.2):
    - `totalCount()` → `SELECT COUNT(*) FROM sync_queue`
    - `estimateSizeBytes()` → `SELECT SUM(LENGTH(payload)) FROM sync_queue`
- [x] Task 3: 80% capacity warning (AC: #4)
  - [x] 3.1 Add an `onCapacityWarning` callback to `createSyncQueue()` config
  - [x] 3.2 After each successful `enqueue()`, check if count > `maxEntries * 0.8` or size > `maxSizeBytes * 0.8`
  - [x] 3.3 If threshold crossed, call `onCapacityWarning({ count, sizeBytes, maxEntries, maxSizeBytes })`
  - [x] 3.4 In pharmacy-lite `sync-drain-init.ts`, wire `onCapacityWarning` to show a toast/banner: "Sync queue nearly full ({count} entries). Connect to sync."
- [x] Task 4: Handle QueueFullError in apps (AC: #1)
  - [x] 4.1 In pharmacy-lite `dispense-sync.ts` `enqueueForRetry()`: catch `QueueFullError`, return `{ synced: false, queued: false, error: 'queue-full' }`
  - [x] 4.2 In pharmacy-lite UI: when `error === 'queue-full'`, show a blocking warning: "Sync queue full. Please connect to the internet to sync pending records before dispensing more."
  - [x] 4.3 In patient-lite `consent-queue-adapter.ts`: catch `QueueFullError` — consent is Tier 1, so this should never trigger, but log a critical error if it does
- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Unit test: enqueue rejected when count > 2000 for non-Tier-1 resource
  - [x] 5.2 Unit test: enqueue accepted when count > 2000 for Tier 1 resource (AllergyIntolerance, Consent)
  - [x] 5.3 Unit test: enqueue rejected when size > 50 MB for non-Tier-1 resource
  - [x] 5.4 Unit test: 80% capacity warning fires at threshold
  - [x] 5.5 Unit test: QueueFullError caught in dispense-sync and surfaced to UI

## Dev Notes

### Architecture & Patterns

- **This modifies the shared `sync-engine` package**, not just app-level code. The size enforcement is generic — it applies to ALL apps using the sync queue.
- **Tier 1 detection:** Use `getConflictTier(resourceType)` from `conflict-tiers.ts`. Tier 1 resources: `AllergyIntolerance`, active `MedicationRequest`, active `Condition`, `MedicationStatement`, `KeyRevocationList`. Also `Consent` (CONSENT tier) should bypass limits since it syncs at priority 1.
- **Size estimation is approximate.** Exact IndexedDB size tracking requires browser-specific APIs (`navigator.storage.estimate()`). Using `payload.length * 2` (UTF-16 encoding) is a reasonable approximation for enforcement purposes.
- **50 MB limit rationale:** IndexedDB has varying limits per browser (50MB–100MB typical for origin). 50 MB leaves headroom for other Dexie tables (dispenses, audit logs, etc.).
- **SyncQueueStorage interface extension:** Adding `totalCount()` and `estimateSizeBytes()` is a breaking change to the interface. All existing adapters (Dexie from 19.1, SQLite from 19.2) must implement these new methods.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `packages/sync-engine/src/queue.ts` | Add size enforcement, `QueueFullError`, capacity warning |
| `packages/sync-engine/src/queue.ts` | Extend `SyncQueueStorage` with `totalCount()`, `estimateSizeBytes()` |
| `packages/sync-engine/src/index.ts` | Export `QueueFullError` |

### Dependencies

- **Requires Story 19.1 (Dexie adapter) and 19.2 (SQLite adapter)** for the `totalCount()` and `estimateSizeBytes()` implementations. If developed in parallel, the interface extension must be coordinated.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 19.4]
- [Source: packages/sync-engine/src/queue.ts — createSyncQueue, SyncQueueStorage]
- [Source: packages/sync-engine/src/conflict-tiers.ts — getConflictTier for Tier 1 detection]
- [Source: packages/sync-engine/src/sync-priority.ts — SYNC_PRIORITY for resource types]
- [Source: CLAUDE.md — Conflict Resolution Tiers: Tier 1 never dropped]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — all tests passed on first implementation.

### Completion Notes List

- Extended `SyncQueueStorage` interface with `totalCount()` and `estimateSizeBytes()` methods
- Added `QueueFullError` class with reason, currentValue, and limit properties
- Refactored `createSyncQueue()` to accept `SyncQueueConfig` object (maxEntries, maxSizeBytes, onCapacityWarning)
- Size enforcement checks run before every `enqueue()` for non-Tier-1/Consent resources
- Tier 1 (AllergyIntolerance, MedicationRequest, MedicationStatement, Condition, KeyRevocationList) and CONSENT bypass limits
- 80% capacity warning fires via `onCapacityWarning` callback after successful enqueue
- Pharmacy-lite wires capacity warning to `ultranos:sync-capacity-warning` custom event
- `SyncCapacityBanner` component displays amber warning at 80% and red blocking warning when full
- `dispense-sync.ts` refactored to use sync-engine queue (gets size enforcement) instead of raw Dexie writes
- Patient-lite `consent-sync.ts` has defensive catch for QueueFullError (should never trigger for Consent tier)
- Updated all existing SyncQueueStorage adapters: OPD-Lite, Pharmacy-Lite (Dexie), Patient-Lite (SQLite)
- All existing in-memory test adapters updated with new interface methods
- 12 new tests added, 0 regressions

### File List

- `packages/sync-engine/src/queue.ts` — QueueFullError, SyncQueueConfig, size enforcement in enqueue(), capacity warning
- `packages/sync-engine/src/index.ts` — Export QueueFullError, SyncQueueConfig, CapacityWarningInfo
- `packages/sync-engine/src/__tests__/queue.test.ts` — 8 new size enforcement tests
- `packages/sync-engine/src/__tests__/drain-worker.test.ts` — Updated in-memory storage with totalCount/estimateSizeBytes
- `packages/sync-engine/src/__tests__/enqueue.test.ts` — Updated in-memory storage with totalCount/estimateSizeBytes
- `apps/pharmacy-lite/src/lib/dexie-sync-adapter.ts` — Added totalCount(), estimateSizeBytes()
- `apps/pharmacy-lite/src/lib/sync-drain-init.ts` — Wired onCapacityWarning to custom event
- `apps/pharmacy-lite/src/lib/dispense-sync.ts` — Refactored to use sync-engine queue, catches QueueFullError
- `apps/pharmacy-lite/src/components/pharmacy/SyncCapacityBanner.tsx` — NEW: capacity warning + queue-full banner
- `apps/pharmacy-lite/src/components/AppShellWrapper.tsx` — Added SyncCapacityBanner
- `apps/pharmacy-lite/src/__tests__/dispense-sync.test.ts` — Added queue-full test
- `apps/pharmacy-lite/src/__tests__/dexie-sync-adapter.test.ts` — Added totalCount/estimateSizeBytes tests
- `apps/opd-lite/src/lib/sync-queue.ts` — Added totalCount(), estimateSizeBytes()
- `apps/patient-lite-mobile/src/lib/sqlite-sync-adapter.ts` — Added totalCount(), estimateSizeBytes()
- `apps/patient-lite-mobile/src/lib/consent-sync.ts` — Defensive QueueFullError catch with critical error log

### Review Findings

- [x] [Review][Decision] **`MedicationDispense:offline` not in conflict-tiers map** — Resolved: removed `:offline` suffix, using plain `MedicationDispense` which maps to TIER_2. [apps/pharmacy-lite/src/lib/dispense-sync.ts:101]
- [x] [Review][Decision] **Consent-sync web `memoryStore` drops on tab close** — Deferred: web path is dev/testing fallback for React Native app, not a production risk.
- [x] [Review][Patch] **`enqueueSyncAction` silently swallows `QueueFullError`** — Fixed: now re-throws QueueFullError while still swallowing transient storage errors. Test added. [packages/sync-engine/src/enqueue.ts:37]
- [x] [Review][Patch] **Capacity warning fires on every enqueue past 80%** — Fixed: added `capacityWarningEmitted` debounce flag, resets when queue drops below threshold. [packages/sync-engine/src/queue.ts:149-155]
- [x] [Review][Patch] **`enqueue` dedup overwrites `createdAt`** — Fixed: dedup no longer overwrites `createdAt`. [packages/sync-engine/src/queue.ts:115]
- [x] [Review][Patch] **Deduplication queries by `resourceId` only, ignoring `resourceType`** — Fixed: `getByResourceId` now requires `resourceType` parameter. All adapters and test call sites updated. [packages/sync-engine/src/queue.ts:107]
- [x] [Review][Defer] **`getLatestSynced` and `mark*` methods do O(n) full table scans** — Performance concern at 2000-entry limit. Not a correctness bug. [packages/sync-engine/src/queue.ts] — deferred, pre-existing
- [x] [Review][Defer] **Consent sync queue unbounded growth in SecureStore** — Never prunes synced entries. SecureStore has ~2KB limit per key on iOS. [apps/patient-lite-mobile/src/lib/consent-sync.ts] — deferred, pre-existing
- [x] [Review][Defer] **Consent sync has no deduplication** — Same consent ID can be pushed multiple times without upsert check. [apps/patient-lite-mobile/src/lib/consent-sync.ts:84] — deferred, pre-existing
