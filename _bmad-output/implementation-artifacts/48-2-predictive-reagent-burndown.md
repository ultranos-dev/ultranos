# Story 48.2: Predictive Reagent Burndown

Status: ready-for-dev

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

- [ ] **Task 1: Dexie Schema — `reagent_consumption_log` and `supplier_config` Tables** (AC: 1, 3, 7)
  - [ ] Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with `reagent_consumption_log` and `supplier_config` tables.
  - [ ] Define `ReagentConsumptionEntry` interface: `id` (auto-increment), `reagentId` (string — references reagent inventory from Story 44.3), `loincCode` (string — test that consumed it), `quantityUsed` (number), `unit` (string — mL, strips, tests, etc.), `consumedAt` (string — ISO 8601), `technicianId` (string).
  - [ ] Index: `++id, reagentId, loincCode, consumedAt`.
  - [ ] Define `SupplierConfig` interface: `id` (auto-increment), `supplierId` (string — UUID), `supplierName` (string), `leadTimeDays` (number), `contactInfo` (string — phone or email), `notes` (string), `updatedAt` (string — ISO 8601).
  - [ ] Index: `++id, &supplierId`.
  - [ ] Define `ReagentSupplierMapping` interface: `reagentId` (string), `supplierId` (string). Index: `[reagentId+supplierId], reagentId, supplierId`.

- [ ] **Task 2: Consumption Rate Calculation Engine** (AC: 1, 2, 7)
  - [ ] Create `apps/lab-lite/src/lib/reagent-burndown.ts`.
  - [ ] `calculateDailyConsumptionRate(reagentId: string, lookbackDays?: number): Promise<ConsumptionRate>` — queries `reagent_consumption_log` for the lookback window (default 30 days), returns `{ averageDailyUsage, unit, dataPointCount, confidenceLevel }`. Confidence: `high` (>= 14 data points), `medium` (7-13), `low` (< 7).
  - [ ] `projectUsageDepletionDate(currentStock: number, dailyRate: number): Date | null` — returns null if rate is 0 (no consumption). Calculates `today + (currentStock / dailyRate)` days.
  - [ ] `getEffectiveDepletionDate(usageDepletion: Date | null, expiryDate: Date): { date: Date; reason: 'usage' | 'expiry' }` — returns whichever comes first. If usage depletion is null, returns expiry.
  - [ ] `calculateReorderDate(effectiveDepletion: Date, leadTimeDays: number): Date` — subtracts lead time. If reorder date is in the past, return today (already overdue).
  - [ ] `evaluateAlertThreshold(effectiveDepletion: Date, today?: Date): AlertLevel` — returns `'none' | 'info' | 'warning' | 'critical'` based on days remaining: > 30 = none, 30 = info, 14 = warning, 7 = critical.

- [ ] **Task 3: Burndown Dashboard Component** (AC: 4, 6)
  - [ ] Create `apps/lab-lite/src/components/scheduler/ReagentBurndownCard.tsx`.
  - [ ] Summary header: total reagent count, count by alert level (critical / warning / info / ok).
  - [ ] Reagent list: each reagent row displays:
    - Reagent name and unit
    - Current stock level (with unit)
    - Daily consumption rate (with confidence indicator: high/medium/low)
    - Projected depletion date (with "usage" or "expiry" reason badge)
    - Chemical expiry date
    - Recommended reorder date
    - Alert badge: color-coded by threshold (green = ok, blue = info/30d, amber = warning/14d, red = critical/7d)
  - [ ] Sortable by: alert urgency (default), depletion date, reagent name.
  - [ ] Burndown mini-chart per reagent: simple SVG line showing projected stock over next 60 days with a horizontal line at zero. Use inline SVG — no charting library dependency.
  - [ ] Empty state: "No reagent inventory configured. Set up inventory in Settings." with link.
  - [ ] RTL-aware layout (logical CSS properties). Chart axis labels must flip for RTL.

- [ ] **Task 4: Supplier Lead Time Configuration UI** (AC: 3)
  - [ ] Create `apps/lab-lite/src/components/scheduler/SupplierConfigPanel.tsx`.
  - [ ] CRUD for suppliers: name, lead time (days), contact info, notes.
  - [ ] Reagent-to-supplier mapping: assign a default supplier to each reagent.
  - [ ] Lead time input: numeric field, minimum 1 day, maximum 365 days.
  - [ ] Persist to Dexie `supplier_config` and reagent supplier mapping tables.
  - [ ] Accessible from Settings page.
  - [ ] i18n via `useTranslations('scheduler')`.

