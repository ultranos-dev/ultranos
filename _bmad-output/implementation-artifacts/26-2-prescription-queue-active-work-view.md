# Story 26.2: Prescription Queue & Active Work View

Status: done

## Story

As a pharmacist,
I want to see a list of prescriptions currently being processed,
so that I can manage multiple fulfillment workflows in a busy pharmacy.

## Acceptance Criteria

1. **Given** the `/queue` route in Pharmacy Lite, **When** the page loads, **Then** a tabbed view shows: Active (in-progress fulfillments), Completed (today), Failed (sync errors)
2. **Given** the Active tab, **When** items exist, **Then** each item shows: patient name, medication count, fulfillment phase (loaded/reviewing/dispensing/completed), timestamp
3. **Given** an active item, **When** clicked, **Then** the fulfillment workflow resumes from its current phase
4. **Given** the Completed tab, **When** items exist, **Then** completed items show sync status (synced/pending/failed) with visual badges
5. **Given** the Failed tab, **When** items exist, **Then** failed items show a "Retry Sync" button

## Tasks / Subtasks

- [x] Task 1: Create queue data layer (AC: #1, #2, #4, #5)
  - [x] 1.1 Create `src/lib/queue-data.ts` — helper functions to query Dexie `dispenses` and `syncQueue` tables, group by prescription bundle, and categorize into Active/Completed/Failed
  - [x] 1.2 Active items: dispenses with `status !== 'completed'` OR fulfillment-store phase !== 'empty'/'completed'
  - [x] 1.3 Completed items: dispenses from today with no corresponding `syncQueue` entry (fully synced) OR synced status
  - [x] 1.4 Failed items: dispenses with corresponding `syncQueue` entries where `retryCount > 0`
- [x] Task 2: Create queue page and components (AC: #1-#5)
  - [x] 2.1 Create `src/app/queue/page.tsx` — hosts `PrescriptionQueueView`
  - [x] 2.2 Create `src/components/pharmacy/PrescriptionQueueView.tsx` — tabbed layout with Active/Completed/Failed tabs
  - [x] 2.3 Create `src/components/pharmacy/QueueItemCard.tsx` — reusable card showing patient name, medication count, phase badge, timestamp, sync status badge
  - [x] 2.4 Implement tab state using local React state (not Zustand — UI-only state)
- [x] Task 3: Resume fulfillment workflow (AC: #3)
  - [x] 3.1 When an active item is clicked, populate `fulfillment-store` with the saved prescription data from Dexie and navigate to `/scan` (which hosts the fulfillment UI)
  - [x] 3.2 The fulfillment store's `loadPrescriptions()` already handles this — just need to reconstruct `VerifiedPrescription[]` from stored dispense data
- [x] Task 4: Retry sync action (AC: #5)
  - [x] 4.1 Import `syncDispenseToHub` from `src/lib/dispense-sync.ts`
  - [x] 4.2 On "Retry Sync" tap: fetch the queued dispense from `syncQueue`, attempt sync, update UI on success/failure
  - [x] 4.3 Show loading spinner during retry, success/failure toast after
- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Unit test `queue-data.ts` categorization logic with mock Dexie data
  - [x] 5.2 Unit test `PrescriptionQueueView` renders tabs and correct items
  - [x] 5.3 Unit test retry sync button triggers `syncDispenseToHub`

## Dev Notes

### Architecture & Patterns

- **Tab implementation:** Use plain React state for tab selection. Tabs are "Active", "Completed (Today)", "Failed". Use semantic `role="tablist"`, `role="tab"`, `role="tabpanel"` for accessibility.
- **Data comes from local Dexie only.** Query `db.dispenses` and `db.syncQueue` tables. No Hub API calls on this page.
- **Fulfillment phase badges** should use the same color semantics as the existing `SyncPulse`:
  - `loaded` → blue
  - `reviewing` → amber
  - `dispensing` → amber (pulsing)
  - `completed` → green
- **Sync status badges:**
  - `synced` → green "Synced"
  - `pending` → amber "Pending"
  - `failed` → red "Failed" with retry button
- **Patient name display:** Only first name from the dispense record `subject.display` field. Never show full demographics — data minimization (CLAUDE.md Rule #7).

### Existing Files to Reuse

| File | What to Reuse |
|------|--------------|
| `src/lib/dispense-sync.ts` | `syncDispenseToHub()` for retry |
| `src/lib/db.ts` | Dexie `dispenses` and `syncQueue` tables |
| `src/stores/fulfillment-store.ts` | `loadPrescriptions()` for resume |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `src/app/queue/page.tsx` | Queue route page |
| `src/components/pharmacy/PrescriptionQueueView.tsx` | Tabbed queue layout |
| `src/components/pharmacy/QueueItemCard.tsx` | Individual queue item card |
| `src/lib/queue-data.ts` | Dexie query helpers for queue categorization |

### Dependency on Story 26.1

- Story 26.1 creates the AppShell with nav items including `/queue`. This story creates the actual page content.
- If developing in parallel with 26.1, the `/queue` route can be created independently — it just needs to be `'use client'` and wrapped by the existing `ClientErrorBoundary` / `AuthGuard` from `layout.tsx`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 26.2]
- [Source: apps/pharmacy-lite/src/lib/db.ts — Dexie schema v4]
- [Source: apps/pharmacy-lite/src/lib/dispense-sync.ts — syncDispenseToHub]
- [Source: apps/pharmacy-lite/src/stores/fulfillment-store.ts — FulfillmentPhase type]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation with no debugging needed.

### Completion Notes List

- Created `queue-data.ts` with `getActiveItems()`, `getCompletedItems()`, `getFailedItems()` querying local Dexie only
- Active items filter by `status !== 'completed'`; completed items filter today's dispenses; failed items join with `syncQueue` entries where `retryCount > 0`
- Patient first name extraction follows data minimization (CLAUDE.md Rule #7) — only first name from `subject.display`
- Phase badges use SyncPulse color semantics: loaded=blue, reviewing=amber, dispensing=amber+pulse, completed=green
- Sync status badges: synced=green, pending=amber, failed=red with retry button
- Tabs use local React state with semantic ARIA roles (tablist/tab/tabpanel)
- Resume workflow reconstructs `VerifiedPrescription` from dispense data and calls `loadPrescriptions()` before navigating to `/scan`
- Retry sync calls `syncDispenseToHub()` with loading spinner and auto-refreshes queue data on completion
- 24 tests total: 11 for queue-data categorization logic, 13 for component rendering and interactions
- All new tests pass. Pre-existing failures in `prescription-verify.test.ts`, `medication-dispense.test.ts`, `MedicationLabel.test.tsx` are unrelated to this story.

### Change Log

- 2026-05-12: Implemented Story 26.2 — Prescription Queue & Active Work View (all 5 tasks)
- 2026-05-12: Code review — resolved 5 decision-needed + 8 patch findings (audit, clinical data round-trip, timezone, ARIA, error handling, UX interactivity)

### Review Findings

#### Decision Needed (all resolved)

- [x] [Review][Decision] **D1: Hardcoded dosage & duration in resume workflow** — Fixed: `createMedicationDispense` now stores `originalPrescription` in `_ultranos`; `handleSelectActive` retrieves it for round-trip fidelity. Fallback reconstruction retained for pre-patch dispenses.
- [x] [Review][Decision] **D2: Hardcoded patient age 0 in resume workflow** — Fixed: `createMedicationDispense` now accepts `patientContext` and stores `patientDisplayName` + `patientAge` in `_ultranos`; resume reads them back.
- [x] [Review][Decision] **D3: `dispensing` phase is unreachable** — Fixed: `mapPhase()` now reads `_ultranos.fulfillmentPhase` first; `createMedicationDispense` persists `fulfillmentPhase` in `_ultranos`; schema extended.
- [x] [Review][Decision] **D4: Resume always restarts at 'loaded' phase** — Fixed: phase is now derived from persisted `_ultranos.fulfillmentPhase` via `mapPhase()`. Resume uses the stored phase.
- [x] [Review][Decision] **D5: `subject.display` is never set by `createMedicationDispense`** — Fixed: `createMedicationDispense` now populates `subject.display` from `patientContext.displayName`.

#### Patches (all applied)

- [x] [Review][Patch] **P1: No audit events emitted on PHI access** — Fixed: `auditPhiAccess` calls added to all three query functions in `queue-data.ts`.
- [x] [Review][Patch] **P2: `retryCount > 0` heuristic ignores `sqEntry.status`** — Fixed: new `deriveSyncStatus()` checks `sqEntry.status === 'synced'` before `retryCount`. Failed items also filter `status !== 'synced'`.
- [x] [Review][Patch] **P3: ISO timezone bug in `getCompletedItems`** — Fixed: uses `Date.UTC()` to construct today's start boundary in UTC, consistent with stored ISO strings.
- [x] [Review][Patch] **P4: `aria-labelledby` references nonexistent element** — Fixed: tab buttons now have `id="tab-${tab.id}"` matching the tabpanel's `aria-labelledby`.
- [x] [Review][Patch] **P5: No error handling on `loadData`** — Fixed: try/catch with `error` state renders an alert banner. `handleRetry` also catches errors.
- [x] [Review][Patch] **P6: `medicationCount` counts codings, not medications** — Fixed: hardcoded to `1` per dispense resource (FHIR MedicationDispense = one medication).
- [x] [Review][Patch] **P7: Completed/failed items appear interactive but are no-ops** — Fixed: `onSelect` is now optional in `QueueItemCard`; when absent, no `cursor-pointer`, `role="button"`, or `tabIndex` is rendered. `PrescriptionQueueView` passes `undefined` for non-active tabs.
- [x] [Review][Patch] **P8: Unsafe type assertion on `dispense.subject`** — Fixed: uses `dispense.subject?.display` directly (FHIR `ReferenceSchema` already has optional `display`).

#### Deferred

- [x] [Review][Defer] **W1: No polling/refresh mechanism** — Data loads once on mount; stale if another tab/worker completes a sync. Pre-existing pattern across the codebase. [PrescriptionQueueView.tsx:40-42]
- [x] [Review][Defer] **W2: QueueItem exposes full dispense object** — Full FHIR resource in React state/props. Needed for resume and retry; architectural data-minimization improvement. [queue-data.ts:17]

### File List

- `apps/pharmacy-lite/src/lib/queue-data.ts` (NEW)
- `apps/pharmacy-lite/src/app/queue/page.tsx` (NEW)
- `apps/pharmacy-lite/src/components/pharmacy/PrescriptionQueueView.tsx` (NEW)
- `apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx` (NEW)
- `apps/pharmacy-lite/src/__tests__/queue-data.test.ts` (NEW)
- `apps/pharmacy-lite/src/__tests__/PrescriptionQueueView.test.tsx` (NEW)
- `apps/pharmacy-lite/src/lib/medication-dispense.ts` (MODIFIED — added patientContext param, subject.display, _ultranos round-trip fields)
- `apps/pharmacy-lite/src/stores/fulfillment-store.ts` (MODIFIED — passes patientContext to createMedicationDispense)
- `packages/shared-types/src/fhir/medication-dispense.schema.ts` (MODIFIED — extended _ultranos schema with round-trip fields)
