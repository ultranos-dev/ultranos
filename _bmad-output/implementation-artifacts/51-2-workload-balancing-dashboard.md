# Story 51.2: Workload Balancing Dashboard

Status: ready-for-dev

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

### References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 51, Story 51.2 (line 6309)
- Story 42.1 (RBAC): `_bmad-output/implementation-artifacts/42-1-role-based-access-control.md`
- Story 42.3 (Sample Accessioning): `_bmad-output/implementation-artifacts/42-3-sample-accessioning-chain-of-custody.md`
- Story 51.3 (Sample Collision): `_bmad-output/implementation-artifacts/51-3-sample-collision-prevention.md`
- Dashboard components: `apps/lab-lite/src/components/dashboard/`
- Dexie schema: `apps/lab-lite/src/lib/db.ts`
