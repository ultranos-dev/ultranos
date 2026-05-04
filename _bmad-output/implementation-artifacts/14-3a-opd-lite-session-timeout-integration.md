# Story 14.3a: OPD Lite Session Timeout Integration

Status: done

## Story

As a clinician,
I want my OPD Lite session to timeout after inactivity,
so that unattended workstations are protected.

## Acceptance Criteria

1. `SessionManagerProvider` from `@ultranos/ui-kit` is integrated into OPD Lite's layout
2. Session max duration is set to 8 hours for CLINICIAN/DOCTOR role (from `SESSION_DURATIONS`)
3. Inactivity timeout is set to 30 minutes (from `INACTIVITY_TIMEOUT`)
4. After 25 minutes of inactivity, a warning toast appears ("Session expiring in 5 minutes")
5. After 30 minutes of inactivity, the re-auth modal is shown requiring password re-entry
6. Successful re-auth dismisses the modal and resets the inactivity timer
7. Failed re-auth or "Sign Out" triggers forced logout which:
   - Clears all 6 Zustand stores with `clearPhiState()`
   - Wipes the Dexie encryption key via `encryptionKeyStore.wipe()`
   - Clears signing keys via `clearSigningKeys()`
   - Clears the auth session store via `useAuthSessionStore.clearSession()`
   - Signs out of Supabase via `supabase.auth.signOut()`
   - Redirects to `/login`
8. The `AuthSession` interface is extended with `email` field for re-auth modal display
9. All existing OPD Lite tests pass — no regressions

## Tasks / Subtasks

