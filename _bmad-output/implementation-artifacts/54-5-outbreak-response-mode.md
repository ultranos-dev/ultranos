# Story 54.5: Outbreak Response Mode

Status: draft

## Story

As a provincial health officer,
I want to activate "Outbreak Mode" for all labs in an affected area,
so that lab operations shift to support the outbreak response with maximum throughput and real-time surveillance.

## Acceptance Criteria

1. **Given** an outbreak is declared, **when** the health officer activates Outbreak Mode, **then** the system requires: activating authority (health officer identity + role verification), target pathogen or condition, affected geographic scope (which labs/locations participate), and activation reason.
2. **And** only users with `health_officer` or `lab_supervisor` roles can activate or deactivate Outbreak Mode.
3. **And** participating labs switch to a prioritized testing queue: samples for the target pathogen are automatically moved to the top of the worklist, with a visual "OUTBREAK PRIORITY" badge.
4. **And** result reporting switches from batch/monthly to real-time: positive results for the target pathogen are immediately flagged for surveillance reporting and queued for priority sync.
5. **And** a simplified data entry mode is available for the target test: reduced fields optimized for throughput (sample ID, result, timestamp — minimal metadata).
6. **And** inventory alerts are recalibrated for surge demand: the system applies a configurable surge multiplier (default 3x) to consumption rate projections and fires urgent restock alerts.
7. **And** the system auto-generates daily situation reports (sitreps): total tests performed, positive count, positivity rate, test supply burn rate, and projected stockout date at current consumption.
8. **And** normal operations resume when Outbreak Mode is deactivated — queue prioritization returns to standard, reporting reverts to batch, simplified entry is disabled, inventory alerts return to normal thresholds.
9. **And** all outbreak mode actions are audit-logged: activation (who, when, why, scope), deactivation, configuration changes, every sitrep generation.
10. **And** the outbreak mode banner is visible on every screen while active: "[OUTBREAK MODE ACTIVE: {pathogen}] — Activated by {officer} on {date}".
11. **And** all outbreak mode features work offline from local Dexie data with store-and-forward sync for surveillance reports.

## Tasks / Subtasks

- [ ] **Task 1: Outbreak mode type definitions** (AC: 1, 3, 7)
  - [ ] 1.1 Create `apps/lab-lite/src/types/outbreak.ts` defining:
    - `OutbreakModeConfig` interface: `id` (UUID), `status` ('active' | 'inactive'), `activatedBy` (practitioner ID), `activatedAt` (HLC timestamp), `deactivatedBy` (nullable), `deactivatedAt` (nullable), `targetPathogen` (string — coded term + display name), `targetTestCodes` (array of LOINC codes for the target test), `affectedScope` (array of location IDs), `activationReason` (text), `surgeMultiplier` (number, default 3), `meta`, `_ultranos`.
    - `DailySitrep` interface: `id` (UUID), `outbreakConfigId`, `reportDate` (ISO date string), `totalTestsPerformed`, `positiveCount`, `positivityRate` (percentage), `reagentBurnRate` (units/day), `projectedStockoutDate` (ISO date, nullable), `pendingSamples`, `generatedAt` (HLC timestamp), `generatedBy` (practitioner ID or 'system'), `syncStatus` ('pending' | 'synced').
    - `OutbreakQueuePriority` type defining priority boost rules.
  - [ ] 1.2 Export types from `apps/lab-lite/src/types/index.ts`.

- [ ] **Task 2: Dexie schema migration — `outbreak_configs` and `daily_sitreps` tables** (AC: 1, 7, 11)
  - [ ] 2.1 Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with:
    - `outbreak_configs`: `&id, status, targetPathogen, activatedAt`
    - `daily_sitreps`: `&id, outbreakConfigId, reportDate, syncStatus`
  - [ ] 2.2 Add typed `Dexie.Table` properties.
  - [ ] 2.3 Add CRUD helpers: `putOutbreakConfig()`, `getActiveOutbreak()`, `addDailySitrep()`, `getSitrepsByOutbreak()`.

