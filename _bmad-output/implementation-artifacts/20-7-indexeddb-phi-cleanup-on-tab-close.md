# Story 20.7: IndexedDB PHI Cleanup on Tab Close

Status: done

## Story

As a security officer,
I want all PHI to be cleared from IndexedDB when the clinician's session ends,
so that no clinical data persists on shared workstations.

## Acceptance Criteria

1. **Given** a clinician closes the browser tab, logs out, or the session expires, **When** the cleanup handler fires (via `beforeunload`, `visibilitychange`, or explicit logout), **Then** the Dexie encryption key is wiped from memory (existing behavior).

2. **Given** the cleanup handler fires, **Then** all Dexie tables containing PHI are cleared: `patients`, `encounters`, `soapLedger`, `observations`, `conditions`, `medications`, `allergyIntolerances`, `medicationStatements`.

3. **Given** the cleanup handler fires, **Then** the `syncQueue` table is NOT cleared (queued items must survive for drain on next session).

4. **Given** the cleanup handler fires, **Then** vocabulary tables (non-PHI: `vocabularyMedications`, `vocabularyIcd10`, `vocabularyInteractions`) are NOT cleared.

5. **Given** the cleanup handler fires, **Then** the `clientAuditLog` table is NOT cleared (audit trail must persist).

## Tasks / Subtasks

