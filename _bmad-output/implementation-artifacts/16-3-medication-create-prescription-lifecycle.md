# Story 16.3: Medication Create & Prescription Lifecycle

Status: done

## Story

As a clinician,
I want to create prescriptions via the Hub API,
so that prescription records are centrally managed and globally verifiable.

## Context

The medication router (`apps/hub-api/src/trpc/routers/medication.ts`) currently supports `getStatus`, `recordDispense`, `complete`, and `voidPrescription` procedures for the pharmacist dispensing workflow. This story adds the clinician-facing `create` and `read` procedures to complete the prescription lifecycle on the Hub.

Prescriptions are FHIR R4 `MedicationRequest` resources stored in the `medication_requests` table (migration 005). PHI fields (`dosage_instruction`, `medication_text`, `interaction_override`) are encrypted at rest via `db.toRow()` field-level encryption (Story 7.3). Each prescription is assigned a unique `qr_code_id` for global pharmacist lookup (Story 3.4).

**PRD Requirements:** RX-001 (Prescription Creation), RX-002 (Prescription Read), SEC-010 (PHI Encryption at Rest)

## Acceptance Criteria

1. [x] `medication.create` persists a FHIR `MedicationRequest` with field-level encryption on `dosage_instruction`, `medication_text`, and `interaction_override`.
2. [x] Status is set to `active` with a unique `qr_code_id` (UUID) for global pharmacist lookup.
3. [x] RBAC: only users with role `CLINICIAN` or `DOCTOR` can invoke `medication.create`.
4. [x] `medication.read(id)` returns the decrypted prescription to authorized callers.
5. [x] Every `create` and `read` operation emits a structured audit event via `@ultranos/audit-logger`.

## Tasks / Subtasks

- [x] **Task 1: `medication.create` Procedure** (AC: 1, 2, 3, 5)
  - [x] Add `create` mutation to `medicationRouter` in `apps/hub-api/src/trpc/routers/medication.ts`.
  - [x] Use `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])` for RBAC enforcement.
  - [x] Apply `enforceResourceAccess('MedicationRequest')` middleware.
  - [x] Define Zod input schema:
    - `medicationCode` (string, required) — medication identity code
    - `medicationDisplay` (string, required) — human-readable medication name
    - `medicationText` (string, optional) — free-text medication description (PHI, encrypted)
    - `patientId` (UUID, required) — patient reference
    - `encounterId` (UUID, optional) — encounter reference
    - `dosageInstruction` (JSON object, optional) — FHIR dosage instruction (PHI, encrypted)
    - `dispenseRequest` (JSON object, optional) — FHIR dispense request
    - `interactionCheck` (enum: CLEAR, WARNING, BLOCKED, UNAVAILABLE, required)
    - `interactionOverride` (string, optional) — clinician override reason (PHI, encrypted)
    - `intent` (enum: proposal, plan, order, default `order`)
    - `isOfflineCreated` (boolean, default `false`)
    - `hlcTimestamp` (string, required) — HLC timestamp for sync
  - [x] Generate `qr_code_id` via `crypto.randomUUID()`.
  - [x] Set `status` to `active`, `prescription_status` to `ACTIVE`.
  - [x] Set `requester_id` to `ctx.user.sub` (the authenticated clinician).
  - [x] Persist via `db.toRow()` which handles field-level encryption of PHI columns (`dosage_instruction`, `medication_text`, `interaction_override`).
  - [x] Set FHIR meta fields: `meta_last_updated` = now, `meta_version_id` = `'1'`.
  - [x] Return `{ prescriptionId, qrCodeId, status }`.
  - [x] Emit `PHI_WRITE` audit event with `resourceType: 'PRESCRIPTION'`, `action: 'PHI_WRITE'`.

