# Story 14.3c: Lab Lite Session Timeout Integration

Status: ready-for-dev

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

- [ ] Task 1: Create auth session store (AC: #8)
  - [ ] Create `apps/lab-lite/src/stores/auth-session-store.ts`
  - [ ] Define `AuthSession` interface: `{ userId: string, practitionerId: string, role: string, sessionId: string, email: string }`
  - [ ] Define `AuthSessionState`: `{ session: AuthSession | null, isAuthenticated: boolean, setSession(session: AuthSession): void, clearSession(): void }`
  - [ ] Export `useAuthSessionStore` Zustand store
  - [ ] `setSession` sets `session` and `isAuthenticated = true`
  - [ ] `clearSession` sets `session = null` and `isAuthenticated = false`

- [ ] Task 2: Add `zustand` dependency (AC: #8)
  - [ ] Add `zustand` to `apps/lab-lite/package.json` dependencies
  - [ ] Run `pnpm install` from workspace root

- [ ] Task 3: Update login page to populate auth store (AC: #9)
  - [ ] In `apps/lab-lite/src/app/login/page.tsx`, import `useAuthSessionStore`
  - [ ] After MFA verify success, extract email from `sessionData.session?.user?.email ?? ''`
  - [ ] Call `useAuthSessionStore.getState().setSession({ userId, practitionerId, role, sessionId, email })`
  - [ ] Ensure this happens BEFORE the redirect to dashboard

- [ ] Task 4: Create session timeout wrapper component (AC: #1, #2, #3)
  - [ ] Create `apps/lab-lite/src/components/SessionTimeoutWrapper.tsx` — a `'use client'` component
  - [ ] Import `SessionManagerProvider`, `SESSION_DURATIONS`, `INACTIVITY_TIMEOUT` from `@ultranos/ui-kit`
  - [ ] Import `useAuthSessionStore` to read session and email
  - [ ] Only render `SessionManagerProvider` when `isAuthenticated === true`
  - [ ] Pass `maxDurationMs`: `SESSION_DURATIONS[session.role] ?? SESSION_DURATIONS.LAB_TECH`
  - [ ] Pass `inactivityMs` as `INACTIVITY_TIMEOUT` (30 minutes)
  - [ ] Pass `userEmail` from `session.email`

- [ ] Task 5: Wire `onExpired` callback — cleanup (AC: #7)
  - [ ] In `SessionTimeoutWrapper.tsx`, implement the `onExpired` callback:
    ```
    async function handleExpired() {
      useAuthSessionStore.getState().clearSession()
      const supabase = createBrowserClient(...)
      await supabase.auth.signOut()
      window.location.href = '/login'
    }
    ```
  - [ ] Import Supabase browser client from `apps/lab-lite/src/lib/supabase.ts`

- [ ] Task 6: Wire `onReAuth` callback — password re-verification (AC: #5, #6)
  - [ ] In `SessionTimeoutWrapper.tsx`, implement the `onReAuth` callback:
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
  - [ ] Pattern matches OPD Lite's 14-3a review finding: try getUser(), fall back to store email

- [ ] Task 7: Integrate into layout (AC: #1)
  - [ ] Update `apps/lab-lite/src/components/ClientErrorBoundary.tsx` to wrap children with `SessionTimeoutWrapper`
  - [ ] Place INSIDE `ErrorBoundary` wrapping `{children}`

- [ ] Task 8: Write tests (AC: #10)
  - [ ] Create `apps/lab-lite/src/__tests__/SessionTimeoutWrapper.test.tsx`
  - [ ] Test: does not render SessionManagerProvider when `isAuthenticated === false`
  - [ ] Test: renders SessionManagerProvider with correct props (8h LAB_TECH duration)
  - [ ] Test: `onExpired` clears session, signs out, redirects
  - [ ] Test: `onReAuth` calls Supabase signInWithPassword and returns boolean
  - [ ] Test: `onReAuth` fallback to store email when getUser() returns null
  - [ ] Create `apps/lab-lite/src/__tests__/auth-session-store.test.ts`
  - [ ] Test: `setSession` sets session and isAuthenticated
  - [ ] Test: `clearSession` resets to null and false
  - [ ] Verify all existing Lab Lite tests pass

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

### Debug Log References

### Completion Notes List

### File List
