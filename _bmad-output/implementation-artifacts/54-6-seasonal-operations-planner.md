# Story 54.6: Seasonal Operations Planner

Status: draft

## Story

As a lab manager preparing for malaria season,
I want a unified seasonal operations plan 30 days ahead of projected demand surges,
so that I can pre-position reagents, adjust staffing, and prepare protocols proactively.

## Acceptance Criteria

1. **Given** historical data shows seasonal demand patterns (e.g., malaria peaks in summer, respiratory infections in winter), **when** the system detects an upcoming surge period, **then** it generates a seasonal operations plan at least 30 days before the projected demand increase.
2. **And** the plan covers four domains: (a) power forecast — solar availability patterns, generator fuel needs based on projected analyzer hours; (b) reagent forecast — projected consumption vs. current stock, expiry risk, and reorder deadlines; (c) staffing forecast — shift adjustments needed based on projected volume; (d) clinical protocol recommendations — priority worklist templates, QC schedule adjustments for high-volume periods.
3. **And** the plan includes actionable deadlines with lead times: "Order RDTs by [date] for bulk pricing", "Pre-position backup stock from [partner lab] by [date]", "Request additional staffing by [date] for [N]-week lead time".
4. **And** the plan is exportable as PDF and shareable with hospital administration.
5. **And** the seasonal planner integrates with predictive reagent burndown from Story 48.2 for consumption projections if available.
6. **And** the seasonal planner can incorporate HMIS data patterns from Story 50.1 for historical demand baselines if available.
7. **And** every plan generation and export emits an audit event via `@ultranos/audit-logger`.
8. **And** the planner works offline from local Dexie data (historical patterns computed from local test history).
9. **And** no PHI appears in seasonal plans — all data is aggregated statistical data (test counts, positivity rates, consumption rates).

## Tasks / Subtasks

- [ ] **Task 1: Seasonal planner type definitions** (AC: 1, 2, 3)
  - [ ] 1.1 Create `apps/lab-lite/src/types/seasonal-planner.ts` defining:
    - `SeasonalDemandPattern` interface: `testCategory` (LOINC category), `monthlyBaseline` (12-element array of average daily test counts by month), `peakMonths` (array of 1-12), `peakMultiplier` (how much demand increases during peak vs baseline), `confidence` ('high' | 'moderate' | 'low' — based on amount of historical data).
    - `SeasonalPlan` interface: `id` (UUID), `planPeriod` (start/end ISO dates), `generatedAt` (HLC timestamp), `generatedBy` (practitioner ID), `status` ('draft' | 'finalized' | 'exported'), `powerForecast` (PowerForecast), `reagentForecast` (ReagentForecast), `staffingForecast` (StaffingForecast), `protocolRecommendations` (ProtocolRecommendation[]), `deadlines` (ActionableDeadline[]), `meta`, `_ultranos`.
    - `PowerForecast` interface: `estimatedAnalyzerHours`, `solarAvailabilityHours` (by month, if solar data available), `generatorFuelNeeded` (liters estimate), `recommendations` (string[]).
    - `ReagentForecast` interface: `items` (array of `{ reagentName, currentStock, projectedConsumption, projectedDepletionDate, expiryDate, reorderDeadline, supplier, estimatedCost? }`).
    - `StaffingForecast` interface: `currentStaffCount`, `projectedDailyTests`, `recommendedStaffCount`, `shiftAdjustments` (string[]), `overtimeHoursEstimate`.
    - `ProtocolRecommendation` interface: `category`, `recommendation`, `priority` ('high' | 'medium' | 'low'), `effectiveDate`.
    - `ActionableDeadline` interface: `action`, `deadlineDate` (ISO date), `leadTimeDays`, `urgency` ('critical' | 'important' | 'routine'), `category` ('reagent' | 'staffing' | 'power' | 'protocol'), `notes`.
  - [ ] 1.2 Export types from `apps/lab-lite/src/types/index.ts`.

- [ ] **Task 2: Dexie schema migration — `seasonal_patterns` and `seasonal_plans` tables** (AC: 1, 8)
  - [ ] 2.1 Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with:
    - `seasonal_patterns`: `&id, testCategory`
    - `seasonal_plans`: `&id, status, generatedAt, [planPeriod.start]`
  - [ ] 2.2 Add typed `Dexie.Table` properties.
  - [ ] 2.3 Add CRUD helpers: `putSeasonalPattern()`, `getAllPatterns()`, `putSeasonalPlan()`, `getRecentPlans()`.

