# Story 60.2: Sync-Engine Fail-Safe Hardening (Close Every Fail-Open Fallback)

Status: ready-for-dev

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

- [ ] **Task 1: Plaintext fallback removal** (AC: 1) — `apps/opd-lite/src/lib/sync-queue.ts:105-120`: catch → `awaiting-key` status (state exists in the engine); startup migration still encrypts any legacy plaintext rows; test: key-revoked-mid-call enqueue never stores plaintext.
- [ ] **Task 2: Enqueue failure surfacing + quota** (AC: 2) — `packages/sync-engine/src/enqueue.ts:49-51`; opd-lite quota handling (pattern exists in lab-lite/patient-lite-mobile); audit event on drop (opaque IDs).
- [ ] **Task 3: Conflict-drop default** (AC: 3) — `packages/sync-engine/src/drain-worker.ts:235-237`.
- [ ] **Task 4: Unknown-type tier default** (AC: 4) — `packages/sync-engine/src/conflict-tiers.ts:41-43`.
- [ ] **Task 5: Tier-1 window fix (hub)** (AC: 5) — `apps/hub-api/src/trpc/routers/sync.ts:286-291`: Tier-1 conflict on `differentNode` regardless of window; keep the 60s window as the Tier-4/flagging heuristic it was meant for; update `sync-pull-scoping`/conflict tests.
- [ ] **Task 6: Dedup + retention** (AC: 6, 7) — `packages/sync-engine/src/queue.ts:70-83` (preserve create), retention job (config: default 30 days), keep newest-synced for `lastSyncedAt`; fix mojibake comments while in file (`queue.ts:193`, `enqueue.ts:31/50`).
- [ ] **Task 7: Tests + regression verification** (AC: 8) — package suite (15 files) + hub sync tests + opd sync integration; drain end-to-end with conflicts; `pnpm typecheck`.

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

### Debug Log References

### Completion Notes List

### File List

### Change Log