- [x] **Task 2: `medication.read` Procedure** (AC: 4, 5)
  - [x] Add `read` query to `medicationRouter` in `apps/hub-api/src/trpc/routers/medication.ts`.
  - [x] Use `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])` for RBAC enforcement.
  - [x] Apply `enforceResourceAccess('MedicationRequest')` middleware.
  - [x] Input: `{ prescriptionId: z.string().uuid() }`.
  - [x] Fetch from `medication_requests` by `id`.
  - [x] Decrypt PHI fields via `db.fromRow()` before returning.
  - [x] Return full prescription object with decrypted `dosageInstruction`, `medicationText`, `interactionOverride`.
  - [x] Throw `NOT_FOUND` if prescription does not exist.
  - [x] Emit `PHI_READ` audit event with `resourceType: 'PRESCRIPTION'`.

- [x] **Task 3: Tests** (AC: 1, 2, 3, 4, 5)
  - [x] Create `apps/hub-api/src/__tests__/medication-create-read.test.ts`.
  - [x] Test: `create` persists MedicationRequest with correct fields and encrypted PHI.
  - [x] Test: `create` generates unique `qr_code_id` and sets status to `active`.
  - [x] Test: `create` rejects non-DOCTOR/CLINICIAN roles (e.g., PHARMACIST, LAB_TECH).
  - [x] Test: `read` returns decrypted prescription fields.
  - [x] Test: `read` returns NOT_FOUND for non-existent prescription.
  - [x] Test: `read` rejects unauthorized roles.
  - [x] Test: `create` emits PHI_WRITE audit event.
  - [x] Test: `read` emits PHI_READ audit event.

## Dev Notes

### Encryption

The `medication_requests` table has three PHI columns that require field-level encryption:
- `dosage_instruction` (JSONB) — clinical dosage details
- `medication_text` (TEXT) — free-text medication description
- `interaction_override` (TEXT) — clinician's override reason

These are already configured in `getEncryptionConfig()` in `packages/crypto/src/server-crypto.ts` (Story 7.3). Use `db.toRow()` for encryption on write and `db.fromRow()` for decryption on read. Do NOT implement custom encryption logic.

### QR Code ID

Generate `qr_code_id` using `crypto.randomUUID()`. The column has a UNIQUE constraint in migration 005. This ID is used by pharmacists for global prescription lookup via `medication.getStatus` (Story 3.4).

### RBAC Pattern

Follow the allergy router pattern (`apps/hub-api/src/trpc/routers/allergy.ts`):
```typescript
import { roleRestrictedProcedure } from '../rbac'

create: roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])
  .use(enforceResourceAccess('MedicationRequest'))
  .input(...)
  .mutation(...)
```

The existing procedures in the medication router use `protectedProcedure` (authenticated but not role-restricted). The new `create` and `read` procedures must use `roleRestrictedProcedure` instead, since only clinicians and doctors should create or read full prescription details.

### Audit Events

