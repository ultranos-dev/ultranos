# Story 46.7: Personal Quality Streak & Achievement System

Status: review

## Story

As a solo lab technician,
I want to see my quality streaks and achievements,
so that I have evidence I'm doing good work even when nobody else sees it.

## Context

Solo lab technicians work without feedback loops — no colleagues, no supervisor present, no recognition. This story creates a personal quality dashboard that tracks quality streaks (consecutive passing QC days, zero-rejection streaks), training completion, and monthly quality metrics. Milestone achievements award digital badges visible in the tech's professional profile. The system is explicitly self-reinforcement, not competitive — no leaderboards, no comparisons. Streaks reset with explanation and encouragement, not punishment.

Quality data is derived from existing QC history (Epic 43), sample rejection data (Story 42.3), and training completion records (Story 46.2). The system integrates with the certification pathway (Story 46.6) and the tech's professional portfolio.

**PRD Requirements:** FR46 (brainstorm #107)
**Dependencies:** Epic 43 (QC data source), Story 42.3 (rejection data), Story 46.2 (training completions), Story 46.6 (certification integration)

## Acceptance Criteria

1. [x] Given a tech is working alone, when they view their quality dashboard, then they see: current QC streak (consecutive passing days), zero rejection streak (days without a rejected sample), training modules completed this quarter, and monthly quality metrics (e.g., hemoglobin CV%).
2. [x] Milestone achievements award digital badges visible in their professional profile.
3. [x] The system is self-reinforcement, not competitive — no leaderboard for solo techs.
4. [x] Streaks reset with explanation, not punishment.
5. [x] All UI is RTL-compatible and i18n-ready.
6. [x] No patient data appears in quality metrics — only aggregate statistics.

## Tasks / Subtasks

- [x] **Task 1: Quality Streak Data Model & Dexie Schema** (AC: 1, 2)
  - [x] Create `apps/lab-lite/src/lib/quality-streak-types.ts` with:
    ```
    QualityStreak {
      id: string
      technicianId: string
      streakType: 'qc_passing' | 'zero_rejection'
      currentStreak: number        // consecutive days
      longestStreak: number        // all-time best
      lastResetAt: string | null   // when the streak last broke
      lastResetReason: string | null  // human-readable explanation
      updatedAt: string
    }
    ```
  - [x] Define `QualityMetric` type:
    ```
    {
      id: string
      technicianId: string
      metricType: string           // e.g., 'hemoglobin_cv', 'turnaround_time', 'rejection_rate'
      period: string               // e.g., '2026-05' (monthly)
      value: number
      unit: string                 // e.g., '%', 'minutes', 'count'
      trend: 'improving' | 'stable' | 'declining'
      updatedAt: string
    }
    ```
  - [x] Define `Badge` type:
    ```
    {
      id: string
      name: string                 // e.g., "7-Day QC Streak", "30 Zero Rejections"
      description: string
      icon: string                 // icon identifier or base64 image
      category: 'streak' | 'training' | 'quality' | 'milestone'
      requirement: {
        type: 'streak_days' | 'count' | 'metric_threshold'
        streakType?: string
        target: number
      }
    }
    ```
  - [x] Define `EarnedBadge` type:
    ```
    {
      id: string
      technicianId: string
      badgeId: string
      earnedAt: string
      syncStatus: 'pending' | 'synced'
    }
    ```
  - [x] Update `apps/lab-lite/src/lib/db.ts` — add Dexie tables:
    - `quality_streaks` table: `&id, technicianId, streakType, [technicianId+streakType]`
    - `quality_metrics` table: `&id, technicianId, metricType, period, [technicianId+period]`
    - `badges` table: `&id, category`
    - `earned_badges` table: `&id, technicianId, badgeId, earnedAt, syncStatus`

- [x] **Task 2: Streak Calculation Engine** (AC: 1, 4)
  - [x] Create `apps/lab-lite/src/lib/streak-calculator.ts`.
  - [x] Implement `calculateQCStreak(technicianId: string): Promise<QualityStreak>`:
    - Query QC result history (Epic 43 Dexie tables).
    - Count consecutive calendar days where all QC results were passing (within acceptable limits).
    - If a QC failure is found, reset streak to 0 and record `lastResetReason`: "QC result out of range on [date] for [test category]".
  - [x] Implement `calculateRejectionStreak(technicianId: string): Promise<QualityStreak>`:
    - Query sample rejection history (Story 42.3 Dexie tables).
    - Count consecutive calendar days with zero rejected samples.
    - On reset, record `lastResetReason`: "Sample rejected on [date]: [rejection reason]".
  - [x] Update `longestStreak` if `currentStreak` exceeds it.
  - [x] **Reset framing:** When a streak resets, the UI displays: "Your [streak type] streak was [N] days. Here's what happened: [reason]. You're starting fresh — let's build it back!"

- [x] **Task 3: Monthly Quality Metrics Calculator** (AC: 1)
  - [x] Create `apps/lab-lite/src/lib/quality-metrics-calculator.ts`.
  - [x] Implement `calculateMonthlyMetrics(technicianId: string, period: string): Promise<QualityMetric[]>`:
    - **Hemoglobin CV%:** Calculate coefficient of variation from QC data for hemoglobin controls.
    - **Turnaround time:** Average time from sample receipt to result authorization.
    - **Rejection rate:** Rejected samples / total samples received as percentage.
    - **Training completion rate:** Modules completed / modules available this quarter.
  - [x] Calculate `trend` by comparing current period to previous period: improving (value better), stable (within 5% change), declining (value worse).
  - [x] Store metrics in Dexie.

- [x] **Task 4: Badge System** (AC: 2, 3)
  - [x] Create `apps/lab-lite/src/lib/badge-definitions.ts` — define the initial badge set:
    - **Streak badges:** 7-Day QC Streak, 30-Day QC Streak, 90-Day QC Streak, 7-Day Zero Rejections, 30-Day Zero Rejections.
    - **Training badges:** First Module Completed, 5 Modules Completed, 10 Modules Completed, All Modules Completed.
    - **Quality badges:** CV% Below 3% for 3 Months, Zero Rejection Month, Perfect Quality Quarter.
    - **Milestone badges:** First Certification Milestone (ties to Story 46.6).
  - [x] Create `apps/lab-lite/src/lib/badge-evaluator.ts`.
  - [x] Implement `evaluateBadges(technicianId: string): Promise<EarnedBadge[]>` — check all badge requirements against current data, return newly earned badges.
  - [x] Badge evaluation runs after each streak update and metric calculation.
  - [x] **Non-competitive framing:** All badge descriptions use personal achievement language ("You achieved...", "Your dedication..."), never comparative language.

- [x] **Task 5: Quality Dashboard** (AC: 1, 2, 3, 4, 5)
  - [x] Create `apps/lab-lite/src/components/quality/QualityDashboard.tsx`.
  - [x] **Streaks section:** Display current QC streak and zero rejection streak with:
    - Large number display with flame/star icon.
    - Longest streak record below.
    - If streak recently reset: encouraging reset message with reason.
  - [x] **Monthly metrics section:** Display current month's metrics as cards:
    - Each metric shows value, unit, and trend arrow (up/down/dash).
    - Mini sparkline chart showing last 6 months trend (optional, use a lightweight chart library or SVG).
  - [x] **Training section:** Modules completed this quarter with progress toward quarterly goal.
  - [x] **Badges section:** Grid of earned badges with names and earned dates. Unearned badges shown as greyed-out silhouettes with progress hints.
  - [x] Ensure no leaderboard, no comparison to other techs, no ranking.

- [x] **Task 6: Badge Display in Profile** (AC: 2)
  - [x] Create `apps/lab-lite/src/components/quality/BadgeShowcase.tsx` — compact badge display for embedding in the tech's profile/settings page.
  - [x] Show earned badges with icons and earned dates.
  - [x] Integrate into the existing settings/profile page.

- [x] **Task 7: Integration with Professional Portfolio** (AC: 2)
  - [x] Quality metrics and earned badges sync to Hub as part of the tech's professional development record.
  - [x] Create `apps/lab-lite/src/lib/quality-sync.ts` — sync streaks, metrics, and earned badges to Hub.
  - [x] Badges earned feed into certification pathway (Story 46.6) as evidence of professional growth.

- [x] **Task 8: Page Route & Navigation** (AC: 5)
  - [x] Create `apps/lab-lite/src/app/[locale]/quality/page.tsx`.
  - [x] Add quality dashboard link to `AppSidebar.tsx` navigation.
  - [x] Add all translation keys.
  - [x] Ensure RTL layout compatibility.

- [x] **Task 9: Tests** (AC: 1-4, 6)
  - [x] Unit tests for QC streak calculation: consecutive passing days, reset on failure, longest streak tracking.
  - [x] Unit tests for rejection streak calculation: zero rejection counting, reset with reason.
  - [x] Unit tests for monthly metrics: CV% calculation, trend determination, edge cases (no data).
  - [x] Unit tests for badge evaluation: requirement matching, newly earned detection, idempotency.
  - [x] Component tests for QualityDashboard: streak display, metric cards, badge grid, reset message.
  - [x] Verify no comparative/competitive language in any badge or UI text.
  - [x] RTL snapshot tests.

## Dev Notes

- **Non-competitive framing is a design requirement, not a nice-to-have.** Solo techs often feel isolated and inadequate. A leaderboard or comparison system would be demoralizing, not motivating. Every piece of text should reinforce personal progress. Badge descriptions use "You" language: "You maintained perfect QC for 30 consecutive days."
- **Streak reset messaging** is critical for psychological safety. Resets happen — a QC failure or rejected sample is a normal part of lab work. The reset message must:
  1. Acknowledge the previous achievement: "Your X-day streak was impressive."
  2. Explain what happened: factual, not judgmental.
  3. Encourage restart: "You're starting fresh — let's build it back!"
- **Quality data sources:**
  - QC results: from Epic 43 QC tables in Dexie (QC result history with pass/fail status).
  - Rejection data: from Story 42.3 sample accessioning tables (rejection reasons and timestamps).
  - Training data: from Story 46.2 module_completions table.
  - All data is queried from local Dexie — fully offline-capable.
- **CV% calculation:** Coefficient of Variation = (Standard Deviation / Mean) * 100. Calculated from QC control results for a specific analyte over the month. This is a standard lab quality metric.
- **Badge icons:** Use simple SVG icons or emoji-like symbols. Avoid complex images to keep bundle size small. Icons should be culturally neutral.
- **Sparkline charts:** Optional enhancement. If included, use a lightweight SVG-based approach (no heavy charting library). A simple 6-bar histogram works well for monthly trends.

### Project Structure Notes

New files:
- `apps/lab-lite/src/lib/quality-streak-types.ts`
- `apps/lab-lite/src/lib/streak-calculator.ts`
- `apps/lab-lite/src/lib/quality-metrics-calculator.ts`
- `apps/lab-lite/src/lib/badge-definitions.ts`
- `apps/lab-lite/src/lib/badge-evaluator.ts`
- `apps/lab-lite/src/lib/quality-sync.ts`
- `apps/lab-lite/src/components/quality/QualityDashboard.tsx`
- `apps/lab-lite/src/components/quality/BadgeShowcase.tsx`
- `apps/lab-lite/src/app/[locale]/quality/page.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with quality/badge tables)
- `apps/lab-lite/src/components/AppSidebar.tsx` (add quality dashboard link)
- `apps/lab-lite/src/i18n/locales/en.json` (quality/badge translation keys)
- Settings/profile page (embed BadgeShowcase)

## References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 46, Story 46.7
- QC data source: Epic 43 (QC module)
- Sample rejection data: Story 42.3 (sample accessioning)
- Training completions: Story 46.2 (micro-learning modules)
- Certification pathway: Story 46.6 (badges as milestone evidence)
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`

## File List

### New Files
- `apps/lab-lite/src/lib/quality-streak-types.ts`
- `apps/lab-lite/src/lib/streak-calculator.ts`
- `apps/lab-lite/src/lib/quality-metrics-calculator.ts`
- `apps/lab-lite/src/lib/badge-definitions.ts`
- `apps/lab-lite/src/lib/badge-evaluator.ts`
- `apps/lab-lite/src/lib/quality-sync.ts`
- `apps/lab-lite/src/components/quality/QualityDashboard.tsx`
- `apps/lab-lite/src/components/quality/BadgeShowcase.tsx`
- `apps/lab-lite/src/app/[locale]/quality/page.tsx`
- `apps/lab-lite/src/__tests__/quality-streak-calculator.test.ts`
- `apps/lab-lite/src/__tests__/quality-metrics-calculator.test.ts`
- `apps/lab-lite/src/__tests__/badge-evaluator.test.ts`
- `apps/lab-lite/src/__tests__/quality-dashboard.test.tsx`
- `apps/lab-lite/src/__tests__/__snapshots__/quality-dashboard.test.tsx.snap`

### Modified Files
- `apps/lab-lite/src/lib/db.ts` (added v19 schema: quality_streaks, quality_metrics, badges, earned_badges)
- `apps/lab-lite/src/components/AppSidebar.tsx` (added TrendingUp icon, qualityDashboard nav item)
- `apps/lab-lite/src/components/settings/LabSettingsView.tsx` (integrated BadgeShowcase)
- `apps/lab-lite/messages/en.json` (quality namespace + sidebar.qualityDashboard)
- `apps/lab-lite/messages/ar.json` (quality namespace + sidebar.qualityDashboard)
- `apps/lab-lite/messages/prs.json` (quality namespace + sidebar.qualityDashboard)
- `apps/lab-lite/messages/ps.json` (quality namespace + sidebar.qualityDashboard)
- `packages/ui-kit/src/icons.ts` (added Flame, Trophy, Medal, Gem, Zap to gamification section)

## Dev Agent Record

### Implementation Plan
Implemented following TDD red-green-refactor: wrote failing tests first for each module, then implemented minimal code to pass, then refactored for clarity.

Architecture:
- **Data layer:** Dexie v19 schema with 4 new tables. Pass/fail logic for QC derives from `observedValue` within `[targetMean ± 2*targetSd]` (no explicit status field on QcRun).
- **Calculation layer:** `streak-calculator.ts` uses a 90-day look-back window, groups runs by calendar day, walks backwards to count consecutive passing days. Neutral days (no runs) skip without breaking streaks — correct for labs where instruments may not run daily.
- **Metrics layer:** CV% = (stddev/mean)*100 per LOINC '718-7' hemoglobin runs. Trend uses 5% threshold comparing current vs previous period.
- **Badge layer:** 13 badges across 4 categories. `evaluateBadges()` is idempotent — loads already-earned badge IDs into a Set before checking requirements. Badges qualify via `currentStreak` OR `longestStreak` so historic achievements are preserved after resets.
- **UI layer:** `QualityDashboard.tsx` with `dir="auto"` for RTL, no PHI exposed, no comparative language. `BadgeShowcase.tsx` embedded in settings page.
- **Sync layer:** `quality-sync.ts` non-blocking — network failures silently keep `syncStatus: 'pending'`.

### Completion Notes
- All 48 tests pass: 17 streak calculator + 9 metrics calculator + 12 badge evaluator + 10 dashboard component
- Non-comparative language verified by dedicated test suite scanning all badge names and descriptions
- RTL compatibility confirmed by snapshot test with `dir="auto"` assertion
- Patient data isolation verified by test: patient IDs/references never appear in quality dashboard output
- `Flame` icon added to `packages/ui-kit/src/icons.ts` gamification section (required by QualityDashboard)
- Solo-tech rejection attribution counts all lab rejections globally (not filtered by technicianId) as appropriate for solo-tech environments

### Debug Log
- Test run with pipe-delimited pattern (`quality-streak|quality-metrics|...`) caused "No test files found" error in vitest 1.6.1; resolved by running each file individually
- `Flame` icon missing from `@ultranos/ui-kit/icons` caused `undefined` component error in dashboard tests; fixed by adding `Flame, Trophy, Medal, Gem, Zap` to icons catalog
- Snapshot captured loading state from prior run; updated with `-u` flag after fixing `waitFor` condition in RTL test (was using `toBeDefined()` which passes for `null`)

## Change Log

| Date | Change |
|------|--------|
| 2026-05-31 | Implemented full Story 46.7: quality streak types, Dexie v19 schema, streak calculator, metrics calculator, badge definitions, badge evaluator, QualityDashboard, BadgeShowcase, quality-sync, page route, i18n (4 locales), sidebar nav, settings integration, 48 tests passing |
