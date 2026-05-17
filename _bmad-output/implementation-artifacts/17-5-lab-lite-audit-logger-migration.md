# Story 17.5: Lab Lite Audit Logger Migration

Status: done

## Story

As a compliance officer,
I want Lab Lite to use the canonical `@ultranos/audit-logger` for all audit events,
so that audit integrity is maintained with SHA-256 hash chaining.

## Acceptance Criteria

1. **Given** Lab Lite's existing raw `fetch`-based audit reporting in `queue-audit.ts` and `trpc.ts`, **when** the migration is complete, **then** all audit events use `@ultranos/audit-logger/client` instead of raw fetch
2. **And** all auth audit events (LOGIN_SUCCESS, LOGIN_FAILURE, MFA_VERIFY_SUCCESS, MFA_VERIFY_FAILURE) use the canonical logger
3. **And** all queue audit events (QUEUE_ENTRY_CREATED, QUEUE_DRAIN_SUCCESS, QUEUE_ITEM_EXPIRED, QUEUE_ITEM_DISCARDED) use the canonical logger
4. **And** the `AuditDrainWorker` from `@ultranos/audit-logger` replaces the raw fetch pattern for syncing events to the Hub
5. **And** failed audit events are persisted locally in IndexedDB for retry (never silently dropped)
6. **And** existing audit event shapes and metadata are preserved (no data loss in migration)

## Tasks / Subtasks

