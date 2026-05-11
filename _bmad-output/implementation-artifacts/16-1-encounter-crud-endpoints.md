# Story 16.1: Encounter CRUD Endpoints

Status: done

## Story

As a clinician,
I want my encounters to be persisted and retrievable from the Hub,
so that my clinical records sync across devices and are not lost to local-only storage.

## Context

The encounter router (`apps/hub-api/src/trpc/routers/encounter.ts`) is currently an empty stub. OPD-Lite manages encounters locally in the Zustand store and Dexie, but there is no Hub API persistence. This story adds the CRUD endpoints so that encounters can sync to the Hub and be retrieved from any device.

The `encounters` table already exists (migration 001) with columns: `id`, `patient_id`, `status`, `class_code`, `period_start`, `period_end`, `participant_practitioner_id`, `reason_code`, `hlc_timestamp`, `created_at`, `updated_at`. The `reason_code` column is a PHI field and is encrypted at rest via field-level encryption.

**PRD Requirements:** FR1 (Encounter Lifecycle), CLAUDE.md Rule #6 (Audit every PHI access)

**Depends on:** Story 6.1 (RBAC), Story 7.3 (Field-Level Encryption), Story 8.2 (Audit Logger)

## Acceptance Criteria

1. [x] `encounter.create` persists a FHIR Encounter with field-level encryption via `db.toRow()`.
2. [x] `encounter.read(id)` returns a decrypted encounter, enforcing `enforceResourceAccess('Encounter')` and `enforceConsentMiddleware('Encounter')`.
3. [x] `encounter.update(id)` updates an encounter with HLC conflict detection (incoming HLC must be > stored HLC; reject with CONFLICT if incoming <= stored).
4. [x] `encounter.close(id)` transitions status to `finished` and sets `period.end` to the current timestamp.
5. [x] `encounter.listByPatient(patientId)` returns all encounters for a patient ordered by `period_start` desc.
6. [x] Every operation emits an audit event via `@ultranos/audit-logger` (PHI_WRITE for mutations, PHI_READ for queries).
7. [x] All endpoints use `protectedProcedure` with RBAC — restricted to DOCTOR, CLINICIAN, and ADMIN roles via `roleRestrictedProcedure` or `enforceResourceAccess('Encounter')`.

## Tasks / Subtasks

- [x] **Task 1: `encounter.create` Procedure** (AC: 1, 6, 7)
  - [x] Add `create` mutation to `encounter.ts` using `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])`.
  - [x] Chain `.use(enforceResourceAccess('Encounter'))`.
  - [x] Zod input schema: `id` (uuid), `patientId` (uuid), `status` (enum: `planned`, `in-progress`, `finished`, `cancelled`), `classCode` (string), `periodStart` (datetime), `participantPractitionerId` (uuid), `reasonCode` (string, optional — PHI field), `hlcTimestamp` (string).
  - [x] Build DB row via `db.toRow(camelCaseObj)` — this handles snake_case conversion and encrypts `reasonCode`.
  - [x] Insert into `encounters` table via `ctx.supabase.from('encounters').insert(row).select('id').single()`.
  - [x] Handle duplicate key (23505) gracefully — return idempotent success after verifying patient ownership.
  - [x] Emit `PHI_WRITE` audit event with `resourceType: 'Encounter'`, `resourceId: data.id`, `patientId`, `actorId: ctx.user.sub`, `actorRole: ctx.user.role`.
  - [x] Wrap audit emit in try/catch — audit failure must not fail the operation.

- [x] **Task 2: `encounter.read` Procedure** (AC: 2, 6, 7)
  - [x] Add `read` query to `encounter.ts` using `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])`.
  - [x] Chain `.use(enforceResourceAccess('Encounter'))`.
  - [x] Chain `.use(enforceConsentMiddleware('Encounter'))` — requires `patientId` in input for consent check.
  - [x] Zod input schema: `id` (uuid), `patientId` (uuid).
  - [x] Select from `encounters` where `id` matches; verify `patient_id` matches input `patientId`.
  - [x] Transform result via `db.fromRow(row)` to decrypt PHI fields and convert to camelCase.
  - [x] Throw `NOT_FOUND` if no row returned.
  - [x] Emit `PHI_READ` audit event.