- [ ] **Task 5: Alert System Integration** (AC: 5)
  - [ ] Create `apps/lab-lite/src/lib/reagent-alert-evaluator.ts`.
  - [ ] `evaluateAllReagentAlerts(): Promise<ReagentAlert[]>` — runs burndown for all reagents, returns alerts for any at or below threshold.
  - [ ] `ReagentAlert` interface: `reagentId`, `reagentName`, `alertLevel`, `daysRemaining`, `effectiveDate`, `reason` (`usage` | `expiry`), `reorderDate`, `supplierName?`.
  - [ ] Integrate with existing notification components at `apps/lab-lite/src/components/notifications/` — push `ReagentAlert` entries as notification items.
  - [ ] Alert persistence: store last-evaluated alerts in Dexie to avoid re-computing on every render. Re-evaluate on: app open, reagent inventory change, manual refresh.
  - [ ] Alert deduplication: do not re-fire an alert for the same reagent at the same threshold level within 24 hours.

- [ ] **Task 6: Consumption Logging Hook** (AC: 1)
  - [ ] Create `apps/lab-lite/src/hooks/useReagentConsumption.ts`.
  - [ ] `logConsumption(reagentId, loincCode, quantityUsed, unit)` — writes to `reagent_consumption_log` in Dexie.
  - [ ] This hook is designed to be called from the result entry workflow (Story 42.4) when a test is completed and reagent is consumed. For now, provide the hook and a manual "Log Consumption" action in the burndown UI for techs to record usage.
  - [ ] Auto-decrement: when consumption is logged, also update the current stock quantity in the reagent inventory table (from Story 44.3).

- [ ] **Task 7: Dashboard Integration** (AC: 4, 6)
  - [ ] Add `ReagentBurndownCard` to the lab dashboard.
  - [ ] Card shows condensed view: top 3 most urgent reagents. "View All" expands to full list.
  - [ ] Dashboard hook: create `apps/lab-lite/src/hooks/useReagentBurndown.ts` — queries Dexie for reagent inventory, consumption logs, supplier configs, runs burndown engine, returns `{ burndownData, alerts, isLoading }`.

- [ ] **Task 8: Navigation & Settings Integration** (AC: 3)
  - [ ] Add "Supplier Configuration" to the Settings page under the scheduling/procurement section.
  - [ ] Route: `/[locale]/settings/suppliers` for supplier CRUD.
  - [ ] Link from burndown card "Configure Suppliers" action to settings page.

- [ ] **Task 9: i18n — Translation Keys** (AC: 1-6)
  - [ ] Add reagent burndown keys under `scheduler.burndown.*` namespace to all locale files (`en.json`, `ar.json`, `prs.json`, `ps.json`).
  - [ ] Keys: `scheduler.burndown.title`, `scheduler.burndown.currentStock`, `scheduler.burndown.dailyRate`, `scheduler.burndown.depletionDate`, `scheduler.burndown.expiryDate`, `scheduler.burndown.reorderBy`, `scheduler.burndown.alertInfo`, `scheduler.burndown.alertWarning`, `scheduler.burndown.alertCritical`, `scheduler.burndown.confidence.*`, `scheduler.burndown.reason.*`, `scheduler.supplier.*`.

- [ ] **Task 10: Tests** (AC: 1-7)
  - [ ] Unit tests for `reagent-burndown.ts`:
    - `calculateDailyConsumptionRate`: correct average with varying data points, confidence levels.
    - `projectUsageDepletionDate`: correct projection, handles zero rate (returns null).
    - `getEffectiveDepletionDate`: picks earlier of usage vs expiry, handles null usage.
    - `calculateReorderDate`: correct subtraction, returns today when overdue.
    - `evaluateAlertThreshold`: correct threshold classification at boundaries (exactly 30, 14, 7 days).
  - [ ] Unit tests for `reagent-alert-evaluator.ts`:
    - `evaluateAllReagentAlerts`: returns correct alerts for mixed inventory states.
    - Deduplication: does not re-fire same alert within 24 hours.
  - [ ] Component tests for `ReagentBurndownCard.tsx`: renders alert badges, sorts by urgency, shows empty state.
  - [ ] Component tests for `SupplierConfigPanel.tsx`: CRUD operations, lead time validation.
  - [ ] RTL snapshot tests for `ReagentBurndownCard`, `SupplierConfigPanel`.

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