- [ ] **Task 3: Historical demand pattern analysis** (AC: 1, 6)
  - [ ] 3.1 Create `apps/lab-lite/src/lib/demand-analyzer.ts`.
  - [ ] 3.2 `analyzeHistoricalDemand(): Promise<SeasonalDemandPattern[]>` — queries Dexie for all completed test results, groups by LOINC category and month, calculates monthly baselines and identifies peak periods.
  - [ ] 3.3 Minimum data requirement: 6 months of data for 'low' confidence, 12 months for 'moderate', 24+ months for 'high'. If insufficient data, returns patterns with appropriate confidence level and a warning.
  - [ ] 3.4 Integration with Story 50.1 HMIS data: if HMIS monthly reports are available in Dexie, use their aggregate counts to supplement or validate locally computed patterns.
  - [ ] 3.5 `detectUpcomingSurge(patterns: SeasonalDemandPattern[], lookaheadDays?: number): SurgeAlert[]` — scans patterns for peaks within the next N days (default 30), returns alerts with projected impact.

- [ ] **Task 4: 30-day forecast generation** (AC: 1, 2, 3)
  - [ ] 4.1 Create `apps/lab-lite/src/lib/seasonal-forecast.ts`.
  - [ ] 4.2 `generateSeasonalPlan(patterns: SeasonalDemandPattern[], currentInventory: ReagentInventory[], labConfig: LabConfig): Promise<SeasonalPlan>` — generates comprehensive plan covering all four domains.
  - [ ] 4.3 **Power forecast**: estimates analyzer hours based on projected test volume, compares against available power hours (solar + generator). Generates recommendations like "Schedule chemistry batch before 14:00 when solar is available" or "Stock [N] liters of generator fuel for [N] analyzer hours."
  - [ ] 4.4 **Reagent forecast**: for each reagent used by peak-period tests, projects daily consumption using surge multiplier from demand patterns, calculates depletion date, compares against supplier lead times, generates reorder deadlines. Integrates with Story 48.2 predictive burndown if available; falls back to linear projection from pattern multipliers.
  - [ ] 4.5 **Staffing forecast**: projects daily test volume, calculates required staff-hours using configurable tests-per-tech-per-hour rate, compares against current staffing, generates shift adjustment recommendations.
  - [ ] 4.6 **Protocol recommendations**: suggests priority worklist templates for peak pathogens, QC schedule adjustments (e.g., increase QC frequency during high-volume periods), and batch processing optimizations.

- [ ] **Task 5: Actionable deadlines with lead times** (AC: 3)
  - [ ] 5.1 Create `apps/lab-lite/src/lib/deadline-calculator.ts`.
  - [ ] 5.2 `calculateDeadlines(plan: SeasonalPlan): ActionableDeadline[]` — generates deadlines from forecast data:
    - Reagent reorder: deadline = projected depletion date - supplier lead time - safety buffer (7 days default).
    - Staffing request: deadline = surge start - HR lead time (configurable, default 14 days).
    - Power preparation: deadline = surge start - fuel procurement lead time.
    - Protocol update: deadline = surge start - 7 days (time for staff to review updated protocols).
  - [ ] 5.3 Deadlines sorted by urgency and date. Past-due deadlines flagged as critical.
  - [ ] 5.4 Lead times are configurable per lab in settings (supplier delivery times, HR processing times, etc.).

- [ ] **Task 6: Seasonal Planner page** (AC: 1, 2, 3)
  - [ ] 6.1 Create `apps/lab-lite/src/app/[locale]/planner/page.tsx` — seasonal operations planner page.
  - [ ] 6.2 Protected by role: `lab_manager` and `lab_supervisor` only.
  - [ ] 6.3 Layout:
    - Header: "Seasonal Operations Planner" with "Generate New Plan" button.
    - Active plan summary (if exists): plan period, status, generation date.
    - Four domain tabs: Power, Reagents, Staffing, Protocols.
    - Deadlines section: sorted action items with countdown badges.
  - [ ] 6.4 Historical plans list for reference.