- [x] **Task 3: `encounter.update` Procedure** (AC: 3, 6, 7)
  - [x] Add `update` mutation to `encounter.ts` using `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])`.
  - [x] Chain `.use(enforceResourceAccess('Encounter'))`.
  - [x] Zod input schema: `id` (uuid), `patientId` (uuid), `status` (enum, optional), `classCode` (string, optional), `reasonCode` (string, optional), `hlcTimestamp` (string).
  - [x] **HLC conflict detection:** Before update, fetch the current `hlc_timestamp` for the record. If incoming `hlcTimestamp` <= stored `hlc_timestamp`, throw `TRPCError({ code: 'CONFLICT', message: 'Stale update — a newer version exists' })`.
  - [x] Build partial update object with only provided fields via `db.toRow()`.
  - [x] Update via `ctx.supabase.from('encounters').update(row).eq('id', input.id).select('id').single()`.
  - [x] Throw `NOT_FOUND` if no row updated.
  - [x] Emit `PHI_WRITE` audit event with metadata `{ operation: 'update' }`.

- [x] **Task 4: `encounter.close` Procedure** (AC: 4, 6, 7)
  - [x] Add `close` mutation to `encounter.ts` using `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])`.
  - [x] Chain `.use(enforceResourceAccess('Encounter'))`.
  - [x] Zod input schema: `id` (uuid), `patientId` (uuid), `hlcTimestamp` (string).
  - [x] HLC conflict detection (same as Task 3).
  - [x] Update `status` to `finished` and `period_end` to `new Date().toISOString()`.
  - [x] Only allow closing encounters with status `in-progress` — throw `BAD_REQUEST` if current status is not `in-progress`.
  - [x] Emit `PHI_WRITE` audit event with metadata `{ operation: 'close' }`.

- [x] **Task 5: `encounter.listByPatient` Procedure** (AC: 5, 6, 7)
  - [x] Add `listByPatient` query to `encounter.ts` using `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN'])`.
  - [x] Chain `.use(enforceResourceAccess('Encounter'))`.
  - [x] Chain `.use(enforceConsentMiddleware('Encounter'))` — uses `patientId` from input.
  - [x] Zod input schema: `patientId` (uuid).
  - [x] Select from `encounters` where `patient_id` matches, ordered by `period_start` desc.
  - [x] Transform results via `db.fromRows(data)`.
  - [x] Emit `PHI_READ` audit event with metadata `{ encounterCount: rows.length }`.

- [x] **Task 6: Tests** (AC: 1-7)
  - [x] Create `apps/hub-api/src/__tests__/encounter.test.ts`.
  - [x] Follow existing test pattern: mock Supabase client chain, `createCallerFactory(appRouter)(ctx)`, assert results.
  - [x] Tests for `encounter.create`:
    - [x] Requires authentication (null user rejects).
    - [x] Denies PHARMACIST role.
    - [x] Creates encounter and returns id.
    - [x] Handles duplicate key (23505) idempotently.
    - [x] Emits PHI_WRITE audit event (verify `from('audit_log')` called).
    - [x] Passes `reasonCode` through `db.toRow()` for encryption.
  - [x] Tests for `encounter.read`:
    - [x] Returns decrypted encounter via `db.fromRow()`.
    - [x] Throws NOT_FOUND for missing encounter.
    - [x] Emits PHI_READ audit event.
  - [x] Tests for `encounter.update`:
    - [x] Updates encounter with valid HLC.
    - [x] Rejects stale HLC with CONFLICT error.
    - [x] Emits PHI_WRITE audit event.
  - [x] Tests for `encounter.close`:
    - [x] Transitions status to `finished` and sets `period_end`.
    - [x] Rejects closing a non-in-progress encounter with BAD_REQUEST.
    - [x] HLC conflict detection.
  - [x] Tests for `encounter.listByPatient`:
    - [x] Returns encounters ordered by `period_start` desc.
    - [x] Applies `db.fromRows()` transformation.
    - [x] Emits PHI_READ audit event.

## Dev Notes

### Code Patterns (follow existing conventions)

