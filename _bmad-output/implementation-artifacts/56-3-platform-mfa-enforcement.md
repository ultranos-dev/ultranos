# Story 56.3: MFA as an Admin-Controlled Feature (Org-Level Toggle, Disabled by Default)

Status: ready-for-dev

## Story

As an organization administrator,
I want MFA to be a feature I can enable or disable for my organization from the Admin Portal — disabled by default — with the Hub enforcing it server-side only when enabled, and working enrollment/challenge flows in all four apps for when it is on,
so that organizations choose their own security posture, and when MFA is turned on it is genuinely enforced rather than the current non-functional theater.

> **Policy decision (2026-09-23, user-directed):** MFA is NOT a default requirement. It is an org-level feature toggle owned by the Admin in the Admin Portal. This supersedes the CLAUDE.md line "MFA: TOTP required for all clinical staff roles" — CLAUDE.md must be amended as part of this story (Task 5). Patient auth remains OTP-only and is never affected by the toggle.

## Acceptance Criteria

1. **Given** the Admin Portal settings, **when** an admin views their organization's security settings, **then** they see an "Multi-Factor Authentication" toggle (default: OFF) with a clear description of what enabling it does; changing it requires confirmation and emits an audit event (`ORG_MFA_POLICY_CHANGED`).
2. **Given** an org with MFA **disabled** (the default), **when** staff sign in to any app, **then** login is password-only with no MFA prompts anywhere — no enrollment nags, no dead-code challenge steps executing, and the Hub imposes no `aal` requirement.
3. **Given** an org with MFA **enabled**, **when** a staff-role token without a second factor (`aal1`) calls role-restricted Hub procedures, **then** the Hub rejects with a distinct `MFA_REQUIRED` error — enforcement is server-side, per-org, resolved from the org's stored policy (never from a client-supplied value).
4. **Given** an org with MFA enabled, **when** a staff user without an enrolled factor signs in, **then** the app routes them through TOTP enrollment (QR + code confirm) before reaching clinical views, and subsequent logins run the TOTP challenge; a grace-period setting (0–30 days, default 7) lets admins stage rollout — during grace, users are warned and can skip; after grace, enrollment is required.
5. **Given** the admin-portal's existing broken MFA code, **then** it is repaired regardless of toggle state: the fake `mfa.verify({ code: '' })` ceremonies are replaced with a real TOTP flow (used only when the org policy is on), and the post-MFA role check reads the correct claim (`app_metadata.role` per Story 56.1 — not top-level `payload.role`).
6. **Given** an admin disables MFA for an org that had it enabled, **then** enforcement stops immediately (next token refresh), enrolled factors remain stored (re-enabling does not force re-enrollment), and the change is audited.
7. **Zero regression:** with the toggle OFF (default), every login flow in all four apps behaves exactly as today minus the dead bypass code — password sign-in, session refresh, patient OTP, role routing all unchanged; all pre-existing auth tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: Org MFA policy storage + admin endpoints** (AC: 1, 6)
  - [ ] 1.1 Migration (Supabase MCP): `org_security_policies` table (or extend the org/settings table): `org_id` (PK/FK), `mfa_required` (boolean NOT NULL default false), `mfa_grace_period_days` (int default 7), `mfa_enabled_at` (timestamptz), `updated_by` (FK), `updated_at`.
  - [ ] 1.2 Hub endpoints: `admin.getSecurityPolicy` / `admin.updateSecurityPolicy` — admin-role gated, org-scoped, validates grace period 0–30, emits `ORG_MFA_POLICY_CHANGED` audit event with old→new values (no PHI).
- [ ] **Task 2: Hub conditional enforcement** (AC: 2, 3, 6)
  - [ ] 2.1 New `enforceMfaPolicy` middleware (or extension in `apps/hub-api/src/trpc/init.ts`): for staff-role tokens, look up the org's `mfa_required` (cache with short TTL — per-request DB hit is unacceptable on every procedure); if enabled and past grace, require `aal2` from the verified JWT's `aal`/`amr` claims; emit distinct `MFA_REQUIRED` TRPCError.
  - [ ] 2.2 Exemptions: PATIENT/GUARDIAN (OTP-only per policy), unauthenticated endpoints (registration, reportAuthEvent), and the auth/enrollment endpoints themselves (a user must be able to enroll while `aal1`).
  - [ ] 2.3 Grace-period logic: `mfa_enabled_at + grace_period` — before it, log-only telemetry (audit warning per non-compliant login, max once/day/user); after it, enforce.
- [ ] **Task 3: Admin Portal — toggle UI + repaired MFA flows** (AC: 1, 4, 5)
  - [ ] 3.1 Security section on the org settings page: toggle + grace-period select + explanatory copy + confirm dialog; i18n'd (en/ar/prs/ps); follows the standard settings-page layout (boxed form sections, semantic tokens).
  - [ ] 3.2 Replace the fake ceremonies at `apps/admin-portal/src/app/[locale]/login/page.tsx:141-145` and `settings/page.tsx:292-296` with a real Supabase TOTP flow (`mfa.enroll` → QR → `mfa.challenge`/`verify`); remove the zero-`navigator.credentials` WebAuthn theater (TOTP-first; WebAuthn can be a future enhancement).
  - [ ] 3.3 Fix the post-MFA role check at `login/page.tsx:164` (currently reads `payload.role`, always `"authenticated"` — fails closed and masked the theater).
  - [ ] 3.4 `AuthGuard` honors the org policy: policy-on + no factor + past grace → route to enrollment; policy-off → zero MFA UI anywhere.