- [ ] **Task 3: Outbreak mode service** (AC: 1, 2, 3, 4, 5, 6, 8, 9)
  - [ ] 3.1 Create `apps/lab-lite/src/lib/outbreak-service.ts`.
  - [ ] 3.2 `activateOutbreakMode(input: ActivateOutbreakInput): Promise<OutbreakModeConfig>` — validates role authorization (health_officer or lab_supervisor), creates config record, emits audit event. Input: `{ activatedBy, targetPathogen, targetTestCodes, affectedScope, activationReason, surgeMultiplier? }`.
  - [ ] 3.3 `deactivateOutbreakMode(configId: string, deactivatedBy: string): Promise<OutbreakModeConfig>` — validates role authorization, sets status to inactive, records deactivation timestamp and actor, emits audit event.
  - [ ] 3.4 `isOutbreakModeActive(): Promise<OutbreakModeConfig | null>` — returns active outbreak config or null. Cached in memory for performance (checked on every page load for banner display).
  - [ ] 3.5 `getOutbreakQueuePriority(sample: FhirSpecimen): number` — if outbreak is active and sample's test matches target test codes, returns elevated priority. Otherwise returns standard priority.
  - [ ] 3.6 `recalibrateInventoryAlerts(surgeMultiplier: number): Promise<void>` — applies surge multiplier to all reagent consumption rate projections. Integrates with Story 48.2 predictive burndown if available, otherwise uses simple multiplication.
  - [ ] 3.7 `restoreNormalOperations(configId: string): Promise<void>` — reverts queue prioritization, reporting mode, inventory thresholds, and simplified entry mode to pre-outbreak settings.

- [ ] **Task 4: Daily sitrep generation** (AC: 7)
  - [ ] 4.1 Create `apps/lab-lite/src/lib/sitrep-generator.ts`.
  - [ ] 4.2 `generateDailySitrep(outbreakConfig: OutbreakModeConfig): Promise<DailySitrep>` — queries Dexie for today's test data filtered by target test codes, computes metrics: total tests, positive count, positivity rate, reagent burn rate, projected stockout date.
  - [ ] 4.3 Positivity rate: `(positiveCount / totalTestsPerformed) * 100`, rounded to 1 decimal.
  - [ ] 4.4 Projected stockout date: current reagent stock / daily burn rate = days remaining. If stockout is within 7 days, flag as critical.
  - [ ] 4.5 Auto-generation: sitrep is generated automatically at end-of-day (configurable time, default 18:00 local) or on-demand via manual trigger.
  - [ ] 4.6 Sitrep is exportable as PDF and queued for priority sync to Hub for surveillance reporting.

- [ ] **Task 5: Outbreak Mode activation UI** (AC: 1, 2, 10)
  - [ ] 5.1 Create `apps/lab-lite/src/components/outbreak/ActivateOutbreakModal.tsx`.
  - [ ] 5.2 Form fields:
    - Target Pathogen: text input with autocomplete from common pathogens list (Malaria, TB, Cholera, Measles, COVID-19, Dengue, Hepatitis A/B/C/E, custom entry).
    - Target Test Codes: multi-select from LOINC catalog, filtered by pathogen selection.
    - Affected Scope: multi-select from lab locations (from Story 54.1 network config).
    - Activation Reason: textarea (required — "WHO alert", "Provincial directive #X", etc.).
    - Surge Multiplier: numeric input with default 3x, range 1.5-10x.
  - [ ] 5.3 Confirmation dialog with summary: "You are activating Outbreak Mode for [pathogen] across [N] locations. This will prioritize [test names] and switch to real-time reporting."
  - [ ] 5.4 Role gate: button only visible to `health_officer` and `lab_supervisor` roles.

- [ ] **Task 6: Outbreak Mode banner** (AC: 10)
  - [ ] 6.1 Create `apps/lab-lite/src/components/outbreak/OutbreakModeBanner.tsx`.
  - [ ] 6.2 Persistent banner at top of every page when outbreak mode is active.
  - [ ] 6.3 Styling: red/orange background, white text, alert icon. Content: "[OUTBREAK MODE ACTIVE: {pathogen}] — Activated by {officer name} on {date}".
  - [ ] 6.4 "Deactivate" button (visible only to authorized roles) opens deactivation confirmation.
  - [ ] 6.5 Banner must NOT be dismissible — it persists until outbreak mode is deactivated.
  - [ ] 6.6 Integrate into root layout: `apps/lab-lite/src/app/[locale]/layout.tsx`.

- [ ] **Task 7: Prioritized testing queue modifications** (AC: 3)
  - [ ] 7.1 Extend the existing worklist/queue logic to check outbreak priority.
  - [ ] 7.2 Samples matching target test codes are sorted to top with "OUTBREAK PRIORITY" badge (red badge with target icon).
  - [ ] 7.3 Queue component shows outbreak section header: "Outbreak Priority ([N] samples)" above standard queue.
  - [ ] 7.4 Priority sorting is additive — existing urgent/stat priorities are respected within the outbreak subset.

