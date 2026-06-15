# Story 51.2: Workload Balancing Dashboard

Status: review-complete

## Story

As a lab manager,
I want to see real-time workload distribution across all techs,
So that I can rebalance work and identify when someone is consistently overloaded.

## Context

In a multi-tech lab, uneven workload distribution leads to bottlenecks, burnout, and delayed results. This story provides a real-time dashboard showing each tech's current load (pending, in-progress, completed) with the ability to drag-reassign samples between techs. All data is sourced from Dexie — the dashboard works fully offline. Historical pattern analysis helps managers identify chronic imbalances over time.

**PRD Requirements:** FR51 (brainstorm #43, #44)
**Dependencies:** Story 42.1 (Role-Based Access Control) — provides lab role hierarchy and staff list; Story 42.3 (Sample Accessioning) — provides sample assignment data; Story 51.3 (Sample Collision Prevention) — sample lock mechanism (can be developed in parallel)

## Acceptance Criteria

### AC 1: Per-Tech Workload Visualization

**Given** multiple techs are processing samples
**When** the manager opens the workload dashboard
**Then** each tech is displayed as a card or column showing:
- Tech name and role badge
- Pending samples count (assigned but not started)
- In-progress samples count (currently being processed)
- Completed today count
- Estimated completion time (based on average TAT for pending + in-progress)
**And** the visualization updates in near real-time from Dexie data (polling every 30 seconds)
**And** color coding indicates load level: green (normal), amber (above average), red (overloaded — >150% of average)

### AC 2: Drag-Reassign Functionality

**Given** a lab manager is viewing the workload dashboard
**When** they drag a sample from one tech's queue to another tech's column
**Then** the sample assignment is updated in Dexie
**And** the source tech's counts decrease and the target tech's counts increase
**And** if the sample has an active lock (from Story 51.3), the lock is released from the source tech and a new lock is NOT created (the target tech must explicitly start processing)
**And** the reassignment is logged in the sample's chain of custody
**And** an audit event is emitted with the reassignment details (tech IDs only, no PHI)

### AC 3: Unavailability Marking

**Given** a tech is on break, absent, or otherwise unavailable
**When** the manager (or the tech themselves) marks them as unavailable
**Then** their card/column shows an "Unavailable" badge with the reason
**And** their pending queue is visually flagged for redistribution (amber border, "Needs redistribution" label)
**And** no automatic redistribution occurs — the manager decides where to move samples
**And** the unavailability period is recorded for historical analysis

### AC 4: Historical Pattern Analysis

**Given** workload data has been collected over multiple shifts
**When** a lab manager views the "Patterns" tab on the workload dashboard
**Then** they see:
- Average samples per tech per shift (bar chart or table)
- Consistently overloaded techs (>120% of lab average over 7+ shifts)
- Consistently underutilized techs (<80% of lab average over 7+ shifts)
- Peak load times (hour-of-day distribution)
**And** data is computed from local Dexie history (last 30 days)
**And** the analysis helps inform scheduling decisions

### AC 5: Access Control

**Given** the workload dashboard shows sensitive operational data
**When** a user attempts to access it
**Then** only users with SUPERVISOR or LAB_MANAGER roles can view the dashboard
**And** only LAB_MANAGER can perform drag-reassignment
**And** any tech can mark themselves as unavailable
**And** access attempts by unauthorized roles show "Insufficient permissions"

## Tasks / Subtasks

### Task 1: Dexie Schema — Workload Tracking (AC: 1, 3, 4)

- [ ] Add version increment to `apps/lab-lite/src/lib/db.ts` with new tables:
  - `tech_workload_snapshots`: `&id, techId, shiftDate, [techId+shiftDate]`
  - `tech_availability`: `&id, techId, startedAt, endedAt, reason`
- [ ] Define `TechWorkloadSnapshot` interface:
  - `id: string` (UUID)
  - `techId: string`
  - `shiftDate: string` (YYYY-MM-DD)
  - `pendingCount: number`
  - `inProgressCount: number`
  - `completedCount: number`
  - `avgTatMinutes: number`
  - `snapshotAt: string` (ISO 8601)
- [ ] Define `TechAvailability` interface:
  - `id: string` (UUID)
  - `techId: string`
  - `status: 'AVAILABLE' | 'BREAK' | 'ABSENT' | 'TRAINING'`
  - `reason: string`
  - `startedAt: string`
  - `endedAt: string | null`

### Task 2: Workload Calculation Service (AC: 1, 4)

- [ ] Create `apps/lab-lite/src/lib/workload-service.ts`:
  - `getCurrentWorkloads(): Promise<TechWorkload[]>` — queries sample tables in Dexie, groups by assigned tech, computes pending/in-progress/completed counts and estimated completion time
  - `getLabAverageLoad(): Promise<number>` — computes average samples per tech for load-level comparison
  - `getHistoricalPatterns(days: number): Promise<WorkloadPatterns>` — aggregates `tech_workload_snapshots` for trend analysis
  - `recordWorkloadSnapshot(techId: string): Promise<void>` — saves current counts for historical tracking
- [ ] Create `estimateCompletionTime(pendingCount: number, inProgressCount: number, avgTat: number): Date` — helper for ETA calculation
- [ ] Schedule snapshot recording at shift boundaries (triggered from shift handover flow in Story 51.1)

### Task 3: Workload Dashboard UI (AC: 1, 5)

- [ ] Create `apps/lab-lite/src/components/workload/WorkloadDashboard.tsx`:
  - Grid layout with one card per tech
  - Each card shows: tech name, role badge, workload metrics (pending/in-progress/completed), ETA, load-level color indicator
  - Auto-refreshes every 30 seconds via polling hook
  - Responsive: 2-col on tablet, 3-col on desktop
  - Gated to SUPERVISOR+ via `useLabPermission`
  - Loading skeleton while data is being computed
- [ ] Create `apps/lab-lite/src/components/workload/TechWorkloadCard.tsx`:
  - Individual tech card component
  - Color-coded border: green/amber/red based on load level
  - Expandable to show individual sample list
  - "Unavailable" badge overlay when tech is marked unavailable
- [ ] Add route at `apps/lab-lite/src/app/[locale]/workload/page.tsx`

### Task 4: Drag-Reassign Implementation (AC: 2)

- [ ] Add drag-and-drop capability to `WorkloadDashboard.tsx`:
  - Use HTML5 Drag and Drop API (no external library dependency for PWA bundle size)
  - Drag source: sample items within a tech's expanded card
  - Drop target: another tech's card
  - On drop: call `reassignSample(sampleId, fromTechId, toTechId)` in workload service
  - Visual feedback: drag ghost, valid/invalid drop zone highlighting
  - Only enabled for LAB_MANAGER role
- [ ] Create `reassignSample(sampleId: string, fromTechId: string, toTechId: string): Promise<void>` in `workload-service.ts`:
  - Updates sample assignment in Dexie
  - Releases any active lock on the sample (coordinate with Story 51.3 lock table)
  - Appends chain of custody entry for the sample
  - Emits audit event
  - Queues sync event

### Task 5: Unavailability Management (AC: 3)

- [ ] Create `apps/lab-lite/src/components/workload/UnavailabilityToggle.tsx`:
  - Dropdown/button on each tech card for manager view
  - Self-service toggle in sidebar or profile for individual techs
  - Reason selection: Break, Absent, Training, Other
  - Records start time; end time set when toggled back to available
  - Updates `tech_availability` table in Dexie
- [ ] Add unavailability indicator to `TechWorkloadCard.tsx`:
  - Dimmed card with "Unavailable" badge and reason
  - Amber border with "Needs redistribution" label on pending queue

### Task 6: Historical Patterns View (AC: 4)

- [ ] Create `apps/lab-lite/src/components/workload/WorkloadPatterns.tsx`:
  - Tab or sub-page within the workload dashboard
  - Average samples per tech per shift (simple bar display — no charting library for bundle size)
  - Overloaded/underutilized tech highlighting with threshold indicators
  - Peak hour distribution (text-based summary)
  - Date range selector (last 7 / 14 / 30 days)
  - All data computed locally from `tech_workload_snapshots` in Dexie
- [ ] Consider using CSS-based bar charts (div widths) instead of a charting library to keep bundle size minimal

### Task 7: Audit Integration (AC: 2)

- [ ] Emit audit events for:
  - Sample reassignment: `{ action: 'UPDATE', resourceType: 'SAMPLE_ASSIGNMENT', resourceId: sampleId, detail: { fromTechId, toTechId, reassignedBy } }`
  - Unavailability toggle: `{ action: 'UPDATE', resourceType: 'TECH_AVAILABILITY', resourceId: techId, detail: { status, reason } }`
- [ ] Never include sample content, patient data, or tech names in audit events — IDs only

### Task 8: Internationalization

- [ ] Add i18n keys to all 5 locale files (`apps/lab-lite/messages/{en,ar,prs,ps,fa}.json`):
  - `workload.dashboard`: "Workload Dashboard"
  - `workload.pending`: "Pending"
  - `workload.inProgress`: "In Progress"
  - `workload.completedToday`: "Completed Today"
  - `workload.estimatedCompletion`: "Est. Completion"
  - `workload.reassign`: "Reassign Sample"
  - `workload.unavailable`: "Unavailable"
  - `workload.needsRedistribution`: "Needs Redistribution"
  - `workload.patterns`: "Patterns"
  - `workload.overloaded`: "Consistently Overloaded"
  - `workload.underutilized`: "Consistently Underutilized"
  - `workload.markUnavailable`: "Mark Unavailable"
  - `workload.markAvailable`: "Mark Available"

### Task 9: Testing

- [ ] Create `apps/lab-lite/src/__tests__/workload-service.test.ts`:
  - Test workload calculation groups by tech correctly
  - Test estimated completion time calculation
  - Test historical pattern aggregation
  - Test sample reassignment updates Dexie
  - Test load level thresholds (green/amber/red)
- [ ] Create `apps/lab-lite/src/__tests__/workload-dashboard.test.tsx`:
  - Test dashboard renders tech cards with correct data
  - Test auto-refresh polling
  - Test access control (SUPERVISOR can view, LAB_TECH cannot)
  - Test drag-reassign only enabled for LAB_MANAGER
  - Test unavailability badge display
- [ ] Create `apps/lab-lite/src/__tests__/workload-patterns.test.tsx`:
  - Test pattern calculation from snapshot data
  - Test overloaded/underutilized detection thresholds
  - Test date range filtering

## Dev Notes

### Architecture Decisions

**All workload data is computed from existing Dexie tables.** The dashboard queries sample tables to compute per-tech workload in real-time. Periodic snapshots are saved for historical analysis. This avoids maintaining a separate workload tracking system — the source of truth is always the sample data.

**No external charting library.** To keep the Lab-Lite PWA bundle small (critical for low-bandwidth MENA environments), historical patterns use CSS-based visualizations (div widths for bar charts, color-coded cells for heatmaps). If a charting library is needed later, it should be lazy-loaded.

**Drag-reassign uses HTML5 DnD API.** No external drag library to minimize bundle size. Touch support for tablets can be added via `touch-action` CSS and pointer events. If touch DnD proves unreliable, a fallback "Reassign" button with a tech selector dropdown should be provided.

**Load level thresholds are percentage-based relative to lab average.** Green: <= 100% of average, Amber: 101-150%, Red: >150%. These thresholds are hardcoded for v1 — a future story could make them configurable.

### Files to Create

| File | Purpose |
|---|---|
| `apps/lab-lite/src/lib/workload-service.ts` | Workload calculation and reassignment logic |
| `apps/lab-lite/src/components/workload/WorkloadDashboard.tsx` | Main workload dashboard page |
| `apps/lab-lite/src/components/workload/TechWorkloadCard.tsx` | Individual tech workload card |
| `apps/lab-lite/src/components/workload/UnavailabilityToggle.tsx` | Tech availability toggle |
| `apps/lab-lite/src/components/workload/WorkloadPatterns.tsx` | Historical pattern analysis view |
| `apps/lab-lite/src/app/[locale]/workload/page.tsx` | Workload page route |
| `apps/lab-lite/src/__tests__/workload-service.test.ts` | Service unit tests |
| `apps/lab-lite/src/__tests__/workload-dashboard.test.tsx` | Dashboard UI tests |
| `apps/lab-lite/src/__tests__/workload-patterns.test.tsx` | Pattern analysis tests |

### Files to Modify

| File | Change |
|---|---|
| `apps/lab-lite/src/lib/db.ts` | Add `tech_workload_snapshots` and `tech_availability` tables |
| `apps/lab-lite/src/components/AppSidebar.tsx` | Add "Workload" navigation item (SUPERVISOR+ only) |
| `apps/lab-lite/messages/en.json` | Add workload i18n keys |
| `apps/lab-lite/messages/ar.json` | Arabic translations |
| `apps/lab-lite/messages/prs.json` | Dari translations |
| `apps/lab-lite/messages/ps.json` | Pashto translations |
| `apps/lab-lite/messages/fa.json` | Farsi translations |

### Patterns to Follow

1. **Dashboard pattern:** Follow `apps/lab-lite/src/components/dashboard/` — grid layout with cards, each card self-contained.
2. **Hook pattern:** Follow `useDashboardData.ts` — return `{ data, isLoading, error }`, use `useEffect` with polling interval.
3. **Permission gating:** Use `useLabPermission(LabPermission.VIEW_STAFF)` for view access, `useLabPermission(LabPermission.MANAGE_STAFF_ROLES)` for reassignment.
4. **Audit pattern:** Use `@ultranos/audit-logger` — IDs only, no PHI.

### Key Constraints from CLAUDE.md

- **PHI Rule:** Tech names on cards are acceptable (they are practitioners, not patients). Never show patient data on the workload dashboard — only sample IDs and counts.
- **Offline-First Rule:** The entire dashboard works from Dexie data. No network required.
- **RTL Rule:** Card grid must reflow correctly in RTL. Drag direction must work in both LTR and RTL.
- **Data Minimization Rule #7:** Sample details on the dashboard show sample ID and urgency only — no patient demographics.

### Review Findings

#### Decision Needed

- [x] [Review][Decision] **Permission API mismatch** — Spec says use `useLabPermission(LabPermission.VIEW_STAFF)` for view and `useLabPermission(LabPermission.MANAGE_STAFF_ROLES)` for reassignment. Code uses `useRequireLabRole('SUPERVISOR')` and `session.labRole === LabRole.LAB_MANAGER`. Both hooks exist in `useLabPermission.ts`. Which approach should this story follow? [WorkloadDashboard.tsx]
- [x] [Review][Decision] **Audit logger mismatch** — Spec says use `@ultranos/audit-logger`. Code uses local `reportWorkloadAuditEvent` from `audit-client.ts`. The local helper is used by 31 other services. Should this story use the shared package or follow the established local pattern? [UnavailabilityToggle.tsx, WorkloadDashboard.tsx]
- [x] [Review][Decision] **Self-service unavailability inaccessible to techs** — AC 3/AC 5 say any tech can mark themselves unavailable, but the dashboard is gated to SUPERVISOR+. Spec says "Self-service toggle in sidebar or profile for individual techs." Where should this toggle live for LAB_TECH users? [UnavailabilityToggle.tsx]

#### Patch

- [x] [Review][Patch] **CRITICAL: `reportWorkloadAuditEvent` does not exist** — Both `WorkloadDashboard.tsx` and `UnavailabilityToggle.tsx` import `reportWorkloadAuditEvent` from `@/lib/audit-client`, but this function is not defined or exported from that module. Build will fail. Tests mask this with `vi.mock`. [WorkloadDashboard.tsx:13, UnavailabilityToggle.tsx:6, audit-client.ts]
- [x] [Review][Patch] **CRITICAL: Missing Dexie schema + helper functions** — `workload-service.ts` imports `putWorkloadSnapshot`, `getWorkloadSnapshotsByDateRange`, `getOpenAvailabilityForTech`, `addTechAvailability`, `closeAvailabilityRecord`, types `TechWorkloadSnapshot`/`TechAvailability` from `./db`, but none exist in `db.ts`. Build will fail. [workload-service.ts, db.ts]
- [x] [Review][Patch] **CRITICAL: Missing sample lock release on reassignment** — AC 2 requires lock release from source tech. `reassignSample()` JSDoc promises it but implementation omits it. `sample-lock-service.ts` has a `releaseLock()` function that should be called. [workload-service.ts:~310]
- [x] [Review][Patch] **HIGH: `getCurrentWorkloads` loads ALL samples into memory** — `db.samples.toArray()` fetches every historical sample. Should filter by active pipeline statuses before loading. On low-resource devices with 30s polling, this causes increasing memory pressure. [workload-service.ts:~88]
- [x] [Review][Patch] **HIGH: Mixed `Date.now()` vs HLC timestamps** — `reassignSample` uses HLC for custody event but `new Date().toISOString()` for sync payload and `reassignedAt`. `markTechUnavailable` uses wall-clock throughout. Sync engine relies on HLC for ordering. [workload-service.ts: multiple]
- [x] [Review][Patch] **HIGH: Concurrent reassignment race — no fromTechId guard** — Two managers can reassign the same sample simultaneously. `db.samples.where('id').equals(sampleId).modify()` doesn't verify the sample is still assigned to `fromTechId`. [workload-service.ts:~310]
- [x] [Review][Patch] **MEDIUM: N+1 TAT override query** — `computeAvgTat()` calls `db.tat_overrides.toArray()` per-tech inside a loop. Should hoist to a single read before the loop. [workload-service.ts:~164]
- [x] [Review][Patch] **MEDIUM: Peak hours UTC/local timezone mismatch** — `getUTCHours()` in service vs `formatHour()` treating hours as local time. Afghanistan (UTC+4:30) peak at local 8 AM shows as "3:00 AM". Use local hours consistently. [workload-service.ts:~264, WorkloadPatterns.tsx:~73]
- [x] [Review][Patch] **MEDIUM: `formatHour` hardcodes English AM/PM** — Not locale-aware. Arabic/Dari users see English time format. Use `Intl.DateTimeFormat` with current locale. [WorkloadPatterns.tsx:~73-77]
- [x] [Review][Patch] **MEDIUM: `SampleList` collapsed preview is dead code** — `visible = expanded ? sampleIds : sampleIds.slice(0, 3)` but list only renders when `expanded === true`. The 3-item preview branch never executes. [TechWorkloadCard.tsx:~148]
- [x] [Review][Patch] **MEDIUM: Self-service toggle stale state** — `setSelectedStatus('BREAK')` then immediate `handleMarkUnavailable()` reads previous `selectedStatus` (React batching). Pass 'BREAK' directly as parameter. [UnavailabilityToggle.tsx:~98-103]
- [x] [Review][Patch] **MEDIUM: No error feedback on failed reassignment** — `handleSampleReassign` swallows all errors silently. Manager gets no feedback when drag-reassign fails. [WorkloadDashboard.tsx:~152-160]
- [x] [Review][Patch] **MEDIUM: `MetricPill` hides value from screen readers** — `aria-hidden="true"` on the numeric count means assistive tech users can't hear workload numbers. [TechWorkloadCard.tsx:~64]
- [x] [Review][Patch] **MEDIUM: Audit event format doesn't match spec** — Spec says `{ action: 'UPDATE', resourceType: 'SAMPLE_ASSIGNMENT', detail: {...} }`. Code uses `{ action: 'SAMPLE_REASSIGNED', sampleId, ... }` (flat structure, wrong action). [WorkloadDashboard.tsx, workload-service.ts]
- [x] [Review][Patch] **LOW: `aria-dropeffect` is deprecated in ARIA 1.1** — Remove or replace with modern ARIA patterns. [TechWorkloadCard.tsx:~105]
- [x] [Review][Patch] **MEDIUM: Drag-leave flicker on child boundaries** — `handleDragLeave` unconditionally sets `isDragOver=false`. When dragging over child elements (metric pills, spans), the browser fires dragleave/dragenter pairs causing the drop-target ring to flicker. Fix with `e.relatedTarget` check or drag counter. [TechWorkloadCard.tsx:~106-108]
- [x] [Review][Patch] **MEDIUM: `inFlightRef` stuck after unmount blocks first fetch on remount** — If `getCurrentWorkloads` is in-flight when the dashboard unmounts, cleanup sets `cancelledRef=true` but `inFlightRef` stays `true` (resolved in the `finally` block after unmount). On remount, `fetchWorkloads` returns early due to `inFlightRef.current === true` until the next 30s tick. [WorkloadDashboard.tsx:~117-145]
- [x] [Review][Patch] **MEDIUM: No `isSelf` guard on unavailability toggle** — `UnavailabilityToggle` renders for every tech card visible to SUPERVISOR+. A SUPERVISOR can mark any tech unavailable via the self-service button, but AC 3/AC 5 say only a tech can mark themselves or a manager can mark anyone. Need `isSelf` check to restrict self-service path. [WorkloadDashboard.tsx:~201, UnavailabilityToggle.tsx]
- [x] [Review][Patch] **MEDIUM: `reason` state variable never populated** — `UnavailabilityToggle` has `const [reason, setReason] = useState('')` but no input field calls `setReason`. Managers can't provide custom reasons. Always falls back to translated status label. [UnavailabilityToggle.tsx:~33]
- [x] [Review][Patch] **LOW: No server-side auth guard on workload page** — `page.tsx` renders `WorkloadDashboard` directly with no route-level auth. Client-side `useRequireLabRole` fires after render, causing a flash for unauthorized users. [workload/page.tsx]
- [x] [Review][Patch] **LOW: Tab buttons lack ARIA tab semantics** — Missing `role="tab"`, `aria-selected`, `role="tablist"`. [WorkloadDashboard.tsx:~211-225]

#### Deferred

- [x] [Review][Defer] **Missing i18n keys for 51.2 in locale files** — `en.json` has a `workload` namespace from Story 48.1 but not the 51.2-specific keys (dashboard, pending, inProgress, etc.). Needs keys in all 5 locales. [messages/{en,ar,prs,ps,fa}.json] — deferred, incomplete deliverable
- [x] [Review][Defer] **Missing AppSidebar navigation item** — No "Workload" link added to sidebar. Users can't navigate to the dashboard. [AppSidebar.tsx] — deferred, incomplete deliverable
- [x] [Review][Defer] **Touch/tablet DnD fallback** — HTML5 DnD doesn't work on mobile touch. Spec suggests fallback "Reassign" button. [TechWorkloadCard.tsx] — deferred, spec acknowledges as future
- [x] [Review][Defer] **Tech name lookup from staff registry** — `techLabelFor()` shows truncated ID. Production should look up from Story 42.1 staff registry. [WorkloadDashboard.tsx:~290] — deferred, spec acknowledges
- [x] [Review][Defer] **Sample urgency not displayed** — Data Minimization Rule says "sample ID and urgency only" but only ID is shown. [TechWorkloadCard.tsx] — deferred, minor data gap

### References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 51, Story 51.2 (line 6309)
- Story 42.1 (RBAC): `_bmad-output/implementation-artifacts/42-1-role-based-access-control.md`
- Story 42.3 (Sample Accessioning): `_bmad-output/implementation-artifacts/42-3-sample-accessioning-chain-of-custody.md`
- Story 51.3 (Sample Collision): `_bmad-output/implementation-artifacts/51-3-sample-collision-prevention.md`
- Dashboard components: `apps/lab-lite/src/components/dashboard/`
- Dexie schema: `apps/lab-lite/src/lib/db.ts`
