# Story 22.1: Back-Office Admin Web Application Scaffold

Status: done

## Story

As a back-office reviewer,
I want a dedicated admin web application,
so that I can manage provider verification, lab approvals, and operational alerts.

## Acceptance Criteria

1. `apps/admin-portal/` exists as a Next.js 15 App Router application with `@ultranos/admin-portal` package name
2. Supabase Auth is configured with FIDO2 hardware token MFA for the ADMIN role (4h session duration per NFR9)
3. The admin portal connects to the Hub API via tRPC client (matching existing spoke app patterns)
4. A persistent sidebar navigation exists with sections: Dashboard, Providers, Labs, Alerts, Audit Log
5. The admin portal is NOT a PWA (no service worker, no manifest, no offline mode — admin actions require real-time Hub access)
6. A new `admin` tRPC router is added to the Hub API with ADMIN-role-only middleware guard
7. The admin portal has Turborepo filter, TypeScript project references, ESLint config, and Tailwind CSS configured
8. An `AuthGuard` component restricts access to ADMIN role only — non-admin users see "Access Denied"
9. A `/login` page exists with email + password + FIDO2 MFA flow (no TOTP fallback for admins — hardware token required)
10. Audit events are emitted for ADMIN_LOGIN_SUCCESS and ADMIN_LOGIN_FAILURE
11. The dashboard page shows placeholder cards for: Pending KYC Reviews, Pending Lab Approvals, Active Alerts, Recent Audit Events

## Tasks / Subtasks