- [ ] **Task 7: Power Forecast panel** (AC: 2)
  - [ ] 7.1 Create `apps/lab-lite/src/components/planner/PowerForecastPanel.tsx`.
  - [ ] 7.2 Displays: estimated analyzer hours needed, solar availability (if data available), generator fuel requirements, and recommendations.
  - [ ] 7.3 Visual: simple bar comparison — "Power needed" vs "Power available" with gap analysis.

- [ ] **Task 8: Reagent Forecast panel** (AC: 2, 5)
  - [ ] 8.1 Create `apps/lab-lite/src/components/planner/ReagentForecastPanel.tsx`.
  - [ ] 8.2 Table: reagent name, current stock, projected consumption (30-day), projected depletion date, expiry date (whichever is sooner is highlighted), reorder deadline, estimated cost.
  - [ ] 8.3 Color coding: green (sufficient stock), amber (reorder deadline approaching), red (past reorder deadline or projected stockout within plan period).
  - [ ] 8.4 If Story 48.2 predictive burndown is available, shows the burndown chart data. Otherwise shows linear projection.

- [ ] **Task 9: Staffing Forecast panel** (AC: 2)
  - [ ] 9.1 Create `apps/lab-lite/src/components/planner/StaffingForecastPanel.tsx`.
  - [ ] 9.2 Displays: current staff count, projected daily test volume, recommended staff count, gap analysis, shift adjustment recommendations.
  - [ ] 9.3 Visual: projected volume chart (simple bar or line showing daily volume estimate over the plan period).

- [ ] **Task 10: Protocol Recommendations panel** (AC: 2)
  - [ ] 10.1 Create `apps/lab-lite/src/components/planner/ProtocolRecommendationsPanel.tsx`.
  - [ ] 10.2 List of recommendations with priority badges (high/medium/low), category, effective date, and description.
  - [ ] 10.3 Recommendations include: priority worklist reordering, QC schedule changes, batch processing suggestions.

- [ ] **Task 11: Deadlines section** (AC: 3)
  - [ ] 11.1 Create `apps/lab-lite/src/components/planner/DeadlinesPanel.tsx`.
  - [ ] 11.2 Sorted list of actionable deadlines with: action description, deadline date, countdown ("in 12 days" or "3 days overdue"), category icon, urgency badge (critical=red, important=amber, routine=green).
  - [ ] 11.3 Past-due items pinned to top with "OVERDUE" badge.
  - [ ] 11.4 Each deadline can be marked as "Actioned" (with notes) for tracking.

- [ ] **Task 12: Plan export and sharing** (AC: 4)
  - [ ] 12.1 Create `apps/lab-lite/src/lib/plan-pdf.ts`.
  - [ ] 12.2 `renderPlanPDF(plan: SeasonalPlan): Blob` — generates comprehensive PDF covering all four domains, deadlines, and recommendations. Suitable for printing and sharing with hospital administration.
  - [ ] 12.3 PDF layout: cover page (lab name, plan period, generation date), executive summary, then one section per domain with tables and recommendations, then deadlines appendix.
  - [ ] 12.4 No PHI in the PDF — all data is aggregated statistics.
  - [ ] 12.5 "Export PDF" and "Share" buttons on the planner page.

- [ ] **Task 13: Sidebar navigation update** (AC: 1)
  - [ ] 13.1 Add "Planner" navigation item to `apps/lab-lite/src/components/AppSidebar.tsx`.
  - [ ] 13.2 Show alert badge when a surge is projected within 30 days and no current plan exists.
  - [ ] 13.3 Icon: calendar/planning icon (must NOT mirror in RTL).

- [ ] **Task 14: Planner audit events** (AC: 7)
  - [ ] 14.1 Add audit event types in `apps/lab-lite/src/lib/audit-client.ts`: `SEASONAL_PLAN_GENERATED`, `SEASONAL_PLAN_FINALIZED`, `SEASONAL_PLAN_EXPORTED`, `SEASONAL_DEADLINE_ACTIONED`.
  - [ ] 14.2 All events include `planId`, `actorId`, `timestamp`.

