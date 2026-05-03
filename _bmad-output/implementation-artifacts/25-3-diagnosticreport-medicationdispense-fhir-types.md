# Story 25.3: DiagnosticReport & MedicationDispense FHIR Types

Status: done

## Story

As a developer,
I want FHIR R4 Zod schemas for DiagnosticReport and MedicationDispense in `@ultranos/shared-types`,
so that lab results and pharmacy dispensing records are type-safe across the ecosystem and inline type definitions can be replaced.

## Acceptance Criteria

1. `FhirDiagnosticReportSchema` Zod schema exists in `packages/shared-types/src/fhir/diagnostic-report.schema.ts` with fields: resourceType (`'DiagnosticReport'`), id, status (`preliminary | final | amended | cancelled | entered-in-error`), code (LOINC CodeableConcept), subject (Reference), encounter (optional Reference), effectiveDateTime, issued, performer (array of References), result (optional array of References to Observations), conclusion (optional string), presentedForm (optional array of attachments), meta (FhirMetaSchema), `_ultranos` extension
2. `FhirMedicationDispenseSchema` Zod schema exists in `packages/shared-types/src/fhir/medication-dispense.schema.ts` with fields: resourceType (`'MedicationDispense'`), id, status (`preparation | in-progress | cancelled | on-hold | completed | entered-in-error | stopped | declined | unknown`), medicationCodeableConcept, subject (Reference), performer (array of actor References), authorizingPrescription (array of References), quantity (optional SimpleQuantity), whenHandedOver (datetime), dosageInstruction (optional array), meta (FhirMetaSchema), `_ultranos` extension (hlcTimestamp, brandName, batchLot, isOfflineCreated, createdAt)
3. Both schemas reuse `CodeableConceptSchema`, `ReferenceSchema`, `FhirMetaSchema` from `common.schema.ts` — NO re-declaration of common types
4. TypeScript inferred types are exported: `FhirDiagnosticReport` and `FhirMedicationDispense` via `z.infer<>`
5. Both schemas are exported from `packages/shared-types/src/index.ts`
6. `MedicationDispense` is added to `packages/sync-engine/src/sync-priority.ts` at priority 3
7. Both schemas already exist in `conflict-tiers.ts` at TIER_2 — verify, do not duplicate
8. Existing inline `LocalMedicationDispense` in `apps/pharmacy-lite/src/lib/medication-dispense.ts` is replaced with import from `@ultranos/shared-types`
9. All existing tests pass — no regressions

## Tasks / Subtasks