**Router structure** — follow `allergy.ts` and `medication-statement.ts` exactly:

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter } from '../init'
import { roleRestrictedProcedure } from '../rbac'
import { db } from '@/lib/supabase'
import { enforceResourceAccess } from '../middleware/enforceResourceAccess'
import { enforceConsentMiddleware } from '../middleware/enforceConsent'
import { AuditLogger } from '@ultranos/audit-logger'
```

**Write path** — `db.toRow()` converts camelCase to snake_case AND encrypts PHI fields:
```typescript
const row = db.toRow({ id: input.id, reasonCode: input.reasonCode, ... })
const { data, error } = await ctx.supabase.from('encounters').insert(row).select('id').single()
```

**Read path** — `db.fromRow()` for single, `db.fromRows()` for lists:
```typescript
const { data, error } = await ctx.supabase.from('encounters').select('*').eq('id', input.id).single()
return db.fromRow(data)
```

**Audit pattern** — always wrap in try/catch:
```typescript
const audit = new AuditLogger(ctx.supabase)
try {
  await audit.emit({
    action: 'PHI_WRITE',
    resourceType: 'Encounter',
    resourceId: data.id,
    patientId: input.patientId,
    actorId: ctx.user.sub,
    actorRole: ctx.user.role,
    outcome: 'SUCCESS',
    sessionId: ctx.user.sessionId,
    metadata: { operation: 'create' },
  })
} catch {
  console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'Encounter' })
}
```

**HLC conflict detection** — compare string timestamps:
```typescript
const { data: current } = await ctx.supabase
  .from('encounters').select('hlc_timestamp').eq('id', input.id).single()
if (current && input.hlcTimestamp <= current.hlc_timestamp) {
  throw new TRPCError({ code: 'CONFLICT', message: 'Stale update — a newer version exists' })
}
```

**Test pattern** — follow `allergy.test.ts`:
```typescript
vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => mockSupabaseClient),
  db: {
    toRow: (data: any) => data,
    toRowRaw: (data: any) => data,
    fromRow: (data: any) => data,
    fromRowRaw: (data: any) => data,
    fromRows: (data: any[]) => data,
  },
}))

