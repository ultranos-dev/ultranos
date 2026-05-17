# Story 20.4: Conflict Resolution Interface

Status: done

## Story

As a clinician,
I want to review and resolve Tier 1 sync conflicts,
so that safety-critical data (allergies, active medications) is reconciled within 24 hours per policy.

## Acceptance Criteria

1. **Given** Tier 1 conflicts flagged in the sync queue, **When** the clinician navigates to the conflict resolution view (from dashboard card or sync dashboard), **Then** each conflict displays the local version and remote version side-by-side with highlighted differences.

2. **Given** a conflict, **Then** the clinician can choose: "Keep Both" (append-only), "Prefer Local", or "Prefer Remote" for each field.

3. **Given** a Tier 1 conflict, **Then** "Keep Both" is the default and recommended action (pre-selected, visually emphasized).

4. **Given** a resolved conflict, **Then** the sync queue entry status is updated and an audit event is emitted.

5. **Given** an unresolved Tier 1 conflict older than 24 hours, **Then** it is highlighted in red with an "OVERDUE" badge.

6. **Given** a patient with unresolved Tier 1 conflicts, **Then** prescription generation is blocked for that patient (per CLAUDE.md Rule #5).

## Tasks / Subtasks

- [x] Task 1: Create conflict resolution route (AC: #1)
  - [x] 1.1 Create `src/app/conflicts/page.tsx` — dedicated conflict resolution page
  - [x] 1.2 Wrap in `AuthGuard` + `SessionTimeoutWrapper`
  - [x] 1.3 Add navigation from dashboard UnresolvedConflictsCard (Story 20.1) and SyncDashboard

- [x] Task 2: Build conflict list view (AC: #1, #5)
  - [x] 2.1 Create `src/components/conflicts/ConflictList.tsx`
  - [x] 2.2 Query Dexie `syncQueue` for entries with `conflictFlag === true` and Tier 1 resource types (`AllergyIntolerance`, `MedicationRequest`, `Condition`)
  - [x] 2.3 For each conflict, load the local version from Dexie and the remote version from the conflict payload (stored in `syncQueue.conflictData`)
  - [x] 2.4 Display patient name, resource type, conflict age, created timestamp
  - [x] 2.5 Highlight conflicts older than 24 hours with red background + "OVERDUE" badge

- [x] Task 3: Build side-by-side diff view (AC: #1, #2, #3)
  - [x] 3.1 Create `src/components/conflicts/ConflictDiffView.tsx`
  - [x] 3.2 Render local and remote versions in two columns with field-level comparison
  - [x] 3.3 Highlight differing fields with background color
  - [x] 3.4 For each conflicting field, show three action buttons: "Keep Both" (default, emphasized), "Prefer Local", "Prefer Remote"
  - [x] 3.5 "Keep Both" pre-selected for Tier 1 resources with visual emphasis (green border, recommended label)

- [x] Task 4: Implement resolution logic (AC: #2, #4)
  - [x] 4.1 Create `src/lib/conflict-resolution.ts` — resolution handler
  - [x] 4.2 "Keep Both": append both versions to the local store (append-only merge per CLAUDE.md)
  - [x] 4.3 "Prefer Local": keep local version, discard remote
  - [x] 4.4 "Prefer Remote": replace local with remote version
  - [x] 4.5 Update `syncQueue` entry: set `status` to `'resolved'`, add resolution metadata
  - [x] 4.6 Emit audit event via `@ultranos/audit-logger` with resolution type, resource ID, practitioner ref
  - [x] 4.7 Enqueue resolution to Hub sync: `sync:conflict_resolved` action

- [x] Task 5: Prescription blocking (AC: #6)
  - [x] 5.1 Create `src/lib/conflict-check.ts` — utility to check if patient has unresolved Tier 1 conflicts
  - [x] 5.2 Query `syncQueue` for `conflictFlag === true` filtered by patient reference and Tier 1 resource types
  - [x] 5.3 Wire into `encounter-dashboard.tsx` prescription flow: before entering prescription, check for conflicts
  - [x] 5.4 If conflicts exist, show blocking error with link to conflict resolution page
  - [x] 5.5 This enforces CLAUDE.md: "Prescription generation blocked until [Tier 1 conflicts] resolved"

- [x] Task 6: Testing (AC: all)
  - [x] 6.1 Unit test: ConflictList renders conflicts from mocked syncQueue
  - [x] 6.2 Unit test: ConflictDiffView highlights differences between local and remote
  - [x] 6.3 Unit test: "Keep Both" is default for Tier 1
  - [x] 6.4 Unit test: resolution updates syncQueue status + emits audit event
  - [x] 6.5 Unit test: OVERDUE badge for conflicts >24h old
  - [x] 6.6 Unit test: prescription blocked when unresolved Tier 1 conflicts exist
  - [x] 6.7 RTL snapshot tests for diff view (two-column layout must mirror)

## Dev Notes

### Current State of Conflict Handling

Currently, OPD Lite has:
- `SyncDashboard.tsx` — shows sync queue counts (pending, failed, conflict) but no resolution UI
- `sync-store.ts` — tracks `conflictCount` from Dexie `syncQueue`
- `sync-queue.ts` — basic queue operations (put, getByStatus, etc.)
- `sync-worker.ts` — background sync with conflict detection

The sync engine (`packages/sync-engine/src/conflict-resolver.ts`) defines the tiered resolution strategy, but OPD Lite has **no UI for manual conflict resolution**. This story creates it.

### Sync Queue Schema for Conflicts

When a sync conflict is detected, the `syncQueue` entry should contain:
```typescript
interface SyncQueueEntry {
  id: string;
  action: string;           // e.g., 'allergyIntolerance:create'
  resourceType: string;     // 'AllergyIntolerance', 'MedicationRequest', 'Condition'
  resourceId: string;
  payload: unknown;         // local version
  conflictData?: unknown;   // remote version (populated on conflict)
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';
  patientRef?: string;      // Patient/{id} for conflict filtering
  createdAt: string;        // ISO timestamp for age calculation
  hlcTimestamp: string;
}
```

If `conflictData` is not currently stored in the sync queue, the dev agent must add it. Check `packages/sync-engine/` and `apps/opd-lite/src/lib/sync-worker.ts` for the conflict detection flow.

### Tier 1 Resource Types (Safety-Critical)

Per CLAUDE.md conflict resolution tiers:
- `AllergyIntolerance` — allergies
- `MedicationRequest` — active medications
- `Condition` — critical diagnoses (where `category === 'encounter-diagnosis'` and severity is high)

These MUST use append-only merge. "Keep Both" is the only fully safe option. "Prefer Local" and "Prefer Remote" are available but should be visually de-emphasized with a warning.

### 24-Hour Overdue Calculation

```typescript
const isOverdue = (createdAt: string): boolean => {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs > 24 * 60 * 60 * 1000;
};
```

### Prescription Blocking Integration

The prescription entry flow in `encounter-dashboard.tsx` currently:
1. Opens `PrescriptionEntry` component
2. Runs drug interaction check
3. Shows QR generation

Insert conflict check **before step 1**: call `hasUnresolvedTier1Conflicts(patientId)`. If true, show blocking UI instead of prescription form.

### File Structure

**NEW files:**
- `src/app/conflicts/page.tsx`
- `src/components/conflicts/ConflictList.tsx`
- `src/components/conflicts/ConflictDiffView.tsx`
- `src/lib/conflict-resolution.ts`
- `src/lib/conflict-check.ts`

**MODIFIED files:**
- `src/components/encounter-dashboard.tsx` — add prescription blocking check
- `src/components/SyncDashboard.tsx` — add link to `/conflicts` page

### Important Constraints

- **Append-only for Tier 1:** "Keep Both" must create new entries, never delete. Both local and remote versions become part of the patient record.
- **Audit everything:** Every resolution action must be audit-logged with practitioner reference, resolution type, and resource IDs.
- **PHI Safety:** The diff view shows clinical data (allergies, medications). This is acceptable for authenticated clinicians. Emit PHI READ audit on view. Never log field values to console.
- **Offline-First:** Conflict resolution must work offline. Resolution updates the local syncQueue. Hub sync happens in background when online.
- **RTL:** Two-column diff view must use CSS Grid/Flexbox with logical properties. Columns should swap position in RTL.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20, Story 20.4]
- [Source: CLAUDE.md — Sync Engine Conflict Resolution Tiers]
- [Source: packages/sync-engine/src/conflict-resolver.ts — tiered resolution]
- [Source: apps/opd-lite/src/components/SyncDashboard.tsx — current sync UI]
- [Source: apps/opd-lite/src/lib/sync-queue.ts — queue operations]
- [Source: apps/opd-lite/src/lib/sync-worker.ts — conflict detection]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Fixed Dexie boolean index queries: `where('conflictFlag').equals(1)` doesn't work in fake-indexeddb; switched to `toArray()` + JS filter (matches existing SyncDashboard pattern)
- Updated clinical-dashboard.test.tsx to use regex matcher after UnresolvedConflictsCard text changed to include link arrow

### Completion Notes List
- Created conflict resolution page at `/conflicts` with AuthGuard + SessionTimeoutWrapper
- Built ConflictList with overdue sorting (overdue first), 5s polling, PHI READ audit on expand
- Built ConflictDiffView with CSS Grid two-column layout, field-level diff highlighting, three resolution actions
- "Keep Both" is visually emphasized for Tier 1 with green border + "Recommended" label
- Implemented resolution logic: keep-both appends remote to clinical table, prefer-remote replaces local, prefer-local is no-op
- All resolutions update syncQueue status to 'resolved', emit audit event, enqueue sync action
- Added Dexie v17 schema with conflictFlag, patientRef indexes and new SyncQueueEntry fields (conflictData, patientRef, resolvedAt, resolutionType)
- Prescription blocking wired into encounter-dashboard before allergy check, with link to /conflicts page
- Navigation added from UnresolvedConflictsCard (dashboard) and SyncDashboard header
- 24 new tests covering all ACs: unit tests for resolution logic, conflict check, component rendering, OVERDUE badge, RTL snapshot
- Pre-existing failure: notification-center.test.tsx (Story 20.6 not yet implemented) — not related to this story

### File List
**NEW:**
- apps/opd-lite/src/app/conflicts/page.tsx
- apps/opd-lite/src/components/conflicts/ConflictList.tsx
- apps/opd-lite/src/components/conflicts/ConflictDiffView.tsx
- apps/opd-lite/src/lib/conflict-resolution.ts
- apps/opd-lite/src/lib/conflict-check.ts
- apps/opd-lite/src/__tests__/conflict-resolution.test.tsx
- apps/opd-lite/src/__tests__/__snapshots__/conflict-resolution.test.tsx.snap

**MODIFIED:**
- apps/opd-lite/src/lib/db.ts (v17 schema, SyncQueueEntry extended with conflictData, patientRef, resolvedAt, resolutionType, status union expanded)
- apps/opd-lite/src/components/encounter-dashboard.tsx (prescription blocking with conflict check)
- apps/opd-lite/src/components/SyncDashboard.tsx (Resolve Conflicts link)
- apps/opd-lite/src/components/dashboard/UnresolvedConflictsCard.tsx (link to /conflicts)
- apps/opd-lite/src/__tests__/clinical-dashboard.test.tsx (regex matcher for updated text)

### Review Findings

- [x] [Review][Decision] **D1: Tier 1 destructive resolution violates CLAUDE.md Rule #5** — Resolved: (B) Added confirmation dialog for Tier 1 prefer-local/prefer-remote with audit escalation warning. [ConflictDiffView.tsx]
- [x] [Review][Decision] **D2: No role-based access control on /conflicts page** — Resolved: (B) Added physician role check on resolve actions in ConflictDiffView. Non-physicians can view but not resolve. [ConflictDiffView.tsx]
- [x] [Review][Patch] **P1: resolveConflict not wrapped in Dexie transaction** — Fixed: wrapped all mutations in `db.transaction()`. [conflict-resolution.ts]
- [x] [Review][Patch] **P2: handleExpand fires audit side effect inside React state updater** — Fixed: moved audit call outside `setExpandedId` callback. [ConflictList.tsx]
- [x] [Review][Patch] **P3: UnresolvedConflictsCard duplicates TIER_1_RESOURCE_TYPES + missing status filter** — Fixed: imported from conflict-resolution.ts, added status filter. [UnresolvedConflictsCard.tsx]
- [x] [Review][Patch] **P4: String matching for conditional UI** — Fixed: replaced with `hasConflictBlock` state flag. [encounter-dashboard.tsx]
- [x] [Review][Patch] **P5: Conflict check failure silently allows prescription** — Fixed: catch block now shows "Conflict check unavailable" warning and blocks. [encounter-dashboard.tsx]
- [x] [Review][Patch] **P6: ConflictList shows false "no conflicts" on query failure** — Fixed: added `loadError` state with distinct error UI. [ConflictList.tsx]
- [x] [Review][Patch] **P7: appendRemoteVersion ID collision risk** — Fixed: always assigns `crypto.randomUUID()`-based ID to appended remote. [conflict-resolution.ts]
- [x] [Review][Patch] **P8: Plain `<a>` tags instead of Next.js `<Link>`** — Fixed: all internal links now use Next.js `<Link>`. [conflicts/page.tsx, SyncDashboard.tsx, UnresolvedConflictsCard.tsx, encounter-dashboard.tsx]
- [x] [Review][Patch] **P9: Resolution sync entry uses stale hlcTimestamp** — Fixed: uses `now` (resolution time) instead of original entry timestamp. [conflict-resolution.ts]
- [x] [Review][Patch] **P10: Malformed/null conflictData crashes or silently resolves** — Fixed: extracted `parseConflictData()` helper with throws on invalid data; added guard rejecting non-prefer-local without conflictData. [conflict-resolution.ts]
- [x] [Review][Patch] **P11: Empty practitionerRef not validated** — Fixed: resolveConflict rejects empty practitionerRef. [conflict-resolution.ts]
- [x] [Review][Patch] **P12: RTL test coverage gaps** — Fixed: RTL test wraps in `dir="rtl"`, added RTL snapshot, replaced `px-` with `ps-`/`pe-` in conflict components. [conflict-resolution.test.tsx, ConflictList.tsx, ConflictDiffView.tsx, conflicts/page.tsx]
- [x] [Review][Patch] **P13: No test for keep-both actually appending remote to clinical table** — Fixed: test now verifies both local and remote versions exist in `db.allergyIntolerances` after keep-both resolution. [conflict-resolution.test.tsx]
- [x] [Review][Defer] **W1: getNestedValue shallow lookup / complex FHIR field display** [ConflictDiffView.tsx:80-82] — deferred, functional but complex fields (dosageInstruction) render as JSON dumps
- [x] [Review][Defer] **W2: No loading indicator during prescription conflict check** [encounter-dashboard.tsx:218-229] — deferred, UX polish
- [x] [Review][Defer] **W3: Full-table scan performance on every poll cycle** [ConflictList.tsx:34, conflict-check.ts:27] — deferred, v17 indexes exist but queries don't use `where()` clauses
- [x] [Review][Defer] **W4: Dexie v16→v17 migration lacks data migration for pre-existing entries** [db.ts:441] — deferred, pre-existing syncQueue entries won't have conflictFlag/patientRef populated
- [x] [Review][Defer] **W5: No pagination/virtualization on ConflictList** [ConflictList.tsx] — deferred, performance concern for extended offline periods
