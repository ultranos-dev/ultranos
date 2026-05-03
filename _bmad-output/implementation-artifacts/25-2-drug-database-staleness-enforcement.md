# Story 25.2: Drug Database Staleness Enforcement

Status: done

## Story

As a Clinical Safety Officer,
I want the system to refuse drug interaction checks if the database is stale,
so that outdated data cannot produce false negatives that could harm patients.

## Acceptance Criteria

1. `checkInteractions()` in `@ultranos/drug-db` checks database staleness BEFORE performing any interaction lookup
2. If the database is >45 days old (based on `lastUpdatedAt` from `adapter.getMetadata()`), the check returns `{ result: 'UNAVAILABLE', interactions: [] }` with a `reason: 'DATABASE_STALE'` field
3. If `adapter.getMetadata()` is not implemented (returns undefined/null), staleness is NOT enforced (backward-compatible — adapter opt-in)
4. The staleness threshold (45 days) is a configurable constant exported from `@ultranos/drug-db`, not hardcoded inline
5. The Dexie adapter in OPD Lite implements `getMetadata()` returning `{ lastUpdatedAt, version }` from vocabulary sync tracking
6. When staleness is detected, a background vocabulary sync is triggered (non-blocking) via an optional `onStale` callback
7. The UI in OPD Lite shows "Interaction check unavailable — drug database outdated" when result is UNAVAILABLE with reason DATABASE_STALE (never "no interactions found")
8. All existing drug-db and OPD Lite interaction tests continue to pass
9. New tests cover: stale database returns UNAVAILABLE, fresh database proceeds normally, missing metadata skips staleness check, exact 45-day boundary behavior

## Tasks / Subtasks