- [ ] **Task 4: Spoke flows (OPD, Lab, Pharmacy)** (AC: 2, 4)
  - [ ] 4.1 Remove the unconditional bypasses (`opd-lite .../login/page.tsx:59`, `lab-lite .../login/page.tsx:67`, `pharmacy-lite .../login/page.tsx:59` — each already has dormant verify code below the TODO); the challenge step now runs ONLY when the org policy requires it (fetch policy post-password-auth or read an `MFA_REQUIRED` signal from the first Hub call).
  - [ ] 4.2 TOTP enrollment UI in each spoke's settings page (and forced-enrollment route for policy-on-past-grace users); offline note: an enrolled user's session that was established with `aal2` keeps working offline — enforcement is at Hub-call time, not against the local store.
- [x] **Task 5: Documentation** (AC: policy decision) — **already completed 2026-09-23, ahead of implementation**
  - [x] 5.1 CLAUDE.md "Auth & Sessions" amended: MFA is now documented as an org-level feature toggle (TOTP), managed by the org Admin in the Admin Portal, disabled by default, enforced server-side at the Hub (`aal2`) when enabled; patient auth OTP-only, never MFA. (Done directly per user instruction — do not re-edit.)
- [ ] **Task 6: Tests** (AC: 1-6)
  - [ ] 6.1 Hub: policy-off org → `aal1` staff token accepted everywhere; policy-on past-grace → `MFA_REQUIRED`; policy-on within-grace → allowed + telemetry; patient token unaffected in both modes; policy cache invalidation on toggle; toggle endpoints org-scoped (admin of org A cannot toggle org B) + audited.
  - [ ] 6.2 Admin portal: toggle UI (confirm, audit, grace select); real TOTP enroll/challenge flow; wrong code rejected; role check reads `app_metadata`.
  - [ ] 6.3 Spokes: policy-off → no MFA UI rendered; policy-on → challenge/enrollment routing.
- [ ] **Task 7: Regression verification** (AC: 7)
  - [ ] 7.1 With default policy (OFF): full auth test suites across 4 apps + hub pass; manual login per app confirms behavior identical to today; patient OTP registration e2e unchanged; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed (as re-scoped by the policy decision)

- **C-SYS-6 [V]** (audit §2) — re-scoped: the audit flagged (a) bypassed/disabled flows in three spokes, (b) non-functional MFA theater in admin-portal (fake `verify({code:''})`, wrong-claim role check), (c) zero server-side `aal` checking. Under the new policy, (a) and (b) are still bugs to fix (dead/fake code), and (c) becomes *conditional* enforcement — the Hub must be able to enforce when an org opts in. What changes vs. the original story: enforcement is opt-in per org, default OFF, owned by the Admin Portal.

### Architecture

- **Server-side conditional enforcement is still the core.** A toggle that only hides client UI would reproduce the current theater for opted-in orgs. The org policy is the single source of truth, read hub-side; clients only adapt UX.
- Policy lookup caching: short-TTL in-memory (or Redis) cache keyed by org_id; invalidate on `updateSecurityPolicy`. Toggle-off must propagate within one token-refresh cycle (AC 6).
- Depends on Story 56.1 (`app_metadata` role source) for both the enforcement exemption logic and the admin login role check. Land 56.1 first.
- Future extension (out of scope, note in code): per-role granularity (e.g., admins-only MFA) — schema field naming should not preclude it.
- The 30-min inactivity re-auth on clinical views is a separate existing mechanism — untouched.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. With the default (OFF) policy, every login and session flow in all four apps is behaviorally identical to today; patient OTP is untouched in all modes. The only new behavior appears for orgs whose admin explicitly enables MFA. All pre-existing auth tests pass (updated only where they encoded the dead bypass/theater code); `pnpm typecheck` clean.

### Project Structure Notes

**New files:** hub `middleware/enforceMfaPolicy.ts`, `__tests__/mfa-policy.test.ts`; admin `components/settings/SecurityPolicySection.tsx` + tests; per-spoke `components/settings/MfaEnrollment.tsx`; Supabase migration (MCP) for `org_security_policies`.
**Files to modify:** hub `init.ts`, `admin.ts` (policy endpoints); admin login/settings/AuthGuard; 3 spoke login + settings pages; CLAUDE.md; 16 locale message files (new `security.mfa.*` keys, 4 apps × 4 locales parity).

### References

- [Source: docs/system-audit-2026-09-23.md#2-systemic-critical-findings] — C-SYS-6 evidence (bypass lines, fake ceremonies, wrong-claim check)
- [Source: apps/admin-portal/src/app/[locale]/login/page.tsx:59-191] — existing MFA scaffolding + bugs
- [Source: _bmad-output/implementation-artifacts/audit-remediation-overview-2026-09-23.md] — decision log (this story records decision: MFA = admin-controlled org toggle, default OFF)
- [Source: CLAUDE.md#auth--sessions] — policy line to amend per Task 5

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
- 2026-09-23: Story re-scoped per user decision — MFA changed from mandatory-for-all-staff to an org-level Admin Portal feature toggle, disabled by default, with server-side conditional enforcement.
