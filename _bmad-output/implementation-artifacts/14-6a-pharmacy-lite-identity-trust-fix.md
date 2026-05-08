# Story 14.6a: Pharmacy Lite Identity Trust Fix

Status: done

## Story

As a healthcare system administrator,
I want the pharmacist's dispensing records to use their server-verified identity from the auth session store,
so that dispensing attribution cannot be forged by a malicious client.

## Acceptance Criteria

1. Given an authenticated pharmacist session in Pharmacy Lite, when `medication.recordDispense` is called, then the `pharmacistRef` in the request payload uses the authenticated user's ID from the session store
2. The `confirmDispense()` method in `fulfillment-store.ts` no longer accepts `pharmacistId` as a parameter
3. The fulfillment store reads the practitioner reference internally via `useAuthSessionStore.getState().getPractitionerRef()`
4. In `dispense-sync.ts`, the `pharmacistRef` in the Hub API mutation payload is derived from the auth session store as a belt-and-suspenders validation, not from the dispense record's performer field
5. All callers of `confirmDispense()` (e.g., `PharmacyScannerView.tsx`) are updated to remove the `pharmacistId` argument
6. TypeScript compilation passes with no errors after the parameter removal (type system enforces no client-supplied pharmacistRef)
7. All existing Pharmacy Lite tests pass with mocked auth store — no regressions

## Tasks / Subtasks

