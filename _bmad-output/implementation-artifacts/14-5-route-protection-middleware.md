# Story 14.5: Route Protection Middleware (AuthGuard)

Status: ready-for-dev

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

- [ ] Task 1: Create `AuthGuard` component for OPD Lite (AC: #1, #3, #4, #6, #7)
  - [ ] Create `apps/opd-lite/src/components/AuthGuard.tsx` as a `'use client'` component
  - [ ] On mount, check Supabase session via `getSupabaseBrowserClient().auth.getSession()`
  - [ ] If valid session found but Zustand store empty, rehydrate `useAuthSessionStore` from JWT claims
  - [ ] If no valid session and pathname is not `/login`, redirect to `/login?returnUrl=<encoded pathname>`
  - [ ] While checking, render `null` (or a loading indicator) — never children
  - [ ] If pathname is `/login`, always render children without auth check
  - [ ] Use `window.location.href` for redirect (full page reload to clear stale state)
- [ ] Task 2: Integrate `AuthGuard` into OPD Lite layout (AC: #5)
  - [ ] Update `apps/opd-lite/src/components/ClientErrorBoundary.tsx` (or root layout) to wrap content with `<AuthGuard>`
  - [ ] Ensure `AuthGuard` wraps all routes including nested layouts
- [ ] Task 3: Update OPD Lite login page for `returnUrl` handling (AC: #2)
  - [ ] After successful authentication in `apps/opd-lite/src/app/login/page.tsx`, read `returnUrl` from `window.location.search`
  - [ ] Redirect to decoded `returnUrl` if present, otherwise redirect to `/`
  - [ ] Validate `returnUrl` is a relative path (starts with `/`) to prevent open redirect attacks
- [ ] Task 4: Create `AuthGuard` component for Pharmacy Lite (AC: #1, #3, #4, #6, #7)
  - [ ] Create `apps/pharmacy-lite/src/components/AuthGuard.tsx` — same pattern as OPD Lite
  - [ ] Use Pharmacy Lite's `useAuthSessionStore` for state rehydration
  - [ ] Use Pharmacy Lite's Supabase client instance
- [ ] Task 5: Integrate `AuthGuard` into Pharmacy Lite layout (AC: #5)
  - [ ] Update `apps/pharmacy-lite/src/components/ClientErrorBoundary.tsx` (or root layout) to wrap with `<AuthGuard>`
- [ ] Task 6: Update Pharmacy Lite login page for `returnUrl` handling (AC: #2)
  - [ ] Same `returnUrl` logic as OPD Lite Task 3
  - [ ] Validate relative path to prevent open redirect
- [ ] Task 7: Create `AuthGuard` component for Lab Lite (AC: #1, #3, #4, #6, #7)
  - [ ] Create `apps/lab-lite/src/components/AuthGuard.tsx` — same pattern
  - [ ] Depends on Story 14-3c completing (Lab Lite auth session store)
  - [ ] Use Lab Lite's `useAuthSessionStore` and Supabase client
- [ ] Task 8: Integrate `AuthGuard` into Lab Lite layout (AC: #5)
  - [ ] Update `apps/lab-lite/src/components/ClientErrorBoundary.tsx` (or root layout) to wrap with `<AuthGuard>`
- [ ] Task 9: Update Lab Lite login page for `returnUrl` handling (AC: #2)
  - [ ] Same `returnUrl` logic as OPD Lite Task 3
  - [ ] Validate relative path to prevent open redirect
- [ ] Task 10: Write tests for AuthGuard (AC: #8)
  - [ ] Create `apps/opd-lite/src/__tests__/auth-guard.test.tsx`
    - [ ] Test: unauthenticated user on protected route is redirected to `/login?returnUrl=...`
    - [ ] Test: authenticated user on protected route sees children content
    - [ ] Test: user on `/login` sees login page without redirect (no infinite loop)
    - [ ] Test: loading state renders null/spinner, not children
    - [ ] Test: session rehydration from Supabase populates auth store
  - [ ] Create `apps/pharmacy-lite/src/__tests__/auth-guard.test.tsx` — equivalent tests
  - [ ] Create `apps/lab-lite/src/__tests__/auth-guard.test.tsx` — equivalent tests
  - [ ] Test `returnUrl` handling in login pages:
    - [ ] Test: after login with `returnUrl` param, redirects to that URL
    - [ ] Test: after login without `returnUrl`, redirects to `/`
    - [ ] Test: `returnUrl` with absolute URL (external) is rejected, defaults to `/`
  - [ ] Verify all existing tests pass in each app

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
