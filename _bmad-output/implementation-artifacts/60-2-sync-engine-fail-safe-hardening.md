# Story 60.2: Sync-Engine Fail-Safe Hardening (Close Every Fail-Open Fallback)

Status: review

## Story

As a sync-engine owner,
I want every audited fail-open fallback in the sync path closed — no plaintext PHI fallback, no swallowed enqueue failures, no silently-dropped conflicts, no LWW-by-default for unknown types, and Tier-1 append-only enforced beyond the 60-second window,
so that the sync layer degrades safely instead of conveniently.

## Acceptance Criteria

1. **Given** encryption fails at enqueue time in OPD's sync queue, **then** the payload is stored in the queue's `awaiting-key` state (or held safely) — NEVER plaintext ("plaintext for migration" fallback removed).
2. **Given** `enqueueSyncAction` fails (quota exceeded, IndexedDB corruption), **then** the failure surfaces to `onStatusUpdate`/UI and emits an audit failure event — never only a `console.warn`; opd-lite gains QuotaExceededError handling (currently absent).
3. **Given** a conflict is detected by the drain worker with no `onConflict` handler configured, **then** the entry is marked `failed`/`conflict` — never `synced` (conflict silently discarded).
4. **Given** a resource type not present in `CONFLICT_TIER_MAP`, **then** it defaults to TIER_2 (not TIER_3 LWW), with a startup warning naming the unmapped type.
5. **Given** a Tier-1 divergent write from a different node arrives at the Hub more than 60s after the stored write, **then** it still triggers append-only both-versions retention + conflict flag (Rule #5 has no time window).
6. **Given** queue dedup merges a pending `create` with a subsequent `update` for the same resource, **then** the resulting entry preserves `create` semantics.
7. **Given** synced queue entries, **then** a retention pass strips payloads / deletes rows older than N days while preserving `getLatestSynced` behavior — no more unbounded PHI-payload accumulation.
8. **Zero regression:** normal sync (encrypt-enqueue-drain-resolve) is byte-identical; opd-lite's wired conflict UI keeps working; the 33-test conflict-resolver suite and all package tests pass (Tier-1 window test updated per AC 5's corrected semantics); `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [x] **Task 1: Plaintext fallback removal** (AC: 1) — `apps/opd-lite/src/lib/sync-queue.ts:105-120`: catch → `awaiting-key` status (state exists in the engine); startup migration still encrypts any legacy plaintext rows; test: key-revoked-mid-call enqueue never stores plaintext.
- [x] **Task 2: Enqueue failure surfacing + quota** (AC: 2) — `packages/sync-engine/src/enqueue.ts:49-51`; opd-lite quota handling (pattern exists in lab-lite/patient-lite-mobile); audit event on drop (opaque IDs).
- [x] **Task 3: Conflict-drop default** (AC: 3) — `packages/sync-engine/src/drain-worker.ts:235-237`.
- [x] **Task 4: Unknown-type tier default** (AC: 4) — `packages/sync-engine/src/conflict-tiers.ts:41-43`.
- [x] **Task 5: Tier-1 window fix (hub)** (AC: 5) — `apps/hub-api/src/trpc/routers/sync.ts:286-291`: Tier-1 conflict on `differentNode` regardless of window; keep the 60s window as the Tier-4/flagging heuristic it was meant for; update `sync-pull-scoping`/conflict tests.
- [x] **Task 6: Dedup + retention** (AC: 6, 7) — `packages/sync-engine/src/queue.ts:70-83` (preserve create), retention job (config: default 30 days), keep newest-synced for `lastSyncedAt`; fix mojibake comments while in file (`queue.ts:193`, `enqueue.ts:31/50`).
- [x] **Task 7: Tests + regression verification** (AC: 8) — package suite (15 files) + hub sync tests + opd sync integration; drain end-to-end with conflicts; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **P-CRYPTO-1 [V]** (plaintext fallback — verified verbatim), **P-SYNC-1/2/3/5/6 [A/V]**, **H-HUB-6 [A]** (Tier-1 60s window), audit §8 + §10 Theme 3. The audit's overall verdict on this layer: "fail-open fallbacks that trade safety for convenience" — this story is the systematic close-out.

### Architecture

- Tier-1 semantics: Rule #5 — allergies/active meds/critical diagnoses are append-only, both versions kept, physician review flag, prescription generation blocked until resolved. The resolver itself (`resolveTier1`, verified correct) is untouched — the fix is the hub's *routing into* it.
- `awaiting-key` entries must drain automatically after key restore (verify existing behavior covers the new path).
- Retention must never delete `awaiting-key`/`failed`/`conflict` entries.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Happy-path sync is unchanged; opd's conflict UI, backoff, crash recovery, and priority ordering all keep working. Behavior changes ONLY on the failure paths being hardened. All package + app sync tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `packages/sync-engine/src/{enqueue,drain-worker,conflict-tiers,queue}.ts`, `apps/opd-lite/src/lib/sync-queue.ts`, `apps/hub-api/src/trpc/routers/sync.ts`.
**New files:** `packages/sync-engine/src/__tests__/fail-safe-hardening.test.ts`, `retention.ts` + test.

### References

- [Source: docs/system-audit-2026-09-23.md#8-shared-packages-packages] — P-CRYPTO-1, P-SYNC-1..7
- [Source: packages/sync-engine/src/conflict-resolver.ts:162-173] — verified-correct Tier-1 resolver (do not modify)
- [Source: CLAUDE.md#sync-engine--conflict-resolution-tiers]

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — completion & combined verification.

### Debug Log References
None. (Account spend-limit interrupted the first pass post-implementation; resumed in the same worktree for verification.)

### Completion Notes List
- **Task 1:** opd `sync-queue.ts` encryption-failure path rewritten to `holdForEncryption('key_unavailable' | 'encrypt_failed')` (memory-only, never persisted) — the "store plaintext for migration" branch is gone. `flushHeldEnqueues()` drains held items on re-auth (wired first in `key-lifecycle-hooks.ts`).
- **Task 2:** sync-engine `enqueueSyncAction` gained an `onEnqueueError` hook (opaque IDs + error NAME only); opd `surfaceEnqueueFailure()` maps to `STORAGE_QUOTA_EXCEEDED` / `SYNC_ENQUEUE_FAILED` via the sync store, emits an audit failure event, then re-throws (preserving the never-throws call-site contract).
- **Task 3:** drain-worker no-`onConflict`-handler branch now `markFailed(id, 'CONFLICT_UNHANDLED', { terminal: true })` + audit — never `markSynced` (was silently dropping conflicts).
- **Task 4:** `getConflictTier` returns TIER_2 (not TIER_3 LWW) for unmapped types, with a once-per-type session warning naming the type only.
- **Task 5:** hub `sync.ts` Tier-1 conflict now fires on `differentNode` divergence regardless of the 60s window (`isTier1Conflict = APPEND_ONLY && differentNode`; new `tier1CrossNodePotential` forces the stored-row fetch/resolve). **`conflict-resolver.ts` `resolveTier1` left untouched** (verified) — only the hub's routing into it changed. The change is confined to `sync.push` lines ~245–298 (Lane A / Story 56.2 next-wave collision zone — documented for the integrator).
- **Task 6:** queue dedup preserves `create` semantics (create+update→create; delete-after-create→delete); new `retention.ts` `runRetentionPass` (default 30 days) strips payloads / deletes only `synced` rows, never awaiting-key/failed/pending/syncing/resolved; mojibake comments fixed in enqueue.ts/queue.ts.
- **Design note:** no new `conflict` status was introduced — the unhandled-conflict path reuses `failed` via `markFailed(..., { terminal: true })`; status/action unions unchanged. New exports: `runRetentionPass`, `DEFAULT_RETENTION_DAYS`, `RetentionOptions`, `RetentionResult`, `EnqueueSyncHooks`, `EnqueueErrorInfo`.

### Verification (combined tree)
- `pnpm -F @ultranos/sync-engine build` → clean; sync-engine / hub-api / opd-lite typecheck → clean.
- `pnpm -F @ultranos/sync-engine test` → 17 files, 188 pass (incl. new fail-safe-hardening + retention tests; conflict-resolver suite green).
- hub `sync-conflict-tier1.test.ts` → 8 pass (AC-5 test inverted: >60s cross-device Tier-1 write now yields `success:false` + persisted UNRESOLVED conflict, zero upsert). opd `sync-queue-fail-safe.test.ts` → 7 pass. hub full suite 1679 pass.

### File List
Modified — `packages/sync-engine/src/{conflict-tiers,drain-worker,enqueue,queue,index}.ts`; `apps/hub-api/src/trpc/routers/sync.ts`, `src/__tests__/sync-conflict-tier1.test.ts`; `apps/opd-lite/src/lib/{sync-queue,sync-worker,key-lifecycle-hooks}.ts`, `src/components/SyncAwareStaleDataBanner.tsx`; plus updated sync-engine conflict-resolver/conflict-tiers/queue tests.
New — `packages/sync-engine/src/retention.ts`, `src/__tests__/fail-safe-hardening.test.ts`, `src/__tests__/retention.test.ts`, `apps/opd-lite/src/__tests__/sync-queue-fail-safe.test.ts`.

### Change Log
- 2026-09-23: Story 60.2 implemented (Wave 1). All 7 tasks complete + combined-tree verified. Plaintext fallback removed; Tier-1 window fix; retention pass added. Status → review.
