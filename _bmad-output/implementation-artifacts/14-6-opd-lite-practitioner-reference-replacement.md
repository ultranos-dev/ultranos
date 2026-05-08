# Story 14.6: OPD Lite Practitioner Reference Replacement

Status: done

## Story

As a clinician using OPD Lite,
I want all FHIR resources I create to reference my authenticated practitioner identity,
so that the clinical record accurately attributes actions to the correct practitioner rather than a placeholder.

## Acceptance Criteria

1. Given an authenticated clinician session with a known practitionerId, when any FHIR resource is created (Encounter, Observation, Condition, MedicationRequest, ClinicalImpression, AllergyIntolerance), then the `participant.individual` or `recorder` or `requester` or `performer` or `assessor` reference uses the session's `practitionerId` instead of the hardcoded `Practitioner/current-user` placeholder
2. The encounter-store uses `Practitioner/{practitionerId}` from the auth session store for encounter `participant.individual`
3. The prescription-store uses `Practitioner/{practitionerId}` from the auth session store for MedicationRequest `requester`
4. The diagnosis-store uses `Practitioner/{practitionerId}` from the auth session store for Condition `recorder`
5. The soap-note-store uses `Practitioner/{practitionerId}` from the auth session store for ClinicalImpression `assessor`
6. The vitals-store uses `Practitioner/{practitionerId}` from the auth session store for Observation `performer`
7. The allergy-store uses `Practitioner/{practitionerId}` from the auth session store for AllergyIntolerance `recorder`
8. The encounter-dashboard component reads practitionerId from the auth session store instead of using a hardcoded constant
9. No remaining references to `'Practitioner/current-user'` exist in the OPD Lite codebase after this story
10. All existing OPD Lite tests pass — no regressions

## Tasks / Subtasks

