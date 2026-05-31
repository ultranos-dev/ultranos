# Story 43.6: Analyzer Drift Detection & Recalibration Alerts

Status: ready-for-dev

## Story

As a lab supervisor,
I want the system to detect when analyzer QC values are trending outside acceptable limits,
So that we catch calibration drift before it affects patient results.

## Acceptance Criteria

1. **Given** QC results are being entered over multiple days, **when** the system detects a trend: (a) 5+ consecutive QC values trending in the same direction, (b) 2 consecutive values exceeding 2 standard deviations from the mean, (c) any single value exceeding 3 standard deviations, **then** an alert is displayed: "[Analyte] QC trending [high/low] for [N] consecutive runs. Recommend recalibration before processing patient samples."
2. **And** if the alert is ignored, all subsequent patient results for that analyte are flagged: "QC advisory — produced during drift warning"
3. **And** drift alerts are logged and visible in the QC history view

## Tasks / Subtasks

- [ ] Task 1: QC data model and storage (AC: #1, #3)
  - [ ] 1.1 Create `apps/lab-lite/src/lib/qc/types.ts` with core types:
    - `QcRun`: `{ id, analyte, loincCode, instrumentId, controlLevel, targetMean, targetSd, observedValue, runDate, runBy, hlcTimestamp }`
    - `QcControlLevel`: `'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3'` (low, normal, high controls)
    - `DriftAlert`: `{ id, analyte, loincCode, instrumentId, ruleViolated, severity, message, detectedAt, acknowledgedAt?, acknowledgedBy?, resolution? }`
    - `WestgardRule`: `'1_2S' | '1_3S' | '2_2S' | 'R_4S' | '4_1S' | '10X' | 'TREND_5'`
  - [ ] 1.2 Add Dexie tables to `apps/lab-lite/src/lib/db.ts`:
    - `qcRuns`: `&id, analyte, loincCode, instrumentId, runDate`
    - `driftAlerts`: `&id, analyte, loincCode, instrumentId, detectedAt, acknowledgedAt`
  - [ ] 1.3 QC data is local-first — stored in Dexie, synced to Hub for backup

- [ ] Task 2: Westgard rule detection engine (AC: #1)
  - [ ] 2.1 Create `apps/lab-lite/src/lib/qc/westgard-rules.ts`
  - [ ] 2.2 Implement `check1_2s(values, mean, sd)`: single value exceeds mean +/- 2SD — WARNING (investigate)
  - [ ] 2.3 Implement `check1_3s(values, mean, sd)`: single value exceeds mean +/- 3SD — REJECT (out of control)
  - [ ] 2.4 Implement `check2_2s(values, mean, sd)`: 2 consecutive values exceed mean +/- 2SD in same direction — REJECT
  - [ ] 2.5 Implement `checkR_4s(values, mean, sd)`: range between 2 consecutive values exceeds 4SD — REJECT (random error)
  - [ ] 2.6 Implement `check4_1s(values, mean, sd)`: 4 consecutive values on same side of mean beyond 1SD — WARNING (systematic shift)
  - [ ] 2.7 Implement `check10x(values, mean)`: 10 consecutive values on same side of mean — WARNING (systematic bias)
  - [ ] 2.8 All functions are pure — take arrays of numbers and thresholds, return boolean + rule name

- [ ] Task 3: Trend detection algorithm (AC: #1a)
  - [ ] 3.1 Create `apps/lab-lite/src/lib/qc/trend-detector.ts`
  - [ ] 3.2 `detectTrend(values: number[]): TrendResult | null` — checks for 5+ consecutive values moving in the same direction (each value higher or lower than the previous)
  - [ ] 3.3 Returns: `{ direction: 'UP' | 'DOWN', consecutiveCount, startIndex, slope }`
  - [ ] 3.4 Slope calculated as simple linear regression over the consecutive values
  - [ ] 3.5 Trend detection is separate from Westgard rules — it catches gradual drift that individual Westgard rules might miss

- [ ] Task 4: Drift detection orchestrator (AC: #1, #2)
  - [ ] 4.1 Create `apps/lab-lite/src/lib/qc/drift-detector.ts` — main orchestrator
  - [ ] 4.2 `analyzeDrift(analyte: string, instrumentId: string): Promise<DriftAlert[]>`
  - [ ] 4.3 Fetches last 20 QC runs for the analyte/instrument from Dexie
  - [ ] 4.4 Runs all Westgard rules + trend detection
  - [ ] 4.5 Creates `DriftAlert` entries for any detected violations
  - [ ] 4.6 Deduplicates: does not create duplicate alerts for the same violation if one already exists and is unacknowledged
  - [ ] 4.7 Returns active (unacknowledged) alerts sorted by severity

- [ ] Task 5: QC advisory flag propagation to patient results (AC: #2)
  - [ ] 5.1 Create `apps/lab-lite/src/lib/qc/advisory-flag.ts`
  - [ ] 5.2 `getActiveAdvisory(analyte: string, instrumentId: string): DriftAlert | null` — checks if there is an unacknowledged drift alert for this analyte/instrument
  - [ ] 5.3 When a patient result is saved for an analyte with an active drift alert, attach `_ultranos.qcAdvisory: { alertId, message: "QC advisory — produced during drift warning" }` to the result
  - [ ] 5.4 Integration point: hook into the result save flow from Story 42.4 — check for active advisories before saving
  - [ ] 5.5 QC advisory flag is visible in result detail view and carries through to authorization (42.5) and release (42.6)
  - [ ] 5.6 Integration with QC-Result Temporal Binding (43.2): the advisory flag supplements the QC snapshot already attached to results

- [ ] Task 6: Alert UI (AC: #1, #2, #3)
  - [ ] 6.1 Create `apps/lab-lite/src/components/qc/DriftAlertBanner.tsx` — persistent banner shown on the dashboard and result entry pages when active drift alerts exist
  - [ ] 6.2 Banner content: "[Analyte] QC trending [high/low] for [N] consecutive runs. Recommend recalibration before processing patient samples."
  - [ ] 6.3 Banner severity styling: red for 1-3s/2-2s/R-4s violations (out of control), yellow/amber for trends and 1-2s warnings
  - [ ] 6.4 Actions: "Acknowledge" (opens acknowledgment dialog), "View QC History" (navigates to QC history)
  - [ ] 6.5 Create `apps/lab-lite/src/components/qc/DriftAlertAcknowledgment.tsx` — dialog for acknowledging drift alert with resolution action:
    - Resolution options: `RECALIBRATED`, `MAINTENANCE_PERFORMED`, `FALSE_ALARM_VERIFIED`, `DEFERRED_TO_SUPERVISOR`
    - Free-text notes field
  - [ ] 6.6 RTL support: logical CSS properties for all alert components

- [ ] Task 7: QC history view integration (AC: #3)
  - [ ] 7.1 Create `apps/lab-lite/src/components/qc/QcHistoryView.tsx` — tabular view of QC runs for an analyte/instrument
  - [ ] 7.2 Columns: Run Date, Control Level, Target Mean, Target SD, Observed Value, Deviation (value - mean), Status (pass/warning/reject)
  - [ ] 7.3 Rows with Westgard violations highlighted: red for reject rules, yellow for warning rules
  - [ ] 7.4 Trend indicator: if a trend is detected, show an arrow icon and "N consecutive [up/down]" badge
  - [ ] 7.5 No Levey-Jennings chart (statistical rules only per story requirements) — text/table based
  - [ ] 7.6 Drift alert history section below the table: shows all alerts with timestamps, resolutions, and who acknowledged

- [ ] Task 8: Audit trail integration (AC: #3)
  - [ ] 8.1 Add `QC_DRIFT_DETECTED` and `QC_DRIFT_ACKNOWLEDGED` to `AuditAction` enum
  - [ ] 8.2 Emit `QC_DRIFT_DETECTED` audit event when drift alert is created (metadata: analyte, instrumentId, ruleViolated, severity)
  - [ ] 8.3 Emit `QC_DRIFT_ACKNOWLEDGED` audit event when alert is acknowledged (metadata: alertId, resolution, acknowledgedBy)
  - [ ] 8.4 Emit audit event when patient result is saved with QC advisory flag (metadata: alertId, resultId — no result values)
  - [ ] 8.5 Add `reportQcDriftEvent()` helper to `apps/lab-lite/src/lib/audit-client.ts`

- [ ] Task 9: Tests (AC: all)
  - [ ] 9.1 Unit test: `check1_3s` detects single value > 3SD from mean
  - [ ] 9.2 Unit test: `check1_3s` passes for values within 3SD
  - [ ] 9.3 Unit test: `check2_2s` detects 2 consecutive values > 2SD in same direction
  - [ ] 9.4 Unit test: `check2_2s` passes when values are on opposite sides of mean
  - [ ] 9.5 Unit test: `check1_2s` detects single value > 2SD as warning
  - [ ] 9.6 Unit test: `checkR_4s` detects range > 4SD between consecutive values
  - [ ] 9.7 Unit test: `check4_1s` detects 4 consecutive values beyond 1SD on same side
  - [ ] 9.8 Unit test: `check10x` detects 10 consecutive values on same side of mean
  - [ ] 9.9 Unit test: trend detector finds 5+ consecutive increasing values
  - [ ] 9.10 Unit test: trend detector returns null for < 5 consecutive directional values
  - [ ] 9.11 Unit test: drift orchestrator runs all rules and returns combined alerts
  - [ ] 9.12 Unit test: duplicate alerts not created for same active violation
  - [ ] 9.13 Unit test: patient result gets QC advisory flag when active drift alert exists
  - [ ] 9.14 Unit test: patient result has no advisory flag when no drift alert exists
  - [ ] 9.15 Unit test: audit events emitted for drift detection and acknowledgment
  - [ ] 9.16 Component test: drift alert banner renders with correct severity styling
  - [ ] 9.17 Component test: acknowledgment dialog requires resolution selection
  - [ ] 9.18 RTL snapshot test: DriftAlertBanner and QcHistoryView in both LTR and RTL
  - [ ] 9.19 Offline test: all drift detection works from Dexie data only

## Dev Notes

### Architecture

The drift detection system is a **statistical analysis engine** that runs entirely offline using local QC data in Dexie. It implements industry-standard Westgard multi-rule QC without graphical Levey-Jennings charts (text/table only per story requirements).

The system operates on two levels:
1. **Per-QC-run analysis:** When a new QC run is entered, immediately check all Westgard rules against recent history
2. **Background advisory propagation:** Active drift alerts propagate to patient results as QC advisory flags

### Westgard Rules Implementation

The Westgard multi-rule system uses a cascading check order:

| Rule | Condition | Interpretation | Action |
|------|-----------|----------------|--------|
| 1-3s | Single value > 3SD | Random or systematic error | REJECT — stop testing |
| 2-2s | 2 consecutive > 2SD same direction | Systematic error | REJECT — recalibrate |
| R-4s | Range of 2 consecutive > 4SD | Random error | REJECT — investigate |
| 1-2s | Single value > 2SD | Warning — investigate | WARNING — monitor |
| 4-1s | 4 consecutive > 1SD same side | Systematic shift | WARNING — monitor |
| 10x | 10 consecutive same side of mean | Systematic bias | WARNING — recalibrate |
| Trend-5 | 5+ consecutive in same direction | Calibration drift | WARNING — recalibrate |

### Levey-Jennings: Statistical Rules Only

The story explicitly states "Levey-Jennings logic without charts (statistical rules only)." This means:
- Implement the mathematical rules that would normally be visualized on a Levey-Jennings chart
- Present results as text/table with color-coded status indicators
- Do NOT build a chart component — this keeps the scope manageable and avoids charting library dependencies

### Integration with QC-Result Temporal Binding (43.2)

Story 43.2 attaches a QC snapshot to each patient result at save time. This story adds a second layer: if drift is detected, a QC advisory flag is also attached. The two are complementary:
- 43.2 says: "Here's what QC status was when this result was produced"
- 43.6 says: "Warning — QC was drifting when this result was produced"

### Alert Lifecycle

```
QC Run Entered → Westgard Rules Check → Violation Detected → DriftAlert Created → Alert Banner Shown
                                                                    ↓
                                        Patient results flagged with QC advisory
                                                                    ↓
                              Supervisor acknowledges → Resolution recorded → Alert closed
                                                                    ↓
                                        QC advisory flag stops propagating to new results
```

### Dexie Schema Addition

```typescript
this.version(N).stores({
  // ... existing tables ...
  qcRuns: '&id, analyte, loincCode, instrumentId, runDate',
  driftAlerts: '&id, analyte, loincCode, instrumentId, detectedAt, acknowledgedAt',
})
```

Coordinate version number with Stories 43.3, 43.4, and 43.5 which also add Dexie tables.

### Files to Create

| File | Purpose |
|------|---------|
| `apps/lab-lite/src/lib/qc/types.ts` | QC data types and interfaces |
| `apps/lab-lite/src/lib/qc/westgard-rules.ts` | Pure Westgard rule check functions |
| `apps/lab-lite/src/lib/qc/trend-detector.ts` | Trend detection (5+ consecutive direction) |
| `apps/lab-lite/src/lib/qc/drift-detector.ts` | Main drift detection orchestrator |
| `apps/lab-lite/src/lib/qc/advisory-flag.ts` | QC advisory flag propagation to patient results |
| `apps/lab-lite/src/components/qc/DriftAlertBanner.tsx` | Persistent drift alert banner |
| `apps/lab-lite/src/components/qc/DriftAlertAcknowledgment.tsx` | Alert acknowledgment dialog |
| `apps/lab-lite/src/components/qc/QcHistoryView.tsx` | Tabular QC history with Westgard highlighting |
| `apps/lab-lite/src/__tests__/westgard-rules.test.ts` | Unit tests for each Westgard rule |
| `apps/lab-lite/src/__tests__/drift-detector.test.ts` | Unit tests for drift detection orchestrator |
| `apps/lab-lite/src/__tests__/drift-ui.test.tsx` | Component tests for alert UI |

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared-types/src/enums.ts` | Add `QC_DRIFT_DETECTED`, `QC_DRIFT_ACKNOWLEDGED` to `AuditAction` |
| `apps/lab-lite/src/lib/db.ts` | Add `qcRuns` and `driftAlerts` tables |
| `apps/lab-lite/src/lib/audit-client.ts` | Add `reportQcDriftEvent()` helper |
| Dashboard page component | Show drift alert banner when active alerts exist |
| Result entry form (from 42.4) | Attach QC advisory flag when active drift alert exists |

### Pitfalls

1. **Standard deviation calculation:** Use the population SD from the QC control manufacturer's target values, not calculated from the lab's own data. The `targetMean` and `targetSd` come from the control lot insert.
2. **Multiple control levels:** Each control level (Level 1, 2, 3) must be analyzed independently. A drift in Level 1 does not automatically mean Level 2 is drifting.
3. **Instrument ID tracking:** Labs may have multiple instruments for the same analyte. Drift detection must be per-instrument, not just per-analyte.
4. **Alert fatigue:** Do not generate duplicate alerts for the same ongoing violation. If a 2-2s alert is already active and unacknowledged, do not create another 2-2s alert on the next QC run. Update the existing alert's consecutive count instead.
5. **No network dependency:** All drift detection logic must work entirely offline. QC data is entered locally and analyzed locally.
6. **10x rule requires history:** The 10x rule needs 10 QC runs of history. If the lab has fewer than 10 runs for an analyte, skip the 10x rule (do not flag insufficient data).

### Project Structure Notes

- The `qc/` module is a self-contained library under `apps/lab-lite/src/lib/qc/`
- Westgard rule functions are pure functions with no dependencies — easy to unit test
- Drift detection orchestrator reads from Dexie (async) and calls pure rule functions (sync)
- All alert UI components are client-side with `'use client'` directive

### References

- Epic 43 definition: `_bmad-output/planning-artifacts/epics.md` (line 5657)
- Story 43.2 (QC-Result Temporal Binding) — QC snapshot attached to patient results
- Story 42.4 (Lab Result Templates & Structured Data Entry) — result entry integration point
- Story 42.5 (Result Authorization Workflow) — QC advisory flag visible during authorization
- LOINC categories: `apps/lab-lite/src/lib/loinc-categories.ts`
- Westgard QC Rules reference: https://www.westgard.com/mltirule.htm
- CLAUDE.md Rule #6: Every PHI access must emit audit event