const { appRouter } = await import('../trpc/routers/_app')
const { createCallerFactory } = await import('../trpc/init')
const createCaller = createCallerFactory(appRouter)
```

### Consent Middleware on Read Operations

The `enforceConsentMiddleware('Encounter')` maps to `ConsentScope.CLINICAL_NOTES` (defined in `enforceConsent.ts` RESOURCE_TO_SCOPE). This means read operations require the patient to have an active consent for clinical notes access. Apply this middleware on `read` and `listByPatient` only — not on `create`, `update`, or `close` (clinicians must be able to write encounter data during an active clinical session regardless of consent status for specific read scopes).

### Encounters Table (migration 001)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Client-generated |
| `patient_id` | uuid NOT NULL | FK to patients |
| `status` | text NOT NULL | FHIR: planned, in-progress, finished, cancelled |
| `class_code` | text NOT NULL | FHIR class (AMB, EMER, etc.) |
| `period_start` | timestamptz | Encounter start time |
| `period_end` | timestamptz | Encounter end time (set on close) |
| `participant_practitioner_id` | uuid | FK to practitioners |
| `reason_code` | text | **PHI** — encrypted via field-level encryption |
| `hlc_timestamp` | text NOT NULL | Hybrid Logical Clock for conflict detection |
| `created_at` | timestamptz | Server-side default |
| `updated_at` | timestamptz | Server-side default |

### What NOT to Change

- `apps/hub-api/src/trpc/routers/_app.ts` — encounter router is already registered.
- `apps/hub-api/src/trpc/middleware/enforceResourceAccess.ts` — `Encounter` is already in `CLINICIAN_RESOURCES` in `rbac.ts`.
- `apps/hub-api/src/trpc/middleware/enforceConsent.ts` — `Encounter` is already mapped to `ConsentScope.CLINICAL_NOTES`.
- The `encounters` table schema — no migration needed, table exists.
- `packages/shared-types/` — no new types needed for this story.

## File List

### Files to Create

| File | Purpose |
|------|---------|
| `apps/hub-api/src/__tests__/encounter.test.ts` | Unit tests for all 5 encounter procedures |

### Files to Modify

| File | Change |
|------|--------|
| `apps/hub-api/src/trpc/routers/encounter.ts` | Replace empty stub with create, read, update, close, listByPatient procedures |

## Testing

Run tests with:
```bash
pnpm -F hub-api test -- encounter.test.ts
```

Minimum test coverage:
- **RBAC:** Auth required, role restrictions enforced (PHARMACIST denied, DOCTOR/CLINICIAN/ADMIN allowed)
- **CRUD:** Create returns id, read returns decrypted data, update succeeds with valid HLC, close transitions status
- **HLC conflict:** Stale HLC rejected with CONFLICT
- **Audit:** Every operation emits audit event (verify `from('audit_log')` in mock calls)
- **Encryption:** `db.toRow()` called with `reasonCode` for encryption, `db.fromRow()`/`db.fromRows()` called on read path
- **Idempotency:** Duplicate create (23505) returns success
- **Edge cases:** NOT_FOUND for missing records, BAD_REQUEST for closing non-in-progress encounters

## Dev Agent Record

### Implementation Plan

Followed existing patterns from `allergy.ts` and `medication-statement.ts`. Used `roleRestrictedProcedure` for RBAC, `enforceResourceAccess` for FHIR resource-level access, and `enforceConsentMiddleware` for consent enforcement on read operations. All PHI fields pass through `db.toRow()`/`db.fromRow()` for encryption/decryption.

### Debug Log

- Fixed `enforceConsentMiddleware` placement: must be chained AFTER `.input()` in tRPC v11 so the middleware can access parsed input (specifically `patientId`). Chaining before `.input()` causes `opts.input` to be undefined.
- Fixed consent mock data: `ConsentStatus.ACTIVE` resolves to `'ACTIVE'` (uppercase), not `'active'`.

### Completion Notes

All 5 encounter procedures implemented: `create`, `read`, `update`, `close`, `listByPatient`.
- 23 unit tests written and passing covering RBAC, CRUD, HLC conflict detection, audit events, encryption, idempotency, and edge cases.
- No regressions in existing hub-api test suite (pre-existing failures in unrelated test files: ocr-service, practitioner-key, lab-verify-patient, lab-upload-result, lab-audit).
- Consent middleware applied on read-only operations (`read`, `listByPatient`) as specified.
- All audit events wrapped in try/catch per CLAUDE.md Rule #6.

### Review Findings

- [x] [Review][Decision] TOCTOU race condition in HLC conflict detection — Fixed: added `WHERE hlc_timestamp = $expected` to UPDATE queries (optimistic concurrency)
- [x] [Review][Decision] Create conflict message leaks cross-patient information — Fixed: changed to generic "Encounter ID conflict" message
- [x] [Review][Patch] Missing patient_id ownership verification in `update` — Fixed: added `.eq('patient_id', input.patientId)` to SELECT
- [x] [Review][Patch] Missing patient_id ownership verification in `close` — Fixed: added `.eq('patient_id', input.patientId)` to SELECT
- [x] [Review][Patch] `update` doesn't handle null current — Fixed: added explicit NOT_FOUND check before HLC comparison
- [x] [Review][Patch] Idempotent create (23505) path doesn't emit audit event — Fixed: added audit emit before early return
- [x] [Review][Defer] No pagination on listByPatient [encounter.ts:330] — deferred, matches AC 5 spec but performance concern for high-volume patients
- [x] [Review][Defer] No-op update allowed when no optional fields provided [encounter.ts:187-190] — deferred, not a bug but unnecessary DB writes

## Change Log

- 2026-05-10: Implemented all 5 encounter CRUD endpoints and 23 unit tests. Replaced empty stub router with full implementation.

## References

- CLAUDE.md Rule #6: Audit every PHI access
- CLAUDE.md Rule #1: PHI must never appear in logs
- Story 6.1: RBAC (`apps/hub-api/src/trpc/rbac.ts`)
- Story 7.3: Field-Level Encryption (`db.toRow()` / `db.fromRow()`)
- Story 8.2: Audit Logger (`@ultranos/audit-logger`)
- Consent enforcement: `apps/hub-api/src/trpc/middleware/enforceConsent.ts`
- FHIR R4: Encounter resource (https://hl7.org/fhir/R4/encounter.html)
- Existing patterns: `allergy.ts`, `medication-statement.ts` (follow these as templates)
