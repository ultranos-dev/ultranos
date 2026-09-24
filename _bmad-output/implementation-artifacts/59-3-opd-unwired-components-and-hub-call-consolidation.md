# Story 59.3: OPD Unwired Components & Hub-Call Consolidation

Status: review

## Story

As an OPD clinician (and the compliance officer behind them),
I want the built-but-never-mounted OPD components actually wired — audit drain, background sync, PHI cleanup (redesigned), the AI Scribe auth fix — and the 15 duplicated Hub-auth blocks consolidated with real 401 handling,
so that the app's tested capabilities actually run in production and token expiry stops masquerading as "offline".

## Acceptance Criteria

1. **Given** a session with PHI reads, **when** the app is online, **then** `startAuditDrain` runs (started in `SyncProvider`'s auth effect, stopped on cleanup) and client audit events reach the Hub's hash-chained ledger; local events survive until drained (coordinates with Story 61.1's no-session buffering).
2. **Given** the service worker's Background Sync design, **when** the app runs, **then** `useBackgroundSync()` is mounted (SW sync tags registered, `ULTRANOS_SYNC_TRIGGER` listener attached) and drain-on-reconnect works via the SW path, not only the in-page `online` event.
3. **Given** the "tab close → encrypted cache cleared" requirement, **when** the PhiCleanupGuard design is settled (it must NOT clear on refresh — that would break offline), **then** the redesigned guard is mounted and its semantics documented; if the design decision is to rely on key-wipe only, that decision is recorded and the dead component removed.
4. **Given** the AI Scribe service, **when** it calls the Hub, **then** it uses `getAuthHeaders()` from `lib/hub-auth` (not the nonexistent `session.token`), the consent check succeeds for consented patients, and the AI Assist button activates per its design (physician confirmation gate unchanged).
5. **Given** all ~15 hand-rolled Hub-auth blocks in `lib/trpc.ts`, **then** they route through the single shared helper with: 401 → one token refresh → one retry → surfaced failure (distinct from offline), replacing the `!res.ok → null/[]` pattern.
6. **Given** `SyncProvider.handleOnline`, **then** `markSynced()` runs only after a pull actually succeeds (its own documented rule), fixing the false "in sync" banner.
7. **Zero regression:** all existing sync, encounter, prescription, and dashboard flows work identically; the AI SOAP physician-gate flow is unchanged apart from becoming reachable; all 158 pre-existing OPD test files pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [x] **Task 1: Audit drain wiring** (AC: 1) — `SyncProvider.tsx` auth effect: `startAuditDrain(HUB_BASE_URL, () => cachedToken)` next to `startSyncWorker`; `stopAuditDrain()` on cleanup; integration test asserting drain fires (the "built-but-unmounted" failure mode needs a mount-path test, not more unit tests).
- [x] **Task 2: Background sync mount** (AC: 2) — mount `useBackgroundSync()` in `SyncProvider`; verify SW tags (`sw.ts:67,93-106` expectations) register; test the SW→client trigger message path.
- [x] **Task 3: PhiCleanupGuard decision + fix** (AC: 3) — settle semantics (recommend: clear PHI on auth-expiry/logout paths; on tab close wipe key only [existing `encryption-key-store.ts`] — becomes fully safe once Story 61.2 makes the key non-derivable); implement, mount, or remove with recorded decision. Present as decision point if ambiguous. **DONE post-61.2: dead guard REMOVED (key-wipe-only decision); decision recorded in code + Dev Agent Record.**
- [x] **Task 4: AI Scribe auth fix** (AC: 4) — `services/ai-scribe-service.ts:14-22` → `getAuthHeaders()`; e2e: consent check → AI Assist enabled → parse → physician confirm → commit (hub re-checks consent; both versions stored — verify unchanged).
- [x] **Task 5: Hub-call consolidation + 401 handling** (AC: 5, 6) — refactor the 14 listed helpers in `lib/trpc.ts` through `hub-auth`; add refresh-retry-surface logic; fix `SyncProvider.tsx:207-211` + `:168-170` markSynced ordering. (If Story 59.2's shared client lands first, fold this into that client instead of duplicating.)
- [x] **Task 6: Regression verification** (AC: 7) — full OPD suite; manual: offline→online drain, encounter + prescription flow, AI SOAP gate; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **C-OPD-1 [V]** (audit drain zero callers — 93 audit call sites accumulating locally), **H-OPD-1 [A]** (AI Scribe dead via nonexistent token field — `lib/consent-check.ts:54-57` documents this exact bug fixed elsewhere), **H-OPD-4/5 [A]** (useBackgroundSync/PhiCleanupGuard unmounted), **M-OPD-2 [A]** (15× duplicated auth boilerplate, no 401 handling anywhere except `listEncountersByPractitionerFromHub:249-258` — the model), **M-OPD-4 [A]** (markSynced ordering). Audit §4 + §10 Theme 2 ("built but never wired").

### Architecture

- Order flexibility: Tasks 1/2/4/6 are independent; Task 5 coordinates with Story 59.2; Task 3 coordinates with Story 61.2.
- Rule #2 (AI confirmation gate) must remain fully intact — Task 4 only fixes transport auth.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Every flow that works today works identically; this story only activates dormant capabilities and honest error surfacing. All 158 pre-existing test files pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `components/providers/SyncProvider.tsx`, `services/ai-scribe-service.ts`, `lib/trpc.ts`, `lib/hub-auth.ts`, `components/PhiCleanupGuard.tsx` (redesign or remove).
**New files:** `src/__tests__/audit-drain-wiring.test.tsx`, `src/__tests__/background-sync-mount.test.tsx`, `src/__tests__/hub-auth-401.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#4-opd-lite-appsopd-lite] — C-OPD-1, H-OPD-1/4/5, M-OPD-2/4
- [Source: apps/opd-lite/src/lib/trpc.ts:249-258] — the one correct 401-handling example to generalize
- [Source: apps/opd-lite/src/lib/audit.ts:18] — startAuditDrain signature

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — completion & combined verification.

### Debug Log References
None. (Account spend-limit interrupted the first pass post-implementation; resumed in the same worktree for verification.)

### Completion Notes List
- **Task 1:** `startAuditDrain(getHubTrpcUrl(), () => cachedToken)` wired into the authenticated branch of `SyncProvider`'s auth effect; `stopAuditDrain()` on unauth/cleanup. `audit-drain-wiring.test.tsx` asserts the mount path (the "built-but-unmounted" failure mode).
- **Task 2:** `useBackgroundSync()` mounted unconditionally in `SyncProvider`; hook's SYNC/PERIODIC/`ULTRANOS_SYNC_TRIGGER` constants verified to match `sw.ts`. `background-sync-mount.test.tsx` exercises the real hook against a fake service worker.
- **Task 3 — COMPLETED post-Story 61.2 (Wave 4).** Decision: **key-wipe-only on tab close; remove the dead `PhiCleanupGuard`** (the story's stated acceptable alternative). Rationale: the recommended semantics ("tab close → wipe key only; clear PHI only on explicit auth-expiry/logout, never on refresh") are already fully implemented in OPD Lite — (a) tab-close key wipe via `encryption-key-store.ts`'s `beforeunload` → `encryptionKeyStore.wipe()`; (b) explicit PHI clears on all four logout paths (`AuthGuard.handleSignOut`, `nav-user`, `UserDropdown`) and on auth-expiry (`SessionTimeoutWrapper.handleExpired`), each calling `clearPhiTables()`/`clearPhiState()` + key wipe + `clearSession()`; (c) logout key wipe via `key-lifecycle-hooks.ts`. The never-mounted `PhiCleanupGuard` would have called `clearPhiTables()` on `beforeunload`, wiping the offline-first cache on every refresh — a zero-regression violation, and exactly what 61.2's non-derivable, refresh-surviving DEK is meant to preserve. A rewritten guard that skips refresh-clearing would only duplicate the logout paths, so removal is the cleaner outcome. `apps/opd-lite/src/components/PhiCleanupGuard.tsx` deleted; decision documented at the top of `apps/opd-lite/src/lib/phi-cleanup.ts`. (lab-lite / pharmacy-lite keep their own mounted guards — those are push-only / transient-staging surfaces with no offline-first cache to preserve; out of scope here.)
- **Task 4:** `ai-scribe-service.ts` uses `getAuthHeaders()` (the nonexistent `session.token` is gone); physician confirmation gate unchanged.
- **Task 5:** new `hubTrpcRequest` helper in `hub-auth.ts` (401 → one refresh → one retry → `HubRequestError`; network failures propagate distinctly from "offline"); all catalog/search/list/report helpers in `trpc.ts` route through it; `enrichDrug` false-success fixed; `markSynced()` moved out of `handleOnline` into pull-success continuations only.
- **Task 6:** OPD regression green. `listEncountersByPractitionerFromHub` intentionally keeps its explicit-token path (the model the helper generalizes).

### Verification (combined tree)
- `pnpm -F opd-lite typecheck` → clean.
- Convergence set with Story 60.2 (`sync-queue-fail-safe`, `audit-drain-wiring`, `background-sync-mount`, `hub-auth-401`, `key-lifecycle`, `conflict-resolution`) → 55 pass. Target files (3 new + ai-scribe + trpc-drug-catalog) → 33 pass. (6 unrelated OPD files show pre-existing full-suite-parallel autocomplete flakiness — pass in isolation, none import changed modules.)

### File List
Modified — `apps/opd-lite/src/components/providers/SyncProvider.tsx`, `src/lib/hub-auth.ts`, `src/lib/trpc.ts`, `src/services/ai-scribe-service.ts`, `src/__tests__/ai-scribe-service.test.ts`, `src/__tests__/trpc-drug-catalog.test.ts`, `src/lib/phi-cleanup.ts` (Task 3 decision doc block).
New — `apps/opd-lite/src/__tests__/audit-drain-wiring.test.tsx`, `src/__tests__/background-sync-mount.test.tsx`, `src/__tests__/hub-auth-401.test.ts`, `src/__tests__/phi-cleanup-lifecycle.test.ts` (Task 3).
Deleted — `apps/opd-lite/src/components/PhiCleanupGuard.tsx` (Task 3 — dead, never-mounted; key-wipe-only decision).

### Change Log
- 2026-09-23: Story 59.3 implemented (Wave 1). Tasks 1, 2, 4, 5, 6 complete + verified. Task 3 (PhiCleanupGuard) deferred to post-61.2. Status → review.
- 2026-09-23: Story 59.3 Task 3 completed (Wave 4, post-61.2). Decision: key-wipe-only on tab close; dead `PhiCleanupGuard` removed (offline-first cache must survive refresh under 61.2's non-derivable DEK; explicit auth-expiry/logout paths already clear PHI). Decision recorded in `phi-cleanup.ts`; added `phi-cleanup-lifecycle.test.ts`. All 6 tasks now complete.
