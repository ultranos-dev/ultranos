# Story 9.1: Tiered Conflict Resolution (HLC Integration)

Status: done

## Story

As a system architect,
I want conflict resolution to be aware of clinical safety tiers,
so that important updates are never lost during synchronization and safety-critical data uses append-only merge.

## Context

The sync engine (`packages/sync-engine/`) has working HLC primitives (`HybridLogicalClock`, `serializeHlc`, `compareHlc`) and sync priority configuration (`SYNC_PRIORITY`), but **zero conflict resolution logic**. The architecture and CLAUDE.md define a tiered system:

| Tier | Fields | Strategy |
|------|--------|----------|
| Tier 1 — Safety-Critical | Allergies, active meds, critical diagnoses | Append-only. Both versions kept. Conflict flag for physician review. |
| Tier 2 — Clinical | Notes, lab results, vitals | Timestamp-based. Newer wins. Both versions kept as addenda. |
| Tier 3 — Operational | Demographics, preferences | Last-Write-Wins. |
| Consent | Consent grants/withdrawals | Append-only ledger. Priority 1. |
| Tier 4 — Queue Events | Multi-device offline events | Chronological replay by HLC. 60s conflict window → flagged. |

None of this merge logic exists. This story implements the conflict resolution engine.

**PRD Requirements:** FR14 (HLC Sync), FR15 (Append-only Sync Ledger)

## Acceptance Criteria

1. [ ] `packages/sync-engine/src/conflict-resolver.ts` exports a `resolveConflict(local, remote, resourceType)` function.
2. [ ] Tier 1 resources (AllergyIntolerance, active MedicationRequest, critical Condition) use append-only merge — both versions are preserved and a `conflictFlag` is set for physician review.
3. [ ] Tier 1 conflicts block prescription generation until the conflict is resolved.
4. [ ] Tier 2 resources (ClinicalImpression, DiagnosticReport, Observation) use timestamp-based merge — newer HLC wins, both versions kept as addenda.
5. [ ] Tier 3 resources (Patient demographics) use Last-Write-Wins based on HLC comparison.
6. [ ] Consent resources use append-only ledger merge (same as Tier 1).
7. [ ] Events within a 60-second HLC conflict window are flagged regardless of tier.
8. [ ] The conflict resolver returns a `ConflictResolution` object: `{ strategy, winner?, kept: [], conflictFlag, blocksPrescription }`.
9. [ ] Comprehensive tests cover each tier with simulated offline edit conflicts.
10. [ ] The conflict resolver is a pure function — no side effects, no database access. It takes two versions and returns a resolution.

## Tasks / Subtasks

- [x] **Task 1: Tier Configuration** (AC: 1)
  - [x] Create `packages/sync-engine/src/conflict-tiers.ts`.
  - [x] Define `CONFLICT_TIER` mapping: FHIR resource type → tier (1, 2, 3, consent, queue).
  - [x] Export `getConflictTier(resourceType: string): ConflictTier`.

- [x] **Task 2: Conflict Resolver Core** (AC: 1, 8, 10)
  - [x] Create `packages/sync-engine/src/conflict-resolver.ts`.
  - [x] `resolveConflict(local: SyncRecord, remote: SyncRecord, resourceType: string): ConflictResolution`.
  - [x] `SyncRecord` type: `{ id, data, hlcTimestamp: HlcTimestamp, version: string }`.
  - [x] `ConflictResolution` type: `{ strategy: 'APPEND_ONLY' | 'TIMESTAMP_WINS' | 'LWW', winner?: 'local' | 'remote', kept: SyncRecord[], conflictFlag: boolean, blocksPrescription: boolean }`.
  - [x] The function is pure — deterministic, no I/O.

- [x] **Task 3: Tier 1 — Append-Only Merge** (AC: 2, 3)
  - [x] When `getConflictTier(resourceType) === TIER_1`:
    - Keep both local and remote versions.
    - Set `conflictFlag: true`.
    - Set `blocksPrescription: true`.
    - Strategy: `APPEND_ONLY`.
  - [x] Tier 1 resource types: `AllergyIntolerance`, `MedicationRequest` (status === 'active'), `Condition` (clinicalStatus === 'active').

