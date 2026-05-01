# Story 12.5: Upload Queue & Offline Resilience

Status: done

## Story

As a lab technician,
I want my uploads to be preserved locally if the connection drops mid-upload,
so that I don't lose work and can resume when connectivity returns.

## Context

The lab portal is designed as "near-online" — it expects connectivity most of the time but must handle intermittent outages. File and metadata are preserved locally if the connection drops. Pending items are visible to the technician. Items older than 48 hours require re-upload (freshness constraint).

**PRD Requirements:** LAB-024 (Upload Queue — Offline Resilience)

## Acceptance Criteria

1. [ ] If a connection drop occurs during upload, the file and metadata are preserved in a local upload queue.
2. [ ] The upload queue survives browser refresh and tab close.
3. [ ] The queue holds up to 50 pending items.
4. [ ] Pending items are displayed in a visible "Upload Queue" panel in the lab-lite UI.
5. [ ] Each pending item shows: test category, patient first name (from verification step), queued timestamp, and upload status.
6. [ ] When connectivity is restored, the queue drains automatically in FIFO order.
7. [ ] Items older than 48 hours are flagged as expired and require manual re-upload.
8. [ ] Expired items are NOT automatically deleted — technician must explicitly discard or re-upload.
9. [ ] Queue drain failures retry with exponential backoff (max 3 retries per item).
10. [ ] An audit event is emitted for: queue entry, successful drain, expiry, and discard.

## Tasks / Subtasks

- [x] **Task 1: Local Upload Queue (Dexie)** (AC: 1, 2, 3)
  - [x] Create `apps/lab-lite/src/lib/db.ts` with Dexie schema for `uploadQueue` table.
  - [x] Queue entry fields: `id`, `file` (Blob), `metadata` (test category, LOINC code, collection date), `patientRef`, `patientFirstName`, `queuedAt`, `status` (pending, uploading, expired, failed), `retryCount`, `lastAttemptAt`.
  - [x] Enforce 50-item queue limit — reject new entries when full with clear error.

- [x] **Task 2: Upload Queue UI** (AC: 4, 5, 7, 8)
  - [x] Create `apps/lab-lite/src/components/UploadQueue.tsx`.
  - [x] Display pending items with test category, patient first name, queued time, and status badge.
  - [x] Highlight expired items (>48 hours) with warning styling.
  - [x] "Re-upload" button for expired items (re-validates metadata, resets timestamp).
  - [x] "Discard" button for expired or failed items (with confirmation).

- [x] **Task 3: Auto-Drain Worker** (AC: 6, 9)
  - [x] Create `apps/lab-lite/src/lib/upload-queue-worker.ts`.
  - [x] Listen for `online` event.
  - [x] On connectivity restore, drain queue in FIFO order.
  - [x] Each item: attempt upload via `lab.uploadResult` tRPC procedure.
  - [x] On success: remove from queue, emit audit event.
  - [x] On failure: increment retry count, apply exponential backoff (1s, 4s, 16s), max 3 retries.
  - [x] After 3 failures: mark as `failed`, stop retrying, display in queue UI.

- [x] **Task 4: 48-Hour Expiry Check** (AC: 7)
  - [x] On app load and periodically (every 15 minutes), scan queue for items older than 48 hours.
  - [x] Mark expired items with `status: 'expired'`.
  - [x] Display warning toast when items expire.

- [x] **Task 5: Audit Logging** (AC: 10)
  - [x] Emit audit event on: queue entry created, upload drained successfully, item expired, item discarded.
  - [x] Include: queue entry ID, test category, patient ref, technician ID, timestamp.

## Dev Notes

### File Storage in IndexedDB

Storing file Blobs in IndexedDB (via Dexie) is supported by modern browsers but has storage limits (~50MB default in most browsers, expandable via Storage API). With 50 items at 20MB max each, the theoretical maximum is 1GB — which will exceed default quotas.