- [x] Task 1: Update fulfillment store to read from auth session (AC: #2, #3)
  - [x] In `apps/pharmacy-lite/src/stores/fulfillment-store.ts`, remove `pharmacistId` parameter from `confirmDispense()`
  - [x] Import `useAuthSessionStore` from `../stores/auth-session-store`
  - [x] Call `useAuthSessionStore.getState().getPractitionerRef()` inside `confirmDispense()` to obtain the practitioner reference
  - [x] Throw an error if `getPractitionerRef()` returns null/undefined (session expired guard)
  - [x] Pass the obtained practitioner reference to `createMedicationDispense()`

- [x] Task 2: Update medication-dispense.ts (AC: #1)
  - [x] In `apps/pharmacy-lite/src/lib/medication-dispense.ts`, confirm `createMedicationDispense()` accepts a performer reference parameter from the caller (the fulfillment store)
  - [x] Ensure the performer reference is used as `dispense.performer[0].actor.reference`
  - [x] No external/client-supplied source — the caller (fulfillment store) provides it from auth

- [x] Task 3: Update dispense-sync.ts with belt-and-suspenders validation (AC: #4)
  - [x] In `apps/pharmacy-lite/src/lib/dispense-sync.ts`, import `useAuthSessionStore`
  - [x] In `syncDispenseToHub()`, derive `pharmacistRef` from `useAuthSessionStore.getState().getPractitionerRef()` instead of reading from `dispense.performer[0].actor.reference`
  - [x] If the auth store value is unavailable, abort sync and return error (do not send unverified identity to Hub; cannot queue without valid identity for payload)
  - [x] Log a warning (no PHI) if the stored performer reference differs from the auth store value

- [x] Task 4: Update PharmacyScannerView caller (AC: #5)
  - [x] In `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx`, remove the `pharmacistId` argument from all `confirmDispense()` calls
  - [x] Remove any local state or prop that was used solely to supply pharmacistId to confirmDispense

- [x] Task 5: Update tests (AC: #7)
  - [x] In `apps/pharmacy-lite/src/__tests__/fulfillment-store.test.ts`, mock `useAuthSessionStore.getState()` to return a known practitioner reference
  - [x] Verify `confirmDispense()` uses the mocked auth store value in the resulting dispense record
  - [x] Add a test: calling `confirmDispense()` when auth store returns null throws an error (session expired)
  - [x] In `apps/pharmacy-lite/src/__tests__/dispense-sync.test.ts`, mock `useAuthSessionStore.getState()` to return a known practitioner reference
  - [x] Verify the Hub API payload `pharmacistRef` matches the auth store value, not the performer field
  - [x] Add a test: sync aborts gracefully when auth store returns null

- [x] Task 6: TypeScript verification (AC: #6)
  - [x] Run `pnpm -F pharmacy-lite typecheck` and confirm no errors
  - [x] Confirm that any caller still passing `pharmacistId` to `confirmDispense()` produces a compile error

## Dev Notes

### Security Rationale

This addresses gap analysis finding **PH-G01** and deferred work item **W6**. The current implementation allows client-supplied `pharmacistRef` in dispensing records. A compromised client could forge dispensing attribution, creating regulatory and patient safety risks. After this fix, identity is always derived from the server-verified JWT session.

### Current Code Pattern (BEFORE)

```typescript
// fulfillment-store.ts — CURRENT (insecure)
confirmDispense(pharmacistId: string) {
  // pharmacistId comes from caller — client-supplied
  const dispense = createMedicationDispense({
    performer: pharmacistId,
    // ...
  });
}

// PharmacyScannerView.tsx — CURRENT
const handleConfirm = () => {
  fulfillmentStore.confirmDispense(someLocalPharmacistId);
};
```

### Target Code Pattern (AFTER)

```typescript
// fulfillment-store.ts — FIXED
import { useAuthSessionStore } from './auth-session-store';

confirmDispense() {
  const pharmacistRef = useAuthSessionStore.getState().getPractitionerRef();
  if (!pharmacistRef) {
    throw new Error('Session expired — re-authentication required');
  }
  const dispense = createMedicationDispense({
    performer: pharmacistRef,
    // ...
  });
}

// dispense-sync.ts — FIXED (belt-and-suspenders)
import { useAuthSessionStore } from '../stores/auth-session-store';

async function syncDispenseToHub(dispense: MedicationDispense) {
  const pharmacistRef = useAuthSessionStore.getState().getPractitionerRef();
  if (!pharmacistRef) {
    // Queue for retry — do not send unverified identity
    return { status: 'queued', reason: 'auth-unavailable' };
  }
  // Use pharmacistRef from auth store, NOT from dispense.performer
  await hubMutation({ pharmacistRef, ... });
}
```

### Files That Will Change

| File | Action |
|------|--------|
| `apps/pharmacy-lite/src/stores/fulfillment-store.ts` | UPDATE — remove pharmacistId param, read from auth store |
| `apps/pharmacy-lite/src/lib/medication-dispense.ts` | UPDATE — accept practitioner ref from caller (store) |
| `apps/pharmacy-lite/src/lib/dispense-sync.ts` | UPDATE — derive pharmacistRef from auth store as validation |
| `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx` | UPDATE — remove pharmacistId from confirmDispense calls |
| `apps/pharmacy-lite/src/__tests__/fulfillment-store.test.ts` | UPDATE — mock auth store |
| `apps/pharmacy-lite/src/__tests__/dispense-sync.test.ts` | UPDATE — mock auth store |

### What NOT To Change

- DO NOT modify OPD Lite or any other spoke app
- DO NOT modify the auth session store interface (`auth-session-store.ts`)
- DO NOT change Hub API endpoints or their contracts
- DO NOT alter the `getPractitionerRef()` return format (`Practitioner/{id}`)

### Testing Standards

- Mock `useAuthSessionStore.getState()` in all affected test files using `jest.mock()` or equivalent
- Verify the `pharmacistRef` in the Hub API payload matches the auth store value exactly
- Verify `confirmDispense()` no longer accepts a `pharmacistId` parameter (TypeScript compiler is the primary enforcement mechanism)
- Test the error/abort path when auth store returns null (session expired scenario)
- No PHI in test assertions or mock data — use opaque IDs like `practitioner-abc-123`

## Dev Agent Record

### Implementation Plan

Removed `pharmacistId` parameter from `confirmDispense()` and replaced it with internal auth session store lookup. Updated `createMedicationDispense()` to accept a full practitioner reference (`Practitioner/{id}`) instead of a bare ID. Added belt-and-suspenders validation in `dispense-sync.ts` to derive `pharmacistRef` from auth store at sync time, independent of the performer field in the dispense record. Added mismatch warning logging (no PHI).

### Completion Notes

- All 6 tasks completed. Security gap PH-G01 / deferred work W6 addressed.
- `confirmDispense()` now accepts zero arguments — TypeScript enforces no client-supplied identity.
- Auth store `getPractitionerRef()` is the single source of truth for pharmacist identity in both dispensing and sync paths.
- Belt-and-suspenders: `dispense-sync.ts` independently validates identity from auth store before Hub API submission.
- Mismatch detection: warns if stored performer differs from auth session (forensic indicator).
- Session expired guard: throws descriptive error when `getPractitionerRef()` fails.
- Task 4 (PharmacyScannerView): No `confirmDispense()` calls found in any component — only called via store in tests.
- Pre-existing test failures: `EncryptionKeyNotAvailableError` in Dexie persistence tests (unrelated to this story).
- Pre-existing TypeScript errors in `dexie-encryption-middleware.ts`, `MedicationLabel.tsx`, `AuthGuard.tsx`, `login/page.tsx` (unrelated).

### Debug Log

No significant debugging required.

### Review Findings

- [x] [Review][Decision] Auth failure in dispense-sync returns `queued: false` but spec Task 3 and code comment say "queue for retry" — resolved: accept current behavior, updated comment and spec (A)
- [x] [Review][Patch] Missed format update: bare `'pharmacist-001'` instead of `'Practitioner/pharmacist-001'` in test — fixed [medication-dispense.test.ts:211]
- [x] [Review][Patch] No validation on `pharmacistRef` format in `createMedicationDispense` — fixed with template literal type `Practitioner/${string}` [medication-dispense.ts:13]
- [x] [Review][Defer] Stale `pharmacistRef` baked into queued retry payloads — pre-existing sync design issue, not introduced by this change
- [x] [Review][Defer] TOCTOU between dual `getPractitionerRef()` calls in fulfillment-store and dispense-sync — intentional per spec belt-and-suspenders design
- [x] [Review][Defer] Audit service reads pharmacistRef from `dispense.performer`, not from auth store — out of scope for this story
- [x] [Review][Defer] No error state in fulfillment store for auth failure — UI concern, out of scope

## File List

| File | Action |
|------|--------|
| `apps/pharmacy-lite/src/stores/fulfillment-store.ts` | UPDATED — removed pharmacistId param, reads from auth store |
| `apps/pharmacy-lite/src/lib/medication-dispense.ts` | UPDATED — accepts full practitioner ref from caller |
| `apps/pharmacy-lite/src/lib/dispense-sync.ts` | UPDATED — derives pharmacistRef from auth store as validation |
| `apps/pharmacy-lite/src/__tests__/fulfillment-store.test.ts` | UPDATED — mocked auth store, added identity trust + session expired tests |
| `apps/pharmacy-lite/src/__tests__/dispense-sync.test.ts` | UPDATED — mocked auth store, added pharmacistRef derivation + null-auth tests |
| `apps/pharmacy-lite/src/__tests__/medication-dispense.test.ts` | UPDATED — pass full practitioner ref to match new signature |

## Change Log

- 2026-05-08: Implemented story 14-6a — Pharmacy Lite identity trust fix (PH-G01 / W6). Removed client-supplied pharmacistId from dispensing flow, replaced with server-verified identity from auth session store.

## References

- Gap analysis finding: PH-G01 (pharmacist identity trust)
- Deferred work item: W6 in `_bmad-output/implementation-artifacts/deferred-work.md`
- Auth session store: `apps/pharmacy-lite/src/stores/auth-session-store.ts`
- Epic 14 AC for this story in sprint status
