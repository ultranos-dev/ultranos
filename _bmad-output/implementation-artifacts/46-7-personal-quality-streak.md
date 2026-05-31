# Story 46.7: Personal Quality Streak & Achievement System

Status: ready-for-dev

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

1. [ ] Given a tech is working alone, when they view their quality dashboard, then they see: current QC streak (consecutive passing days), zero rejection streak (days without a rejected sample), training modules completed this quarter, and monthly quality metrics (e.g., hemoglobin CV%).
2. [ ] Milestone achievements award digital badges visible in their professional profile.
3. [ ] The system is self-reinforcement, not competitive — no leaderboard for solo techs.
4. [ ] Streaks reset with explanation, not punishment.
5. [ ] All UI is RTL-compatible and i18n-ready.
6. [ ] No patient data appears in quality metrics — only aggregate statistics.

## Tasks / Subtasks

- [ ] **Task 1: Quality Streak Data Model & Dexie Schema** (AC: 1, 2)
  - [ ] Create `apps/lab-lite/src/lib/quality-streak-types.ts` with:
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
  - [ ] Define `QualityMetric` type:
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
  - [ ] Define `Badge` type:
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
  - [ ] Define `EarnedBadge` type:
    ```
    {
      id: string
      technicianId: string
      badgeId: string
      earnedAt: string
      syncStatus: 'pending' | 'synced'
    }
    ```
  - [ ] Update `apps/lab-lite/src/lib/db.ts` — add Dexie tables:
    - `quality_streaks` table: `&id, technicianId, streakType, [technicianId+streakType]`
    - `quality_metrics` table: `&id, technicianId, metricType, period, [technicianId+period]`
    - `badges` table: `&id, category`
    - `earned_badges` table: `&id, technicianId, badgeId, earnedAt, syncStatus`

- [ ] **Task 2: Streak Calculation Engine** (AC: 1, 4)
  - [ ] Create `apps/lab-lite/src/lib/streak-calculator.ts`.
  - [ ] Implement `calculateQCStreak(technicianId: string): Promise<QualityStreak>`:
    - Query QC result history (Epic 43 Dexie tables).
    - Count consecutive calendar days where all QC results were passing (within acceptable limits).
    - If a QC failure is found, reset streak to 0 and record `lastResetReason`: "QC result out of range on [date] for [test category]".
  - [ ] Implement `calculateRejectionStreak(technicianId: string): Promise<QualityStreak>`:
    - Query sample rejection history (Story 42.3 Dexie tables).
    - Count consecutive calendar days with zero rejected samples.
    - On reset, record `lastResetReason`: "Sample rejected on [date]: [rejection reason]".
  - [ ] Update `longestStreak` if `currentStreak` exceeds it.
  - [ ] **Reset framing:** When a streak resets, the UI displays: "Your [streak type] streak was [N] days. Here's what happened: [reason]. You're starting fresh — let's build it back!"

- [ ] **Task 3: Monthly Quality Metrics Calculator** (AC: 1)
  - [ ] Create `apps/lab-lite/src/lib/quality-metrics-calculator.ts`.
  - [ ] Implement `calculateMonthlyMetrics(technicianId: string, period: string): Promise<QualityMetric[]>`:
    - **Hemoglobin CV%:** Calculate coefficient of variation from QC data for hemoglobin controls.
    - **Turnaround time:** Average time from sample receipt to result authorization.
    - **Rejection rate:** Rejected samples / total samples received as percentage.
    - **Training completion rate:** Modules completed / modules available this quarter.
  - [ ] Calculate `trend` by comparing current period to previous period: improving (value better), stable (within 5% change), declining (value worse).
  - [ ] Store metrics in Dexie.

- [ ] **Task 4: Badge System** (AC: 2, 3)
  - [ ] Create `apps/lab-lite/src/lib/badge-definitions.ts` — define the initial badge set:
    - **Streak badges:** 7-Day QC Streak, 30-Day QC Streak, 90-Day QC Streak, 7-Day Zero Rejections, 30-Day Zero Rejections.
    - **Training badges:** First Module Completed, 5 Modules Completed, 10 Modules Completed, All Modules Completed.
    - **Quality badges:** CV% Below 3% for 3 Months, Zero Rejection Month, Perfect Quality Quarter.
    - **Milestone badges:** First Certification Milestone (ties to Story 46.6).
  - [ ] Create `apps/lab-lite/src/lib/badge-evaluator.ts`.
  - [ ] Implement `evaluateBadges(technicianId: string): Promise<EarnedBadge[]>` — check all badge requirements against current data, return newly earned badges.
  - [ ] Badge evaluation runs after each streak update and metric calculation.
  - [ ] **Non-competitive framing:** All badge descriptions use personal achievement language ("You achieved...", "Your dedication..."), never comparative language.

- [ ] **Task 5: Quality Dashboard** (AC: 1, 2, 3, 4, 5)
  - [ ] Create `apps/lab-lite/src/components/quality/QualityDashboard.tsx`.
  - [ ] **Streaks section:** Display current QC streak and zero rejection streak with:
    - Large number display with flame/star icon.
    - Longest streak record below.
    - If streak recently reset: encouraging reset message with reason.
  - [ ] **Monthly metrics section:** Display current month's metrics as cards:
    - Each metric shows value, unit, and trend arrow (up/down/dash).
    - Mini sparkline chart showing last 6 months trend (optional, use a lightweight chart library or SVG).
  - [ ] **Training section:** Modules completed this quarter with progress toward quarterly goal.
  - [ ] **Badges section:** Grid of earned badges with names and earned dates. Unearned badges shown as greyed-out silhouettes with progress hints.
  - [ ] Ensure no leaderboard, no comparison to other techs, no ranking.

- [ ] **Task 6: Badge Display in Profile** (AC: 2)
  - [ ] Create `apps/lab-lite/src/components/quality/BadgeShowcase.tsx` — compact badge display for embedding in the tech's profile/settings page.
  - [ ] Show earned badges with icons and earned dates.
  - [ ] Integrate into the existing settings/profile page.

- [ ] **Task 7: Integration with Professional Portfolio** (AC: 2)
  - [ ] Quality metrics and earned badges sync to Hub as part of the tech's professional development record.
  - [ ] Create `apps/lab-lite/src/lib/quality-sync.ts` — sync streaks, metrics, and earned badges to Hub.
  - [ ] Badges earned feed into certification pathway (Story 46.6) as evidence of professional growth.

- [ ] **Task 8: Page Route & Navigation** (AC: 5)
  - [ ] Create `apps/lab-lite/src/app/[locale]/quality/page.tsx`.
  - [ ] Add quality dashboard link to `AppSidebar.tsx` navigation.
  - [ ] Add all translation keys.
  - [ ] Ensure RTL layout compatibility.

- [ ] **Task 9: Tests** (AC: 1-4, 6)
  - [ ] Unit tests for QC streak calculation: consecutive passing days, reset on failure, longest streak tracking.
  - [ ] Unit tests for rejection streak calculation: zero rejection counting, reset with reason.
  - [ ] Unit tests for monthly metrics: CV% calculation, trend determination, edge cases (no data).
  - [ ] Unit tests for badge evaluation: requirement matching, newly earned detection, idempotency.
  - [ ] Component tests for QualityDashboard: streak display, metric cards, badge grid, reset message.
  - [ ] Verify no comparative/competitive language in any badge or UI text.
  - [ ] RTL snapshot tests.

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
