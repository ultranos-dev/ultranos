# Story 14.3b: Pharmacy Lite Session Timeout Integration

Status: done

## Story

As a pharmacist,
I want my Pharmacy Lite session to timeout after inactivity,
so that the dispensing workstation is protected.

## Acceptance Criteria

1. `SessionManagerProvider` from `@ultranos/ui-kit` is integrated into Pharmacy Lite's layout
2. Session max duration is set to 12 hours for PHARMACIST role (from `SESSION_DURATIONS`)
3. Inactivity timeout is set to 30 minutes (from `INACTIVITY_TIMEOUT`)
4. After 25 minutes of inactivity, a warning toast appears
5. After 30 minutes of inactivity, the re-auth modal is shown requiring password re-entry
6. Successful re-auth dismisses the modal and resets the inactivity timer
7. Failed re-auth or "Sign Out" triggers forced logout which:
   - Wipes the Dexie encryption key via `encryptionKeyStore.wipe()`
   - Stops the audit drain worker via `stopAuditDrain()`
   - Clears the auth session store via `useAuthSessionStore.clearSession()`
   - Signs out of Supabase via `supabase.auth.signOut()`
   - Redirects to `/login`
8. The `AuthSession` interface is extended with `email` field for re-auth modal display
9. All existing Pharmacy Lite tests pass — no regressions

## Tasks / Subtasks