- [x] Task 1: Extend InteractionCheckSummary type (AC: #2)
  - [x] Add optional `reason?: 'DATABASE_STALE' | 'EMPTY_DATABASE' | 'ADAPTER_ERROR'` to `InteractionCheckSummary` in `packages/drug-db/src/types.ts`
  - [x] Ensure existing code that checks `result === 'UNAVAILABLE'` is unaffected (reason is additive)
- [x] Task 2: Add staleness configuration (AC: #4)
  - [x] Add `STALENESS_THRESHOLD_MS` constant to `packages/drug-db/src/checker.ts` (45 days = 45 * 24 * 60 * 60 * 1000)
  - [x] Export it from `packages/drug-db/src/index.ts` for app-level reference
- [x] Task 3: Implement staleness check in checker.ts (AC: #1, #2, #3, #6)
  - [x] In `checkInteractions()`, before `ensureMap()`, call `adapter?.getMetadata?.()` if adapter is provided
  - [x] If metadata exists and `lastUpdatedAt` is parseable as a Date:
    - Compare `Date.now() - new Date(lastUpdatedAt).getTime()` against `STALENESS_THRESHOLD_MS`
    - If stale: return `{ result: 'UNAVAILABLE', interactions: allergyResults, reason: 'DATABASE_STALE' }`
    - If stale and `options.onStale` callback exists: call it (fire-and-forget, non-blocking)
  - [x] If `getMetadata` is undefined or returns null: skip staleness check entirely (backward-compatible)
  - [x] Preserve existing allergy results even on staleness (allergy check doesn't depend on interaction DB)
- [x] Task 4: Add onStale callback to options (AC: #6)
  - [x] Add `onStale?: () => void` to `InteractionCheckOptions` in types.ts
  - [x] Document: callback is invoked when database is stale, intended to trigger background sync
- [x] Task 5: Implement getMetadata in Dexie adapter (AC: #5)
  - [x] In `apps/opd-lite/src/lib/dexie-drug-adapter.ts`, implement `getMetadata()`:
    - Read `localStorage.getItem('ultranos:vocab-version:interactions')` for version
    - Read `localStorage.getItem('ultranos:vocab-last-synced:interactions')` for lastUpdatedAt
    - Return `{ lastUpdatedAt, version }` or `null` if keys are missing
  - [x] In `apps/opd-lite/src/lib/vocabulary-sync.ts`, persist `lastUpdatedAt` timestamp:
    - After successful sync, set `localStorage.setItem('ultranos:vocab-last-synced:interactions', new Date().toISOString())`
    - After initial seeding, set the same key with the current timestamp
- [x] Task 6: Wire onStale callback in OPD Lite (AC: #6, #7)
  - [x] In `apps/opd-lite/src/services/interactionService.ts`, pass `onStale` callback to `checkInteractions()` that triggers `syncAllVocabulary()` in the background
  - [x] In `apps/opd-lite/src/components/encounter-dashboard.tsx`, handle `reason: 'DATABASE_STALE'` in the UNAVAILABLE case to show specific message: "Interaction check unavailable — drug database outdated"
- [x] Task 7: Write tests (AC: #8, #9)
  - [x] In `packages/drug-db/src/__tests__/checker.test.ts`, add staleness tests:
    - Test: metadata with lastUpdatedAt 50 days ago → returns UNAVAILABLE with reason DATABASE_STALE
    - Test: metadata with lastUpdatedAt 30 days ago → proceeds normally (CLEAR/WARNING/BLOCKED)
    - Test: metadata with lastUpdatedAt exactly 45 days ago → proceeds normally (boundary: not stale yet)
    - Test: metadata with lastUpdatedAt 45 days + 1ms ago → returns UNAVAILABLE (boundary: just stale)
    - Test: adapter without getMetadata → staleness check skipped, interaction check proceeds
    - Test: getMetadata returns null → staleness check skipped
    - Test: onStale callback is called when database is stale
    - Test: allergy results preserved even when database is stale
  - [x] Verify all existing drug-db tests pass
  - [x] Verify all existing OPD Lite interaction tests pass

## Dev Notes

### Previous Story Intelligence (Story 25.1)

**Key learnings from 25.1:**
- Adapter pattern established: `DrugDatabaseAdapter` interface with optional `getMetadata()` already defined
- `checkInteractions()` already handles UNAVAILABLE when adapter returns empty data — extend this pattern for staleness
- Cache generation counter prevents stale data from in-flight builds — staleness check must run BEFORE cache lookup
- Allergy results are computed independently of drug-drug interactions — preserve them on staleness
- In-memory test adapter pattern: create fixtures with `getMetadata()` returning controlled dates

**Files created in 25.1 (context for this story):**
- `packages/drug-db/src/types.ts` — DrugDatabaseAdapter already has optional `getMetadata?()`
- `packages/drug-db/src/checker.ts` — `checkInteractions()` is the function to modify
- `apps/opd-lite/src/lib/dexie-drug-adapter.ts` — Needs `getMetadata()` implementation
- `apps/opd-lite/src/services/interactionService.ts` — Thin wrapper, needs `onStale` callback wiring

**Review findings from 25.1 to respect:**
- Global singleton cache not per-adapter (deferred) — staleness check should also be per-call, not cached
- Adapter throws → returns UNAVAILABLE (established pattern) — staleness follows same pattern
- `invalidateCache()` exists — DO NOT call it on staleness; stale data is still better than no cache if sync fails

### Architecture Constraints

**From PRD Section 20.1:**
- "Database updated at minimum monthly. The system must refuse interaction checks if the database version is more than 45 days old."
- "A curated offline subset covering the 500 most-prescribed drugs in the target region is maintained on device"

**From CLAUDE.md Rule #3:**
- "If the drug interaction check fails (network error, DB unavailable, timeout), the UI must show an explicit warning: 'Interaction check unavailable.' Never default to 'no interactions found' — that's a false negative that could kill someone."

**Staleness is a form of "check unavailable"** — same safety rule applies. The DATABASE_STALE reason just provides more specific guidance to the user.

### Exact Code Changes Required

**packages/drug-db/src/types.ts** — ADD to InteractionCheckSummary:
```typescript
export interface InteractionCheckSummary {
  result: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE'
  interactions: InteractionResult[]
  reason?: 'DATABASE_STALE' | 'EMPTY_DATABASE' | 'ADAPTER_ERROR'  // NEW
}
```

**packages/drug-db/src/types.ts** — ADD to InteractionCheckOptions:
```typescript
export interface InteractionCheckOptions {
  activeMedications?: FhirMedicationStatementZod[]
  activeAllergies?: FhirAllergyIntolerance[]
  onStale?: () => void  // NEW: callback when database is stale
}
```

**packages/drug-db/src/checker.ts** — ADD staleness check at top of `checkInteractions()`:
```typescript
export const STALENESS_THRESHOLD_MS = 45 * 24 * 60 * 60 * 1000 // 45 days

export async function checkInteractions(
  newDrugDisplay: string,
  activeMedDisplayNames: string[],
  allergiesOrOptions?: ... ,
  adapter?: DrugDatabaseAdapter,
): Promise<InteractionCheckSummary> {
  // ... existing allergy check code runs first ...
  
  // NEW: Staleness check before interaction lookup
  if (adapter?.getMetadata) {
    try {
      const metadata = await adapter.getMetadata()
      if (metadata?.lastUpdatedAt) {
        const age = Date.now() - new Date(metadata.lastUpdatedAt).getTime()
        if (age > STALENESS_THRESHOLD_MS) {
          options?.onStale?.()  // fire-and-forget
          return { result: 'UNAVAILABLE', interactions: allergyResults, reason: 'DATABASE_STALE' }
        }
      }
    } catch {
      // getMetadata failure is non-fatal — proceed with interaction check
    }
  }
  
  // ... existing ensureMap + interaction logic continues ...
}
```

**apps/opd-lite/src/lib/dexie-drug-adapter.ts** — ADD getMetadata:
```typescript
export function createDexieDrugAdapter(): DrugDatabaseAdapter {
  return {
    async getInteractions() { /* existing */ },
    async getMetadata() {
      const version = localStorage.getItem('ultranos:vocab-version:interactions')
      const lastSynced = localStorage.getItem('ultranos:vocab-last-synced:interactions')
      if (!version && !lastSynced) return null
      return {
        lastUpdatedAt: lastSynced || new Date().toISOString(),
        version: version ? parseInt(version, 10) : 0,
      }
    },
  }
}
```

**apps/opd-lite/src/lib/vocabulary-sync.ts** — ADD timestamp persistence:
```typescript
// In applyInteractionUpdates() or after setLocalVersion():
localStorage.setItem('ultranos:vocab-last-synced:interactions', new Date().toISOString())
```

**apps/opd-lite/src/lib/vocabulary-seeder.ts** — ADD initial timestamp:
```typescript
// After bulkAdd in seedInteractions():
localStorage.setItem('ultranos:vocab-last-synced:interactions', new Date().toISOString())
```

### What NOT to Change

- DO NOT modify `invalidateCache()` — staleness is orthogonal to cache validity
- DO NOT add staleness to `checkAllergyMatch()` — allergy matching doesn't use the interaction database
- DO NOT make `getMetadata()` required on the interface — keep it optional for backward compatibility
- DO NOT block the interaction check while sync runs — `onStale` is fire-and-forget

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `packages/drug-db/src/types.ts` | UPDATE | Add `reason` to InteractionCheckSummary, `onStale` to InteractionCheckOptions |
| `packages/drug-db/src/checker.ts` | UPDATE | Add staleness check before ensureMap, export STALENESS_THRESHOLD_MS |
| `packages/drug-db/src/index.ts` | UPDATE | Export STALENESS_THRESHOLD_MS |
| `packages/drug-db/src/__tests__/checker.test.ts` | UPDATE | Add 8 staleness tests |
| `apps/opd-lite/src/lib/dexie-drug-adapter.ts` | UPDATE | Add getMetadata() implementation |
| `apps/opd-lite/src/lib/vocabulary-sync.ts` | UPDATE | Persist lastSynced timestamp on sync |
| `apps/opd-lite/src/lib/vocabulary-seeder.ts` | UPDATE | Set initial lastSynced on seed |
| `apps/opd-lite/src/services/interactionService.ts` | UPDATE | Wire onStale callback |
| `apps/opd-lite/src/components/encounter-dashboard.tsx` | UPDATE | Handle DATABASE_STALE reason in UNAVAILABLE UI |

### Testing Standards

- **Framework:** Vitest for drug-db package tests
- **Boundary testing:** Exact 45-day boundary (44d23h59m59s = OK, 45d0h0m1ms = STALE)
- **In-memory test adapter:** Mock `getMetadata()` returning controlled dates
- **Regression:** All 31 existing drug-db tests must pass, all 532 OPD Lite tests must pass

### Project Structure Notes

- No new files created — only modifications to existing files from Story 25.1
- localStorage keys follow existing pattern: `ultranos:vocab-{purpose}:{type}`
- New localStorage key: `ultranos:vocab-last-synced:interactions`

### References

- [Source: packages/drug-db/src/types.ts] — DrugDatabaseAdapter.getMetadata() already defined as optional
- [Source: packages/drug-db/src/checker.ts] — checkInteractions() to modify
- [Source: apps/opd-lite/src/lib/dexie-drug-adapter.ts] — Adapter to extend
- [Source: apps/opd-lite/src/lib/vocabulary-sync.ts] — Version tracking via localStorage
- [Source: docs/ultranos_master_prd_v3.md#Section20.1] — 45-day staleness requirement
- [Source: CLAUDE.md#Rule3] — "Interaction check unavailable" safety rule
- [Source: _bmad-output/implementation-artifacts/25-1-create-packages-drug-db-package.md] — Previous story learnings
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#DB-G03] — Staleness enforcement gap

### Review Findings

- [x] [Review][Decision] **D1: Prescription proceeds on UNAVAILABLE result (ACCEPTED — current behavior kept)** — The new UNAVAILABLE handler in encounter-dashboard.tsx (line 278+) saves the prescription with a warning when the interaction check is unavailable (stale DB, empty DB, adapter error). The OLD behavior (pre-25.1/25.2) threw on empty DB, which was caught and returned WITHOUT prescribing. This is a safety vs. availability trade-off: blocking prescriptions when DB is stale harms offline-first clinical workflows, but allowing them risks missing dangerous interactions. The spec says "show warning" but doesn't explicitly address whether the prescription should be saved. [encounter-dashboard.tsx:278-307]
- [x] [Review][Patch] **P1: Dead `onStale` callback in encounter-dashboard** — `encounter-dashboard.tsx` line 246 passes `onStale` in the options, but `interactionService.ts` always overwrites it with its own `onStale`. The dashboard's callback is dead code. Remove it. [encounter-dashboard.tsx:246]
- [x] [Review][Patch] **P2: `getMetadata` fabricates fresh timestamp when `lastSynced` missing** — `dexie-drug-adapter.ts` line 25: `lastUpdatedAt: lastSynced || new Date().toISOString()` returns "right now" when `lastSynced` is null but `version` exists, making a stale DB appear fresh. Should return `null` when `lastSynced` is absent. [dexie-drug-adapter.ts:25]
- [x] [Review][Patch] **P3: Invalid date string silently bypasses staleness check** — `checker.ts` line 225: `new Date(corrupt).getTime()` returns NaN, and `NaN > threshold` is false, so staleness is silently bypassed on corrupt localStorage data. Add a NaN guard after Date parsing. [checker.ts:225]
- [x] [Review][Patch] **P4: Boundary test at exactly 45 days may be flaky** — `checker.test.ts` line 542: `daysAgo(45)` uses `Date.now()` at test setup, then `checker.ts` calls `Date.now()` again during execution. Elapsed ms between the two calls could push age past the threshold, causing intermittent CI failures. Use `vi.useFakeTimers()` for boundary tests. [checker.test.ts:542-548]
- [x] [Review][Patch] **P5: UNAVAILABLE returns missing `reason` for non-stale cases** — `checker.ts` defines `reason?: 'DATABASE_STALE' | 'EMPTY_DATABASE' | 'ADAPTER_ERROR'` in the type but only sets `'DATABASE_STALE'`. The empty-database (line 253) and adapter-error (line 248) UNAVAILABLE returns omit `reason`. Set `reason` on all UNAVAILABLE returns. [checker.ts:248,253]
- [x] [Review][Defer] **W1: Module-level cache not per-adapter** — `checker.ts` uses module-level `cachedMap` shared across all callers regardless of adapter identity. If two different adapters are used, the first adapter's cache is returned for the second. Pre-existing from Story 25.1. [checker.ts:62-63]
- [x] [Review][Defer] **W2: Allergy substring matching produces false positives** — `checkAllergyMatch` uses bidirectional substring matching (e.g., "ASA" allergy matches "Dapagliflozin"). Pre-existing from Story 10.2. [checker.ts:156-167]
- [x] [Review][Defer] **W3: ensureMap returns stale data on cache generation mismatch** — When `gen !== cacheGeneration`, the stale build result is returned to the current caller (but not cached). Pre-existing from Story 25.1. [checker.ts:96]
- [x] [Review][Defer] **W4: Unsafe `null as unknown as LookupMap` cast** — When entries are empty, null is cast to LookupMap type. Caller checks `if (!map)` but the type system is lying. Pre-existing from Story 25.1. [checker.ts:99]
- [x] [Review][Defer] **W5: NONE severity returns CLEAR with non-empty interactions array** — Drug entries with severity NONE produce interactions that don't trigger BLOCKED or WARNING, resulting in `{ result: 'CLEAR', interactions: [...] }`. Pre-existing from Story 25.1. [checker.ts:279-285]
- [x] [Review][Defer] **W6: System clock drift in field deployments** — Timestamps use `Date.now()` / `new Date().toISOString()`. If the system clock is set far forward during sync then corrected, the database appears permanently stale until 45 days pass. Inherent to timestamp-based design; needs server-time anchor to fix. [checker.ts:225]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- No debug issues encountered

### Completion Notes List
- Added `reason` field to `InteractionCheckSummary` type (DATABASE_STALE | EMPTY_DATABASE | ADAPTER_ERROR)
- Added `onStale` callback to `InteractionCheckOptions`
- Exported `STALENESS_THRESHOLD_MS` constant (45 days in ms) from `@ultranos/drug-db`
- Implemented staleness check in `checkInteractions()` — runs before `ensureMap()`, preserves allergy results
- Dexie adapter `getMetadata()` reads from `localStorage` keys `ultranos:vocab-last-synced:interactions` and `ultranos:vocab-version:interactions`
- `vocabulary-sync.ts` persists `lastSynced` timestamp after successful interaction sync
- `vocabulary-seeder.ts` sets initial `lastSynced` on first seed
- `encounter-dashboard.tsx` now handles UNAVAILABLE result explicitly with DATABASE_STALE-specific message
- `encounter-dashboard.tsx` wires `onStale` callback to trigger `syncAllVocabulary()` in background
- 8 new staleness tests added (50-day stale, 30-day fresh, exact 45-day boundary, 45d+1ms boundary, no getMetadata, null metadata, onStale callback, allergy preservation)
- All 43 drug-db tests pass, all 532 OPD Lite tests pass — zero regressions

### Change Log
- 2026-05-02: Implemented drug database staleness enforcement (Story 25.2) — all ACs satisfied

### File List
- `packages/drug-db/src/types.ts` — MODIFIED (added `reason` to InteractionCheckSummary, `onStale` to InteractionCheckOptions)
- `packages/drug-db/src/checker.ts` — MODIFIED (added STALENESS_THRESHOLD_MS, staleness check in checkInteractions)
- `packages/drug-db/src/index.ts` — MODIFIED (exported STALENESS_THRESHOLD_MS)
- `packages/drug-db/src/__tests__/checker.test.ts` — MODIFIED (added 8 staleness tests)
- `apps/opd-lite/src/lib/dexie-drug-adapter.ts` — MODIFIED (added getMetadata implementation)
- `apps/opd-lite/src/lib/vocabulary-sync.ts` — MODIFIED (persists lastSynced timestamp on sync)
- `apps/opd-lite/src/lib/vocabulary-seeder.ts` — MODIFIED (sets initial lastSynced on seed)
- `apps/opd-lite/src/services/interactionService.ts` — MODIFIED (injects onStale callback triggering syncAllVocabulary)
- `apps/opd-lite/src/components/encounter-dashboard.tsx` — MODIFIED (handles DATABASE_STALE, wires onStale callback)
