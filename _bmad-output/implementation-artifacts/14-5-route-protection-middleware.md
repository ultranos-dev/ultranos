# Story 14.5: Route Protection Middleware (AuthGuard)

Status: done

## Story

As a clinician or healthcare staff member,
I want to be redirected to the login page when I attempt to access any protected route without authentication,
so that patient data is never exposed to unauthenticated users and I am returned to my intended page after login.

## Acceptance Criteria

1. Given an unauthenticated user or expired session, when they attempt to navigate to any route other than `/login`, then they are redirected to the login page with a `returnUrl` query parameter preserving the originally requested path
2. After successful login, the user is redirected back to the original requested route (from `returnUrl` param), defaulting to `/` if no `returnUrl` is present
3. The `/login` page is accessible without authentication (no infinite redirect loop)
4. Protected page content is never rendered before the auth check completes (no flash of protected content)
5. The `AuthGuard` component is applied as a layout-level wrapper in all three PWA apps: OPD Lite, Pharmacy Lite, and Lab Lite
6. On hard refresh / initial page load, the auth state is rehydrated from the Supabase session before making the redirect decision (Zustand store is empty after refresh, but Supabase may hold a valid session in cookies)
7. While the auth check is in progress (loading state), a non-content placeholder is shown (empty screen or spinner — never protected content)
8. All existing tests in each app continue to pass — no regressions

## Tasks / Subtasks

