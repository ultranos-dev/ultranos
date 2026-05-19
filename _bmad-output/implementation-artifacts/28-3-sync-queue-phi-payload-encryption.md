# Story 28.3: Sync Queue PHI Payload Encryption

Status: ready-for-dev

## Story

As a system operator,
I want PHI payloads in the sync queue to be encrypted at rest,
so that queued data awaiting sync is not exposed if the device is compromised.

## Acceptance Criteria

1. **Given** a clinical event (encounter, prescription, vitals, etc.) is enqueued for sync
   **When** `enqueue()` writes the `SyncQueueEntry` to IndexedDB
   **Then** the `payload` field is encrypted with the session key before write
   **And** metadata fields (resourceType, resourceId, hlcTimestamp, status) remain in cleartext for queue management

2. **Given** the drain worker picks up a pending entry
   **When** it prepares the payload for Hub API push
   **Then** the payload is decrypted in memory just before the API call
   **And** the decrypted payload is never persisted back to IndexedDB

3. **Given** the session key is unavailable (expired session, fresh tab)
   **When** the drain worker attempts to process encrypted queue entries
   **Then** those entries are skipped with status `'awaiting-key'`
   **And** they are retried after re-authentication restores the session key

4. **Given** `clearPhiState()` is triggered
   **When** the sync queue contains entries with encrypted payloads
   **Then** entries with status `'synced'` are deleted
   **And** entries with status `'pending'`/`'failed'` are retained (encrypted, unreadable without key)

## Tasks / Subtasks

- [ ] **Task 1: Add `awaiting-key` status to SyncQueueEntry** (AC: 3)
  - [ ] Update `SyncQueueEntry` type in `packages/sync-engine/src/queue.ts` — add `'awaiting-key'` to `status` union type
  - [ ] Update `packages/shared-types/` if `SyncQueueEntry` status is defined there
  - [ ] Ensure drain worker's status filter queries include/exclude `awaiting-key` appropriately

- [ ] **Task 2: Encrypt payload on enqueue** (AC: 1)
  - [ ] Modify `enqueueSyncAction()` in `packages/sync-engine/src/enqueue.ts` to accept an optional `encryptFn` callback
  - [ ] In OPD-Lite's sync adapter (`apps/opd-lite/src/lib/sync-queue.ts`), inject encryption via `encryptPayload()` from `@ultranos/crypto`
  - [ ] Only encrypt the `payload` field; leave `resourceType`, `resourceId`, `hlcTimestamp`, `status`, `createdAt`, `retryCount` in cleartext
  - [ ] Repeat for Pharmacy-Lite sync adapter (`apps/pharmacy-lite/src/lib/dexie-sync-adapter.ts`)

- [ ] **Task 3: Decrypt payload in drain worker** (AC: 2)
  - [ ] Modify `DrainWorker` in `packages/sync-engine/src/drain-worker.ts` to accept an optional `decryptFn` callback
  - [ ] In each app's sync worker wiring, inject `decryptPayload()` from `@ultranos/crypto`
  - [ ] Decrypt in memory just before Hub API call
  - [ ] Never write decrypted payload back to IndexedDB

- [ ] **Task 4: Handle missing key — awaiting-key status** (AC: 3)
  - [ ] In drain worker: before decrypting, check `encryptionKeyStore.isReady()`
  - [ ] If key unavailable: set entry status to `'awaiting-key'`, skip to next entry
  - [ ] On re-authentication (key restored): scan for `'awaiting-key'` entries, reset to `'pending'`
  - [ ] Wire key restoration listener in `key-lifecycle-hooks.ts` for each app

- [ ] **Task 5: PHI cleanup interaction with sync queue** (AC: 4)
  - [ ] In `clearPhiState()`: delete `'synced'` entries, retain `'pending'`/`'failed'`/`'awaiting-key'`
  - [ ] Retained entries remain encrypted — unreadable without key (defense-in-depth)

- [ ] **Task 6: Migration for existing unencrypted queue entries** (AC: 1)
  - [ ] On app startup: if session key is available, scan for unencrypted queue entries (missing encryption prefix) and encrypt them in-place
  - [ ] If key unavailable, leave existing entries as-is (drain worker will handle them as legacy plaintext)

