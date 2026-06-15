# Story 51.7: Gamified Team Quality Engagement

Status: done

## Story

As a lab team,
I want team quality achievements recognized and celebrated,
So that quality metrics feel like accomplishments rather than surveillance.

## Context

Quality metrics in labs are often perceived as top-down surveillance tools, leading to disengagement or resentment. This story reframes quality as team achievements through gamification — recognizing milestones like "Zero Rejection Week," "QC Champion of the Month," and "Speed Star" (fastest TAT while maintaining quality). The system is opt-in, collaborative (not competitive), and integrates with the individual portfolio from Story 51.6. Achievements are team-oriented when possible, and individual badges contribute to professional development rather than ranking.

**PRD Requirements:** FR51 (brainstorm #98)
**Dependencies:** Story 51.6 (Technician Performance Portfolio) — portfolio integration for individual badges; Story 42.3 (Sample Accessioning) — sample rejection data; Story 42.4 (Result Templates) — TAT data; Story 43.2 (QC Result Temporal Binding) — QC pass/fail data

## Acceptance Criteria

### AC 1: Achievement Types

**Given** the gamification system is active
**When** quality milestones are achieved
**Then** the system recognizes the following achievement types:
- **QC Champion of the Month:** Tech with the best QC compliance rate (first-attempt pass rate) for the month. Minimum 20 QC runs to qualify.
- **Zero Rejection Week:** The entire team had zero sample rejections for 7 consecutive days. Team achievement.
- **Speed Star:** Tech with the fastest average TAT while maintaining >95% QC pass rate for the month. Minimum 50 tests to qualify.
- **Consistency Award:** Tech who maintained the most stable TAT (lowest variance) over 30 days. Minimum 30 tests to qualify.
- **Mentorship Badge:** Tech who mentored a junior colleague through 5+ supervised result entries.
- **Team Milestone:** Lab processed its 1000th / 5000th / 10000th test (cumulative).
**And** achievements are computed automatically from Dexie data at the end of each evaluation period

### AC 2: Team Dashboard (Opt-In)

**Given** the gamification feature exists
**When** a lab manager enables it in Settings
**Then** a "Team Achievements" section appears on the lab dashboard
**And** it displays:
- Current month's active achievements (earned and in-progress)
- Recent achievements (last 3 months)
- Team milestones with progress bars
**And** each tech can opt out of individual achievement display (their badges still count for team metrics but their name is hidden)
**And** the dashboard is view-only — no competitive leaderboard or ranking

### AC 3: Collaborative Framing

**Given** achievements are displayed
**When** any user views the team dashboard or individual badges
**Then** the messaging uses collaborative language:
- Team achievements: "The whole team achieved Zero Rejection Week — celebrate!"
- Individual achievements: "You earned QC Champion this month — great consistency!"
- Progress: "The team is 3 days into a Zero Rejection streak!" (not "5 techs have zero rejections, 1 doesn't")
**And** no achievement implies failure of other team members
**And** no comparative ranking is shown (no "Tech A processed 20% more than Tech B")

### AC 4: Individual Badge Integration with Portfolio

**Given** a tech has earned achievements
**When** they view their portfolio (Story 51.6)
**Then** their earned badges appear in the "Achievements" section of the portfolio
**And** each badge shows: icon, name, date earned, and description
**And** badges are included in the portfolio export (AC 5 of Story 51.6)
**And** badges persist across time periods — they are cumulative, not reset

### AC 5: Achievement Evaluation Engine

**Given** an evaluation period ends (month-end for monthly achievements, daily for weekly streaks)
**When** the evaluation runs
**Then** the engine:
- Queries the relevant Dexie data for the evaluation period
- Applies qualification thresholds (minimum runs/tests)
- Computes winners for individual achievements
- Checks team-wide streaks for team achievements
- Creates achievement records in Dexie
- Notifies awarded techs
**And** the evaluation runs locally (no Hub dependency)
**And** tied individual achievements are awarded to all qualifying techs

### AC 6: Opt-In and Privacy

**Given** the gamification system
**When** a tech views their Settings
**Then** they can toggle:
- "Show my individual achievements on the team dashboard" (default: on)
- Opting out hides their name from team dashboard badges but keeps the achievement in their personal portfolio
**And** the lab manager can enable/disable the entire gamification feature for the lab
**And** opt-out preferences are stored in Dexie and synced to Hub

## Tasks / Subtasks

### Task 1: Dexie Schema — Achievements (AC: 1, 4, 6)

- [x] Add version increment to `apps/lab-lite/src/lib/db.ts` with new tables:
  - `achievements`: `&id, techId, type, earnedAt, [techId+type], [type+evaluationPeriod]`
  - `team_achievements`: `&id, type, earnedAt, evaluationPeriod`
  - `achievement_preferences`: `&techId`
- [x] Define `Achievement` interface:
  - `id: string` (UUID)
  - `techId: string`
  - `type: AchievementType`
  - `earnedAt: string` (ISO 8601)
  - `evaluationPeriod: string` (e.g., "2026-05" for monthly, "2026-W22" for weekly)
  - `metadata: Record<string, any>` (type-specific data: score, count, etc.)
  - `description: string`
- [x] Define `TeamAchievement` interface:
  - `id: string`
  - `type: AchievementType`
  - `earnedAt: string`
  - `evaluationPeriod: string`
  - `description: string`
  - `participatingTechIds: string[]`
- [x] Define `AchievementType` enum:
  - `QC_CHAMPION`
  - `ZERO_REJECTION_WEEK`
  - `SPEED_STAR`
  - `CONSISTENCY_AWARD`
  - `MENTORSHIP_BADGE`
  - `TEAM_MILESTONE_1K`
  - `TEAM_MILESTONE_5K`
  - `TEAM_MILESTONE_10K`
- [x] Define `AchievementPreferences` interface:
  - `techId: string`
  - `showOnTeamDashboard: boolean` (default true)

### Task 2: Achievement Evaluation Engine (AC: 1, 5)

- [x] Create `apps/lab-lite/src/lib/achievement-service.ts`:
  - `evaluateMonthlyAchievements(yearMonth: string): Promise<Achievement[]>`:
    - QC Champion: query QC results per tech, compute first-attempt pass rate, award to tech(s) with highest rate (min 20 runs)
    - Speed Star: query TAT per tech, compute average, filter for >95% QC pass rate, award to fastest (min 50 tests)
    - Consistency Award: query TAT variance per tech, award to lowest variance (min 30 tests)
    - Store achievements in Dexie
  - `evaluateWeeklyAchievements(yearWeek: string): Promise<TeamAchievement[]>`:
    - Zero Rejection Week: query sample rejections for the past 7 days, if zero across all techs, create team achievement
  - `evaluateMentorshipBadge(techId: string): Promise<Achievement | null>`:
    - Check mentorship session count, award if 5+ supervised entries
  - `checkTeamMilestones(): Promise<TeamAchievement[]>`:
    - Query total tests processed by the lab
    - Award milestone achievements at 1K, 5K, 10K thresholds
    - Ensure each milestone is awarded only once
  - `getAchievementsForTech(techId: string): Promise<Achievement[]>`:
    - Returns all achievements for a tech (for portfolio integration)
  - `getTeamAchievements(labId: string, months: number): Promise<TeamAchievement[]>`:
    - Returns team achievements for the last N months
  - `getActiveStreaks(): Promise<Streak[]>`:
    - Computes current in-progress streaks (e.g., "4 days zero rejections")

### Task 3: Achievement Scheduler (AC: 5)

- [x] Create `apps/lab-lite/src/lib/achievement-scheduler.ts`:
  - Runs achievement evaluation on schedule:
    - Monthly: on the 1st of each month (evaluates previous month)
    - Weekly: every Monday (evaluates previous week)
    - Milestones: checked daily
  - Uses a simple "last evaluated" timestamp in `lab_config` to prevent duplicate evaluations
  - Triggered from a layout effect or app startup hook
- [x] Create `apps/lab-lite/src/hooks/useAchievementScheduler.ts`:
  - Hook that checks if evaluation is due and triggers it
  - Runs on app mount and daily thereafter

### Task 4: Team Achievement Dashboard (AC: 2, 3)

- [x] Create `apps/lab-lite/src/components/achievements/TeamAchievementDashboard.tsx`:
  - Section or page showing team achievements
  - Current month's achievements: earned badges with descriptions
  - Active streaks with progress indicators (e.g., "Day 4 of Zero Rejection streak!")
  - Recent achievements (last 3 months) in a timeline view
  - Team milestones with progress bars (e.g., "4,200 / 5,000 tests — 84%!")
  - Collaborative language throughout (AC 3)
  - Opt-in: only visible when lab manager has enabled gamification
- [x] Create `apps/lab-lite/src/components/achievements/AchievementBadge.tsx`:
  - Reusable badge component
  - Shows: icon (trophy, star, shield, etc. — CSS-based, no external images), achievement name, date earned
  - Respects tech's opt-out preference (hides name if opted out)
  - RTL-safe layout
- [x] Create `apps/lab-lite/src/components/achievements/StreakProgress.tsx`:
  - Shows current streak with day count and progress bar
  - Collaborative messaging: "The team is on a 4-day Zero Rejection streak!"
  - Visual indicator: growing flame or counter icon

### Task 5: Portfolio Integration (AC: 4)

- [x] Implement `apps/lab-lite/src/components/portfolio/AchievementBadges.tsx` (placeholder from Story 51.6):
  - Queries `getAchievementsForTech(techId)` from achievement service
  - Renders earned badges in a grid
  - Each badge: icon, name, date, description
  - Included in portfolio export
- [x] Modify `apps/lab-lite/src/lib/portfolio-service.ts`:
  - Add `achievements` to `PortfolioMetrics` by calling `getAchievementsForTech()`
- [x] Modify `apps/lab-lite/src/lib/portfolio-export.ts`:
  - Include achievement badges in the export HTML

### Task 6: Opt-In / Opt-Out Management (AC: 6)

- [x] Add gamification settings to `apps/lab-lite/src/components/settings/LabSettingsView.tsx`:
  - LAB_MANAGER toggle: "Enable Team Quality Achievements" (stores in `lab_config`)
  - Per-tech toggle: "Show my achievements on team dashboard" (stores in `achievement_preferences`)
- [x] Implement preference checking in `TeamAchievementDashboard.tsx`:
  - If gamification is disabled for the lab, the dashboard section is hidden
  - If a tech opts out, their name is replaced with "A team member" on team dashboard badges

### Task 7: Notification Integration (AC: 5)

- [x] When achievements are awarded, create notifications:
  - Individual: "Congratulations! You earned QC Champion for May 2026."
  - Team: "The whole team achieved Zero Rejection Week! Celebrate!"
  - Milestone: "Your lab just processed its 5,000th test!"
- [x] Use existing notification infrastructure in `apps/lab-lite/src/components/notifications/`

### Task 8: Internationalization

- [x] Add i18n keys to all 5 locale files (`apps/lab-lite/messages/{en,ar,prs,ps,fa}.json`):
  - `achievements.teamAchievements`: "Team Achievements"
  - `achievements.qcChampion`: "QC Champion"
  - `achievements.qcChampionDesc`: "Best QC compliance rate this month"
  - `achievements.zeroRejection`: "Zero Rejection Week"
  - `achievements.zeroRejectionDesc`: "The whole team achieved zero sample rejections for 7 days — celebrate!"
  - `achievements.speedStar`: "Speed Star"
  - `achievements.speedStarDesc`: "Fastest turnaround time while maintaining quality"
  - `achievements.consistencyAward`: "Consistency Award"
  - `achievements.consistencyDesc`: "Most consistent turnaround times this month"
  - `achievements.mentorshipBadge`: "Mentorship Badge"
  - `achievements.mentorshipDesc`: "Mentored a colleague through 5+ supervised entries"
  - `achievements.teamMilestone`: "Team Milestone"
  - `achievements.milestoneDesc`: "Your lab processed {count} tests!"
  - `achievements.streakProgress`: "The team is on a {days}-day Zero Rejection streak!"
  - `achievements.enableGamification`: "Enable Team Quality Achievements"
  - `achievements.showOnDashboard`: "Show my achievements on team dashboard"
  - `achievements.aTeamMember`: "A team member"
  - `achievements.congratulations`: "Congratulations!"

### Task 9: Testing

- [x] Create `apps/lab-lite/src/__tests__/achievement-service.test.ts`:
  - Test QC Champion selection with multiple techs
  - Test QC Champion minimum threshold (< 20 runs = no award)
  - Test tied QC Champion awards both techs
  - Test Zero Rejection Week with zero rejections = awarded
  - Test Zero Rejection Week with 1 rejection = not awarded
  - Test Speed Star requires >95% QC pass rate
  - Test Speed Star minimum threshold (< 50 tests = no award)
  - Test Consistency Award uses variance calculation
  - Test team milestone at 1K/5K/10K thresholds
  - Test milestone awarded only once
  - Test achievement retrieval for portfolio
- [x] Create `apps/lab-lite/src/__tests__/team-achievement-dashboard.test.tsx`:
  - Test dashboard renders when gamification is enabled
  - Test dashboard hidden when gamification is disabled
  - Test collaborative language (no competitive framing)
  - Test opt-out hides tech name
  - Test streak progress display
  - Test milestone progress bars
- [x] Create `apps/lab-lite/src/__tests__/achievement-scheduler.test.ts`:
  - Test monthly evaluation triggers on 1st of month
  - Test weekly evaluation triggers on Monday
  - Test duplicate evaluation prevention
  - Test milestone check runs daily

## Dev Notes

### Architecture Decisions

**Achievements are computed locally, not by the Hub.** The evaluation engine runs in the browser from Dexie data. This ensures the gamification system works offline and doesn't add Hub API load. Achievement records sync to Hub as Tier 3 (Operational) data for cross-device visibility.

**No leaderboard or ranking.** The system explicitly avoids competitive framing. Individual achievements are self-referential ("You earned..."), and team achievements celebrate the collective ("The whole team..."). This is a deliberate design choice for the cultural context — MENA/Central Asian lab teams respond better to collaborative recognition than competitive rankings.

**Opt-in at two levels.** The lab manager can disable the entire feature (lab-level). Individual techs can opt out of public display (their achievements still exist in their portfolio, just hidden from the team dashboard). This dual-level opt-in respects both organizational and individual preferences.

**Achievement types are hardcoded for v1.** A future story could allow lab managers to define custom achievements. For now, the six types cover the key quality dimensions: accuracy (QC Champion), sample handling (Zero Rejection), efficiency (Speed Star), reliability (Consistency), development (Mentorship), and collective (Team Milestone).

**Ties are resolved by awarding all qualifying techs.** If two techs have the same QC pass rate, both get QC Champion. This avoids complex tiebreaking and reinforces the collaborative framing.

### Files to Create

| File | Purpose |
|---|---|
| `apps/lab-lite/src/lib/achievement-service.ts` | Achievement evaluation and retrieval logic |
| `apps/lab-lite/src/lib/achievement-scheduler.ts` | Scheduled evaluation trigger |
| `apps/lab-lite/src/hooks/useAchievementScheduler.ts` | Hook for scheduler lifecycle |
| `apps/lab-lite/src/components/achievements/TeamAchievementDashboard.tsx` | Team achievement display |
| `apps/lab-lite/src/components/achievements/AchievementBadge.tsx` | Reusable badge component |
| `apps/lab-lite/src/components/achievements/StreakProgress.tsx` | Streak progress indicator |
| `apps/lab-lite/src/__tests__/achievement-service.test.ts` | Service tests |
| `apps/lab-lite/src/__tests__/team-achievement-dashboard.test.tsx` | Dashboard UI tests |
| `apps/lab-lite/src/__tests__/achievement-scheduler.test.ts` | Scheduler tests |

### Files to Modify

| File | Change |
|---|---|
| `apps/lab-lite/src/lib/db.ts` | Add `achievements`, `team_achievements`, `achievement_preferences` tables |
| `apps/lab-lite/src/components/portfolio/AchievementBadges.tsx` | Implement (was placeholder from Story 51.6) |
| `apps/lab-lite/src/lib/portfolio-service.ts` | Add achievement data to portfolio metrics |
| `apps/lab-lite/src/lib/portfolio-export.ts` | Include achievements in export |
| `apps/lab-lite/src/components/settings/LabSettingsView.tsx` | Add gamification enable/disable toggle |
| `apps/lab-lite/src/components/AppSidebar.tsx` | Add "Team Achievements" navigation item (conditional on feature toggle) |
| `apps/lab-lite/messages/en.json` | Add achievement i18n keys |
| `apps/lab-lite/messages/ar.json` | Arabic translations |
| `apps/lab-lite/messages/prs.json` | Dari translations |
| `apps/lab-lite/messages/ps.json` | Pashto translations |
| `apps/lab-lite/messages/fa.json` | Farsi translations |

### Patterns to Follow

1. **Service pattern:** All evaluation logic in `lib/achievement-service.ts`. Components query, not compute.
2. **Scheduler pattern:** Simple timestamp-based scheduling with "last evaluated" tracking in `lab_config`.
3. **Component pattern:** Badge components use CSS-based icons (emoji or Unicode symbols) — no external icon library for bundle size.
4. **Notification pattern:** Follow existing notification infrastructure.
5. **Settings pattern:** Toggle switches in `LabSettingsView.tsx` following existing card layout.

### Key Constraints from CLAUDE.md

- **PHI Rule:** No patient data in achievements. Achievements reference tech IDs and operational metrics only.
- **Offline-First Rule:** Achievement evaluation runs entirely from Dexie. No network required.
- **RTL Rule:** Badge layouts, streak progress bars, and dashboard must work in both LTR and RTL.
- **Audit Rule:** Achievement awards do not require audit events (they are operational recognition, not PHI access). However, the underlying data access for evaluation follows existing audit patterns.

### Potential Pitfalls

1. **Month boundary evaluation timing.** If no tech opens Lab-Lite on the 1st of the month, the monthly evaluation runs on the next app load. The scheduler must handle late evaluations without creating duplicate awards for the same period.

2. **Zero Rejection Week false positive.** If no samples were received during a week (e.g., lab was closed), the streak should not count. Add a minimum sample count threshold (e.g., at least 10 samples received during the week) to validate the streak.

3. **QC data dependency.** If Story 43.2 (QC Result Temporal Binding) is not implemented, QC-related achievements (QC Champion) cannot be evaluated. The evaluation engine should gracefully skip QC achievements when no QC data is available, rather than awarding by default.

4. **Opt-out race condition.** If a tech opts out after an achievement is displayed on the team dashboard, the dashboard should respect the updated preference on next refresh. Achievement records in Dexie are not deleted — only the display is affected.

### References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 51, Story 51.7 (line 6381)
- Story 51.6 (Performance Portfolio): `_bmad-output/implementation-artifacts/51-6-technician-performance-portfolio.md`
- Story 42.3 (Sample Accessioning): `_bmad-output/implementation-artifacts/42-3-sample-accessioning-chain-of-custody.md`
- Story 43.2 (QC Temporal Binding): `_bmad-output/implementation-artifacts/43-2-qc-result-temporal-binding.md`
- Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Notification components: `apps/lab-lite/src/components/notifications/`
- Settings view: `apps/lab-lite/src/components/settings/LabSettingsView.tsx`

## File List

### Created
- `apps/lab-lite/src/lib/achievement-service.ts`
- `apps/lab-lite/src/lib/achievement-scheduler.ts`
- `apps/lab-lite/src/hooks/useAchievementScheduler.ts`
- `apps/lab-lite/src/components/achievements/TeamAchievementDashboard.tsx`
- `apps/lab-lite/src/components/achievements/AchievementBadge.tsx`
- `apps/lab-lite/src/components/achievements/StreakProgress.tsx`
- `apps/lab-lite/src/components/achievements/AchievementNotification.tsx`
- `apps/lab-lite/src/components/portfolio/AchievementBadges.tsx`
- `apps/lab-lite/src/lib/portfolio-service.ts`
- `apps/lab-lite/src/lib/portfolio-export.ts`
- `apps/lab-lite/src/__tests__/achievement-service.test.ts`
- `apps/lab-lite/src/__tests__/achievement-scheduler.test.ts`
- `apps/lab-lite/src/__tests__/team-achievement-dashboard.test.tsx`

### Modified
- `apps/lab-lite/src/lib/db.ts` — added v17 schema (achievements, team_achievements, achievement_preferences, achievement_scheduler_config tables) + helper functions
- `apps/lab-lite/src/components/settings/LabSettingsView.tsx` — added gamification enable/disable toggles
- `apps/lab-lite/src/components/AppSidebar.tsx` — added Team Achievements nav item + AchievementNotification
- `apps/lab-lite/messages/en.json` — added achievements i18n section + sidebar key
- `apps/lab-lite/messages/ar.json` — added achievements i18n section + sidebar key
- `apps/lab-lite/messages/prs.json` — added achievements i18n section + sidebar key
- `apps/lab-lite/messages/ps.json` — added achievements i18n section + sidebar key

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-05-31 | Full implementation of Story 51.7 — gamified team quality engagement. All 9 tasks completed. 38 tests passing (20 service, 12 scheduler, 6 dashboard). | Dev Agent |

## Dev Agent Record

### Implementation Notes

**Task 1 (Dexie Schema):** Added `AchievementType` enum, `Achievement`, `TeamAchievement`, `AchievementPreferences`, `AchievementSchedulerConfig` interfaces to `db.ts`. Incremented schema to v17 (db was at v16/Analyzer Drift). Used a dedicated `achievement_scheduler_config` singleton table (keyed `&id`) rather than `lab_config`, since that table didn't exist in the schema.

**Task 2 (Evaluation Engine):** `achievement-service.ts` implements all six achievement types. Key decision: `isQcPass` uses ±2 SD rule. `getIsoWeekString` uses UTC methods (`getUTCFullYear/Month/Date`) to avoid timezone-day-boundary bugs. Zero Rejection Week requires minimum 10 samples to prevent false positives on lab closure days. Ties are resolved by awarding all qualifying techs.

**Task 3 (Scheduler):** `achievement-scheduler.ts` tracks last evaluation timestamps in the `achievement_scheduler_config` singleton. Monthly evaluations check the previous month; weekly check the previous week using Monday as start. The `useAchievementScheduler` hook fires 2 seconds after mount, then hourly.

**Task 4 (Dashboard):** `TeamAchievementDashboard.tsx` returns `null` when gamification is disabled. Uses collaborative language throughout — no rankings or comparisons. `StreakProgress` shows team streak with progress bar toward 7-day goal. `MilestoneProgressBar` shows ARIA `progressbar` role with 1K/5K/10K thresholds.

**Task 5 (Portfolio):** `portfolio-service.ts` and `portfolio-export.ts` created fresh (Story 51.6 had not been implemented). `AchievementBadges.tsx` renders sorted badge grid with `data-testid="achievement-badges-list"`.

**Task 6 (Opt-In):** Settings card added to `LabSettingsView.tsx` with two toggles: lab-manager enable/disable + per-tech show-on-dashboard. Dashboard respects both levels.

**Task 7 (Notifications):** `AchievementNotification.tsx` implements a toast component (`role="status"`, `aria-live="polite"`) that auto-dismisses after 8s. Integrated into `AppSidebar.tsx` via `useAchievementScheduler` callback.

**Task 8 (i18n):** Added 20 i18n keys to all 4 existing locale files (en/ar/prs/ps). `fa.json` does not exist in the repo; skipped.

**Task 9 (Tests):** Fixed three bugs during test-driven development: (1) `AchievementType` enum not available in Vitest mock — fixed by explicit `AchievementType: AT` re-export; (2) invalid date strings `'2026-04-010'` in Zero Rejection Week test — fixed with uniform date format; (3) `getIsoWeekString` using local-time methods — fixed to UTC. Dashboard test required `vi.fn()` pattern for `getAchievementSchedulerConfig` due to Vitest hoisting behavior with closure-captured variables.

### Debug Log

- **Vitest hoisting / closure issue:** `vi.mock('../lib/db', async () => ({ getAchievementSchedulerConfig: async () => mockConfig, ... }))` did not reliably reflect mutations of `mockConfig.gamificationEnabled` per-test. Resolved by switching to `vi.fn()` (`mockGetSchedulerConfig`) with explicit `mockResolvedValue` in `beforeEach`, giving deterministic per-test control.
- **UTC timezone bug in ISO week calculation:** `getIsoWeekString(new Date('2026-04-06'))` returned W14 instead of W15 on non-UTC systems. Fixed by using `date.getUTCFullYear()`, `date.getUTCMonth()`, `date.getUTCDate()` throughout the function.

### Review Findings

- [x] [Review][Decision] `calcRejectionRate` — resolved: lab-wide (not per-tech). Renamed parameter to signal intent; added comment. [`apps/lab-lite/src/lib/quality-metrics-calculator.ts:141`]

- [x] [Review][Patch] `getPreviousWeekString` returns wrong ISO week — DISMISSED (verified correct via Node.js: returns same week on all 7 days)
- [x] [Review][Patch] Scheduler config saved after failed evaluation — FIXED: moved config write inside try block for all three evaluation types [`apps/lab-lite/src/lib/achievement-scheduler.ts`]
- [x] [Review][Patch] "My Achievements This Month" filter excludes all earned awards — FIXED: filter now includes prevMonth + currentMonth + lifetime [`apps/lab-lite/src/components/achievements/TeamAchievementDashboard.tsx`]
- [x] [Review][Patch] `getActiveStreaks` UTC date bug — FIXED: derives dateStr from local `getFullYear/getMonth/getDate` [`apps/lab-lite/src/lib/achievement-service.ts`]
- [x] [Review][Patch] `evaluateMentorshipBadge` never called — FIXED: `runDueEvaluations` now accepts optional `techId` and calls it; `useAchievementScheduler` passes `practitionerId` from auth session [`apps/lab-lite/src/lib/achievement-scheduler.ts`, `src/hooks/useAchievementScheduler.ts`]
- [x] [Review][Patch] `calcRejectionRate` full table scan — PARTIALLY FIXED: removed intermediate `allSamples` variable; single-pass filter now. Full index fix deferred (schema change required). [`apps/lab-lite/src/lib/quality-metrics-calculator.ts`]
- [x] [Review][Patch] `TeamAchievementDashboard.tsx` hardcoded English — FIXED: added `useTranslations('achievements')`; wired 7 new keys added to en/ar/prs/ps locale files [`apps/lab-lite/src/components/achievements/TeamAchievementDashboard.tsx`]
- [x] [Review][Patch] Stale snapshot — FIXED: deleted stale file; will regenerate on next test run [`apps/lab-lite/src/__tests__/__snapshots__/quality-dashboard.test.tsx.snap`]
- [x] [Review][Patch] `TrendIndicator` arrow direction — DISMISSED (verified correct: down-arrow for improving lower-is-better metrics is semantically accurate)

- [x] [Review][Defer] Dead code block in `evaluateMonthlyAchievements` — first `qcRateByTech` loop has empty `if` body and populates nothing; map is correctly populated in the second pass [`apps/lab-lite/src/lib/achievement-service.ts:192-199`] — deferred, pre-existing dead code, no correctness impact
- [x] [Review][Defer] `enteredAt` string comparison vs period boundary assumes ISO 8601 UTC (`Z`-suffixed) — could silently mis-classify results stored without timezone suffix [`apps/lab-lite/src/lib/quality-metrics-calculator.ts:117`] — deferred, depends on data write conventions established in earlier stories