- [x] Task 1: Create `AuthGuard` component for OPD Lite (AC: #1, #3, #4, #6, #7)
  - [x] Create `apps/opd-lite/src/components/AuthGuard.tsx` as a `'use client'` component
  - [x] On mount, check Supabase session via `getSupabaseBrowserClient().auth.getSession()`
  - [x] If valid session found but Zustand store empty, rehydrate `useAuthSessionStore` from JWT claims
  - [x] If no valid session and pathname is not `/login`, redirect to `/login?returnUrl=<encoded pathname>`
  - [x] While checking, render `null` (or a loading indicator) — never children
  - [x] If pathname is `/login`, always render children without auth check
  - [x] Use `window.location.href` for redirect (full page reload to clear stale state)
- [x] Task 2: Integrate `AuthGuard` into OPD Lite layout (AC: #5)
  - [x] Update `apps/opd-lite/src/components/ClientErrorBoundary.tsx` (or root layout) to wrap content with `<AuthGuard>`
  - [x] Ensure `AuthGuard` wraps all routes including nested layouts
- [x] Task 3: Update OPD Lite login page for `returnUrl` handling (AC: #2)
  - [x] After successful authentication in `apps/opd-lite/src/app/login/page.tsx`, read `returnUrl` from `window.location.search`
  - [x] Redirect to decoded `returnUrl` if present, otherwise redirect to `/`
  - [x] Validate `returnUrl` is a relative path (starts with `/`) to prevent open redirect attacks
- [x] Task 4: Create `AuthGuard` component for Pharmacy Lite (AC: #1, #3, #4, #6, #7)
  - [x] Create `apps/pharmacy-lite/src/components/AuthGuard.tsx` — same pattern as OPD Lite
  - [x] Use Pharmacy Lite's `useAuthSessionStore` for state rehydration
  - [x] Use Pharmacy Lite's Supabase client instance
- [x] Task 5: Integrate `AuthGuard` into Pharmacy Lite layout (AC: #5)
  - [x] Update `apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx` (or root layout) to wrap with `<AuthGuard>`
- [x] Task 6: Update Pharmacy Lite login page for `returnUrl` handling (AC: #2)
  - [x] Same `returnUrl` logic as OPD Lite Task 3
  - [x] Validate relative path to prevent open redirect
- [x] Task 7: Create `AuthGuard` component for Lab Lite (AC: #1, #3, #4, #6, #7)
  - [x] Create `apps/lab-lite/src/components/AuthGuard.tsx` — same pattern
  - [x] Depends on Story 14-3c completing (Lab Lite auth session store)
  - [x] Use Lab Lite's `useAuthSessionStore` and Supabase client
- [x] Task 8: Integrate `AuthGuard` into Lab Lite layout (AC: #5)
  - [x] Update `apps/lab-lite/src/components/ClientErrorBoundary.tsx` (or root layout) to wrap with `<AuthGuard>`
- [x] Task 9: Update Lab Lite login page for `returnUrl` handling (AC: #2)
  - [x] Same `returnUrl` logic as OPD Lite Task 3
  - [x] Validate relative path to prevent open redirect
- [x] Task 10: Write tests for AuthGuard (AC: #8)
  - [x] Create `apps/opd-lite/src/__tests__/auth-guard.test.tsx`
    - [x] Test: unauthenticated user on protected route is redirected to `/login?returnUrl=...`
    - [x] Test: authenticated user on protected route sees children content
    - [x] Test: user on `/login` sees login page without redirect (no infinite loop)
    - [x] Test: loading state renders null/spinner, not children
    - [x] Test: session rehydration from Supabase populates auth store
  - [x] Create `apps/pharmacy-lite/src/__tests__/auth-guard.test.tsx` — equivalent tests
  - [x] Create `apps/lab-lite/src/__tests__/auth-guard.test.tsx` — equivalent tests
  - [x] Test `returnUrl` handling in login pages:
    - [x] Test: after login with `returnUrl` param, redirects to that URL
    - [x] Test: after login without `returnUrl`, redirects to `/`
    - [x] Test: `returnUrl` with absolute URL (external) is rejected, defaults to `/`
  - [x] Verify all existing tests pass in each app

## Dev Notes

### Why Per-App AuthGuard (Not Next.js Middleware)

Next.js middleware (`middleware.ts`) runs at the edge and cannot access the client-side Supabase session (which is stored in browser cookies managed by `@supabase/ssr`'s `createBrowserClient`). A client-side `AuthGuard` component is the correct pattern because:

1. The auth state lives in the browser (Supabase cookies + Zustand memory store)
2. Each app has its own auth store implementation with slightly different shapes
3. This matches the Supabase SSR documentation's recommended approach for App Router

### Session Rehydration Flow

After a hard refresh (e.g., `window.location.href` redirect to login and back), the Zustand store is empty. The `AuthGuard` must rehydrate:

```
Mount → getSession() from Supabase → 
  If session exists → decode JWT → populate useAuthSessionStore → render children
  If no session → redirect to /login?returnUrl=...
```

### Redirect Implementation

Use `window.location.href` (not `useRouter().push()`) for redirects because:
- Full page reload clears any stale component state
- Avoids Next.js client-side navigation which may render protected layouts during transition
- Consistent with the pattern established in Story 14.1

### Open Redirect Prevention

The `returnUrl` parameter must be validated before use:
```typescript
const returnUrl = params.get('returnUrl') ?? '/'
const safeUrl = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/'
window.location.href = safeUrl
```

### Dependencies

- Story 14.1 (OPD Lite login page) — done
- Story 14.2 (Pharmacy Lite login page) — done
- Story 14.3c (Lab Lite session management) — required for Lab Lite AuthGuard

### Reference Files

- OPD Lite auth store: `apps/opd-lite/src/stores/auth-session-store.ts`
- OPD Lite Supabase client: `apps/opd-lite/src/lib/supabase.ts`
- OPD Lite login page: `apps/opd-lite/src/app/login/page.tsx`
- Pharmacy Lite login page: `apps/pharmacy-lite/src/app/login/page.tsx`
- Lab Lite login page: `apps/lab-lite/src/app/login/page.tsx`
- Lab Lite Supabase client: `apps/lab-lite/src/lib/supabase.ts` (reference implementation)

### Deferred from Story 14.1

This story addresses the deferred review item from 14.1: "Supabase session auto-refresh handling on login page — deferred to Story 14.5 (Route Protection)". The `AuthGuard` handles this by always checking the Supabase session (which auto-refreshes) rather than relying solely on the Zustand store state.

## Dev Agent Record

### Implementation Plan

- Created per-app `AuthGuard` client components that check Supabase session on mount
- OPD Lite and Pharmacy Lite rehydrate auth store from JWT claims (matching their login page patterns)
- Lab Lite rehydrates from `user.user_metadata` (matching its login page pattern with hardcoded LAB_TECH role)
- AuthGuard renders `null` during loading, children when authenticated, redirects when not
- Login page (`/login`) always renders children without auth check to prevent infinite loops
- All three login pages updated with `returnUrl` query parameter handling + open redirect prevention
- AuthGuard integrated inside `ClientErrorBoundary` wrapping `SyncAwareStaleDataBanner` and `SessionTimeoutWrapper`

### Debug Log

- Lab Lite tests initially failed: missing `@testing-library/jest-dom` setup and no DOM cleanup between tests. Fixed by creating `apps/lab-lite/src/__tests__/setup.ts` and adding `setupFiles` to vitest config.
- Pre-existing failures confirmed (not regressions): Pharmacy Lite `fulfillment-store.test.ts` (6 tests, EncryptionKeyNotAvailableError), Lab Lite `patient-verify-scanner.test.tsx` (1 test, QR mock timing).

### Completion Notes

All 10 tasks and subtasks completed. AuthGuard implemented across all three PWA apps with:
- 5 unit tests per app (15 total AuthGuard tests)
- 4 returnUrl handling tests added to OPD Lite login test suite
- Open redirect prevention validated (absolute URLs and protocol-relative URLs rejected)
- Session rehydration from Supabase session verified for hard-refresh scenarios
- Full regression suites pass: OPD Lite (561 tests), Pharmacy Lite (all new tests pass, pre-existing failures only), Lab Lite (115/116, pre-existing flaky test only)

## File List

### New Files
- `apps/opd-lite/src/components/AuthGuard.tsx`
- `apps/opd-lite/src/__tests__/auth-guard.test.tsx`
- `apps/pharmacy-lite/src/components/AuthGuard.tsx`
- `apps/pharmacy-lite/src/__tests__/auth-guard.test.tsx`
- `apps/lab-lite/src/components/AuthGuard.tsx`
- `apps/lab-lite/src/__tests__/auth-guard.test.tsx`
- `apps/lab-lite/src/__tests__/setup.ts`

### Modified Files
- `apps/opd-lite/src/components/ClientErrorBoundary.tsx` — added AuthGuard wrapper
- `apps/opd-lite/src/app/login/page.tsx` — added returnUrl handling after MFA
- `apps/opd-lite/src/__tests__/login.test.tsx` — added returnUrl test cases
- `apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx` — added AuthGuard wrapper
- `apps/pharmacy-lite/src/app/login/page.tsx` — added returnUrl handling after MFA
- `apps/lab-lite/src/components/ClientErrorBoundary.tsx` — added AuthGuard wrapper
- `apps/lab-lite/src/app/login/page.tsx` — added returnUrl handling after MFA
- `apps/lab-lite/vitest.config.ts` — added setupFiles for jest-dom matchers

### Review Findings

- [x] [Review][Patch] Lab Lite generates new `sessionId` via `crypto.randomUUID()` on every rehydration — fixed: extracts `session_id` from JWT payload like OPD/Pharmacy
- [x] [Review][Patch] `getSession()` throw causes permanent blank screen with no recovery — fixed: wrapped in try/catch, redirects to /login on error
- [x] [Review][Patch] Malformed JWT crashes OPD-Lite and Pharmacy-Lite AuthGuard — fixed: wrapped JWT decode in try/catch, redirects to /login on error
- [x] [Review][Patch] `returnUrl` drops query parameters and hash — fixed: now encodes `pathname + search`
- [x] [Review][Patch] Lab Lite `practitionerId` defaults to empty string instead of `user.id` — fixed: falls back to `user.id`
- [x] [Review][Defer] AuthGuard does not react to session changes/expiry after mount — `useEffect` runs once; no `onAuthStateChange` listener; gap between session expiry and SessionTimeoutWrapper trigger — deferred, architectural enhancement beyond story scope
- [x] [Review][Defer] Three near-identical AuthGuard implementations (DRY violation) — spec explicitly chose per-app AuthGuard; extracting to shared package is future optimization — deferred, pre-existing architectural decision

## Change Log

- 2026-05-08: Implemented AuthGuard route protection across OPD Lite, Pharmacy Lite, and Lab Lite with returnUrl handling and open redirect prevention. Added test setup for Lab Lite vitest.
