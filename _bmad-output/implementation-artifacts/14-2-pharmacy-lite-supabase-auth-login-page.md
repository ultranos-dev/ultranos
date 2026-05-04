# Story 14.2: Pharmacy Lite Supabase Auth Login Page

Status: done

## Story

As a pharmacist,
I want to sign in to Pharmacy Lite with my credentials and TOTP MFA,
so that my session is authenticated before I access prescription data.

## Acceptance Criteria

1. A `/login` route exists in Pharmacy Lite with email + password credential form
2. After successful password authentication, TOTP MFA challenge is presented and must be verified
3. If TOTP is not enrolled, the user sees "TOTP MFA is required for pharmacy staff. Please contact administration to set up MFA." and the partial session is revoked
4. On successful login + MFA, an auth session store is created with userId, practitionerId, role=PHARMACIST, sessionId from the Supabase JWT
5. The JWT access token is stored in memory only (never localStorage) — retrieved via `supabase.auth.getSession()` on demand
6. The pharmacist is redirected to `/` (scanner view / future dispensing dashboard) after successful auth
7. Login failures display a generic error "Invalid email or password" (no credential enumeration, no PHI)
8. Audit events are emitted for LOGIN_SUCCESS, LOGIN_FAILURE, MFA_VERIFY_SUCCESS, MFA_VERIFY_FAILURE via fire-and-forget to Hub API `lab.reportAuthEvent`
9. `@supabase/supabase-js` and `@supabase/ssr` are added as dependencies
10. The Supabase client is created as a singleton in `apps/pharmacy-lite/src/lib/supabase.ts`
11. The `authToken` prop pattern in `PharmacyScannerView`, `PrescriptionScanner`, and `dispense-sync.ts` is replaced with session store integration
12. All existing Pharmacy Lite tests pass — no regressions

## Tasks / Subtasks