**Mitigation:** Compress files before queuing (if JPEG/PNG, they're already compressed; PDF files are typically small). If the queue approaches storage limits, warn the technician and suggest draining manually.

### No Encryption on Upload Queue

The upload queue stores files temporarily before they reach the Hub. Since the lab portal is near-online and items expire after 48 hours, the risk profile is lower than long-term PHI storage. However, the queue does contain lab result files (which are PHI-adjacent).

**Decision for implementing agent:** If the lab-lite app uses Dexie encryption (like opd-lite's key-in-memory approach), apply it here too. If not, document this as a known limitation and create a follow-up item.

### Relationship to Epic 9 (Sync Engine)

Story 9.2 (Background Sync Worker & Retry Logic) implements a **generic FHIR resource sync queue** for all spoke apps. This story's upload queue is **intentionally separate** from the sync engine for three reasons:

1. **Binary file handling** — The sync engine processes FHIR JSON resources. Lab uploads are 20MB binary files (PDF/JPEG/PNG) that don't fit the FHIR sync model.
2. **Expiry semantics** — Sync queue items persist indefinitely until drained. Lab upload items expire after 48 hours and require re-upload (freshness constraint from PRD).
3. **Queue limits** — The sync engine has no item limit. The lab upload queue is capped at 50 items due to IndexedDB storage constraints with large binaries.

When Epic 9 ships, lab-lite's **FHIR metadata** (DiagnosticReport resources, notifications) should flow through the sync engine. But the **file upload queue** remains separate. Do not merge these two mechanisms.

### References

- PRD: LAB-024
- PRD: Cache management — "Lab Portal: Upload queue up to 50 pending items, 48 hours"
- Story 7.1: PWA Dexie Encryption (encryption pattern if applicable)
- Story 9.2: Background Sync Worker (generic sync — separate from this upload queue)

## Dev Agent Record

### Implementation Plan

- **Task 1:** Created Dexie database with `uploadQueue` table, auto-incrementing ID, and indexes on `status` and `queuedAt`. FIFO ordering via `queuedAt` index. 50-item limit enforced at `addToQueue()` level with clear error message.
- **Task 2:** Built `UploadQueue.tsx` component displaying items with patient name, test category, queued timestamp, and status badges. Expired items highlighted with yellow background. Discard requires confirmation dialog. Re-upload resets timestamp and retry count.
- **Task 3:** Auto-drain worker listens for `online` event, processes pending items in FIFO order. Converts file Blobs to base64 for the existing `uploadResult` tRPC endpoint. Exponential backoff (1s, 4s, 16s) with max 3 retries. Failed items stop retrying and remain visible in queue UI.
- **Task 4:** Expiry checker runs on app load and every 15 minutes. Marks pending/uploading items older than 48h as `expired`. Emits audit events for each expiry.
- **Task 5:** Fire-and-forget audit reporting via `reportQueueAuditEvent()` to `lab.reportQueueEvent` tRPC endpoint. Four event types: QUEUE_ENTRY_CREATED, QUEUE_DRAIN_SUCCESS, QUEUE_ITEM_EXPIRED, QUEUE_ITEM_DISCARDED. Never throws on failure.

### Encryption Decision

Lab-lite does NOT currently use Dexie encryption. The upload queue stores files temporarily (max 48h) before they reach the Hub. This is documented as a known limitation. If encryption is added to lab-lite in the future (following opd-lite's key-in-memory pattern from Story 7.1), the upload queue Dexie instance should be wrapped with the same encryption middleware.

### Completion Notes

- All 5 tasks completed with 30 new unit tests (all passing)
- 2 pre-existing test failures in `metadata-form.test.tsx` and `patient-verify-scanner.test.tsx` (from Stories 12.2/12.3) — not regressions from this story
- Added `dexie` as a production dependency to lab-lite
- Sleep function in drain worker is injectable for testability
- Queue audit events follow the same fire-and-forget pattern as existing auth audit events

## File List

### New Files
- `apps/lab-lite/src/lib/db.ts` — Dexie database schema and queue operations
- `apps/lab-lite/src/components/UploadQueue.tsx` — Upload queue UI panel
- `apps/lab-lite/src/lib/upload-queue-worker.ts` — Auto-drain worker with retry logic
- `apps/lab-lite/src/lib/expiry-check.ts` — 48-hour expiry checker
- `apps/lab-lite/src/lib/queue-audit.ts` — Queue audit event reporting
- `apps/lab-lite/src/__tests__/upload-queue-db.test.ts` — DB layer tests (9 tests)
- `apps/lab-lite/src/__tests__/upload-queue-ui.test.tsx` — UI component tests (11 tests)
- `apps/lab-lite/src/__tests__/upload-queue-worker.test.ts` — Worker tests (8 tests)
- `apps/lab-lite/src/__tests__/expiry-check.test.ts` — Expiry check tests (7 tests)
- `apps/lab-lite/src/__tests__/queue-audit.test.ts` — Audit event tests (6 tests)

### Modified Files
- `apps/lab-lite/package.json` — Added `dexie` dependency
- `pnpm-lock.yaml` — Updated lock file

### Review Findings

- [x] [Review][Defer] **D1: Audit system bypasses `@ultranos/audit-logger`** — Deferred. Keep raw-fetch for consistency with existing lab-lite auth audit pattern. Adopt `@ultranos/audit-logger` across all lab-lite audit calls in a dedicated story.
- [x] [Review][Patch] **P1: Concurrent drain with no mutex — duplicate uploads possible** [`upload-queue-worker.ts`] — Fixed: added module-level `draining` guard with try/finally reset.
- [x] [Review][Patch] **P2: Silent blob conversion failure uploads empty file** [`upload-queue-worker.ts`] — Fixed: removed silent catch; blob failure now enters retry path. Made `blobToBase64Fn` injectable for testability.
- [x] [Review][Patch] **P3: Expiry checker marks `uploading` items as `expired`** [`expiry-check.ts`] — Fixed: added `'uploading'` to skip condition.
- [x] [Review][Patch] **P4: No auth token on audit reporting endpoint** [`queue-audit.ts`] — Fixed: added optional `token` parameter with `Authorization` header.
- [x] [Review][Patch] **P5: No `QUEUE_ITEM_DISCARDED` audit event on discard** [`UploadQueue.tsx`] — Fixed: `handleDiscard` now emits `QUEUE_ITEM_DISCARDED` audit event.
- [x] [Review][Patch] **P6: No `QUEUE_ENTRY_CREATED` audit event at enqueue call site** [`db.ts`] — Fixed: `addToQueue` accepts optional `onCreated` callback for audit emission.
- [x] [Review][Patch] **P7: TOCTOU race on queue limit check** [`db.ts`] — Fixed: `count()` and `add()` wrapped in Dexie `rw` transaction.
- [x] [Review][Defer] **W1: Audit events silently dropped with no local fallback** [`queue-audit.ts:39`] — Fire-and-forget with empty catch, no local retry queue. Systemic to lab-lite's audit pattern, not introduced by this story. Deferred, pre-existing.

## Change Log

- 2026-04-30: Implemented upload queue with offline resilience (all 5 tasks, 30 tests)
- 2026-04-30: Code review complete — 1 decision, 7 patches, 1 deferred, 9 dismissed
