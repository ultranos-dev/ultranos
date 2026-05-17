# Story 26.6: Pharmacy Lite Settings Page

Status: done

## Story

As a pharmacist,
I want a settings page where I can view my profile and pharmacy info,
so that I can verify my account details.

## Acceptance Criteria

1. **Given** the `/settings` route in Pharmacy Lite, **When** the page loads, **Then** the following sections are displayed:
   - Pharmacist profile card: name, role, email
   - Pharmacy info: pharmacy name, license reference
   - Session info: login time, session expiry countdown
   - MFA management: view TOTP status
2. **Given** the AppShell navbar dropdown, **When** "Settings" is clicked, **Then** it navigates to `/settings`

## Tasks / Subtasks

- [x] Task 1: Create settings page (AC: #1)
  - [x] 1.1 Create `src/app/settings/page.tsx` — hosts `PharmacySettingsView`
  - [x] 1.2 Create `src/components/pharmacy/PharmacySettingsView.tsx` — layout with profile, pharmacy info, session, and MFA sections
- [x] Task 2: Profile card (AC: #1)
  - [x] 2.1 Read from `auth-session-store`: `userId`, `email`, `role`
  - [x] 2.2 Display pharmacist name (from session store or JWT `user_metadata.name`)
  - [x] 2.3 Display role with styled badge (e.g., "Pharmacist" in primary-colored pill)
- [x] Task 3: Pharmacy info section (AC: #1)
  - [x] 3.1 Display pharmacy name — source: JWT custom claim `pharmacy_name` or `user_metadata.pharmacy_name` (if available); otherwise show "Not configured"
  - [x] 3.2 Display license reference — source: JWT custom claim or `user_metadata.license_ref`; otherwise "Not configured"
  - [x] 3.3 These fields are read-only — pharmacists cannot edit them (managed by Admin)
- [x] Task 4: Session info section (AC: #1)
  - [x] 4.1 Show login time — store login timestamp in `auth-session-store` during login flow (new field: `loginAt`)
  - [x] 4.2 Show session expiry countdown — derive from `SessionTimeoutWrapper`'s max duration (12 hours for pharmacist role) minus elapsed time
  - [x] 4.3 Use a `useEffect` interval to update the countdown every minute
- [x] Task 5: MFA status section (AC: #1)
  - [x] 5.1 Query `supabase.auth.mfa.listFactors()` to check TOTP enrollment status
  - [x] 5.2 Display: "TOTP Enabled" with green badge if enrolled, "Not Configured" with amber warning if not
  - [x] 5.3 Read-only — MFA management (add/remove factors) is out of scope for this story
- [x] Task 6: AppShell Settings link (AC: #2)
  - [x] 6.1 Added `settingsHref` prop to AppShell component; passed `/settings` from AppShellWrapper
  - [x] 6.2 The AppShell component now accepts a configurable settings href (defaults to `#settings` for backward compatibility)
- [x] Task 7: Tests (AC: all)
  - [x] 7.1 Unit test `PharmacySettingsView` renders all four sections
  - [x] 7.2 Unit test session countdown timer updates
  - [x] 7.3 Unit test MFA status display for enrolled/not-enrolled states

## Dev Notes

### Architecture & Patterns

- **No PHI on this page.** Settings displays only the pharmacist's own profile info (name, email, role) and pharmacy metadata. No patient data is accessed, so no audit event is needed.
- **Read-only page.** Pharmacists cannot modify their profile, pharmacy info, or MFA from this page. All administrative changes are done by the org Admin (Epic 22).
- **Session countdown:** The `SessionTimeoutWrapper` in `ClientErrorBoundary` already tracks session expiry. To display a countdown, either:
  - (A) Store `loginAt` in `auth-session-store` and compute remaining time from `MAX_SESSION_DURATION - (now - loginAt)`
  - (B) Expose a `getTimeRemaining()` method from the session timeout logic
  - Option A is simpler and preferred.
- **AppShell Settings link:** The existing `AppShell` component from `@ultranos/ui-kit` renders a hardcoded `href="#settings"` link in the dropdown menu. Story 26.1 integrates AppShell into `layout.tsx` — at that point, the Settings href should be `/settings`. If 26.1 is done first, this is already wired. If not, this story must update it.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `src/stores/auth-session-store.ts` | Add `loginAt: string` field, set during login flow |
| `src/app/layout.tsx` | Ensure AppShell Settings dropdown links to `/settings` |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `src/app/settings/page.tsx` | Settings route page |
| `src/components/pharmacy/PharmacySettingsView.tsx` | Settings layout with all sections |

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 26.6]
- [Source: packages/ui-kit/src/AppShell.tsx — Settings menu item at line 312-329]
- [Source: apps/pharmacy-lite/src/stores/auth-session-store.ts — AuthSession interface]
- [Source: apps/pharmacy-lite/src/lib/supabase.ts — Supabase client for MFA query]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Login test required update: `toEqual` → `toMatchObject` due to new session fields (loginAt, name, pharmacyName, licenseRef)

### Completion Notes List

- Created `/settings` route page with back-navigation link and PharmacySettingsView
- Built PharmacySettingsView with 4 sections: ProfileCard, PharmacyInfoCard, SessionInfoCard, MfaStatusCard
- Extended AuthSession interface with `name`, `loginAt`, `pharmacyName`, `licenseRef` optional fields
- Updated login page and AuthGuard to populate new session fields from JWT claims/user_metadata
- Added `settingsHref` prop to shared AppShell component (backward-compatible default `#settings`)
- Passed `settingsHref="/settings"` from Pharmacy Lite's AppShellWrapper
- Session countdown uses Option A (loginAt + MAX_SESSION_MS) as recommended in Dev Notes
- 12 new tests covering all sections, countdown updates, MFA enrolled/not-enrolled states, fallback values
- Fixed pre-existing login test regression caused by new session fields
- No PHI on this page — no audit events needed (per Dev Notes)

### Change Log

- 2026-05-12: Implemented Story 26.6 — Pharmacy Lite Settings Page (all tasks complete)

### File List

- `apps/pharmacy-lite/src/app/settings/page.tsx` (NEW)
- `apps/pharmacy-lite/src/components/pharmacy/PharmacySettingsView.tsx` (NEW)
- `apps/pharmacy-lite/src/__tests__/PharmacySettingsView.test.tsx` (NEW)
- `apps/pharmacy-lite/src/stores/auth-session-store.ts` (MODIFIED — added optional fields)
- `apps/pharmacy-lite/src/app/login/page.tsx` (MODIFIED — populate new session fields)
- `apps/pharmacy-lite/src/components/AuthGuard.tsx` (MODIFIED — populate new session fields)
- `apps/pharmacy-lite/src/components/AppShellWrapper.tsx` (MODIFIED — pass settingsHref)
- `apps/pharmacy-lite/src/__tests__/login.test.tsx` (MODIFIED — updated assertion for new fields)
- `packages/ui-kit/src/AppShell.tsx` (MODIFIED — added settingsHref prop)

### Review Findings

- [x] [Review][Decision] Countdown shows seconds but updates every 60s — resolved: tick every 1s (Option A) [PharmacySettingsView.tsx:119]
- [x] [Review][Patch] loginAt resets on every AuthGuard mount — fixed: preserve existing loginAt on session reconstruction [AuthGuard.tsx:46]
- [x] [Review][Patch] MFA data.totp accessed without null guard; listFactors error not checked — fixed: check error, guard data?.totp, show error state [PharmacySettingsView.tsx:163-165]
- [x] [Review][Patch] startKrlSync captures stale getAccessToken closure — fixed: use useAuthSessionStore.getState() at call time [AuthGuard.tsx:59]
- [x] [Review][Patch] AppShellWrapper ignores session.name for user dropdown — fixed: use session.name || email prefix [AppShellWrapper.tsx:56]
- [x] [Review][Defer] KRL sync/sync drain added to AuthGuard — out of scope (Story 19.5), deferred, pre-existing
- [x] [Review][Defer] atob() without base64 padding correction — pre-existing code, deferred
