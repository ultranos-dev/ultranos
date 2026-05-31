# Story 43.7: Pre-Release Critical Value Checklist

Status: ready-for-dev

## Story

As a lab supervisor,
I want a mandatory checklist before releasing critical values,
So that critical results are verified through a structured process before reaching the clinician.

## Acceptance Criteria

1. **Given** a result contains one or more critical values (e.g., Potassium > 6.5, Glucose < 40, Hgb < 5), **when** the supervisor attempts to release the result, **then** a mandatory checklist is displayed: "QC passed today for this analyte / Patient ID verified / Result reviewed for plausibility / Delta check reviewed (if prior result exists) / Repeat testing performed (if required by lab policy)"
2. **And** the supervisor must check each item before the Release button is enabled
3. **And** the completed checklist is stored as part of the result's audit trail
4. **And** the checklist items are configurable per lab

## Tasks / Subtasks

- [ ] Task 1: Critical value thresholds configuration (AC: #1, #4)
  - [ ] 1.1 Create `apps/lab-lite/src/lib/critical-values/types.ts` with core types:
    - `CriticalValueThreshold`: `{ loincCode, analyteName, criticalLow, criticalHigh, unit }`
    - `CriticalValueMatch`: `{ loincCode, analyteName, value, direction: 'LOW' | 'HIGH', threshold }`
    - `ChecklistItem`: `{ id, label, isRequired, isChecked, checkedBy?, checkedAt? }`
    - `CompletedChecklist`: `{ id, resultId, items: ChecklistItem[], completedBy, completedAt, hlcTimestamp }`
  - [ ] 1.2 Create `apps/lab-lite/src/lib/critical-values/default-thresholds.ts` — default critical value thresholds:
    - Potassium: < 2.5 or > 6.5 mEq/L
    - Glucose: < 40 or > 500 mg/dL
    - Hemoglobin: < 5.0 or > 20.0 g/dL
    - WBC: < 1.0 or > 50.0 (10^3/uL)
    - Platelets: < 20 or > 1000 (10^3/uL)
    - Sodium: < 120 or > 160 mEq/L
    - Calcium: < 6.0 or > 13.0 mg/dL
    - INR: > 5.0
    - Troponin: > threshold (lab-specific)
    - Additional analytes per lab configuration
  - [ ] 1.3 Add `criticalValueThresholds` Dexie table for lab-specific threshold overrides: `&loincCode, analyteName`
  - [ ] 1.4 Default thresholds used when no lab-specific override exists

- [ ] Task 2: Critical value detection engine (AC: #1)
  - [ ] 2.1 Create `apps/lab-lite/src/lib/critical-values/critical-value-detector.ts`
  - [ ] 2.2 `detectCriticalValues(results: ResultEntry[]): CriticalValueMatch[]`
  - [ ] 2.3 Checks each result value against thresholds (lab-specific overrides first, then defaults)
  - [ ] 2.4 Returns array of matches with analyte name, actual value, direction (LOW/HIGH), and threshold value
  - [ ] 2.5 All computation is offline — reads thresholds from Dexie and in-memory defaults

- [ ] Task 3: Mandatory checklist UI component (AC: #1, #2)
  - [ ] 3.1 Create `apps/lab-lite/src/components/critical-values/CriticalValueChecklist.tsx`
  - [ ] 3.2 Modal dialog that appears when supervisor clicks "Release" and critical values are detected
  - [ ] 3.3 Header: "Critical Value Checklist" with red alert styling and the detected critical values listed
  - [ ] 3.4 Default checklist items (each with a checkbox):
    - "QC passed today for [analyte]" — auto-checked if QC data from 43.2 confirms passing QC
    - "Patient ID verified (two-identifier)" — auto-checked if verification record from 43.4 exists and isComplete
    - "Result reviewed for plausibility" — auto-checked if plausibility check from 43.5 ran with no unacknowledged CRITICAL flags
    - "Delta check reviewed (if prior result exists)" — auto-checked if delta check from 43.5 ran; shows "N/A" if no prior result
    - "Repeat testing performed (if required by lab policy)" — manual check only, never auto-checked
  - [ ] 3.5 Auto-checked items display a green checkmark with "Auto-verified" label; supervisor can uncheck if they disagree
  - [ ] 3.6 Manual items require explicit supervisor click
  - [ ] 3.7 "Release" button at bottom — disabled until ALL required items are checked
  - [ ] 3.8 "Cancel" button returns to result view without releasing
  - [ ] 3.9 RTL support: logical CSS properties, checkbox labels align correctly in Arabic/Dari/Pashto

- [ ] Task 4: Checklist storage in audit trail (AC: #3)
  - [ ] 4.1 Add `completedChecklists` Dexie table: `&id, resultId, completedAt`
  - [ ] 4.2 On release, store `CompletedChecklist` with all items, their checked status, who checked them, and timestamps
  - [ ] 4.3 Add `CRITICAL_VALUE_CHECKLIST_COMPLETED` to `AuditAction` enum
  - [ ] 4.4 Emit `CRITICAL_VALUE_CHECKLIST_COMPLETED` audit event with metadata: `{ resultId, criticalValuesDetected: [...analytes], allItemsChecked: true, checkedBy }`
  - [ ] 4.5 Audit metadata must NOT include actual result values — only analyte names and whether thresholds were exceeded
  - [ ] 4.6 The completed checklist is viewable in the result detail's audit trail section

- [ ] Task 5: Configurable checklist items (AC: #4)
  - [ ] 5.1 Add "Critical Value Checklist" section to `apps/lab-lite/src/components/settings/LabSettingsView.tsx`
  - [ ] 5.2 Lab manager can:
    - Add custom checklist items (text label + required flag)
    - Remove non-default items (default items cannot be removed, only set to optional)
    - Reorder items
    - Toggle items between required and optional
  - [ ] 5.3 Add `checklistConfig` Dexie table: `&id, labId` — stores custom checklist items per lab
  - [ ] 5.4 Configuration changes are audit-logged
  - [ ] 5.5 Configuration synced to Hub for backup and cross-device consistency

- [ ] Task 6: Configurable critical value thresholds (AC: #4)
  - [ ] 6.1 Add "Critical Value Thresholds" section to settings (alongside or within the checklist config section)
  - [ ] 6.2 Lab manager can override default thresholds per analyte
  - [ ] 6.3 Can add new analytes not in the default list
  - [ ] 6.4 Threshold changes are versioned and audit-logged
  - [ ] 6.5 Share UI pattern with Story 43.8 (Localized Reference Ranges) settings

- [ ] Task 7: Integration with result authorization workflow (AC: #1, #2)
  - [ ] 7.1 Hook into the authorization workflow from Story 42.5
  - [ ] 7.2 When supervisor clicks "Release" (approve), run critical value detection first
  - [ ] 7.3 If critical values detected: show checklist modal (Task 3) — release blocked until checklist complete
  - [ ] 7.4 If no critical values: proceed with normal release flow (no checklist)
  - [ ] 7.5 Critical values ALWAYS require supervisor authorization regardless of auto-verify rules (reinforcing 42.5 AC)

- [ ] Task 8: Tests (AC: all)
  - [ ] 8.1 Unit test: critical value detector identifies Potassium > 6.5 as critical high
  - [ ] 8.2 Unit test: critical value detector identifies Glucose < 40 as critical low
  - [ ] 8.3 Unit test: critical value detector returns empty array for normal values
  - [ ] 8.4 Unit test: lab-specific threshold overrides take precedence over defaults
  - [ ] 8.5 Unit test: checklist auto-checks QC item when QC passed today
  - [ ] 8.6 Unit test: checklist auto-checks patient ID item when two-identifier verification exists
  - [ ] 8.7 Unit test: checklist auto-checks plausibility item when no unacknowledged CRITICAL flags
  - [ ] 8.8 Unit test: "Release" button disabled until all required items checked
  - [ ] 8.9 Unit test: completed checklist stored in Dexie with correct structure
  - [ ] 8.10 Unit test: `CRITICAL_VALUE_CHECKLIST_COMPLETED` audit event emitted
  - [ ] 8.11 Unit test: audit metadata does NOT contain actual result values
  - [ ] 8.12 Unit test: custom checklist items from lab config appear in checklist
  - [ ] 8.13 Component test: checklist modal renders all items with correct auto-check states
  - [ ] 8.14 Component test: cancel button closes modal without releasing
  - [ ] 8.15 RTL snapshot test: CriticalValueChecklist in both LTR and RTL
  - [ ] 8.16 Offline test: checklist works entirely offline (Dexie data only)

## Dev Notes

### Architecture

The critical value checklist is a **gate** in the result authorization workflow from Story 42.5. It activates only when critical values are detected. The gate is:
1. Critical value detection runs on result data
2. If critical values found, checklist modal blocks release
3. Supervisor must complete checklist
4. Completed checklist is stored and audit-logged
5. Release proceeds through normal authorization flow

The checklist is "smart" — it auto-verifies items where the system already has evidence (QC passed, patient ID verified, plausibility checked). This reduces redundant manual work while maintaining the audit record.

### Critical Value Thresholds

```typescript
export const DEFAULT_CRITICAL_THRESHOLDS: CriticalValueThreshold[] = [
  { loincCode: '2823-3', analyteName: 'Potassium',  criticalLow: 2.5, criticalHigh: 6.5,  unit: 'mEq/L' },
  { loincCode: '2345-7', analyteName: 'Glucose',    criticalLow: 40,  criticalHigh: 500,  unit: 'mg/dL' },
  { loincCode: '718-7',  analyteName: 'Hemoglobin', criticalLow: 5.0, criticalHigh: 20.0, unit: 'g/dL' },
  { loincCode: '6690-2', analyteName: 'WBC',        criticalLow: 1.0, criticalHigh: 50.0, unit: '10^3/uL' },
  { loincCode: '777-3',  analyteName: 'Platelets',  criticalLow: 20,  criticalHigh: 1000, unit: '10^3/uL' },
  { loincCode: '2951-2', analyteName: 'Sodium',     criticalLow: 120, criticalHigh: 160,  unit: 'mEq/L' },
  { loincCode: '17861-6',analyteName: 'Calcium',    criticalLow: 6.0, criticalHigh: 13.0, unit: 'mg/dL' },
  { loincCode: '6301-6', analyteName: 'INR',        criticalLow: null, criticalHigh: 5.0, unit: '' },
]
```

### Auto-Verification Logic

Each checklist item checks specific prior story artifacts:

| Checklist Item | Auto-verify Source | Condition |
|----------------|-------------------|-----------|
| QC passed today | Story 43.2 QC temporal binding | QC run for this analyte exists today with `status: 'pass'` |
| Patient ID verified | Story 43.4 verification record | `PatientVerificationRecord.isComplete === true` for this sample |
| Plausibility reviewed | Story 43.5 plausibility checker | No unacknowledged CRITICAL flags for this result |
| Delta check reviewed | Story 43.5 delta checker | Delta check ran (flag acknowledged or no flag raised); "N/A" if no prior result |
| Repeat testing | Manual only | Never auto-checked — lab policy decision |

Auto-verified items still appear as checked in the checklist for documentation purposes. The supervisor can uncheck them if they have concerns.

### Integration with Authorization Flow (42.5)

The checklist inserts between the supervisor's "Release" action and the actual release. Modified flow:

```
Supervisor clicks "Release"
  → Critical value detection runs
  → If critical values found:
      → Show CriticalValueChecklist modal
      → All required items must be checked
      → Supervisor clicks "Release" in modal
  → Release proceeds (DiagnosticReport status → 'final')
  → Audit events emitted
```

### Files to Create

| File | Purpose |
|------|---------|
| `apps/lab-lite/src/lib/critical-values/types.ts` | Core types and interfaces |
| `apps/lab-lite/src/lib/critical-values/default-thresholds.ts` | Default critical value thresholds |
| `apps/lab-lite/src/lib/critical-values/critical-value-detector.ts` | Detection engine |
| `apps/lab-lite/src/components/critical-values/CriticalValueChecklist.tsx` | Mandatory checklist modal |
| `apps/lab-lite/src/__tests__/critical-value-detector.test.ts` | Unit tests for detection engine |
| `apps/lab-lite/src/__tests__/critical-value-checklist.test.tsx` | Component tests for checklist UI |

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared-types/src/enums.ts` | Add `CRITICAL_VALUE_CHECKLIST_COMPLETED` to `AuditAction` |
| `apps/lab-lite/src/lib/db.ts` | Add `criticalValueThresholds`, `completedChecklists`, `checklistConfig` tables |
| `apps/lab-lite/src/lib/audit-client.ts` | Add `reportChecklistEvent()` helper |
| `apps/lab-lite/src/components/settings/LabSettingsView.tsx` | Add threshold and checklist configuration sections |
| Authorization workflow component (from 42.5) | Insert critical value gate before release |

### Pitfalls

1. **Auto-check reliability:** Auto-verification depends on data from Stories 43.2, 43.4, and 43.5. If those stories are not yet implemented, all items default to manual (unchecked). Design the auto-check logic to gracefully degrade.
2. **Checklist bypass prevention:** There must be no code path that bypasses the checklist when critical values are detected. The release mutation should independently verify that a completed checklist exists for any result with critical values.
3. **PHI in audit:** The audit event must record which analytes had critical values (e.g., "Potassium - HIGH") but must NOT include the actual numeric values.
4. **Configurable vs. required:** Default checklist items should be marked as `isRequired: true` and cannot be removed by lab configuration. Labs can only add custom items or toggle non-default items.
5. **Offline checklist:** The entire checklist flow works offline. Completed checklists are stored in Dexie and synced to Hub. No network dependency.
6. **Dexie version coordination:** This story adds multiple tables. Coordinate with Stories 43.3, 43.4, 43.5, and 43.6 for version numbering.

### Project Structure Notes

- Lab-Lite uses Next.js 15 App Router with `[locale]` dynamic segment
- The `critical-values/` module is self-contained under `apps/lab-lite/src/lib/critical-values/`
- Checklist UI is a modal component that overlays the authorization view
- Settings integration extends the existing `LabSettingsView.tsx` component
- All client components use `'use client'` directive

### References

- Epic 43 definition: `_bmad-output/planning-artifacts/epics.md` (line 5671)
- Story 42.5 (Result Authorization Workflow) — release workflow this story gates
- Story 43.2 (QC-Result Temporal Binding) — QC status auto-verification source
- Story 43.4 (Patient ID Verification Logging) — patient ID auto-verification source
- Story 43.5 (Result Plausibility Checker) — plausibility auto-verification source
- LOINC categories: `apps/lab-lite/src/lib/loinc-categories.ts`
- CLAUDE.md Rule #6: Every PHI access must emit audit event