- [x] **Task 4: Tier 2 — Timestamp-Based Merge** (AC: 4)
  - [x] When `getConflictTier(resourceType) === TIER_2`:
    - Compare HLC timestamps using `compareHlc()`.
    - Winner is the newer timestamp.
    - Keep both versions (loser stored as addendum).
    - Set `conflictFlag: false`.
    - Strategy: `TIMESTAMP_WINS`.
  - [x] Tier 2 resource types: `ClinicalImpression`, `DiagnosticReport`, `Observation`.

- [x] **Task 5: Tier 3 — Last-Write-Wins** (AC: 5)
  - [x] When `getConflictTier(resourceType) === TIER_3`:
    - Compare HLC timestamps.
    - Winner replaces loser entirely.
    - `kept` contains only the winner.
    - `conflictFlag: false`.
    - Strategy: `LWW`.
  - [x] Tier 3 resource types: `Patient`.

- [x] **Task 6: Consent & Queue Tier** (AC: 6, 7)
  - [x] Consent uses `APPEND_ONLY` (same as Tier 1, but `blocksPrescription: false`).
  - [x] Queue events within 60-second HLC window: flag regardless of tier.
  - [x] 60-second window check: `abs(local.hlcTimestamp.wallMs - remote.hlcTimestamp.wallMs) <= 60000`.

- [x] **Task 7: Tests** (AC: 9)
  - [x] Test: Tier 1 conflict → both kept, flag set, prescription blocked.
  - [x] Test: Tier 2 conflict → newer wins, both kept as addenda, no flag.
  - [x] Test: Tier 3 conflict → newer wins, loser discarded, no flag.
  - [x] Test: Consent conflict → both kept, flag set, prescription NOT blocked.
  - [x] Test: 60-second window → flagged regardless of tier.
  - [x] Test: identical HLC timestamps → deterministic tie-breaking by nodeId.
  - [x] Test: no conflict (only one version) → pass-through, no flag.

## Dev Notes

### Pure Function Design

The conflict resolver is intentionally a pure function. It does NOT:
- Read from or write to any database
- Manage sync queues
- Handle network communication
- Modify state

Story 9.2 (Background Sync Worker) is the integration layer that calls `resolveConflict()` when it detects divergent versions during sync.

### Active vs. Historical Resources

Tier 1 only applies to **active** resources. A historical `MedicationRequest` (status: `completed`) or a resolved `Condition` (clinicalStatus: `resolved`) falls to Tier 2. The conflict resolver should check the resource's status field to determine the effective tier.

### Prescription Blocking

When `blocksPrescription: true`, the UI must prevent new prescription creation until the conflict is resolved. This is enforced in the prescription store, not in the sync engine. The sync engine only returns the flag — the UI consumes it.

### References

- CLAUDE.md: Sync Engine Conflict Resolution Tiers table
- Architecture: Tiered conflict resolution (Tier 1 append-only, Tier 2 timestamp, Tier 3 LWW)
- Existing primitives: `compareHlc()`, `SYNC_PRIORITY`, `HlcTimestamp` (all in `packages/sync-engine/`)
- Story 9.2: Background Sync Worker (integration consumer of this resolver)

## Dev Agent Record

### Implementation Plan

Implemented the tiered conflict resolution engine as a pure function in `packages/sync-engine/`. The design uses two modules:

1. **conflict-tiers.ts** — Maps FHIR resource types to conflict tiers (TIER_1, TIER_2, TIER_3, CONSENT, QUEUE). Unknown types default to TIER_3 (LWW).

2. **conflict-resolver.ts** — The `resolveConflict()` pure function that:
   - Determines effective tier by checking resource status (active MedicationRequest/Condition → Tier 1, historical → Tier 2)
   - When local and remote disagree on tier (e.g., one is active, one is completed), uses the higher-safety tier
   - Applies tier-specific merge strategy
   - Checks 60-second conflict window (inclusive boundary at exactly 60s)
   - Returns deterministic `ConflictResolution` with all required fields

Key design decisions:
- Used `higherSafetyTier()` to handle mixed active/historical statuses safely (always errs on the side of caution)
- Handles FHIR CodeableConcept structure for Condition.clinicalStatus (both flat string and nested coding array)
- AllergyIntolerance is always Tier 1 regardless of status (no "inactive allergy" concept for safety)
- Tie-breaking uses `compareHlc()` which falls through to nodeId comparison

