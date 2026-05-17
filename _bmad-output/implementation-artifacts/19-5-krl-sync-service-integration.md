# Story 19.5: KRL Sync Service Integration

Status: done

## Story

As a pharmacist,
I want the Key Revocation List to sync automatically from the Hub,
so that revoked practitioner keys are rejected without manual intervention.

## Acceptance Criteria

1. **Given** the `KRLSyncService` in `packages/sync-engine/`, **When** the device comes online or every 5 minutes while online, **Then** the KRL is refreshed from `practitionerKey.getRevocationList` on the Hub API
2. **Given** a newly revoked key in the KRL, **When** the KRL is refreshed, **Then** the key is immediately purged from the local practitioner key cache in Pharmacy Lite (and OPD Lite when applicable)
3. **Given** the KRL sync, **When** running, **Then** it runs at priority 1 (same as allergies/consent per sync priority config)
4. **Given** the Hub is unreachable, **When** the KRL sync fails, **Then** the existing local KRL is retained (fail-closed — stale KRL still blocks known-revoked keys)
5. **Given** a KRL sync event, **When** it completes, **Then** an audit event is logged

## Tasks / Subtasks

- [x] Task 1: Create Dexie KRLStorage adapter for Pharmacy Lite (AC: #1, #4)
  - [x] 1.1 Create `src/lib/krl-storage-adapter.ts` — implement `KRLStorage` interface from `@ultranos/sync-engine`
  - [x] 1.2 Map methods to Dexie `db.revokedKeys` table:
    - `getAll()` → `db.revokedKeys.toArray()`
    - `replaceAll(entries)` → `db.revokedKeys.clear()` then `db.revokedKeys.bulkPut(entries)`
    - `has(publicKey)` → `db.revokedKeys.get(publicKey).then(e => !!e)`
- [x] Task 2: Create KRL sync fetcher (AC: #1, #3)
  - [x] 2.1 Create `src/lib/krl-sync-worker.ts` — singleton that:
    - Fetches KRL from Hub API `practitionerKey.getRevocationList` endpoint
    - Calls `krlService.applySnapshot(entries)` to replace local KRL
    - Runs on `online` event + every 5 minutes via `setInterval`
  - [x] 2.2 Get auth token via `useAuthSessionStore.getState().getAccessToken()`
  - [x] 2.3 On network failure: silently retain existing local KRL (fail-closed, AC #4)
  - [x] 2.4 On success: log the count of revoked keys received
- [x] Task 3: Purge revoked keys from practitioner cache (AC: #2)
  - [x] 3.1 After KRL snapshot applied, compare new KRL entries against `db.practitionerKeys` cache
  - [x] 3.2 For each newly revoked key found in the cache: delete from `db.practitionerKeys`
  - [x] 3.3 This ensures any cached key that was just revoked is immediately removed, so next prescription verification will fail for that key
- [x] Task 4: Wire into app lifecycle (AC: #1)
  - [x] 4.1 Start KRL sync worker after login (alongside drain worker from Story 19.1)
  - [x] 4.2 Stop KRL sync worker on logout/session expiry
  - [x] 4.3 Trigger immediate KRL sync on app startup (first thing after auth)
  - [x] 4.4 Use 5-minute polling interval (NOT the 30-second drain worker interval — KRL changes are infrequent)
- [x] Task 5: Audit logging (AC: #5)
  - [x] 5.1 After each successful KRL sync, emit audit event via `auditPhiAccess()`:
    - `action: 'KRL_SYNC'`
    - `resourceType: 'KeyRevocationList'`
    - `metadata: { revokedKeyCount, newRevocations }` (counts only, never key values)
  - [x] 5.2 On sync failure, emit audit event with `outcome: 'failure'` and generic error reason
- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Unit test `krl-storage-adapter.ts` — getAll, replaceAll, has methods
  - [x] 6.2 Unit test `krl-sync-worker.ts` — successful fetch + applySnapshot
  - [x] 6.3 Unit test: network failure retains existing KRL (fail-closed)
  - [x] 6.4 Unit test: revoked key purged from practitioner cache after sync
  - [x] 6.5 Unit test: audit event emitted on sync success and failure
  - [x] 6.6 Unit test: 5-minute polling interval starts/stops correctly

### Review Findings

- [x] [Review][Decision] Concurrent syncKrl() calls can race — resolved with `syncing` boolean guard (Option A). [krl-sync-worker.ts:27,105-106,160-162]
- [x] [Review][Patch] Missing stopKrlSync() in useEffect cleanup — added stopKrlSync() to cleanup and imported it. [AuthGuard.tsx:7,72]
- [x] [Review][Patch] Empty actorId passed to KRL sync when session is null — guarded with `if (actorId)` check, KRL sync skipped if no userId. [AuthGuard.tsx:56-59]
- [x] [Review][Patch] No pagination loop guard — replaced `while (true)` with `for` loop capped at 100 pages. [krl-sync-worker.ts:43-45]
- [x] [Review][Defer] GET request encodes input in URL query string — `fetchKrlFromHub` uses a GET request with JSON-encoded input in the URL. This input appears in server access logs, proxy logs, and browser history. Not a token/PHI leak (input is only `{limit, cursor}`), but inconsistent with POST-based patterns used elsewhere (e.g., audit.sync). [krl-sync-worker.ts:48-55] — deferred, pre-existing pattern from tRPC GET convention
- [x] [Review][Defer] purgeRevokedFromCache has no transaction isolation — reads all practitioner keys, filters, then bulk-deletes without a Dexie transaction. Concurrent writes between read and delete could cause inconsistencies. Low real-world risk (operations are fast, keys are unique). [krl-sync-worker.ts:79-91] — deferred, low-risk edge case

## Dev Notes

### Architecture & Patterns

- **KRLSyncService already exists and is tested** in `packages/sync-engine/src/krl-sync.ts`. It provides `applySnapshot()`, `isRevoked()`, and `addRevocation()`. This story creates the WIRING: the Dexie adapter, the Hub API fetcher, and the polling lifecycle.
- **Fail-closed is critical.** If the Hub is unreachable, the existing local KRL is preserved. Stale KRL data is better than no KRL data — it still blocks known-revoked keys. The pharmacy can always verify against local KRL even when fully offline.
- **KRL is NOT part of the sync queue.** KRL sync is a pull-based full snapshot, not a push-based queued operation. It does not use `DrainWorker` or `SyncQueue`. It's a simple "fetch and replace" on a timer.
- **Priority 1 means sync-priority order, not queue priority.** KRL is listed at priority 1 in `SYNC_PRIORITY`, meaning if it were in the drain queue, it would drain first. Since it's a separate polling mechanism, "priority 1" means it runs as soon as connectivity is available (via `online` event listener).
- **Practitioner key cache purge:** After KRL refresh, iterate `db.practitionerKeys` and delete any entry whose `publicKey` appears in the new KRL. This is a local operation — no Hub call needed.

### Existing Pharmacy Lite KRL Usage

The prescription verification flow in `prescription-verify.ts` already checks the local KRL:
```
verifyPrescriptionQr()
  → check db.revokedKeys for the signer's public key
  → if found: return { status: 'key_revoked' }
```

This story ensures that `db.revokedKeys` stays up-to-date via automatic Hub sync.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `src/components/ClientErrorBoundary.tsx` | Start KRL sync worker after auth (alongside drain worker) |
| `src/components/SessionTimeoutWrapper.tsx` | Stop KRL sync worker on logout |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `src/lib/krl-storage-adapter.ts` | `KRLStorage` for Dexie `revokedKeys` table |
| `src/lib/krl-sync-worker.ts` | Hub fetcher + polling + cache purge |

### Hub API Endpoint

The Hub API endpoint `practitionerKey.getRevocationList` should return:
```typescript
{
  entries: Array<{ publicKey: string, revokedAt: string }>
}
```

If this endpoint does not yet exist, the dev agent should check `apps/hub-api/src/trpc/routers/` for practitioner key routes and verify the endpoint exists. If missing, this story should create a stub that returns an empty list — the actual revocation management is an Epic 21 concern.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 19.5]
- [Source: packages/sync-engine/src/krl-sync.ts — KRLSyncService, KRLStorage interface]
- [Source: apps/pharmacy-lite/src/lib/db.ts — revokedKeys table (v3)]
- [Source: apps/pharmacy-lite/src/lib/prescription-verify.ts — KRL check in verification flow]
- [Source: apps/pharmacy-lite/src/lib/practitioner-key-cache.ts — practitioner key cache]
- [Source: CLAUDE.md — Encryption: QR code security, fail-closed verification]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — no debug issues encountered.

### Completion Notes List

- **Task 1:** Created `krl-storage-adapter.ts` implementing the `KRLStorage` interface from `@ultranos/sync-engine`. Uses Dexie transactions for atomic `replaceAll`. 6 unit tests pass.
- **Task 2:** Created `krl-sync-worker.ts` as a singleton worker module following the audit drain worker pattern. Fetches full KRL via cursor-based pagination from `practitionerKey.getRevocationList`. Handles network failures gracefully (returns null → fail-closed).
- **Task 3:** Implemented `purgeRevokedFromCache()` — after each KRL snapshot, cross-references `db.practitionerKeys` and bulk-deletes any keys found in the new KRL. Tested with 3 unit tests.
- **Task 4:** Wired `startKrlSync()` into `AuthGuard.tsx` (after session restore, alongside `startSyncDrain()`). Wired `stopKrlSync()` into `SessionTimeoutWrapper.tsx` `handleExpired` (before clearing session). Immediate sync fires on startup; 5-minute interval polling; `online` event listener for connectivity recovery.
- **Task 5:** Audit logging uses existing `auditPhiAccess()` with `AuditAction.SYNC` and `AuditResourceType.PRACTITIONER_KEY` (new enum value added). Success events include `revokedKeyCount`, `newRevocations`, `purgedFromCache` counts (never key values). Failure events include generic reason string.
- **Task 6:** 21 total unit tests across 2 test files, all passing. Covers: storage adapter CRUD, fetch pagination, fail-closed network handling, cache purge, audit events, lifecycle start/stop/interval/online.
- **Pre-existing failures:** 19 tests in 5 other test files fail (fulfillment-store, FulfillmentChecklist, medication-dispense, MedicationLabel, prescription-verify) — these are unrelated to Story 19.5.

### Change Log

- 2026-05-12: Story 19.5 implementation complete — KRL sync service integration for Pharmacy Lite

### File List

**New files:**
- `apps/pharmacy-lite/src/lib/krl-storage-adapter.ts`
- `apps/pharmacy-lite/src/lib/krl-sync-worker.ts`
- `apps/pharmacy-lite/src/__tests__/krl-storage-adapter.test.ts`
- `apps/pharmacy-lite/src/__tests__/krl-sync-worker.test.ts`

**Modified files:**
- `apps/pharmacy-lite/src/components/AuthGuard.tsx` — added `startKrlSync()` call after auth
- `apps/pharmacy-lite/src/components/SessionTimeoutWrapper.tsx` — added `stopKrlSync()` call on logout
- `packages/shared-types/src/enums.ts` — added `PRACTITIONER_KEY` to `AuditResourceType` enum
