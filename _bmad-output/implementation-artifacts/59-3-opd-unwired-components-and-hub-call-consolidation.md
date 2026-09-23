# Story 59.3: OPD Unwired Components & Hub-Call Consolidation

Status: ready-for-dev

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

- [ ] **Task 1: Audit drain wiring** (AC: 1) — `SyncProvider.tsx` auth effect: `startAuditDrain(HUB_BASE_URL, () => cachedToken)` next to `startSyncWorker`; `stopAuditDrain()` on cleanup; integration test asserting drain fires (the "built-but-unmounted" failure mode needs a mount-path test, not more unit tests).
- [ ] **Task 2: Background sync mount** (AC: 2) — mount `useBackgroundSync()` in `SyncProvider`; verify SW tags (`sw.ts:67,93-106` expectations) register; test the SW→client trigger message path.
- [ ] **Task 3: PhiCleanupGuard decision + fix** (AC: 3) — settle semantics (recommend: clear PHI on auth-expiry/logout paths; on tab close wipe key only [existing `encryption-key-store.ts:132-134`] — becomes fully safe once Story 61.2 makes the key non-derivable); implement, mount, or remove with recorded decision. Present as decision point if ambiguous.
- [ ] **Task 4: AI Scribe auth fix** (AC: 4) — `services/ai-scribe-service.ts:14-22` → `getAuthHeaders()`; e2e: consent check → AI Assist enabled → parse → physician confirm → commit (hub re-checks consent; both versions stored — verify unchanged).
- [ ] **Task 5: Hub-call consolidation + 401 handling** (AC: 5, 6) — refactor the 14 listed helpers in `lib/trpc.ts` through `hub-auth`; add refresh-retry-surface logic; fix `SyncProvider.tsx:207-211` + `:168-170` markSynced ordering. (If Story 59.2's shared client lands first, fold this into that client instead of duplicating.)
- [ ] **Task 6: Regression verification** (AC: 7) — full OPD suite; manual: offline→online drain, encounter + prescription flow, AI SOAP gate; `pnpm typecheck`.

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

### Debug Log References

### Completion Notes List

### File List

### Change Log
