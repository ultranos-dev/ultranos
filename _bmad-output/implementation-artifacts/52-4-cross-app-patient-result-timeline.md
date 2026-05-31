# Story 52.4: Cross-App Patient Result Timeline

Status: draft

## Story

As a physician in OPD-Lite,
I want to see all lab results for a patient in a longitudinal timeline,
So that I can track trends and see the full diagnostic picture across visits.

## Context

Lab results today are isolated events — a physician can see a single result from a single visit, but has no longitudinal view. Tracking a diabetic patient's glucose trend over 6 months, or seeing how a hemoglobin value has changed across three encounters, requires manually opening each visit record and comparing numbers. This is slow, error-prone, and makes it easy to miss clinically significant trends.

This story builds a cross-app patient result timeline. Lab-Lite produces FHIR DiagnosticReports via Story 42.6's write-once-distribute-many engine. OPD-Lite receives these reports and integrates them into the patient's clinical timeline alongside encounters, prescriptions, and notes. Results are grouped by test type with trend visualization. Abnormal values are highlighted. Patient-Lite shows a simplified, plain-language view consistent with data minimization.

This is a multi-app story: the primary UI is in OPD-Lite (clinician view), with a secondary simplified view in Patient-Lite. Lab-Lite's role is ensuring DiagnosticReports are correctly structured and distributed (already handled by Story 42.6). This story focuses on the consumer side.

