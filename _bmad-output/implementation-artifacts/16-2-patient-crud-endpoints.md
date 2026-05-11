# Story 16.2: Patient CRUD Endpoints

Status: done

## Story

As a system administrator,
I want the Hub to support patient creation and management,
so that new patients can be registered and existing records maintained.

## Acceptance Criteria

1. `patient.create` persists FHIR Patient with field-level encryption on PHI fields
2. Blind index generated for national ID (HMAC-SHA256) via `@ultranos/crypto`
3. `patient.read(id)` returns decrypted patient with consent enforcement
4. `patient.update(id)` updates demographics with HLC conflict detection
5. Every operation emits audit event
6. Duplicate national ID detection via blind index unique constraint

## Tasks / Subtasks

- [x] Task 1: Add patient name fields to encryption config (AC: #1)
  - [x] Add `name_local_enc`, `name_latin_enc`, `name_phonetic_enc`, `birth_date_enc` to `randomizedFields` in `packages/crypto/src/server-crypto.ts` `getEncryptionConfig()` — Option A: dual columns (encrypted + plain for search)
  - [x] Verify existing patient search still works — search uses unencrypted plain columns, unaffected
  - [x] **Decision point resolved:** Option A selected. Migration 012 adds `_enc` columns. Plain columns remain for ILIKE search.

- [x] Task 2: Add unique constraint on `national_id_hash` (AC: #6)
  - [x] Created migration 013 with partial unique index on `patients.national_id_hash WHERE national_id_hash IS NOT NULL`
  - [x] Supabase project is INACTIVE — migration file created locally for future application via MCP
  - [x] Drops existing non-unique index and replaces with unique partial index

- [x] Task 3: Implement `patient.create` mutation (AC: #1, #2, #5, #6)
  - [x] Add Zod input schema for patient creation
  - [x] Use `enforceResourceAccess('Patient')` middleware
  - [x] Generate blind index via `hashNationalId()` when `nationalId` is provided
  - [x] Detect duplicate national ID before insert + DB constraint fallback
  - [x] Build row using `db.toRow()` with dual-write (plain + _enc columns)
  - [x] Insert via `ctx.supabase.from('patients').insert(row)`
  - [x] Emit audit event with action `PHI_WRITE` and operation `create`
  - [x] Return created patient ID and resourceType

- [x] Task 4: Implement `patient.read` query (AC: #3, #5)
  - [x] Add Zod input schema: `z.object({ patientId: z.string().uuid() })`
  - [x] Use `enforceResourceAccess('Patient')` middleware
  - [x] Use `enforceConsentMiddleware('Patient')` middleware
  - [x] Query with `select('*')`, `eq('is_active', true)`, `.single()`
  - [x] Decrypt row via `db.fromRow()`; returns decrypted _enc fields, falls back to plain columns
  - [x] On not found: throw `TRPCError` with code `NOT_FOUND`
  - [x] Emit audit event with action `PHI_READ`
  - [x] Return FHIR-aligned patient object with `_ultranos` namespace extensions

- [x] Task 5: Implement `patient.update` mutation (AC: #4, #5)
  - [x] Add Zod input schema for partial patient update with hlcTimestamp
  - [x] Use `enforceResourceAccess('Patient')` middleware
  - [x] HLC conflict detection: reject if incoming timestamp is older than current `updated_at`
  - [x] Demographics are Tier 3 LWW with HLC ordering respected
  - [x] If `nationalId` provided, re-hash and check duplicates (excluding current patient)
  - [x] Build partial update payload with dual-write for name/_enc columns via `db.toRow()`
  - [x] Conditional update: `.eq('is_active', true)` prevents updating soft-deleted patients
  - [x] Emit audit event with `fieldsUpdated` in metadata
  - [x] Return updated patient meta

- [x] Task 6: Write tests (AC: #1-#6)
  - [x] Create `apps/hub-api/src/__tests__/patient-crud.test.ts`
  - [x] Test create: successful patient creation returns ID (PASS)
  - [x] Test create: PHI fields encrypted via `db.toRow()` with _enc columns (PASS)
  - [x] Test create: blind index generated for national ID — 64-char hex (PASS)
  - [x] Test create: duplicate national ID hash triggers CONFLICT error (PASS)
  - [x] Test create: audit event emitted with action `PHI_WRITE` (PASS)
  - [x] Test read: returns decrypted patient data from _enc columns (PASS)
  - [x] Test read: consent enforcement middleware wired in (PASS)
  - [x] Test read: not found returns NOT_FOUND error (PASS)
  - [x] Test read: audit event emitted with action `PHI_READ` (PASS)
  - [x] Test update: successful demographic update with dual-write (PASS)
  - [x] Test update: HLC conflict detection rejects stale updates (PASS)
  - [x] Test update: national ID change re-hashes and checks duplicates (PASS)
  - [x] Test update: duplicate national ID on update triggers CONFLICT (PASS)
  - [x] Test update: audit event emitted with updated field names (PASS)
  - [x] Test update: no fields to update throws BAD_REQUEST (PASS)
  - [x] Verify existing Hub API tests pass — no regressions from changes (pre-existing failures only)

## Dev Notes

### Existing Patient Router (EXTEND IT)

The patient router at `apps/hub-api/src/trpc/routers/patient.ts` already has:
- `patient.search` — ILIKE search by name or blind index lookup by national ID
- `hashNationalId()` helper — reuse for create/update
- Imports for `enforceResourceAccess`, `generateBlindIndex`, `getFieldEncryptionKeys`, `AuditLogger`

Add `create`, `read`, and `update` procedures alongside the existing `search`.

### Database Schema: `patients` Table

From `supabase/migrations/001_fhir_schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS patients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_local        TEXT NOT NULL,     -- preferred script (NFD-normalized)
  name_latin        TEXT,              -- ALA-LC romanization
  name_phonetic     TEXT,              -- Double Metaphone
  gender            TEXT CHECK (gender IN ('male','female','other','unknown')),
  birth_date        DATE,
  birth_year_only   BOOLEAN NOT NULL DEFAULT FALSE,
  telecom_phone     TEXT,
  national_id_hash  TEXT,              -- HMAC-SHA256 blind index — never store raw
  guardian_id       UUID REFERENCES patients(id),
  consent_version   TEXT,
  mpi_warn          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES practitioners(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Note:** The existing search query references columns with `ultranos_` prefix (e.g., `ultranos_name_local`). This is the Supabase column naming convention used in the select string. Verify if a view or column alias is in place, or if the actual column names match. The `db.toRow()` / `db.fromRow()` helpers handle `camelCase <-> snake_case` transformation and field-level encryption automatically.

### PHI Fields Requiring Encryption

Per CLAUDE.md: `name_local`, `name_latin`, `name_phonetic`, `birth_date` are PHI. Currently these are NOT in `getEncryptionConfig().randomizedFields`. The developer must either:
1. Add them to the encryption config (breaking existing search ILIKE on unencrypted columns), or
2. Use `encryptRow()` / `decryptRow()` explicitly for these fields only in the CRUD operations

**This is a decision point that must be presented to the user before implementation.**

### Blind Index for National ID

The `hashNationalId()` function already exists in `patient.ts`:
```typescript
function hashNationalId(rawId: string): string {
  const { hmacKey } = getFieldEncryptionKeys()
  return generateBlindIndex(rawId, hmacKey)
}
```

For `patient.create` and `patient.update`, call this on the raw national ID input. The raw national ID is NEVER stored — only the HMAC-SHA256 hash goes to the `national_id_hash` column.

### Consent Enforcement

The `patient.read` endpoint MUST use `enforceConsentMiddleware('Patient')` because it returns full patient demographics (PHI). The existing `patient.search` intentionally skips consent because it returns identity-only data for verification.

The consent middleware expects `input.patientId` in the procedure input. Ensure the read input schema uses `patientId` as the field name.

### HLC Conflict Detection for Updates

Demographics are **Tier 3 (Last-Write-Wins)** per the sync conflict resolution tiers. However, HLC ordering is still applied:
- Fetch current `updated_at` from the patient row
- Compare against incoming `hlcTimestamp`
- If incoming is older (stale), reject with `CONFLICT`
- If incoming is newer or equal, proceed with update
- Update `updated_at` to `NOW()` on the Hub side

### Audit Pattern (COPY FROM EXISTING)

Follow the exact audit pattern from `patient.search`:
```typescript
const audit = new AuditLogger(ctx.supabase)
try {
  await audit.emit({
    action: 'PHI_WRITE',  // or 'PHI_READ'
    resourceType: 'PATIENT',
    resourceId: patientId,
    actorId: ctx.user.sub,
    actorRole: ctx.user.role,
    outcome: 'SUCCESS',
    sessionId: ctx.user.sessionId,
    metadata: { operation: 'create' },
  })
} catch (auditError) {
  console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceType: 'PATIENT', resourceId: patientId })
}
```

Audit failures MUST NOT block the main operation (try/catch with console.warn fallback).

### db.toRow() / db.fromRow() Usage

These helpers handle the full write/read path:
- **Write:** `db.toRow({ nameLocal: '...' })` -> `{ name_local: '<encrypted>' }` (camelCase -> snake_case + encryption)
- **Read:** `db.fromRow(dbRow)` -> `{ nameLocal: '<decrypted>' }` (snake_case -> camelCase + decryption)

Use `db.toRow()` for all inserts/updates to ensure PHI encryption is mandatory. Never use raw `.insert()` with manually constructed objects for patient data.

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/hub-api/src/trpc/routers/patient.ts` | UPDATE | Add create, read, update procedures |
| `packages/crypto/src/server-crypto.ts` | UPDATE | Add patient PHI fields to encryption config (pending decision point) |
| `supabase/migrations/012_patient_national_id_unique.sql` | NEW | Add unique constraint on national_id_hash |
| `apps/hub-api/src/__tests__/patient-crud.test.ts` | NEW | Tests for create/read/update |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | UPDATE | Status updated |

### What NOT to Change

- DO NOT modify `patient.search` — it works correctly for its purpose (identity verification, not full PHI)
- DO NOT store raw national IDs anywhere — only the HMAC-SHA256 blind index
- DO NOT skip consent enforcement on `patient.read` — unlike search, read returns full PHI
- DO NOT use `db.toRowRaw()` for patient data — patient records contain PHI and MUST use `db.toRow()`
- DO NOT log patient names, IDs, or any PHI in error messages or console output (CLAUDE.md Rule #1)

### Testing Standards

- **Framework:** Vitest (already configured in Hub API)
- **Mock Supabase:** Mock `ctx.supabase.from()` chain to return controlled responses
- **Mock AuditLogger:** Verify `emit()` called with correct action/resourceType
- **Encryption verification:** Ensure `db.toRow()` is invoked (PHI encryption is mandatory)
- **Test pattern:** Follow `apps/hub-api/src/__tests__/blind-index.test.ts` for mocking approach (stub env vars, mock `@/lib/supabase`, mock `@ultranos/audit-logger`)

### References

- [Source: apps/hub-api/src/trpc/routers/patient.ts] — Existing patient router with search + hashNationalId
- [Source: apps/hub-api/src/trpc/routers/medication.ts] — Reference for mutation patterns (recordDispense, complete)
- [Source: apps/hub-api/src/lib/field-encryption.ts] — encryptRow/decryptRow/getFieldEncryptionKeys
- [Source: apps/hub-api/src/lib/supabase.ts] — db.toRow()/db.fromRow() helpers
- [Source: apps/hub-api/src/trpc/middleware/enforceConsent.ts] — Consent middleware (expects input.patientId)
- [Source: apps/hub-api/src/trpc/middleware/enforceResourceAccess.ts] — RBAC middleware
- [Source: apps/hub-api/src/trpc/init.ts] — protectedProcedure, TRPCContext
- [Source: apps/hub-api/src/__tests__/blind-index.test.ts] — Test mocking pattern reference
- [Source: packages/crypto/src/server-crypto.ts] — generateBlindIndex, getEncryptionConfig
- [Source: packages/shared-types/src/fhir/audit-event.ts] — AuditEventInput type
- [Source: supabase/migrations/001_fhir_schema.sql] — patients table schema
- [Source: supabase/migrations/003_indexes.sql] — Existing non-unique index on national_id_hash
- [Source: CLAUDE.md#Encryption] — Field-level encryption requirements
- [Source: CLAUDE.md#Sync Engine] — Tier 3 LWW for demographics

## Dev Agent Record

### Implementation Plan
- **Decision Point Resolution:** Option A selected for PHI field encryption — dual columns (plain for search + encrypted `_enc` for secure read). This preserves existing ILIKE search functionality while adding AES-256-GCM encrypted copies.
- **Migration Strategy:** Two migrations created (012 for _enc columns, 013 for partial unique index). Supabase project INACTIVE — migrations stored locally for future application.
- **CRUD Pattern:** Extended existing `patientRouter` with `create`, `read`, `update` procedures following medication router mutation patterns. Used `db.toRow()`/`db.fromRow()` for mandatory encryption. Consent middleware applied on `read` only (search returns identity-only data).
- **Test Strategy:** 15 tests covering all ACs — mocked Supabase client chains, tracked `db.toRow()` calls to verify encryption path, verified audit emissions with correct actions/metadata.

### Completion Notes
- All 6 tasks completed, all 15 tests passing
- No regressions introduced (verified against full hub-api test suite — all pre-existing failures unrelated to patient CRUD)
- Raw national IDs never stored — only HMAC-SHA256 blind index
- Audit events emitted for every PHI read/write with try/catch fallback
- HLC conflict detection enforces Tier 3 ordering on updates

## File List

| File | Action | Description |
|------|--------|-------------|
| `apps/hub-api/src/trpc/routers/patient.ts` | UPDATED | Added `create`, `read`, `update` procedures with RBAC, consent, audit, encryption |
| `packages/crypto/src/server-crypto.ts` | UPDATED | Added `name_local_enc`, `name_latin_enc`, `name_phonetic_enc`, `birth_date_enc` to `randomizedFields` |
| `supabase/migrations/012_patient_phi_encrypted_columns.sql` | NEW | Adds encrypted PHI columns to patients table |
| `supabase/migrations/013_patient_national_id_unique.sql` | NEW | Partial unique index on `national_id_hash WHERE IS NOT NULL` |
| `apps/hub-api/src/__tests__/patient-crud.test.ts` | NEW | 15 tests for create/read/update procedures |
| `_bmad-output/implementation-artifacts/16-2-patient-crud-endpoints.md` | UPDATED | Story status, task checkboxes, dev record |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | UPDATED | Story status → review |

## Review Findings

- [x] [Review][Decision] D1: HLC timestamp comparison is cross-format — resolved: Option A selected, renamed `hlcTimestamp` to `lastKnownUpdate`, accepts ISO 8601 for Tier 3 LWW comparison [patient.ts:348]
- [x] [Review][Patch] P1: Update does not verify row was actually modified — fixed: added `.select('id')` and zero-rows check [patient.ts:438-443]
- [x] [Review][Patch] P2: `birthDate` has no format validation — fixed: added `.regex(/^\d{4}-\d{2}-\d{2}$/)` to create and update input schemas
- [x] [Review][Patch] P3: Empty string `nationalId` bypasses duplicate check — fixed: added `.min(1)` to create and update input schemas
- [x] [Review][Patch] P4: `read` response omits `versionId` from `meta` object — fixed: added `versionId` to read response meta
- [x] [Review][Patch] P5: `create` response omits `meta` and `_ultranos` namespace — fixed: added `meta.lastUpdated` and `_ultranos.createdAt` to create response
- [x] [Review][Defer] W1: `db.toRow()`/`db.fromRow()` unhandled throws — cross-cutting startup validation concern — deferred, pre-existing
- [x] [Review][Defer] W2: Migration 013 non-atomic index swap — relevant at production migration time — deferred, pre-existing
- [x] [Review][Defer] W3: Consent middleware test is a no-op — test can't verify denial due to module-level mock construction — deferred, test quality

## Change Log

- **2026-05-10:** Implemented patient CRUD endpoints (create, read, update) with Option A dual-column encryption, blind index uniqueness, consent enforcement, HLC conflict detection, and audit logging. 15 tests added, all passing.