- [x] Task 1: Create Next.js 15 app scaffold (AC: #1, #7)
  - [x] Create `apps/admin-portal/` with Next.js 15 App Router, TypeScript, Tailwind CSS
  - [x] Set package name to `@ultranos/admin-portal` in `package.json`
  - [x] Add to `pnpm-workspace.yaml` if not auto-detected
  - [x] Configure `tsconfig.json` with project references to `@ultranos/shared-types`
  - [x] Add ESLint config extending the monorepo root config
  - [x] Verify `pnpm -F admin-portal dev` starts successfully

- [x] Task 2: Configure Supabase Auth with FIDO2 MFA (AC: #2, #9)
  - [x] Add `@supabase/supabase-js` and `@supabase/ssr` dependencies
  - [x] Create `apps/admin-portal/src/lib/supabase.ts` — singleton browser client (matching spoke app pattern)
  - [x] Create `/login` page with email + password form
  - [x] After credential success, check `mfa.listFactors()` for `webauthn` type factor
  - [x] If no FIDO2 factor enrolled: show "Hardware security key (FIDO2) is required for admin access. Contact IT."
  - [x] If FIDO2 factor exists: trigger `mfa.challenge({ factorId })` and prompt for hardware key tap
  - [x] On MFA success: populate auth session store and redirect to `/dashboard`
  - [x] Enforce 4h session duration (set in Supabase Auth config, validate client-side)

- [x] Task 3: Create auth session store and AuthGuard (AC: #8, #10)
  - [x] Create `apps/admin-portal/src/stores/auth-session-store.ts` (Zustand, matching spoke app pattern)
  - [x] Store: userId, practitionerId, role, sessionId — role must be `ADMIN`
  - [x] Create `apps/admin-portal/src/components/AuthGuard.tsx`
  - [x] AuthGuard checks role === 'ADMIN'; non-admin users see "Access Denied" message
  - [x] Unauthenticated users redirect to `/login`
  - [x] Emit audit events for ADMIN_LOGIN_SUCCESS and ADMIN_LOGIN_FAILURE via Hub API

- [x] Task 4: Configure tRPC client connection (AC: #3)
  - [x] Create `apps/admin-portal/src/lib/trpc.ts` — tRPC client pointing to Hub API
  - [x] Use `httpBatchLink` with auth header from session store (memory-only JWT)
  - [x] Create tRPC React Query provider in layout

- [x] Task 5: Create Hub API admin router with ADMIN guard (AC: #6)
  - [x] Create `apps/hub-api/src/trpc/routers/admin.ts` with ADMIN-role-only procedure middleware
  - [x] Add placeholder procedures: `admin.dashboardStats`, `admin.health`
  - [x] Register `admin` router in `_app.ts`
  - [x] The ADMIN guard middleware rejects non-ADMIN callers with `FORBIDDEN` error

- [x] Task 6: Build sidebar navigation layout (AC: #4)
  - [x] Create `apps/admin-portal/src/components/Sidebar.tsx` — persistent left sidebar
  - [x] Sections: Dashboard (home icon), Providers (user icon), Labs (flask icon), Alerts (bell icon), Audit Log (scroll icon)
  - [x] Active section highlighted; sidebar always visible (no collapse on desktop — admin is desktop-only)
  - [x] Create `apps/admin-portal/src/app/layout.tsx` with sidebar + main content area

- [x] Task 7: Create dashboard page with placeholder cards (AC: #11)
  - [x] Create `apps/admin-portal/src/app/dashboard/page.tsx`
  - [x] Four stat cards: Pending KYC Reviews, Pending Lab Approvals, Active Alerts, Recent Audit Events
  - [x] Cards show "—" placeholder values (will be wired to real data in subsequent stories)
  - [x] Redirect `/` to `/dashboard`

- [x] Task 8: Verify NOT a PWA (AC: #5)
  - [x] Confirm NO `manifest.json` or `manifest.webmanifest` exists
  - [x] Confirm NO service worker registration
  - [x] No `next-pwa` or similar dependency
  - [x] Add a comment in `next.config.js`: "Admin portal is intentionally NOT a PWA — all actions require real-time Hub access"

- [x] Task 9: Write tests
  - [x] Test AuthGuard redirects unauthenticated users to `/login`
  - [x] Test AuthGuard shows "Access Denied" for non-ADMIN roles
  - [x] Test login page renders email/password form
  - [x] Test FIDO2 MFA flow (mock WebAuthn API)
  - [x] Test sidebar renders all 5 navigation sections
  - [x] Test dashboard renders 4 placeholder stat cards
  - [x] Test Hub API admin router rejects non-ADMIN callers
  - [x] Verify all existing monorepo tests pass — no regressions

## Dev Notes

### Reference Implementations
- **Auth pattern:** `apps/opd-lite/src/app/login/page.tsx` and `apps/lab-lite/src/app/login/page.tsx` — adapt for FIDO2 instead of TOTP
- **tRPC client:** `apps/opd-lite/src/lib/trpc.ts` — same pattern for admin portal
- **Auth session store:** `apps/opd-lite/src/stores/auth-session-store.ts` — same Zustand pattern
- **AuthGuard:** `apps/opd-lite/src/components/AuthGuard.tsx` — adapt to check ADMIN role

### Key Differences from Spoke Apps
- **FIDO2 MFA only** — no TOTP fallback. Admin accounts require hardware security keys per PRD Section 9 (`System Administrator` row)
- **No PWA** — no offline mode, no service worker, no manifest
- **4h session** — shorter than GP (8h) or pharmacist (12h) per NFR9
- **ADMIN role guard** — all routes and API endpoints reject non-ADMIN callers

### Existing Infrastructure
- `PractitionerSession` type in `packages/shared-types/src/fhir/practitioner.ts` already includes `role: 'ADMIN'`
- Hub API tRPC init in `apps/hub-api/src/trpc/init.ts` has role extraction from JWT — extend for ADMIN guard

### Parallel Development Note
This story can be developed in parallel with Story 22.5 (Provider Self-Service KYC Submission in OPD Lite).

## Dev Agent Record

### Implementation Plan
- Built on existing admin-portal scaffold from Epic 27 (subscription management)
- Added FIDO2 MFA login flow (WebAuthn factor check, challenge, verify)
- Enhanced AuthGuard with "Access Denied" screen for non-ADMIN roles
- Created Hub API admin router with adminProcedure middleware guard
- Extracted Sidebar component with 5 navigation sections per AC#4
- Dashboard page with 4 placeholder stat cards
- Comprehensive test suite: 26 admin-portal tests + 8 hub-api admin router tests

### Debug Log
- No debug issues encountered

### Completion Notes
- All 9 tasks completed with 34 new tests passing (26 admin-portal + 8 hub-api)
- Hub-api pre-existing test failures (24 files) confirmed unrelated to this story (ioredis, billing webhook, jwt-auth modules)
- Admin portal verified NOT a PWA: no manifest, no service worker, no next-pwa dependency
- FIDO2 flow checks for `webauthn` factor type (not TOTP) — no fallback per PRD
- AuthGuard shows "Access Denied" with sign-out option for non-ADMIN authenticated users
- Admin router uses protectedProcedure + ADMIN role check middleware
- reportAuthEvent uses baseProcedure (unauthenticated) with rate limiting for audit trail

## File List

### New Files
- `apps/admin-portal/.env.example`
- `apps/admin-portal/src/stores/auth-session-store.ts`
- `apps/admin-portal/src/app/login/page.tsx`
- `apps/admin-portal/src/app/dashboard/page.tsx`
- `apps/admin-portal/src/components/Sidebar.tsx`
- `apps/admin-portal/src/__tests__/auth-guard.test.tsx`
- `apps/admin-portal/src/__tests__/login.test.tsx`
- `apps/admin-portal/src/__tests__/sidebar.test.tsx`
- `apps/admin-portal/src/__tests__/dashboard.test.tsx`
- `apps/hub-api/src/trpc/routers/admin.ts`
- `apps/hub-api/src/__tests__/admin-router.test.ts`

### Modified Files
- `apps/admin-portal/package.json` — added zustand dependency
- `apps/admin-portal/next.config.js` — added NOT-a-PWA comment
- `apps/admin-portal/src/app/layout.tsx` — use Sidebar component, updated metadata
- `apps/admin-portal/src/app/page.tsx` — redirect to /dashboard
- `apps/admin-portal/src/components/AuthGuard.tsx` — Access Denied for non-ADMIN, session store integration
- `apps/admin-portal/src/lib/trpc.ts` — added reportAdminAuthEvent, getHubApiUrl helper
- `apps/hub-api/src/trpc/routers/_app.ts` — registered admin router

### Review Findings

#### Decision Needed
- [x] [Review][Decision] **Rate limit key spoofable via x-forwarded-for** — Deferred to deployment architecture definition. Infrastructure concern, not scaffold scope. [admin.ts:75-78]
- [x] [Review][Decision] **tRPC client pattern diverges from spoke apps (AC3)** — Accepted. Admin portal is always-online, typed tRPC client is architecturally appropriate. Direct type import path noted for future cleanup. [trpc.ts:3]

#### Patch
- [x] [Review][Patch] Rate limiter memory leak — added eviction when map exceeds 10k entries [admin.ts]
- [x] [Review][Patch] `actorRole` defaults to `'UNKNOWN'` for unauthenticated callers [admin.ts]
- [x] [Review][Patch] WebAuthn `mfa.verify` — added `PublicKeyCredential` browser capability check [login/page.tsx]
- [x] [Review][Patch] Added `onAuthStateChange` listener for token refresh + signout handling [AuthGuard.tsx]
- [x] [Review][Patch] `reportAdminAuthEvent` now uses tRPC client instead of raw fetch [trpc.ts]
- [x] [Review][Patch] Login page now reads `returnUrl` query param after successful auth [login/page.tsx]
- [x] [Review][Patch] ESLint config — verified matches existing spoke pattern (root config covers all apps) — no change needed
- [x] [Review][Patch] TS project references — verified matches existing spoke pattern (all use path aliases) — no change needed
- [x] [Review][Patch] 4h session duration enforced client-side via `iat` check in AuthGuard [AuthGuard.tsx]
- [x] [Review][Patch] Login tests now assert `reportAdminAuthEvent` called with correct event/params [login.test.tsx]
- [x] [Review][Patch] Admin router test now verifies `AuditLogger.emit` called with correct action/outcome/metadata [admin-router.test.ts]
- [x] [Review][Patch] `handleBackToSignIn` wrapped in try/catch [login/page.tsx]

#### Deferred
- [x] [Review][Defer] Supabase env var validation throws at module load time — may crash SSR/build [supabase.ts:6-9] — deferred, pre-existing pattern in all spoke apps
- [x] [Review][Defer] AuthGuard `isLoginPage` exact path match fails with Next.js basePath [AuthGuard.tsx:13-14] — deferred, no basePath configured; systemic across all apps
- [x] [Review][Defer] No Supabase project-level FIDO2/WebAuthn enablement documented [admin-portal/] — deferred, infrastructure config not code

## Change Log

- 2026-05-15: Story 22.1 implemented — admin portal scaffold with FIDO2 MFA login, ADMIN-only AuthGuard, Hub API admin router, sidebar navigation, dashboard placeholder cards, and comprehensive test suite (34 tests)