- [ ] **Task 7: Tests** (AC: 1-4)
  - [ ] Test enqueue writes encrypted payload to IndexedDB
  - [ ] Test drain worker decrypts payload before Hub API call
  - [ ] Test `awaiting-key` status set when key unavailable
  - [ ] Test re-auth restores `awaiting-key` entries to `'pending'`
  - [ ] Test PHI cleanup deletes synced, retains pending/failed
  - [ ] Test legacy unencrypted entries still drain correctly (backward compat)

## Dev Notes

### Current State

The sync queue currently stores **plaintext JSON strings** as payloads in IndexedDB. The `SyncQueueEntry` type has statuses: `'pending'`, `'syncing'`, `'failed'`, `'synced'`. No `'awaiting-key'` status exists.

**Sync engine architecture:**
- `packages/sync-engine/src/queue.ts` — `createSyncQueue()` factory, `SyncQueueEntry` type
- `packages/sync-engine/src/enqueue.ts` — `enqueueSyncAction()` serializes payload to JSON string
- `packages/sync-engine/src/drain-worker.ts` — `DrainWorker` class polls every 30s, posts to Hub `/sync.push`

**App-level adapters:**
- `apps/opd-lite/src/lib/sync-queue.ts` — Dexie storage adapter
- `apps/opd-lite/src/lib/sync-worker.ts` — DrainWorker wired to tRPC + audit emission
- `apps/pharmacy-lite/src/lib/dexie-sync-adapter.ts` — Pharmacy Dexie adapter
- Lab-Lite has only `sync-store.ts` Zustand store (no persistent queue yet)

### Architecture Decision: Where to Encrypt

**Recommended approach:** Inject `encryptFn`/`decryptFn` callbacks into the sync engine rather than modifying the engine's core to depend on `@ultranos/crypto`. This keeps the sync engine package generic and testable without crypto dependencies.

```typescript
// In app-level sync wiring:
const queue = createSyncQueue({
  encryptFn: (payload) => encryptPayload(sessionKey, payload),
  decryptFn: (encrypted) => decryptPayload(sessionKey, encrypted),
});
```

### Key Files to UPDATE

| File | Change |
|------|--------|
| `packages/sync-engine/src/queue.ts` | Add `'awaiting-key'` to status union; add encrypt/decrypt callback types |
| `packages/sync-engine/src/enqueue.ts` | Call `encryptFn` on payload before write |
| `packages/sync-engine/src/drain-worker.ts` | Call `decryptFn` before Hub push; handle key-missing gracefully |
| `apps/opd-lite/src/lib/sync-queue.ts` | Inject crypto callbacks |
| `apps/opd-lite/src/lib/sync-worker.ts` | Wire key availability check |
| `apps/opd-lite/src/lib/key-lifecycle-hooks.ts` | Add listener to restore `awaiting-key` entries on re-auth |
| `apps/pharmacy-lite/src/lib/dexie-sync-adapter.ts` | Inject crypto callbacks |

### Important Constraints

- **Never persist decrypted payload** — decrypt in memory, use, discard
- **Backward compatibility**: Drain worker must handle both plaintext (legacy) and encrypted entries. Detect by checking if payload starts with encryption prefix or is parseable as raw JSON.
- **Deduplication in `enqueue()`**: Current logic replaces pending entries by `resourceId` — replacement must also encrypt the new payload
- **Lab-Lite**: Has no persistent sync queue yet (Zustand only), so sync queue encryption is N/A for Lab-Lite in this story
- **Sync queue is NOT covered by Dexie encryption middleware** — the `syncQueue` table is in the non-PHI table list in `db.ts`. This story adds payload-level encryption separately.

### Testing Standards

- Vitest for packages and PWA apps
- Existing sync engine tests at `packages/sync-engine/src/__tests__/`
- Mock `encryptFn`/`decryptFn` in unit tests for the sync engine package
- Integration tests in app-level adapters with real `@ultranos/crypto` functions

### References

- [Source: packages/sync-engine/src/queue.ts] — SyncQueueEntry type and queue factory
- [Source: packages/sync-engine/src/enqueue.ts] — enqueueSyncAction
- [Source: packages/sync-engine/src/drain-worker.ts] — DrainWorker class
- [Source: apps/opd-lite/src/lib/sync-queue.ts] — OPD-Lite Dexie sync adapter
- [Source: apps/opd-lite/src/lib/encryption-key-store.ts] — Key availability check (`isReady()`)
- [Source: packages/crypto/src/browser-crypto.ts] — encryptPayload, decryptPayload

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