- [ ] **Task 15: Tests** (AC: 1-9)
  - [ ] 15.1 Unit tests for `demand-analyzer.ts`: pattern detection with varying data amounts, confidence levels, surge detection.
  - [ ] 15.2 Unit tests for `seasonal-forecast.ts`: all four domain forecasts, integration with/without Story 48.2 data.
  - [ ] 15.3 Unit tests for `deadline-calculator.ts`: lead time calculations, past-due detection, configurable lead times.
  - [ ] 15.4 Unit tests for plan PDF generation: no PHI validation, all domains covered.
  - [ ] 15.5 Component tests for each forecast panel: data display, color coding, empty states.
  - [ ] 15.6 Component tests for `DeadlinesPanel.tsx`: sorting, countdown display, overdue pinning.
  - [ ] 15.7 Integration test: full demand analysis -> plan generation -> export cycle.
  - [ ] 15.8 Audit event emission assertions for all planner operations.
  - [ ] 15.9 RTL layout tests for planner components.

## Dev Notes

- **Historical demand pattern analysis** uses local Dexie test history to identify seasonal patterns. The algorithm groups completed tests by LOINC category and calendar month, calculates monthly averages, and identifies peak periods. Confidence levels reflect data availability: 6 months = low, 12 months = moderate, 24+ months = high.
- **30-day forecast generation** is the core deliverable. The plan is generated at least 30 days before a projected surge, giving the lab manager time to act on recommendations. The plan covers four cross-domain areas because in rural Afghan labs, the manager is often responsible for all four (no separate facilities, procurement, or HR departments).
- **Cross-domain plan** (power/reagent/staffing/protocol) is unified because these domains are interdependent in resource-constrained labs. Running out of generator fuel affects which tests can be run, which affects reagent consumption, which affects staffing needs.
- **Actionable deadlines with lead times** are the most valuable output for the manager. Each deadline accounts for supplier lead time (e.g., "reagent supplier takes 14 days to deliver, so order by [date]"). Lead times are configurable per lab because they vary by location (Kabul lab vs remote province).
- **Integration with Story 48.2** (predictive burndown): if available, the seasonal planner uses burndown projections for more accurate reagent forecasts. If 48.2 is not yet implemented, the planner falls back to linear projections from historical patterns.
- **Integration with Story 50.1** (HMIS data): if HMIS monthly reports are available, their aggregate test counts supplement locally computed patterns. This is especially useful for new lab installations that lack local history but can reference regional HMIS data.
- **Exportable plan** for hospital administration: the PDF is designed to be printed and handed to a hospital director or provincial health officer. It contains aggregated statistics only — no PHI.

## Project Structure Notes

New files:
- `apps/lab-lite/src/types/seasonal-planner.ts`
- `apps/lab-lite/src/lib/demand-analyzer.ts`
- `apps/lab-lite/src/lib/seasonal-forecast.ts`
- `apps/lab-lite/src/lib/deadline-calculator.ts`
- `apps/lab-lite/src/lib/plan-pdf.ts`
- `apps/lab-lite/src/app/[locale]/planner/page.tsx`
- `apps/lab-lite/src/components/planner/PowerForecastPanel.tsx`
- `apps/lab-lite/src/components/planner/ReagentForecastPanel.tsx`
- `apps/lab-lite/src/components/planner/StaffingForecastPanel.tsx`
- `apps/lab-lite/src/components/planner/ProtocolRecommendationsPanel.tsx`
- `apps/lab-lite/src/components/planner/DeadlinesPanel.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with `seasonal_patterns`, `seasonal_plans` tables)
- `apps/lab-lite/src/lib/audit-client.ts` (planner audit event types)
- `apps/lab-lite/src/components/AppSidebar.tsx` (add Planner nav item)

## References

- Epic 54 definition: `_bmad-output/planning-artifacts/epics.md` (line 6653)
- CLAUDE.md: No PHI in aggregated reports
- Story 48.2: Predictive Reagent Burndown (consumption projections, depletion date calculation, supplier lead times)
- Story 50.1: Auto-Compiled HMIS Monthly Report (historical demand data, aggregate test counts)
- Story 54.5: Outbreak Response Mode (surge multiplier patterns, sitrep format)
- Existing LOINC categories: `apps/lab-lite/src/lib/loinc-categories.ts`
- Existing lab settings: `apps/lab-lite/src/components/settings/LabSettingsView.tsx`
- Existing sidebar: `apps/lab-lite/src/components/AppSidebar.tsx`
- Existing audit client: `apps/lab-lite/src/lib/audit-client.ts`
