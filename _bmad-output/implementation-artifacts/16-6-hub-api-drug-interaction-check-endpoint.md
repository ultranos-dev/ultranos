# Story 16.6: Hub API Drug Interaction Check Endpoint

Status: done

## Story

As a clinician,
I want the Hub to provide a server-side drug interaction check,
so that interaction safety is verified centrally and not only on the client.

## Acceptance Criteria

1. `medication.checkInteractions` accepts medication code + patient ID
2. Queries patient's active MedicationStatements and pending MedicationRequests
3. Runs interaction check via `@ultranos/drug-db` package
4. Returns interactions with severity (CONTRAINDICATED, ALLERGY_MATCH, MAJOR, MODERATE, MINOR, NONE)
5. If database stale (>45 days), returns `UNAVAILABLE` with reason `DATABASE_STALE`
6. Check result logged as audit event
7. RBAC: enforces MedicationRequest resource access

## Tasks / Subtasks

- [x] Task 1: Create Supabase-based DrugDatabaseAdapter for Hub API (AC: #3, #5)
  - [x] Create `apps/hub-api/src/lib/supabase-drug-adapter.ts`
  - [x] Implement `DrugDatabaseAdapter` interface from `@ultranos/drug-db`
  - [x] `getInteractions()` queries `vocab_interactions` table via Supabase client, returning `VocabInteractionEntry[]`
  - [x] `getMetadata()` queries `vocab_metadata` table for `lastUpdatedAt` and `version` (or reads from a `vocab_versions` row keyed by `'interactions'`)
  - [x] Adapter accepts a `SupabaseClient` parameter (not a singleton — uses request-scoped client from tRPC context)

- [x] Task 2: Add `@ultranos/drug-db` dependency to Hub API (AC: #3)
  - [x] Add `"@ultranos/drug-db": "workspace:*"` to `apps/hub-api/package.json`
  - [x] Run `pnpm install` to link the workspace package

- [x] Task 3: Implement `medication.checkInteractions` procedure (AC: #1, #2, #3, #4, #5, #7)
  - [x] Add `checkInteractions` procedure to `apps/hub-api/src/trpc/routers/medication.ts`
  - [x] Use `protectedProcedure` with `.use(enforceResourceAccess('MedicationRequest'))`
  - [x] Input schema: `{ medicationCode: string, medicationDisplay: string, patientId: string (UUID) }`
  - [x] Query active MedicationStatements: `ctx.supabase.from('medication_statements').select('*').eq('subject_reference', patientRef).eq('status', 'active')`
  - [x] Query pending MedicationRequests: `ctx.supabase.from('medication_requests').select('*').eq('subject_reference', patientRef).eq('prescription_status', 'ACTIVE')`
  - [x] Query active allergies: `ctx.supabase.from('allergy_intolerances').select('*').eq('patient_ref', patientRef).eq('clinical_status_code', 'active')`
  - [x] Construct Supabase drug adapter (Task 1) with `ctx.supabase`
  - [x] Call `checkInteractions(medicationDisplay, activeMedNames, { activeMedications: statements, activeAllergies: allergies }, adapter)` from `@ultranos/drug-db`
  - [x] Return `InteractionCheckSummary` (result, interactions array, optional reason)

- [x] Task 4: Emit audit event for interaction check (AC: #6)
  - [x] After interaction check completes, emit audit event via `AuditLogger`
  - [x] Action: `'PHI_READ'` (reading patient medication + allergy data for safety check)
  - [x] ResourceType: `'INTERACTION_CHECK'`
  - [x] Include `patientId`, `actorId`, `actorRole`, `sessionId`
  - [x] Metadata: `{ medicationDisplay, result, interactionCount, reason? }` — no PHI in metadata (drug name is clinical, not PHI per se, but patient-specific context logged via patientId only)
  - [x] Audit failure is non-fatal (warn + continue, matching existing patterns)

- [x] Task 5: Write comprehensive tests (AC: #1–#7)
  - [x] Create `apps/hub-api/src/__tests__/medication-check-interactions.test.ts`
  - [x] Test: unauthenticated user → UNAUTHORIZED
  - [x] Test: user without MedicationRequest access (e.g., LAB_TECH) → FORBIDDEN
  - [x] Test: CLINICIAN role → allowed, returns interaction check result
  - [x] Test: returns CONTRAINDICATED interaction when matching drug-drug pair found
  - [x] Test: returns ALLERGY_MATCH when medication matches patient allergy
  - [x] Test: returns CLEAR when no interactions found
  - [x] Test: returns UNAVAILABLE with reason DATABASE_STALE when metadata shows >45 days
  - [x] Test: returns UNAVAILABLE with reason EMPTY_DATABASE when adapter returns empty data
  - [x] Test: audit event emitted on successful check
  - [x] Test: audit failure does not block the response
  - [x] Test: merges active MedicationStatements + pending MedicationRequests into check

### Review Findings

- [x] [Review][Decision] **D1: MedicationStatement `medicationCodeableConcept` data shape mismatch** — RESOLVED: No mismatch. `medication_statements` stores JSONB CodeableConcept objects (written by medication-statement router), not plain strings. The `create` procedure's scalar `medicationCode` goes into `medication_requests` (a different table). The checker correctly queries `medication_statements` for `activeMedications` and extracts plain strings from `medication_requests` for `pendingRxNames`.

- [x] [Review][Patch] **P1: `read` procedure has no patient ownership verification** — FIXED: Added `.eq('subject_reference', ...)` filter to the read query.
- [x] [Review][Patch] **P2: Unhandled throw from `checkInteractions()` returns 500 instead of UNAVAILABLE** — FIXED: Wrapped in try/catch returning `{ result: 'UNAVAILABLE', reason: 'ADAPTER_ERROR' }`.
- [x] [Review][Patch] **P3: `create` idempotent path returns freshly-generated `qrCodeId`** — FIXED: Now fetches existing `qr_code_id` from the DB and returns it.
- [x] [Review][Patch] **P4: Null metadata from adapter bypasses staleness check on fresh deploy** — FIXED: Changed to `.maybeSingle()`, returns epoch sentinel on missing row.
- [x] [Review][Patch] **P5: No audit event on idempotent replay or conflict rejection in `create`** — FIXED: Added audit emit on both idempotent replay (SUCCESS) and conflict rejection (DENIED) paths.
- [x] [Review][Patch] **P6: `select('*')` over-fetches PHI on three tables in `checkInteractions`** — FIXED: Narrowed to specific required columns on all three queries.
- [x] [Review][Patch] **P7: Add test for Supabase query failure path** — FIXED: Added 3 tests: medication_statements failure, allergy_intolerances failure, and checkInteractions throw → UNAVAILABLE.

- [x] [Review][Defer] **W1: `@ultranos/audit-logger` undeclared in hub-api `package.json`** — Pre-existing: AuditLogger was already imported before this change and is used across many hub-api files without a declared dependency. Works via pnpm workspace hoisting. [package.json]
- [x] [Review][Defer] **W2: Module-level `cachedMap` in drug-db checker has no invalidation strategy** — Pre-existing design in `@ultranos/drug-db`. The interaction vocabulary cache persists indefinitely in process memory. Not caused by this change; requires ops-level cache invalidation. [checker.ts]
- [x] [Review][Defer] **W3: No pagination on `getInteractions()` — loads entire vocab table** — Performance concern for large interaction databases. Not a correctness issue. [supabase-drug-adapter.ts:14-26]

## Dev Notes

### Hub API Architecture Context

The Hub API uses tRPC with Supabase as the backing store. Key patterns:

- **Procedure types:** `protectedProcedure` (requires auth) and `roleRestrictedProcedure(['DOCTOR', 'CLINICIAN', ...])` from `apps/hub-api/src/trpc/rbac.ts`
- **Resource RBAC:** `enforceResourceAccess('MedicationRequest')` middleware from `apps/hub-api/src/trpc/middleware/enforceResourceAccess.ts`
- **DB helpers:** `db.toRow()` / `db.fromRow()` / `db.fromRows()` for camelCase-snakeCase conversion from `@/lib/supabase`
- **Audit:** `AuditLogger` from `@ultranos/audit-logger`, instantiated per-request with `new AuditLogger(ctx.supabase)`
- **Router registration:** Add to `apps/hub-api/src/trpc/routers/_app.ts` — this procedure goes on the existing `medicationRouter`, not a new router

### Existing Router Context

The `medicationRouter` in `apps/hub-api/src/trpc/routers/medication.ts` already has:
- `getStatus` — prescription status check (Story 3.4)
- `recordDispense` — pharmacy dispense event (Story 4.3)
- `complete` — prescription fulfillment (Story 4.3)
- `voidPrescription` — prescription voiding (Story 10.1)

The new `checkInteractions` procedure is added to this same router.

The `medicationStatementRouter` in `apps/hub-api/src/trpc/routers/medication-statement.ts` has:
- `listActive` — lists active MedicationStatements for a patient (used as reference for query pattern)

### Drug-DB Package API

From `packages/drug-db/src/checker.ts`:

```typescript
checkInteractions(
  newDrugDisplay: string,
  activeMedDisplayNames: string[],
  allergiesOrOptions?: FhirAllergyIntolerance[] | InteractionCheckOptions,
  adapter?: DrugDatabaseAdapter,
): Promise<InteractionCheckSummary>
```

`InteractionCheckOptions`:
```typescript
{
  activeMedications?: FhirMedicationStatementZod[]
  activeAllergies?: FhirAllergyIntolerance[]
  onStale?: () => void
}
```

`InteractionCheckSummary`:
```typescript
{
  result: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE'
  interactions: InteractionResult[]
  reason?: 'DATABASE_STALE' | 'EMPTY_DATABASE' | 'ADAPTER_ERROR'
}
```

`DrugDatabaseAdapter`:
```typescript
{
  getInteractions(): Promise<VocabInteractionEntry[]>
  getMetadata?(): Promise<{ lastUpdatedAt: string; version: number } | null>
}
```

### Supabase Drug Adapter Design

The server-side adapter differs from the Dexie adapter:
- Uses Supabase client (not IndexedDB/Dexie)
- Queries `vocab_interactions` table with columns `drug_a`, `drug_b`, `severity`, `description`
- Queries `vocab_metadata` or `vocab_versions` table for staleness metadata
- Accepts `SupabaseClient` as constructor parameter (request-scoped, not singleton)
- The module-level cache in `checker.ts` is shared across requests — this is acceptable for a server since the interaction vocabulary is the same for all patients

```typescript
import type { DrugDatabaseAdapter, VocabInteractionEntry } from '@ultranos/drug-db'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createSupabaseDrugAdapter(supabase: SupabaseClient): DrugDatabaseAdapter {
  return {
    async getInteractions(): Promise<VocabInteractionEntry[]> {
      const { data, error } = await supabase
        .from('vocab_interactions')
        .select('drug_a, drug_b, severity, description')
      if (error || !data) return []
      return data.map((row) => ({
        drugA: row.drug_a,
        drugB: row.drug_b,
        severity: row.severity,
        description: row.description,
      }))
    },
    async getMetadata() {
      const { data, error } = await supabase
        .from('vocab_versions')
        .select('last_synced_at, version')
        .eq('vocab_type', 'interactions')
        .single()
      if (error || !data) return null
      return {
        lastUpdatedAt: data.last_synced_at,
        version: data.version,
      }
    },
  }
}
```

### Pending MedicationRequests

The check must include not just active MedicationStatements (chronic/ongoing medications) but also pending MedicationRequests (prescriptions written but not yet dispensed). Extract display names from pending requests:

```typescript
const pendingRxNames = pendingRequests
  .map((rx) => rx.medication_display)
  .filter((name): name is string => !!name)
```

Combine with MedicationStatement display names to form the full list of active medications for the check.

### Input Schema

```typescript
z.object({
  medicationCode: z.string().min(1),
  medicationDisplay: z.string().min(1),
  patientId: z.string().uuid(),
})
```

The `medicationCode` is accepted for future use (coded lookups) but the current checker uses `medicationDisplay` (text-based matching). Both are required to future-proof the API.

### RBAC Notes

Per `apps/hub-api/src/trpc/rbac.ts`, the following roles have `MedicationRequest` access:
- DOCTOR / CLINICIAN (full clinical access)
- PHARMACIST (MedicationRequest read access)
- ADMIN (wildcard)

LAB_TECH and PATIENT roles do NOT have MedicationRequest access and will be denied.

### Safety Rules (CLAUDE.md)

- **Rule #3:** If the drug interaction check fails (adapter error, DB unavailable, stale), return `UNAVAILABLE` with reason — NEVER return `CLEAR` on failure.
- **Rule #6:** Audit every PHI access. The check reads patient medication + allergy data, so an audit event is mandatory.
- **No PHI in logs:** Error logging uses `{ code: error.code }` shape only. Never log patient IDs, drug names, or allergy data in console output.

### What NOT to Change

- DO NOT create a new tRPC router — add the procedure to the existing `medicationRouter`
- DO NOT modify `@ultranos/drug-db` package — it already has everything needed
- DO NOT modify `_app.ts` — the `medication` router is already registered
- DO NOT add `onStale` callback on the server side — there is no background sync on the Hub; staleness indicates the vocab pipeline needs attention (ops concern, not runtime)

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/hub-api/package.json` | UPDATE | Add `@ultranos/drug-db` dependency |
| `apps/hub-api/src/lib/supabase-drug-adapter.ts` | CREATE | Server-side DrugDatabaseAdapter using Supabase |
| `apps/hub-api/src/trpc/routers/medication.ts` | UPDATE | Add `checkInteractions` procedure |
| `apps/hub-api/src/__tests__/medication-check-interactions.test.ts` | CREATE | Tests for the new endpoint |

### Testing Standards

- **Framework:** Vitest (matching existing Hub API test patterns)
- **Mock pattern:** Mock `@/lib/supabase` with `vi.mock()`, use `createTestContext()` helper (see `medication.test.ts` for pattern)
- **RBAC tests:** Test both allowed (CLINICIAN) and denied (LAB_TECH) roles
- **Drug-db mocking:** Mock `@ultranos/drug-db` `checkInteractions` at the module level OR create an in-memory adapter — prefer mocking the adapter since the checker logic is already tested in the drug-db package
- **Audit assertion:** Verify `AuditLogger.emit()` was called with correct action/resourceType

### References

- [Source: packages/drug-db/src/checker.ts] — checkInteractions() API and staleness logic
- [Source: packages/drug-db/src/types.ts] — DrugDatabaseAdapter, InteractionCheckSummary, InteractionCheckOptions
- [Source: apps/hub-api/src/trpc/routers/medication.ts] — Existing medication router to extend
- [Source: apps/hub-api/src/trpc/routers/medication-statement.ts] — listActive query pattern for MedicationStatements
- [Source: apps/hub-api/src/trpc/routers/allergy.ts] — Allergy query pattern (patient_ref, clinical_status_code)
- [Source: apps/hub-api/src/trpc/middleware/enforceResourceAccess.ts] — RBAC middleware
- [Source: apps/hub-api/src/trpc/rbac.ts] — ROLE_PERMISSIONS map (MedicationRequest access)
- [Source: apps/hub-api/src/trpc/init.ts] — protectedProcedure, TRPCContext
- [Source: apps/hub-api/src/__tests__/medication.test.ts] — Test pattern reference
- [Source: _bmad-output/implementation-artifacts/25-1-create-packages-drug-db-package.md] — Drug-db package creation (dependency)
- [Source: _bmad-output/implementation-artifacts/25-2-drug-database-staleness-enforcement.md] — Staleness enforcement (dependency)
- [Source: CLAUDE.md#Rule3] — Drug interaction check safety rule
- [Source: CLAUDE.md#Rule6] — Audit every PHI access

## Dev Agent Record

### Implementation Plan

- Created `createSupabaseDrugAdapter()` factory that implements `DrugDatabaseAdapter` interface using Supabase client queries against `vocab_interactions` and `vocab_versions` tables.
- Added `@ultranos/drug-db` workspace dependency to hub-api.
- Added `checkInteractions` query procedure to the existing `medicationRouter` — queries active MedicationStatements, pending MedicationRequests (ACTIVE), and active AllergyIntolerances, then delegates to `@ultranos/drug-db`'s `checkInteractions()`.
- Audit event emitted as `PHI_READ` with `resourceType: 'INTERACTION_CHECK'` — audit failure is non-fatal (warn + continue).
- RBAC enforced via `protectedProcedure` + `enforceResourceAccess('MedicationRequest')`.

### Debug Log

No issues encountered during implementation. All 12 tests pass on first run.

### Completion Notes

- All 5 tasks and all subtasks completed.
- 12 tests written covering: RBAC (unauthenticated, forbidden role, allowed roles), core functionality (CONTRAINDICATED, ALLERGY_MATCH, CLEAR results), staleness (DATABASE_STALE, EMPTY_DATABASE), audit (emitted correctly, failure non-blocking), and data merging (pending Rx + active statements passed to checker).
- CLAUDE.md Rule #3 upheld: the `@ultranos/drug-db` checker never returns CLEAR on failure — returns UNAVAILABLE with reason.
- CLAUDE.md Rule #6 upheld: audit event emitted for every interaction check.
- No PHI in logs — only error codes logged.

## File List

- `apps/hub-api/src/lib/supabase-drug-adapter.ts` — NEW: Supabase-backed DrugDatabaseAdapter factory
- `apps/hub-api/package.json` — MODIFIED: Added `@ultranos/drug-db` workspace dependency
- `apps/hub-api/src/trpc/routers/medication.ts` — MODIFIED: Added `checkInteractions` procedure with audit
- `apps/hub-api/src/__tests__/medication-check-interactions.test.ts` — NEW: 12 comprehensive tests
- `pnpm-lock.yaml` — MODIFIED: Updated lockfile for new dependency

## Change Log

- 2026-05-11: Implemented Story 16.6 — Hub API drug interaction check endpoint with RBAC, audit, and comprehensive tests.