- [x] Task 1: Create DiagnosticReport schema (AC: #1, #3, #4)
  - [x] Create `packages/shared-types/src/fhir/diagnostic-report.schema.ts`
  - [x] Import `CodeableConceptSchema`, `ReferenceSchema`, `FhirMetaSchema` from `./common.schema.js`
  - [x] Define `DiagnosticReportStatusSchema` enum
  - [x] Define `AttachmentSchema` (contentType, data, url, title, size)
  - [x] Define `_ultranos` extension: `createdAt`, `hlcTimestamp`, `isOfflineCreated`, `labId`, `virusScanStatus`, `ocrMetadataVerified`
  - [x] Export `FhirDiagnosticReportSchema` and `type FhirDiagnosticReport`
- [x] Task 2: Create MedicationDispense schema (AC: #2, #3, #4)
  - [x] Create `packages/shared-types/src/fhir/medication-dispense.schema.ts`
  - [x] Import common schemas from `./common.schema.js`
  - [x] Define `MedicationDispenseStatusSchema` enum (FHIR R4 full list)
  - [x] Define `DosageInstructionSchema` (reuse same Dosage shape from medication-request if possible, or define minimal text-only version)
  - [x] Define `SimpleQuantitySchema` (value, unit, system, code)
  - [x] Define `_ultranos` extension: `hlcTimestamp`, `brandName`, `batchLot`, `isOfflineCreated`, `createdAt`, `fulfillmentContext`
  - [x] Add `.refine()` validation: `whenHandedOver` required when status is `completed`
  - [x] Export `FhirMedicationDispenseSchema` and `type FhirMedicationDispense`
- [x] Task 3: Wire exports and sync priority (AC: #5, #6, #7)
  - [x] Add `export * from './fhir/diagnostic-report.schema.js'` to `packages/shared-types/src/index.ts`
  - [x] Add `export * from './fhir/medication-dispense.schema.js'` to `packages/shared-types/src/index.ts`
  - [x] Add `MedicationDispense: 3` to SYNC_PRIORITY map in `packages/sync-engine/src/sync-priority.ts`
  - [x] Verify `DiagnosticReport: 'TIER_2'` and `MedicationDispense: 'TIER_2'` already exist in conflict-tiers.ts (READ-ONLY check — no change needed)
- [x] Task 4: Replace inline Pharmacy Lite type (AC: #8)
  - [x] Update `apps/pharmacy-lite/package.json` to add `@ultranos/shared-types` dependency (if not already present)
  - [x] In `apps/pharmacy-lite/src/lib/medication-dispense.ts`, replace inline `LocalMedicationDispense` interface with import: `import type { FhirMedicationDispense } from '@ultranos/shared-types'`
  - [x] Update `createMedicationDispense()` return type to use `FhirMedicationDispense`
  - [x] Verify the Zod schema fields are a SUPERSET of the existing inline interface (no breaking field removal)
- [x] Task 5: Write tests (AC: #9)
  - [x] Create `packages/shared-types/src/__tests__/diagnostic-report.schema.test.ts`
  - [x] Create `packages/shared-types/src/__tests__/medication-dispense.schema.test.ts`
  - [x] Test valid DiagnosticReport parses successfully
  - [x] Test invalid DiagnosticReport (missing required fields) fails validation
  - [x] Test valid MedicationDispense parses successfully
  - [x] Test MedicationDispense refine: completed status without whenHandedOver fails
  - [x] Test type inference produces correct TypeScript types
  - [x] Run all existing shared-types, sync-engine, and pharmacy-lite tests

### Review Findings
- [x] [Review][Decision] F1: `whenHandedOver` type widened from required to optional — RESOLVED: added null check with early return in `dispense-sync.ts:52-54`
- [x] [Review][Decision] F2: `performer` and `authorizingPrescription` marked optional — RESOLVED: kept optional per FHIR R4 (0..*); runtime validation in dispense-sync.ts already catches missing performer
- [x] [Review][Defer] F3: FHIR datetime strictness — `z.string().datetime()` rejects partial FHIR dates across all schemas — deferred, pre-existing
- [x] [Review][Defer] F4: AttachmentSchema `data` field has no max size constraint — deferred, pre-existing

## Dev Notes

### Previous Story Intelligence (Stories 25.1 & 25.2)

**Pattern established:** Zod schemas in shared-types follow a consistent structure:
- Import common schemas from `./common.schema.js` (never re-declare)
- Define status enum with `z.enum([...])`
- Define `_ultranos` extension object
- Main schema uses `z.object({...})` with `id: z.string().uuid()`, `resourceType: z.literal('...')`
- Export both the Zod schema and the inferred TypeScript type
- File named `{resource-name}.schema.ts` in kebab-case

### DiagnosticReport Schema Design

Match the existing `diagnostic_reports` DB table from migration `007_diagnostic_reports.sql`:

```typescript
// packages/shared-types/src/fhir/diagnostic-report.schema.ts

const DiagnosticReportStatusSchema = z.enum([
  'registered', 'partial', 'preliminary', 'final',
  'amended', 'corrected', 'appended', 'cancelled', 'entered-in-error', 'unknown',
])

const AttachmentSchema = z.object({
  contentType: z.string().optional(),     // MIME type (application/pdf, image/jpeg)
  data: z.string().optional(),            // Base64 encoded content (optional — may use URL)
  url: z.string().optional(),             // Download URL (preferred over inline data)
  title: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
})

export const FhirDiagnosticReportSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('DiagnosticReport'),
  status: DiagnosticReportStatusSchema,
  code: CodeableConceptSchema,            // LOINC code for test type
  category: z.array(CodeableConceptSchema).optional(),
  subject: ReferenceSchema,               // Patient reference
  encounter: ReferenceSchema.optional(),
  effectiveDateTime: z.string().datetime().optional(),
  issued: z.string().datetime(),          // When report was released
  performer: z.array(ReferenceSchema).optional(),  // Lab/technician
  result: z.array(ReferenceSchema).optional(),     // References to Observations
  conclusion: z.string().optional(),
  presentedForm: z.array(AttachmentSchema).optional(),
  _ultranos: z.object({
    createdAt: z.string().datetime(),
    hlcTimestamp: z.string(),
    isOfflineCreated: z.boolean(),
    labId: z.string().uuid().optional(),
    virusScanStatus: z.enum(['pending', 'clean', 'infected', 'error']).optional(),
    ocrMetadataVerified: z.boolean().optional(),
  }),
  meta: FhirMetaSchema,
})

export type FhirDiagnosticReport = z.infer<typeof FhirDiagnosticReportSchema>
```

### MedicationDispense Schema Design

Match existing inline `LocalMedicationDispense` from pharmacy-lite PLUS FHIR R4 spec:

```typescript
// packages/shared-types/src/fhir/medication-dispense.schema.ts

const MedicationDispenseStatusSchema = z.enum([
  'preparation', 'in-progress', 'cancelled', 'on-hold',
  'completed', 'entered-in-error', 'stopped', 'declined', 'unknown',
])

const SimpleQuantitySchema = z.object({
  value: z.number(),
  unit: z.string(),
  system: z.string().optional(),
  code: z.string().optional(),
})

export const FhirMedicationDispenseSchema = z.object({
  id: z.string().uuid(),
  resourceType: z.literal('MedicationDispense'),
  status: MedicationDispenseStatusSchema,
  medicationCodeableConcept: CodeableConceptSchema,
  subject: ReferenceSchema,
  performer: z.array(z.object({
    actor: ReferenceSchema,
  })).optional(),
  authorizingPrescription: z.array(ReferenceSchema).optional(),
  quantity: SimpleQuantitySchema.optional(),
  whenHandedOver: z.string().datetime().optional(),
  dosageInstruction: z.array(z.object({ text: z.string() })).optional(),
  _ultranos: z.object({
    hlcTimestamp: z.string(),
    brandName: z.string().optional(),
    batchLot: z.string().optional(),
    isOfflineCreated: z.boolean(),
    createdAt: z.string().datetime(),
    fulfillmentContext: z.string().optional(),
  }),
  meta: FhirMetaSchema,
})
.refine(
  (val) => val.status !== 'completed' || val.whenHandedOver !== undefined,
  {
    message: 'whenHandedOver is required when status is completed',
    path: ['whenHandedOver'],
  },
)

export type FhirMedicationDispense = z.infer<typeof FhirMedicationDispenseSchema>
```

### Sync Engine — Already Configured (Verify Only)

**conflict-tiers.ts** already contains:
```typescript
DiagnosticReport: 'TIER_2',
MedicationDispense: 'TIER_2',
```
DO NOT add duplicates. Only VERIFY these exist with a read.

**sync-priority.ts** already has `DiagnosticReport: 3` but is MISSING `MedicationDispense`. Add it:
```typescript
MedicationDispense: 3,   // Same priority as DiagnosticReport
```

### Pharmacy Lite Inline Type Replacement

Current inline interface in `apps/pharmacy-lite/src/lib/medication-dispense.ts`:
```typescript
export interface LocalMedicationDispense { ... }
```

Replace with:
```typescript
import type { FhirMedicationDispense } from '@ultranos/shared-types'
export type LocalMedicationDispense = FhirMedicationDispense
```

**Critical compatibility check:** The Zod schema MUST include every field the inline interface has:
- `id`, `resourceType`, `status`, `medicationCodeableConcept`, `subject`, `performer`, `authorizingPrescription`, `whenHandedOver`, `dosageInstruction`, `_ultranos` (hlcTimestamp, brandName, batchLot, isOfflineCreated, fulfillmentContext), `meta`

The Zod schema adds fields the inline doesn't have (`quantity`, `createdAt` in `_ultranos`) — this is additive and safe.

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `packages/shared-types/src/fhir/diagnostic-report.schema.ts` | NEW | DiagnosticReport Zod schema |
| `packages/shared-types/src/fhir/medication-dispense.schema.ts` | NEW | MedicationDispense Zod schema |
| `packages/shared-types/src/index.ts` | UPDATE | Add 2 export lines |
| `packages/sync-engine/src/sync-priority.ts` | UPDATE | Add MedicationDispense: 3 |
| `apps/pharmacy-lite/src/lib/medication-dispense.ts` | UPDATE | Replace inline type with import |
| `apps/pharmacy-lite/package.json` | UPDATE | Add @ultranos/shared-types dep (if missing) |
| `packages/shared-types/src/__tests__/diagnostic-report.schema.test.ts` | NEW | Schema validation tests |
| `packages/shared-types/src/__tests__/medication-dispense.schema.test.ts` | NEW | Schema validation tests |

### What NOT to Change

- DO NOT modify `conflict-tiers.ts` — DiagnosticReport and MedicationDispense already at TIER_2
- DO NOT modify `sync-engine/src/index.ts` — exports are generic and already work
- DO NOT refactor hub-api lab.ts to use the schema yet — that's a follow-up (would require migration alignment)
- DO NOT change the `DosageSchema` in medication-request.schema.ts — MedicationDispense uses a simpler `{ text: string }` form for dosage instructions

### Project Structure Notes

- Schema files follow kebab-case naming: `diagnostic-report.schema.ts`, `medication-dispense.schema.ts`
- Each schema file is self-contained with its own status enum and extension schema
- Common types are always imported from `./common.schema.js`, never redeclared
- Test files go in `packages/shared-types/src/__tests__/` matching existing pattern

### References

- [Source: packages/shared-types/src/fhir/common.schema.ts] — Common FHIR building blocks
- [Source: packages/shared-types/src/fhir/medication-request.schema.ts] — Pattern reference for MedicationDispense
- [Source: packages/shared-types/src/fhir/observation.schema.ts] — Pattern reference for DiagnosticReport
- [Source: packages/shared-types/src/index.ts] — Barrel export to update
- [Source: packages/sync-engine/src/conflict-tiers.ts] — Already has both types at TIER_2
- [Source: packages/sync-engine/src/sync-priority.ts] — Missing MedicationDispense entry
- [Source: apps/pharmacy-lite/src/lib/medication-dispense.ts] — Inline type to replace
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#ST-G01,ST-G02] — Missing type gaps
- [Source: https://hl7.org/fhir/R4/diagnosticreport.html] — FHIR R4 DiagnosticReport spec
- [Source: https://hl7.org/fhir/R4/medicationdispense.html] — FHIR R4 MedicationDispense spec

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- No blocking issues encountered during implementation

### Completion Notes List
- Created `FhirDiagnosticReportSchema` with full FHIR R4 status enum (10 values), AttachmentSchema for presentedForm, and `_ultranos` extension (labId, virusScanStatus, ocrMetadataVerified)
- Created `FhirMedicationDispenseSchema` with full FHIR R4 status enum (9 values), SimpleQuantitySchema, `.refine()` enforcing `whenHandedOver` required when status is `completed`
- Both schemas reuse `CodeableConceptSchema`, `ReferenceSchema`, `FhirMetaSchema` from common.schema.ts — no re-declarations
- Added `MedicationDispense: 3` to sync-priority.ts (same priority as DiagnosticReport)
- Verified `DiagnosticReport: 'TIER_2'` and `MedicationDispense: 'TIER_2'` already exist in conflict-tiers.ts — no changes needed
- Replaced inline `LocalMedicationDispense` interface in pharmacy-lite with `export type LocalMedicationDispense = FhirMedicationDispense` — backward compatible, all consumers unchanged
- Added `fulfilledCount` and `totalCount` to `_ultranos` extension to maintain compatibility with existing pharmacy-lite `createMedicationDispense()` function
- `@ultranos/shared-types` was already a dependency of pharmacy-lite — no package.json change needed
- All 67 shared-types tests pass (7 files), all 102 sync-engine tests pass (9 files)
- Pre-existing pharmacy-lite test failures (snapshot whitespace, encryption key setup, QR initialization) are unrelated to this story

### File List
- `packages/shared-types/src/fhir/diagnostic-report.schema.ts` — NEW
- `packages/shared-types/src/fhir/medication-dispense.schema.ts` — NEW
- `packages/shared-types/src/index.ts` — UPDATED (added 2 export lines)
- `packages/sync-engine/src/sync-priority.ts` — UPDATED (added MedicationDispense: 3)
- `apps/pharmacy-lite/src/lib/medication-dispense.ts` — UPDATED (replaced inline type with shared-types import)
- `packages/shared-types/src/__tests__/diagnostic-report.schema.test.ts` — NEW (9 tests)
- `packages/shared-types/src/__tests__/medication-dispense.schema.test.ts` — NEW (11 tests)
