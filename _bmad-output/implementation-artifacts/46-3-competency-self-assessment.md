# Story 46.3: Competency Self-Assessment & Skill Decay Detection

Status: ready-for-dev

## Story

As a lab technician,
I want the system to track which procedures I perform regularly and alert me when skills may be decaying,
so that I can proactively refresh techniques I haven't practiced recently.

## Context

Solo lab technicians may go weeks or months without performing certain procedures, leading to skill decay that can compromise result quality. This story creates an automated competency tracking system that monitors procedure frequency from the tech's result history, detects decay based on configurable thresholds, and presents a competency dashboard with green/yellow/red status indicators. The dashboard serves both the tech (professional self-awareness) and optionally their supervisor (for support planning, not punitive oversight).

Competency data feeds into the certification pathway (Story 46.6) and integrates with the micro-learning trigger engine (Story 46.2) to prompt refreshers when decay is detected.

**PRD Requirements:** FR46 (brainstorm #34)
**Dependencies:** Story 42.4 (Result Templates — procedure history source), Story 46.2 (Micro-learning triggers)

## Acceptance Criteria

1. [ ] Given a tech has a history of test procedures performed, when a procedure hasn't been performed in >45 days (configurable), then the system surfaces a gentle notification: "You haven't performed [procedure] in [N] days. Would you like to review the technique?"
2. [ ] The tech's competency dashboard shows: procedures performed regularly (green), procedures with decay risk (yellow), procedures not performed in >90 days (red).
3. [ ] The dashboard is visible to the tech themselves (for professional pride) and optionally to their supervisor (for support planning).
4. [ ] Competency records feed into the certification pathway (Story 46.6).
5. [ ] All UI is RTL-compatible and i18n-ready.
6. [ ] No patient data appears anywhere in competency tracking — only procedure types and frequencies.

## Tasks / Subtasks

- [ ] **Task 1: Competency Data Model & Dexie Schema** (AC: 1, 2)
  - [ ] Create `apps/lab-lite/src/lib/competency-types.ts` with:
    ```
    ProcedureCompetency {
      id: string
      technicianId: string
      procedureRef: string         // LOINC code
      procedureName: string
      lastPerformedAt: string | null  // ISO 8601
      totalPerformed: number
      performedLast90Days: number
      status: 'active' | 'decay_risk' | 'decayed'  // green, yellow, red
      decayThresholdDays: number   // configurable per procedure, default 45
      redThresholdDays: number     // configurable, default 90
      updatedAt: string
    }
    ```
  - [ ] Define `CompetencySnapshot` type for historical tracking:
    ```
    {
      id: string
      technicianId: string
      snapshotDate: string
      procedures: { procedureRef: string, status: string, daysSinceLast: number | null }[]
      syncStatus: 'pending' | 'synced'
    }
    ```
  - [ ] Update `apps/lab-lite/src/lib/db.ts` — add Dexie tables:
    - `procedure_competencies` table: `&id, technicianId, procedureRef, status, [technicianId+procedureRef]`
    - `competency_snapshots` table: `&id, technicianId, snapshotDate, syncStatus`

- [ ] **Task 2: Procedure Frequency Tracker** (AC: 1, 2)
  - [ ] Create `apps/lab-lite/src/lib/competency-tracker.ts`.
  - [ ] Implement `updateCompetencyFromResult(technicianId: string, procedureRef: string, procedureName: string, performedAt: string): Promise<void>` — called after each result entry to update frequency data.
  - [ ] Implement `recalculateAllCompetencies(technicianId: string): Promise<ProcedureCompetency[]>` — scans result history and recalculates all competency statuses.
  - [ ] Status calculation logic:
    - **Green (active):** Last performed within `decayThresholdDays` (default 45 days).
    - **Yellow (decay_risk):** Last performed between `decayThresholdDays` and `redThresholdDays` (default 45-90 days).
    - **Red (decayed):** Last performed >  `redThresholdDays` ago OR never performed.
  - [ ] Generate daily `CompetencySnapshot` for historical trend tracking.

- [ ] **Task 3: Decay Notification System** (AC: 1)
  - [ ] Create `apps/lab-lite/src/lib/decay-notifier.ts`.
  - [ ] Implement `checkForDecayNotifications(technicianId: string): Promise<DecayNotification[]>`.
  - [ ] Return notifications for procedures that have transitioned from green to yellow since last check.
  - [ ] Notification text: "You haven't performed [procedureName] in [N] days. Would you like to review the technique?"
  - [ ] Link notification to relevant micro-learning module (Story 46.2) if one exists.
  - [ ] Notifications are dismissible and do not re-trigger until the next status transition.

- [ ] **Task 4: Competency Dashboard** (AC: 2, 3, 5)
  - [ ] Create `apps/lab-lite/src/components/competency/CompetencyDashboard.tsx`.
  - [ ] Display all tracked procedures in a grid/list with color-coded status indicators:
    - Green badge: "Active — performed [N] days ago"
    - Yellow badge: "Decay risk — [N] days since last"
    - Red badge: "Needs refresh — [N]+ days since last" or "Never performed"
  - [ ] Include procedure name, last performed date, total count, and last-90-days count.
  - [ ] Sort: red first, then yellow, then green (most urgent at top).
  - [ ] Add trend indicator: improving (up arrow), stable (dash), declining (down arrow) based on snapshot history.

- [ ] **Task 5: Supervisor Visibility Toggle** (AC: 3)
  - [ ] Add a setting in the tech's profile: "Share competency dashboard with supervisor" (default: off).
  - [ ] When enabled, competency snapshots sync to Hub with a `supervisorVisible: true` flag.
  - [ ] Supervisor can view aggregated competency data for their team via the Hub (Hub-side implementation deferred to Hub API epic).
  - [ ] The toggle is clearly labeled as opt-in with explanation of what is shared.

- [ ] **Task 6: Dashboard Page Route** (AC: 2, 5)
  - [ ] Create `apps/lab-lite/src/app/[locale]/competency/page.tsx`.
  - [ ] Add competency dashboard link to `AppSidebar.tsx` navigation.
  - [ ] Add all translation keys for competency-related labels.
  - [ ] Ensure RTL layout compatibility.

- [ ] **Task 7: Integration with Result Entry** (AC: 1, 4)
  - [ ] Hook `updateCompetencyFromResult()` into the result save flow (Story 42.4) to automatically update procedure frequency on each result entry.
  - [ ] Run `checkForDecayNotifications()` on app startup and after each competency recalculation.

- [ ] **Task 8: Tests** (AC: 1-4, 6)
  - [ ] Unit tests for competency status calculation: green/yellow/red thresholds, custom thresholds.
  - [ ] Unit tests for decay notification generation: transition detection, no duplicate notifications.
  - [ ] Unit tests for frequency tracking: increment on result entry, recalculation accuracy.
  - [ ] Component tests for CompetencyDashboard: color coding, sorting, trend indicators.
  - [ ] RTL snapshot tests for the dashboard.

## Dev Notes

- **Procedure frequency is derived from result history**, not manually logged. Every time a tech saves a result (Story 42.4), the competency tracker updates automatically. This ensures data accuracy without extra tech effort.
- **Configurable thresholds per procedure:** Some procedures (e.g., rare specialized tests) may warrant different decay windows. Store thresholds in a config table or per-procedure metadata. Defaults: yellow at 45 days, red at 90 days.
- **No patient data in competency tracking:** Competency records contain only procedure references (LOINC codes), counts, and timestamps. No sample IDs, patient refs, or result values.
- **Snapshot frequency:** Generate one snapshot per day (on first app open of the day). Snapshots are lightweight (procedure ref + status only) and used for trend calculation.
- **Supervisor visibility is opt-in** to respect the tech's autonomy and avoid surveillance anxiety. The framing is "support planning" not "performance monitoring."
- **Integration with Story 46.6:** Competency status feeds into certification milestone calculations. A tech with all-green procedures may earn a competency milestone.

### Project Structure Notes

New files:
- `apps/lab-lite/src/lib/competency-types.ts`
- `apps/lab-lite/src/lib/competency-tracker.ts`
- `apps/lab-lite/src/lib/decay-notifier.ts`
- `apps/lab-lite/src/components/competency/CompetencyDashboard.tsx`
- `apps/lab-lite/src/app/[locale]/competency/page.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with competency tables)
- `apps/lab-lite/src/components/AppSidebar.tsx` (add competency link)
- `apps/lab-lite/src/i18n/locales/en.json` (competency translation keys)

## References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 46, Story 46.3
- Micro-learning triggers: Story 46.2 (decay detection triggers learning modules)
- Certification pathway: Story 46.6 (competency feeds into milestones)
- Result entry workflow: Story 42.4 (source of procedure frequency data)
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`