- [x] Task 1: Add Supabase dependencies (AC: #9)
  - [x] Add `@supabase/supabase-js` and `@supabase/ssr` to `apps/pharmacy-lite/package.json`
  - [x] Run `pnpm install` to update lockfile

- [x] Task 2: Create Supabase browser client (AC: #10)
  - [x] Create `apps/pharmacy-lite/src/lib/supabase.ts` — singleton pattern matching Lab Lite and OPD Lite exactly
  - [x] Validate `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
  - [x] Throw at module load if env vars missing (fail-fast)

- [x] Task 3: Create auth session store (AC: #4, #5)
  - [x] Create `apps/pharmacy-lite/src/stores/auth-session-store.ts` — Zustand store
  - [x] Export `useAuthSessionStore` with: `setSession({ userId, practitionerId, role, sessionId })`, `clearSession()`, `getPractitionerRef()` returning `Practitioner/{practitionerId}`
  - [x] Match OPD Lite's `auth-session-store.ts` interface exactly
  - [x] Add `getAccessToken()` method that returns the JWT via `supabase.auth.getSession()` for Hub API calls

- [x] Task 4: Create auth event reporting utility (AC: #8)
  - [x] Add `reportAuthEvent()` function to a new `apps/pharmacy-lite/src/lib/trpc.ts`
  - [x] Fire-and-forget pattern: POST to `{HUB_API_URL}/lab.reportAuthEvent` with event type and actor info
  - [x] Never throws — auth flow must not be blocked by audit failures
  - [x] Match Lab Lite's exact `reportAuthEvent` signature and `getHubApiUrl()` pattern

- [x] Task 5: Create login page (AC: #1, #2, #3, #6, #7)
  - [x] Create `apps/pharmacy-lite/src/app/login/page.tsx`
  - [x] Implement two-step auth flow: credentials form → TOTP MFA form
  - [x] On credential success: check `supabase.auth.mfa.listFactors()` for enrolled TOTP
  - [x] If no TOTP enrolled: show error, revoke session with `supabase.auth.signOut()`, stay on login
  - [x] If factorsError or challengeError: call `supabase.auth.signOut()` before showing error (prevent dangling sessions — 14-1 review finding)
  - [x] If TOTP enrolled: create challenge with `supabase.auth.mfa.challenge()`, show TOTP input
  - [x] On MFA verify success: populate session store FIRST, then redirect to `/`
  - [x] Redirect only after confirming JWT is non-null (prevent redirect with empty session — 14-1 review finding)
  - [x] Display generic error messages (no credential enumeration, no PHI)
  - [x] Clear password from state after credential submission
  - [x] `handleBackToSignIn` must clear `factorId` and `challengeId` state (14-1 review finding)
  - [x] Use Base64url-safe decode for JWT payload: `.replace(/-/g, '+').replace(/_/g, '/')` before `atob()` (14-1 review finding)
  - [x] Style using Pharmacy Lite's existing Tailwind classes and primary color tokens

- [x] Task 6: Replace `authToken` prop pattern with session store (AC: #11)
  - [x] Update `PharmacyScannerView.tsx`: remove `authToken` prop, get token from `useAuthSessionStore.getState().getAccessToken()`
  - [x] Update `PrescriptionScanner.tsx`: remove `authToken` prop, get token from session store
  - [x] Update `dispense-sync.ts`: replace `setDispenseSyncAuthToken`/`getAuthToken` module-level pattern with session store integration
  - [x] Update `prescription-status-client.ts`: functions still accept `authToken` param (callers will pass from session store)
  - [x] Update `practitioner-key-cache.ts`: functions still accept `authToken` param (callers will pass from session store)
  - [x] Update `page.tsx` (home page): no longer needs to pass `authToken` to `PharmacyScannerView`
  - [x] Update `audit.ts`: `startAuditDrain` getAuthToken callback should read from session store

- [x] Task 7: Write tests (AC: #12)
  - [x] Create `apps/pharmacy-lite/src/__tests__/login.test.tsx`
  - [x] Test credential form renders with email/password fields
  - [x] Test successful credential submission transitions to MFA step
  - [x] Test failed credential submission shows error, emits LOGIN_FAILURE event
  - [x] Test MFA form renders with TOTP input
  - [x] Test successful MFA populates auth session store with role=PHARMACIST
  - [x] Test failed MFA shows error, clears TOTP input
  - [x] Test no TOTP enrolled shows enrollment error and signs out
  - [x] Test redirect to `/` only after session store is populated (assert redirect happens)
  - [x] Verify all existing Pharmacy Lite tests pass with authToken prop removal
  - [x] Update existing tests that pass `authToken="test-token"` prop to use mocked session store instead

### Review Findings

- [x] [Review][Decision] **Role defaults to `'PHARMACIST'` on missing JWT claim** — Fixed: changed to `payload.role ?? ''` to match OPD Lite pattern. [login/page.tsx:132]
- [x] [Review][Decision] **Missing `isAuthenticated` derived field in auth session store** — Fixed: added `isAuthenticated: boolean` field matching OPD Lite interface. [auth-session-store.ts]
- [x] [Review][Decision] **`getPractitionerRef` returns `'Practitioner/unknown'` silently — OPD Lite throws** — Fixed: now throws Error on null session, keeps FHIR `Practitioner/` prefix. [auth-session-store.ts]
- [x] [Review][Patch] **No `signOut()` on post-MFA null JWT or JWT parse failure — dangling authenticated session** — Fixed: added `signOut()` on null JWT path and catch block. OPD Lite fix deferred as D118. [login/page.tsx]
- [x] [Review][Patch] **Duplicate `getHubApiUrl()` not deduplicated per spec** — Fixed: removed local `getHubApiUrl()` from dispense-sync.ts, now imports from trpc.ts. [dispense-sync.ts]
- [x] [Review][Patch] **No test for `handleBackToSignIn` clearing `factorId`/`challengeId` state** — Fixed: added test verifying signOut call and MFA state cleanup on back-to-sign-in. [login.test.tsx]
- [x] [Review][Defer] `dispense-sync` enqueue can fail silently, losing dispense data — deferred, pre-existing
- [x] [Review][Defer] `confirmDispense` partial failure leaves items in inconsistent state — deferred, pre-existing
- [x] [Review][Defer] `AbortSignal.timeout()` not supported in older target browsers (Safari <16.4) — deferred, pre-existing
- [x] [Review][Defer] `dispense-sync` no dedup on retry queue entries — deferred, pre-existing (consistent with W4 from 4-3)
- [x] [Review][Defer] `fulfillment-store` hardcoded actor ID `'pharmacy-user'` — auth store now exists but update out of scope
- [x] [Review][Defer] `processingRef` not reset after `handleFetchKey` failure — camera scans permanently blocked — deferred, pre-existing
- [x] [Review][Defer] `window.location.href` destroys Zustand store on redirect — same pattern as OPD Lite, Story 14.5 handles rehydration

## Dev Notes

### Reference Implementation: OPD Lite Login (Story 14-1)

This login page MUST follow the pattern established in Story 14-1 at `apps/opd-lite/src/app/login/page.tsx`. That implementation already incorporates all review findings from the 14-1 code review. Key patterns to replicate:

**Auth flow state machine:**
```
'credentials' → (password OK) → check MFA factors → 'mfa' → (TOTP OK) → populate store → redirect to /
                 (password fail) → show error, stay on 'credentials'
                                   (no TOTP enrolled) → show error, signOut, stay on 'credentials'
                                   (factorsError/challengeError) → signOut, show error, stay on 'credentials'
                                                         (TOTP fail) → show error, stay on 'mfa'
```

**EXACT Supabase client pattern (COPY from OPD Lite / Lab Lite):**
```typescript
// apps/pharmacy-lite/src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set',
  )
}

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(supabaseUrl!, supabaseAnonKey!)
  }
  return client
}
```

### Auth Session Store (NEW — MUST CREATE)

Unlike OPD Lite (which already had `auth-session-store.ts`), Pharmacy Lite does NOT have an auth session store. You must create one.

**Create `apps/pharmacy-lite/src/stores/auth-session-store.ts`:**
```typescript
import { create } from 'zustand'
import { getSupabaseBrowserClient } from '@/lib/supabase'

