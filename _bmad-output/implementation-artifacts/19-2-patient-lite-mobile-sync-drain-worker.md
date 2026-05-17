# Story 19.2: Patient Lite Mobile Sync Drain Worker

Status: done

## Story

As a patient,
I want my consent changes and profile updates to automatically sync when I have connectivity,
so that my preferences are enforced at the Hub without manual action.

## Acceptance Criteria

1. **Given** pending consent sync entries in the Patient Lite Mobile queue, **When** the device comes online, **Then** a background sync task reads pending entries sorted by priority (consent = priority 1) and pushes them to `consent.sync` on the Hub
2. **Given** a successful sync, **When** the Hub confirms receipt, **Then** the entry is marked as synced in the persistent queue
3. **Given** a failed sync, **When** the Hub rejects or is unreachable, **Then** the entry retries with exponential backoff
4. **Given** the app, **When** it returns to foreground or `NetInfo` detects connectivity change, **Then** the sync task runs
5. **Given** profile and medical history changes, **When** queued, **Then** they are also synced via `sync.push`

## Tasks / Subtasks

- [x] Task 1: Create SQLite-based SyncQueueStorage adapter (AC: #1, #2, #3)
  - [x] 1.1 Create `src/lib/sqlite-sync-adapter.ts` — implement `SyncQueueStorage` interface from `@ultranos/sync-engine`
  - [x] 1.2 Add a `sync_queue` table to `encrypted-db.ts` migration:
    ```sql
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      hlc_timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_resource ON sync_queue(resource_id, status);
    ```
  - [x] 1.3 Implement all `SyncQueueStorage` methods using `expo-sqlite` queries
  - [x] 1.4 Ensure queue table is encrypted by SQLCipher (same DB connection as existing tables)
- [x] Task 2: Migrate consent-sync to use sync-engine queue (AC: #1, #2)
  - [x] 2.1 Create `src/lib/consent-queue-adapter.ts` — bridge function that converts `FhirConsent` → `EnqueueInput` for sync-engine queue:
    - `resourceType: 'Consent'`
    - `resourceId: consent.id`
    - `action: 'create'`
    - `payload: JSON.stringify(consent)`
    - `hlcTimestamp: serializeHlc(hlc.now())` (import HLC from sync-engine)
  - [x] 2.2 Update `queueConsentSync()` in `consent-sync.ts` to ALSO enqueue via sync-engine queue (dual-write: keep existing consent ledger for audit, add sync-engine entry for drain)
  - [x] 2.3 Keep the existing `ConsentSyncEntry` append-only ledger — it serves as an audit trail. The sync-engine queue is the operational drain queue.
- [x] Task 3: Create sync function for Hub dispatch (AC: #1, #5)
  - [x] 3.1 Create `src/lib/drain-sync-fn.ts` — implement `syncFn(entry: SyncQueueEntry) => Promise<SyncResult>`
  - [x] 3.2 Route by `resourceType`:
    - `Consent` → POST to Hub `consent.sync` endpoint
    - `Patient` → POST to Hub `patient.update` endpoint
    - Others → POST to Hub `sync.push` endpoint
  - [x] 3.3 Get auth token via patient auth mechanism (OTP-based session token)
  - [x] 3.4 Handle auth-expired (401): pause drain, do not exhaust retries
- [x] Task 4: Wire DrainWorker into React Native app lifecycle (AC: #4)
  - [x] 4.1 Create `src/lib/sync-drain-init.ts` — singleton DrainWorker setup
  - [x] 4.2 Wire `DrainWorkerConfig` with SQLite adapter, sync function, audit callback
  - [x] 4.3 Start drain worker on app mount (after auth is established)
  - [x] 4.4 Use `@react-native-community/netinfo` `addEventListener` — trigger `drain()` on connectivity change (offline → online)
  - [x] 4.5 Use React Native `AppState` — trigger `drain()` on `active` state (app foregrounding)
  - [x] 4.6 Stop drain worker on logout/session expiry
- [x] Task 5: Enqueue profile and medical history changes (AC: #5)
  - [x] 5.1 In `offline-store.ts`, after `savePatientProfile()`, enqueue a sync entry with `resourceType: 'Patient'`
  - [x] 5.2 In `offline-store.ts`, after `saveMedicalHistory()`, enqueue sync entries for each resource type
  - [x] 5.3 Use `enqueueSyncAction()` from `@ultranos/sync-engine` for consistent serialization
- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Unit test `sqlite-sync-adapter.ts` — all SyncQueueStorage methods
  - [x] 6.2 Unit test `consent-queue-adapter.ts` — consent → EnqueueInput conversion
  - [x] 6.3 Unit test `drain-sync-fn.ts` — route by resourceType, auth handling
  - [x] 6.4 Unit test lifecycle: start on mount, drain on connectivity change, stop on logout
  - [x] 6.5 Unit test: consent sync triggers both ledger append AND sync-engine enqueue

## Dev Notes

### Architecture & Patterns

- **Dual-write for consent:** The existing `consent-sync.ts` manages an append-only ledger (`ConsentSyncEntry[]`) stored in SecureStore. This ledger is preserved for audit purposes. The NEW sync-engine queue handles the actual drain/retry logic. `queueConsentSync()` writes to BOTH.
- **DrainWorker from sync-engine is browser-oriented** (`window.addEventListener('online')`). For React Native, the `start()` method checks `typeof window !== 'undefined'` and skips browser-specific listeners. We must supplement with:
  - `NetInfo.addEventListener` for connectivity changes
  - `AppState.addEventListener('change')` for foreground detection
  - Call `drain()` manually from these listeners
- **SQLCipher encryption:** The new `sync_queue` table is added to the existing encrypted DB in `encrypted-db.ts`. Since all tables share the same SQLCipher connection, the queue is automatically encrypted.
- **HLC for consent:** The existing `consent-sync.ts` uses `new Date().toISOString()` for `queuedAt`. The sync-engine queue requires HLC timestamps. Import `HybridLogicalClock` and `serializeHlc` from `@ultranos/sync-engine`.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `src/lib/consent-sync.ts` | Add sync-engine queue enqueue alongside existing ledger |
| `src/lib/encrypted-db.ts` | Add `sync_queue` table to migration |
| `src/lib/offline-store.ts` | Enqueue profile/history changes via sync-engine |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `src/lib/sqlite-sync-adapter.ts` | `SyncQueueStorage` for expo-sqlite |
| `src/lib/consent-queue-adapter.ts` | Consent → EnqueueInput bridge |
| `src/lib/drain-sync-fn.ts` | Hub sync function with resourceType routing |
| `src/lib/sync-drain-init.ts` | Singleton drain worker lifecycle |

### Platform Differences from Pharmacy Lite (Story 19.1)

| Aspect | Pharmacy Lite (PWA) | Patient Lite (Mobile) |
|--------|--------------------|-----------------------|
| Storage | Dexie (IndexedDB) | expo-sqlite (SQLCipher) |
| Online detection | `window.addEventListener('online')` | `NetInfo.addEventListener` |
| Foreground detection | `visibilitychange` | `AppState.addEventListener` |
| Auth mechanism | Supabase + JWT | OTP-based session |
| Hub endpoints | `medication.recordDispense` | `consent.sync`, `patient.update`, `sync.push` |

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 19.2]
- [Source: packages/sync-engine/src/queue.ts — SyncQueueStorage interface]
- [Source: packages/sync-engine/src/drain-worker.ts — DrainWorker]
- [Source: apps/patient-lite-mobile/src/lib/consent-sync.ts — existing consent queue]
- [Source: apps/patient-lite-mobile/src/lib/encrypted-db.ts — SQLCipher DB schema]
- [Source: apps/patient-lite-mobile/src/lib/offline-store.ts — profile/history persistence]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed pre-existing test mock: `useConsentSettings.test.ts` was missing `getSyncPriority` and `enqueueSyncAction` in sync-engine mock
- Fixed pre-existing test: `consent-sync.test.ts` tests were not awaiting async `queueConsentSync()` — updated to async/await
- Created `__mocks__/@react-native-community/netinfo.js` manual mock + jest.config.js moduleNameMapper for NetInfo

### Completion Notes List

- **Task 1:** Created `sqlite-sync-adapter.ts` implementing full `SyncQueueStorage` interface with snake_case → camelCase row mapping. Added `sync_queue` table with indexes to `encrypted-db.ts` schema (user_version bumped to 2). Table shares SQLCipher connection = automatic encryption.
- **Task 2:** Created `consent-queue-adapter.ts` to bridge FhirConsent → EnqueueSyncActionInput with HLC timestamps. Updated `consent-sync.ts` with dual-write: ledger append (audit) + sync-engine enqueue (drain). Added `setSyncEngineQueue()` for lazy registration.
- **Task 3:** Created `drain-sync-fn.ts` with resourceType-based endpoint routing (Consent → consent.sync, Patient → patient.update, Others → sync.push). AUTH_EXPIRED handling prevents retry exhaustion on 401.
- **Task 4:** Created `sync-drain-init.ts` singleton with NetInfo + AppState listeners. `startDrainWorker()` called after biometric auth; `stopDrainWorker()` on logout. Added `@react-native-community/netinfo` dependency.
- **Task 5:** Updated `offline-store.ts`: `savePatientProfile()` enqueues Patient sync entry; `saveMedicalHistory()` enqueues Encounter and MedicationRequest entries. Both use lazy HLC and `enqueueSyncAction()`.
- **Task 6:** 45 new tests across 6 test files — all passing. Covers adapter CRUD, consent bridge, endpoint routing, auth handling, lifecycle management, connectivity triggers, and dual-write behavior.

### Review Findings

#### Decision Needed
- [x] [Review][Decision] **D1: Dual HLC instances cause non-monotonic timestamps** — Resolved: Option A. Created shared `hlc-singleton.ts` module; both `consent-queue-adapter.ts` and `offline-store.ts` now import `getSharedHlc()`.
- [x] [Review][Decision] **D2: No `onConflict` handler in DrainWorker config** — Resolved: Option A. Added `onConflict` handler that emits conflict audit event with strategy, conflictFlag, and blocksPrescription metadata.
- [x] [Review][Decision] **D3: `saveMedicalHistory` re-enqueues ALL entries every save** — Resolved: Option B (dismissed). Sync-engine deduplicates by resourceId; churn is acceptable.

#### Patch
- [x] [Review][Patch] **P1: AUTH_EXPIRED missing `authExpired: true` flag** — Fixed. Added `authExpired: true` to both AUTH_EXPIRED return sites in `drain-sync-fn.ts`.
- [x] [Review][Patch] **P2: `onAudit` JSON.parse without try/catch can crash drain loop** — Fixed. Wrapped in try/catch in `sync-drain-init.ts`.
- [x] [Review][Patch] **P3: `response.json()` throws on non-JSON 2xx responses** — Fixed. Added Content-Type check before parsing in `drain-sync-fn.ts`.
- [x] [Review][Patch] **P4: `entry.payload` double-encoded in HTTP body** — Fixed. Added `JSON.parse(entry.payload)` guard in `drain-sync-fn.ts`.
- [x] [Review][Patch] **P5: No audit events on local PHI writes** — Fixed. Added `emitAuditEvent` calls in `savePatientProfile` and `saveMedicalHistory` in `offline-store.ts`.

#### Deferred
- [x] [Review][Defer] **W1: SecureStore 2048-byte limit for consent ledger** — The append-only consent sync ledger stored via `SecureStore.setItemAsync` will eventually exceed the 2048-byte limit on iOS. Pre-existing design in consent-sync.ts. [consent-sync.ts:persistQueue]
- [x] [Review][Defer] **W2: No fetch timeout in drain-sync-fn** — A hanging Hub connection blocks the drain worker indefinitely since `DrainWorker.drain()` holds `draining = true`. Pre-existing sync-engine design. [drain-sync-fn.ts:54]
- [x] [Review][Defer] **W3: `stopDrainWorker` race with in-flight drain** — Nulling `syncQueue` and `drainWorker` while `drain()` is mid-execution creates an unguarded gap. Pre-existing singleton lifecycle pattern. [sync-drain-init.ts:97-113]
- [x] [Review][Defer] **W4: `enqueueSyncAction` silently swallows errors** — sync-engine's `enqueueSyncAction` catches all errors with `console.warn`. Dropped enqueues are invisible to callers. Pre-existing in sync-engine package. [packages/sync-engine/src/enqueue.ts:37]
- [x] [Review][Defer] **W5: Schema migration lacks version-gated logic** — `createSchema` uses `CREATE TABLE IF NOT EXISTS` + unconditional `user_version = 2`. Works for v1→v2 (additive) but fragile for future ALTER TABLE migrations. [encrypted-db.ts:createSchema]

#### Scope Creep Note
`ecdsa-key-init.ts` (170 lines + 213-line test) and `PatientQRCode.tsx` changes are NOT part of Story 19.2 spec. The file's own doc comment references "Story 25.4". Low functional risk (self-contained), but mixing stories complicates rollback and review.

### Change Log

- 2026-05-12: Story 19.2 implementation complete — all tasks done

### File List

**New Files:**
- `apps/patient-lite-mobile/src/lib/sqlite-sync-adapter.ts`
- `apps/patient-lite-mobile/src/lib/consent-queue-adapter.ts`
- `apps/patient-lite-mobile/src/lib/drain-sync-fn.ts`
- `apps/patient-lite-mobile/src/lib/sync-drain-init.ts`
- `apps/patient-lite-mobile/__tests__/sqlite-sync-adapter.test.ts`
- `apps/patient-lite-mobile/__tests__/consent-queue-adapter.test.ts`
- `apps/patient-lite-mobile/__tests__/drain-sync-fn.test.ts`
- `apps/patient-lite-mobile/__tests__/sync-drain-init.test.ts`
- `apps/patient-lite-mobile/__tests__/consent-sync-dual-write.test.ts`
- `apps/patient-lite-mobile/__mocks__/@react-native-community/netinfo.js`

**Modified Files:**
- `apps/patient-lite-mobile/src/lib/encrypted-db.ts` — added sync_queue table + indexes
- `apps/patient-lite-mobile/src/lib/consent-sync.ts` — dual-write to sync-engine queue
- `apps/patient-lite-mobile/src/lib/offline-store.ts` — enqueue profile/history changes
- `apps/patient-lite-mobile/package.json` — added @react-native-community/netinfo
- `apps/patient-lite-mobile/jest.config.js` — added netinfo moduleNameMapper
- `apps/patient-lite-mobile/jest.setup.js` — no net change (cleanup only)
- `apps/patient-lite-mobile/__tests__/consent-sync.test.ts` — added adapter mock, async/await fixes
- `apps/patient-lite-mobile/__tests__/useConsentSettings.test.ts` — added missing sync-engine mocks
