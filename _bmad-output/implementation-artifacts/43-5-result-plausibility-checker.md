# Story 43.5: Result Plausibility Checker

Status: ready-for-dev

## Story

As a lab technician working alone,
I want the system to automatically check results for plausibility,
So that I have a "second opinion" that catches data entry errors and implausible analyzer outputs.

## Acceptance Criteria

1. **Given** a result has been entered, **when** the tech saves the result, **then** the system runs automatic checks: (a) absolute range check — flags physiologically impossible values (e.g., WBC > 500,000), (b) delta check — compares to patient's last result for the same test if available and flags significant changes (configurable per analyte), (c) internal consistency — flags combinations that are clinically inconsistent (e.g., very low RBC with normal hemoglobin)
2. **And** flagged results show a warning with the reason: "Result flagged: [reason]. Please verify before releasing."
3. **And** the tech can acknowledge the flag with an explanation (e.g., "confirmed — patient has known CML") or re-enter the result
4. **And** flag acknowledgments are logged in the audit trail

## Tasks / Subtasks

- [ ] Task 1: Plausibility rule data model and configuration (AC: #1)
  - [ ] 1.1 Create `apps/lab-lite/src/lib/plausibility/types.ts` with core types:
    - `PlausibilityFlag`: `{ id, ruleType, analyte, severity, message, currentValue, referenceValue?, threshold? }`
    - `PlausibilityRuleType`: `'ABSOLUTE_RANGE' | 'DELTA_CHECK' | 'INTERNAL_CONSISTENCY'`
    - `PlausibilitySeverity`: `'WARNING' | 'CRITICAL'` (critical = physiologically impossible)
    - `FlagAcknowledgment`: `{ flagId, acknowledgedBy, acknowledgedAt, explanation, hlcTimestamp }`
  - [ ] 1.2 Create `apps/lab-lite/src/lib/plausibility/absolute-ranges.ts` — lookup table of physiologically impossible ranges per analyte:
    - Keyed by LOINC code
    - Fields: `loincCode`, `analyteName`, `absMin`, `absMax`, `unit`, `criticalMin`, `criticalMax`
    - Include ranges for the 8 existing LOINC categories plus common individual analytes within panels
  - [ ] 1.3 Create `apps/lab-lite/src/lib/plausibility/delta-thresholds.ts` — configurable delta check thresholds per analyte:
    - Fields: `loincCode`, `analyteName`, `maxDeltaPercent`, `maxDeltaAbsolute`, `timeWindowHours`
    - Default thresholds based on clinical literature (e.g., hemoglobin > 30% change in 24h is suspicious)
  - [ ] 1.4 Create `apps/lab-lite/src/lib/plausibility/consistency-rules.ts` — internal consistency rule definitions:
    - Each rule: `{ id, name, condition: (results: Record<string, number>) => boolean, message: string }`
    - Initial rules: RBC vs Hemoglobin, MCV vs RBC, Platelet vs MPV, ALT vs AST ratios, Glucose vs HbA1c
  - [ ] 1.5 Add `plausibilityConfig` Dexie table for lab-specific threshold overrides (see Story 43.8 integration)

- [ ] Task 2: Absolute range check engine (AC: #1a)
  - [ ] 2.1 Create `apps/lab-lite/src/lib/plausibility/absolute-range-checker.ts`
  - [ ] 2.2 `checkAbsoluteRange(loincCode: string, value: number): PlausibilityFlag | null`
  - [ ] 2.3 Returns `CRITICAL` severity for values outside physiological possibility (e.g., negative values, WBC > 500,000)
  - [ ] 2.4 Returns `WARNING` severity for values outside expected clinical range but technically possible
  - [ ] 2.5 Falls through with no flag if value is within acceptable bounds
  - [ ] 2.6 All computation is local (Dexie data only) — zero network calls

- [ ] Task 3: Delta check engine (AC: #1b)
  - [ ] 3.1 Create `apps/lab-lite/src/lib/plausibility/delta-checker.ts`
  - [ ] 3.2 `checkDelta(patientRef: string, loincCode: string, currentValue: number): Promise<PlausibilityFlag | null>`
  - [ ] 3.3 Query Dexie for the patient's most recent previous result for the same LOINC code
  - [ ] 3.4 Calculate percentage change and absolute change
  - [ ] 3.5 Flag if change exceeds configured threshold within the time window
  - [ ] 3.6 Include previous value, date, and percentage change in the flag message
  - [ ] 3.7 If no prior result exists, skip delta check (no flag)

- [ ] Task 4: Internal consistency check engine (AC: #1c)
  - [ ] 4.1 Create `apps/lab-lite/src/lib/plausibility/consistency-checker.ts`
  - [ ] 4.2 `checkConsistency(results: Record<string, number>): PlausibilityFlag[]`
  - [ ] 4.3 Runs all applicable consistency rules against the entered result set
  - [ ] 4.4 Only applies when the result entry contains multiple related analytes (e.g., CBC panel)
  - [ ] 4.5 Returns array of flags (multiple inconsistencies possible in a single panel)

- [ ] Task 5: Plausibility orchestrator (AC: #1, #2)
  - [ ] 5.1 Create `apps/lab-lite/src/lib/plausibility/plausibility-checker.ts` — main orchestrator
  - [ ] 5.2 `runPlausibilityChecks(patientRef: string, results: ResultEntry[]): Promise<PlausibilityFlag[]>`
  - [ ] 5.3 Runs all three check types in parallel (absolute, delta, consistency)
  - [ ] 5.4 Deduplicates and sorts flags by severity (CRITICAL first, then WARNING)
  - [ ] 5.5 All computation is offline-only — reads from Dexie, no network calls
  - [ ] 5.6 Returns empty array if all checks pass

- [ ] Task 6: Flag warning UI (AC: #2, #3)
  - [ ] 6.1 Create `apps/lab-lite/src/components/plausibility/PlausibilityWarningBanner.tsx`
  - [ ] 6.2 Renders as a high-visibility banner below the result entry form when flags exist
  - [ ] 6.3 CRITICAL flags: red background, exclamation icon, "Result flagged: [reason]. Please verify before releasing."
  - [ ] 6.4 WARNING flags: yellow/amber background, warning icon, same message format
  - [ ] 6.5 Each flag has two actions: "Acknowledge & Explain" (opens text input) or "Re-enter Result" (clears the field)
  - [ ] 6.6 RTL support: logical CSS properties, banner layout works in Arabic/Dari/Pashto

- [ ] Task 7: Flag acknowledgment workflow (AC: #3, #4)
  - [ ] 7.1 Create `apps/lab-lite/src/components/plausibility/FlagAcknowledgmentDialog.tsx`
  - [ ] 7.2 Tech enters explanation text (minimum 10 characters)
  - [ ] 7.3 Acknowledgment stored in Dexie linked to the result and the flag
  - [ ] 7.4 After acknowledgment, the flag remains visible but styled as "acknowledged" (dimmed, with green checkmark)
  - [ ] 7.5 Result cannot be released (sent to authorization from 42.5) until all CRITICAL flags are acknowledged or resolved

- [ ] Task 8: Audit trail integration (AC: #4)
  - [ ] 8.1 Emit `PLAUSIBILITY_FLAG_RAISED` audit event when flags are generated (metadata: flag count, types, severity levels — no result values)
  - [ ] 8.2 Emit `PLAUSIBILITY_FLAG_ACKNOWLEDGED` audit event when tech acknowledges (metadata: flagId, ruleType, acknowledged explanation summary length — not the explanation text itself to avoid PHI)
  - [ ] 8.3 Add `PLAUSIBILITY_FLAG_RAISED` and `PLAUSIBILITY_FLAG_ACKNOWLEDGED` to `AuditAction` enum
  - [ ] 8.4 Add `reportPlausibilityEvent()` helper to `apps/lab-lite/src/lib/audit-client.ts`

- [ ] Task 9: Configurable threshold UI (AC: #1)
  - [ ] 9.1 Add "Plausibility Thresholds" section to `apps/lab-lite/src/components/settings/LabSettingsView.tsx`
  - [ ] 9.2 Allow lab manager role to view and override default delta thresholds per analyte
  - [ ] 9.3 Changes to thresholds are stored in `plausibilityConfig` Dexie table
  - [ ] 9.4 Threshold changes are audit-logged
  - [ ] 9.5 Coordinate with Story 43.8 (Localized Reference Ranges) — share the configuration UI pattern

- [ ] Task 10: Tests (AC: all)
  - [ ] 10.1 Unit test: absolute range checker flags physiologically impossible WBC value (> 500,000)
  - [ ] 10.2 Unit test: absolute range checker passes normal WBC value
  - [ ] 10.3 Unit test: delta checker flags > 30% hemoglobin change in 24h
  - [ ] 10.4 Unit test: delta checker passes when no prior result exists (no flag)
  - [ ] 10.5 Unit test: delta checker passes when change is within threshold
  - [ ] 10.6 Unit test: consistency checker flags low RBC with normal hemoglobin
  - [ ] 10.7 Unit test: orchestrator runs all three checks and returns combined flags
  - [ ] 10.8 Unit test: orchestrator sorts CRITICAL flags before WARNING flags
  - [ ] 10.9 Unit test: flag acknowledgment stores explanation and marks flag as acknowledged
  - [ ] 10.10 Unit test: CRITICAL flags block result release until acknowledged
  - [ ] 10.11 Unit test: audit events emitted for flag raised and flag acknowledged
  - [ ] 10.12 Unit test: custom thresholds override defaults when configured
  - [ ] 10.13 Component test: warning banner renders with correct severity styling
  - [ ] 10.14 RTL snapshot test: PlausibilityWarningBanner in both LTR and RTL
  - [ ] 10.15 Offline test: all plausibility checks work with Dexie data only (no network)

## Dev Notes

### Architecture

The plausibility checker is a **pure offline computation layer**. It reads from Dexie only and never makes network calls. This is critical because:
1. Lab-Lite operates in offline-prone environments
2. Plausibility checks must be instantaneous (< 50ms per NFR1)
3. The "second opinion" must work when the tech is alone without connectivity

The checker runs at the moment of result save (before authorization from 42.5), not at release time. This gives the tech immediate feedback while they still have the sample and analyzer in context.

### Absolute Range Reference Table

```typescript
// Example entries — full table will have ~50-80 analytes
export const ABSOLUTE_RANGES: Record<string, AbsoluteRange> = {
  // CBC
  '6690-2':  { analyteName: 'WBC',        absMin: 0, absMax: 500000, unit: '10^3/uL', criticalMin: 0.5,  criticalMax: 100 },
  '789-8':   { analyteName: 'RBC',        absMin: 0, absMax: 15,     unit: '10^6/uL', criticalMin: 1.0,  criticalMax: 8.0 },
  '718-7':   { analyteName: 'Hemoglobin', absMin: 0, absMax: 30,     unit: 'g/dL',    criticalMin: 3.0,  criticalMax: 22.0 },
  '4544-3':  { analyteName: 'Hematocrit', absMin: 0, absMax: 80,     unit: '%',       criticalMin: 10,   criticalMax: 65 },
  '777-3':   { analyteName: 'Platelets',  absMin: 0, absMax: 5000,   unit: '10^3/uL', criticalMin: 10,   criticalMax: 1500 },
  // Metabolic
  '2345-7':  { analyteName: 'Glucose',    absMin: 0, absMax: 2000,   unit: 'mg/dL',   criticalMin: 30,   criticalMax: 600 },
  '2823-3':  { analyteName: 'Potassium',  absMin: 0, absMax: 15,     unit: 'mEq/L',   criticalMin: 2.5,  criticalMax: 6.5 },
  '2951-2':  { analyteName: 'Sodium',     absMin: 0, absMax: 250,    unit: 'mEq/L',   criticalMin: 115,  criticalMax: 160 },
  // ... more analytes
}
```

### Delta Check Thresholds

```typescript
export const DEFAULT_DELTA_THRESHOLDS: Record<string, DeltaThreshold> = {
  '718-7':  { analyteName: 'Hemoglobin', maxDeltaPercent: 30, maxDeltaAbsolute: 3.0, timeWindowHours: 72 },
  '2823-3': { analyteName: 'Potassium',  maxDeltaPercent: 50, maxDeltaAbsolute: 2.0, timeWindowHours: 24 },
  '2345-7': { analyteName: 'Glucose',    maxDeltaPercent: 100, maxDeltaAbsolute: 200, timeWindowHours: 24 },
  // ... more analytes
}
```

### Internal Consistency Rules

```typescript
export const CONSISTENCY_RULES: ConsistencyRule[] = [
  {
    id: 'rbc-hgb-consistency',
    name: 'RBC vs Hemoglobin',
    requiredAnalytes: ['789-8', '718-7'], // RBC, Hemoglobin
    condition: (values) => {
      const rbc = values['789-8']
      const hgb = values['718-7']
      // Very low RBC should correlate with low hemoglobin
      return rbc < 2.0 && hgb > 12.0
    },
    message: 'Low RBC ({rbc}) with normal/high Hemoglobin ({hgb}) — verify both values',
  },
  // ... more rules
]
```

### Integration with Result Templates (42.4)

The plausibility checker hooks into the result entry form from Story 42.4. After the tech enters values into the structured template and clicks "Save":

1. Result template validates data types and required fields (42.4 responsibility)
2. Plausibility checker runs all three check types (this story)
3. If flags exist, the warning banner appears between the form and the Save/Submit button
4. Tech must resolve or acknowledge all CRITICAL flags before the result can proceed to authorization (42.5)

### Integration with Localized Reference Ranges (43.8)

The absolute range table in this story contains **physiological impossibility ranges** (hard limits). These are different from the **reference ranges** in Story 43.8 (population-specific normal/abnormal boundaries). The plausibility checker uses:
- `absMin`/`absMax` from this story: "Is this value physically possible?"
- Reference ranges from 43.8: "Is this value normal for this patient population?"

Story 43.8 may extend the plausibility checker with population-specific flagging after this story is implemented.

### Files to Create

| File | Purpose |
|------|---------|
| `apps/lab-lite/src/lib/plausibility/types.ts` | Core types and interfaces |
| `apps/lab-lite/src/lib/plausibility/absolute-ranges.ts` | Physiological impossibility lookup table |
| `apps/lab-lite/src/lib/plausibility/delta-thresholds.ts` | Configurable delta check thresholds |
| `apps/lab-lite/src/lib/plausibility/consistency-rules.ts` | Internal consistency rule definitions |
| `apps/lab-lite/src/lib/plausibility/absolute-range-checker.ts` | Absolute range check engine |
| `apps/lab-lite/src/lib/plausibility/delta-checker.ts` | Delta check engine (queries Dexie) |
| `apps/lab-lite/src/lib/plausibility/consistency-checker.ts` | Internal consistency check engine |
| `apps/lab-lite/src/lib/plausibility/plausibility-checker.ts` | Main orchestrator |
| `apps/lab-lite/src/components/plausibility/PlausibilityWarningBanner.tsx` | Flag warning UI |
| `apps/lab-lite/src/components/plausibility/FlagAcknowledgmentDialog.tsx` | Acknowledgment text input |
| `apps/lab-lite/src/__tests__/plausibility-checker.test.ts` | Unit tests for all check engines |
| `apps/lab-lite/src/__tests__/plausibility-ui.test.tsx` | Component tests for warning UI |

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared-types/src/enums.ts` | Add `PLAUSIBILITY_FLAG_RAISED`, `PLAUSIBILITY_FLAG_ACKNOWLEDGED` to `AuditAction` |
| `apps/lab-lite/src/lib/db.ts` | Add `plausibilityConfig` table, add `flagAcknowledgments` table |
| `apps/lab-lite/src/lib/audit-client.ts` | Add `reportPlausibilityEvent()` helper |
| `apps/lab-lite/src/components/settings/LabSettingsView.tsx` | Add plausibility threshold configuration section |
| Result entry form component (from 42.4) | Hook plausibility checker on save |

### Pitfalls

1. **Performance:** The delta checker queries Dexie for prior results. Ensure the query is indexed by `patientRef + loincCode` and returns only the most recent result, not all history.
2. **False positives in consistency rules:** Consistency rules must account for known clinical conditions (e.g., thalassemia causes low RBC with relatively preserved hemoglobin). The acknowledgment mechanism handles this, but rules should not be overly aggressive.
3. **PHI in audit events:** Flag messages may reference result values. Audit events must NOT include the actual values — only the flag type, severity, and analyte name.
4. **Threshold overrides scope:** Lab-specific threshold overrides apply only to the local lab instance. They are synced to Hub for backup but do not affect other labs.
5. **Empty panel results:** If a tech enters only one analyte from a panel, consistency rules for that panel should not fire. Only run consistency checks when all required analytes for a rule are present.

### Project Structure Notes

- Lab-Lite uses Next.js 15 App Router with `[locale]` dynamic segment
- The `plausibility/` module is a self-contained library under `apps/lab-lite/src/lib/plausibility/`
- All computation is synchronous or Dexie-async — no network calls
- LOINC codes are the canonical key for analyte identification (matches `apps/lab-lite/src/lib/loinc-categories.ts`)
- Existing result data in Dexie follows FHIR Observation schema (`packages/shared-types/src/fhir/observation.schema.ts`)

### References

- Epic 43 definition: `_bmad-output/planning-artifacts/epics.md` (line 5642)
- Story 42.4 (Lab Result Templates & Structured Data Entry) — result entry form integration point
- Story 42.5 (Result Authorization Workflow) — authorization gate that plausibility flags feed into
- Story 43.8 (Localized Reference Ranges) — population-specific ranges that extend this checker
- LOINC categories: `apps/lab-lite/src/lib/loinc-categories.ts`
- FHIR Observation schema: `packages/shared-types/src/fhir/observation.schema.ts`
- CLAUDE.md Rule #6: Every PHI access must emit audit event