Every operation must emit an audit event (CLAUDE.md Rule #6). Follow the existing pattern in the medication router:

```typescript
const audit = new AuditLogger(ctx.supabase)
try {
  await audit.emit({
    action: 'PHI_WRITE', // or 'PHI_READ'
    resourceType: 'PRESCRIPTION',
    resourceId: prescriptionId,
    patientId: input.patientId,
    actorId: ctx.user.sub,
    actorRole: ctx.user.role,
    outcome: 'SUCCESS',
    sessionId: ctx.user.sessionId,
    metadata: { ... },
  })
} catch (auditError) {
  console.warn('[AUDIT_FAILURE]', { action: '...', resourceType: 'PRESCRIPTION', resourceId: '...' })
}
```

Audit emit failures must not crash the procedure. Wrap in try/catch and warn.

### Drug Interaction Safety (CLAUDE.md Rule #3)

The `interactionCheck` field is required on create. If the client sends `UNAVAILABLE`, the prescription is still created (the check was attempted but failed), but the status is recorded so that `medication.complete` will block dispensing until verification. Never default to `CLEAR` when the check was unavailable.

### References

- Migration 005: `supabase/migrations/005_medication_requests.sql`
- Medication router: `apps/hub-api/src/trpc/routers/medication.ts`
- RBAC middleware: `apps/hub-api/src/trpc/rbac.ts`
- Field encryption: `packages/crypto/src/server-crypto.ts`, `apps/hub-api/src/lib/field-encryption.ts`
- DB helper: `apps/hub-api/src/lib/supabase.ts` (`db.toRow()`, `db.fromRow()`)
- Allergy router (RBAC pattern): `apps/hub-api/src/trpc/routers/allergy.ts`
- Story 3.4: Global Prescription Invalidation Check (getStatus, qr_code_id)
- Story 7.3: Hub API Field-Level Encryption (encryption infrastructure)

## Dev Agent Record

### Implementation Plan
- Added `create` mutation and `read` query to the existing `medicationRouter` in the medication.ts router file.
- Followed the allergy router pattern for RBAC using `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])`.
- Used `db.toRow()` for automatic PHI field encryption on write (dosageInstruction, medicationText, interactionOverride).
- Used `db.fromRow()` for automatic PHI field decryption on read.
- Both procedures emit structured audit events via `AuditLogger` with try/catch to avoid crashing on audit failures.
- Generated `qrCodeId` via `crypto.randomUUID()` for global pharmacist lookup.

### Completion Notes
- All 13 tests pass: 6 for `medication.create`, 7 for `medication.read`.
- Tests cover: auth required, RBAC denial (PHARMACIST, LAB_TECH), successful create with correct return shape, unique UUID qrCodeId, PHI encryption via db.toRow(), PHI decryption via db.fromRow(), NOT_FOUND handling, and audit event emission for both operations.
- No regressions in existing medication-related tests (medication-statement, audit-integration).
- Pre-existing failures in unrelated test files (ocr-service, lab-verify-patient, lab-upload-result, lab-audit) are not caused by this change.

### Review Findings

- [x] [Review][Decision] Missing consent enforcement on `create` and `read` — Added `enforceConsentMiddleware('MedicationRequest')` after `.input()` on both procedures. `read` now requires `patientId` in input for consent check.
- [x] [Review][Decision] `interactionOverride` not required when `interactionCheck` is WARNING/BLOCKED — Added `.refine()` requiring `interactionOverride` when `interactionCheck` is not `CLEAR`.
- [x] [Review][Decision] No idempotency guard for offline-created prescriptions — Added optional `prescriptionId` to input and `23505` duplicate key handling (allergy router pattern).
- [x] [Review][Decision] `read` returns unfiltered decrypted row with no output schema — Changed `select('*')` to explicit column list.
- [x] [Review][Patch] Audit `patientId` extraction in `read` uses raw DB row instead of decrypted object — Now uses `input.patientId` directly (available from new required input field).
- [x] [Review][Defer] Audit failure silently swallowed with no rollback/retry [medication.ts] — deferred, project-wide pattern matching spec requirement ("Audit emit failures must not crash the procedure")
- [x] [Review][Defer] `dosageInstruction`/`dispenseRequest` accept arbitrary nested objects via `z.record(z.unknown())` [medication.ts] — deferred, FHIR R4 dosage structure validation is a broader effort
- [x] [Review][Defer] `hlcTimestamp` validated only as non-empty string, no format check [medication.ts] — deferred, pre-existing pattern across all procedures in the router
- [x] [Review][Defer] `interactionOverride` accepted when `interactionCheck` is CLEAR [medication.ts] — deferred, minor data hygiene with no safety risk

## File List

- `apps/hub-api/src/trpc/routers/medication.ts` — Modified: added `create` mutation and `read` query procedures
- `apps/hub-api/src/__tests__/medication-create-read.test.ts` — New: 13 tests covering all acceptance criteria

## Change Log

- 2026-05-08: Story created.
- 2026-05-10: Implementation complete — added medication.create and medication.read procedures with RBAC, encryption, audit, and 13 tests.
- 2026-05-11: Code review complete — 5 findings fixed (consent enforcement, interaction override validation, idempotency guard, output schema, audit patientId). 4 deferred. 16 tests pass.
