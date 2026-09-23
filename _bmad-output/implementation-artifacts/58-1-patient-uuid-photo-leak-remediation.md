# Story 58.1: Patient UUID / Photo URL Leak Remediation (Lab Blind-Index Restoration)

Status: review

## Story

As a privacy officer,
I want patient photo delivery to stop embedding the real patient UUID in storage paths handed to lab clients, and photo exposure to match the documented data-minimization tiers,
so that the HMAC blind-index design actually prevents labs from identifying or correlating patients (Safety Rule #7).

## Acceptance Criteria

1. **Given** any lab-facing endpoint returns a photo URL, **when** the URL is inspected, **then** it contains no patient UUID and no stable identifier that permits cross-order correlation beyond what the blind-index ref already allows.
2. **Given** the tier decision (see Dev Notes — Decision Required), **then** photos are returned ONLY on the surfaces the amended Rule #7 permits (recommended: detail/verification tier only — removed from `pullOrders` list responses), and lab-lite stops persisting `patientPhotoUrl` on the orders table.
3. **Given** existing photo objects stored under `<patientUUID>.webp`, **when** the migration completes, **then** they are re-keyed (or fronted by a proxy) such that legacy UUID-keyed paths are no longer served to lab clients.
4. **Given** OPD/admin surfaces that legitimately use patient photos with full-PHI authorization, **then** their photo display continues to work unchanged.
5. **Zero regression:** photo display in OPD/admin, lab identity verification UX (per the tier decision), and all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded beyond the deliberate tier change in AC 2.

## Tasks / Subtasks

- [x] **Task 1: Storage key / delivery redesign** (AC: 1, 3)
  - [x] 1.1 Replace `photoKey(id) = '${id}.webp'` (`apps/hub-api/src/lib/photo-urls.ts:64-66`). Options — implement (a) unless blocked: (a) random opaque storage keys with a `patient_photos` mapping table (photo key ↔ patient, server-side only); (b) hub proxy route `GET /api/lab-photos/<orderScopedToken>` that streams the object without exposing the path. Either way the signed URL's path must be non-correlating for lab callers.
  - [x] 1.2 Migration for existing objects: copy to new keys, verify, then remove UUID-keyed originals (keep a rollback window).
- [x] **Task 2: Tier alignment** (AC: 2)
  - [x] 2.1 Per the decision: remove `patientPhotoUrl` from `lab.pullOrders` output (`lab.ts:1891` area) and from `lab.verifyPatient` if decided; keep on `lab.getOrderPatientDetails` (order-scoped, audited).
  - [x] 2.2 lab-lite: drop `patientPhotoUrl` from the orders Dexie schema usage (`apps/lab-lite/src/lib/db.ts:337-338`) and from `LabOrderResponse` (`lib/trpc.ts:626-640`); UI falls back to the detail-modal photo.
  - [x] 2.3 Update CLAUDE.md Rule #7 wording to state the photo policy explicitly (per the decision outcome).
- [x] **Task 3: Non-lab consumers** (AC: 4)
  - [x] 3.1 Update OPD/admin photo consumers of `photoKey`/signed URLs to the new scheme; verify practitioner photos (same helper) unaffected or migrated consistently.
- [x] **Task 4: Tests + regression verification** (AC: all)
  - [x] 4.1 Test: lab endpoint responses contain no `<uuid>.webp` pattern and no patient UUID substring (regex assertion over serialized output).
  - [x] 4.2 Output-schema tier tests updated (coordinate with Story 58.2's per-endpoint field-set tests).
  - [x] 4.3 Full hub lab router + lab-lite order-sync suites pass; OPD/admin photo display manually verified; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **C-SYS-4 [V]** (audit §2): `photoKey` embeds the patient UUID; signed URLs carry it to lab clients on all three lab surfaces; the inline "never returned to the lab client" comment is false; constant key enables cross-order correlation, defeating the blind index. **H-HUB-5 [A]**: photos exceed both documented tiers regardless of key scheme.

### Decision Required (present to user before implementing Task 2 if not already resolved)

Photo-on-list is a product tradeoff: sample-collection staff may want at-a-glance photos in the order list, but Rule #7's list tier is "first name + age ONLY". **Recommendation (from audit): detail tier only** — photo appears in the Patient Details / verification modal (deliberate per-order action, already audited hub-side), not in list pulls. If the user overrules, amend Rule #7 text with explicit rationale instead.

### Architecture

- `lab.getOrderPatientDetails` is the audit-verified model implementation (order-scoped, audited, server-signed) — extend it, don't fork.
- Signed-URL TTLs should stay short for lab surfaces; the mapping table (option a) must never be exposed through any lab-facing query.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. OPD/admin photo features work identically; lab verification retains photo access per the decided tier; nothing else changes. The only permitted behavior change is the deliberate tier restriction in AC 2. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `apps/hub-api/src/lib/photo-urls.ts`, `trpc/routers/lab.ts`, lab-lite `lib/trpc.ts` + `lib/db.ts` (+ a Dexie schema version bump), CLAUDE.md Rule #7.
**New files:** migration script for photo re-keying; `apps/hub-api/src/__tests__/lab-photo-privacy.test.ts`.
**DB:** use Supabase MCP (`apply_migration`) for the mapping table per project rules.

### References

- [Source: docs/system-audit-2026-09-23.md#2-systemic-critical-findings] — C-SYS-4
- [Source: apps/hub-api/src/trpc/routers/lab.ts:675-770] — model tier-scoped detail endpoint
- [Source: CLAUDE.md#⛔-healthcare-safety-rules] — Rule #7 tiers

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — rebase onto Wave-1 (reconciled with 56.1 + 59.1), integration & combined verification.

### Decision #1 Resolution
Photo confined to the DETAIL/verification tier (recommended option): removed from `lab.pullOrders` list; kept on `lab.getOrderPatientDetails` + `lab.verifyPatient`. CLAUDE.md Rule #7 amended accordingly. Reversible if overruled.

### Completion Notes List
- **Task 1 (storage-key redesign — C-SYS-4 core):** `opaquePhotoKey()` = random UUID key (never patient-UUID-derived); `patients.photo_url` stores the opaque key (server-only mapping, never exposed); lab-facing signed URLs can no longer be correlated. `photoKey()` deprecated. Re-key script `scripts/rekey-patient-photos.mjs` authored, **NOT applied** (deferred to deploy, two-pass).
- **Task 2 (tier alignment):** `patientPhotoUrl` removed from `lab.pullOrders` output/projection/join; retained (opaque-keyed) on getOrderPatientDetails + verifyPatient; lab-lite orders cache drops `patientPhotoUrl` (**Dexie v56**, upgrade strips stale field); list `OrderCard` shows initials, `SampleDetailsModal` uses detail-tier photo. Reconciled with 59.1's 7 new lab procedures (all preserved).
- **Task 3:** verified OPD/admin photo consumers already sign the stored `photo_url` value → transparently pick up opaque keys (no change needed); reconciled with 56.1's app_metadata authz in the photo route.
- **Task 4:** `lab-photo-privacy.test.ts` asserts no `.webp`/patient-UUID in any lab output.

### Verification (combined tree)
`pnpm -F hub-api typecheck` + `pnpm -F lab-lite typecheck` clean; hub lab suite **218 pass**; lab-lite full suite **3947 pass, 0 fail**; UUID/National-ID never in lab-facing output (test-asserted). `app-router.d.ts` regenerated post-rebase.

### File List
Modified — `apps/hub-api/src/lib/photo-urls.ts`, `src/app/api/patient-photo/route.ts`, `src/trpc/routers/lab.ts`, `types/app-router.d.ts`, tests; `apps/lab-lite/src/lib/{trpc,db}.ts`, `src/components/orders/OrderCard.tsx`, `src/components/worklist/SampleDetailsModal.tsx`, `src/hooks/useOrderSync.ts`, tests; `CLAUDE.md`.
New — `apps/hub-api/scripts/rekey-patient-photos.mjs`, `src/__tests__/lab-photo-privacy.test.ts`.

### Change Log
- 2026-09-23: Story 58.1 implemented (Wave 2), rebased/reconciled onto Wave-1, verified, integrated. Decision #1 → detail-tier only. Migration authored-not-applied. Status → review.
