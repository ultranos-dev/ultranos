# Story 14.1: OPD Lite Supabase Auth Login Page

Status: ready-for-dev

## Story

As a clinician,
I want to sign in to OPD Lite with my credentials and TOTP MFA,
so that my session is authenticated before I access patient data.

## Acceptance Criteria

1. A `/login` route exists in OPD Lite with email + password credential form
2. After successful password authentication, TOTP MFA challenge is presented and must be verified
3. If TOTP is not enrolled, the user sees "TOTP MFA is required for clinical staff. Please contact administration to set up MFA." and the partial session is revoked
4. On successful login + MFA, the `useAuthSessionStore` is populated with userId, practitionerId, role, sessionId from the Supabase JWT
5. The JWT access token is stored in memory only (never localStorage) — retrieved via `supabase.auth.getSession()` on demand
6. The clinician is redirected to `/` (patient search / future dashboard) after successful auth
7. Login failures display a generic error "Invalid email or password" (no credential enumeration)
8. Audit events are emitted for LOGIN_SUCCESS, LOGIN_FAILURE, MFA_VERIFY_SUCCESS, MFA_VERIFY_FAILURE via fire-and-forget to Hub API `lab.reportAuthEvent`
9. `@supabase/ssr` is added as a dependency (matching Lab Lite's `createBrowserClient` pattern)
10. The Supabase client is created as a singleton in `apps/opd-lite/src/lib/supabase.ts`
11. All existing OPD Lite tests pass — no regressions

## Tasks / Subtasks

- [ ] Task 1: Add Supabase dependencies (AC: #9)
  - [ ] Add `@supabase/supabase-js` and `@supabase/ssr` to `apps/opd-lite/package.json`
  - [ ] Run `pnpm install` to update lockfile
- [ ] Task 2: Create Supabase browser client (AC: #10)
  - [ ] Create `apps/opd-lite/src/lib/supabase.ts` — singleton pattern matching Lab Lite exactly
  - [ ] Validate `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
  - [ ] Throw at module load if env vars missing (fail-fast)
- [ ] Task 3: Create auth event reporting utility (AC: #8)
  - [ ] Add `reportAuthEvent()` function to `apps/opd-lite/src/lib/trpc.ts`
  - [ ] Fire-and-forget pattern: POST to `{HUB_API_URL}/lab.reportAuthEvent` with event type and actor info
  - [ ] Never throws — auth flow must not be blocked by audit failures
  - [ ] Match Lab Lite's exact `reportAuthEvent` signature
- [ ] Task 4: Create login page (AC: #1, #2, #3, #6, #7)
  - [ ] Create `apps/opd-lite/src/app/login/page.tsx`
  - [ ] Implement two-step auth flow: credentials form → TOTP MFA form
  - [ ] On credential success: check `supabase.auth.mfa.listFactors()` for enrolled TOTP
  - [ ] If no TOTP enrolled: show error, revoke session with `supabase.auth.signOut()`, stay on login
  - [ ] If TOTP enrolled: create challenge with `supabase.auth.mfa.challenge()`, show TOTP input
  - [ ] On MFA verify success: redirect to `/`
  - [ ] Display generic error messages (no credential enumeration, no PHI)
  - [ ] Clear password from state after credential submission
  - [ ] Style using OPD Lite's existing Tailwind classes and primary color tokens
- [ ] Task 5: Populate auth session store on login (AC: #4, #5)
  - [ ] After successful MFA verification, get session via `supabase.auth.getSession()`
  - [ ] Extract from JWT: `sub` → userId, `role` → role, `session_id` → sessionId
  - [ ] Look up practitionerId: query `practitioners` table via Hub API or extract from JWT custom claims
  - [ ] Call `useAuthSessionStore.getState().setSession({ userId, practitionerId, role, sessionId })`
  - [ ] If practitionerId cannot be resolved, use `userId` as fallback with a console warning
- [ ] Task 6: Write tests (AC: #11)
  - [ ] Create `apps/opd-lite/src/__tests__/login.test.ts`
  - [ ] Test credential form renders with email/password fields
  - [ ] Test successful credential submission transitions to MFA step
  - [ ] Test failed credential submission shows error, emits LOGIN_FAILURE event
  - [ ] Test MFA form renders with TOTP input
  - [ ] Test successful MFA populates auth session store
  - [ ] Test failed MFA shows error, clears TOTP input
  - [ ] Test no TOTP enrolled shows enrollment error and signs out
  - [ ] Verify all existing OPD Lite tests pass

## Dev Notes

### Reference Implementation: Lab Lite Login

The login page MUST follow Lab Lite's pattern at `apps/lab-lite/src/app/login/page.tsx`. Key design decisions already made:

**Auth flow state machine:**
```
'credentials' → (password OK) → check MFA factors → 'mfa' → (TOTP OK) → redirect to /
                 (password fail) → show error, stay on 'credentials'
                                   (no TOTP enrolled) → show error, signOut, stay on 'credentials'
                                                         (TOTP fail) → show error, stay on 'mfa'
```

**Lab Lite's exact Supabase client pattern (COPY THIS):**
```typescript
// apps/opd-lite/src/lib/supabase.ts
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

### OPD Lite Auth Session Store (ALREADY EXISTS — USE IT)

`apps/opd-lite/src/stores/auth-session-store.ts` already exports:
```typescript
useAuthSessionStore.getState().setSession({ userId, practitionerId, role, sessionId })
useAuthSessionStore.getState().clearSession()
useAuthSessionStore.getState().getPractitionerRef()
```

DO NOT create a new auth store. Wire the login page into this existing store.

### Populating the Auth Session After MFA

After `supabase.auth.mfa.verify()` succeeds:
```typescript
const { data: sessionData } = await supabase.auth.getSession()
const jwt = sessionData.session?.access_token
// The JWT contains: sub (user ID), role, session_id
// Decode without verification (already verified by Supabase):
const payload = JSON.parse(atob(jwt.split('.')[1]))

// For practitionerId — try to resolve from practitioners table:
// Option A: Extract from JWT custom claims if configured in Supabase
// Option B: Query Hub API: GET /practitioners?userId={payload.sub}
// Option C: Use payload.sub as practitionerId (fallback)
```

**IMPORTANT:** The Hub API validates JWT via RS256 JWK (see `apps/hub-api/src/lib/jwt.ts`). The OPD Lite client DOES NOT need to verify the JWT — Supabase Auth already verified it during the sign-in flow. The client only needs to extract claims for the session store and pass the raw token to Hub API calls.

### Hub API Auth Integration

After login, all Hub API calls MUST include the JWT. The existing `searchPatientsOnHub()` in `apps/opd-lite/src/lib/trpc.ts` currently does NOT pass an auth header. **This story does NOT fix that** — Story 14.5 (Route Protection) and 14.6 (Practitioner Reference) handle wiring auth into API calls. For now, just ensure the session store is populated and the Supabase client holds the session.

### What This Story Does NOT Do

- Does NOT add route protection middleware (Story 14.5)
- Does NOT replace hardcoded practitioner references (Story 14.6)
- Does NOT add session timeout / inactivity (Story 14.3)
- Does NOT add global navbar (Story 14.4)
- Does NOT wire auth token into Hub API calls (future stories)
- Does NOT change the `/` page — clinicians still land on patient search after login

### Styling Notes

Match OPD Lite's existing Tailwind patterns:
- Card: `rounded-lg border border-neutral-200 bg-white p-6 shadow-sm`
- Primary button: `rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50`
- Input: `w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500`
- Error alert: `rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800` with `role="alert"`
- Header: Use `text-xl font-bold text-neutral-900`

### Files That Will Change

| File | Action | Reason |
|------|--------|--------|
| `apps/opd-lite/package.json` | UPDATE | Add @supabase/supabase-js, @supabase/ssr |
| `apps/opd-lite/src/lib/supabase.ts` | NEW | Supabase browser client singleton |
| `apps/opd-lite/src/lib/trpc.ts` | UPDATE | Add reportAuthEvent() function |
| `apps/opd-lite/src/app/login/page.tsx` | NEW | Login page with credentials + MFA flow |
| `apps/opd-lite/src/__tests__/login.test.ts` | NEW | Login page tests |

### What NOT to Change

- DO NOT modify `auth-session-store.ts` — it already has the correct interface
- DO NOT modify the `/` page (page.tsx) — it stays as patient search for now
- DO NOT add auth checks to existing routes — that's Story 14.5
- DO NOT install `jose` in OPD Lite — JWT verification is Hub API's responsibility, not the client's
- DO NOT use `localStorage` or `sessionStorage` for JWT tokens — Supabase client handles session in memory via `createBrowserClient`

### Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_HUB_API_URL=http://localhost:3000/api/trpc  (already used by trpc.ts)
```

### Testing Standards

- **Framework:** Vitest + @testing-library/react (already configured in OPD Lite)
- **Mock Supabase:** Mock `getSupabaseBrowserClient()` to return controlled responses for signInWithPassword, mfa.listFactors, mfa.challenge, mfa.verify
- **Mock reportAuthEvent:** Verify fire-and-forget calls without blocking
- **Assert session store:** Verify `useAuthSessionStore.getState().session` is populated after successful flow

### Project Structure Notes

- Login page at `apps/opd-lite/src/app/login/page.tsx` follows Next.js App Router convention
- Supabase client at `apps/opd-lite/src/lib/supabase.ts` matches Lab Lite pattern exactly
- `reportAuthEvent` added to existing `apps/opd-lite/src/lib/trpc.ts` (not a new file)

### References

- [Source: apps/lab-lite/src/app/login/page.tsx] — Reference login implementation (COPY PATTERN)
- [Source: apps/lab-lite/src/lib/supabase.ts] — Reference Supabase client (COPY EXACTLY)
- [Source: apps/lab-lite/src/lib/trpc.ts#reportAuthEvent] — Reference audit event reporting
- [Source: apps/opd-lite/src/stores/auth-session-store.ts] — Existing session store (USE AS-IS)
- [Source: apps/opd-lite/src/lib/trpc.ts] — Existing Hub API client (ADD reportAuthEvent here)
- [Source: apps/hub-api/src/trpc/init.ts] — How Hub API extracts JWT from Authorization header
- [Source: apps/hub-api/src/lib/jwt.ts] — RS256 JWT verification (Hub-side only)
- [Source: apps/hub-api/src/trpc/rbac.ts] — CLINICIAN/DOCTOR role permissions
- [Source: CLAUDE.md#Auth] — JWT RS256, 15-min expiry, memory-only storage
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#OPD-G01] — No login page gap

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
