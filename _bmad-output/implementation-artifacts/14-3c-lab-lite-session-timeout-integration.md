# Story 14.3c: Lab Lite Session Timeout Integration

Status: done

## Story

As a lab technician,
I want my Lab Lite session to timeout after inactivity,
so that the lab workstation is protected when I step away.

## Acceptance Criteria

1. `SessionManagerProvider` from `@ultranos/ui-kit` is integrated into Lab Lite's layout
2. Session max duration is set to 8 hours for LAB_TECH role (from `SESSION_DURATIONS.LAB_TECH`)
3. Inactivity timeout is set to 30 minutes (from `INACTIVITY_TIMEOUT`)
4. After 25 minutes of inactivity, a warning toast appears
5. After 30 minutes of inactivity, the re-auth modal is shown requiring password re-entry
6. Successful re-auth dismisses the modal and resets the inactivity timer
7. Failed re-auth or "Sign Out" triggers forced logout which:
   - Clears the auth session store via `useAuthSessionStore.clearSession()`
   - Signs out of Supabase via `await supabase.auth.signOut()`
   - Redirects to `/login`
8. A new Zustand auth session store is created with interface `{ userId, practitionerId, role, sessionId, email }`
9. Login page is updated to populate the auth session store after MFA success
10. All existing Lab Lite tests pass — no regressions

## Tasks / Subtasks