- [x] Task 1: Extend auth session store with `email` field (AC: #8)
  - [x] Add `email: string` to `AuthSession` interface in `apps/pharmacy-lite/src/stores/auth-session-store.ts`
  - [x] No other changes to the store — `setSession` already accepts the full object

- [x] Task 2: Update login page to store email (AC: #8)
  - [x] In `apps/pharmacy-lite/src/app/login/page.tsx`, after MFA verify success, extract email from `sessionData.session?.user?.email`
  - [x] Pass `email` in the `setSession()` call alongside userId, practitionerId, role, sessionId
  - [x] Fallback to empty string if email is unavailable

- [x] Task 3: Create session timeout wrapper component (AC: #1, #2, #3)
  - [x] Create `apps/pharmacy-lite/src/components/SessionTimeoutWrapper.tsx` — a `'use client'` component
  - [x] Import `SessionManagerProvider`, `SESSION_DURATIONS`, `INACTIVITY_TIMEOUT` from `@ultranos/ui-kit`
  - [x] Import `useAuthSessionStore` to read session and email
  - [x] Only render `SessionManagerProvider` when `isAuthenticated === true`
  - [x] Pass `maxDurationMs`: `SESSION_DURATIONS[session.role] ?? SESSION_DURATIONS.PHARMACIST`
  - [x] Pass `inactivityMs` as `INACTIVITY_TIMEOUT` (30 minutes)
  - [x] Pass `userEmail` from `session.email`

- [x] Task 4: Wire `onExpired` callback — cleanup (AC: #7)
  - [x] In `SessionTimeoutWrapper.tsx`, implement the `onExpired` callback:
    ```
    encryptionKeyStore.wipe()
    stopAuditDrain()
    useAuthSessionStore.getState().clearSession()
    await supabase.auth.signOut()
    window.location.href = '/login'
    ```
  - [x] Import encryptionKeyStore, stopAuditDrain, auth session store, Supabase client

- [x] Task 5: Wire `onReAuth` callback — password re-verification (AC: #5, #6)
  - [x] In `SessionTimeoutWrapper.tsx`, implement the `onReAuth` callback:
    ```
    async (password: string): Promise<boolean> => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) {
          // Fallback to store email
          const session = useAuthSessionStore.getState().session
          if (!session?.email) return false
          const { error } = await supabase.auth.signInWithPassword({ email: session.email, password })
          return !error
        }
        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password })
        return !error
      } catch { return false }
    }
    ```
  - [x] Pattern matches OPD Lite's 14-3a review finding: try getUser(), fall back to store email

- [x] Task 6: Integrate into layout (AC: #1)
  - [x] Update `apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx` to wrap children with `SessionTimeoutWrapper`
  - [x] Place INSIDE `ErrorBoundary` → `AsyncErrorBridge` → before `{children}`

- [x] Task 7: Write tests (AC: #9)
  - [x] Create `apps/pharmacy-lite/src/__tests__/SessionTimeoutWrapper.test.tsx`
  - [x] Test: does not render SessionManagerProvider when `isAuthenticated === false`
  - [x] Test: renders SessionManagerProvider with correct props (12h PHARMACIST duration)
  - [x] Test: `onExpired` wipes encryption key, stops audit drain, clears session, signs out, redirects
  - [x] Test: `onReAuth` calls Supabase signInWithPassword and returns boolean
  - [x] Test: `onReAuth` fallback to store email when getUser() returns null
  - [x] Update `apps/pharmacy-lite/src/__tests__/login.test.tsx` — add email to mock session assertions
  - [x] Verify all existing Pharmacy Lite tests pass (pre-existing failures unrelated to this story)

## Dev Notes

### Differences from OPD Lite (Story 14-3a)

This story follows the exact same pattern as 14-3a but with key differences:

| Aspect | OPD Lite (14-3a) | Pharmacy Lite (14-3b) |
|--------|------|------|
| Default role duration | 8h CLINICIAN | 12h PHARMACIST |
| PHI stores to clear | 6 stores with `clearPhiState()` | NONE — no clinical stores |
| Encryption key | `encryptionKeyStore.wipe()` | `encryptionKeyStore.wipe()` |
| Signing keys | `clearSigningKeys()` | N/A — Pharmacy Lite has no signing key store |
| Audit drain | N/A | `stopAuditDrain()` |
| Auth session | `clearSession()` | `clearSession()` |
| Supabase | `signOut()` | `signOut()` |

**Pharmacy Lite is simpler** — no `clearPhiState()` on any store because it doesn't have clinical encounter stores. The fulfillment store (`useFulfillmentStore`) holds prescription processing state which is ephemeral and resets on page load anyway.

### Integration Architecture

Same pattern as OPD Lite — `SessionTimeoutWrapper` wraps children inside `ClientErrorBoundary`:

```
<ErrorBoundary appName="pharmacy-lite" dbName={DB_NAME}>
  <AsyncErrorBridge>
    <SyncAwareStaleDataBanner />
    <SessionTimeoutWrapper>    ← NEW
      {children}
    </SessionTimeoutWrapper>
  </AsyncErrorBridge>
</ErrorBoundary>
```

### Auth Session Store — Email Extension

Same as OPD Lite — add `email` to `AuthSession` interface:

```typescript
// AFTER:
export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
  email: string  // NEW
}
```

**Login page change:** Extract email from `sessionData.session?.user?.email` after MFA success:
```typescript
const userEmail = sessionData.session?.user?.email ?? ''
useAuthSessionStore.getState().setSession({
  userId,
  practitionerId,
  role,
  sessionId,
  email: userEmail,
})
```

### onExpired Cleanup Order

```typescript
function handleExpired() {
  // 1. Wipe encryption key (prevents decryption of any cached data)
  encryptionKeyStore.wipe()
  // 2. Stop audit drain (prevents further API calls with stale token)
  stopAuditDrain()
  // 3. Clear auth session (removes practitioner ref, isAuthenticated)
  useAuthSessionStore.getState().clearSession()
  // 4. Sign out of Supabase (invalidates tokens)
  const supabase = getSupabaseBrowserClient()
  supabase.auth.signOut()
  // 5. Hard redirect to login (destroys all in-memory state)
  window.location.href = '/login'
}
```

**Note:** From 14-3a review — `signOut()` should be awaited before redirect. Make `handleExpired` async and await signOut.

### 14-3a Review Findings to Apply

1. **`signOut()` not awaited before redirect** — Fixed in 14-3a. Apply same fix: `await supabase.auth.signOut()` before `window.location.href = '/login'`
2. **`getUser()` may fail** — Use try/catch with fallback to store email (Option B from 14-3a review)
3. **DOCTOR role getting 8h** — Not relevant for Pharmacy Lite (PHARMACIST role), but use same fallback pattern

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/pharmacy-lite/src/stores/auth-session-store.ts` | UPDATE | Add `email` field to AuthSession |
| `apps/pharmacy-lite/src/app/login/page.tsx` | UPDATE | Extract email, pass to setSession |
| `apps/pharmacy-lite/src/components/SessionTimeoutWrapper.tsx` | NEW | Wrapper with onExpired/onReAuth |
| `apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx` | UPDATE | Wrap children with SessionTimeoutWrapper |
| `apps/pharmacy-lite/src/__tests__/SessionTimeoutWrapper.test.tsx` | NEW | Integration tests |

### What NOT to Change

- DO NOT modify `packages/ui-kit/` — already built
- DO NOT modify OPD Lite or Lab Lite — separate stories
- DO NOT add `clearPhiState()` calls — Pharmacy Lite stores don't have that method
- DO NOT clear `useFulfillmentStore` or `useSyncStore` — ephemeral/non-PHI state
- DO NOT add new dependencies — `@ultranos/ui-kit` is already a workspace dependency

### Testing Standards

- **Framework:** Vitest + @testing-library/react (already configured)
- **Mock `@ultranos/ui-kit`:** Mock `SessionManagerProvider` to capture props
- **Mock modules:** `encryptionKeyStore`, `stopAuditDrain`, `useAuthSessionStore`, Supabase client
- **Mock `window.location.href`:** Use `Object.defineProperty`

### Project Structure Notes

- `SessionTimeoutWrapper.tsx` in `apps/pharmacy-lite/src/components/` alongside `ClientErrorBoundary.tsx`
- Tests in `apps/pharmacy-lite/src/__tests__/`
- Pattern mirrors OPD Lite's 14-3a implementation exactly

### References

- [Source: packages/ui-kit/src/useSessionManager.ts] — SESSION_DURATIONS (PHARMACIST: 12h), INACTIVITY_TIMEOUT
- [Source: packages/ui-kit/src/SessionManagerProvider.tsx] — Provider props
- [Source: apps/pharmacy-lite/src/stores/auth-session-store.ts] — Current AuthSession (UPDATE with email)
- [Source: apps/pharmacy-lite/src/app/login/page.tsx] — Login page (UPDATE to store email)
- [Source: apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx] — Integration point (UPDATE)
- [Source: apps/pharmacy-lite/src/lib/encryption-key-store.ts] — encryptionKeyStore.wipe()
- [Source: apps/pharmacy-lite/src/lib/audit.ts] — stopAuditDrain()
- [Source: apps/pharmacy-lite/src/lib/supabase.ts] — getSupabaseBrowserClient()
- [Source: apps/opd-lite/src/components/SessionTimeoutWrapper.tsx] — Reference implementation from 14-3a (COPY PATTERN)
- [Source: _bmad-output/implementation-artifacts/14-3a-opd-lite-session-timeout-integration.md] — Previous story with review findings
- [Source: _bmad-output/planning-artifacts/epics.md#Story14.3b] — AC source

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
None — clean implementation with no debug issues.

### Completion Notes List
- Added `email: string` to `AuthSession` interface in auth-session-store
- Login page now extracts `sessionData.session?.user?.email` after MFA and passes to `setSession()`
- Created `SessionTimeoutWrapper` component following OPD Lite 14-3a pattern but simplified for Pharmacy Lite (no PHI stores, no signing keys)
- `onExpired` cleanup order: wipe encryption key -> stop audit drain -> clear session -> await signOut -> redirect
- `onReAuth` uses getUser() with try/catch fallback to store email (14-3a review finding applied)
- Fallback role duration uses PHARMACIST (12h) instead of CLINICIAN (8h) — appropriate for Pharmacy Lite context
- Integrated into ClientErrorBoundary inside AsyncErrorBridge wrapping children
- 10 new tests covering: unauthenticated bypass, prop verification, role fallback, onExpired full cleanup, onReAuth success/failure/fallback scenarios
- Updated login test to assert email field in session (11 tests pass)
- Pre-existing test failures in medication-dispense, fulfillment-store, prescription-verify, MedicationLabel snapshots, PharmacyScannerView, SyncPulse are unrelated (encryption key / snapshot / test infrastructure issues)

### File List
- `apps/pharmacy-lite/src/stores/auth-session-store.ts` — MODIFIED (added email to AuthSession)
- `apps/pharmacy-lite/src/app/login/page.tsx` — MODIFIED (extract and store email after MFA)
- `apps/pharmacy-lite/src/components/SessionTimeoutWrapper.tsx` — NEW (session timeout wrapper)
- `apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx` — MODIFIED (wrap children with SessionTimeoutWrapper)
- `apps/pharmacy-lite/src/__tests__/SessionTimeoutWrapper.test.tsx` — NEW (10 tests)
- `apps/pharmacy-lite/src/__tests__/login.test.tsx` — MODIFIED (email in session assertion)

### Review Findings

- [x] [Review][Patch] `handleExpired` has no try/catch — if `signOut()` throws, redirect never fires. User stuck with wiped state but no redirect. Fix: wrap signOut + redirect in try/finally [`apps/pharmacy-lite/src/components/SessionTimeoutWrapper.tsx:24-28`] — FIXED
- [x] [Review][Patch] `window.location` mock not restored in afterEach — `beforeEach` replaces `window.location` via `Object.defineProperty` but no `afterEach` restores the original, risking test pollution in same Vitest worker [`apps/pharmacy-lite/src/__tests__/SessionTimeoutWrapper.test.tsx`] — FIXED
- [x] [Review][Defer] `handleExpired` clearSession triggers re-render before redirect — `clearSession()` sets `isAuthenticated = false` causing potential brief flash of unauthenticated children before `window.location.href` fires. Cosmetic only. Same pattern in OPD Lite 14-3a. [`apps/pharmacy-lite/src/components/SessionTimeoutWrapper.tsx:25-30`] — deferred, pre-existing architectural choice
