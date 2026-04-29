# Story 4.3: Real-time Dispensing Sync

Status: done

## Story

As a system administrator,
I want dispensing events to be synchronized globally in real-time,
so that the prescription's status is updated everywhere to prevent fraud and ensure data integrity.

## Acceptance Criteria

1. [x] Confirming a dispense immediately triggers a tRPC mutation to the Hub.
2. [x] The Hub updates the central `medication_requests` table to `completed` or `partial`.
3. [x] If the sync fails (offline), the dispense event is queued in the local `sync_queue`.
4. [x] The `SyncPulse` indicator (UX-DR) reflects the status of the dispensing sync.
5. [x] A conflict-free merge is performed if multiple pharmacists attempt to fulfill the same prescription.

## Tasks / Subtasks

- [x] **Task 1: Dispense Mutation (Hub API)** (AC: 1, 2)
  - [x] Implement `recordDispense` mutation in `apps/hub-api/src/trpc/routers/medication.ts`.
  - [x] Logic: Create a `medication_dispense` record and update the parent `medication_request` status.
- [x] **Task 2: PWA Sync Logic** (AC: 1, 3)
  - [x] Integrate the fulfillment action with the `useSync` hook.
  - [x] Implement immediate (optimistic) Hub push with fallback to Dexie `sync_queue`.
- [x] **Task 3: Sync Pulse Integration** (AC: 4)
  - [x] Bind the `SyncPulse` component to the `isPending` state of the fulfillment sync.
  - [x] Ensure the pulse turns Amber if a dispense is pending in the queue.
- [x] **Task 4: Conflict Resolution (HLC)** (AC: 5)
  - [x] Implement server-side check: if a dispense arrives with an older HLC than an existing `completed` status, ignore the update but log the conflict.

## Dev Notes

- **Real-time Requirement:** While Ultranos is offline-first, pharmacy fulfillment is a "Sync-Preferred" event to prevent duplicate dispensing.
- **Audit:** Every sync event must trigger a `medication_request_sync` audit log on the Hub.

### Project Structure Notes

- Router: `apps/hub-api/src/trpc/routers/medication.ts`
- Hook: `apps/opd-lite-pwa/src/lib/use-sync.ts`

### References

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Sync-Engine)
- Story 3.4: [3-4-global-prescription-invalidation-check.md](3-4-global-prescription-invalidation-check.md)

### Review Findings

- [x] [Review][Decision] **Tier 1 sync violation: recordDispense uses HLC-based LWW instead of append-only merge** — Resolved: follow spec. Dispensing is a Sync-Preferred event where HLC conflict detection is correct (not Tier 1 clinical merge). Documented exception in code comment.
- [x] [Review][Decision] **Hub sync uses raw fetch instead of tRPC client — missing auth token** — Resolved: kept raw fetch (established codebase pattern), added auth header infrastructure via `getAuthToken()` + `Authorization` header.
- [x] [Review][Patch] **Prescription update failure silently swallowed — returns success:true** — Fixed: now throws INTERNAL_SERVER_ERROR or CONFLICT (PGRST116) matching `complete` mutation pattern.
- [x] [Review][Patch] **TOCTOU race: no conditional guard on prescription update** — Fixed: added `.eq('prescription_status', currentRx.prescription_status)` guard + PGRST116 conflict handling.
- [x] [Review][Patch] **Audit log + conflict log insert failures silently swallowed** — Fixed: both inserts now check errors and throw INTERNAL_SERVER_ERROR on failure.
- [x] [Review][Patch] **confirmDispense: no error handling, phase stuck at dispensing** — Fixed: wrapped in try/catch/finally. Phase always transitions to `completed`, `isPending` always cleared in finally.
- [x] [Review][Patch] **confirmDispense: no double-invocation guard** — Fixed: added `if (get().phase === 'dispensing') return` guard.
- [x] [Review][Patch] **Empty string fallbacks create permanently invalid queue entries** — Fixed: validate required fields before sync. Returns `{ synced: false, queued: false, error }` if invalid.
- [x] [Review][Patch] **Non-existent prescriptionId not validated** — Fixed: fetch now checks error/null and throws NOT_FOUND (PGRST116) or INTERNAL_SERVER_ERROR.
- [x] [Review][Patch] **SyncPulse CSS class collision** — Fixed: removed bare `${color}` from className.
- [x] [Review][Patch] **SyncPulse red state unreachable — dead code** — Fixed: removed `'red'` from PulseColor type, colorClasses, pulseClasses, and aria label.
- [x] [Review][Patch] **dispensed_by set to undefined instead of null for partial dispense** — Fixed: uses `null` explicitly.
- [x] [Review][Patch] **loadPrescriptions during active dispensing overwrites in-flight state** — Fixed: added `if (get().phase === 'dispensing') return` guard.
- [x] [Review][Defer] **Audit log missing SHA-256 hash chaining** — Pre-existing architectural gap (W1 from 3-2 review). Address in Story 6-2.
- [x] [Review][Defer] **No retry/drain mechanism for sync queue** — `syncQueue` entries are never retried. No background worker, service worker, or `online` event listener drains the queue.
- [x] [Review][Defer] **SyncPulse doesn't reflect queued state after page refresh** — Reads only in-memory Zustand state. After remount, shows green while `syncQueue` may have pending entries.
- [x] [Review][Defer] **Browser refresh mid-dispensing loses batch state** — In-memory store resets. Partially dispensed items in IndexedDB have no resume mechanism.
- [x] [Review][Defer] **No deduplication on sync queue** — `enqueueForRetry` always creates new entries. Same dispense can be queued multiple times.
- [x] [Review][Defer] **Drug interaction check not in recordDispense** — Pre-existing decision (D1 from 4-2 review). Pharmacy trusts prescriber-side checks. Revisit when MedicationStatement exists.
- [x] [Review][Defer] **Local audit doesn't log sync attempt/result** — Pre-existing gap consistent with D9/D23/D38. No client-side audit for sync events.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No debug issues encountered.