- [x] Task 1: Create auth session store (AC: #8)
  - [x] Create `apps/lab-lite/src/stores/auth-session-store.ts`
  - [x] Define `AuthSession` interface: `{ userId: string, practitionerId: string, role: string, sessionId: string, email: string }`
  - [x] Define `AuthSessionState`: `{ session: AuthSession | null, isAuthenticated: boolean, setSession(session: AuthSession): void, clearSession(): void }`
  - [x] Export `useAuthSessionStore` Zustand store
  - [x] `setSession` sets `session` and `isAuthenticated = true`
  - [x] `clearSession` sets `session = null` and `isAuthenticated = false`

- [x] Task 2: Add `zustand` dependency (AC: #8)
  - [x] Add `zustand` to `apps/lab-lite/package.json` dependencies
  - [x] Run `pnpm install` from workspace root

- [x] Task 3: Update login page to populate auth store (AC: #9)
  - [x] In `apps/lab-lite/src/app/login/page.tsx`, import `useAuthSessionStore`
  - [x] After MFA verify success, extract email from `sessionData.session?.user?.email ?? ''`
  - [x] Call `useAuthSessionStore.getState().setSession({ userId, practitionerId, role, sessionId, email })`
  - [x] Ensure this happens BEFORE the redirect to dashboard

- [x] Task 4: Create session timeout wrapper component (AC: #1, #2, #3)
  - [x] Create `apps/lab-lite/src/components/SessionTimeoutWrapper.tsx` — a `'use client'` component
  - [x] Import `SessionManagerProvider`, `SESSION_DURATIONS`, `INACTIVITY_TIMEOUT` from `@ultranos/ui-kit`
  - [x] Import `useAuthSessionStore` to read session and email
  - [x] Only render `SessionManagerProvider` when `isAuthenticated === true`
  - [x] Pass `maxDurationMs`: `SESSION_DURATIONS[session.role] ?? SESSION_DURATIONS.LAB_TECH`
  - [x] Pass `inactivityMs` as `INACTIVITY_TIMEOUT` (30 minutes)
  - [x] Pass `userEmail` from `session.email`

- [x] Task 5: Wire `onExpired` callback — cleanup (AC: #7)
  - [x] In `SessionTimeoutWrapper.tsx`, implement the `onExpired` callback:
    ```
    async function handleExpired() {
      useAuthSessionStore.getState().clearSession()
      const supabase = createBrowserClient(...)
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    ```
  - [x] Import Supabase browser client from `apps/lab-lite/src/lib/supabase.ts`

- [x] Task 6: Wire `onReAuth` callback — password re-verification (AC: #5, #6)
  - [x] In `SessionTimeoutWrapper.tsx`, implement the `onReAuth` callback:
    ```
    async (password: string): Promise<boolean> => {
      try {
        const supabase = createBrowserClient(...)
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

- [x] Task 7: Integrate into layout (AC: #1)
  - [x] Update `apps/lab-lite/src/components/ClientErrorBoundary.tsx` to wrap children with `SessionTimeoutWrapper`
  - [x] Place INSIDE `ErrorBoundary` wrapping `{children}`

- [x] Task 8: Write tests (AC: #10)
  - [x] Create `apps/lab-lite/src/__tests__/SessionTimeoutWrapper.test.tsx`
  - [x] Test: does not render SessionManagerProvider when `isAuthenticated === false`
  - [x] Test: renders SessionManagerProvider with correct props (8h LAB_TECH duration)
  - [x] Test: `onExpired` clears session, signs out, redirects
  - [x] Test: `onReAuth` calls Supabase signInWithPassword and returns boolean
  - [x] Test: `onReAuth` fallback to store email when getUser() returns null
  - [x] Create `apps/lab-lite/src/__tests__/auth-session-store.test.ts`
  - [x] Test: `setSession` sets session and isAuthenticated
  - [x] Test: `clearSession` resets to null and false
  - [x] Verify all existing Lab Lite tests pass

### Review Findings

- [x] [Review][Patch] `handleExpired` missing try/finally — signOut throw blocks redirect [SessionTimeoutWrapper.tsx:18-23]
- [x] [Review][Patch] Login page should validate session data before populating store [login/page.tsx:116-124]
- [x] [Review][Patch] Empty-string email guard before calling setSession [login/page.tsx:118]
- [x] [Review][Defer] No error handling for signOut in MFA rejection path [login/page.tsx:68] — deferred, pre-existing
- [x] [Review][Defer] No error handling for signOut in "Back to sign in" handler [login/page.tsx:137] — deferred, pre-existing

## Dev Notes

### Differences from OPD Lite (14-3a) and Pharmacy Lite (14-3b)

This is the **simplest** of the 3 spoke integrations. Lab Lite has no client-side encryption, no signing keys, no audit drain, and no PHI stores.

| Aspect | OPD Lite (14-3a) | Pharmacy Lite (14-3b) | Lab Lite (14-3c) |
|--------|------|------|------|
| Default role duration | 8h CLINICIAN | 12h PHARMACIST | 8h LAB_TECH |
| PHI stores to clear | 6 stores with `clearPhiState()` | NONE | NONE |
| Encryption key | `encryptionKeyStore.wipe()` | `encryptionKeyStore.wipe()` | NONE — no client-side encryption |
| Signing keys | `clearSigningKeys()` | N/A | NONE |
| Audit drain | N/A | `stopAuditDrain()` | NONE |
| Auth session store | EXISTS (update email) | EXISTS (update email) | NEW — must be created |
| Auth session | `clearSession()` | `clearSession()` | `clearSession()` |
| Supabase | `signOut()` | `signOut()` | `signOut()` |

### Why Lab Lite is Simpler

Lab Lite follows the data minimization principle (see CLAUDE.md rule #7): it only sees patient name + age. There is no:
- Client-side PHI encryption (no `encryptionKeyStore`)
- Audit drain worker (auditing is handled server-side for Lab Lite)
- Clinical encounter stores or prescription stores
- Signing key management

The `onExpired` callback only needs 3 steps: clear session, sign out, redirect.

### Integration Architecture

`SessionTimeoutWrapper` wraps children inside `ClientErrorBoundary`:

```
<ErrorBoundary>
  <SessionTimeoutWrapper>    <- NEW
    {children}
  </SessionTimeoutWrapper>
</ErrorBoundary>
```

### Auth Session Store (NEW)

Lab Lite currently has NO auth session store — login just calls `supabase.auth.signOut()` and `window.location.href = '/'`. A new Zustand store must be created:

```typescript
// apps/lab-lite/src/stores/auth-session-store.ts
import { create } from 'zustand'

export interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
  email: string
}

interface AuthSessionState {
  session: AuthSession | null
  isAuthenticated: boolean
  setSession: (session: AuthSession) => void
  clearSession: () => void
}

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
  session: null,
  isAuthenticated: false,
  setSession: (session) => set({ session, isAuthenticated: true }),
  clearSession: () => set({ session: null, isAuthenticated: false }),
}))
```

### Login Page Update

The login page currently redirects after MFA success without storing session state. It needs to populate the auth store:

```typescript
// After MFA verify success:
const userEmail = sessionData.session?.user?.email ?? ''
useAuthSessionStore.getState().setSession({
  userId: sessionData.session?.user?.id ?? '',
  practitionerId, // from user metadata or API call
  role: 'LAB_TECH',
  sessionId: crypto.randomUUID(),
  email: userEmail,
})
// Then redirect
```

### onExpired Cleanup Order

```typescript
async function handleExpired() {
  // 1. Clear auth session (removes practitioner ref, isAuthenticated)
  useAuthSessionStore.getState().clearSession()
  // 2. Sign out of Supabase (invalidates tokens) — MUST await per 14-3a review
  const supabase = createBrowserClient(...)
  await supabase.auth.signOut()
  // 3. Hard redirect to login (destroys all in-memory state)
  window.location.href = '/login'
}
```

**Note:** From 14-3a review — `signOut()` must be awaited before redirect.

### 14-3a Review Findings to Apply

1. **`signOut()` not awaited before redirect** — Fixed in 14-3a. Apply same fix: `await supabase.auth.signOut()` before `window.location.href = '/login'`
2. **`getUser()` may fail** — Use try/catch with fallback to store email (Option B from 14-3a review)
3. **`onReAuth` is on `SessionManagerProviderProps`** — Pass as prop, not via the hook config

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/lab-lite/src/stores/auth-session-store.ts` | NEW | Zustand auth session store |
| `apps/lab-lite/src/app/login/page.tsx` | UPDATE | Populate auth store after MFA success |
| `apps/lab-lite/src/components/SessionTimeoutWrapper.tsx` | NEW | Wrapper with onExpired/onReAuth |
| `apps/lab-lite/src/components/ClientErrorBoundary.tsx` | UPDATE | Wrap children with SessionTimeoutWrapper |
| `apps/lab-lite/src/__tests__/SessionTimeoutWrapper.test.tsx` | NEW | Integration tests |
| `apps/lab-lite/src/__tests__/auth-session-store.test.ts` | NEW | Store unit tests |
| `apps/lab-lite/package.json` | UPDATE | Add `zustand` dependency |

### What NOT to Change

- DO NOT modify `packages/ui-kit/` — already built
- DO NOT modify OPD Lite or Pharmacy Lite — separate stories
- DO NOT add `encryptionKeyStore.wipe()` — Lab Lite has no client-side encryption
- DO NOT add `stopAuditDrain()` — Lab Lite has no audit drain worker
- DO NOT add `clearPhiState()` — Lab Lite has no clinical PHI stores
- DO NOT add `clearSigningKeys()` — Lab Lite has no signing key store

### Testing Standards

- **Framework:** Vitest + @testing-library/react (already configured)
- **Mock `@ultranos/ui-kit`:** Mock `SessionManagerProvider` to capture props
- **Mock modules:** `useAuthSessionStore`, Supabase client (`@supabase/ssr`)
- **Mock `window.location.href`:** Use `Object.defineProperty`
- **No need to mock:** encryption key store, audit drain, PHI stores (they don't exist)

### Supabase Client

Lab Lite uses `@supabase/ssr` with `createBrowserClient`:
```typescript
// apps/lab-lite/src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'
```

### References

- [Source: packages/ui-kit/src/useSessionManager.ts] — SESSION_DURATIONS (LAB_TECH: 8h), INACTIVITY_TIMEOUT
- [Source: packages/ui-kit/src/SessionManagerProvider.tsx] — Provider props (onExpired, onReAuth, maxDurationMs, inactivityMs, userEmail)
- [Source: apps/lab-lite/src/lib/supabase.ts] — createBrowserClient
- [Source: apps/lab-lite/src/components/ClientErrorBoundary.tsx] — Integration point (UPDATE)
- [Source: apps/lab-lite/src/app/login/page.tsx] — Login page (UPDATE to populate store)
- [Source: apps/opd-lite/src/components/SessionTimeoutWrapper.tsx] — Reference implementation from 14-3a (COPY PATTERN)
- [Source: apps/opd-lite/src/stores/auth-session-store.ts] — Reference store implementation (COPY PATTERN)
- [Source: _bmad-output/implementation-artifacts/14-3a-opd-lite-session-timeout-integration.md] — Previous story with review findings
- [Source: _bmad-output/implementation-artifacts/14-3b-pharmacy-lite-session-timeout-integration.md] — Pharmacy Lite pattern
- [Source: _bmad-output/planning-artifacts/epics.md#Story14.3c] — AC source

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no debugging required.

### Completion Notes List

- Created Zustand auth session store with AuthSession interface (userId, practitionerId, role, sessionId, email)
- Added zustand dependency to lab-lite package.json
- Updated login page to populate auth store after MFA verify success, before redirect
- Created SessionTimeoutWrapper component with LAB_TECH 8h max duration and 30min inactivity timeout
- onExpired: clearSession → signOut (awaited) → redirect to /login (3 steps only, no PHI/encryption cleanup needed)
- onReAuth: tries getUser() for email, falls back to store email, then signInWithPassword
- Integrated SessionTimeoutWrapper inside ClientErrorBoundary's ErrorBoundary > AsyncErrorBridge
- All 13 new tests pass (3 store + 10 wrapper), all 95 existing tests pass, 1 pre-existing failure in patient-verify-scanner.test.tsx (unrelated to this story)

### File List

| File | Action |
|------|--------|
| `apps/lab-lite/src/stores/auth-session-store.ts` | NEW |
| `apps/lab-lite/src/components/SessionTimeoutWrapper.tsx` | NEW |
| `apps/lab-lite/src/__tests__/auth-session-store.test.ts` | NEW |
| `apps/lab-lite/src/__tests__/SessionTimeoutWrapper.test.tsx` | NEW |
| `apps/lab-lite/src/app/login/page.tsx` | MODIFIED |
| `apps/lab-lite/src/components/ClientErrorBoundary.tsx` | MODIFIED |
| `apps/lab-lite/package.json` | MODIFIED |
| `apps/lab-lite/src/__tests__/login-page.test.tsx` | MODIFIED |
| `pnpm-lock.yaml` | MODIFIED |
