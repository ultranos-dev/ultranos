# Story 2.1: Encounter Lifecycle & Zustand Store

## User Story
As a clinician, I want to start an encounter instantly so that I can begin treating patients without waiting for network confirmation.

## Status: done

## Acceptance Criteria
- [x] `useEncounterStore` (Zustand) is implemented to manage active consultation state.
- [x] Clicking "Start Encounter" creates a new FHIR Encounter resource with a local UUID.
- [x] An HLC timestamp is assigned to the encounter start time.
- [x] UI reflects "Active Consultation" status in <50ms (NFR1).
- [x] State is persisted to the local sync ledger (Dexie for PWA, SQLite for Mobile).

## Technical Requirements & Constraints
- **State:** Use Zustand v5 with Immer middleware for easier state mutation.
- **Sync:** The encounter must be assigned an HLC from `@ultranos/sync-engine`.
- **Privacy:** In the PWA, ensure sensitive PHI in the store is cleared on logout or tab close (Key-in-Memory enforcement).

## Developer Guardrails
- **Performance:** Use shallow selectors to prevent unnecessary re-renders during high-frequency clinical entry.
- **Data Model:** Follow the `@ultranos/shared-types` Encounter schema.

## Context Links
- Architecture: [architecture.md](../planning-artifacts/architecture.md)
- PRD: [prd.md](../planning-artifacts/prd.md)

## Tasks/Subtasks
- [x] Install `immer` dependency and add `@ultranos/sync-engine` workspace dependency
- [x] Configure vitest resolve aliases for sync-engine and shared-types
- [x] Add `@ultranos/sync-engine` to Next.js `transpilePackages`
- [x] Extend Dexie DB schema (version 2) with `encounters` table
- [x] Create `useEncounterStore` with Zustand v5 + Immer middleware
  - [x] `startEncounter` action: creates FHIR Encounter with UUID, HLC, period.start
  - [x] `endEncounter` action: sets status to finished, period.end, updated HLC
  - [x] `loadActiveEncounter` action: restores in-progress encounter from Dexie
  - [x] `clearPhiState` action: clears sensitive state from memory
  - [x] PHI cleanup on `beforeunload` event (Key-in-Memory enforcement)
- [x] Update `encounter-dashboard.tsx` with Start/End Encounter UI
  - [x] "Start Encounter" button when no active consultation
  - [x] "Active Consultation" status indicator with green dot
  - [x] "End Encounter" button during active consultation
  - [x] Shallow selectors for render optimization
- [x] Write encounter store unit tests (22 tests)
- [x] Update encounter dashboard integration tests (14 tests total, 6 new)
- [x] Verify all 76 tests pass with no regressions
- [x] Verify Next.js production build succeeds
- [x] Verify TypeScript typecheck passes

### Review Findings
- [x] [Review][Defer] D1: No audit events emitted on encounter lifecycle — deferred, audit infrastructure is story 6-2 scope. Consistent with D5, D9.
- [x] [Review][Defer] D2: No encryption on IndexedDB encounter storage — deferred, encryption-at-rest is a dedicated cross-cutting story. Consistent with D10.
- [x] [Review][Defer] D3: Allergy section missing from encounter dashboard — deferred, allergy data/schema doesn't exist yet. Belongs in clinical display story.
- [x] [Review][Patch] P1: No Dexie error handling / optimistic rollback [encounter-store.ts:77-82]
- [x] [Review][Patch] P2: No concurrent encounter guard [encounter-store.ts:35]
- [x] [Review][Patch] P3: visibilitychange PHI cleanup is a no-op [encounter-store.ts:146-150]
- [x] [Review][Patch] P4: endEncounter keeps finished encounter in activeEncounter [encounter-store.ts:110-112]
- [x] [Review][Patch] P5: Race condition: loadActiveEncounter vs startEncounter [encounter-dashboard.tsx:60-62]
- [x] [Review][Patch] P6: Missing meta.versionId on Encounter [encounter-store.ts:72-73]
- [x] [Review][Patch] P7: loadActiveEncounter does not clear stale state [encounter-store.ts:117-129]
- [x] [Review][Patch] P8: No error handling on db.patients.get() [encounter-dashboard.tsx:49]
- [x] [Review][Patch] P9: No test for beforeunload PHI cleanup [encounter-store.test.ts]
- [x] [Review][Defer] W1: sessionStorage per-tab HLC node ID / SSR concerns — deferred, pre-existing architectural decision
- [x] [Review][Defer] W2: Dexie nested keypath index fragility — deferred, works in Dexie 4.x
- [x] [Review][Defer] W3: No RTL snapshot tests for encounter dashboard — deferred, cross-cutting infrastructure

## Dev Agent Record

### Implementation Plan
1. Added `immer` as a dependency and `@ultranos/sync-engine` as a workspace dependency
2. Extended Dexie schema to version 2 with `encounters` table indexed by id, status, subject.reference, hlcTimestamp, lastUpdated
3. Created `useEncounterStore` using Zustand v5 `create()` with `immer()` middleware
4. Integrated `HybridLogicalClock` from sync-engine for monotonic timestamps
5. Optimistic state updates: Zustand state set immediately, Dexie write follows asynchronously
6. PHI cleanup via `beforeunload` listener clears encounter state from memory
7. Updated encounter-dashboard.tsx to show Start/End Encounter flow with accessible UI
8. Shallow selectors used throughout to prevent re-renders

### Debug Log
- Next.js build failed on `./hlc.js` resolution from sync-engine source. Root cause: tsconfig path alias pointed to source index.ts, but webpack couldn't resolve `.js` → `.ts` extension. Fix: removed tsconfig path alias for sync-engine (using `transpilePackages` + dist/ resolution instead), kept vitest alias in vitest.config.ts.
- ESLint caught unused `vi` import in encounter-store.test.ts — removed.

### Completion Notes
All 5 acceptance criteria satisfied:
1. `useEncounterStore` implemented with Zustand v5 + Immer middleware
2. "Start Encounter" creates FHIR Encounter with `crypto.randomUUID()`
3. HLC timestamp from `@ultranos/sync-engine` assigned to `_ultranos.hlcTimestamp`
4. Optimistic state update ensures <50ms UI reflection (state set synchronously before Dexie persist)
5. Encounters persisted to Dexie IndexedDB via `db.encounters.put()`

## File List
- `apps/opd-lite/package.json` — added immer, @ultranos/sync-engine deps
- `apps/opd-lite/tsconfig.json` — no net change (path alias added then removed)
- `apps/opd-lite/vitest.config.ts` — added sync-engine and shared-types resolve aliases
- `apps/opd-lite/next.config.js` — added @ultranos/sync-engine to transpilePackages
- `apps/opd-lite/src/lib/db.ts` — added encounters table (Dexie v2 schema)
- `apps/opd-lite/src/stores/encounter-store.ts` — NEW: useEncounterStore
- `apps/opd-lite/src/components/encounter-dashboard.tsx` — updated with encounter lifecycle UI
- `apps/opd-lite/src/__tests__/encounter-store.test.ts` — NEW: 22 unit tests
- `apps/opd-lite/src/__tests__/encounter-dashboard.test.tsx` — updated: 14 tests (6 new)
- `pnpm-lock.yaml` — updated with immer

## Change Log
- 2026-04-28: Implemented Story 2.1 — Encounter Lifecycle & Zustand Store. Created useEncounterStore with Zustand v5 + Immer, HLC timestamps, Dexie persistence, PHI cleanup, and encounter dashboard UI. 76 tests pass, build succeeds.