### Completion Notes List

- **Task 1:** Added `recordDispense` tRPC mutation to the medication router. Creates a `medication_dispenses` record, updates parent `medication_requests` status to DISPENSED/PARTIALLY_DISPENSED, emits `medication_request_sync` audit log. Includes HLC-based conflict detection (Task 4).
- **Task 2:** Created `dispense-sync.ts` module with `syncDispenseToHub()` — makes optimistic POST to Hub API, falls back to Dexie `sync_queue` on network failure. Added `SyncQueueEntry` type and `syncQueue` table (Dexie v11). Integrated into fulfillment store's `confirmDispense()` action which persists locally first (offline-first), then attempts Hub sync.
- **Task 3:** Created `SyncPulse` component bound to fulfillment store's `syncStatus`. Shows green when synced, amber with pulse animation when pending/queued. Displays pending count badge. Accessible via aria-label.
- **Task 4:** Server-side HLC conflict resolution in `recordDispense`. If incoming dispense has older HLC than existing `completed` prescription, the update is ignored but the dispense record is still stored. Conflict logged to `dispense_conflicts` table.

### Change Log

- 2026-04-29: Implemented all 4 tasks for Story 4.3 (real-time dispensing sync)

### File List

- `apps/hub-api/src/trpc/routers/medication.ts` (modified — added `recordDispense` mutation with HLC conflict resolution)
- `apps/hub-api/src/__tests__/medication.test.ts` (modified — added 8 new tests for recordDispense + HLC conflict)
- `apps/opd-lite-pwa/src/lib/dispense-sync.ts` (new — Hub sync with offline queue fallback)
- `apps/opd-lite-pwa/src/lib/db.ts` (modified — added `SyncQueueEntry` type, `syncQueue` table, Dexie v11)
- `apps/opd-lite-pwa/src/stores/fulfillment-store.ts` (modified — added `confirmDispense`, `syncStatus`, `dispensing`/`completed` phases)
- `apps/opd-lite-pwa/src/components/pharmacy/SyncPulse.tsx` (new — sync status indicator component)
- `apps/opd-lite-pwa/src/__tests__/dispense-sync.test.ts` (new — 5 tests for sync logic)
- `apps/opd-lite-pwa/src/__tests__/fulfillment-store.test.ts` (modified — added 7 tests for confirmDispense)
- `apps/opd-lite-pwa/src/__tests__/SyncPulse.test.tsx` (new — 6 tests for SyncPulse component)