- [x] Task 1: Extend auth session store with `email` field (AC: #8)
  - [x] Add `email: string` to `AuthSession` interface in `auth-session-store.ts`
  - [x] No other changes to the store — `setSession` already accepts the full object

- [x] Task 2: Update login page to store email (AC: #8)
  - [x] In `apps/opd-lite/src/app/login/page.tsx`, after MFA verify success, extract email from `sessionData.session.user.email`
  - [x] Pass `email` in the `setSession()` call alongside userId, practitionerId, role, sessionId
  - [x] Fallback to empty string if email is unavailable (should never happen for Supabase Auth users)

- [x] Task 3: Create session timeout wrapper component (AC: #1, #2, #3)
  - [x] Create `apps/opd-lite/src/components/SessionTimeoutWrapper.tsx` — a `'use client'` component
  - [x] Import `SessionManagerProvider`, `SESSION_DURATIONS`, `INACTIVITY_TIMEOUT` from `@ultranos/ui-kit`
  - [x] Import `useAuthSessionStore` to read session and email
  - [x] Only render `SessionManagerProvider` when `isAuthenticated === true`
  - [x] Pass `maxDurationMs` based on role: `SESSION_DURATIONS[session.role] ?? SESSION_DURATIONS.CLINICIAN`
  - [x] Pass `inactivityMs` as `INACTIVITY_TIMEOUT` (30 minutes)
  - [x] Pass `userEmail` from `session.email`

- [x] Task 4: Wire `onExpired` callback — PHI cleanup (AC: #7)
  - [x] In `SessionTimeoutWrapper.tsx`, implement the `onExpired` callback:
    ```
    useEncounterStore.getState().clearPhiState()
    useVitalsStore.getState().clearPhiState()
    useDiagnosisStore.getState().clearPhiState()
    useSoapNoteStore.getState().clearPhiState()
    usePrescriptionStore.getState().clearPhiState()
    useAllergyStore.getState().clearPhiState()
    encryptionKeyStore.wipe()
    clearSigningKeys()
    useAuthSessionStore.getState().clearSession()
    supabase.auth.signOut()
    window.location.href = '/login'
    ```
  - [x] Import all 6 clinical stores, encryptionKeyStore, clearSigningKeys, auth session store, and Supabase client

- [x] Task 5: Wire `onReAuth` callback — password re-verification (AC: #5, #6)
  - [x] In `SessionTimeoutWrapper.tsx`, implement the `onReAuth` callback:
    ```
    async (password: string): Promise<boolean> => {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return false
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      })
      return !error
    }
    ```
  - [x] Use Supabase's `getUser()` for the email (authoritative source) rather than the store

- [x] Task 6: Integrate into layout (AC: #1)
  - [x] Update `apps/opd-lite/src/app/layout.tsx` OR `ClientErrorBoundary.tsx` to wrap children with `SessionTimeoutWrapper`
  - [x] Place INSIDE `ClientErrorBoundary` (session timeout should not override error boundary)
  - [x] Place OUTSIDE page content so it covers all routes

- [x] Task 7: Write tests (AC: #9)
  - [x] Create `apps/opd-lite/src/__tests__/SessionTimeoutWrapper.test.tsx`
  - [x] Test: does not render SessionManagerProvider when `isAuthenticated === false`
  - [x] Test: renders SessionManagerProvider with correct props when authenticated
  - [x] Test: `onExpired` calls all clearPhiState methods, wipes keys, signs out, redirects
  - [x] Test: `onReAuth` calls Supabase signInWithPassword and returns boolean
  - [x] Update `apps/opd-lite/src/__tests__/login.test.tsx` if needed — add email to mock session
  - [x] Verify all existing OPD Lite tests pass

## Dev Notes

### Integration Architecture

The `SessionManagerProvider` from `@ultranos/ui-kit` (Story 14-3) is a convenience wrapper that combines the `useSessionManager` hook with `SessionWarningToast` and `ReAuthModal` components. OPD Lite just needs to:

1. Wrap its content with the provider
2. Pass role-specific config
3. Provide `onExpired` (PHI cleanup) and `onReAuth` (password verify) callbacks

**Component tree after integration:**
```
<html>
  <body>
    <ClientErrorBoundary>         ← existing error boundary
      <AsyncErrorBridge>          ← existing async error bridge
        <SyncAwareStaleDataBanner /> ← existing stale data banner
        <SessionTimeoutWrapper>   ← NEW: wraps with SessionManagerProvider
          {children}              ← page content
        </SessionTimeoutWrapper>
      </AsyncErrorBridge>
    </ClientErrorBoundary>
  </body>
</html>
```

### Where to Place SessionTimeoutWrapper

**Option A (Recommended): Inside `ClientErrorBoundary.tsx`** — Add as a wrapper around `{children}` inside the existing component tree. This keeps the integration localized and ensures the error boundary catches any session-related errors.

```typescript
// apps/opd-lite/src/components/ClientErrorBoundary.tsx
import { SessionTimeoutWrapper } from './SessionTimeoutWrapper'

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary appName="opd-lite" dbName={DB_NAME} onClearData={handleClearEncryptionKey}>
      <AsyncErrorBridge>
        <SyncAwareStaleDataBanner />
        <SessionTimeoutWrapper>
          {children}
        </SessionTimeoutWrapper>
      </AsyncErrorBridge>
    </ErrorBoundary>
  )
}
```

**Why not layout.tsx:** The layout is a Server Component (exports `metadata`). `SessionTimeoutWrapper` is a Client Component that needs hooks. Putting it inside `ClientErrorBoundary.tsx` (already a `'use client'` component) avoids issues.

### Auth Session Store — Email Extension

The current `AuthSession` interface does NOT include `email`:
```typescript
// CURRENT (before this story):
export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
}
```

**After this story:**
```typescript
export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
  email: string  // NEW: needed for re-auth modal display
}
```

**Why email is needed:** The `ReAuthModal` displays the user's email and the `onReAuth` callback uses it for `signInWithPassword`. While `supabase.auth.getUser()` can retrieve the email, having it in the store avoids an async call to render the modal.

**Login page change (minimal):** In `apps/opd-lite/src/app/login/page.tsx`, after MFA success:
```typescript
// CURRENT:
useAuthSessionStore.getState().setSession({
  userId,
  practitionerId,
  role,
  sessionId,
})

// AFTER:
const userEmail = sessionData.session?.user?.email ?? ''
useAuthSessionStore.getState().setSession({
  userId,
  practitionerId,
  role,
  sessionId,
  email: userEmail,
})
```

### PHI Cleanup — Complete List

OPD Lite has the most extensive PHI cleanup of any spoke app. On forced logout, ALL of these must be called:

| Store/Module | Method | What it clears |
|---|---|---|
| `useEncounterStore` | `clearPhiState()` | Active encounter, patient context |
| `useVitalsStore` | `clearPhiState()` | Vital signs observations |
| `useDiagnosisStore` | `clearPhiState()` | ICD-10 conditions |
| `useSoapNoteStore` | `clearPhiState()` | SOAP note ledger entries |
| `usePrescriptionStore` | `clearPhiState()` | Medication prescriptions |
| `useAllergyStore` | `clearPhiState()` | Allergy records |
| `encryptionKeyStore` | `wipe()` | AES-256-GCM session encryption key |
| `clearSigningKeys` | (function) | Ed25519 signing key pair |
| `useAuthSessionStore` | `clearSession()` | userId, practitionerId, role, sessionId, email |
| Supabase client | `auth.signOut()` | Supabase session token |

**Order matters:** Clear PHI stores FIRST, then keys, then auth, then Supabase, then redirect. This ensures no PHI is accessible if any step fails partway through.

**Note on `usePatientStore` and `useSyncStore`:** These do NOT have `clearPhiState()` methods. `usePatientStore` holds cached patient search results (low-sensitivity) and `useSyncStore` holds sync status metadata (no PHI). Neither needs clearing on session timeout. This is a pre-existing architectural decision.

### Re-Auth Callback Implementation

The `onReAuth` callback is called by the `ReAuthModal` when the user enters their password. It should:

1. Get the user's email from Supabase (authoritative, not from store)
2. Attempt `signInWithPassword` with the email + entered password
3. Return `true` if successful, `false` if not

```typescript
const handleReAuth = async (password: string): Promise<boolean> => {
  try {
    const supabase = getSupabaseBrowserClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return false
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    })
    return !error
  } catch {
    return false
  }
}
```

**Why `getUser()` instead of store email:** The Supabase session is the authoritative source for the user's identity. If the session has been refreshed by Supabase's background token rotation, `getUser()` reflects the current state.

**Note on MFA:** `signInWithPassword` does NOT require MFA re-challenge for re-authentication when an existing session is present. The user only needs to prove they know the password — the MFA factor is already verified for this session.

### Login Page on `/login` — No Session Timeout

The `SessionTimeoutWrapper` should NOT render `SessionManagerProvider` when the user is on the login page or when `isAuthenticated === false`. This is handled by checking the auth store:

```typescript
export function SessionTimeoutWrapper({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)

  if (!isAuthenticated || !session) {
    return <>{children}</>
  }

  return (
    <SessionManagerProvider
      maxDurationMs={SESSION_DURATIONS[session.role as keyof typeof SESSION_DURATIONS] ?? SESSION_DURATIONS.CLINICIAN}
      inactivityMs={INACTIVITY_TIMEOUT}
      userEmail={session.email}
      onExpired={handleExpired}
      onReAuth={handleReAuth}
    >
      {children}
    </SessionManagerProvider>
  )
}
```

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/opd-lite/src/stores/auth-session-store.ts` | UPDATE | Add `email` field to `AuthSession` interface |
| `apps/opd-lite/src/app/login/page.tsx` | UPDATE | Extract email from session, pass to `setSession()` |
| `apps/opd-lite/src/components/SessionTimeoutWrapper.tsx` | NEW | Wraps content with `SessionManagerProvider` |
| `apps/opd-lite/src/components/ClientErrorBoundary.tsx` | UPDATE | Import and render `SessionTimeoutWrapper` |
| `apps/opd-lite/src/__tests__/SessionTimeoutWrapper.test.tsx` | NEW | Integration tests |

### What NOT to Change

- DO NOT modify `packages/ui-kit/` — the hook and components are already built (Story 14-3)
- DO NOT modify any other spoke app (Pharmacy Lite, Lab Lite) — those are Stories 14-3b and 14-3c
- DO NOT add session timeout to the login page — it must be excluded from timeout
- DO NOT modify the 6 clinical stores' `clearPhiState()` methods — they already work correctly
- DO NOT use `localStorage` or `sessionStorage` for session timing state
- DO NOT add new dependencies to OPD Lite — `@ultranos/ui-kit` is already a workspace dependency

### 14-3 Review Findings Applied

From Story 14-3's code review:
1. **`onReAuth` is on `SessionManagerProviderProps`, not `UseSessionManagerConfig`** — the provider accepts it directly, not the hook
2. **Toast uses RTL-safe positioning** — `insetInlineEnd`/`insetBlockEnd` instead of `right`/`bottom`
3. **ESC key in ReAuthModal triggers Sign Out** — be aware this fires `onExpired`
4. **`onReAuth` exceptions are caught** — the modal handles thrown errors gracefully

### Edge Cases

1. **Tab close during active session:** `beforeunload` handlers already clear PHI stores and keys (pre-existing pattern). Session timeout hook's timers are garbage collected.
2. **`window.location.href = '/login'` destroys Zustand state:** This is intentional — hard redirect ensures clean state. Story 14.5 will handle session rehydration on page load.
3. **Role lookup for duration:** If `session.role` doesn't match any key in `SESSION_DURATIONS`, falls back to `CLINICIAN` (8h). This handles edge cases like empty roles.
4. **Multiple tabs:** Each tab runs its own session manager independently. If one tab expires, the user sees re-auth. Other tabs continue until their own timers fire. This is acceptable for MVP.

### Testing Standards

- **Framework:** Vitest + @testing-library/react (already configured)
- **Mock `@ultranos/ui-kit`:** Mock `SessionManagerProvider` to capture props and verify correct config is passed
- **Mock stores:** Mock all 6 clinical stores' `clearPhiState`, `encryptionKeyStore.wipe()`, `clearSigningKeys`, `useAuthSessionStore.clearSession()`
- **Mock Supabase:** Mock `getSupabaseBrowserClient` for `signInWithPassword` and `signOut`
- **Mock `window.location.href`:** Use `Object.defineProperty` to capture redirect

### Project Structure Notes

- `SessionTimeoutWrapper.tsx` in `apps/opd-lite/src/components/` alongside `ClientErrorBoundary.tsx`
- Tests in `apps/opd-lite/src/__tests__/` following existing pattern
- Auth session store update is backward-compatible (email added, not renamed)

### References

- [Source: packages/ui-kit/src/useSessionManager.ts] — Hook API, SESSION_DURATIONS, INACTIVITY_TIMEOUT constants
- [Source: packages/ui-kit/src/SessionManagerProvider.tsx] — Provider component props
- [Source: packages/ui-kit/src/ReAuthModal.tsx] — Re-auth modal (onReAuth callback contract)
- [Source: apps/opd-lite/src/stores/auth-session-store.ts] — Current AuthSession interface (UPDATE)
- [Source: apps/opd-lite/src/app/login/page.tsx] — Login page JWT extraction (UPDATE)
- [Source: apps/opd-lite/src/components/ClientErrorBoundary.tsx] — Component tree integration point (UPDATE)
- [Source: apps/opd-lite/src/lib/encryption-key-store.ts] — encryptionKeyStore.wipe() pattern
- [Source: apps/opd-lite/src/lib/signing-key-store.ts] — clearSigningKeys() pattern
- [Source: apps/opd-lite/src/stores/encounter-store.ts] — clearPhiState() pattern
- [Source: apps/opd-lite/src/stores/vitals-store.ts] — clearPhiState() pattern
- [Source: apps/opd-lite/src/stores/diagnosis-store.ts] — clearPhiState() pattern
- [Source: apps/opd-lite/src/stores/soap-note-store.ts] — clearPhiState() pattern
- [Source: apps/opd-lite/src/stores/prescription-store.ts] — clearPhiState() pattern
- [Source: apps/opd-lite/src/stores/allergy-store.ts] — clearPhiState() pattern
- [Source: apps/opd-lite/src/lib/supabase.ts] — Supabase browser client singleton
- [Source: _bmad-output/implementation-artifacts/14-3-shared-session-management-hook-reauth-modal.md] — Previous story with hook design
- [Source: _bmad-output/planning-artifacts/epics.md#Story14.3a] — AC source
- [Source: CLAUDE.md#Auth] — 30-min inactivity → re-auth on clinical views

### Review Findings

- [x] [Review][Decision] `getUser()` may fail at re-auth time — resolved: Option B (try getUser, fall back to store email)
- [x] [Review][Patch] `signOut()` not awaited before hard redirect — fixed: `handleExpired` is now async, awaits `signOut()` before redirect
- [x] [Review][Patch] `toEqual` weakened to `toMatchObject` — fixed: restored `toEqual` in auth-session-store.test.ts
- [x] [Review][Patch] No test for DOCTOR role getting 8h — fixed: added DOCTOR role test to SessionTimeoutWrapper.test.tsx
- [x] [Review][Defer] `signInWithPassword` re-auth creates mismatched sessionId in store — deferred, architectural concern beyond this story's scope
- [x] [Review][Defer] No audit event on session expiry or re-auth attempt — deferred, security event auditing not in AC for this story
- [x] [Review][Defer] `signInWithPassword` may trigger `onAuthStateChange` listeners — deferred, requires investigation across auth listener registrations

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Initial test run had vi.mock hoisting issue (mock variables referenced before initialization). Fixed by using `vi.hoisted()` pattern.

### Completion Notes List
- Task 1: Added `email: string` to `AuthSession` interface. Backward-compatible addition.
- Task 2: Extracted email from `sessionData.session?.user?.email` after MFA verify success, passes to store with empty string fallback.
- Tasks 3-5: Created `SessionTimeoutWrapper.tsx` as a single cohesive component with `handleExpired` (PHI cleanup in correct order: stores → keys → auth → Supabase → redirect) and `handleReAuth` (uses `supabase.auth.getUser()` for authoritative email, then `signInWithPassword`).
- Task 6: Integrated into `ClientErrorBoundary.tsx` inside `AsyncErrorBridge`, wrapping `{children}` — error boundary catches any session-related errors.
- Task 7: Created comprehensive test suite (9 tests) covering: unauthenticated bypass, authenticated rendering with correct props, role-based duration mapping, fallback to CLINICIAN for unknown roles, onExpired full PHI cleanup sequence, onReAuth success/failure/no-user/exception cases. Updated login.test.tsx and 3 other test files to include `email` field.
- All 53 test files pass (549 tests), zero regressions.
- Pre-existing TS errors in vocabulary-sync.ts and interactionService.ts — not introduced by this story.

### File List
- `apps/opd-lite/src/stores/auth-session-store.ts` — MODIFIED (added `email` to AuthSession interface)
- `apps/opd-lite/src/app/login/page.tsx` — MODIFIED (extract email from session, pass to setSession)
- `apps/opd-lite/src/components/SessionTimeoutWrapper.tsx` — NEW (wrapper component with onExpired/onReAuth)
- `apps/opd-lite/src/components/ClientErrorBoundary.tsx` — MODIFIED (import + render SessionTimeoutWrapper)
- `apps/opd-lite/src/__tests__/SessionTimeoutWrapper.test.tsx` — NEW (9 tests)
- `apps/opd-lite/src/__tests__/login.test.tsx` — MODIFIED (added email to mock session assertions)
- `apps/opd-lite/src/__tests__/auth-session-store.test.ts` — MODIFIED (added email to setSession calls)
- `apps/opd-lite/src/__tests__/encounter-dashboard.test.tsx` — MODIFIED (added email to setSession call)
- `apps/opd-lite/src/__tests__/key-lifecycle.test.ts` — MODIFIED (added email to setSession call)
- `apps/opd-lite/src/__tests__/opd-audit-integration.test.ts` — MODIFIED (added email to setSession call)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED (status: in-progress → review)