**PRD Requirements:** FR52 (brainstorm #27)
**Epic:** 52 — Cross-App Integration & Pharmacy Awareness
**Depends on:** Story 42.6 (write-once distribute-many — provides the DiagnosticReport distribution pipeline)
**Related:** Story 42.4 (structured result templates), Story 42.5 (result authorization), Epic 20 (OPD-Lite lab results viewer — extends it with timeline/trends)

## Acceptance Criteria

1. [ ] Lab results (FHIR DiagnosticReports) from Lab-Lite appear inline in the patient's clinical timeline in OPD-Lite, alongside encounters, prescriptions, and notes.
2. [ ] Results are grouped by test type (LOINC code) with a collapsible panel per test category.
3. [ ] Trend visualization: for numeric results (e.g., glucose, hemoglobin, creatinine), a sparkline or mini-chart shows values over time (last 6-12 months).
4. [ ] Abnormal values are highlighted in the timeline — yellow for abnormal, red for critical — consistent with the flag levels from Lab-Lite.
5. [ ] Each result entry in the timeline links to a full DiagnosticReport detail view.
6. [ ] Data minimization is enforced per app:
   - OPD-Lite (clinician): full DiagnosticReport with performer, observations, annotations.
   - Patient-Lite (patient): simplified plain-language summary — test name, result summary, flag level, date. No performer, no annotations, no raw observation references.
7. [ ] The timeline aggregates results from multiple labs (if a patient has visited different labs in the network).
8. [ ] Timeline pagination/lazy-loading for patients with extensive result history (>50 results).
9. [ ] Offline: timeline renders from locally cached DiagnosticReports in Dexie/IndexedDB.
10. [ ] All result access in the timeline is audit-logged via `@ultranos/audit-logger`.

## Tasks / Subtasks

- [ ] **Task 1: DiagnosticReport Aggregation Service (OPD-Lite)** (AC: 1, 7)
  - [ ] Create `apps/opd-lite/src/lib/lab-results/report-aggregator.ts`.
  - [ ] Query function: `getPatientReports(patientRef: string, options?: { loincFilter?: string[], dateRange?: { from: string, to: string }, limit?: number, offset?: number })`.
  - [ ] Source: local Dexie store where DiagnosticReports are cached after sync from Hub (delivered by Story 42.6 distribution engine).
  - [ ] Aggregate reports from all labs — use `_ultranos.labId` to identify source lab but combine into a single timeline.
  - [ ] Sort by `effectiveDateTime` descending (most recent first).
  - [ ] Return type includes the full `FhirDiagnosticReport` (as defined in `packages/shared-types/src/fhir/diagnostic-report.schema.ts`) with `_ultranos` extensions for `flagLevel`, `templateVersion`, `sampleId`.

- [ ] **Task 2: Test Type Grouping** (AC: 2)
  - [ ] Create `apps/opd-lite/src/lib/lab-results/result-grouper.ts`.
  - [ ] Group DiagnosticReports by `code.coding[0].code` (LOINC code).
  - [ ] Map LOINC codes to display categories using a shared category mapping (can reference `apps/lab-lite/src/lib/loinc-categories.ts` or a shared version in `packages/shared-types`).
  - [ ] Output structure:
    ```typescript
    interface GroupedResults {
      category: string              // LOINC display name
      loincCode: string             // LOINC code
      results: FhirDiagnosticReport[]  // sorted by effectiveDateTime desc
      latestResult: FhirDiagnosticReport
      hasAbnormal: boolean          // any result in group is abnormal/critical
      hasCritical: boolean          // any result in group is critical
      trendData: TrendDataPoint[] | null  // for numeric results
    }

    interface TrendDataPoint {
      date: string                  // effectiveDateTime
      value: number                 // numeric result value
      unit: string                  // unit of measure
      flagLevel: 'normal' | 'abnormal' | 'critical'
      labName: string               // source lab for multi-lab differentiation
    }
    ```
  - [ ] Extract numeric values from linked Observations for trend data. If Observations are not synced (only the DiagnosticReport summary is available), use `conclusion` text parsing as fallback.

- [ ] **Task 3: Timeline Integration Component (OPD-Lite)** (AC: 1, 4, 5)
  - [ ] Create `apps/opd-lite/src/components/clinical/PatientResultTimeline.tsx`.
  - [ ] Render as a section within the existing patient encounter timeline (if one exists from Epic 20) or as a dedicated "Lab Results" tab.
  - [ ] Each timeline entry shows:
    - Date (effectiveDateTime)
    - Test category badge (LOINC display)
    - Result summary (conclusion or key observation values)
    - Flag level indicator: green dot (normal), yellow dot (abnormal), red dot (critical)
    - Source lab name (from `_ultranos.labId` mapped to facility name)
    - Tap to expand -> full DiagnosticReport detail
  - [ ] Abnormal/critical results have colored left border (yellow/red) for scan-ability.
  - [ ] RTL-ready: use logical CSS properties, icons must not mirror (medical content).

- [ ] **Task 4: Trend Visualization Component** (AC: 3)
  - [ ] Create `apps/opd-lite/src/components/clinical/ResultTrendChart.tsx`.
  - [ ] Sparkline/mini-chart for numeric result trends within a test category.
  - [ ] X-axis: time (6-12 months). Y-axis: result value with unit.
  - [ ] Reference range shading: light green band for normal range, values outside the band highlighted.
  - [ ] Data points colored by flag level (green/yellow/red).
  - [ ] Hover/tap a data point to see: exact value, date, source lab.
  - [ ] Implementation: lightweight charting — consider a minimal SVG-based sparkline component to avoid heavy chart library dependencies. If a chart library is already in the project, use it.
  - [ ] Fallback for non-numeric results (e.g., urinalysis): show a table of result summaries over time instead of a chart.
  - [ ] RTL: chart reads left-to-right regardless of page direction (time axis is universal).

- [ ] **Task 5: Abnormal Value Highlighting** (AC: 4)
  - [ ] Implement consistent flag-level styling across all timeline components:
    - `normal`: default styling, green dot indicator
    - `abnormal`: yellow background tint, yellow dot, yellow left border
    - `critical`: red background tint, red dot, red left border, bold text
  - [ ] Critical results at the top of timeline (pinned) if within last 7 days — don't let them scroll off.
  - [ ] Allergy-display precedent from CLAUDE.md Rule #4: critical lab values get high visual prominence, not collapsible.

- [ ] **Task 6: DiagnosticReport Detail View (OPD-Lite)** (AC: 5)
  - [ ] Create `apps/opd-lite/src/components/clinical/LabReportDetail.tsx` (or extend existing if one exists from Epic 20).
  - [ ] Full detail view showing all fields from the OPD projection (Story 42.6):
    - Report metadata: ID, status, issued date, effective date
    - Test type: code + category
    - Subject: patient reference
    - Performer: lab name + authorizing supervisor
    - Result observations: each linked Observation with value, unit, reference range, interpretation
    - Conclusion: narrative summary
    - Attachments: PDF/image if present (presentedForm)
    - Ultranos extensions: flagLevel, sampleId, templateVersion, source lab
  - [ ] PDF export / print button for clinical records.

- [ ] **Task 7: Patient-Lite Simplified View** (AC: 6)
  - [ ] Create `apps/patient-lite-mobile/src/components/health-passport/LabResultCard.tsx` (or equivalent path in Patient-Lite).
  - [ ] Simplified view using the Patient projection from Story 42.6:
    - Test name (human-readable)
    - Result summary (plain language: "Normal", "Your hemoglobin is 12.5 g/dL — Normal")
    - Flag level with color indicator
    - Date
    - Lab name (facility, not individual tech)
  - [ ] NO performer identity, NO annotations, NO observation references, NO raw numeric values beyond summary.
  - [ ] Plain language: avoid medical jargon where possible. Use the test's display name, not the LOINC code.
  - [ ] Low-literacy friendly: large text, clear icons, color-coded status (aligns with Story 11.7 icon-first design).

- [ ] **Task 8: Pagination and Performance** (AC: 8)
  - [ ] Implement cursor-based pagination for timeline queries: load 20 results per page, load more on scroll.
  - [ ] Lazy-load trend charts — only compute trend data for currently visible/expanded test categories.
  - [ ] Index optimization in Dexie: ensure DiagnosticReport store has compound index on `[subject+effectiveDateTime]` for efficient patient timeline queries.

- [ ] **Task 9: Offline Behavior** (AC: 9)
  - [ ] Timeline renders from Dexie-cached DiagnosticReports.
  - [ ] Trend charts compute from local data only.
  - [ ] "Last synced" indicator shows when results were last updated from Hub.
  - [ ] Missing results (not yet synced) do not leave gaps — the timeline shows what is available.

- [ ] **Task 10: Audit Logging** (AC: 10)
  - [ ] Emit audit event on timeline view: `LAB_RESULTS_TIMELINE_VIEWED` with `patientRef`, `viewedBy`, count of results displayed.
  - [ ] Emit audit event on detail view: `LAB_REPORT_DETAIL_VIEWED` with `reportId`, `patientRef`, `viewedBy`.
  - [ ] Emit audit event in Patient-Lite: `PATIENT_LAB_RESULT_VIEWED` with `reportId`, `patientRef`.

- [ ] **Task 11: Tests** (AC: 1-10)
  - [ ] Unit tests for report aggregator — verify multi-lab aggregation, sorting, pagination.
  - [ ] Unit tests for result grouper — verify LOINC grouping, trend data extraction, flag detection.
  - [ ] Unit tests for trend data extraction — numeric value parsing from Observations, handling missing data.
  - [ ] Snapshot tests for timeline component in LTR and RTL.
  - [ ] Snapshot tests for trend chart rendering with normal, abnormal, and critical data points.
  - [ ] Test that Patient-Lite view contains NO performer, NO annotations, NO raw observations — only the simplified projection fields.
  - [ ] Test abnormal highlighting — verify critical results are pinned, correct colors applied.
  - [ ] Offline test: verify timeline renders from cached data when Hub is unreachable.
  - [ ] Audit test: verify audit events emitted on timeline and detail view access.

## Dev Notes

### Integration with Story 42.6 Write-Once-Distribute-Many

This story is the **consumer side** of Story 42.6's distribution engine. Story 42.6 builds four projections — this story consumes two of them:

| Projection | Consumer | This Story's Role |
|-----------|----------|------------------|
| OPD Projection (full DiagnosticReport) | OPD-Lite | Task 1-6: aggregate, group, visualize, detail view |
| Patient Projection (simplified) | Patient-Lite | Task 7: plain-language result card |
| Logbook Projection | Lab-Lite (internal) | Not consumed by this story |
| Stats Projection | Lab-Lite (internal) | Not consumed by this story |

The OPD projection arrives at OPD-Lite via: Lab-Lite -> sync engine -> Hub -> OPD-Lite sync pull. It is stored in OPD-Lite's Dexie as a `DiagnosticReport` resource.

The Patient projection arrives at Patient-Lite via: Lab-Lite -> sync engine -> Hub -> Patient-Lite notification/sync. It is stored in the patient's health passport data.

### FHIR DiagnosticReport Schema

The base schema is defined in `packages/shared-types/src/fhir/diagnostic-report.schema.ts`. The `_ultranos` extensions relevant to this story:

- `flagLevel: 'normal' | 'abnormal' | 'critical'` — drives highlighting
- `labId: string` — identifies source lab for multi-lab aggregation
- `templateVersion: string` — links to result template (Story 42.4)
- `sampleId: string` — chain of custody reference (Story 42.3)
- `hlcTimestamp: string` — for sync conflict resolution (Tier 2 — timestamp-based merge)

### Trend Visualization — Numeric Value Extraction

Trend charts require numeric values from Observations linked to the DiagnosticReport. Two scenarios:

1. **Observations synced:** The full `Observation` resources are available in OPD-Lite's Dexie. Extract `valueQuantity.value` and `valueQuantity.unit` directly.
2. **Only DiagnosticReport synced:** If only the report summary is available (e.g., offline, or Observations not yet synced), parse numeric values from `conclusion` text. This is a best-effort fallback — the trend chart may show gaps.

**Recommendation:** Ensure Story 42.6's OPD projection includes at minimum the key observation values inline (not just references), so trend charts can render without requiring separate Observation resource sync.

### Conflict Resolution

DiagnosticReports are Tier 2 (Clinical) in `packages/sync-engine/src/conflict-tiers.ts`:
- Timestamp-based merge: newer HLC wins
- Both versions kept as addenda
- No prescription blocking

If a DiagnosticReport is amended (e.g., corrected result) while OPD-Lite has the original cached, the sync engine handles the merge. The timeline should show the latest version, with an "Amended" badge and a link to view the amendment history.

### Multi-Lab Results

A patient may visit different labs in the network. The timeline aggregates results from all labs using the `_ultranos.labId` field. Each result entry shows the source lab name. Trend charts differentiate data points by lab (e.g., different marker shape or tooltip annotation) but plot on the same axis for clinical continuity.

### Performance Considerations

A chronic disease patient might have 100+ lab results over years. Performance mitigations:
- Pagination: 20 results per page, cursor-based (not offset-based for Dexie efficiency).
- Lazy trend charts: only compute trend data for expanded test categories.
- Dexie index: compound index on `[subject.reference+effectiveDateTime]` for fast patient-scoped queries.
- Avoid loading full `presentedForm` (attachments) in the timeline — only load when the user opens the detail view.

### RTL Considerations

- Timeline layout: vertical timeline with entries stacked top-to-bottom. Left/right border indicators use `border-inline-start`.
- Trend charts: time axis always reads left-to-right (chronological). This is a medical convention that applies regardless of page direction.
- Text content: result summaries render in the document direction.
- Icons: flag level dots and medical icons (test type badges) do NOT mirror.

## Project Structure Notes

### New Files (OPD-Lite)
- `apps/opd-lite/src/lib/lab-results/report-aggregator.ts` — DiagnosticReport query/aggregation
- `apps/opd-lite/src/lib/lab-results/result-grouper.ts` — LOINC-based grouping and trend extraction
- `apps/opd-lite/src/components/clinical/PatientResultTimeline.tsx` — timeline component
- `apps/opd-lite/src/components/clinical/ResultTrendChart.tsx` — sparkline/trend visualization
- `apps/opd-lite/src/components/clinical/LabReportDetail.tsx` — full report detail view
- `apps/opd-lite/src/__tests__/lab-result-timeline.test.ts` — timeline tests
- `apps/opd-lite/src/__tests__/result-trend-chart.test.ts` — trend chart tests

### New Files (Patient-Lite)
- `apps/patient-lite-mobile/src/components/health-passport/LabResultCard.tsx` — simplified result card

### Modified Files
- `apps/opd-lite/src/lib/db.ts` (or equivalent) — ensure DiagnosticReport Dexie table has compound index for patient timeline queries
- OPD-Lite patient view layout — integrate PatientResultTimeline into existing patient clinical view

### Dependencies
- `packages/shared-types/src/fhir/diagnostic-report.schema.ts` — DiagnosticReport type definitions
- `packages/shared-types/src/fhir/observation.schema.ts` — Observation type for trend data
- `packages/sync-engine/src/conflict-tiers.ts` — Tier 2 conflict resolution
- `packages/audit-logger/` — audit event emission
- `apps/lab-lite/src/lib/loinc-categories.ts` — LOINC category mapping (consider moving to shared-types)
- Story 42.6 (distribution engine — provides the DiagnosticReport data)

## References

- FHIR R4 DiagnosticReport: https://hl7.org/fhir/R4/diagnosticreport.html
- FHIR R4 Observation: https://hl7.org/fhir/R4/observation.html
- CLAUDE.md Rule #4 (allergy display prominence — precedent for critical value highlighting)
- CLAUDE.md Rule #6 (audit every PHI access)
- CLAUDE.md Rule #7 (data minimization — Patient-Lite simplified view)
- CLAUDE.md Sync Engine Tier 2 (DiagnosticReport conflict resolution)
- Story 42.6 (write-once distribute-many — DiagnosticReport distribution)
- Story 42.4 (structured result templates)
- Story 42.5 (result authorization workflow)
- Story 11.7 (low-literacy icon-first UI — Patient-Lite design precedent)
- `packages/shared-types/src/fhir/diagnostic-report.schema.ts`
- `packages/sync-engine/src/sync-priority.ts`
- `packages/sync-engine/src/conflict-tiers.ts`
