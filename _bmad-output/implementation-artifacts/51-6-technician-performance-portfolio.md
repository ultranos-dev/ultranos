# Story 51.6: Technician Performance Portfolio

Status: in-progress

## Story

As a lab technician,
I want a professional development portfolio based on my work data,
So that I have objective evidence for annual evaluations and career growth.

## Context

Lab technicians in MENA/Central Asia rarely have objective, data-backed evidence for annual evaluations. This story creates a professional development portfolio that aggregates a tech's work data into meaningful metrics: tests processed per shift, average turnaround time, QC pass rate, sample rejection rate, training modules completed, and mentorship participation. The portfolio is framed as professional development (not surveillance) — the tech always sees their own data, and supervisors view it only with the tech's knowledge for evaluation conversations.

**PRD Requirements:** FR51 (brainstorm #98)
**Dependencies:** Story 42.1 (RBAC) — provides role hierarchy for supervisor view; Story 42.3 (Sample Accessioning) — provides sample processing data; Story 42.4 (Result Templates) — provides result entry data for TAT calculation; Story 51.1 (Shift Handover) — provides shift session data for per-shift metrics; Story 51.7 (Gamified Quality) — integrates badges/achievements into portfolio

## Acceptance Criteria

### AC 1: Portfolio Metrics Dashboard

**Given** a tech has work history in the system
**When** they view their portfolio
**Then** they see the following metrics:
- **Tests per shift:** Average and trend (last 30 shifts), with sparkline or mini chart
- **Average TAT:** Turnaround time from sample receipt to result entry, per test category
- **QC pass rate:** Percentage of QC runs that passed on first attempt
- **Sample rejection rate:** Percentage of samples rejected at accessioning (with breakdown by reason)
- **Training modules completed:** Count and list of completed training (from SOP library, Story 46.1)
- **Mentorship participation:** Count of mentored sessions (junior tech paired with senior)
**And** each metric shows current period (configurable: last 30/60/90 days) and trend direction (improving/stable/declining)

### AC 2: Professional Development Framing

**Given** the portfolio displays performance data
**When** any user views it
**Then** the UI uses professional development language:
- Section header: "Professional Development Portfolio" (not "Performance Report")
- Metrics labeled as "Growth Areas" and "Strengths" (not "Weaknesses" and "Compliance")
- Trend indicators use neutral language: "Improving", "Stable", "Needs Attention" (not "Failing")
- No ranking against other techs — metrics are individual and self-referential
**And** the tone is encouraging and growth-oriented throughout

### AC 3: Self-View (Tech's Own Portfolio)

**Given** any authenticated lab tech
**When** they navigate to their portfolio
**Then** they see their own metrics (AC 1)
**And** they can select the time period (30/60/90 days)
**And** they can view historical snapshots if available
**And** they cannot view other techs' portfolios (unless they are SUPERVISOR+)

### AC 4: Supervisor View

**Given** a user with SUPERVISOR or LAB_MANAGER role
**When** they navigate to staff portfolios
**Then** they see a list of techs in their lab
**And** they can select a tech to view their portfolio
**And** the portfolio view is identical to the self-view (same metrics, same framing)
**And** a banner states: "This portfolio is shared with {tech name} for evaluation discussions"
**And** portfolio access by supervisors is audit-logged

### AC 5: Export for Annual Review

**Given** a portfolio is being viewed (self or supervisor view)
**When** the user taps "Export for Review"
**Then** a PDF or printable document is generated with:
- Tech name, role, lab name
- Date range covered
- All metrics from AC 1 with current values and trends
- Achievements/badges from Story 51.7 (if implemented)
- Space for supervisor comments (blank in export, filled in by hand)
**And** the export is generated locally (no network required)
**And** the export filename includes tech ID and date range (no PHI in filename)

### AC 6: Metric Calculation Accuracy

**Given** raw work data exists in Dexie
**When** portfolio metrics are calculated
**Then** tests per shift = total results entered / total shifts worked (within date range)
**And** average TAT = mean(result_entered_at - sample_received_at) per test category
**And** QC pass rate = QC_passed_first_attempt / total_QC_runs * 100
**And** rejection rate = rejected_samples / total_samples_received * 100
**And** all calculations use only the selected date range
**And** calculations handle edge cases: zero shifts (show "No data"), single data point (show value without trend)

## Tasks / Subtasks

### Task 1: Portfolio Metrics Service (AC: 1, 6)

- [ ] Create `apps/lab-lite/src/lib/portfolio-service.ts`:
  - `calculatePortfolioMetrics(techId: string, dateRange: DateRange): Promise<PortfolioMetrics>`:
    - Queries relevant Dexie tables for the tech's data within date range
    - Computes all six metrics
    - Computes trend direction by comparing current period to previous equal period
    - Returns structured metrics object
  - `getTestsPerShift(techId: string, dateRange: DateRange): Promise<MetricWithTrend>`:
    - Queries shift sessions and result entries
    - Returns average, current period value, trend
  - `getAverageTAT(techId: string, dateRange: DateRange): Promise<TATByCategory[]>`:
    - Groups by test category (LOINC category)
    - Computes mean TAT per category
  - `getQCPassRate(techId: string, dateRange: DateRange): Promise<MetricWithTrend>`:
    - Queries QC results attributed to the tech
    - Computes first-attempt pass rate
  - `getRejectionRate(techId: string, dateRange: DateRange): Promise<MetricWithTrend>`:
    - Queries sample accessioning records
    - Computes rejection percentage with breakdown by reason
  - `getTrainingModules(techId: string): Promise<TrainingModule[]>`:
    - Queries SOP acknowledgments (from Story 46.1 data)
    - Returns list of completed modules
  - `getMentorshipSessions(techId: string, dateRange: DateRange): Promise<number>`:
    - Queries mentorship records (if available, else returns 0)
- [ ] Define `PortfolioMetrics` interface:
  - `techId: string`
  - `dateRange: DateRange`
  - `testsPerShift: MetricWithTrend`
  - `averageTAT: TATByCategory[]`
  - `qcPassRate: MetricWithTrend`
  - `rejectionRate: MetricWithTrend`
  - `trainingModules: TrainingModule[]`
  - `mentorshipCount: number`
  - `calculatedAt: string`
- [ ] Define `MetricWithTrend` interface:
  - `value: number`
  - `unit: string`
  - `trend: 'IMPROVING' | 'STABLE' | 'NEEDS_ATTENTION'`
  - `previousValue: number | null`
  - `dataPoints: number` (count of data points used)

### Task 2: Portfolio Self-View UI (AC: 1, 2, 3)

- [ ] Create `apps/lab-lite/src/components/portfolio/PortfolioDashboard.tsx`:
  - Header: "Professional Development Portfolio" with tech name and role
  - Date range selector: 30 / 60 / 90 days (pill buttons)
  - Metric cards in a responsive grid:
    - Tests per Shift (number + sparkline)
    - Average TAT (table by category)
    - QC Pass Rate (percentage with color indicator)
    - Sample Rejection Rate (percentage with breakdown)
    - Training Modules (count with expandable list)
    - Mentorship (count)
  - Trend indicators: up arrow (green) for improving, dash (neutral) for stable, flag (amber) for needs attention
  - "Export for Review" button
  - Loading skeleton during calculation
- [ ] Create `apps/lab-lite/src/components/portfolio/MetricCard.tsx`:
  - Reusable card for a single metric
  - Shows: metric name, value, unit, trend indicator, mini description
  - Uses professional development language (AC 2)
  - RTL-safe layout
- [ ] Create `apps/lab-lite/src/components/portfolio/TATBreakdown.tsx`:
  - Table showing average TAT per test category
  - Columns: Category, Avg TAT, Trend, Sample Count
  - Sorted by TAT (slowest first for attention)
- [ ] Add route at `apps/lab-lite/src/app/[locale]/portfolio/page.tsx`

### Task 3: Supervisor Portfolio View (AC: 4)

- [ ] Create `apps/lab-lite/src/components/portfolio/StaffPortfolioList.tsx`:
  - List of techs in the supervisor's lab
  - Each entry: tech name, role badge, quick summary (tests/shift, QC rate)
  - Click to view full portfolio
  - Gated to SUPERVISOR+ via `useLabPermission`
- [ ] Modify `PortfolioDashboard.tsx` to accept optional `targetTechId` prop:
  - If viewing another tech's portfolio, show banner: "This portfolio is shared with {tech name} for evaluation discussions"
  - Emit audit event on supervisor access
- [ ] Add supervisor portfolio route or sub-navigation in staff management

### Task 4: Export Functionality (AC: 5)

- [ ] Create `apps/lab-lite/src/lib/portfolio-export.ts`:
  - `exportPortfolio(metrics: PortfolioMetrics, techInfo: TechInfo): Blob`:
    - Generates a printable HTML document (styled for print media)
    - Includes all metrics with values and trends
    - Includes achievement badges placeholder (for Story 51.7 integration)
    - Includes blank "Supervisor Comments" section
    - Returns as Blob for download
  - `getExportFilename(techId: string, dateRange: DateRange): string`:
    - Format: `portfolio_{techId}_{startDate}_{endDate}.html`
    - Uses tech ID, not name (PHI rule)
- [ ] Add print CSS to the export HTML for clean paper output
- [ ] Trigger browser download on "Export for Review" button click

### Task 5: Achievement Integration Placeholder (AC: 1)

- [ ] Add `achievements: Achievement[]` to `PortfolioMetrics` interface
- [ ] Create `apps/lab-lite/src/components/portfolio/AchievementBadges.tsx`:
  - Renders achievement badges from Story 51.7
  - If Story 51.7 is not yet implemented, shows "Achievements coming soon" placeholder
  - Badge display: icon, name, date earned
- [ ] Include in both dashboard view and export

### Task 6: Audit Integration (AC: 4)

- [ ] Emit audit events for:
  - Supervisor views tech portfolio: `{ action: 'READ', resourceType: 'PERFORMANCE_PORTFOLIO', resourceId: targetTechId, detail: { viewedBy: supervisorTechId } }`
  - Portfolio exported: `{ action: 'READ', resourceType: 'PERFORMANCE_PORTFOLIO', resourceId: techId, detail: { exportedBy: viewerTechId, dateRange } }`
- [ ] Self-view does NOT emit audit events (a tech viewing their own data is not a PHI access event)
- [ ] Never include metric values in audit events — only access metadata

### Task 7: Internationalization

- [ ] Add i18n keys to all 5 locale files (`apps/lab-lite/messages/{en,ar,prs,ps,fa}.json`):
  - `portfolio.title`: "Professional Development Portfolio"
  - `portfolio.testsPerShift`: "Tests per Shift"
  - `portfolio.averageTAT`: "Average Turnaround Time"
  - `portfolio.qcPassRate`: "QC Pass Rate"
  - `portfolio.rejectionRate`: "Sample Rejection Rate"
  - `portfolio.trainingModules`: "Training Modules Completed"
  - `portfolio.mentorship`: "Mentorship Participation"
  - `portfolio.improving`: "Improving"
  - `portfolio.stable`: "Stable"
  - `portfolio.needsAttention`: "Needs Attention"
  - `portfolio.exportForReview`: "Export for Review"
  - `portfolio.sharedBanner`: "This portfolio is shared with {name} for evaluation discussions"
  - `portfolio.noData`: "No data available for this period"
  - `portfolio.last30Days`: "Last 30 Days"
  - `portfolio.last60Days`: "Last 60 Days"
  - `portfolio.last90Days`: "Last 90 Days"
  - `portfolio.strengths`: "Strengths"
  - `portfolio.growthAreas`: "Growth Areas"
  - `portfolio.achievements`: "Achievements"

### Task 8: Testing

- [ ] Create `apps/lab-lite/src/__tests__/portfolio-service.test.ts`:
  - Test tests-per-shift calculation with sample data
  - Test average TAT grouped by category
  - Test QC pass rate calculation
  - Test rejection rate with reason breakdown
  - Test trend calculation (improving/stable/needs attention)
  - Test zero-data edge case returns "No data"
  - Test single data point shows value without trend
  - Test date range filtering
- [ ] Create `apps/lab-lite/src/__tests__/portfolio-dashboard.test.tsx`:
  - Test dashboard renders all metric cards
  - Test date range selector updates metrics
  - Test professional development framing (no surveillance language)
  - Test supervisor banner appears when viewing another tech's portfolio
  - Test export button triggers download
  - Test self-view does not emit audit events
  - Test supervisor view emits audit event
- [ ] Create `apps/lab-lite/src/__tests__/portfolio-export.test.ts`:
  - Test export generates valid HTML
  - Test filename uses tech ID, not name
  - Test all metrics included in export
  - Test print CSS applied

## Dev Notes

### Architecture Decisions

**Portfolio metrics are computed on-demand from Dexie data, not pre-aggregated.** This avoids maintaining a separate metrics database. For a 6-tech lab with 90 days of data, the computation is fast enough (sub-second on modern hardware). If performance becomes an issue, periodic aggregation snapshots can be added later.

**Trend calculation compares the current period to the previous equal period.** For a 30-day view, the current 30 days are compared to the prior 30 days. "Improving" = >5% better, "Stable" = within 5%, "Needs Attention" = >5% worse. The 5% threshold avoids noise.

**Export is HTML-based, not PDF.** Generating PDFs in the browser requires heavy libraries (jsPDF, html2canvas). A styled HTML document with `@media print` CSS is lighter, works offline, and produces clean printouts via the browser's print dialog. The tech can "Print to PDF" if they need a PDF file.

**Portfolio data is NOT sensitive PHI — it's practitioner performance data.** However, supervisor access is still audit-logged because it could be used in employment decisions. Self-view is not audited to avoid noise.

### Files to Create

| File | Purpose |
|---|---|
| `apps/lab-lite/src/lib/portfolio-service.ts` | Portfolio metric calculation logic |
| `apps/lab-lite/src/lib/portfolio-export.ts` | Export to printable HTML |
| `apps/lab-lite/src/components/portfolio/PortfolioDashboard.tsx` | Main portfolio view |
| `apps/lab-lite/src/components/portfolio/MetricCard.tsx` | Reusable metric card |
| `apps/lab-lite/src/components/portfolio/TATBreakdown.tsx` | TAT by category table |
| `apps/lab-lite/src/components/portfolio/StaffPortfolioList.tsx` | Supervisor tech list |
| `apps/lab-lite/src/components/portfolio/AchievementBadges.tsx` | Achievement badge display |
| `apps/lab-lite/src/app/[locale]/portfolio/page.tsx` | Portfolio page route |
| `apps/lab-lite/src/__tests__/portfolio-service.test.ts` | Service tests |
| `apps/lab-lite/src/__tests__/portfolio-dashboard.test.tsx` | Dashboard UI tests |
| `apps/lab-lite/src/__tests__/portfolio-export.test.ts` | Export tests |

### Files to Modify

| File | Change |
|---|---|
| `apps/lab-lite/src/components/AppSidebar.tsx` | Add "My Portfolio" navigation item (all roles) |
| `apps/lab-lite/messages/en.json` | Add portfolio i18n keys |
| `apps/lab-lite/messages/ar.json` | Arabic translations |
| `apps/lab-lite/messages/prs.json` | Dari translations |
| `apps/lab-lite/messages/ps.json` | Pashto translations |
| `apps/lab-lite/messages/fa.json` | Farsi translations |

### Patterns to Follow

1. **Service pattern:** Metric calculations in `lib/portfolio-service.ts`. Components call service, not Dexie.
2. **Card pattern:** Follow `dashboard/ActivitySummaryCard.tsx` — rounded border, header, value, description.
3. **Permission gating:** Self-view available to all roles. Staff portfolio list gated to SUPERVISOR+ via `useLabPermission`.
4. **Audit pattern:** Supervisor access audited. Self-view not audited.
5. **Export pattern:** Use `URL.createObjectURL(blob)` + `<a download>` for browser download.

### Key Constraints from CLAUDE.md

- **PHI Rule:** Portfolio data is practitioner performance data, not PHI. However, export filenames must use tech ID, not name. Audit events for supervisor access must not include metric values.
- **Audit Rule:** Supervisor access to portfolios must be audit-logged. Self-view is not audited.
- **Offline-First Rule:** All metrics computed locally from Dexie. Export generated locally.
- **RTL Rule:** Portfolio dashboard, metric cards, and export must work in both LTR and RTL.

### Potential Pitfalls

1. **TAT calculation depends on consistent timestamps.** If sample receipt and result entry timestamps are in different timezones or use different clock sources, TAT calculations may be skewed. Use ISO 8601 timestamps consistently. HLC timestamps from the sync engine provide ordering but not absolute wall-clock duration — use `Date` timestamps for TAT.

2. **Zero-shift edge case.** A new tech with no shifts should see "No data available" rather than NaN or division-by-zero errors. Every metric calculator must handle the zero-data case.

3. **Training modules depend on Story 46.1 (SOP Library).** If not yet implemented, the training section should show a placeholder: "Training tracking will be available when SOP Library is set up."

### References

- Epic definition: `_bmad-output/planning-artifacts/epics.md` — Epic 51, Story 51.6 (line 6366)
- Story 42.1 (RBAC): `_bmad-output/implementation-artifacts/42-1-role-based-access-control.md`
- Story 42.3 (Sample Accessioning): `_bmad-output/implementation-artifacts/42-3-sample-accessioning-chain-of-custody.md`
- Story 51.1 (Shift Handover): `_bmad-output/implementation-artifacts/51-1-shift-handover-protocol.md`
- Story 51.7 (Gamified Quality): `_bmad-output/implementation-artifacts/51-7-gamified-team-quality-engagement.md`
- Story 46.1 (SOP Library): `_bmad-output/implementation-artifacts/46-1-sop-library-offline-acknowledgment.md`
- Dexie schema: `apps/lab-lite/src/lib/db.ts`

### Review Findings

> Code review run: 2026-06-05. Review mode: full (spec provided).
> 1 decision-needed · 7 patch · 1 defer · 0 dismissed

- [ ] [Review][Decision] Self-export audit: should exporting your OWN portfolio emit an audit event? — Task 6 says export always emits; spec note says "self-view does NOT emit audit events". Export is more significant than view but still your own data. [`PortfolioDashboard.tsx`]

- [ ] [Review][Patch] CRITICAL: portfolio-service.ts exports wrong API — dashboard, tests, and MetricCard/TATBreakdown import `calculatePortfolioMetrics`, `FullPortfolioMetrics`, `DateRange`, `TrendDirection`, `TATByCategory`, `getTestsPerShift`, `getAverageTAT`, `getQCPassRate`, `getRejectionRate`, `getTrainingModules`, `getMentorshipSessions` — none exist. Only `buildPortfolioMetrics`/`PortfolioMetrics` exported. TypeScript compile failure. [`apps/lab-lite/src/lib/portfolio-service.ts`]
- [ ] [Review][Patch] CRITICAL: portfolio-export.ts exports wrong API — dashboard and tests import `exportPortfolio`, `getExportFilename`; actual exports are `generatePortfolioHtml`, `downloadPortfolioHtml`. All export tests fail, export button broken. [`apps/lab-lite/src/lib/portfolio-export.ts`]
- [ ] [Review][Patch] CRITICAL (PHI/CLAUDE.md): Export filename uses tech name not tech ID — `portfolio-${techName}-...html` violates "export filenames must use tech ID, not name" rule. [`apps/lab-lite/src/lib/portfolio-export.ts:143`]
- [ ] [Review][Patch] CRITICAL (AC 6): portfolio-service.ts has no DateRange parameter — `buildPortfolioMetrics(techId)` fetches ALL historical data with no date filtering. AC 6 requires date-range-scoped calculations. [`apps/lab-lite/src/lib/portfolio-service.ts:27`]
- [ ] [Review][Patch] AC 2/5: Export document title is "Performance Portfolio" not "Professional Development Portfolio" — both `<title>` and `<h1>` use wrong framing. [`apps/lab-lite/src/lib/portfolio-export.ts:82,97`]
- [ ] [Review][Patch] AC 5: Export HTML missing 3 required items: (1) date range display, (2) Supervisor Comments section, (3) `@media print` CSS. All 3 have corresponding test assertions that will fail. [`apps/lab-lite/src/lib/portfolio-export.ts:78-131`]
- [ ] [Review][Patch] Spec violation: AppSidebar.tsx missing "My Portfolio" nav item — spec requires adding portfolio nav for all roles; diff adds other items but not portfolio. Route `/portfolio` unreachable from sidebar. [`apps/lab-lite/src/components/AppSidebar.tsx`]
- [ ] [Review][Patch] Bug: `totalQcRuns` always returns 0 — comment says "populated above if available" but the QC calculation block never sets it. [`apps/lab-lite/src/lib/portfolio-service.ts:95`]

- [x] [Review][Defer] StaffPortfolioList shows only truncated opaque IDs (e.g. `a3f92b1c…`) instead of tech names — supervisors can't identify techs. Requires a data model decision on where offline-available staff names are stored (practitioner_keys or similar). [`apps/lab-lite/src/components/portfolio/StaffPortfolioList.tsx:588`] — deferred, requires data model decision outside story scope
