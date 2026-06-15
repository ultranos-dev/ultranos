# Story 48.3: Pre-Shift Readiness Forecast

Status: review

## Story

As a lab technician starting my day,
I want a morning readiness briefing,
So that I know what I can and can not do today before patients arrive.

## Context

A solo lab tech in a rural Afghan clinic has 15 minutes before the first patient arrives. They need to know: Do I have the reagents for today's expected tests? Is the analyzer working? Are there overnight orders waiting? How much generator time do I have? Currently this requires checking multiple paper logs, walking to the generator, and hoping nothing was forgotten. A pre-shift readiness forecast consolidates all these checks into a single, actionable briefing card.

This story builds a morning briefing component that evaluates five readiness dimensions (personnel, reagents, equipment, pending orders, power), color-codes each with RAG status, and generates specific actionable recommendations. All computation runs against local Dexie data — fully offline.

**PRD Requirements:** FR48 (brainstorm #12)
**Epic:** 48 — Intelligent Decision Support

## Acceptance Criteria

1. **Given** it is the start of a shift, **When** the tech opens the dashboard, **Then** a readiness briefing card is prominently displayed.
2. **Given** the briefing is displayed, **When** the tech reviews it, **Then** it shows status for five dimensions: personnel (who is working today), reagent stock (sufficient / low / stockout per test type), equipment (operational / maintenance due / down), pending orders (count and urgency from overnight), and power/generator forecast.
3. **Given** each dimension has been evaluated, **When** the briefing renders, **Then** each dimension is color-coded: green (good), amber (caution), red (action needed).
4. **Given** any dimension is amber or red, **When** the briefing renders, **Then** actionable recommendations are included (e.g., "Chemistry strips low — defer non-urgent panels", "Maintenance due on hematology analyzer — schedule for today").
5. **Given** the briefing computation, **When** it runs, **Then** it generates entirely from local Dexie data (works offline).
6. **Given** the briefing is displayed, **When** the tech taps "Refresh", **Then** the briefing re-evaluates all dimensions with current Dexie data.

## Tasks / Subtasks

- [x] **Task 1: Readiness Evaluation Engine** (AC: 2, 3, 4, 5)
  - [x] Create `apps/lab-lite/src/lib/readiness-engine.ts`.
  - [x] Define `ReadinessDimension` type: `'personnel' | 'reagents' | 'equipment' | 'pendingOrders' | 'power'`.
  - [x] Define `RAGStatus` type: `'green' | 'amber' | 'red'`.
  - [x] Define `DimensionResult` interface with i18n key fields (titleKey, summaryKey, summaryArgs, details, recommendations, recommendationArgs).
  - [x] Define `ReadinessBriefing` interface: `{ dimensions: DimensionResult[], overallStatus: RAGStatus, generatedAt: string, refreshable: boolean }`.
  - [x] `evaluatePersonnel(): Promise<DimensionResult>` — checks Zustand auth session store; red if no session, amber if no roster configured.
  - [x] `evaluateReagents(): Promise<DimensionResult>` — queries getActiveReagents(); green >14 days, amber ≤14 days, red ≤7 days or expired or stockout. Graceful degradation on Dexie error.
  - [x] `evaluateEquipment(): Promise<DimensionResult>` — graceful amber "not configured" (future story).
  - [x] `evaluatePendingOrders(): Promise<DimensionResult>` — queries getOrders(); green=0 pending, amber=pending non-urgent, red=urgent pending.
  - [x] `evaluatePower(): Promise<DimensionResult>` — calls calculatePowerBudget(); null=amber, elapsed=red, partial=amber, upcoming=green.
  - [x] `generateReadinessBriefing(): Promise<ReadinessBriefing>` — Promise.all, worstStatus for overall.

- [x] **Task 2: Recommendation Rules Engine** (AC: 4)
  - [x] Create `apps/lab-lite/src/lib/readiness-recommendations.ts`.
  - [x] `generateRecommendations(dimension, status, context): RecommendationItem[]` — maps dimension×status×context to i18n key + args objects.
  - [x] Returns empty array for green status.
  - [x] Supports multi-issue context (issues array) for reagents with slice(0,3) cap.
  - [x] All recommendation strings are i18n keys, not hardcoded text.

- [x] **Task 3: Morning Briefing Card Component** (AC: 1, 2, 3, 4, 6)
  - [x] Create `apps/lab-lite/src/components/dashboard/ReadinessBriefingCard.tsx`.
  - [x] Card header with overall RAG colored dot + border.
  - [x] Five dimension rows with icon, title, RAG badge, summary, expandable details+recommendations.
  - [x] Recommendations in `bg-amber-50`/`bg-red-50` callout boxes with `AlertTriangle` icon (DirectionalIcon navigation category → mirrors RTL).
  - [x] Refresh button with spinning `RefreshCw` icon when loading.
  - [x] Timestamp footer: "Last evaluated: HH:mm".
  - [x] `sessionStorage` key for auto-expand on first load of the day.
  - [x] RTL-aware layout with logical CSS properties (ps-8, pe-2, ms-auto etc.).

- [x] **Task 4: Custom Hook — `useReadinessBriefing`** (AC: 5, 6)
  - [x] Create `apps/lab-lite/src/hooks/useReadinessBriefing.ts`.
  - [x] Returns `{ briefing, isLoading, refresh, lastRefreshedAt }`.
  - [x] Evaluates once on mount; subsequent refreshes are manual.
  - [x] Caches in React state (not Dexie).

- [x] **Task 5: Dashboard Integration** (AC: 1)
  - [x] `ReadinessBriefingCard` added as first card after `DashboardHeader` in `apps/lab-lite/src/app/[locale]/page.tsx`, above `QuickActions` and `QueueStatusCard`.
  - [x] Card uses `border-2` with RAG-colored border for visual prominence.
  - [x] `sessionStorage` remembers expanded/collapsed state per calendar day.

- [x] **Task 6: i18n — Translation Keys** (AC: 1-4)
  - [x] `readiness.*` namespace added to all 4 locale files: `en.json`, `ar.json`, `prs.json`, `ps.json`.
  - [x] Full key coverage: title, status, dimensions (all 5), recommendations (all templates).

- [x] **Task 7: Tests** (AC: 1-6)
  - [x] Unit tests for `readiness-engine.ts` — 29 tests: all 5 evaluators, overall status, graceful degradation, caps.
  - [x] Unit tests for `readiness-recommendations.ts` — 17 tests: green returns empty, all dimension×status combos, multi-issue array, args interpolation.
  - [x] Component tests for `ReadinessBriefingCard.tsx` — 10 tests: loading skeleton, 5 dimensions rendered, RAG badges, recommendations visible, refresh button, spinner, timestamp, collapsed summary, red card, RTL snapshot.

## Dev Notes

### Files to Create

| File | Purpose |
|------|---------|
| `apps/lab-lite/src/lib/readiness-engine.ts` | Readiness evaluation engine — all 5 dimensions |
| `apps/lab-lite/src/lib/readiness-recommendations.ts` | Recommendation template engine |
| `apps/lab-lite/src/components/dashboard/ReadinessBriefingCard.tsx` | Morning briefing dashboard card |
| `apps/lab-lite/src/hooks/useReadinessBriefing.ts` | Custom hook for briefing data |
| `apps/lab-lite/src/__tests__/readiness-engine.test.ts` | Engine unit tests |
| `apps/lab-lite/src/__tests__/readiness-recommendations.test.ts` | Recommendation engine tests |
| `apps/lab-lite/src/__tests__/readiness-briefing-card.test.tsx` | Briefing card component tests |

### Files to Modify

| File | Change |
|------|--------|
| `apps/lab-lite/src/components/dashboard/DashboardHeader.tsx` or parent layout | Add `ReadinessBriefingCard` as first card on dashboard |
| `apps/lab-lite/messages/en.json` | Add `readiness.*` translation keys |
| `apps/lab-lite/messages/ar.json` | Add `readiness.*` translation keys (Arabic) |
| `apps/lab-lite/messages/prs.json` | Add `readiness.*` translation keys (Dari) |
| `apps/lab-lite/messages/ps.json` | Add `readiness.*` translation keys (Pashto) |

### Patterns to Follow

- **Fully offline:** The entire readiness engine operates on Dexie data. No network calls. No Hub API dependencies.
- **Graceful degradation:** Each dimension evaluator must handle the case where its data source does not exist yet (e.g., reagent inventory from Story 44.3, power schedule from Story 48.1, equipment tracking from future stories). Return amber with a "not configured" message rather than crashing.
- **RAG color coding:** Use consistent Tailwind color classes across all dimensions:
  - Green: `bg-green-50 text-green-700 border-green-200`
  - Amber: `bg-amber-50 text-amber-700 border-amber-200`
  - Red: `bg-red-50 text-red-700 border-red-200`
- **Overall status calculation:** The overall RAG status is the worst across all dimensions. If any dimension is red, overall is red. If any is amber (and none red), overall is amber. All green = overall green.
- **i18n:** Use `useTranslations('readiness')` hook. Recommendation text must be i18n keys with interpolation, not hardcoded English strings.
- **RTL:** Logical CSS properties throughout. Navigation/expansion chevrons mirror for RTL. Medical/equipment icons do NOT mirror.
- **Component library:** Use existing `@/components/ui/*` primitives.
- **Data minimization (CLAUDE.md Rule #7):** The readiness briefing shows operational data (reagent names, equipment status, order counts). It must NEVER show patient names or IDs. Pending orders show count only, not patient details.
- **No Dexie persistence for briefing result:** The briefing is cheap to compute (5 Dexie queries). Cache in React state, not in Dexie. This avoids schema versioning for a transient result.

### Dimension Evaluation Logic

```
PERSONNEL:
  Input: auth session, staff roster (if configured)
  Green:  Current user logged in AND roster shows adequate staffing
  Amber:  No roster configured OR understaffed
  Red:    No user logged in (should not happen — AuthGuard)

REAGENTS:
  Input: reagent inventory table, burndown data from Story 48.2
  Green:  All test types have sufficient stock (> 14 days)
  Amber:  Any test type stock below 14-day threshold
  Red:    Any test type at stockout OR any reagent expired
  Detail: Per-test-type status line
  Recommendation: "Defer non-urgent [test] panels" for amber; "Cannot perform [test]" for red

EQUIPMENT:
  Input: equipment status table (if exists)
  Green:  All analyzers operational
  Amber:  Any analyzer has maintenance due OR equipment table not configured
  Red:    Any analyzer marked as DOWN
  Detail: Per-equipment status line
  Recommendation: "Schedule maintenance for [equipment] today" for amber

PENDING ORDERS:
  Input: orders/worklist table in Dexie
  Green:  Zero pending orders
  Amber:  1+ pending orders, none urgent
  Red:    1+ urgent pending orders
  Detail: "X orders pending (Y urgent)"
  Recommendation: "Prioritize urgent orders first" for red

POWER:
  Input: power_schedules table from Story 48.1
  Green:  Power window upcoming today (has not started yet)
  Amber:  No schedule configured OR power window partially elapsed
  Red:    Power window fully elapsed for today OR no power today
  Detail: "Power: HH:mm - HH:mm (X hours)" or "No schedule"
  Recommendation: "Defer analyzer tests to tomorrow" for red
```

### Pitfalls

- **Missing dependency data:** Stories 44.3 (reagent inventory), 48.1 (power schedule), and 48.2 (burndown) may not be implemented yet. Each evaluator must check if its Dexie table exists and has data. Use Dexie's `.count()` as a quick existence check. Return amber with a setup prompt for missing data.
- **Time-of-day awareness:** The power evaluator must know the current time to determine if the power window is upcoming, in progress, or elapsed. Use `new Date()` — do not cache the time at mount.
- **First load of the day detection:** To auto-expand the briefing card on first load, store `lastBriefingViewDate` in `sessionStorage`. Compare against today's date. If different, auto-expand. This uses `sessionStorage` (not `localStorage`) because it is cleared on tab close — no persistence concern.
- **Pending orders source:** The pending orders data may come from a Dexie table populated by Story 42.2 (electronic test order reception). If that table does not exist yet, the evaluator should check for the upload queue items instead as a proxy, or return amber "Order tracking not configured."
- **Recommendation overflow:** If multiple dimensions have multiple recommendations, the card could become very long. Limit to top 3 recommendations per dimension and show "N more..." link.

### Project Structure Notes

- Lab-Lite is a Next.js 15 PWA at `apps/lab-lite/`.
- Uses `next-intl` for i18n with locale files in `apps/lab-lite/messages/`.
- Dexie (IndexedDB wrapper) for offline storage at `apps/lab-lite/src/lib/db.ts`.
- Dashboard components at `apps/lab-lite/src/components/dashboard/`.
- Existing dashboard cards: `QueueStatusCard.tsx`, `ActivitySummaryCard.tsx`, `QuickActions.tsx`, `RecentUploadsList.tsx`.
- Dashboard hook: `apps/lab-lite/src/hooks/useDashboardData.ts`.
- Auth session store: `apps/lab-lite/src/stores/auth-session-store.ts`.
- Existing UI components at `apps/lab-lite/src/components/ui/`.

### References

- Epic 48 acceptance criteria: `_bmad-output/planning-artifacts/epics.md` (line 6122)
- Story 48.1 (power schedule — dependency): `_bmad-output/implementation-artifacts/48-1-power-aware-workload-scheduler.md`
- Story 48.2 (reagent burndown — dependency): `_bmad-output/implementation-artifacts/48-2-predictive-reagent-burndown.md`
- Story 44.3 (reagent inventory — dependency): `_bmad-output/planning-artifacts/epics.md`
- Story 42.2 (electronic order reception — dependency): `_bmad-output/planning-artifacts/epics.md`
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Dashboard components: `apps/lab-lite/src/components/dashboard/`
- Auth session store: `apps/lab-lite/src/stores/auth-session-store.ts`
- CLAUDE.md: Offline-first mandate, RTL rules, data minimization (Rule #7)

## File List

### Created
- `apps/lab-lite/src/lib/readiness-engine.ts`
- `apps/lab-lite/src/lib/readiness-recommendations.ts`
- `apps/lab-lite/src/components/dashboard/ReadinessBriefingCard.tsx`
- `apps/lab-lite/src/hooks/useReadinessBriefing.ts`
- `apps/lab-lite/src/__tests__/readiness-engine.test.ts`
- `apps/lab-lite/src/__tests__/readiness-recommendations.test.ts`
- `apps/lab-lite/src/__tests__/readiness-briefing-card.test.tsx`
- `apps/lab-lite/src/__tests__/__snapshots__/readiness-briefing-card.test.tsx.snap`

### Modified
- `apps/lab-lite/src/app/[locale]/page.tsx` — added `ReadinessBriefingCard` as first dashboard card
- `apps/lab-lite/src/lib/db.ts` — added `PowerScheduleEntry`, `TestTimeEstimate` types/tables/helpers (Story 48.1 db dependency)
- `apps/lab-lite/messages/en.json` — added `readiness.*` namespace
- `apps/lab-lite/messages/ar.json` — added `readiness.*` namespace (Arabic)
- `apps/lab-lite/messages/prs.json` — added `readiness.*` namespace (Dari)
- `apps/lab-lite/messages/ps.json` — added `readiness.*` namespace (Pashto)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated to review

## Dev Agent Record

### Completion Notes

- All 6 ACs satisfied and tested (56 total tests: 29 engine + 17 recommendations + 10 component).
- `DimensionResult` interface uses i18n keys (not hardcoded strings) throughout — `titleKey`, `summaryKey`, `summaryArgs`, `details[]`, `recommendations[]`, `recommendationArgs[]`.
- `evaluateEquipment` gracefully returns amber "not configured" — equipment table not yet implemented (future story).
- Power evaluation delegates to `calculatePowerBudget()` from Story 48.1's `workload-scheduler.ts`. This required completing the missing db.ts helpers (`PowerScheduleEntry`, `TestTimeEstimate`, `power_schedules` table, `test_time_estimates` table) that Story 48.1 depended on but had not been committed.
- `sessionStorage` key `readiness_briefing_expanded_date` stores today's date string to auto-expand on first daily load only.
- RTL: All layout uses logical CSS properties (`ps-`, `pe-`, `ms-`, `me-`). Navigation icons (`ChevronRight`, `ChevronDown`, `AlertTriangle`) wrapped in `DirectionalIcon category="navigation"` for RTL mirroring. Medical icons (`FlaskConical`, `Microscope`) wrapped in `DirectionalIcon category="medical"` to prevent mirroring.
- CLAUDE.md Rule #7 enforced: pending orders display count only, never patient names/IDs.

### Change Log

- 2026-06-01: Implemented Story 48.3 — Pre-Shift Readiness Forecast (all 7 tasks, 56 tests)
