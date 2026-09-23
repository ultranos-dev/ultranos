# Story 62.2: Hub & Admin Enterprise Hardening (Injection, Pagination, RBAC Granularity, Sessions, Jobs)

Status: ready-for-dev

## Story

As a platform operator serving enterprise clients,
I want the remaining medium-severity hub/admin robustness gaps closed — PostgREST filter injection, unbounded pulls, the admin.ts monolith, single-binary-ADMIN RBAC, mount-only session caps, password-setting onboarding, silent merge-search failures, and the KYC OCR key exposure,
so that the platform behaves predictably and least-privileged at enterprise scale.

## Acceptance Criteria

1. **Given** admin search inputs containing PostgREST metacharacters (commas, parens), **when** `.or()` filters are built, **then** inputs pass through `sanitizeFilterValue` (the helper `patient.ts:16-22` already uses) at `admin.ts:1159-1160` and `:2527-2528` — and a sweep confirms no other unsanitized `.or()` interpolations exist in hub routers.
2. **Given** `sync.pull` for a patient with a large history, **then** results are cursor-paginated per table with a documented page contract the spokes consume, and the ~20 per-table queries run concurrently — no more unbounded single-shot pulls.
3. **Given** the RBAC model, **then** ADMIN is split into at least SUPERADMIN vs ORG_ADMIN (facility-admin scope per the Epic 27 tenancy decisions): patient merge, cross-org audit reading, and ADMIN-creation become SUPERADMIN-scoped (or org-scoped per the decision matrix), enforced hub-side in `rbac.ts` + affected procedures, reflected in admin-portal gating.
4. **Given** an admin session, **then** the 4h cap is enforced continuously (timer/interval → sign-out, not mount-only `AuthGuard.tsx:60-66`), an inactivity timeout exists, and `middleware.ts` gains a defense-in-depth auth check for app routes.
5. **Given** staff onboarding, **then** invite/setup-link is the only path (admins no longer set initial passwords — `users/create/page.tsx:33,90`; the existing `setupLink` mechanism becomes mandatory), and the merge wizard's duplicate-search failure renders an error state — never a false "no duplicates found" (`merge/page.tsx:130-132`).
6. **Given** OPD KYC document OCR, **then** images route through a Hub proxy endpoint (server-held Google credentials; the `NEXT_PUBLIC_` Vision API key is removed from the client bundle), and displayed confidence comes from real API word-level confidence — not synthetic regex-indexed values compared against a real-looking threshold.
7. **Given** hub background jobs, **then** each documented job has retry-with-backoff and a dead-letter/alert path (no fire-and-forget cron bodies), and `admin.ts` is split into domain modules (mechanical re-export split — no behavior change) so per-procedure org-scoping is reviewable.
8. **Zero regression:** all admin flows, spoke pulls, KYC verification UX, and background jobs behave identically for authorized users at current scale; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded (the RBAC split maps every existing admin to a role preserving their current legitimate access — migration mapping documented).

## Tasks / Subtasks

- [ ] **Task 1: Injection sweep** (AC: 1) — apply `sanitizeFilterValue`; grep-audit all `.or(` template interpolations across routers; tests with hostile inputs.
- [ ] **Task 2: sync.pull pagination** (AC: 2) — cursor contract (per-table `updated_at`/id keyset); parallelize queries; spoke clients updated (coordinate with Story 59.2's shared client); large-history fixture test.
- [ ] **Task 3: RBAC granularity** (AC: 3) — decision matrix (SUPERADMIN vs ORG_ADMIN capabilities) presented per project Decision Points rule, then: `rbac.ts` roles, procedure gates (merge/audit/user-creation), admin-portal page/action gating, existing-admin migration mapping. Depends on Story 56.1 (claims location).
- [ ] **Task 4: Sessions + middleware** (AC: 4) — continuous cap timer + inactivity timeout + `middleware.ts` auth check; `SessionTimer` becomes enforcing at 0.
- [ ] **Task 5: Onboarding + merge search** (AC: 5) — invite-only createUser (hub `admin.ts:2734-2738` drops password param path); merge search error surfacing.
- [ ] **Task 6: KYC OCR proxy** (AC: 6) — hub `POST /api/ocr/kyc` (auth + rate limit + no image persistence beyond processing); `apps/opd-lite/src/lib/ocr.ts:46-58` re-pointed; real confidence from Vision response replaces `ocr.ts:122-124` synthetics vs the 0.85 threshold (`kyc/page.tsx:41`).
- [ ] **Task 7: Jobs + monolith split** (AC: 7) — inventory `src/jobs/`; add retry/backoff + failure alerting (reuse cron-lock/CRON_SECRET patterns); split `admin.ts` (8,326 lines) into `admin/` domain files with a barrel preserving the router path — zero route changes.
- [ ] **Task 8: Regression verification** (AC: 8) — full hub + admin suites; spoke pull round-trip with pagination; KYC manual check; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **M-HUB-1 [A]** (injection), **M-HUB-5 [A]** (unbounded pull), **M-ADM-3/4/5/6-partial [A]** (session cap, binary ADMIN, password onboarding, merge false-empty), **M-OPD-3 [A]** (KYC key + synthetic confidence), **M-HUB-12 [A]** (jobs), **L-HUB admin.ts monolith [A]** — audit §3/§4/§7.

### Architecture

- The RBAC split must align with the Epic 27 locked decisions (shared-schema RLS, provider-agnostic billing) — read that memory/story context before the matrix.
- admin.ts split is MECHANICAL (same procedures, same paths) — behavior-diff must be empty; the payoff is reviewability for the residual org-scoping risk the audit flagged.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Every admin retains their legitimate capabilities under the mapped role; pulls return the same data (paginated); KYC verification still works end-to-end; jobs keep their schedules. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** hub `admin.ts` (→ `admin/` split), `sync.ts`, `rbac.ts`, `jobs/*`; admin-portal `AuthGuard.tsx`, `middleware.ts`, `SessionTimer.tsx`, `users/create/page.tsx`, `merge/page.tsx`; opd `lib/ocr.ts`, `kyc/page.tsx`; new hub OCR route.
**New files:** `apps/hub-api/src/__tests__/{filter-injection,sync-pull-pagination,rbac-granularity}.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#3-hub-api-appshub-api] — M-HUB-1/5/12
- [Source: docs/system-audit-2026-09-23.md#7-admin-portal-appsadmin-portal] — M-ADM-3..6
- [Source: apps/hub-api/src/trpc/routers/patient.ts:16-22] — sanitizeFilterValue helper

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