- [ ] **Task 8: Simplified data entry mode** (AC: 5)
  - [ ] 8.1 Create `apps/lab-lite/src/components/outbreak/SimplifiedResultEntry.tsx`.
  - [ ] 8.2 Reduced fields for target test: sample ID (scan or enter), result (positive/negative/indeterminate for qualitative tests, or numeric value for quantitative), timestamp (auto-populated), tech ID (auto-populated from session).
  - [ ] 8.3 Large touch targets and minimal UI chrome — optimized for high-throughput entry.
  - [ ] 8.4 Accessible from the outbreak priority queue with one tap.
  - [ ] 8.5 Result still requires authorization per Story 42.5 workflow, but the entry step is faster.

- [ ] **Task 9: Surge inventory alerts** (AC: 6)
  - [ ] 9.1 Create `apps/lab-lite/src/lib/surge-inventory.ts`.
  - [ ] 9.2 `calculateSurgeProjections(surgeMultiplier: number): Promise<SurgeProjection[]>` — for each reagent used by target tests, multiplies daily consumption rate by surge multiplier and recalculates depletion date.
  - [ ] 9.3 Integrates with Story 48.2 predictive burndown service if available; falls back to simple multiplication if 48.2 is not implemented.
  - [ ] 9.4 Surge alerts fire immediately on outbreak activation and daily thereafter.
  - [ ] 9.5 Alert format: "At 3x surge demand, [Reagent X] will deplete in [N] days. Order by [date] for [lead-time] delivery."

- [ ] **Task 10: Daily Sitrep UI** (AC: 7)
  - [ ] 10.1 Create `apps/lab-lite/src/components/outbreak/SitrepView.tsx`.
  - [ ] 10.2 Dashboard-style display: total tests today, positive count (large, prominent), positivity rate (with trend arrow vs yesterday), reagent burn rate, projected stockout date (color-coded: green > 14 days, amber 7-14 days, red < 7 days).
  - [ ] 10.3 "Generate Now" button for on-demand sitrep.
  - [ ] 10.4 Historical sitrep list showing daily trends.
  - [ ] 10.5 "Export PDF" button for each sitrep.

- [ ] **Task 11: Sitrep PDF generation** (AC: 7)
  - [ ] 11.1 Create `apps/lab-lite/src/lib/sitrep-pdf.ts`.
  - [ ] 11.2 `renderSitrepPDF(sitrep: DailySitrep, outbreakConfig: OutbreakModeConfig): Blob` — generates PDF with: header (outbreak details, date), metrics table, and trend chart data (textual representation suitable for print).
  - [ ] 11.3 PDF includes lab identification but no patient-level PHI.

- [ ] **Task 12: Real-time surveillance sync** (AC: 4)
  - [ ] 12.1 Extend `apps/lab-lite/src/lib/upload-queue-worker.ts` to handle outbreak priority sync.
  - [ ] 12.2 Positive results for target pathogen sync at highest priority (same tier as allergies/consent in sync engine priority order).
  - [ ] 12.3 Sitreps sync at high priority.
  - [ ] 12.4 Non-outbreak results continue at standard priority.

- [ ] **Task 13: Outbreak audit events** (AC: 9)
  - [ ] 13.1 Add outbreak-specific audit event types in `apps/lab-lite/src/lib/audit-client.ts`: `OUTBREAK_MODE_ACTIVATED`, `OUTBREAK_MODE_DEACTIVATED`, `OUTBREAK_CONFIG_CHANGED`, `OUTBREAK_SITREP_GENERATED`, `OUTBREAK_SURGE_ALERT`.
  - [ ] 13.2 Activation event must include: activating authority identity, role, target pathogen, scope, reason. This is a high-accountability event.
  - [ ] 13.3 All events include `outbreakConfigId`, `actorId`, `timestamp`.

- [ ] **Task 14: Deactivation and normal operations resume** (AC: 8)
  - [ ] 14.1 Create `apps/lab-lite/src/components/outbreak/DeactivateOutbreakModal.tsx`.
  - [ ] 14.2 Confirmation with summary of what will change: "Deactivating Outbreak Mode will restore standard queue priority, batch reporting, and normal inventory thresholds."
  - [ ] 14.3 On deactivation: calls `deactivateOutbreakMode()` and `restoreNormalOperations()`.
  - [ ] 14.4 Final sitrep is auto-generated at deactivation.
  - [ ] 14.5 Outbreak banner is removed.

