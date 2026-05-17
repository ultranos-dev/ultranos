# Story 26.7: Practitioner Key Revalidation Wiring

Status: done

## Story

As a pharmacist,
I want stale practitioner keys to be automatically revalidated,
so that I'm always using up-to-date key trust information when verifying prescriptions.

## Acceptance Criteria

1. **Given** a cached practitioner key with `stale: true` (TTL expired), **When** the key is needed for prescription verification, **Then** `revalidateKey()` is automatically called before verification proceeds
2. **Given** a revalidation where the Hub confirms the key is active, **When** the response is received, **Then** the cache is refreshed with a new TTL
3. **Given** a revalidation where the Hub says the key is revoked, **When** the response is received, **Then** the cache entry is deleted and verification fails with `KEY_REVOKED`
4. **Given** a revalidation where the Hub is unreachable, **When** the network call fails, **Then** the stale key is treated as untrusted (fail-closed) and the pharmacist is shown an offline verification warning

## Tasks / Subtasks

- [x] Task 1: Wire revalidation into prescription verification flow (AC: #1)
  - [x] 1.1 In `src/lib/prescription-verify.ts`, locate the key lookup step where the practitioner key is fetched from cache
  - [x] 1.2 After cache lookup, check if the key has `stale: true` (TTL expired)
  - [x] 1.3 If stale, call `revalidateKey()` from `src/lib/practitioner-key-cache.ts` before proceeding with signature verification
  - [x] 1.4 Pass the Hub API base URL and auth token from `auth-session-store.getAccessToken()`
- [x] Task 2: Handle revalidation outcomes (AC: #2, #3, #4)
  - [x] 2.1 **Key confirmed active:** `revalidateKey()` already updates the cache with fresh TTL — verification proceeds normally
  - [x] 2.2 **Key revoked:** `revalidateKey()` already deletes the cache entry — return `VerificationResult` with status `key_revoked`
  - [x] 2.3 **Hub unreachable:** `revalidateKey()` returns `null` on network failure — treat as untrusted:
    - Return a new verification status: `key_untrusted_offline` (or similar)
    - Display a warning to the pharmacist: "Prescriber key could not be verified — Hub unreachable. Proceed with caution."
    - Do NOT allow dispensing with an untrusted key (fail-closed per CLAUDE.md security rules)
- [x] Task 3: Update verification UI for new status (AC: #4)
  - [x] 3.1 In `PharmacyScannerView.tsx`, handle the new `key_untrusted_offline` verification result
  - [x] 3.2 Show an amber warning panel: "Prescriber verification unavailable — Hub offline. Key was previously valid but has expired. Cannot verify current status."
  - [x] 3.3 Provide two options: "Wait and Retry" (re-attempt revalidation) and "Cancel" (discard prescription)
  - [x] 3.4 Do NOT provide a "Proceed Anyway" option — fail-closed is mandatory
- [x] Task 4: Fix hardcoded actor ID (AC: #1)
  - [x] 4.1 In `fulfillment-store.ts` line 87, replace hardcoded `'pharmacy-user'` with `useAuthSessionStore.getState().userId` for audit PHI access calls
  - [x] 4.2 This is deferred work item D115 — fixes the audit actor identification
- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Unit test: stale key triggers `revalidateKey()` before verification
  - [x] 5.2 Unit test: active key response refreshes cache, verification succeeds
  - [x] 5.3 Unit test: revoked key response deletes cache, returns `key_revoked`
  - [x] 5.4 Unit test: network failure returns `key_untrusted_offline`, blocks dispensing
  - [x] 5.5 Unit test: non-stale key skips revalidation, verification proceeds immediately
  - [x] 5.6 Unit test: `PharmacyScannerView` renders offline warning for `key_untrusted_offline`

## Dev Notes

### Architecture & Patterns

- **Fail-closed is NON-NEGOTIABLE.** Per CLAUDE.md and architecture decisions: if a key cannot be verified, the prescription MUST be rejected. There is no "proceed anyway" path. This protects against dispensing based on revoked/compromised practitioner credentials.
- **Existing revalidation logic** in `practitioner-key-cache.ts` already implements the core revalidation:
  - `getCachedKey(pubKeyBase64)` returns the key with a `stale` flag if TTL expired
  - `revalidateKey(pubKeyBase64, hubBaseUrl, authToken)` calls the Hub API `practitioner.getKeyStatus` endpoint
  - Returns updated key on success, deletes on revoked, returns null on network failure
- **The gap is WIRING.** The revalidation functions exist but are not called during the verification flow in `prescription-verify.ts`. This story connects them.
- **Auth token sourcing:** Use `useAuthSessionStore.getState().getAccessToken()` — this is an async method that fetches the current Supabase access token. The revalidation call is already async (network call to Hub), so this fits naturally.
- **TTL for practitioner keys:** 24 hours, configured in `practitioner-key-cache.ts`. After 24h, the cached key is marked `stale: true` but not deleted.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `src/lib/prescription-verify.ts` | Add stale key check + `revalidateKey()` call before signature verification |
| `src/components/pharmacy/PharmacyScannerView.tsx` | Handle new `key_untrusted_offline` verification result |
| `src/stores/fulfillment-store.ts` | Fix D115: replace hardcoded `'pharmacy-user'` with auth session userId (line 87) |

### Key Code Flow

```
prescription-verify.ts: verifyPrescriptionQr()
  → getCachedKey(pubKeyBase64)
  → if (key.stale) {
      const refreshed = await revalidateKey(pubKeyBase64, hubUrl, authToken)
      if (!refreshed) return { status: 'key_untrusted_offline' }  // fail-closed
      if (refreshed.revoked) return { status: 'key_revoked' }
      // else: key refreshed, proceed with signature verification
    }
  → verifyEd25519Signature(...)
```

### Deferred Work Items Addressed

- **D115:** Hardcoded `'pharmacy-user'` actor ID in `fulfillment-store.ts` replaced with authenticated user ID
- **W1 (from 4-1):** Practitioner key cache TTL revalidation — this story implements the wiring

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 26.7]
- [Source: apps/pharmacy-lite/src/lib/practitioner-key-cache.ts — getCachedKey, revalidateKey]
- [Source: apps/pharmacy-lite/src/lib/prescription-verify.ts — verifyPrescriptionQr flow]
- [Source: apps/pharmacy-lite/src/stores/fulfillment-store.ts — D115 hardcoded actor]
- [Source: CLAUDE.md — Security: fail-closed key verification]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Existing `invalid_signature` tests lacked seeded keys — fixed by adding practitioner key seeding
- `vi.restoreAllMocks()` in test suite was clearing auth mock — replaced with targeted `fetchSpy.mockRestore()`
- 21 pre-existing test failures in pharmacy-lite (encryption key, snapshot, SyncQueueDashboard) — unrelated to this story

### Completion Notes List
- **Task 1+2:** Replaced `lookupPractitionerByPublicKey` (which deleted stale keys) with `getCachedKey` + `revalidateStaleKey` flow. Stale keys now trigger Hub revalidation instead of being silently deleted. Added `key_untrusted_offline` to `VerificationResult` type. Removed dead `logExpiredKeyAttempt` function.
- **Task 3:** Added `key_untrusted_offline`, `key_revoked`, and `untrusted` cases to `ResultDisplay` switch in `PharmacyScannerView`. Offline warning shows amber panel with "Wait and Retry" + "Cancel" — no "Proceed Anyway" (fail-closed). Key revoked shows red panel with revocation details.
- **Task 4 (D115):** Replaced hardcoded `'pharmacy-user'` with `useAuthSessionStore.getState().session?.userId ?? 'unknown'` in both `fulfillment-store.ts` and `prescription-verify.ts` audit calls.
- **Task 5:** Added 8 new tests: 6 revalidation tests (stale trigger, active refresh, revoked delete, network failure, auth unavailable, Hub 500) + 2 UI tests (offline warning, key revoked warning). Updated 2 existing tests that needed key seeding.

### Review Findings

- [x] [Review][Decision] **`expired` key status falls through as active in revalidateStaleKey** — `revalidateStaleKey()` only checks for `result.status === 'revoked'`; if the Hub returns `status: 'expired'`, it falls through to `return null`, treating the key as active and proceeding with verification. This violates fail-closed. The `RevalidationResult` type includes `'expired'` but no code path handles it. Decision: should expired keys be rejected (like revoked), or treated as a distinct status? [prescription-verify.ts:197] (blind+edge+auditor)
- [x] [Review][Decision] **"Wait and Retry" button calls fetchAndCachePractitionerKey instead of re-running revalidation** — When the pharmacist clicks "Wait and Retry" on the offline warning, `handleFetchKey` calls `fetchAndCachePractitionerKey()` (a different endpoint that doesn't check revocation status), then `handleVerify`. The freshly-cached key has a new `cachedAt`, so `stale` is `false`, and the revalidation check is skipped entirely on the re-run. A revoked key could be re-cached as active through this path. Decision: should retry just re-run `handleVerify(rawQr)` directly (which triggers full revalidation), or call a dedicated retry function? [PharmacyScannerView.tsx:103] (edge+auditor)
- [x] [Review][Patch] **No audit events emitted for revalidation outcomes** — When a stale key is revalidated (active, revoked, or unreachable), no audit event is emitted. `logRevokedKeyAttempt` only covers local KRL matches. Revoked-key discovery via Hub revalidation and network-failure-blocked verification are security-relevant events with no audit trail. [prescription-verify.ts:174-203] (edge+auditor)
- [x] [Review][Patch] **handleFetchKey: getAccessToken() call is outside try/catch** — In `handleFetchKey`, `const token = await useAuthSessionStore.getState().getAccessToken()` is before the try block. If `getAccessToken()` throws, the promise rejects unhandled, leaving the UI stuck with no error feedback. [PharmacyScannerView.tsx:96] (edge+blind)
- [x] [Review][Patch] **Warning message text deviates slightly from spec** — Spec requires a single sentence: "Prescriber verification unavailable — Hub offline. Key was previously valid but has expired. Cannot verify current status." Actual text is split across title + body with minor wording differences and adds "Dispensing is blocked..." not in spec. [PharmacyScannerView.tsx:1094-1103] (auditor)
- [x] [Review][Defer] handleVerify has no try/catch — unhandled rejection if verifyPrescriptionQr throws [PharmacyScannerView.tsx:695] — deferred, pre-existing
- [x] [Review][Defer] processingRef never reset after camera scan handleVerify completes [PharmacyScannerView.tsx:716] — deferred, pre-existing
- [x] [Review][Defer] confirmDispense partial failure loses track of which items were dispensed vs failed [fulfillment-store.ts:158] — deferred, pre-existing
- [x] [Review][Defer] confirmDispense race condition — double-tap can bypass phase guard [fulfillment-store.ts:138] — deferred, pre-existing
- [x] [Review][Defer] paste + camera concurrent verification race condition [PharmacyScannerView.tsx] — deferred, pre-existing
- [x] [Review][Defer] TOCTOU gap — confirmDispense does not re-verify key freshness before dispensing [fulfillment-store.ts] — deferred, design question
- [x] [Review][Defer] fetchAndCachePractitionerKey does not check local KRL before caching [prescription-verify.ts:209-244] — deferred, pre-existing

### Change Log
- 2026-05-14: Implemented practitioner key revalidation wiring (Story 26.7). All ACs satisfied. Fixed D115 hardcoded actor ID.

### File List
- `apps/pharmacy-lite/src/lib/prescription-verify.ts` — Modified: replaced lookup with getCachedKey + revalidateStaleKey, added key_untrusted_offline status, fixed audit actor
- `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx` — Modified: added key_untrusted_offline, key_revoked, untrusted result cases to ResultDisplay
- `apps/pharmacy-lite/src/stores/fulfillment-store.ts` — Modified: replaced hardcoded 'pharmacy-user' with authenticated userId (D115)
- `apps/pharmacy-lite/src/__tests__/prescription-verify.test.ts` — Modified: added auth/trpc mocks, 6 revalidation tests, fixed 2 existing tests
- `apps/pharmacy-lite/src/__tests__/PharmacyScannerView.test.tsx` — Modified: added 2 UI tests for key_untrusted_offline and key_revoked rendering
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Modified: story status updated
- `_bmad-output/implementation-artifacts/26-7-practitioner-key-revalidation-wiring.md` — Modified: tasks checked, dev agent record updated