interface AuthSession {
  userId: string
  practitionerId: string
  role: string
  sessionId: string
}

interface AuthSessionState {
  session: AuthSession | null
  setSession: (session: AuthSession) => void
  clearSession: () => void
  getPractitionerRef: () => string
  getAccessToken: () => Promise<string | null>
}

export const useAuthSessionStore = create<AuthSessionState>((set, get) => ({
  session: null,
  setSession: (session) => set({ session }),
  clearSession: () => set({ session: null }),
  getPractitionerRef: () => {
    const s = get().session
    return s ? `Practitioner/${s.practitionerId}` : 'Practitioner/unknown'
  },
  getAccessToken: async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  },
}))
```

**Key difference from OPD Lite:** The `getAccessToken()` method is added here to centralize JWT retrieval from Supabase's in-memory session. This replaces the `setDispenseSyncAuthToken`/`getAuthToken` module-level variable pattern in `dispense-sync.ts`.

### Populating the Auth Session After MFA

After `supabase.auth.mfa.verify()` succeeds, use the OPD Lite 14-1 pattern:
```typescript
const { data: sessionData } = await supabase.auth.getSession()
const jwt = sessionData.session?.access_token
if (!jwt) {
  setError('Failed to retrieve session after MFA verification')
  setLoading(false)
  return  // DO NOT redirect without a valid session
}

// Base64url → Base64 conversion (14-1 review fix)
const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
const payload = JSON.parse(atob(base64))
const userId = payload.sub
const role = payload.role ?? 'PHARMACIST'
const sessionId = payload.session_id ?? ''
const practitionerId = payload.practitioner_id ?? userId

useAuthSessionStore.getState().setSession({
  userId,
  practitionerId,
  role,
  sessionId,
})