- [x] Task 1: Understand `@ultranos/audit-logger` client API (AC: #1)
  - [x] 1.1 Read `packages/audit-logger/` exports — identify `AuditLogger`, `AuditDrainWorker`, client-side API
  - [x] 1.2 Identify how OPD Lite and Pharmacy Lite use the client logger (reference implementations)
  - [x] 1.3 Understand IndexedDB persistence for failed events and the drain/retry mechanism

- [x] Task 2: Migrate auth audit events (AC: #2)
  - [x] 2.1 Replace `reportAuthEvent()` in `apps/lab-lite/src/lib/trpc.ts` with `@ultranos/audit-logger/client` calls
  - [x] 2.2 Map existing auth event types to `AuditLogger.emit()` format:
    - `LOGIN_SUCCESS` → `{ action: 'LOGIN', resourceType: 'USER_ACCOUNT', outcome: 'SUCCESS' }`
    - `LOGIN_FAILURE` → `{ action: 'LOGIN', resourceType: 'USER_ACCOUNT', outcome: 'FAILURE' }`
    - `MFA_VERIFY_SUCCESS` → `{ action: 'MFA_FAIL', resourceType: 'USER_ACCOUNT', outcome: 'SUCCESS' }` (or appropriate action)
    - `MFA_VERIFY_FAILURE` → `{ action: 'MFA_FAIL', resourceType: 'USER_ACCOUNT', outcome: 'FAILURE' }`
  - [x] 2.3 Update `apps/lab-lite/src/app/login/page.tsx` to use the new audit function
  - [x] 2.4 Preserve existing metadata: `{ authEvent, failedEmail: '[REDACTED]' }`

- [x] Task 3: Migrate queue audit events (AC: #3)
  - [x] 3.1 Replace `reportQueueAuditEvent()` in `apps/lab-lite/src/lib/queue-audit.ts` with `@ultranos/audit-logger/client`
  - [x] 3.2 Map queue event types:
    - `QUEUE_ENTRY_CREATED` → `{ action: 'CREATE', resourceType: 'LAB_RESULT', outcome: 'SUCCESS' }`
    - `QUEUE_DRAIN_SUCCESS` → `{ action: 'UPDATE', resourceType: 'LAB_RESULT', outcome: 'SUCCESS' }`
    - `QUEUE_ITEM_EXPIRED` → `{ action: 'UPDATE', resourceType: 'LAB_RESULT', outcome: 'FAILURE' }`
    - `QUEUE_ITEM_DISCARDED` → `{ action: 'UPDATE', resourceType: 'LAB_RESULT', outcome: 'FAILURE' }`
  - [x] 3.3 Preserve existing metadata: `{ queueEntryId, testCategory, patientRef, timestamp }`
  - [x] 3.4 Update all callers: `UploadQueue.tsx`, `upload-queue-worker.ts`, `expiry-check.ts`, upload wizard (17.2)

- [x] Task 4: Wire up AuditDrainWorker (AC: #4, #5)
  - [x] 4.1 Initialize `AuditDrainWorker` in the Lab Lite app (e.g., in `ClientErrorBoundary.tsx` or a new `AuditProvider`)
  - [x] 4.2 Configure drain target: Hub API audit endpoint
  - [x] 4.3 Configure IndexedDB table for local persistence of pending audit events
  - [x] 4.4 Failed audit events stored in IndexedDB, retried by drain worker on next cycle

- [x] Task 5: Remove old raw fetch audit code (AC: #1)
  - [x] 5.1 Remove or deprecate `reportQueueAuditEvent()` function body (replace with canonical logger call)
  - [x] 5.2 Remove `reportAuthEvent()` raw fetch body (replace with canonical logger call)
  - [x] 5.3 Keep the function signatures as thin wrappers if callers depend on them, or update all callers to use the logger directly

- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Auth events emitted via canonical logger (not raw fetch)
  - [x] 6.2 Queue events emitted via canonical logger
  - [x] 6.3 Failed audit events persisted in IndexedDB (mock storage, verify write)
  - [x] 6.4 AuditDrainWorker retries failed events on next cycle
  - [x] 6.5 Event metadata preserved after migration (same fields, same values)
  - [x] 6.6 Existing queue and auth flows still work end-to-end

## Dev Notes

### Current Audit Architecture (Pre-Migration)

**Auth events** (`apps/lab-lite/src/lib/trpc.ts:reportAuthEvent`):
- Raw `fetch` POST to `/lab.reportAuthEvent`
- Fire-and-forget: `catch {}` silently swallows errors
- No local persistence — if fetch fails, event is lost

**Queue events** (`apps/lab-lite/src/lib/queue-audit.ts:reportQueueAuditEvent`):
- Raw `fetch` POST to `/lab.reportQueueEvent`
- Fire-and-forget: `catch {}` silently swallows errors
- No local persistence — if fetch fails, event is lost

**Problem:** Both paths silently drop audit events on network failure. This violates CLAUDE.md Rule #6: "Every read, write, or access to patient data must emit a structured audit event via @ultranos/audit-logger. No exceptions."

### Target Architecture (Post-Migration)

```
Caller → @ultranos/audit-logger/client.emit() → IndexedDB (persist first)
                                                      ↓
                                              AuditDrainWorker (background)
                                                      ↓
                                              Hub API audit endpoint
                                                      ↓
                                        On success: remove from IndexedDB
                                        On failure: retry with backoff
```

This ensures events are **never lost** — they're persisted locally before any network call.

### `@ultranos/audit-logger` Client API

Check the package exports for a client-side API. It should provide:
- `emit(event: AuditEvent)` → persists to IndexedDB + attempts immediate send
- `AuditDrainWorker` → background worker that retries failed events
- IndexedDB schema for pending events

If the package doesn't have a `/client` export yet, you may need to create a thin client wrapper in the audit-logger package that:
1. Writes events to a Dexie table (separate from the upload queue)
2. Exposes a drain worker that sends to the Hub API
3. Retries on failure with backoff

**Important:** Check how OPD Lite and Pharmacy Lite handle client-side audit. They may already have a pattern to follow. If `@ultranos/audit-logger` only has server-side exports, the client wrapper creation becomes part of this story's scope.

### Dexie Table for Audit Events

If a new Dexie table is needed, add it to the existing `lab-lite-db` database:
```typescript
// In apps/lab-lite/src/lib/db.ts — increment version
this.version(2).stores({
  uploadQueue: '++id, status, queuedAt',
  auditEvents: '++id, status, createdAt',
})
```

**Audit event entry:**
```typescript
interface PendingAuditEvent {
  id?: number
  event: AuditEvent    // The full audit event payload
  status: 'pending' | 'sent' | 'failed'
  createdAt: string
  retryCount: number
  lastAttemptAt: string | null
}
```

### Migration Safety

- **Do NOT change the Hub API audit endpoints.** The migration is client-side only.
- **Preserve all metadata fields.** Auth events: `{ authEvent, failedEmail }`. Queue events: `{ queueEntryId, testCategory, patientRef, timestamp }`.
- **Keep function signatures stable** if possible — callers in `login/page.tsx`, `UploadQueue.tsx`, `upload-queue-worker.ts`, `expiry-check.ts` should need minimal changes.

### Project Structure Notes

**New files:**
- `apps/lab-lite/src/lib/audit-client.ts` — Lab Lite audit client wrapping `@ultranos/audit-logger`
- `apps/lab-lite/src/__tests__/audit-migration.test.ts`

**Modified files:**
- `apps/lab-lite/src/lib/trpc.ts` — replace `reportAuthEvent()` body with canonical logger
- `apps/lab-lite/src/lib/queue-audit.ts` — replace `reportQueueAuditEvent()` body with canonical logger
- `apps/lab-lite/src/lib/db.ts` — add `auditEvents` table (version 2 migration)
- `apps/lab-lite/src/components/ClientErrorBoundary.tsx` — initialize AuditDrainWorker (or new AuditProvider)
- `apps/lab-lite/package.json` — add `@ultranos/audit-logger` dependency

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-17.5] — Story acceptance criteria
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#LAB-G08] — Audit events fire-and-forget with no fallback (MEDIUM)
- [Source: CLAUDE.md#Rule-6] — "Every PHI access must emit a structured audit event via @ultranos/audit-logger. No exceptions."
- [Source: apps/lab-lite/src/lib/queue-audit.ts] — Current raw fetch audit (to be replaced)
- [Source: apps/lab-lite/src/lib/trpc.ts#reportAuthEvent] — Current raw fetch auth audit (to be replaced)
- [Source: packages/audit-logger/] — Canonical audit logger package
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#D1] — "Adopt @ultranos/audit-logger across lab-lite"

### Previous Epic Intelligence (from Epic 12)

- Story 12.5 review flagged: "W1: Audit events silently dropped with no local fallback (fire-and-forget pattern)"
- Story 12.5 review flagged: "D1: Adopt @ultranos/audit-logger across lab-lite"
- Hub-side audit uses `AuditLogger` class with `emit()` method taking `{ action, resourceType, resourceId, actorId, actorRole, outcome, sessionId, metadata }`
- Audit events are append-only with SHA-256 hash chaining — the client just needs to emit; server handles chain integrity
- Auth audit uses `baseProcedure` on Hub (no JWT required for failed login events)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Pre-existing test failure: `patient-verify-scanner.test.tsx` > "parses Health Passport QR payload" — QR scan timing issue unrelated to audit migration

### Completion Notes List
- **Task 1:** Explored `@ultranos/audit-logger` package — found complete client API with `/client`, `/drain`, and `/adapters/dexie` exports. OPD Lite and Pharmacy Lite both use identical patterns: `DexieAuditAdapter` → `setAuditStoreAdapter()` → `emitClientAudit()` with `auditPhiAccess()` wrapper.
- **Task 2:** Created `audit-client.ts` with `reportAuthEvent()` that maps LOGIN_SUCCESS/FAILURE → AuditAction.LOGIN and MFA_VERIFY_SUCCESS/FAILURE → AuditAction.MFA_FAIL. Updated `login/page.tsx` to import from `@/lib/audit-client`. Metadata preserves `{ authEvent, failedEmail: '[REDACTED]' }`.
- **Task 3:** Created `reportQueueAuditEvent()` in `audit-client.ts` mapping QUEUE_ENTRY_CREATED → CREATE, all others → UPDATE. Updated `UploadQueue.tsx`, `UploadHistoryList.tsx`, `upload/page.tsx` to import from `@/lib/audit-client`. Removed `token` second parameter (drain worker handles auth).
- **Task 4:** Created `AuditDrainInit` component mounted inside `ClientErrorBoundary`/`AuthGuard`. Drain worker starts after login, stops on unmount. Added `stopAuditDrain()` call in `SessionTimeoutWrapper.handleExpired()`. DB schema upgraded to v2 with `clientAuditLog` table using `CLIENT_AUDIT_SCHEMA` from audit-logger package.
- **Task 5:** Removed `reportAuthEvent()` raw fetch function from `trpc.ts`. Replaced `queue-audit.ts` with a re-export from `audit-client.ts` for backward compatibility. Created `hlc.ts` HLC singleton for Lab Lite.
- **Task 6:** Wrote 15 tests in `audit-migration.test.ts` covering auth events (6), queue events (7), and IndexedDB persistence (2). Updated existing tests: `login-page.test.tsx` mock path, `upload-history.test.tsx` mock path, `upload-wizard.test.tsx` mock path + removed token arg assertion, `queue-audit.test.ts` rewritten for canonical logger. All 192 tests pass; 1 pre-existing failure in scanner test.

### Change Log
- 2026-05-11: Migrated Lab Lite audit system from raw fetch fire-and-forget to canonical `@ultranos/audit-logger` with IndexedDB persistence and AuditDrainWorker background sync

### File List
- `apps/lab-lite/package.json` — added `@ultranos/audit-logger` dependency
- `apps/lab-lite/vitest.config.ts` — added audit-logger path aliases
- `apps/lab-lite/src/lib/audit-client.ts` — NEW: canonical audit client wrapper
- `apps/lab-lite/src/lib/hlc.ts` — NEW: HLC singleton for Lab Lite
- `apps/lab-lite/src/lib/db.ts` — added `clientAuditLog` table (version 2 migration)
- `apps/lab-lite/src/lib/trpc.ts` — removed `reportAuthEvent()` raw fetch function
- `apps/lab-lite/src/lib/queue-audit.ts` — replaced with re-export from audit-client
- `apps/lab-lite/src/app/login/page.tsx` — updated import to `@/lib/audit-client`
- `apps/lab-lite/src/app/upload/page.tsx` — updated import, removed token arg
- `apps/lab-lite/src/components/UploadQueue.tsx` — updated import to `@/lib/audit-client`
- `apps/lab-lite/src/components/history/UploadHistoryList.tsx` — updated import to `@/lib/audit-client`
- `apps/lab-lite/src/components/AuditDrainInit.tsx` — NEW: drain worker lifecycle component
- `apps/lab-lite/src/components/ClientErrorBoundary.tsx` — added AuditDrainInit
- `apps/lab-lite/src/components/SessionTimeoutWrapper.tsx` — added stopAuditDrain on expiry
- `apps/lab-lite/src/__tests__/audit-migration.test.ts` — NEW: 15 tests for audit migration
- `apps/lab-lite/src/__tests__/queue-audit.test.ts` — rewritten for canonical logger
- `apps/lab-lite/src/__tests__/login-page.test.tsx` — updated mock path
- `apps/lab-lite/src/__tests__/upload-history.test.tsx` — updated mock path
- `apps/lab-lite/src/__tests__/upload-wizard.test.tsx` — updated mock path + assertion
- `pnpm-lock.yaml` — updated lockfile

### Review Findings

- [x] [Review][Patch] **Outcome field missing from all audit events** — FIXED: added outcome to metadata — `outcome` is computed in both `reportAuthEvent` (line 63) and `reportQueueAuditEvent` (lines 103-108) but never included in the emitted `ClientAuditEventInput`. The spec requires `{ action, outcome }` pairs (e.g., `LOGIN/SUCCESS`, `UPDATE/FAILURE`). `ClientAuditEventInput` has no `outcome` field. Without it, LOGIN_SUCCESS is indistinguishable from LOGIN_FAILURE in the audit trail, and QUEUE_DRAIN_SUCCESS from QUEUE_ITEM_EXPIRED. `outcomeMap` is dead code. [audit-client.ts:63,103-108] (Sources: blind+edge+auditor)
- [x] [Review][Defer] **Pre-login failure events never synced to Hub** — `AuditDrainInit` mounts inside `AuthGuard` (only after login). Pre-login events are persisted to IndexedDB and drain on next successful login. Only gap: users who never log in. Server-side auth event capture (W6 from 12-1 review) is the proper fix. [AuditDrainInit.tsx, ClientErrorBoundary.tsx:46] — deferred, server-side capture is the correct solution
- [x] [Review][Patch] **Module-level SSR crash risk** — FIXED: added typeof window guard — `audit-client.ts` runs `getDb().clientAuditLog` and `setAuditStoreAdapter()` at module scope (lines 12-13). `getDb()` creates a Dexie instance which requires IndexedDB. In Next.js SSR (Node.js), this throws `ReferenceError: indexedDB is not defined`. Fix: add `typeof window !== 'undefined'` guard or add `'use client'` directive. [audit-client.ts:12-13] (Sources: blind+edge)
- [x] [Review][Defer] **stopAuditDrain doesn't abort in-flight sync** — `AuditDrainWorker.stop()` clears the event listener but doesn't signal a running `drain()` loop to abort. Mid-flight syncs continue after session expiry with a stale/null token. Package-level issue in `@ultranos/audit-logger/drain.ts`. [audit-client.ts:48-51, packages/audit-logger/src/drain.ts] — deferred, pre-existing package design
- [x] [Review][Defer] **patientRef in audit metadata** — `reportQueueAuditEvent` puts `patientRef` into audit metadata. If this is a display name rather than an opaque ID, it could be a PHI leak. Pre-existing — old raw-fetch code also sent patientRef. [audit-client.ts:121] — deferred, pre-existing
