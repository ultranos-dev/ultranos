# Story 48.2: Predictive Reagent Burndown

Status: done

## Story

As a lab technician who is also the procurement department,
I want the system to predict when reagents will run out,
So that I can order resupply before a stockout leaves patients unserved.

## Context

In the target environments (Afghanistan, MENA), lab technicians are often solely responsible for procurement. Supplier lead times can be weeks or months. A reagent stockout means patients cannot get tested — there is no backup. Currently, techs track inventory mentally or on paper, often discovering shortages only when they reach for a bottle and find it empty.

This story builds a predictive burndown engine that uses historical consumption data to forecast depletion dates, compares against chemical expiry dates (whichever comes first), factors in configurable supplier lead times, and triggers multi-threshold alerts. It integrates with the reagent inventory system from Story 44.3.

All computation runs locally against Dexie data — fully offline.

**PRD Requirements:** FR48 (brainstorm #11)
**Epic:** 48 — Intelligent Decision Support

## Acceptance Criteria

1. **Given** reagent inventory data is entered (quantity, expiry date), **When** the system has consumption history, **Then** it calculates a projected depletion date based on average daily consumption rate.
2. **Given** a reagent has both a usage-based depletion date and a chemical expiry date, **When** the burndown is calculated, **Then** the effective depletion date is whichever comes first (usage exhaustion OR chemical expiry).
3. **Given** a supplier lead time is configured for a reagent or supplier, **When** the burndown calculates reorder date, **Then** the recommended reorder date is: `effectiveDepletionDate - supplierLeadTimeDays`.
4. **Given** the burndown has been calculated, **When** the dashboard is viewed, **Then** each reagent displays: current stock level, daily consumption rate, projected depletion date, expiry date, and recommended reorder date.
5. **Given** a reagent's effective depletion is within a threshold, **When** alerts are evaluated, **Then** alerts fire at configurable thresholds: 30 days (info), 14 days (warning), 7 days (critical).
6. **Given** the tech views the dashboard, **When** burndown data is rendered, **Then** a visualization shows the burndown trajectory for each reagent.
7. **Given** all computation runs, **When** the engine processes data, **Then** all computation uses local Dexie data only (fully offline).

## Tasks / Subtasks

- [x] **Task 1: Dexie Schema — `reagent_consumption_log` and `supplier_config` Tables** (AC: 1, 3, 7)
  - [x] Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with `reagent_consumption_log` and `supplier_config` tables.
  - [x] Define `ReagentConsumptionEntry` interface: `id` (auto-increment), `reagentId` (string — references reagent inventory from Story 44.3), `loincCode` (string — test that consumed it), `quantityUsed` (number), `unit` (string — mL, strips, tests, etc.), `consumedAt` (string — ISO 8601), `technicianId` (string).
  - [x] Index: `++id, reagentId, loincCode, consumedAt`.
  - [x] Define `SupplierConfig` interface: `id` (auto-increment), `supplierId` (string — UUID), `supplierName` (string), `leadTimeDays` (number), `contactInfo` (string — phone or email), `notes` (string), `updatedAt` (string — ISO 8601).
  - [x] Index: `++id, &supplierId`.
  - [x] Define `ReagentSupplierMapping` interface: `reagentId` (string), `supplierId` (string). Index: `[reagentId+supplierId], reagentId, supplierId`.

- [x] **Task 2: Consumption Rate Calculation Engine** (AC: 1, 2, 7)
  - [x] Create `apps/lab-lite/src/lib/reagent-burndown.ts`.
  - [x] `calculateDailyConsumptionRate(reagentId: string, lookbackDays?: number): Promise<ConsumptionRate>` — queries `reagent_consumption_log` for the lookback window (default 30 days), returns `{ averageDailyUsage, unit, dataPointCount, confidenceLevel }`. Confidence: `high` (>= 14 data points), `medium` (7-13), `low` (< 7).
  - [x] `projectUsageDepletionDate(currentStock: number, dailyRate: number): Date | null` — returns null if rate is 0 (no consumption). Calculates `today + (currentStock / dailyRate)` days.
  - [x] `getEffectiveDepletionDate(usageDepletion: Date | null, expiryDate: Date): { date: Date; reason: 'usage' | 'expiry' }` — returns whichever comes first. If usage depletion is null, returns expiry.
  - [x] `calculateReorderDate(effectiveDepletion: Date, leadTimeDays: number): Date` — subtracts lead time. If reorder date is in the past, return today (already overdue).
  - [x] `evaluateAlertThreshold(effectiveDepletion: Date, today?: Date): AlertLevel` — returns `'none' | 'info' | 'warning' | 'critical'` based on days remaining: > 30 = none, 30 = info, 14 = warning, 7 = critical.

- [x] **Task 3: Burndown Dashboard Component** (AC: 4, 6)
  - [x] Create `apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx`.
  - [x] Summary header: total reagent count, count by alert level (critical / warning / info / ok).
  - [x] Reagent list: each reagent row displays:
    - Reagent name and unit
    - Current stock level (with unit)
    - Daily consumption rate (with confidence indicator: high/medium/low)
    - Projected depletion date (with "usage" or "expiry" reason badge)
    - Chemical expiry date
    - Recommended reorder date
    - Alert badge: color-coded by threshold (green = ok, blue = info/30d, amber = warning/14d, red = critical/7d)
  - [x] Sortable by: alert urgency (default), depletion date, reagent name.
  - [x] Burndown mini-chart per reagent: simple SVG line showing projected stock over next 60 days with a horizontal line at zero. Use inline SVG — no charting library dependency.
  - [x] Empty state: "No reagent inventory configured. Set up inventory in Settings." with link.
  - [x] RTL-aware layout (logical CSS properties). Chart axis labels must flip for RTL.

- [x] **Task 4: Supplier Lead Time Configuration UI** (AC: 3)
  - [x] Create `apps/lab-lite/src/components/scheduler/SupplierConfigPanel.tsx`.
  - [x] CRUD for suppliers: name, lead time (days), contact info, notes.
  - [x] Reagent-to-supplier mapping: assign a default supplier to each reagent.
  - [x] Lead time input: numeric field, minimum 1 day, maximum 365 days.
  - [x] Persist to Dexie `supplier_config` and reagent supplier mapping tables.
  - [x] Accessible from Settings page.
  - [x] i18n via `useTranslations('scheduler')`.

- [x] **Task 5: Alert System Integration** (AC: 5)
  - [x] Create `apps/lab-lite/src/lib/reagent-alert-evaluator.ts`.
  - [x] `evaluateAllReagentAlerts(): Promise<ReagentAlert[]>` — runs burndown for all reagents, returns alerts for any at or below threshold.
  - [x] `ReagentAlert` interface: `reagentId`, `reagentName`, `alertLevel`, `daysRemaining`, `effectiveDate`, `reason` (`usage` | `expiry`), `reorderDate`, `supplierName?`.
  - [ ] ~~Integrate with existing notification components at `apps/lab-lite/src/components/notifications/` — push `ReagentAlert` entries as notification items.~~ **Deferred (P9) — see deferred-work.md**
  - [x] Alert persistence: store last-evaluated alerts in Dexie to avoid re-computing on every render. Re-evaluate on: app open, reagent inventory change, manual refresh.
  - [x] Alert deduplication: do not re-fire an alert for the same reagent at the same threshold level within 24 hours.

- [x] **Task 6: Consumption Logging Hook** (AC: 1)
  - [x] Create `apps/lab-lite/src/hooks/useReagentConsumption.ts`.
  - [x] `logConsumption(reagentId, loincCode, quantityUsed, unit)` — writes to `reagent_consumption_log` in Dexie.
  - [x] This hook is designed to be called from the result entry workflow (Story 42.4) when a test is completed and reagent is consumed. For now, provide the hook and a manual "Log Consumption" action in the burndown UI for techs to record usage.
  - [x] Auto-decrement: when consumption is logged, also update the current stock quantity in the reagent inventory table (from Story 44.3).

- [x] **Task 7: Dashboard Integration** (AC: 4, 6)
  - [x] Add `ReagentBurndownCard` to the lab dashboard.
  - [x] Card shows condensed view: top 3 most urgent reagents. "View All" expands to full list.
  - [x] Dashboard hook: create `apps/lab-lite/src/hooks/useReagentBurndown.ts` — queries Dexie for reagent inventory, consumption logs, supplier configs, runs burndown engine, returns `{ burndownData, alerts, isLoading }`.

- [x] **Task 8: Navigation & Settings Integration** (AC: 3)
  - [x] Add "Supplier Configuration" to the Settings page under the scheduling/procurement section.
  - [x] Route: `/[locale]/settings/suppliers` for supplier CRUD.
  - [x] Link from burndown card "Configure Suppliers" action to settings page.

- [x] **Task 9: i18n — Translation Keys** (AC: 1-6)
  - [x] Add reagent burndown keys under `scheduler.burndown.*` namespace to all locale files (`en.json`, `ar.json`, `prs.json`, `ps.json`).
  - [x] Keys: `scheduler.burndown.title`, `scheduler.burndown.currentStock`, `scheduler.burndown.dailyRate`, `scheduler.burndown.depletionDate`, `scheduler.burndown.expiryDate`, `scheduler.burndown.reorderBy`, `scheduler.burndown.alertInfo`, `scheduler.burndown.alertWarning`, `scheduler.burndown.alertCritical`, `scheduler.burndown.confidence.*`, `scheduler.burndown.reason.*`, `scheduler.supplier.*`.

- [x] **Task 10: Tests** (AC: 1-7)
  - [x] Unit tests for `reagent-burndown.ts`:
    - `calculateDailyConsumptionRate`: correct average with varying data points, confidence levels.
    - `projectUsageDepletionDate`: correct projection, handles zero rate (returns null).
    - `getEffectiveDepletionDate`: picks earlier of usage vs expiry, handles null usage.
    - `calculateReorderDate`: correct subtraction, returns today when overdue.
    - `evaluateAlertThreshold`: correct threshold classification at boundaries (exactly 30, 14, 7 days).
  - [x] Unit tests for `reagent-alert-evaluator.ts`:
    - `evaluateAllReagentAlerts`: returns correct alerts for mixed inventory states.
    - Deduplication: does not re-fire same alert within 24 hours.
  - [x] Component tests for `ReagentBurndownCard.tsx`: renders alert badges, sorts by urgency, shows empty state.
  - [x] Component tests for `SupplierConfigPanel.tsx`: CRUD operations, lead time validation.
  - [x] RTL snapshot tests for `ReagentBurndownCard`, `SupplierConfigPanel`.

### Review Findings

> Code review complete. 0 `decision-needed`, 27 `patch` (26 applied, P9 deferred), 1 `defer` (D1 resolved), 0 dismissed.
> Review date: 2026-06-13. Layers: direct analysis + Blind Hunter + Edge Case Hunter + Acceptance Auditor.
> All patches applied 2026-06-13. P9 (notification panel wiring) deferred to deferred-work.md.

**CRITICAL — Build-breaking (P1–P4):**

- [ ] [Review][Patch] **P1: `reagent-burndown.ts` is a 25-line stub — burndown engine never implemented** — File throws "Story 48.2 not yet implemented" and exports only `getBurndownProjections()` (which also throws). Missing: `calculateDailyConsumptionRate`, `projectUsageDepletionDate`, `getEffectiveDepletionDate`, `calculateReorderDate`, `evaluateAlertThreshold`, `daysUntilDepletion`, `BurndownResult`. Everything in the story imports these; the entire build fails. [`apps/lab-lite/src/lib/reagent-burndown.ts`]
- [ ] [Review][Patch] **P2: `db.ts` missing all new schema additions for this story** — Missing types: `SupplierConfig`, `ReagentSupplierMapping`, `ReagentAlertCache`, `AlertLevel`. Missing Dexie tables: `supplier_config`, `reagent_supplier_mapping`, `reagent_alert_cache`. Missing DB helpers (~12 functions): `getAllSuppliers`, `addSupplier`, `updateSupplier`, `deleteSupplier`, `setReagentSupplier`, `removeReagentSupplier`, `getAllReagentSupplierMappings`, `upsertReagentAlert`, `getAllReagentAlerts`, `getActiveReagentAlerts`, `getConsumptionLogForBurndown`. Every file in this story imports from `./db` and will fail to compile. [`apps/lab-lite/src/lib/db.ts`]
- [ ] [Review][Patch] **P3: `ReagentConsumptionEntry` field names mismatch in `useReagentConsumption`** — Existing DB interface has `testsConsumed`/`loggedAt`/`loggedBy`; the hook writes `quantityUsed`/`consumedAt`/`technicianId` plus `loincCode` and `unit` which don't exist in the schema. TypeScript compile error. [`apps/lab-lite/src/hooks/useReagentConsumption.ts:40-47`, `apps/lab-lite/src/lib/db.ts:245`]
- [ ] [Review][Patch] **P4: Double-decrement of `testsPerformed` in `useReagentConsumption`** — `addReagentConsumptionLog()` already auto-increments `testsPerformed` inside a Dexie transaction; the hook then also calls `updateReagent(reagentId, { testsPerformed: newTests })`. Stock count is corrupted on every consumption log when unit === 'tests'. [`apps/lab-lite/src/hooks/useReagentConsumption.ts:53-59`, `apps/lab-lite/src/lib/db.ts:1824`]

**HIGH — Logic errors (P5–P7):**

- [ ] [Review][Patch] **P5: Alert deduplication (`shouldRefireAlert`) never called inside `evaluateAllReagentAlerts`** — The function exists and is tested but is not invoked during evaluation. Every call re-fires all threshold alerts regardless of the 24-hour window, violating AC5 and the spec's anti-fatigue requirement. [`apps/lab-lite/src/lib/reagent-alert-evaluator.ts:60-131`]
- [ ] [Review][Patch] **P6: Supplier edit regenerates a new `supplierId` UUID, orphaning all reagent-supplier mappings** — `handleSaveSupplier()` always assigns `supplierId: crypto.randomUUID()` even on UPDATE path. All existing `ReagentSupplierMapping` entries pointing to the old UUID become dangling references. [`apps/lab-lite/src/components/scheduler/SupplierConfigPanel.tsx:196`]
- [ ] [Review][Patch] **P7: Supplier delete never cleans up reagent-supplier mapping entries** — `handleDelete(supplier.id!)` is called without a `reagentId` argument at every call site; the optional cleanup branch is never exercised. Orphaned mapping entries remain after supplier deletion. [`apps/lab-lite/src/components/scheduler/SupplierConfigPanel.tsx:214-217, 313`]

**MEDIUM — Missing spec requirements (P8–P9):**

- [ ] [Review][Patch] **P8: `ReagentBurndownCard` never integrated into the lab dashboard (Task 7 incomplete)** — Component is exported but never imported by any dashboard page or layout component. Task 7 requires adding it to the lab dashboard with a condensed 3-item view and "View All" expansion. [`apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx` — no consumers]
- [ ] [Review][Patch] **P9: Notification panel integration missing (Task 5 incomplete)** — Spec requires pushing `ReagentAlert` entries to `apps/lab-lite/src/components/notifications/`. No such integration exists in any of the committed files.

**LOW — Polish/accessibility (P10–P12):**

- [ ] [Review][Patch] **P10: Sort button active state `bg-card text-white` likely fails WCAG contrast** — `bg-card` is a light card surface (oklch semantic token); white text on it will not meet the 4.5:1 contrast ratio for normal text. [`apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx:399`]
- [ ] [Review][Patch] **P11: `isRtl` derived from `locale` prop — always false when prop is absent; should use `useLocale()`** — `const isRtl = locale === 'ar' || locale === 'prs' || locale === 'ps'` evaluates to false when `locale` is undefined. RTL chart and table direction breaks in any context that renders the card without passing `locale`. [`apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx:294`]
- [ ] [Review][Patch] **P12: `useReagentBurndown` duplicates all burndown computation already done by `evaluateAllReagentAlerts`** — Hook calls `evaluateAllReagentAlerts()` then independently re-queries reagents/suppliers/mappings and recomputes all burndown data. 2× Dexie reads and 2× calculation per refresh. [`apps/lab-lite/src/hooks/useReagentBurndown.ts:59-112`]

**NEW — From Blind Hunter layer (P13–P17):**

- [ ] [Review][Patch] **P13: `testsPerformed` has no upper-bound guard — can exceed `expectedTests`, corrupting stock** — `useReagentConsumption` increments `testsPerformed` without checking if it would exceed `expectedTests`. `currentStock = expectedTests - testsPerformed` goes negative; the `Math.max(0, ...)` clamp in the evaluator masks the corruption but doesn't fix the DB state. [`apps/lab-lite/src/hooks/useReagentConsumption.ts:55`]
- [ ] [Review][Patch] **P14: Malformed expiry date silently drops reagent from alerts with no user warning** — `evaluateAllReagentAlerts()` catches invalid expiry dates and `continue`s with no notification. A reagent with a corrupted expiry is invisible to the clinician — a dangerous silent omission in a healthcare context. [`apps/lab-lite/src/lib/reagent-alert-evaluator.ts:82-88`]
- [ ] [Review][Patch] **P15: No `acknowledge()` function in `useReagentBurndown` — alerts can never be dismissed through the hook API** — The hook exposes `cachedAlerts` (filtered to unacknowledged) and `refresh()` but no way to mark an alert acknowledged. Consumers must reach directly into `@/lib/db`, bypassing the abstraction. [`apps/lab-lite/src/hooks/useReagentBurndown.ts`]
- [ ] [Review][Patch] **P16: No debounce on `refresh()` — rapid calls create concurrent `upsertReagentAlert` Dexie writes** — Multiple overlapping `load()` executions can run simultaneously; the `active` flag only prevents stale state updates, not concurrent IndexedDB transactions. `upsertReagentAlert` can race on the same `reagentId`. [`apps/lab-lite/src/hooks/useReagentBurndown.ts:48`]
- [ ] [Review][Patch] **P17: `shouldRefireAlert` doesn't guard against unknown `AlertLevel` values — silent false-negative** — `severity[cached.alertLevel]` returns `undefined` for any corrupted or legacy alert level string; `undefined > number` is always `false`, meaning escalating alerts on corrupted records never refire. [`apps/lab-lite/src/lib/reagent-alert-evaluator.ts:144-145`]

**NEW — From Edge Case Hunter layer (P18–P24):**

- [ ] [Review][Patch] **P18: Stock formula breaks for non-test-unit reagents (mL, strips, bottles)** — `currentStock = expectedTests - testsPerformed` is semantically correct only for reagents tracked by test-count. For mL/strip/bottle units, `expectedTests` is a total capacity in different units, making the burndown projection meaningless. The `unit` field is present but ignored. [`apps/lab-lite/src/lib/reagent-alert-evaluator.ts:75`, `apps/lab-lite/src/hooks/useReagentBurndown.ts:75`]
- [ ] [Review][Patch] **P19: Negative `daysRemaining` causes SVG burndown line to extend outside viewport in RTL** — `BurndownMiniChart` computes `depletionX = Math.min((daysUntilDepletion / WINDOW) * W, W)` which goes negative for overdue reagents; in RTL `endX = W - depletionX > W`, clipped unpredictably by browser. LTR shows a zero-width invisible line for the same case. [`apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx:93, 107`]
- [ ] [Review][Patch] **P20: `Date.now()` in `ReagentRow.daysUntilExpiry` drifts from evaluation-time `now`, causing ±1-day chart marker inconsistency** — `daysUntilExpiry` for the expiry marker recomputes from live `Date.now()` at render time, while `daysRemaining` was computed against a captured `now` constant during evaluation. Near midnight, these can differ by 1 day, shifting the expiry line and potentially misrepresenting the more-urgent date. [`apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx:197`]
- [ ] [Review][Patch] **P21: `getAllReagents` filter is a no-op (`|| true`) — disposed/expired reagents appear in supplier mapping** — `r.filter((r) => r.status === 'ACTIVE' as unknown as string || true)` always returns true. Expired and disposed reagents appear as assignable mapping targets, creating phantom mappings that inflate alert evaluations. [`apps/lab-lite/src/components/scheduler/SupplierConfigPanel.tsx:185`]
- [ ] [Review][Patch] **P22: `getConsumptionLogForBurndown` mocked in tests but doesn't exist in `db.ts`** — Tests mock a function that will need to be added to `db.ts`. Existing alternatives (`getConsumptionLogForReagent`, `getConsumptionLogByDateRange`) use the wrong field names. Tests pass in isolation but the real implementation will fail. [`apps/lab-lite/src/__tests__/reagent-burndown.test.ts:25`]
- [ ] [Review][Patch] **P23: Evaluator tests spread `original` from stub — all tests with reagents in `mockReagents` throw** — `vi.mock('../lib/reagent-burndown', async (importOriginal) => { ...original, calculateDailyConsumptionRate: vi.fn(...) })`: `original` from the stub has `projectUsageDepletionDate` etc. as `undefined`; evaluator's line 79 call throws `TypeError: projectUsageDepletionDate is not a function`. Every test that puts a reagent in `mockReagents` fails. [`apps/lab-lite/src/__tests__/reagent-alert-evaluator.test.ts:38-49`]
- [ ] [Review][Patch] **P24: Timezone rounding in `daysUntilDepletion` can flip alert level within a single day (Afghanistan UTC+4:30)** — `Math.round((effective - now) / 86400000)` drifts by up to 0.5 days. A reagent evaluated at 6am AFT as `warning` (7.5 days) can read as `critical` when re-evaluated at 11pm AFT (6.5 days). Combined with `shouldRefireAlert`'s escalation-always-refires rule, this generates a spurious critical alert. Use floor or ceil consistently, not round. [`apps/lab-lite/src/lib/reagent-burndown.ts` — pending implementation]

**NEW — From Acceptance Auditor layer (P25–P27):**

- [ ] [Review][Patch] **P25: Suppliers settings page has no navigation entry — it is unreachable from the UI** — The route `/settings/suppliers` exists (`apps/lab-lite/src/app/[locale]/(app)/settings/suppliers/page.tsx`) but no link in `LabSettingsView.tsx` or `AppSidebar.tsx` leads to it. Task 8 requires the settings integration; the route alone does not satisfy it. [`apps/lab-lite/src/components/settings/LabSettingsView.tsx`, `apps/lab-lite/src/components/AppSidebar.tsx`]
- [ ] [Review][Patch] **P26: Suppliers settings page missing `BreadcrumbHeader`/`PageHeader` — CLAUDE.md shell violation** — `apps/lab-lite/src/app/[locale]/(app)/settings/suppliers/page.tsx` renders only `<div className="mx-auto max-w-2xl"><SupplierConfigPanel /></div>` with no sticky header. Every page in the shell must include a `BreadcrumbHeader` or `PageHeader` (`h-14`, sticky, `border-b`). [`apps/lab-lite/src/app/[locale]/(app)/settings/suppliers/page.tsx`]
- [ ] [Review][Patch] **P27: `ReagentBurndownCard` empty state is ad-hoc inline markup — must use `EmptyState` from ui-kit** — Lines 305-322 render a custom `<div>` with icon and text for the no-reagents case. CLAUDE.md mandates `<EmptyState icon={...} title="..." description="..." />` from `@ultranos/ui-kit/components/ui/empty-state` for all zero-data states. [`apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx:305-322`]

**DEFERRED:**

- [x] [Review][Defer] **D1: `BurndownProjection.confidenceLevel` uses `'moderate'` not `'medium'` in stub type** [`apps/lab-lite/src/lib/reagent-burndown.ts:16`] — deferred, pre-existing; will be overwritten when P1 is fixed

## Dev Notes

### Files to Create

| File | Purpose |
|------|---------|
| `apps/lab-lite/src/lib/reagent-burndown.ts` | Burndown calculation engine |
| `apps/lab-lite/src/lib/reagent-alert-evaluator.ts` | Multi-threshold alert evaluation |
| `apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx` | Burndown dashboard visualization |
| `apps/lab-lite/src/components/scheduler/SupplierConfigPanel.tsx` | Supplier lead time CRUD |
| `apps/lab-lite/src/hooks/useReagentBurndown.ts` | Dashboard data hook for burndown |
| `apps/lab-lite/src/hooks/useReagentConsumption.ts` | Consumption logging hook |
| `apps/lab-lite/src/__tests__/reagent-burndown.test.ts` | Burndown engine unit tests |
| `apps/lab-lite/src/__tests__/reagent-alert-evaluator.test.ts` | Alert evaluation unit tests |
| `apps/lab-lite/src/__tests__/reagent-burndown-card.test.tsx` | Burndown card component tests |
| `apps/lab-lite/src/__tests__/supplier-config-panel.test.tsx` | Supplier config component tests |

### Files to Modify

| File | Change |
|------|--------|
| `apps/lab-lite/src/lib/db.ts` | Add new Dexie version with `reagent_consumption_log`, `supplier_config`, and reagent-supplier mapping tables |
| `apps/lab-lite/src/components/dashboard/DashboardHeader.tsx` or parent | Add `ReagentBurndownCard` to dashboard |
| `apps/lab-lite/src/components/settings/LabSettingsView.tsx` | Add "Supplier Configuration" section |
| `apps/lab-lite/src/components/notifications/NotificationPanel.tsx` | Integrate reagent alerts as notification items |
| `apps/lab-lite/messages/en.json` | Add `scheduler.burndown.*` and `scheduler.supplier.*` translation keys |
| `apps/lab-lite/messages/ar.json` | Add translation keys (Arabic) |
| `apps/lab-lite/messages/prs.json` | Add translation keys (Dari) |
| `apps/lab-lite/messages/ps.json` | Add translation keys (Pashto) |

### Patterns to Follow

- **Dexie versioning:** Increment version following the pattern in `db.ts`. Re-declare all existing stores plus new ones.
- **Integration with Story 44.3:** The reagent inventory table (from Story 44.3) is the source of truth for current stock levels and expiry dates. This story reads from that table and writes consumption logs. If Story 44.3 is not yet implemented, define the expected interface and use a mock/stub Dexie table with the same schema.
- **Fully offline:** The entire burndown engine operates on Dexie data. No network calls.
- **Confidence levels:** Clearly communicate data quality. A burndown based on 3 days of consumption data is unreliable — the UI must show this. Use `low`/`medium`/`high` labels with visual indicators.
- **Dual depletion logic:** Always compare usage-based depletion against chemical expiry. A reagent can have plenty of stock but be expiring — the alert must still fire.
- **i18n:** Use `useTranslations('scheduler')` hook. Follow the flat-namespace pattern.
- **RTL:** Logical CSS properties throughout. SVG burndown charts must account for RTL direction (x-axis direction).
- **Data minimization:** Burndown data contains reagent names and quantities — no patient data. No PHI concerns in this story.
- **No external charting library:** Use inline SVG for the burndown mini-chart. This keeps the bundle small and avoids offline loading issues. The chart is a simple declining line — no complex visualization needed.

### Burndown Calculation Detail

```
Input:
  - reagentInventory: { reagentId, name, currentStock, unit, expiryDate }
  - consumptionLog: [{ reagentId, quantityUsed, consumedAt }]  (last 30 days)
  - supplierConfig: { leadTimeDays }

Step 1: Calculate daily consumption rate
        totalConsumed = sum(quantityUsed) for lookback window
        daysInWindow = min(daysSinceFirstLog, lookbackDays)
        dailyRate = totalConsumed / daysInWindow

Step 2: Project usage depletion
        daysRemaining = currentStock / dailyRate
        usageDepletionDate = today + daysRemaining

Step 3: Compare against expiry
        effectiveDate = min(usageDepletionDate, expiryDate)
        reason = effectiveDate === expiryDate ? 'expiry' : 'usage'

Step 4: Calculate reorder date
        reorderDate = effectiveDate - leadTimeDays
        if reorderDate < today: reorderDate = today (overdue!)

Step 5: Evaluate alert threshold
        daysUntilDepletion = effectiveDate - today
        if <= 7: CRITICAL
        if <= 14: WARNING
        if <= 30: INFO
        else: NONE
```

### SVG Burndown Mini-Chart Specification

- Width: 120px, Height: 40px (compact, inline with table row).
- X-axis: 0 to 60 days from today.
- Y-axis: 0 to current stock level.
- Line: starts at current stock, declines linearly to 0 at projected depletion date.
- If depletion is within chart window (60 days): line reaches x-axis. Color red below 7 days, amber below 14 days.
- If depletion is beyond 60 days: line exits chart on the right edge. Color green.
- Horizontal dashed line at y=0 (zero stock reference).
- Vertical dashed line at expiry date if it falls within the 60-day window.
- No axis labels (too small) — hover tooltip shows "Projected depletion: [date]".

### Pitfalls

- **Zero consumption rate:** If a reagent has never been used (or no consumption logged), `dailyRate` is 0. Do not divide by zero. Return `null` for usage depletion date; effective date falls back to expiry only.
- **Negative stock:** If consumption logging brings stock below 0 (data entry error), clamp to 0 and show "STOCKOUT" status rather than projecting negative days.
- **Seasonal variation:** The 30-day lookback window may not capture seasonal demand changes. Future enhancement could use weighted moving averages, but for now, simple average is sufficient. Document this limitation.
- **Story 44.3 dependency:** If reagent inventory from 44.3 is not yet in Dexie, the burndown card must show "Reagent inventory not configured" rather than crashing. Check for table existence gracefully.
- **Alert fatigue:** Multi-threshold alerts (30/14/7) could spam the notification panel. The 24-hour deduplication is critical. Also consider grouping: "3 reagents need reorder" rather than 3 separate notifications.
- **Expiry date format:** Ensure expiry dates from inventory are parsed consistently (ISO 8601). Guard against invalid date strings.

### Project Structure Notes

- Lab-Lite is a Next.js 15 PWA at `apps/lab-lite/`.
- Uses `next-intl` for i18n with locale files in `apps/lab-lite/messages/`.
- Dexie (IndexedDB wrapper) for offline storage at `apps/lab-lite/src/lib/db.ts`.
- Notification components at `apps/lab-lite/src/components/notifications/`.
- Dashboard components at `apps/lab-lite/src/components/dashboard/`.
- Settings at `apps/lab-lite/src/components/settings/LabSettingsView.tsx`.
- Existing UI components at `apps/lab-lite/src/components/ui/`.
- Zustand stores at `apps/lab-lite/src/stores/`.

### References

- Epic 48 acceptance criteria: `_bmad-output/planning-artifacts/epics.md` (line 6107)
- Story 44.3 (reagent inventory — dependency): `_bmad-output/planning-artifacts/epics.md`
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Notification components: `apps/lab-lite/src/components/notifications/`
- Dashboard components: `apps/lab-lite/src/components/dashboard/`
- Settings view: `apps/lab-lite/src/components/settings/LabSettingsView.tsx`
- LOINC categories: `apps/lab-lite/src/lib/loinc-categories.ts`
- CLAUDE.md: Offline-first mandate, RTL rules
