# Story 57.3: Dispense Record Durability & Offline Double-Dispense Protection

Status: review

## Story

As a pharmacist working offline shifts,
I want every dispense to be durably queued for sync regardless of auth-token state, and re-scans of an already-dispensed QR to be caught locally,
so that no dispense record is ever silently lost and no prescription is dispensed twice offline.

## Acceptance Criteria

1. **Given** a dispense completes while the auth token is unavailable/expired, **when** the sync layer runs, **then** the dispense is STILL enqueued (the drain fetches the token at drain time) — the current "no token → don't queue" paths are removed.
2. **Given** unsynced dispenses exist locally, **when** logout/session-end PHI cleanup runs, **then** unsynced dispense records are preserved (or exported to the durable queue first) — cleanup never destroys the only copy of a dispense.
3. **Given** a QR is scanned whose prescription already has a local dispense record, **when** the pharmacist proceeds, **then** the local idempotency check fires a blocking "Already dispensed on this device" warning — including fully offline (the Hub duplicate check remains as the online layer).
4. **Given** a sync push fails with a permanent 4xx validation error, **then** the entry is dead-lettered (visible in the sync page) — not retried infinitely.
5. **Given** a startup/reconnect sweep runs, **then** any dispense in `db.dispenses` lacking a corresponding synced/queued entry is re-enqueued.
6. **Zero regression:** online dispensing, existing retry behavior for transient failures, PHI cleanup for synced data, and all pre-existing pharmacy tests pass unchanged; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [x] **Task 1: Always-enqueue** (AC: 1)
  - [x] 1.1 `apps/pharmacy-lite/src/lib/dispense-sync.ts:72-76` (`auth-unavailable` → "do not queue") and `:100-103` (no token → return without enqueue): remove token-dependence from enqueue; `drain-sync-fn.ts:23` already fetches the token at drain time.
- [x] **Task 2: Cleanup safety** (AC: 2)
  - [x] 2.1 `apps/pharmacy-lite/src/lib/phi-cleanup.ts:13-17` clears `dispenses`: add an unsynced-guard — records without a synced marker are preserved (with a compile-time/test guard like lab-lite's phi-cleanup pattern).
- [x] **Task 3: Local idempotency check wiring** (AC: 3)
  - [x] 3.1 `apps/pharmacy-lite/src/lib/idempotency-check.ts` (`checkPrescriptionAlreadyDispensed` — currently ZERO callers, audit-verified): invoke in `PharmacyScannerView.handleProceedToReview` before the Hub check (`:146-188`); blocking modal with an explicit supervisor-override escape hatch for legitimate re-dispense scenarios.
- [x] **Task 4: Retry classification + sweep** (AC: 4, 5)
  - [x] 4.1 `dispense-sync.ts:115-117`: stop enqueueing permanent 4xx for infinite retry — dead-letter with status surfaced on the `/sync` page.
  - [x] 4.2 Startup/reconnect sweep re-enqueueing orphaned unsynced dispenses.
- [x] **Task 5: Tests + regression verification** (AC: all)
  - [x] 5.1 Tests: no-token dispense → queued and drains after re-auth; logout with unsynced dispense → preserved; offline double-scan → blocked; 4xx → dead-letter not retry; sweep re-enqueues.
  - [x] 5.2 Full pharmacy suite passes; online dispense happy path unchanged; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-PHARM-1 [A]** (audit §6): offline shift + expired token → dispense exists only in `db.dispenses`, nothing sweeps it, PHI cleanup destroys it at logout — permanent loss of the safety-critical record. **H-PHARM-2 [A]**: the local double-dispense guard is dead code; the only duplicate check is the Hub call which is explicitly fail-open offline. **Low #24**: 4xx infinite retry.

### Architecture

- The sync queue payload does not need a token — only the drain does. This is the existing design (`drain-sync-fn.ts`); the findings are deviations from it.
- Preserve the priority-sync intent (prescriptions before inventory noise — CLAUDE.md priority order); if trivial to add a priority field to the drain here, do it, else leave for Story 60.2's queue work.
- Coordinate with Story 57.2 (override machinery) for the legitimate-re-dispense escape hatch.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Online dispensing, transient-failure retry, and synced-data cleanup behave identically. The changes only ADD durability (queueing without token, preservation of unsynced records, local duplicate warning). All 179 pre-existing pharmacy test files pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `lib/dispense-sync.ts`, `lib/phi-cleanup.ts`, `components/pharmacy/PharmacyScannerView.tsx`, `/sync` page (dead-letter surfacing).
**New files:** `src/__tests__/dispense-durability.test.ts`, `src/__tests__/offline-double-dispense.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#6-pharmacy-lite-appspharmacy-lite] — H-PHARM-1, H-PHARM-2
- [Source: apps/lab-lite/src/lib/phi-cleanup.ts:54-58] — sync-queue preservation pattern with compile-time guard (model)
- [Source: apps/pharmacy-lite/src/lib/drain-sync-fn.ts:23] — drain-time token fetch (existing correct design)

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — rebase onto Wave-1 (reconciled conflicts with 57.1 + 60.2), integration & combined verification.

### Debug Log References
Rebased onto Wave-1 HEAD; reconciled conflicts in `phi-cleanup.ts`/`PharmacyScannerView.tsx` (vs 57.1) and verified the auto-merged sync-engine `queue.ts`/`drain-worker.ts` (vs 60.2) preserve both feature sets.

### Completion Notes List
- **Task 1 (always-enqueue):** removed both token-dependent "do not queue" paths; enqueue no longer requires a token (drain fetches it).
- **Task 2 (cleanup safety):** `preserveUnsyncedDispenses()` — dispenses/dispenseAuditLog moved to a SELECTIVE_CLEAR set (only synced rows purged) with a compile-time `AssertNotBlanket` guard; coexists with 57.1's `patientAllergyCache` blanket-clear.
- **Task 3 (local idempotency):** `checkPrescriptionAlreadyDispensed` wired at the START of `handleProceedToReview` (before the Hub check, works offline) with a supervisor-override escape.
- **Task 4:** permanent 4xx (excl. 408/429) dead-letter via new `queue.markDeadLetter()` — coexists with 60.2's `markFailed(terminal)`; new `dispense-sweep.ts` re-enqueues orphaned unsynced dispenses on login + reconnect.
- **Task 5:** new `dispense-durability` + `offline-double-dispense` tests; +11 i18n keys × 4 locales (parity maintained). No new Dexie version needed (reuses existing schema).
- Added backward-compatible sync-engine API: `SyncResult.permanent`, `queue.markDeadLetter()`.

### Verification (combined tree)
`pnpm -F pharmacy-lite typecheck` + `pnpm -F @ultranos/sync-engine typecheck` clean; sync-engine **191 pass**; pharmacy full suite **1109 pass, 0 fail**.

### File List
Modified — `apps/pharmacy-lite/src/lib/{dispense-sync,drain-sync-fn,phi-cleanup,sync-drain-init}.ts`, `src/components/pharmacy/PharmacyScannerView.tsx`, `messages/{en,ar,prs,ps}.json`, tests; `packages/sync-engine/src/{queue,drain-worker}.ts` + tests.
New — `apps/pharmacy-lite/src/lib/dispense-sweep.ts`, `src/__tests__/{dispense-durability.test.ts,offline-double-dispense.test.tsx}`.

### Change Log
- 2026-09-23: Story 57.3 implemented (Wave 2), rebased/reconciled onto Wave-1, verified, integrated. Status → review.