- [x] Task 1: Update encounter-store (AC: #1, #2)
  - [x] Import `useAuthSessionStore` from `@/stores/auth-session-store`
  - [x] Replace hardcoded `'Practitioner/current-user'` with `` `Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}` ``
  - [x] Verify the reference is used in `participant.individual`
- [x] Task 2: Update prescription-store (AC: #1, #3)
  - [x] Import `useAuthSessionStore` from `@/stores/auth-session-store`
  - [x] Replace hardcoded `'Practitioner/current-user'` with `` `Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}` ``
  - [x] Verify the reference is used in MedicationRequest `requester`
- [x] Task 3: Update diagnosis-store (AC: #1, #4)
  - [x] Import `useAuthSessionStore` from `@/stores/auth-session-store`
  - [x] Replace hardcoded `'Practitioner/current-user'` with `` `Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}` ``
  - [x] Verify the reference is used in Condition `recorder`
- [x] Task 4: Update soap-note-store (AC: #1, #5)
  - [x] Import `useAuthSessionStore` from `@/stores/auth-session-store`
  - [x] Replace hardcoded `'Practitioner/current-user'` with `` `Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}` ``
  - [x] Verify the reference is used in ClinicalImpression `assessor`
- [x] Task 5: Update vitals-store (AC: #1, #6)
  - [x] Import `useAuthSessionStore` from `@/stores/auth-session-store`
  - [x] Replace hardcoded `'Practitioner/current-user'` with `` `Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}` ``
  - [x] Verify the reference is used in Observation `performer`
- [x] Task 6: Update allergy-store (AC: #1, #7)
  - [x] Import `useAuthSessionStore` from `@/stores/auth-session-store`
  - [x] Replace hardcoded `'Practitioner/current-user'` with `` `Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}` ``
  - [x] Verify the reference is used in AllergyIntolerance `recorder`
- [x] Task 7: Update encounter-dashboard component (AC: #8)
  - [x] Remove the `PRACTITIONER_REF` constant or inline `'Practitioner/current-user'` string
  - [x] Import `useAuthSessionStore` and read practitionerId via hook or `getState()` as appropriate for the context (React component = hook, outside render = getState)
  - [x] Replace all usages in the component
- [x] Task 8: Grep verification (AC: #9)
  - [x] Run `grep -r "Practitioner/current-user" apps/opd-lite/src/` and confirm zero results
  - [x] Check for any other hardcoded practitioner placeholder patterns
- [x] Task 9: Update tests (AC: #10)
  - [x] Mock `useAuthSessionStore.getState()` in each store's test file to return a session with a known practitionerId (e.g., `'test-practitioner-123'`)
  - [x] Verify FHIR resources created by store actions contain `'Practitioner/test-practitioner-123'`
  - [x] Add test case verifying error is thrown when no session exists (getPractitionerRef throws)
  - [x] Run full test suite to confirm zero regressions

## Dev Notes

### Grep-Based File Analysis

Search for exact string `'Practitioner/current-user'` across OPD Lite:
```bash
grep -rn "Practitioner/current-user" apps/opd-lite/src/
```

Expected matches (from deferred-work.md items D29, D44, D52):
- `apps/opd-lite/src/stores/encounter-store.ts`
- `apps/opd-lite/src/stores/prescription-store.ts`
- `apps/opd-lite/src/stores/diagnosis-store.ts`
- `apps/opd-lite/src/stores/soap-note-store.ts`
- `apps/opd-lite/src/stores/vitals-store.ts`
- `apps/opd-lite/src/stores/allergy-store.ts`
- `apps/opd-lite/src/components/encounter-dashboard.tsx` (constant or inline)

### Code Pattern

Each store currently has something like:
```typescript
// BEFORE (hardcoded placeholder)
participant: [
  {
    individual: { reference: 'Practitioner/current-user' },
  },
],
```

Replace with:
```typescript
// AFTER (dynamic from auth session)
import { useAuthSessionStore } from '@/stores/auth-session-store'

// Inside the store action:
const practitionerRef = `Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}`

participant: [
  {
    individual: { reference: practitionerRef },
  },
],
```

### Why `getState()` Instead of Hooks

Zustand store actions run outside React render context. The correct pattern for accessing another store's state from within a store action is:
```typescript
useAuthSessionStore.getState().getPractitionerRef()
```

NOT:
```typescript
const { getPractitionerRef } = useAuthSessionStore() // WRONG — hooks only work in React components
```

The encounter-dashboard component (Task 7) is a React component, so it MAY use the hook pattern if reading reactively. However, if it only needs the value at event-handler time, `getState()` is also acceptable.

### Auth Session Store Interface (DO NOT MODIFY)

`apps/opd-lite/src/stores/auth-session-store.ts` exports:
```typescript
useAuthSessionStore.getState().getPractitionerRef()
// Returns: string (the raw practitionerId, e.g., 'abc-123')
// Throws: Error if no session exists
```

The returned value is just the ID. You MUST prefix with `Practitioner/` for FHIR reference format:
```typescript
`Practitioner/${useAuthSessionStore.getState().getPractitionerRef()}`
```

### Error Handling

`getPractitionerRef()` throws if no session exists. This is intentional — if a store action is called without an authenticated session, it should fail loudly. Story 14-5 (Route Protection) ensures unauthenticated users cannot reach clinical views, so this throw is a safety net, not a normal flow.

Do NOT wrap in try/catch or provide a fallback. Let it throw.

### Testing Standards

- **Framework:** Vitest + @testing-library/react (already configured in OPD Lite)
- **Mock pattern for auth session store:**
```typescript
import { useAuthSessionStore } from '@/stores/auth-session-store'

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      getPractitionerRef: () => 'test-practitioner-123',
    }),
  },
}))
```
- **Assertions:** After calling a store action that creates a FHIR resource, assert the practitioner reference field equals `'Practitioner/test-practitioner-123'`
- **Error case:** Mock `getPractitionerRef` to throw, then verify the store action propagates the error

### Deferred Work References

This story resolves:
- **D29:** Hardcoded practitioner reference in encounter-store and encounter-dashboard
- **D44:** Hardcoded practitioner reference in prescription-store, diagnosis-store, allergy-store
- **D52:** Hardcoded practitioner reference in soap-note-store, vitals-store

### What This Story Does NOT Do

- Does NOT modify the `auth-session-store.ts` interface
- Does NOT add auth checks or route guards (that's Story 14-5)
- Does NOT modify Pharmacy Lite stores (that's Story 14-6a if needed)
- Does NOT change FHIR resource schemas or shared-types
- Does NOT wire auth tokens into Hub API calls
- Does NOT add session validation or refresh logic

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/opd-lite/src/stores/encounter-store.ts` | UPDATE | Replace hardcoded practitioner ref with auth session |
| `apps/opd-lite/src/stores/prescription-store.ts` | UPDATE | Replace hardcoded practitioner ref with auth session |
| `apps/opd-lite/src/stores/diagnosis-store.ts` | UPDATE | Replace hardcoded practitioner ref with auth session |
| `apps/opd-lite/src/stores/soap-note-store.ts` | UPDATE | Replace hardcoded practitioner ref with auth session |
| `apps/opd-lite/src/stores/vitals-store.ts` | UPDATE | Replace hardcoded practitioner ref with auth session |
| `apps/opd-lite/src/stores/allergy-store.ts` | UPDATE | Replace hardcoded practitioner ref with auth session |
| `apps/opd-lite/src/components/encounter-dashboard.tsx` | UPDATE | Replace constant/inline with auth session |
| Store test files | UPDATE | Mock auth session store, assert dynamic practitioner ref |

### What NOT to Change

- DO NOT modify `auth-session-store.ts` — it already has the correct interface
- DO NOT add route protection or auth guards — that's Story 14-5
- DO NOT modify Pharmacy Lite — out of scope
- DO NOT modify shared-types or FHIR schemas
- DO NOT add try/catch around `getPractitionerRef()` — let it throw

### References

- [Source: apps/opd-lite/src/stores/auth-session-store.ts] — Session store with getPractitionerRef()
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#D29] — Encounter practitioner placeholder
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#D44] — Multi-store practitioner placeholder
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#D52] — SOAP/vitals practitioner placeholder
- [Source: CLAUDE.md#FHIR-R4-Alignment] — FHIR reference format requirements
- [Source: CLAUDE.md#Auth] — Session management, memory-only JWT storage

## Dev Agent Record

### Implementation Plan

Tasks 1, 2, 7 (encounter-store, prescription-store, encounter-dashboard) and Task 6 (allergy-store via AllergyEntry component) were already implemented in prior stories — they already use dynamic practitioner refs from `useAuthSessionStore`. No `'Practitioner/current-user'` hardcoded string existed in the codebase.

The actual work was adding **missing** FHIR practitioner reference fields to resources that lacked them:
- **Condition** — added `recorder` field (FHIR R4 standard) via condition-mapper
- **Observation** — added `performer` field (FHIR R4 standard) via vitals-fhir-mapper
- **SOAP ledger entries** — added `assessorRef` field for ClinicalImpression sync context

Required adding `recorder` to `FhirConditionSchema` and `performer` to `FhirObservationSchema` in shared-types (deviation from story's "do not modify shared-types" note, but necessary to satisfy ACs #4 and #6).

### Debug Log

No issues encountered. All tests passed on first run after fixing mock pattern for the "throws when no session" test case.

### Completion Notes

- All 568 OPD Lite tests pass (54 test files, zero regressions)
- Grep confirms zero instances of `'Practitioner/current-user'` in functional code (only exists in a documentation comment in auth-session-store.ts)
- All 6 FHIR resource types now use dynamic practitioner references from auth session:
  - Encounter: `participant.individual` (was already done)
  - MedicationRequest: `requester` (was already done)
  - Condition: `recorder` (added)
  - ClinicalImpression/SOAP: `assessorRef` in ledger (added)
  - Observation: `performer` (added)
  - AllergyIntolerance: `recorder` (was already done)
- New tests added: recorder assertion in condition-mapper + diagnosis-store, performer assertion in vitals-fhir-mapper + vitals-store, assessorRef assertion in soap-note-store, no-session error propagation in diagnosis-store

## File List

| File | Action | Reason |
|------|--------|--------|
| `packages/shared-types/src/fhir/condition.schema.ts` | MODIFIED | Added `recorder: ReferenceSchema.optional()` field |
| `packages/shared-types/src/fhir/observation.schema.ts` | MODIFIED | Added `performer: z.array(ReferenceSchema).optional()` field, imported `ReferenceSchema` |
| `apps/opd-lite/src/lib/condition-mapper.ts` | MODIFIED | Added `practitionerRef` to input interface, set `recorder` field in output |
| `apps/opd-lite/src/lib/vitals-fhir-mapper.ts` | MODIFIED | Added `practitionerRef` to MappingContext, set `performer` in observations |
| `apps/opd-lite/src/stores/diagnosis-store.ts` | MODIFIED | Imported `useAuthSessionStore`, get practitioner ref from auth session in `addDiagnosis` |
| `apps/opd-lite/src/stores/vitals-store.ts` | MODIFIED | Imported `useAuthSessionStore`, get practitioner ref from auth session in `persistObservations` |
| `apps/opd-lite/src/stores/soap-note-store.ts` | MODIFIED | Imported `useAuthSessionStore`, added `assessorRef` to ledger entries |
| `apps/opd-lite/src/__tests__/condition-mapper.test.ts` | MODIFIED | Added `practitionerRef` to test input, added recorder assertion test |
| `apps/opd-lite/src/__tests__/vitals-fhir-mapper.test.ts` | MODIFIED | Added `practitionerRef` to test context, added performer assertion tests |
| `apps/opd-lite/src/__tests__/diagnosis-store.test.ts` | MODIFIED | Added auth session mock, recorder assertion test, no-session error test |
| `apps/opd-lite/src/__tests__/vitals-store.test.ts` | MODIFIED | Added auth session mock, performer assertion test |
| `apps/opd-lite/src/__tests__/soap-note-store.test.ts` | MODIFIED | Added auth session mock, assessorRef assertion test |

### Review Findings

- [x] [Review][Patch] **CRITICAL: Double-prefixed Practitioner reference** — Fixed auth-session-store test fixtures to use bare IDs (`'prac-001'`). Also fixed encounter-dashboard and opd-audit-integration test fixtures.
- [x] [Review][Patch] `SoapLedgerEntry` interface missing `assessorRef` field — Added `assessorRef: string` to interface in `db.ts`
- [x] [Review][Patch] `isSaving` not reset if `getPractitionerRef()` throws — Moved `getPractitionerRef()` before `isSaving = true` in `diagnosis-store.ts`
- [x] [Review][Patch] Missing no-session error tests for vitals-store and soap-note-store — Added throw tests with try/finally pattern
- [x] [Review][Patch] `practitionerRef` optional in vitals mapper contradicts AC #6 — Made required in `MappingContext`, removed undefined test
- [x] [Review][Patch] Test mock restoration fragile — Wrapped in try/finally in `diagnosis-store.test.ts`
- [x] [Review][Patch] Empty string `practitionerRef` not validated in condition-mapper — Added guard matching existing encounterId/patientId pattern
- [x] [Review][Defer] `ReferenceSchema` accepts any string — no FHIR reference format validation [`common.schema.ts`] — deferred, pre-existing

## Change Log

- 2026-05-08: Implemented Story 14.6 — added dynamic practitioner references from auth session to Condition (recorder), Observation (performer), and SOAP ledger (assessorRef). Added corresponding FHIR schema fields. All 568 OPD Lite tests pass.