window.location.href = '/'
```

### Replacing the `authToken` Prop Pattern

**Current state:** Pharmacy Lite passes `authToken` as a prop through the component tree and uses a module-level variable in `dispense-sync.ts`. This is the pattern Story 14.2 AC #11 requires replacing.

**Files that currently use `authToken` prop/param:**

| File | Current Pattern | New Pattern |
|------|----------------|-------------|
| `components/pharmacy/PharmacyScannerView.tsx` | `authToken` prop drilled from parent | Get token via `useAuthSessionStore` → `getAccessToken()` |
| `components/pharmacy/PrescriptionScanner.tsx` | `authToken` prop drilled from parent | Get token via `useAuthSessionStore` → `getAccessToken()` |
| `lib/dispense-sync.ts` | Module-level `_authToken` set via `setDispenseSyncAuthToken()` | Import `useAuthSessionStore`, call `getAccessToken()` |
| `lib/prescription-status-client.ts` | Accepts `authToken` function param | Keep param — callers pass token from store |
| `lib/practitioner-key-cache.ts` | Accepts `authToken` function param | Keep param — callers pass token from store |
| `lib/prescription-verify.ts` | Accepts `authToken` function param | Keep param — callers pass token from store |
| `lib/audit.ts` | `startAuditDrain(hubBaseUrl, getAuthToken)` callback | Callback reads from session store |
| `app/page.tsx` | Currently passes no authToken (PharmacyScannerView has no auth) | No change needed |

**Strategy:** Remove `authToken` from React component props (they fetch from store internally). Keep `authToken` as function params on pure utility functions (they aren't React components and can't use hooks). The calling component fetches the token from the store and passes it.

**For `dispense-sync.ts` specifically:**
- Remove `_authToken` module-level variable, `setDispenseSyncAuthToken()`, and `getAuthToken()`
- Import `useAuthSessionStore` from the store
- In `syncDispenseToHub()`, call `const token = await useAuthSessionStore.getState().getAccessToken()`
- This is safe because `syncDispenseToHub` is async and `getAccessToken` returns a Promise

### What This Story Does NOT Do

- Does NOT add route protection middleware (Story 14.5)
- Does NOT replace hardcoded practitioner references in fulfillment records (Story 14.6a)
- Does NOT add session timeout / inactivity (Story 14.3b)
- Does NOT add global navbar / AppShell (Story 14.4)
- Does NOT change the home page layout — pharmacists still land on scanner view after login

### Styling Notes

Match Pharmacy Lite's existing Tailwind patterns (same tokens as OPD Lite and Lab Lite):
- Card: `rounded-lg border border-neutral-200 bg-white p-6 shadow-sm`
- Primary button: `w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50`
- Input: `w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500`
- Error alert: `rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800` with `role="alert"`
- Header: `text-xl font-bold text-neutral-900` with text "Pharmacy Lite Sign In"
- TOTP input: `text-center text-lg tracking-widest` (consistent with OPD Lite/Lab Lite)

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/pharmacy-lite/package.json` | UPDATE | Add @supabase/supabase-js, @supabase/ssr |
| `apps/pharmacy-lite/src/lib/supabase.ts` | NEW | Supabase browser client singleton |
| `apps/pharmacy-lite/src/stores/auth-session-store.ts` | NEW | Zustand auth session store |
| `apps/pharmacy-lite/src/lib/trpc.ts` | NEW | reportAuthEvent() + getHubApiUrl() utility |
| `apps/pharmacy-lite/src/app/login/page.tsx` | NEW | Login page with credentials + MFA flow |
| `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx` | UPDATE | Remove authToken prop, use session store |
| `apps/pharmacy-lite/src/components/pharmacy/PrescriptionScanner.tsx` | UPDATE | Remove authToken prop, use session store |
| `apps/pharmacy-lite/src/lib/dispense-sync.ts` | UPDATE | Replace module-level authToken with session store |
| `apps/pharmacy-lite/src/lib/audit.ts` | UPDATE | Update startAuditDrain to use session store |
| `apps/pharmacy-lite/src/__tests__/login.test.tsx` | NEW | Login flow tests |
| `apps/pharmacy-lite/src/__tests__/PharmacyScannerView.test.tsx` | UPDATE | Remove authToken prop from test renders |
| `apps/pharmacy-lite/src/__tests__/PrescriptionScanner.test.tsx` | UPDATE | Remove authToken prop, mock session store |
| `pnpm-lock.yaml` | UPDATE | Lockfile updated |

### What NOT to Change

- DO NOT modify `prescription-status-client.ts` function signatures — they correctly accept `authToken` as a param; callers will pass from store
- DO NOT modify `practitioner-key-cache.ts` function signatures — same reasoning
- DO NOT modify `prescription-verify.ts` function signatures — same reasoning
- DO NOT install `jose` — JWT verification is Hub API's responsibility
- DO NOT use `localStorage` or `sessionStorage` for JWT tokens
- DO NOT add route protection to existing pages — that's Story 14.5
- DO NOT modify the home `page.tsx` layout (scanner view stays)
- DO NOT add `console.log` or `console.warn` statements — violates CLAUDE.md PHI logging rules and deviates from Lab Lite pattern

### Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_HUB_API_URL=http://localhost:3000/api/trpc  (already used by prescription-status-client.ts)
```

### Testing Standards

- **Framework:** Vitest + @testing-library/react (already configured in Pharmacy Lite)
- **Mock Supabase:** Mock `getSupabaseBrowserClient()` to return controlled responses for signInWithPassword, mfa.listFactors, mfa.challenge, mfa.verify
- **Mock reportAuthEvent:** Verify fire-and-forget calls without blocking
- **Assert session store:** Verify `useAuthSessionStore.getState().session` is populated with `role` matching PHARMACIST after successful flow
- **Assert redirect:** Verify `window.location.href` is set to `/` only after session store is populated
- **Test authToken removal:** Update `PharmacyScannerView.test.tsx` and `PrescriptionScanner.test.tsx` to mock `useAuthSessionStore` instead of passing `authToken` prop

### Existing Test Files That Need Updates

These test files currently pass `authToken="test-token"` as a prop:
- `apps/pharmacy-lite/src/__tests__/PrescriptionScanner.test.tsx` — 6 test renders pass `authToken="test-token"`
- `apps/pharmacy-lite/src/__tests__/PharmacyScannerView.test.tsx` — 1 test render passes `authToken="test-token" hubBaseUrl="http://hub"`

**Update strategy:** Mock `useAuthSessionStore` to return a session with a token, and remove the prop from all test renders. The component should internally call `getAccessToken()`.

### 14-1 Review Findings Applied (Lessons Learned)

These issues were found and fixed during OPD Lite's 14-1 code review. Apply the fixes from the start:

1. **Base64url decode** — JWT uses URL-safe Base64. Use `.replace(/-/g, '+').replace(/_/g, '/')` before `atob()`
2. **Null JWT guard** — Check `jwt` is non-null before redirect. Show error if null
3. **Dangling sessions** — Call `supabase.auth.signOut()` on `factorsError` and `challengeError`, not just on "no TOTP enrolled"
4. **Back-to-sign-in cleanup** — `handleBackToSignIn` must clear `factorId` and `challengeId` state
5. **No console.warn** — Don't add console output; matches CLAUDE.md and Lab Lite pattern

### Project Structure Notes

- Login page at `apps/pharmacy-lite/src/app/login/page.tsx` follows Next.js App Router convention
- Supabase client at `apps/pharmacy-lite/src/lib/supabase.ts` matches Lab Lite / OPD Lite pattern exactly
- Auth session store at `apps/pharmacy-lite/src/stores/auth-session-store.ts` matches OPD Lite interface
- `reportAuthEvent` in new `apps/pharmacy-lite/src/lib/trpc.ts` (Pharmacy Lite does not currently have a trpc.ts file — it uses `prescription-status-client.ts` and `dispense-sync.ts` for Hub API calls)
- Pharmacy Lite has its own `getHubApiUrl()` in `prescription-status-client.ts` and `dispense-sync.ts` — the new `trpc.ts` should export a shared `getHubApiUrl()` and the other files should import from it to deduplicate

### References

- [Source: apps/opd-lite/src/app/login/page.tsx] — Reference login implementation with all 14-1 review fixes applied (COPY PATTERN)
- [Source: apps/lab-lite/src/app/login/page.tsx] — Original reference login (Lab Lite pattern)
- [Source: apps/lab-lite/src/lib/supabase.ts] — Reference Supabase client (COPY EXACTLY)
- [Source: apps/lab-lite/src/lib/trpc.ts#reportAuthEvent] — Reference audit event reporting (COPY EXACTLY)
- [Source: apps/opd-lite/src/stores/auth-session-store.ts] — Auth session store interface (MATCH INTERFACE, extend with getAccessToken)
- [Source: apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx] — Current authToken prop usage (REPLACE)
- [Source: apps/pharmacy-lite/src/components/pharmacy/PrescriptionScanner.tsx] — Current authToken prop usage (REPLACE)
- [Source: apps/pharmacy-lite/src/lib/dispense-sync.ts] — Current module-level authToken (REPLACE)
- [Source: apps/pharmacy-lite/src/lib/audit.ts] — Current audit drain getAuthToken pattern (UPDATE)
- [Source: apps/pharmacy-lite/src/lib/prescription-status-client.ts] — Hub API client pattern (KEEP function params)
- [Source: apps/hub-api/src/trpc/rbac.ts] — PHARMACIST role permissions
- [Source: CLAUDE.md#Auth] — JWT RS256, 15-min expiry, memory-only storage
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#PH-G01] — No login page gap (this story fixes it)
- [Source: _bmad-output/implementation-artifacts/14-1-opd-lite-supabase-auth-login-page.md] — Previous story with review findings

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Fixed PrescriptionScanner.tsx `useRef(handleQrData)` temporal dead zone error by initializing ref as null and assigning in useEffect after handleQrData definition
- Added auth-session-store mocks to dispense-sync.test.ts, fulfillment-store.test.ts, SyncPulse.test.tsx, FulfillmentChecklist.test.tsx to prevent cascading Supabase env var errors from import chain: fulfillment-store -> dispense-sync -> auth-session-store -> supabase

### Completion Notes List
- All 7 tasks completed, all ACs satisfied
- Login page follows OPD Lite 14-1 pattern exactly, incorporating all review findings (Base64url decode, null JWT guard, dangling session prevention, back-to-sign-in cleanup, no console output)
- Auth session store extends OPD Lite interface with `getAccessToken()` for Hub API calls
- `authToken` prop removed from PharmacyScannerView and PrescriptionScanner; components now use session store internally
- `dispense-sync.ts` module-level `_authToken` pattern replaced with `useAuthSessionStore.getState().getAccessToken()`
- `audit.ts` `startAuditDrain` signature simplified (removed `getAuthToken` callback param); now reads token from session store via dynamic import
- 10 login tests pass (credential form, MFA flow, session store population, error handling, dangling session prevention)
- All previously-passing tests continue to pass (zero new regressions)
- Pre-existing test failures remain unchanged: MedicationLabel snapshots (2), prescription-verify (5), medication-dispense encryption (4), fulfillment-store encryption (6)
- Date: 2026-05-04

### File List
- `apps/pharmacy-lite/package.json` — UPDATED: added @supabase/supabase-js, @supabase/ssr
- `apps/pharmacy-lite/src/lib/supabase.ts` — NEW: Supabase browser client singleton
- `apps/pharmacy-lite/src/stores/auth-session-store.ts` — NEW: Zustand auth session store with getAccessToken
- `apps/pharmacy-lite/src/lib/trpc.ts` — NEW: reportAuthEvent + getHubApiUrl utility
- `apps/pharmacy-lite/src/app/login/page.tsx` — NEW: Login page with credentials + MFA flow
- `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx` — UPDATED: removed authToken/hubBaseUrl props, use session store
- `apps/pharmacy-lite/src/components/pharmacy/PrescriptionScanner.tsx` — UPDATED: removed authToken prop, use session store
- `apps/pharmacy-lite/src/lib/dispense-sync.ts` — UPDATED: replaced module-level authToken with session store
- `apps/pharmacy-lite/src/lib/audit.ts` — UPDATED: startAuditDrain reads token from session store
- `apps/pharmacy-lite/src/__tests__/login.test.tsx` — NEW: 10 login flow tests
- `apps/pharmacy-lite/src/__tests__/PharmacyScannerView.test.tsx` — UPDATED: mock session store instead of authToken prop
- `apps/pharmacy-lite/src/__tests__/PrescriptionScanner.test.tsx` — UPDATED: mock session store instead of authToken prop
- `apps/pharmacy-lite/src/__tests__/dispense-sync.test.ts` — UPDATED: added auth-session-store mock
- `apps/pharmacy-lite/src/__tests__/fulfillment-store.test.ts` — UPDATED: added auth-session-store mock
- `apps/pharmacy-lite/src/__tests__/SyncPulse.test.tsx` — UPDATED: added auth-session-store mock
- `apps/pharmacy-lite/src/__tests__/FulfillmentChecklist.test.tsx` — UPDATED: added auth-session-store mock
- `pnpm-lock.yaml` — UPDATED: lockfile
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — UPDATED: story status in-progress -> review
