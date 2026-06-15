# Story 42.4: Lab Result Templates & Structured Data Entry

Status: review

## Story

As a lab technician,
I want to enter results into structured templates specific to each test type,
so that results are standardized, auto-calculated fields reduce errors, and abnormal values are automatically flagged.

## Context

This story replaces free-text result entry with structured, template-driven data entry for each of the 8 existing LOINC categories. Templates define fields, data types, units, reference ranges (age/gender-specific), decimal precision, and auto-calculated formulas. Results outside reference ranges are automatically flagged using FHIR interpretation codes (L, H, LL, HH). Templates are bundled for offline use in Dexie and versioned so that historical results always reference the template version they were entered against.

This is the data entry counterpart to the existing upload workflow (Story 12.3). The upload wizard handles scanned/photographed paper results. This story creates a parallel "Enter Results" flow for electronically ordered tests (Story 42.2) where the tech enters structured numeric/coded values directly against a sample in "In Processing" status (Story 42.3).

**PRD Requirements:** FR42 (brainstorm #21, #22, #23)
**Dependencies:** Story 42.2 (Electronic Orders), Story 42.3 (Sample Accessioning)

## Acceptance Criteria

1. [x] Given a sample is in "In Processing" status, when the tech opens the result entry form, then a template matching the ordered test type is loaded with: field names, data types (numeric/text/select), units of measure, decimal precision, and reference ranges (age/gender-specific).
2. [x] Results outside reference ranges are auto-flagged: Low (L), High (H), Critical Low (LL), Critical High (HH) using FHIR Observation interpretation codes.
3. [x] Auto-calculated fields (e.g., MCV, MCH, MCHC in CBC) compute in real-time as prerequisite values are entered.
4. [x] Auto-calculated fields are visually distinguished (read-only, different background) and display the formula on hover/focus.
5. [x] Templates are bundled offline in Dexie and versioned — old results reference the template version they were entered against.
6. [x] The system ships with templates for all 8 existing LOINC categories plus a generic template for unlisted tests.
7. [x] A comment field is available for per-field annotations and a separate comment field for per-report annotations.
8. [x] Critical values (LL, HH) trigger a visual alert (red banner) and require the tech to acknowledge before saving.
9. [x] Partially entered results can be saved as draft (FHIR Observation status: `registered`) and resumed later.
10. [x] Completed results are saved with FHIR Observation status `preliminary` (pending authorization per Story 42.5).
11. [x] Each saved result creates one FHIR DiagnosticReport (panel-level) linking to individual FHIR Observation resources (one per field).
12. [x] All result saves emit an audit event via `@ultranos/audit-logger` with technician ID, sample ID, template version, and field count.
13. [x] The result entry form is fully RTL-compatible and i18n-ready with all labels in the translation catalog.
14. [x] Data minimization: the result entry form displays only patient first name + age (consistent with CLAUDE.md Rule #7).

## Tasks / Subtasks

- [x] **Task 1: Template Data Model & Seed Data** (AC: 1, 5, 6)
  - [x] Create `apps/lab-lite/src/lib/result-templates.ts` with the `ResultTemplate` and `TemplateField` type definitions (see Dev Notes for full schema).
  - [x] Define all 8 LOINC category templates with specific fields, units, reference ranges, and auto-calc formulas (see Dev Notes for per-template field lists).
  - [x] Define the generic "Other" template with configurable free-text and numeric fields.
  - [x] Add template version field (`templateVersion: string` in semver format) and a `TEMPLATE_REGISTRY` lookup map keyed by LOINC code.

- [x] **Task 2: Dexie Schema Update for Templates & Results** (AC: 5, 9, 11)
  - [x] Add Dexie v4 schema in `apps/lab-lite/src/lib/db.ts`:
    - `result_templates` table: `&id, loincCode, version` — stores template definitions for offline use.
    - `lab_results` table: `&id, sampleId, status, templateId, templateVersion, [sampleId+status]` — stores draft and completed structured results.
    - `lab_observations` table: `&id, resultId, fieldCode, [resultId+fieldCode]` — stores individual observation values per result.
  - [x] Create migration from v3 to v4 with the new tables.
  - [x] Seed templates into Dexie on first app load via a `seedTemplates()` function.

- [x] **Task 3: Abnormal Flagging Engine** (AC: 2, 8)
  - [x] Create `apps/lab-lite/src/lib/abnormal-flags.ts`.
  - [x] Implement `evaluateFlag(value: number, field: TemplateField, patientAge: number, patientGender: string): AbnormalFlag | null`.
  - [x] Flag logic:
    - `HH` (Critical High): value >= `criticalHigh` threshold
    - `H` (High): value >= `referenceHigh` but < `criticalHigh`
    - `L` (Low): value <= `referenceLow` but > `criticalLow`
    - `LL` (Critical Low): value <= `criticalLow` threshold
    - `null`: within normal range
  - [x] Reference ranges are resolved from the template field's `referenceRanges` array, filtered by patient age and gender.
  - [x] Export `AbnormalFlag` type: `'L' | 'H' | 'LL' | 'HH'`.
  - [x] Unit tests: boundary values, age/gender-specific ranges, missing ranges (no flag).

- [x] **Task 4: Auto-Calculation Engine** (AC: 3, 4)
  - [x] Create `apps/lab-lite/src/lib/auto-calc.ts`.
  - [x] Implement `computeAutoFields(values: Record<string, number | null>, template: ResultTemplate): Record<string, number | null>`.
  - [x] Each auto-calc field defines a `formula` function referencing other field codes.
  - [x] If any prerequisite field is null/empty, the calculated field remains null (no partial calculations).
  - [x] Round results to the field's `decimalPrecision`.
  - [x] Unit tests: CBC calculated fields, null prerequisite handling, precision rounding.

- [x] **Task 5: Result Entry Form Component** (AC: 1, 2, 3, 4, 7, 8, 9, 13, 14)
  - [x] Create `apps/lab-lite/src/components/ResultEntryForm.tsx`.
  - [x] Props: `sampleId`, `template`, `patientFirstName`, `patientAge`, `patientGender`, `onSave`, `onSaveDraft`, `existingDraft?`.
  - [x] Render template fields dynamically:
    - Numeric fields: `<input type="number" step={10^-decimalPrecision} />` with unit label.
    - Text fields: `<input type="text" />`.
    - Select fields: `<select>` with coded options from template.
    - Auto-calc fields: read-only `<input>` with `bg-neutral-100` background and formula tooltip.
  - [x] Per-field comment icon that expands an inline textarea.
  - [x] Per-report comment textarea at the bottom of the form.
  - [x] Real-time abnormal flag badges next to each numeric field (color-coded: amber for L/H, red for LL/HH).
  - [x] Critical value acknowledgment: if any field is LL or HH, show a red banner at the top and require a checkbox acknowledgment before enabling the Save button.
  - [x] "Save as Draft" button (always enabled) and "Complete & Submit" button (requires all required fields filled + critical ack if applicable).
  - [x] Patient header showing first name + age only (data minimization).
  - [x] All labels via `useTranslations('resultEntry')` — add keys to `en.json`.
  - [x] RTL-compatible using logical CSS properties throughout.

- [x] **Task 6: FHIR Resource Mapping** (AC: 10, 11)
  - [x] Create `apps/lab-lite/src/lib/result-to-fhir.ts`.
  - [x] `mapResultToFhirBundle(result, observations, template, sample)` returns:
    - One `DiagnosticReport` with `status: 'preliminary'`, `code` from template LOINC, `result` array referencing each Observation.
    - One `Observation` per field with `status: 'preliminary'`, `code` from field LOINC, `valueQuantity` (numeric) or `valueString` (text), `interpretation` with the abnormal flag code, `referenceRange` with the applicable range.
  - [x] Map `_ultranos` extensions: `createdAt`, `hlcTimestamp`, `isOfflineCreated: true`, `templateVersion`.
  - [x] Unit tests: FHIR bundle structure validation against existing Zod schemas.

- [x] **Task 7: Integration with Sample Workflow** (AC: 1, 9, 10)
  - [x] Create `apps/lab-lite/src/app/[locale]/results/[sampleId]/enter/page.tsx` — the result entry page.
  - [x] Load the sample from Dexie, resolve the ordered test's LOINC code, look up the matching template.
  - [x] If a draft exists for this sample, pre-populate the form.
  - [x] On "Save as Draft": persist to `lab_results` + `lab_observations` in Dexie with status `draft`.
  - [x] On "Complete & Submit": persist with status `completed`, update sample status pipeline, and queue the FHIR bundle for sync.
  - [x] Redirect to sample detail page after save.

- [x] **Task 8: Audit & i18n** (AC: 12, 13)
  - [x] Emit `LAB_RESULT_ENTERED` audit event on save (draft or complete) with: technician ID, sample ID, template version, field count, flag summary (count of L/H/LL/HH), and save type (draft/complete).
  - [x] Add all result entry i18n keys to `apps/lab-lite/messages/en.json` under a `resultEntry` namespace.
  - [x] Add corresponding keys to `ar.json`, `prs.json`, `ps.json` (translation values can be English placeholders initially, marked with `[TODO:translate]`).

## Dev Notes

### Template Data Structure

```typescript
interface ReferenceRange {
  gender?: 'male' | 'female' | 'all'       // 'all' or omitted = applies to both
  ageMin?: number                           // inclusive, in years
  ageMax?: number                           // inclusive, in years
  referenceLow: number
  referenceHigh: number
  criticalLow?: number                     // if omitted, no LL flag for this range
  criticalHigh?: number                    // if omitted, no HH flag for this range
}

interface TemplateField {
  code: string                              // unique within template (e.g., 'wbc', 'rbc')
  loincCode: string                         // individual LOINC code for this analyte
  label: string                             // i18n key (e.g., 'resultEntry.fields.wbc')
  type: 'numeric' | 'text' | 'select'
  unit?: string                             // e.g., '10^3/uL', 'g/dL', 'mg/dL'
  decimalPrecision?: number                 // decimal places (default: 2)
  required: boolean
  referenceRanges?: ReferenceRange[]        // only for numeric fields
  options?: { value: string; label: string }[] // only for select fields
  autoCalc?: {
    formula: (values: Record<string, number | null>) => number | null
    formulaDisplay: string                  // human-readable (e.g., 'Hct / RBC')
    prerequisites: string[]                 // field codes required for calculation
  }
  sortOrder: number                         // display order in form
}

interface ResultTemplate {
  id: string                                // e.g., 'tpl-cbc-v1'
  loincCode: string                         // panel-level LOINC code
  loincDisplay: string                      // e.g., 'Blood Work — CBC'
  templateVersion: string                   // semver, e.g., '1.0.0'
  fields: TemplateField[]
  category: string                          // grouping label
  effectiveDate: string                     // ISO date when this version became active
}
```

### The 8 LOINC Category Templates

**1. Blood Work -- CBC (58410-2)**
| Field | Code | LOINC | Unit | Ref Range (Adult) | Critical |
|-------|------|-------|------|--------------------|----------|
| WBC | wbc | 6690-2 | 10^3/uL | 4.5 - 11.0 | <2.0, >30.0 |
| RBC | rbc | 789-8 | 10^6/uL | M: 4.7-6.1, F: 4.2-5.4 | -- |
| Hemoglobin | hgb | 718-7 | g/dL | M: 13.5-17.5, F: 12.0-16.0 | <7.0, >20.0 |
| Hematocrit | hct | 4544-3 | % | M: 38.3-48.6, F: 35.5-44.9 | <20, >60 |
| Platelets | plt | 777-3 | 10^3/uL | 150 - 400 | <50, >1000 |
| MCV (calc) | mcv | 787-2 | fL | 80 - 100 | -- |
| MCH (calc) | mch | 785-6 | pg | 27 - 33 | -- |
| MCHC (calc) | mchc | 786-4 | g/dL | 32 - 36 | -- |

Auto-calc formulas:
- MCV = (Hct / RBC) * 10
- MCH = (Hgb / RBC) * 10
- MCHC = (Hgb / Hct) * 100

**2. Lipid Panel (57698-3)**
| Field | Code | LOINC | Unit | Ref Range | Critical |
|-------|------|-------|------|-----------|----------|
| Total Cholesterol | tc | 2093-3 | mg/dL | <200 desirable | >400 |
| Triglycerides | tg | 2571-8 | mg/dL | <150 | >500 |
| HDL | hdl | 2085-9 | mg/dL | >40 | -- |
| LDL | ldl | 2089-1 | mg/dL | <100 optimal | >190 |
| VLDL (calc) | vldl | 13457-7 | mg/dL | <30 | -- |
| TC/HDL Ratio (calc) | tc_hdl_ratio | 9830-1 | ratio | <5.0 | -- |

Auto-calc formulas:
- VLDL = Triglycerides / 5
- TC/HDL Ratio = Total Cholesterol / HDL

**3. HbA1c (4548-4)**
| Field | Code | LOINC | Unit | Ref Range | Critical |
|-------|------|-------|------|-----------|----------|
| HbA1c | hba1c | 4548-4 | % | 4.0 - 5.6 | >14.0 |
| eAG (calc) | eag | 27353-2 | mg/dL | -- | -- |

Auto-calc formulas:
- eAG = (28.7 * HbA1c) - 46.7

**4. Basic Metabolic Panel (51990-0)**
| Field | Code | LOINC | Unit | Ref Range | Critical |
|-------|------|-------|------|-----------|----------|
| Glucose | glucose | 2345-7 | mg/dL | 70 - 100 | <40, >500 |
| BUN | bun | 3094-0 | mg/dL | 7 - 20 | >100 |
| Creatinine | creatinine | 2160-0 | mg/dL | M: 0.7-1.3, F: 0.6-1.1 | >10.0 |
| Sodium | sodium | 2951-2 | mEq/L | 136 - 145 | <120, >160 |
| Potassium | potassium | 2823-3 | mEq/L | 3.5 - 5.0 | <2.5, >6.5 |
| Chloride | chloride | 2075-0 | mEq/L | 98 - 106 | <80, >120 |
| CO2 | co2 | 2028-9 | mEq/L | 23 - 29 | <10, >40 |
| Calcium | calcium | 17861-6 | mg/dL | 8.5 - 10.5 | <6.0, >13.0 |
| BUN/Creatinine Ratio (calc) | bun_cr_ratio | 3097-3 | ratio | 10 - 20 | -- |
| Anion Gap (calc) | anion_gap | 33037-3 | mEq/L | 8 - 12 | -- |

Auto-calc formulas:
- BUN/Creatinine Ratio = BUN / Creatinine
- Anion Gap = Sodium - (Chloride + CO2)

**5. Liver Function Tests (24325-3)**
| Field | Code | LOINC | Unit | Ref Range | Critical |
|-------|------|-------|------|-----------|----------|
| ALT (SGPT) | alt | 1742-6 | U/L | 7 - 56 | >1000 |
| AST (SGOT) | ast | 1920-8 | U/L | 10 - 40 | >1000 |
| ALP | alp | 6768-6 | U/L | 44 - 147 | -- |
| Total Bilirubin | tbil | 1975-2 | mg/dL | 0.1 - 1.2 | >12.0 |
| Direct Bilirubin | dbil | 1968-7 | mg/dL | 0.0 - 0.3 | -- |
| Albumin | albumin | 1751-7 | g/dL | 3.5 - 5.5 | <1.5 |
| Total Protein | tp | 2885-2 | g/dL | 6.0 - 8.3 | -- |
| Indirect Bilirubin (calc) | ibil | 1971-1 | mg/dL | 0.1 - 0.9 | -- |

Auto-calc formulas:
- Indirect Bilirubin = Total Bilirubin - Direct Bilirubin

**6. Thyroid Function -- TSH (3016-3)**
| Field | Code | LOINC | Unit | Ref Range | Critical |
|-------|------|-------|------|-----------|----------|
| TSH | tsh | 3016-3 | mIU/L | 0.4 - 4.0 | <0.01, >100 |
| Free T4 | ft4 | 3024-7 | ng/dL | 0.8 - 1.8 | -- |
| Free T3 | ft3 | 3051-0 | pg/mL | 2.3 - 4.2 | -- |

No auto-calc fields.

**7. Urinalysis (24356-8)**
| Field | Code | LOINC | Unit | Type | Ref Range |
|-------|------|-------|------|------|-----------|
| Color | ua_color | 5778-6 | -- | select | (Yellow, Amber, Red, Brown, Clear) |
| Clarity | ua_clarity | 32167-9 | -- | select | (Clear, Slightly Cloudy, Cloudy, Turbid) |
| Specific Gravity | ua_sg | 5811-5 | -- | numeric | 1.005 - 1.030 |
| pH | ua_ph | 5803-2 | -- | numeric | 4.5 - 8.0 |
| Protein | ua_protein | 5804-0 | -- | select | (Negative, Trace, 1+, 2+, 3+, 4+) |
| Glucose | ua_glucose | 5792-7 | -- | select | (Negative, Trace, 1+, 2+, 3+, 4+) |
| Ketones | ua_ketones | 5797-6 | -- | select | (Negative, Trace, Small, Moderate, Large) |
| Blood | ua_blood | 5794-3 | -- | select | (Negative, Trace, Small, Moderate, Large) |
| Leukocyte Esterase | ua_le | 5799-2 | -- | select | (Negative, Trace, Small, Moderate, Large) |
| Nitrite | ua_nitrite | 5802-4 | -- | select | (Negative, Positive) |

No auto-calc fields. Select fields do not have numeric reference ranges; abnormal detection is based on non-negative values where applicable.

**8. Blood Glucose -- Fasting (1558-6)**
| Field | Code | LOINC | Unit | Ref Range | Critical |
|-------|------|-------|------|-----------|----------|
| Fasting Glucose | fbs | 1558-6 | mg/dL | 70 - 100 | <40, >500 |

No auto-calc fields.

**9. Generic / Other (custom)**
| Field | Code | LOINC | Unit | Type |
|-------|------|-------|------|------|
| Test Name | test_name | -- | -- | text |
| Result Value | result_value | -- | -- | text |
| Unit | result_unit | -- | -- | text |
| Reference Range | result_ref | -- | -- | text |
| Interpretation | result_interp | -- | select (Normal, Abnormal, Critical) |

The generic template has no auto-calc and no automated flagging. Interpretation is manually entered.

### Auto-Calculation Formulas Summary

| Template | Calculated Field | Formula | Prerequisites |
|----------|-----------------|---------|---------------|
| CBC | MCV | (Hct / RBC) * 10 | hct, rbc |
| CBC | MCH | (Hgb / RBC) * 10 | hgb, rbc |
| CBC | MCHC | (Hgb / Hct) * 100 | hgb, hct |
| Lipid Panel | VLDL | TG / 5 | tg |
| Lipid Panel | TC/HDL Ratio | TC / HDL | tc, hdl |
| HbA1c | eAG | (28.7 * HbA1c) - 46.7 | hba1c |
| BMP | BUN/Cr Ratio | BUN / Creatinine | bun, creatinine |
| BMP | Anion Gap | Na - (Cl + CO2) | sodium, chloride, co2 |
| LFT | Indirect Bilirubin | Total Bil - Direct Bil | tbil, dbil |

### Abnormal Flagging Logic

Flags map to FHIR Observation `interpretation` CodeableConcept using the `http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation` system:

| Flag | Code | Display | UI Color | Meaning |
|------|------|---------|----------|---------|
| LL | `LL` | Critical Low | Red (`text-red-700 bg-red-50`) | Below critical low threshold |
| L | `L` | Low | Amber (`text-amber-700 bg-amber-50`) | Below normal but above critical |
| N | `N` | Normal | Green (`text-green-700`) | Within reference range |
| H | `H` | High | Amber (`text-amber-700 bg-amber-50`) | Above normal but below critical |
| HH | `HH` | Critical High | Red (`text-red-700 bg-red-50`) | Above critical high threshold |

Evaluation order: check LL first, then L, then HH, then H, then N. This prevents edge cases where a value at exactly the critical boundary is mis-classified.

For select-type fields (e.g., urinalysis), abnormal detection is rule-based:
- Any value other than "Negative" for protein, glucose, ketones, blood, leukocyte esterase, or nitrite is flagged as abnormal (`A`).
- Color and clarity are informational only (no flagging).

### Template Versioning Scheme

Templates use semver (`MAJOR.MINOR.PATCH`):
- **MAJOR**: Field removed or renamed, reference range logic changed in a breaking way.
- **MINOR**: New field added (backward-compatible), reference range values updated.
- **PATCH**: Label/display changes, bug fixes in formulas.

Each saved result stores `templateId` and `templateVersion`. When rendering historical results, the system loads the template version that was active at entry time (not the current version). The `result_templates` Dexie table stores all versions (keyed by `id` which includes the version, e.g., `tpl-cbc-v1.0.0`).

Initial version for all templates: `1.0.0`.

### Offline Storage in Dexie

New Dexie tables (v4 migration):

```typescript
// result_templates — bundled offline, seeded on first load
// Key: composite id (e.g., 'tpl-cbc-v1.0.0')
this.version(4).stores({
  // ... existing v3 stores ...
  result_templates: '&id, loincCode, templateVersion',
  lab_results: '&id, sampleId, status, templateId, templateVersion, [sampleId+status]',
  lab_observations: '&id, resultId, fieldCode, [resultId+fieldCode]',
})
```

**`lab_results` record shape:**
```typescript
interface LabResult {
  id: string              // UUID
  sampleId: string        // reference to the sample from Story 42.3
  templateId: string      // e.g., 'tpl-cbc-v1.0.0'
  templateVersion: string // e.g., '1.0.0'
  status: 'draft' | 'completed'
  reportComment?: string  // per-report annotation
  enteredBy: string       // technician practitioner ID
  enteredAt: string       // ISO timestamp
  updatedAt: string       // ISO timestamp
}
```

**`lab_observations` record shape:**
```typescript
interface LabObservation {
  id: string              // UUID
  resultId: string        // FK to lab_results.id
  fieldCode: string       // e.g., 'wbc', 'hgb'
  value: string | number | null
  flag: 'L' | 'H' | 'LL' | 'HH' | 'A' | null
  comment?: string        // per-field annotation
}
```

### Result Entry Form UI Component Design

The form is a single scrollable page with these sections (top to bottom):

1. **Patient Header** — First name + age, sample ID, test name. Compact, sticky at top on scroll.
2. **Critical Alert Banner** — Red, only visible when any field has LL/HH. Contains acknowledgment checkbox. Sticky below header when present.
3. **Template Fields** — Rendered in `sortOrder`. Each field row contains:
   - Label (with unit suffix for numeric fields)
   - Input control (type-appropriate)
   - Flag badge (if applicable, right-aligned)
   - Comment toggle icon (expands inline textarea below the field)
   - Auto-calc indicator icon with formula tooltip (for calculated fields)
4. **Report Comment** — Full-width textarea for overall report annotations.
5. **Action Bar** — Sticky bottom bar with "Save as Draft" (secondary) and "Complete & Submit" (primary) buttons.

Layout uses CSS Grid with logical properties (`grid-template-columns: 1fr auto auto`) for RTL compatibility. On mobile (<640px), fields stack vertically.

### Integration with Existing Upload Wizard

This story creates a **parallel flow**, not a modification of the existing upload wizard:

- **Upload wizard** (Story 12.3): For scanned paper results. Tech uploads a file (PDF/image), tags with LOINC category and collection date. Creates a DiagnosticReport with `presentedForm` (file attachment).
- **Structured entry** (this story): For electronically ordered tests. Tech enters numeric/coded values into a template. Creates a DiagnosticReport with `result` references to individual Observations.

Both flows produce FHIR DiagnosticReport resources but with different content representations. The upload wizard path has no Observation resources (it is a scanned document). The structured entry path has no `presentedForm` attachment.

Entry point for structured entry: from the sample detail page (Story 42.3), the tech taps "Enter Results" which navigates to `/results/[sampleId]/enter`.

### Project Structure Notes

New files to create:
- `apps/lab-lite/src/lib/result-templates.ts` — template type definitions + all 9 template definitions
- `apps/lab-lite/src/lib/abnormal-flags.ts` — flag evaluation engine
- `apps/lab-lite/src/lib/auto-calc.ts` — auto-calculation engine
- `apps/lab-lite/src/lib/result-to-fhir.ts` — FHIR resource mapping
- `apps/lab-lite/src/components/ResultEntryForm.tsx` — main form component
- `apps/lab-lite/src/app/[locale]/results/[sampleId]/enter/page.tsx` — entry page

Files to modify:
- `apps/lab-lite/src/lib/db.ts` — Dexie v4 schema migration
- `apps/lab-lite/messages/en.json` — add `resultEntry` namespace
- `apps/lab-lite/messages/ar.json` — add `resultEntry` namespace (placeholder translations)
- `apps/lab-lite/messages/prs.json` — add `resultEntry` namespace (placeholder translations)
- `apps/lab-lite/messages/ps.json` — add `resultEntry` namespace (placeholder translations)

### References

- FHIR R4 Observation: https://hl7.org/fhir/R4/observation.html
- FHIR R4 DiagnosticReport: https://hl7.org/fhir/R4/diagnosticreport.html
- FHIR Observation Interpretation Codes: http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation
- Existing LOINC categories: `apps/lab-lite/src/lib/loinc-categories.ts`
- Existing Dexie schema: `apps/lab-lite/src/lib/db.ts`
- Existing FHIR Observation schema: `packages/shared-types/src/fhir/observation.schema.ts`
- Existing FHIR DiagnosticReport schema: `packages/shared-types/src/fhir/diagnostic-report.schema.ts`
- Existing upload wizard: `apps/lab-lite/src/app/[locale]/upload/page.tsx`
- Existing MetadataForm: `apps/lab-lite/src/components/MetadataForm.tsx`
- Story 42.2 (Electronic Orders) — prerequisite for order-linked entry
- Story 42.3 (Sample Accessioning) — prerequisite for sample status pipeline
- Story 42.5 (Result Authorization) — downstream consumer of completed results

## Dev Agent Record

### Implementation Plan

Followed story task sequence exactly. TDD (red-green-refactor) applied to Tasks 3, 4, and 6 (tests written before implementation code). Tasks 1, 2, 5, 7, 8 implemented directly per specifications.

**Key technical decisions:**
- Dexie v21 (not v4 as written in story — actual DB was at v20, incremented to v21). Three new tables: `result_templates`, `lab_results`, `lab_observations`.
- Template formula functions stripped before Dexie storage (functions aren't serializable). `seedTemplates()` strips `autoCalc.formula`; at runtime formulas always sourced from in-memory `TEMPLATE_REGISTRY`.
- Reference range scoring (gender-specific=+2, each age bound=+1) selects most-specific range to handle overlapping pediatric/adult/gender-specific ranges correctly.
- Flag evaluation order: LL → L → HH → H → null, preventing boundary mis-classification.
- Local FHIR types (`LabFhirObservation`, `LabFhirDiagnosticReport`) created in `result-to-fhir.ts` rather than extending shared types — avoids breaking existing observation.schema.ts (vital-signs subset).
- Used `use(params)` for Next.js 15 async params in entry page.
- Patient data minimization: entry page loads `firstName` from `verified_patients` cache, `age` from patient record; gender accessed from `patients` table for range evaluation only — never shown in UI.

### Completion Notes

- All 14 Acceptance Criteria satisfied.
- All 8 Tasks and subtasks completed.
- New tests: `abnormal-flags.test.ts` (21 tests ✓), `auto-calc.test.ts` (14 tests ✓), `result-to-fhir.test.ts` (11 tests ✓).
- No regressions introduced (66 existing test files passing, 11 pre-existing failures unrelated to this story).
- AR/PRS/PS translation keys added with `[TODO:translate]` placeholders per spec.

### Debug Log

| Date | Issue | Fix |
|------|-------|-----|
| 2026-05-30 | Dexie v mismatch (story said v4 migration, DB was at v20) | Used version(21) to increment from actual current version |
| 2026-05-30 | Formula serialization in Dexie | `seedTemplates()` strips `formula` fn; re-hydrated from `TEMPLATE_REGISTRY` at runtime |

## File List

**Created:**
- `apps/lab-lite/src/lib/result-templates.ts`
- `apps/lab-lite/src/lib/abnormal-flags.ts`
- `apps/lab-lite/src/lib/auto-calc.ts`
- `apps/lab-lite/src/lib/result-to-fhir.ts`
- `apps/lab-lite/src/components/ResultEntryForm.tsx`
- `apps/lab-lite/src/app/[locale]/results/[sampleId]/enter/page.tsx`
- `apps/lab-lite/src/__tests__/abnormal-flags.test.ts`
- `apps/lab-lite/src/__tests__/auto-calc.test.ts`
- `apps/lab-lite/src/__tests__/result-to-fhir.test.ts`

**Modified:**
- `apps/lab-lite/src/lib/db.ts` (Dexie v21 schema + helper functions)
- `apps/lab-lite/src/lib/audit-client.ts` (added `reportLabResultAuditEvent`)
- `apps/lab-lite/messages/en.json` (added `resultEntry` namespace)
- `apps/lab-lite/messages/ar.json` (added `resultEntry` namespace — placeholders)
- `apps/lab-lite/messages/prs.json` (added `resultEntry` namespace — placeholders)
- `apps/lab-lite/messages/ps.json` (added `resultEntry` namespace — placeholders)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change |
|------|--------|
| 2026-05-30 | Implemented Story 42.4 — all 8 tasks complete, 46 new tests passing, status → review |
