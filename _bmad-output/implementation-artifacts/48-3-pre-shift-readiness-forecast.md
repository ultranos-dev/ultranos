# Story 48.3: Pre-Shift Readiness Forecast

Status: ready-for-dev

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

- [ ] **Task 1: Readiness Evaluation Engine** (AC: 2, 3, 4, 5)
  - [ ] Create `apps/lab-lite/src/lib/readiness-engine.ts`.
  - [ ] Define `ReadinessDimension` type: `'personnel' | 'reagents' | 'equipment' | 'pendingOrders' | 'power'`.
  - [ ] Define `RAGStatus` type: `'green' | 'amber' | 'red'`.
  - [ ] Define `DimensionResult` interface: `{ dimension: ReadinessDimension, status: RAGStatus, title: string, summary: string, details: string[], recommendations: string[] }`.
  - [ ] Define `ReadinessBriefing` interface: `{ dimensions: DimensionResult[], overallStatus: RAGStatus, generatedAt: string, refreshable: boolean }`.
  - [ ] `evaluatePersonnel(): Promise<DimensionResult>` — checks Dexie for today's scheduled staff (from settings/roster if available). If no roster data exists, returns amber with recommendation "Set up staff roster in Settings." For MVP: check if current user is logged in = green, else red.
  - [ ] `evaluateReagents(): Promise<DimensionResult>` — queries reagent inventory (from Story 44.3 / Story 48.2 burndown data). For each test type: sufficient stock = green, stock below 14-day threshold = amber, stock below 7-day threshold or expired = red. Details list each test type with status. Recommendations for amber/red items (e.g., "Chemistry strips low — defer non-urgent chemistry panels").
  - [ ] `evaluateEquipment(): Promise<DimensionResult>` — queries equipment status from Dexie (if equipment tracking table exists from future stories). For MVP: if no equipment data, return amber "Equipment tracking not configured." If equipment data exists: all operational = green, maintenance due = amber, any down = red.
  - [ ] `evaluatePendingOrders(): Promise<DimensionResult>` — queries Dexie for pending/received orders not yet processed. Count total, count urgent. 0 pending = green, any pending = amber, any urgent pending = red. Details: "X orders pending (Y urgent)."
  - [ ] `evaluatePower(): Promise<DimensionResult>` — queries power schedule from Story 48.1. If no schedule configured: amber "No power schedule set." If schedule set: green if power window has not started yet (upcoming), amber if partially elapsed, red if power window has passed for today.
  - [ ] `generateReadinessBriefing(): Promise<ReadinessBriefing>` — runs all five evaluations, computes overall status (worst of all dimensions), returns complete briefing.

- [ ] **Task 2: Recommendation Rules Engine** (AC: 4)
  - [ ] Create `apps/lab-lite/src/lib/readiness-recommendations.ts`.
  - [ ] Define recommendation templates keyed by dimension + status + context:
    - **Reagents amber:** "{{reagentName}} stock low ({{daysRemaining}} days remaining) — defer non-urgent {{testType}} panels"
    - **Reagents red:** "{{reagentName}} STOCKOUT — cannot perform {{testType}}. Contact supplier: {{supplierName}}"
    - **Equipment amber:** "Maintenance due on {{equipmentName}} — schedule maintenance for today"
    - **Equipment red:** "{{equipmentName}} is DOWN — {{affectedTests}} tests unavailable until repaired"
    - **Pending orders red:** "{{urgentCount}} URGENT orders from overnight — prioritize these first"
    - **Power amber:** "Power window {{percentElapsed}}% elapsed — {{remainingMinutes}} minutes remaining for analyzer tests"
    - **Power red:** "No remaining power for today — defer all analyzer-dependent tests to tomorrow"
    - **Personnel amber:** "Staff roster not configured — set up in Settings for accurate readiness"
  - [ ] `generateRecommendations(dimension: ReadinessDimension, status: RAGStatus, context: Record<string, unknown>): string[]` — fills templates with context data. Returns empty array for green status.
  - [ ] All recommendation strings are i18n keys, not hardcoded text.

