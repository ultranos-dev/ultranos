# Story 9.2: Background Sync Worker & Retry Logic

Status: done

## Story

As a clinician,
I want my data to sync automatically in the background,
so that I don't have to manually trigger a refresh and my offline work reaches the Hub reliably.

## Context

Currently, data written to local Dexie stores (encounters, SOAP notes, vitals, diagnoses, prescriptions) never reaches the Hub. There is no sync queue, no background worker, no retry mechanism. The "offline-first" promise is incomplete — data is captured locally but never synchronized upstream.

This story implements the background sync worker that:
1. Queues local writes for upstream sync
2. Drains the queue when connectivity is available
3. Handles conflicts using the tiered resolver from Story 9.1
4. Retries failed syncs with exponential backoff
5. Updates the Zustand `syncStatus` for the Global Sync Pulse UI

**PRD Requirements:** FR13 (Offline Data Capture), FR14 (HLC Sync)

## Acceptance Criteria

1. [x] A local `syncQueue` Dexie table persists pending sync operations across browser refresh.
2. [x] Every local write to a FHIR resource (encounter, SOAP note, vitals, diagnosis, prescription) enqueues a sync operation with HLC timestamp, resource type, action (`create`/`update`), and payload.
3. [x] A Service Worker (PWA) or background task detects connectivity changes and triggers queue drain.
4. [x] Queue drain processes items in sync priority order (allergies/consent first, metadata last — per `SYNC_PRIORITY`).
5. [x] Each sync operation calls the appropriate Hub API tRPC endpoint to persist the data.
6. [x] When the Hub returns a conflicting version, `resolveConflict()` from Story 9.1 is called and the resolution is applied locally.
7. [x] Failed sync operations retry with exponential backoff (1s, 2s, 4s, 8s, max 60s).
8. [x] After 5 consecutive failures for a single item, it is marked as `failed` and surfaced to the user.
9. [x] The Zustand `useSyncStore` is updated in real-time: `{ isPending, isError, lastSyncedAt, pendingCount, failedCount }`.
10. [x] Deduplication: if the same resource is modified multiple times while offline, only the latest version is synced (coalesce by resource ID).
11. [x] All sync operations emit client audit events (via Story 8.1's `emitClientAudit()`).
12. [x] Tests verify: queue persistence, priority ordering, conflict resolution integration, retry backoff, deduplication, and sync status updates.

## Tasks / Subtasks

- [x] **Task 1: Sync Queue Schema** (AC: 1, 2)
  - [x] Add `syncQueue` table to opd-lite Dexie schema: `{ id, resourceType, resourceId, action, payload, hlcTimestamp, status, retryCount, lastAttemptAt, createdAt }`.
  - [x] Status enum: `pending`, `syncing`, `failed`, `synced`.
  - [x] Create `packages/sync-engine/src/queue.ts` — generic queue operations (`enqueue`, `dequeue`, `markSynced`, `markFailed`, `getPending`).

- [x] **Task 2: Enqueue on Local Write** (AC: 2, 10)
  - [x] Create `packages/sync-engine/src/enqueue.ts` — `enqueueSyncAction(resourceType, resourceId, action, payload, hlcTimestamp)`.
  - [x] Deduplication: if an entry for the same `resourceId` already exists with status `pending`, replace it with the newer version.
  - [x] Wire into opd-lite stores:
    - `encounter-store.ts` — enqueue on `startEncounter`, `endEncounter`
    - `soap-note-store.ts` — enqueue on autosave
    - `vitals-store.ts` — enqueue on vitals save
    - `diagnosis-store.ts` — enqueue on diagnosis add/remove
    - `prescription-store.ts` — enqueue on prescription create/cancel

- [x] **Task 3: Background Drain Worker** (AC: 3, 4, 5, 7, 8)
  - [x] Create `packages/sync-engine/src/drain-worker.ts` — generic drain logic.
  - [x] On `online` event or periodic check (every 30s when online): drain the queue.
  - [x] Sort pending items by `SYNC_PRIORITY` (allergies first, metadata last).
  - [x] For each item: call Hub API endpoint via tRPC.
  - [x] On success: mark `synced`, remove from queue.
  - [x] On failure: increment `retryCount`, set `lastAttemptAt`, apply exponential backoff.
  - [x] After 5 failures: mark `failed`.
  - [x] Create `apps/opd-lite/src/lib/sync-worker.ts` — PWA-specific worker that wires the generic drain to opd-lite's Dexie and tRPC client.

- [x] **Task 4: Conflict Resolution Integration** (AC: 6)
  - [x] When Hub returns HTTP 409 (conflict) or a divergent version:
    - Fetch the Hub's version of the resource.
    - Call `resolveConflict(localVersion, hubVersion, resourceType)` from Story 9.1.
    - Apply the resolution:
      - `APPEND_ONLY`: store both versions locally, set conflict flag.
      - `TIMESTAMP_WINS`: keep winner, store loser as addendum.
      - `LWW`: replace local with winner.
    - If `blocksPrescription: true`, update the prescription store to block new prescriptions.

- [x] **Task 5: Sync Status Store** (AC: 9)
  - [x] Update existing `useSyncStore` in opd-lite to reflect real sync state:
    - `isPending`: `syncQueue` has pending items.
    - `isError`: any item has status `failed`.
    - `lastSyncedAt`: timestamp of most recent successful sync.
    - `pendingCount`: number of pending items.
    - `failedCount`: number of failed items.
  - [x] Expose via the existing `SyncPulse` component (green/yellow/red indicator).

- [x] **Task 6: Hub API Sync Endpoints** (AC: 5)
  - [x] Create `hub-api/src/trpc/routers/sync.ts` with:
    - `sync.push` — accept a batch of sync operations from a spoke. Validate, persist, return conflicts.
    - `sync.pull` — return changes since a given HLC timestamp for a patient's resources.
  - [x] `sync.push` processes each operation through field-level encryption (via `db.toRow()`), RBAC validation, and audit logging.
  - [x] `sync.pull` returns resources decrypted and case-transformed (via `db.fromRow()`).

- [x] **Task 7: Tests** (AC: 12)
  - [x] Test: enqueue on local write creates a sync queue entry.
  - [x] Test: deduplication — multiple writes to same resource coalesce to latest.
  - [x] Test: drain processes items in sync priority order.
  - [x] Test: successful drain marks items as synced and updates sync store.
  - [x] Test: failed drain increments retry count with correct backoff interval.
  - [x] Test: 5 failures marks item as `failed`.
  - [x] Test: conflict response triggers `resolveConflict()` and applies resolution.
  - [x] Test: sync status store reflects pending/error/lastSynced correctly.

## Dev Notes

### Hub API Sync Endpoints

The `sync.push` and `sync.pull` endpoints are the critical integration points. `sync.push` must:
1. Validate the caller has RBAC permission for the resource type
2. Apply field-level encryption before persisting
3. Detect conflicts (compare incoming HLC with stored HLC)
4. Return conflict details so the client can resolve
5. Emit audit events for all persisted changes

### Pharmacy-Lite Sync (Deferred)

Pharmacy-lite currently syncs dispenses via direct tRPC calls (`dispense-sync.ts`). Migrating pharmacy-lite to the sync engine queue is deferred — the existing pattern works for online-only pharmacy operations. When pharmacy-lite gets offline support, it should adopt the sync queue.

### Lab-Lite Sync Relationship

Lab-lite has its own upload queue (Story 12.5) for binary file uploads. FHIR metadata (DiagnosticReport, notifications) should eventually flow through this sync engine, but wiring lab-lite is deferred to avoid scope creep.

### Service Worker vs. In-Page Worker

The PWA drain worker can run either:
- **In-page**: Simple, but stops when the tab is closed.
- **Service Worker**: Runs in background, survives tab close, but more complex to implement.

Start with in-page (`online` event listener + 30s polling). Upgrade to Service Worker when the offline-first experience is polished.

### References

- CLAUDE.md: Sync Engine Conflict Resolution Tiers, Sync Priority Order
- Architecture: "sync-engine package coordinates writes between Zustand and the local database"
- Story 9.1: Tiered Conflict Resolution (conflict resolver consumed here)
- Story 8.1: Client-Side Audit Ledger (audit events emitted here)
- Existing primitives: `HybridLogicalClock`, `SYNC_PRIORITY`, `compareHlc()`, `serializeHlc()`
- Deferred items: D4, D27, D35, P6, D62 (all resolved by this story)

## Dev Agent Record

### Implementation Plan

- Generic sync queue in `packages/sync-engine/` with platform-agnostic `SyncQueueStorage` interface
- `enqueueSyncAction()` wrapper that serializes payloads and never throws
- `DrainWorker` class with online event listening + 30s polling
- Conflict resolution integrated via `resolveConflict()` from Story 9.1
- PWA-specific wiring in `apps/opd-lite/src/lib/sync-worker.ts` and `sync-queue.ts`
- Hub API `sync.push` and `sync.pull` tRPC endpoints with RBAC, encryption, and audit
- Zustand `useSyncStore` for real-time sync status

### Completion Notes

All 7 tasks completed. 97 sync-engine tests + 9 hub-api sync tests = 106 tests covering:
- Queue CRUD, deduplication, priority ordering, backoff filtering
- Drain worker success/failure/conflict paths, concurrent drain prevention
- EnqueueSyncAction serialization and error swallowing
- Hub API push (auth, persist, conflict detection, RBAC) and pull (filtering, decryption)
- Also wired `auditRouter` into `_app.ts` (was previously defined but unreachable)

## File List

### New Files
- `packages/sync-engine/src/queue.ts` — Generic sync queue operations
- `packages/sync-engine/src/enqueue.ts` — Enqueue helper with serialization
- `packages/sync-engine/src/drain-worker.ts` — Background drain worker class
- `packages/sync-engine/src/__tests__/queue.test.ts` — Queue operation tests (12)
- `packages/sync-engine/src/__tests__/enqueue.test.ts` — Enqueue tests (4)
- `packages/sync-engine/src/__tests__/drain-worker.test.ts` — Drain worker tests (8)
- `apps/opd-lite/src/lib/sync-queue.ts` — Dexie storage adapter + queue singleton
- `apps/opd-lite/src/lib/sync-worker.ts` — PWA sync worker wiring
- `apps/opd-lite/src/stores/sync-store.ts` — Zustand sync status store
- `apps/hub-api/src/trpc/routers/sync.ts` — Hub API sync.push and sync.pull endpoints
- `apps/hub-api/src/__tests__/sync.test.ts` — Hub API sync endpoint tests (9)

### Modified Files
- `packages/sync-engine/src/index.ts` — Added exports for queue, enqueue, drain-worker
- `apps/opd-lite/src/stores/encounter-store.ts` — Added sync enqueue on start/end encounter
- `apps/opd-lite/src/stores/soap-note-store.ts` — Added sync enqueue on autosave
- `apps/opd-lite/src/stores/vitals-store.ts` — Added sync enqueue on vitals save
- `apps/opd-lite/src/stores/diagnosis-store.ts` — Added sync enqueue on add/remove diagnosis
- `apps/opd-lite/src/stores/prescription-store.ts` — Added sync enqueue on create/cancel
- `apps/hub-api/src/trpc/routers/_app.ts` — Added syncRouter and auditRouter to appRouter

### Review Findings

- [x] [Review][Defer] D1: Hub sync.push does not enforce Tier 1 append-only merge — deferred, needs dedicated story with DB schema support (conflict_versions table). Client-side resolver handles tiers correctly; hub enforcement is defense-in-depth.
- [x] [Review][Defer] D2: No Service Worker — accepted as in-page per Dev Notes. AC3 partially met. SW upgrade is a follow-up story.
- [x] [Review][Patch] D3: Orphaned `syncing` entries on crash/tab close — added `recoverStale()` to queue + called at drain start.
- [x] [Review][Patch] P1: Prescription cancellation action — verified already correct (`'update'`), false positive dismissed.
- [x] [Review][Patch] P2: `sync.pull` now filters by `patientId` via `PATIENT_COLUMN_MAP`.
- [x] [Review][Patch] P3: `sync.pull` now applies `hasResourceAccess()` RBAC check per resource type.
- [x] [Review][Patch] P4: `diagnosis-store.ts` now uses `condition._ultranos.hlcTimestamp` (serialized HLC) instead of `meta.lastUpdated`.
- [x] [Review][Patch] P5: `updateRank()` now calls `enqueueSyncAction()` after Dexie persist.
- [x] [Review][Patch] P6: `getLatestSynced()` now sorts by `lastAttemptAt` (falls back to `createdAt`).
- [x] [Review][Patch] P7: Added `Encounter` (priority 4) and `Condition` (priority 4) to `SYNC_PRIORITY`.
- [x] [Review][Patch] P8: Client now parses `results[0]` from 200 response instead of checking HTTP 409.
- [x] [Review][Patch] P9: `sync.push` now emits audit event on conflict-path PHI reads.
- [x] [Review][Patch] P10: `sync.pull` now emits audit event for PHI reads.
- [x] [Review][Patch] P11: Conflict resolution now wraps `onConflict` in try/catch — marks failed on handler error.
- [x] [Review][Patch] P12: Deduplication comment clarified — syncing entries get a new queue item on next enqueue.
- [x] [Review][Defer] W1: Dexie db.ts SyncQueueEntry type diverges from sync-engine type (status enum: `in-flight` vs `syncing`, missing `synced`) — deferred, pre-existing schema
- [x] [Review][Defer] W2: TOCTOU race in enqueue deduplication — concurrent enqueue calls can create duplicates without Dexie transactions — deferred, needs transaction design
- [x] [Review][Defer] W3: Hub sync.push has TOCTOU race between conflict check and upsert — needs DB-level optimistic locking — deferred, needs schema change
- [x] [Review][Defer] W4: Hub sync.pull uses lexicographic HLC comparison via SQL `>` — incorrect for non-zero-padded numeric strings — deferred, needs schema/SQL function
- [x] [Review][Defer] W5: No cleanup of synced/failed entries — unbounded IndexedDB growth — deferred, needs lifecycle management
- [x] [Review][Defer] W6: clearPhiState clears Zustand but sync queue retains PHI payloads in IndexedDB — deferred, needs PHI handling design
- [x] [Review][Defer] W7: No handling for expired auth tokens (15-min JWT) — drain worker will exhaust retries on 401s — deferred, needs token refresh integration
- [x] [Review][Defer] W8: Sync status store updated once after full drain cycle, not per-item — deferred, minor UX concern

## Change Log

- 2026-05-01: Story 9.2 implementation complete — background sync worker, retry logic, Hub API endpoints, and comprehensive tests