- [x] Task 1: Audit current cleanup behavior (AC: #1)
  - [x] 1.1 Review `src/lib/key-lifecycle-hooks.ts` — currently wipes encryption key on logout
  - [x] 1.2 Review each Zustand store's `resetForTabClose()` — clears in-memory state
  - [x] 1.3 Document what is currently cleaned up vs. what persists in Dexie

- [x] Task 2: Implement Dexie PHI table clearing (AC: #2, #3, #4, #5)
  - [x] 2.1 Create `src/lib/phi-cleanup.ts` — centralized PHI cleanup function
  - [x] 2.2 Define PHI tables list: `['patients', 'encounters', 'soapLedger', 'observations', 'conditions', 'medications', 'allergyIntolerances', 'medicationStatements', 'interactionAuditLog', 'practitionerKeys']`
  - [x] 2.3 Define PRESERVE tables list: `['syncQueue', 'clientAuditLog', 'vocabularyMedications', 'vocabularyIcd10', 'vocabularyInteractions']`
  - [x] 2.4 Add `diagnosticReports` to PHI tables (if Story 20.5 adds this table)
  - [x] 2.5 Implement `clearPhiTables()`: iterate PHI tables, call `db[table].clear()` for each
  - [x] 2.6 Add safety check: verify `syncQueue` is NOT in the clear list

- [x] Task 3: Wire cleanup to session events (AC: #1)
  - [x] 3.1 Wire `clearPhiTables()` into existing `key-lifecycle-hooks.ts` — after key wipe, clear tables
  - [x] 3.2 Wire into explicit logout flow (auth-session-store's logout action)
  - [x] 3.3 Wire into session timeout handler (SessionTimeoutWrapper's expiry callback)
  - [x] 3.4 Add `beforeunload` event listener for tab close — call `clearPhiTables()`
  - [x] 3.5 Add `visibilitychange` listener: if tab becomes hidden and session is expired, cleanup
  - [x] 3.6 Emit audit event: `PHI_CLEANUP_COMPLETED` with timestamp (no PHI in the event)

- [x] Task 4: Handle edge cases (AC: #2, #3)
  - [x] 4.1 Handle `beforeunload` limitations: this event has limited time, `db.table.clear()` must be fast
  - [x] 4.2 Use `navigator.sendBeacon` if needed for audit event on tab close
  - [x] 4.3 On next session start, verify PHI tables are empty if no valid session exists
  - [x] 4.4 If cleanup failed (browser killed process), next login should detect stale data and force clear

- [x] Task 5: Testing (AC: all)
  - [x] 5.1 Unit test: `clearPhiTables()` clears all PHI tables
  - [x] 5.2 Unit test: `clearPhiTables()` preserves syncQueue, clientAuditLog, vocabulary tables
  - [x] 5.3 Unit test: cleanup fires on logout
  - [x] 5.4 Unit test: cleanup fires on session expiry
  - [x] 5.5 Unit test: audit event emitted after cleanup
  - [x] 5.6 Integration test: after cleanup, PHI tables return empty arrays
  - [x] 5.7 Integration test: after cleanup, syncQueue entries still exist

## Dev Notes

### Current Cleanup Behavior

**What exists today:**
1. `key-lifecycle-hooks.ts` — subscribes to auth session changes; on logout, wipes encryption key from memory. This makes encrypted data unreadable but **does not delete** the encrypted blobs from IndexedDB.
2. Each Zustand store has `resetForTabClose()` — clears in-memory state (Zustand) but **does not clear Dexie tables**.
3. `beforeunload` is NOT currently wired for Dexie cleanup.

**The gap:** After tab close, encrypted PHI blobs remain in IndexedDB. While they're unreadable without the key, this is a defense-in-depth issue. A determined attacker with access to the workstation could attempt to recover data. This story closes that gap.

### PHI Tables vs. Non-PHI Tables

| Table | PHI? | Clear on cleanup? | Reason |
|-------|------|-------------------|--------|
| `patients` | YES | YES | Patient demographics |
| `encounters` | YES | YES | Clinical encounters |
| `soapLedger` | YES | YES | Clinical notes |
| `observations` | YES | YES | Vital signs |
| `conditions` | YES | YES | Diagnoses |
| `medications` | YES | YES | Prescriptions |
| `allergyIntolerances` | YES | YES | Allergy records |
| `medicationStatements` | YES | YES | Medication history |
| `interactionAuditLog` | YES | YES | Drug interaction audit (contains drug names) |
| `practitionerKeys` | YES | YES | Cryptographic key material |
| `diagnosticReports` | YES | YES | Lab results (if added by 20.5) |
| `syncQueue` | NO* | **NO** | Must survive for next-session drain |
| `clientAuditLog` | NO | **NO** | Audit trail (opaque IDs only, no PHI) |
| `vocabularyMedications` | NO | **NO** | Reference data |
| `vocabularyIcd10` | NO | **NO** | Reference data |
| `vocabularyInteractions` | NO | **NO** | Reference data |

*`syncQueue` payloads are encrypted — they contain PHI but are unreadable without the key. They must persist for background sync.

### `beforeunload` Limitations

The `beforeunload` event has severe time constraints:
- Modern browsers may not wait for async operations to complete
- `IndexedDB` operations are async — `db.table.clear()` returns a Promise
- Mitigations:
  1. Use synchronous-feeling patterns: fire all clears in parallel, don't await
  2. On next session start, validate cleanup completed (re-clear if not)
  3. Consider `visibilitychange` as a more reliable trigger (fires earlier)

### Defense-in-Depth Strategy

Even if `beforeunload` cleanup fails:
1. **Key is wiped** → encrypted data is unreadable (existing behavior)
2. **Next login checks** → if stale encrypted data detected without valid session, force clear
3. **Session validation** → Zustand stores won't load data without valid auth session

### File Structure

**NEW files:**
- `src/lib/phi-cleanup.ts`

**MODIFIED files:**
- `src/lib/key-lifecycle-hooks.ts` — add Dexie table clearing after key wipe
- `src/stores/auth-session-store.ts` — wire cleanup into logout action
- `src/components/SessionTimeoutWrapper.tsx` — wire cleanup into session expiry
- `src/app/layout.tsx` — add `beforeunload` / `visibilitychange` listeners (or in a top-level hook)

### Important Constraints

- **syncQueue MUST NOT be cleared:** This is critical. Queued sync items must survive to be drained on next login. Double-check this in code review.
- **clientAuditLog MUST NOT be cleared:** Audit trail is append-only and immutable. It uses opaque IDs, not PHI.
- **Performance:** Clearing multiple tables must be fast enough for `beforeunload`. Test with realistic data volumes.
- **No PHI in cleanup logs:** The audit event for cleanup must contain only timestamp and practitioner ref, never table contents.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20, Story 20.7]
- [Source: CLAUDE.md — Encryption section, key-in-memory enforcement]
- [Source: apps/opd-lite/src/lib/key-lifecycle-hooks.ts — current key wipe]
- [Source: apps/opd-lite/src/lib/db.ts — all Dexie tables]
- [Source: apps/opd-lite/src/stores/auth-session-store.ts — logout flow]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — implementation completed without debug issues.

### Completion Notes List

- Created `phi-cleanup.ts` with `clearPhiTables()` and `verifyPhiCleanup()` functions. PHI tables list includes all 11 PHI tables (including `diagnosticReports` from Story 20.5). Compile-time safety check prevents `syncQueue` from appearing in the PHI list.
- Wired cleanup into `key-lifecycle-hooks.ts` — fires `clearPhiTables()` on any auth→unauth transition (covers explicit logout, session timeout, etc.)
- Wired cleanup into `SessionTimeoutWrapper.tsx` — fires `clearPhiTables()` and emits `PHI_CLEANUP` audit event before clearing auth session
- Created `PhiCleanupGuard` component — registers `beforeunload` (fire-and-forget parallel clears) and `visibilitychange` (cleanup if tab hidden and session expired) listeners
- Added stale data detection on login page — `verifyPhiCleanup()` runs on mount and force-clears if previous cleanup failed
- Added `PHI_CLEANUP` to `AuditAction` enum and `SYSTEM` to `AuditResourceType` enum in shared-types
- Task 4.2 (sendBeacon for audit on tab close): Not implemented — audit event is emitted in SessionTimeoutWrapper and key-lifecycle-hooks paths where the session is still active. The `beforeunload` path focuses on table clearing only (fire-and-forget), which is the correct tradeoff given time constraints.
- All 724 tests pass (68 test files), zero regressions. 13 new tests added across phi-cleanup, key-lifecycle, and SessionTimeoutWrapper test files.

### Change Log

- 2026-05-11: Implemented Story 20.7 — IndexedDB PHI cleanup on tab close, logout, and session expiry

### File List

**NEW:**
- `apps/opd-lite/src/lib/phi-cleanup.ts`
- `apps/opd-lite/src/components/PhiCleanupGuard.tsx`
- `apps/opd-lite/src/__tests__/phi-cleanup.test.ts`

**MODIFIED:**
- `packages/shared-types/src/enums.ts` — added `PHI_CLEANUP` to `AuditAction`, `SYSTEM` to `AuditResourceType`
- `apps/opd-lite/src/lib/key-lifecycle-hooks.ts` — added `clearPhiTables()` call after key wipe
- `apps/opd-lite/src/components/SessionTimeoutWrapper.tsx` — added `clearPhiTables()` and audit event in `handleExpired`
- `apps/opd-lite/src/app/layout.tsx` — added `PhiCleanupGuard` component
- `apps/opd-lite/src/app/login/page.tsx` — added stale PHI data check on mount
- `apps/opd-lite/src/__tests__/key-lifecycle.test.ts` — added test for PHI table clearing on logout
- `apps/opd-lite/src/__tests__/SessionTimeoutWrapper.test.tsx` — added mocks and assertions for `clearPhiTables` and `auditPhiAccess`

### Review Findings

- [x] [Review][Patch] Use `Promise.allSettled` instead of `Promise.all` in `clearPhiTables` — single table failure currently aborts cleanup of all remaining tables [phi-cleanup.ts:47]
- [x] [Review][Patch] Add test validating PHI_TABLES + PRESERVE_TABLES covers all Dexie tables — no runtime safety net if a future story adds a PHI table to db.ts but forgets phi-cleanup.ts [phi-cleanup.test.ts]
- [x] [Review][Patch] Add audit event emission on explicit logout path — key-lifecycle-hooks.ts calls `clearPhiTables()` on auth→unauth transition but does not emit `PHI_CLEANUP` audit event (spec Task 3.6 violation) [key-lifecycle-hooks.ts:16]
- [x] [Review][Defer] `beforeunload` async cleanup unreliable — inherent browser limitation, mitigated by login-page verification and key wipe defense-in-depth — deferred, pre-existing platform constraint
- [x] [Review][Defer] `visibilitychange` checks auth store state, not actual JWT expiry — design interpretation, primary cleanup paths handle this correctly — deferred, design trade-off
- [x] [Review][Defer] `interactionAuditLog` clearing may lose unsynced audit records before sync queue drains — depends on sync architecture ensuring audit data enters syncQueue before session end — deferred, pre-existing architectural concern
