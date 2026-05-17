# Story 20.2: Encounter History & Patient Chart View

Status: done

## Story

As a clinician,
I want to view all past encounters for a patient,
so that I can review their medical history before starting a new encounter.

## Acceptance Criteria

1. **Given** a selected patient (from search or encounter), **When** the clinician navigates to the patient chart view, **Then** a chronological list of all encounters for that patient is displayed, ordered newest-first.

2. **Given** the encounter list, **Then** each encounter shows: date, status (finished/cancelled), SOAP summary preview (first ~100 chars of Subjective), diagnosis list, and prescription count.

3. **Given** the encounter list, **When** the clinician clicks an encounter, **Then** it expands to show full detail: vital signs, SOAP notes (S, O, A, P sections), diagnoses, prescriptions, and allergy state at time of visit.

4. **Given** the patient chart view, **Then** encounters are loaded from local Dexie first, then revalidated from Hub via `encounter.listByPatient` tRPC call (stale-while-revalidate pattern).

5. **Given** the patient chart view, **Then** the allergy banner renders at the top (red, first, uncollapsible) per CLAUDE.md Rule #4.

6. **Given** any access to patient encounter data, **Then** a PHI audit event is emitted via `@ultranos/audit-logger`.

## Tasks / Subtasks

- [x] Task 1: Create patient chart route and page (AC: #1, #5)
  - [x] 1.1 Create `src/app/patient/[patientId]/page.tsx` — new route for patient chart view
  - [x] 1.2 Load patient from Dexie `patients` table by `patientId`
  - [x] 1.3 Render `AllergyBanner` at the top (reuse from `src/components/clinical/AllergyBanner.tsx`)
  - [x] 1.4 Emit PHI READ audit event on page load

- [x] Task 2: Create encounter history list (AC: #1, #2)
  - [x] 2.1 Create `src/components/patient/EncounterHistoryList.tsx`
  - [x] 2.2 Query Dexie `encounters` table filtered by `subject.reference` matching patientId, ordered by `hlcTimestamp` desc
  - [x] 2.3 For each encounter, join SOAP data from `soapLedger` (latest entry per encounter), diagnoses from `conditions`, prescription count from `medications`
  - [x] 2.4 Display: date (formatted from HLC), status badge (finished=green, cancelled=grey), SOAP preview (truncated Subjective), diagnosis chips, Rx count

- [x] Task 3: Create encounter detail expansion (AC: #3)
  - [x] 3.1 Create `src/components/patient/EncounterDetail.tsx` — expandable detail view
  - [x] 3.2 Load vitals from `observations` table filtered by encounter reference
  - [x] 3.3 Load full SOAP notes from `soapLedger` (S, O, and Plan sections)
  - [x] 3.4 Load diagnoses from `conditions` table
  - [x] 3.5 Load prescriptions from `medications` table
  - [x] 3.6 Load allergy snapshot from `allergyIntolerances` table (at time of visit — filter by date ≤ encounter date)
  - [x] 3.7 Emit PHI READ audit event for detailed access

- [x] Task 4: Hub revalidation (AC: #4)
  - [x] 4.1 Add `encounter.listByPatient` tRPC call to `src/lib/trpc.ts`
  - [x] 4.2 After loading from Dexie, fire background Hub query to fetch latest encounters
  - [x] 4.3 Merge Hub results into Dexie (upsert), re-render list
  - [x] 4.4 Show StaleDataBanner (from `@ultranos/ui-kit`) if Hub revalidation fails (offline)

- [x] Task 5: Navigation integration (AC: #1)
  - [x] 5.1 Add "View Patient Chart" link from encounter dashboard header
  - [x] 5.2 Add patient chart link from dashboard recent encounters list (Story 20.1)
  - [x] 5.3 Add "Start New Encounter" button on patient chart page → navigates to `/encounter/[patientId]`

- [x] Task 6: Testing (AC: all)
  - [x] 6.1 Unit tests for `EncounterHistoryList` with mocked Dexie data
  - [x] 6.2 Unit tests for `EncounterDetail` expansion with vitals, SOAP, diagnoses
  - [x] 6.3 Test allergy banner renders first (snapshot test)
  - [x] 6.4 Test audit events emitted on page load and detail expansion
  - [x] 6.5 RTL snapshot tests

## Dev Notes

### Current State

There is **no patient chart view** in OPD Lite today. The only patient-related views are:
- `/` — patient search (home page, being refactored in 20.1)
- `/encounter/[patientId]` — active encounter dashboard

This story creates the **third patient-facing route**: `/patient/[patientId]` for historical chart review.

### Data Access Patterns

**Encounters by patient (Dexie):**
```typescript
db.encounters.where('subject.reference').equals(`Patient/${patientId}`).reverse().sortBy('hlcTimestamp')
```

**SOAP entries by encounter:**
```typescript
db.soapLedger.where('encounterId').equals(encounterId).reverse().sortBy('hlcTimestamp')
// Take latest entry — contains subjective + objective text
```

**Vitals by encounter:**
```typescript
db.observations.where('encounter.reference').equals(`Encounter/${encounterId}`).toArray()
```

**Diagnoses by encounter:**
```typescript
db.conditions.where('encounter.reference').equals(`Encounter/${encounterId}`).toArray()
```

**Prescriptions by encounter:**
```typescript
db.medications.where('encounter.reference').equals(`Encounter/${encounterId}`).toArray()
```

### tRPC Extension Required

Add to `src/lib/trpc.ts`:
```typescript
export async function listPatientEncounters(patientId: string): Promise<FhirEncounter[]> {
  // GET /encounter.listByPatient?input={json:{patientId}}
  // Requires Hub API router to have this endpoint (Epic 16, Story 16.1)
}
```

### AllergyBanner Reuse

Import from `src/components/clinical/AllergyBanner.tsx`. It reads from `useAllergyStore()` which loads allergies from Dexie. The banner is already styled: red background, sticky, z-50, never collapsed.

### Allergy State "At Time of Visit"

For historical encounters, the allergy list should show allergies that existed at the time of that encounter. Filter `allergyIntolerances` by `recordedDate ≤ encounter.period.start`. This is a best-effort approximation since allergies are append-only (Tier 1).

### File Structure

**NEW files:**
- `src/app/patient/[patientId]/page.tsx`
- `src/components/patient/EncounterHistoryList.tsx`
- `src/components/patient/EncounterDetail.tsx`

**MODIFIED files:**
- `src/lib/trpc.ts` — add `listPatientEncounters()`
- `src/components/encounter-dashboard.tsx` — add "View Chart" navigation link
- `src/app/page.tsx` — add chart link from recent encounters (if 20.1 complete)

### Important Constraints

- **PHI Safety:** Audit every page load and detail expansion. Use opaque IDs in audit events, never patient names.
- **Offline-First:** Page must render fully from Dexie. Hub revalidation is background enhancement.
- **Performance:** For patients with many encounters, consider pagination or virtual scrolling if >20 entries.
- **RTL:** Use `dir="auto"` on all text content. Logical CSS properties throughout.
- **SOAP Plan field:** The `soapLedger` currently stores `subjective` and `objective`. Story 20.3 will add `plan`. Handle gracefully if `plan` is undefined (not yet implemented).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20, Story 20.2]
- [Source: apps/opd-lite/src/lib/db.ts — Dexie schema, table indices]
- [Source: apps/opd-lite/src/components/clinical/AllergyBanner.tsx — allergy display]
- [Source: apps/opd-lite/src/stores/encounter-store.ts — encounter lifecycle]
- [Source: apps/opd-lite/src/components/clinical/soap-note-entry.tsx — SOAP fields]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No debug issues encountered.

### Completion Notes List

- **Task 1:** Created `/patient/[patientId]` route with AuthGuard + SessionTimeoutWrapper. PatientChartPage loads patient from Dexie, renders AllergyBanner first (CLAUDE.md Rule #4), emits PHI READ audit on load.
- **Task 2:** EncounterHistoryList queries Dexie encounters by `subject.reference`, sorts by HLC desc. Joins SOAP preview (truncated 100 chars), diagnosis chips, and Rx count per encounter.
- **Task 3:** EncounterDetail expandable view loads vitals, full SOAP notes (S/O/P with graceful undefined plan handling), diagnoses with ICD-10 codes, prescriptions with dosage, and allergy snapshot filtered by `recordedDate <= encounter.period.start`. Emits separate PHI audit for detail expansion.
- **Task 4:** Added `listPatientEncounters()` tRPC client function. EncounterHistoryList uses stale-while-revalidate: loads from Dexie first, then background Hub fetch with bulkPut upsert. StaleDataBanner from ui-kit shown when revalidation fails.
- **Task 5:** Added "View Patient Chart" link in encounter dashboard header. Added "View Chart" link in RecentEncountersList on clinical dashboard. "Start New Encounter" button links to `/encounter/[patientId]`.
- **Task 6:** 26 tests across 4 test files: patient-chart (6), encounter-history-list (9), encounter-detail (8), patient-chart-snapshots (3 including LTR/RTL snapshots and allergy-first verification).

### Change Log

- 2026-05-11: Story 20.2 implemented — all 6 tasks complete, 26 tests passing

### File List

**NEW files:**
- `apps/opd-lite/src/app/patient/[patientId]/page.tsx`
- `apps/opd-lite/src/components/patient/PatientChartPage.tsx`
- `apps/opd-lite/src/components/patient/EncounterHistoryList.tsx`
- `apps/opd-lite/src/components/patient/EncounterDetail.tsx`
- `apps/opd-lite/src/__tests__/patient-chart.test.tsx`
- `apps/opd-lite/src/__tests__/encounter-history-list.test.tsx`
- `apps/opd-lite/src/__tests__/encounter-detail.test.tsx`
- `apps/opd-lite/src/__tests__/patient-chart-snapshots.test.tsx`
- `apps/opd-lite/src/__tests__/__snapshots__/patient-chart-snapshots.test.tsx.snap`

**MODIFIED files:**
- `apps/opd-lite/src/lib/trpc.ts` — added `listPatientEncounters()`
- `apps/opd-lite/src/components/encounter-dashboard.tsx` — added "View Patient Chart" link + Link import
- `apps/opd-lite/src/components/dashboard/RecentEncountersList.tsx` — added "View Chart" link per encounter

### Review Findings

- [x] [Review][Decision→Patch] **SOAP "Assessment" section missing from data model and UI** — Added `assessment?: string` to `SoapLedgerEntry` in `db.ts`. Rendered A section between O and P in `EncounterDetail.tsx`. Handles undefined gracefully.
- [x] [Review][Decision→Patch] **`bulkPut` from Hub bypasses sync engine conflict resolution** — Added timestamp guard: only upserts Hub encounters that are newer than local versions (Tier 2 timestamp-based merge). [EncounterHistoryList.tsx]
- [x] [Review][Patch] **`handleSyncNow` creates uncancellable async operation** — Now uses component-level `cancelledRef` shared with effect cleanup. [EncounterHistoryList.tsx]
- [x] [Review][Patch] **`AllergyBanner` missing `clearPhiState()` before `loadAllergies`** — Added `clearPhiState()` call before `loadAllergies(patientId)` in useEffect. [AllergyBanner.tsx]
- [x] [Review][Patch] **`RecentEncountersList` displays raw HLC timestamp** — `formatDate` now splits HLC timestamp to extract ISO portion before parsing. [RecentEncountersList.tsx]
- [x] [Review][Patch] **Hub-synced encounters without HLC show blank date** — Added `getEncounterTimestamp()` fallback chain: `hlcTimestamp → period.start → meta.lastUpdated`. Used for both sorting and display. [EncounterHistoryList.tsx]
- [x] [Review][Patch] **Audit event not emitted on failed PHI access** — Added audit call in catch block with `accessFailed: true` metadata. [EncounterDetail.tsx]
- [x] [Review][Patch] **`patientId` from URL has no UUID validation** — Added UUID regex guard in `PatientChartPage`. Invalid IDs short-circuit to "Patient not found". [PatientChartPage.tsx]
- [x] [Review][Patch] **Duplicate audit events on revalidation** — `loadFromDexie` now accepts `skipAudit` option. Revalidation reload skips audit. Initial audit tracked via `initialAuditFired` ref. [EncounterHistoryList.tsx]
- [x] [Review][Patch] **`aria-label` in RecentEncountersList embeds patient name** — Replaced with generic "View patient chart" label. [RecentEncountersList.tsx]
- [x] [Review][Patch] **Allergy snapshot suppressed on malformed encounterDate** — Added `isNaN` guard on both encounter date and recorded date. Invalid dates → show all allergies (CLAUDE.md Rule #4 safety). [EncounterDetail.tsx]
- [x] [Review][Defer] **Encounter list uses HLC timestamp instead of `period.start` for display/sorting** — HLC reflects record creation time, not clinical encounter time. For backdated entries, display order may not match clinical chronology. Pragmatically only matters for retroactive data entry. [EncounterHistoryList.tsx:104-110, 232] — deferred, pre-existing architectural pattern
- [x] [Review][Defer] **`StaleDataBanner` `failedCount` hardcoded to 0** — API contract mismatch if ui-kit banner ever requires `failedCount > 0` to trigger. Currently works because `isStaleByTime` with null `lastSyncedAt` is always true. [EncounterHistoryList.tsx:207] — deferred, ui-kit contract issue
- [x] [Review][Defer] **`revalidateFromHub` writes old patient's Hub data on navigation** — `bulkPut` executes even after `cancelled.current` is set, only preventing state updates. Stale data written to Dexie. Correctness issue, not security. [EncounterHistoryList.tsx:144-147] — deferred, requires sync engine integration