- [ ] **Task 15: Tests** (AC: 1-11)
  - [ ] 15.1 Unit tests for `outbreak-service.ts`: activation with valid/invalid roles, deactivation, queue priority calculation, inventory recalibration.
  - [ ] 15.2 Unit tests for `sitrep-generator.ts`: metric calculations, positivity rate, stockout projection.
  - [ ] 15.3 Unit tests for `surge-inventory.ts`: surge multiplier application, alert threshold calculation.
  - [ ] 15.4 Component tests for `ActivateOutbreakModal.tsx`: role gate enforcement, form validation.
  - [ ] 15.5 Component tests for `OutbreakModeBanner.tsx`: visibility when active/inactive, role-gated deactivation button.
  - [ ] 15.6 Component tests for `SimplifiedResultEntry.tsx`: reduced field set, touch target sizes.
  - [ ] 15.7 Integration test: full activation -> sitrep generation -> deactivation cycle.
  - [ ] 15.8 Audit event emission assertions for all outbreak operations (especially activation authority logging).
  - [ ] 15.9 RTL layout tests for outbreak components.

## Dev Notes

- **Mode activation** requires `health_officer` or `lab_supervisor` role. This is a significant operational change affecting multiple labs, so the activation authority must be clearly logged. The audit event for activation is one of the highest-accountability events in the system.
- **Affected-area scope** uses location IDs from Story 54.1's lab network. Each lab in the scope receives the outbreak config via sync and applies it locally.
- **Operational changes when active**: (a) prioritized queue moves target pathogen samples to top, (b) real-time reporting replaces monthly batch for target results, (c) simplified data entry reduces fields for faster throughput, (d) surge inventory alerts multiply consumption projections, (e) daily sitreps auto-generate. All five changes revert on deactivation.
- **Surge inventory alerts** apply a multiplier (default 3x, configurable 1.5-10x) to daily consumption rates. This provides early warning for reagent stockouts during a surge. Integrates with Story 48.2 predictive burndown if available.
- **Daily sitreps** aggregate: total tests, positive count, positivity rate, reagent burn rate, and projected stockout date. They are exportable as PDF for sharing with hospital administration and health authorities.
- **Normal operation resume** on deactivation reverts all outbreak-specific changes. A final sitrep is generated to close the outbreak record.
- **Audit logging** of activation authority is critical. The audit record must capture who activated, their role, the reason, and the scope. This supports accountability in public health response.

## Project Structure Notes

New files:
- `apps/lab-lite/src/types/outbreak.ts`
- `apps/lab-lite/src/lib/outbreak-service.ts`
- `apps/lab-lite/src/lib/sitrep-generator.ts`
- `apps/lab-lite/src/lib/sitrep-pdf.ts`
- `apps/lab-lite/src/lib/surge-inventory.ts`
- `apps/lab-lite/src/components/outbreak/ActivateOutbreakModal.tsx`
- `apps/lab-lite/src/components/outbreak/OutbreakModeBanner.tsx`
- `apps/lab-lite/src/components/outbreak/SimplifiedResultEntry.tsx`
- `apps/lab-lite/src/components/outbreak/SitrepView.tsx`
- `apps/lab-lite/src/components/outbreak/DeactivateOutbreakModal.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with `outbreak_configs`, `daily_sitreps` tables)
- `apps/lab-lite/src/lib/audit-client.ts` (outbreak audit event types)
- `apps/lab-lite/src/lib/upload-queue-worker.ts` (outbreak priority sync)
- `apps/lab-lite/src/app/[locale]/layout.tsx` (outbreak mode banner integration)

## References

- Epic 54 definition: `_bmad-output/planning-artifacts/epics.md` (line 6639)
- CLAUDE.md: Audit every PHI access (Rule #6) — outbreak activation is a high-accountability audit event
- CLAUDE.md: Sync priority order — positive outbreak results sync at highest priority (same as allergies/consent)
- Story 42.5: Result Authorization Workflow (authorization still required for outbreak results)
- Story 42.7: Smart Sample Prioritization Queue (queue logic extension)
- Story 48.2: Predictive Reagent Burndown (integration for surge projections)
- Story 50.1: Auto-Compiled HMIS Monthly Report (sitrep format patterns)
- Story 54.1: Multi-Branch Lab Network (location scope, network config)
- Existing audit client: `apps/lab-lite/src/lib/audit-client.ts`
- Existing upload queue: `apps/lab-lite/src/lib/upload-queue-worker.ts`
- LOINC categories: `apps/lab-lite/src/lib/loinc-categories.ts`