- [ ] **Task 3: Morning Briefing Card Component** (AC: 1, 2, 3, 4, 6)
  - [ ] Create `apps/lab-lite/src/components/dashboard/ReadinessBriefingCard.tsx`.
  - [ ] Card header: "Pre-Shift Readiness" with overall RAG indicator (colored dot or border).
  - [ ] Five dimension rows, each showing:
    - Icon (medical/operational — do NOT mirror medical icons per CLAUDE.md)
    - Dimension label
    - RAG status badge: green pill = "Ready", amber pill = "Caution", red pill = "Action Needed"
    - Summary text (one line)
    - Expandable detail section (click to reveal details + recommendations)
  - [ ] Recommendations section: each recommendation in a distinct callout box with:
    - Amber recommendations: `bg-amber-50 border-amber-200 text-amber-800`
    - Red recommendations: `bg-red-50 border-red-200 text-red-800`
    - Action icon (arrow or chevron — DOES mirror for RTL)
  - [ ] Refresh button: re-runs `generateReadinessBriefing()` and updates UI. Shows loading spinner during computation.
  - [ ] Timestamp footer: "Last evaluated: HH:mm" using device local time.
  - [ ] Collapsed state: shows overall RAG + one-line summary ("3 of 5 dimensions ready"). Expanded by default on first dashboard load of the day.
  - [ ] RTL-aware layout (logical CSS properties throughout).

- [ ] **Task 4: Custom Hook — `useReadinessBriefing`** (AC: 5, 6)
  - [ ] Create `apps/lab-lite/src/hooks/useReadinessBriefing.ts`.
  - [ ] On mount: calls `generateReadinessBriefing()` from the engine.
  - [ ] Returns `{ briefing: ReadinessBriefing | null, isLoading: boolean, refresh: () => void, lastRefreshedAt: Date | null }`.
  - [ ] Auto-refresh: evaluates once on mount. Subsequent refreshes are manual (user taps Refresh button).
  - [ ] Caches the briefing result in component state (not Dexie — it is cheap to recompute).

- [ ] **Task 5: Dashboard Integration** (AC: 1)
  - [ ] Add `ReadinessBriefingCard` as the FIRST card on the lab dashboard, above `QueueStatusCard` and `ActivitySummaryCard`.
  - [ ] The briefing card should be visually prominent — slightly larger, with a distinct border or background.
  - [ ] On the first dashboard load of each calendar day, auto-expand the briefing. On subsequent loads, remember collapsed/expanded state in `sessionStorage` (not `localStorage` — no PHI, just UI preference).

- [ ] **Task 6: i18n — Translation Keys** (AC: 1-4)
  - [ ] Add `readiness` namespace to all locale files (`en.json`, `ar.json`, `prs.json`, `ps.json`) in `apps/lab-lite/messages/`.
  - [ ] Keys: `readiness.title`, `readiness.overallReady`, `readiness.overallCaution`, `readiness.overallActionNeeded`, `readiness.dimensions.personnel.*`, `readiness.dimensions.reagents.*`, `readiness.dimensions.equipment.*`, `readiness.dimensions.pendingOrders.*`, `readiness.dimensions.power.*`, `readiness.recommendations.*`, `readiness.refresh`, `readiness.lastEvaluated`.

- [ ] **Task 7: Tests** (AC: 1-6)
  - [ ] Unit tests for `readiness-engine.ts`:
    - `evaluateReagents`: green when all stocked, amber when any below 14-day threshold, red when any at stockout or expired.
    - `evaluatePendingOrders`: green when zero, amber when pending, red when urgent pending.
    - `evaluatePower`: amber when no schedule set, red when power window passed.
    - `generateReadinessBriefing`: overall status is worst of all dimensions (e.g., 4 green + 1 red = overall red).
  - [ ] Unit tests for `readiness-recommendations.ts`:
    - Returns empty array for green dimensions.
    - Fills templates correctly with context data.
    - Returns multiple recommendations for dimension with multiple issues.
  - [ ] Component tests for `ReadinessBriefingCard.tsx`:
    - Renders all 5 dimensions with correct RAG badges.
    - Expands to show recommendations on click.
    - Refresh button triggers re-evaluation.
    - Renders empty/loading states.
  - [ ] RTL snapshot tests for `ReadinessBriefingCard`.

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