### Completion Notes

All 7 tasks completed. 23 new tests added covering:
- Tier 1: AllergyIntolerance, active/completed MedicationRequest, active/resolved Condition, FHIR CodeableConcept handling, mixed active/inactive safety escalation
- Tier 2: ClinicalImpression, Observation, DiagnosticReport with timestamp winners
- Tier 3: Patient LWW with single-kept record
- Consent: append-only without prescription blocking
- 60-second window: boundary tests (60s inclusive, 61s exclusive), cross-tier flagging
- Deterministic tie-breaking: nodeId and counter comparisons
- Pass-through: identical records

73 total tests pass (23 new + 50 existing). Zero regressions.

## File List

- `packages/sync-engine/src/conflict-tiers.ts` (new) — Tier configuration and getConflictTier()
- `packages/sync-engine/src/conflict-resolver.ts` (new) — resolveConflict() pure function with all tier strategies
- `packages/sync-engine/src/index.ts` (modified) — Added exports for conflict-tiers and conflict-resolver
- `packages/sync-engine/src/__tests__/conflict-tiers.test.ts` (new) — 9 tests for tier mapping
- `packages/sync-engine/src/__tests__/conflict-resolver.test.ts` (new) — 23 tests covering all tiers, window, tie-breaking

### Review Findings

- [x] [Review][Decision] **QUEUE tier unreachable — dead code or deferred to 9.2?** — Resolved: deferred to 9.2, comment added. — `ConflictTier` includes `QUEUE` and `resolveQueue()` is implemented, but no resource type in `CONFLICT_TIER_MAP` maps to `QUEUE`. The `getConflictTier` default is `TIER_3`, so the QUEUE branch in the switch is unreachable. No test exercises it. Decide: (a) map specific resource types to QUEUE now, (b) explicitly defer to Story 9.2 and document, or (c) remove QUEUE tier entirely.
- [x] [Review][Decision] **Missing safety-critical resource types in tier map** — `MedicationDispense` (pharmacy-lite core resource), `Encounter` (used in queue tests), and `KeyRevocationList` (sync priority 1 in `sync-priority.ts`) are absent from `CONFLICT_TIER_MAP` and silently default to `TIER_3` (LWW). LWW on `MedicationDispense` could silently drop dispensing records. `KeyRevocationList` at priority 1 but LWW could drop key revocations. Decide which tier each should be assigned.
- [x] [Review][Patch] **CodeableConcept text-only structure mishandled** — `getEffectiveTier` in `conflict-resolver.ts` handles FHIR `Condition.clinicalStatus` as either a flat string or an object with `coding` array. However, a valid FHIR CodeableConcept with only `{ text: "active" }` (no `coding` array) would have `.coding` resolve to `undefined`, which is not an Array and not `=== 'active'`, incorrectly demoting an active Condition to Tier 2. [conflict-resolver.ts:62-75]
- [x] [Review][Defer] **NaN wallMs causes silent nondeterministic behavior** — If `HlcTimestamp.wallMs` is `NaN` (corrupted deserialization), `compareHlc` returns `NaN`, `isWithinConflictWindow` returns `false`, and `determineWinner` always picks `remote`. HLC generates valid timestamps by construction; NaN only via corrupted JSON. Input validation belongs at sync worker boundary (Story 9.2). — deferred, defensive edge case
- [x] [Review][Defer] **drain-worker.ts marks conflicts as synced without onConflict handler** — When 409 conflict response received and `onConflict` is undefined, code falls through to `markSynced` without resolution. Conflicting entries silently swallowed. Pre-existing in drain-worker.ts, not introduced by this change. — deferred, pre-existing
- [x] [Review][Defer] **drain-worker.ts SyncRecord version field inconsistency** — `version: entry.hlcTimestamp` sets version to serialized HLC string rather than semantic version. Not consumed by `resolveConflict` but inconsistent contract. Pre-existing. — deferred, pre-existing

## Change Log

- 2026-05-01: Implemented tiered conflict resolution engine (Tasks 1-7). Created conflict-tiers.ts and conflict-resolver.ts as pure functions. 23 new tests, 73 total passing.
