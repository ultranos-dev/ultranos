# Story 57.1: Dispense Allergy Gate Restoration (Pharmacy ← Hub Allergy Wiring)

Status: review

## Story

As a pharmacist dispensing a prescription,
I want the fulfillment screen to show the patient's real allergy record (including allergies recorded in OPD) and to clearly distinguish "no known allergies" from "allergy status unknown",
so that the dispense-time ALLERGY_MATCH block actually protects patients instead of silently running against empty data.

## Acceptance Criteria

1. **Given** a prescription QR is scanned, **when** the fulfillment flow loads, **then** the patient is resolved from the QR's `pat` reference — from the local `db.patients` store AND a Hub allergy fetch when online — and their allergies feed `runDispenseInteractionCheck`.
2. **Given** allergy data could not be obtained (offline with no local record, Hub error), **when** the fulfillment screen renders, **then** an amber "Allergy status unknown — verify verbally with the patient" banner shows — **never** the green "No Known Allergies (NKA)" card — and completing the dispense requires the same override-with-reason path as an UNAVAILABLE interaction check.
3. **Given** an `activePatient` exists in the store from a previous search, **when** a scanned prescription's `pat` ref does not match that patient, **then** the stale patient's data is NOT used — the mismatch is detected, the store is cleared, and the patient is re-resolved from the prescription.
4. **Given** the dashboard patient-search flow selects a patient, **when** navigation to `/scan` occurs, **then** it uses locale-aware SPA navigation (`router.push`) — no `window.location.href` full reload that wipes the in-memory store — and `clearPatient()` is called on fulfillment completion/reset.
5. **Given** a patient has an OPD-recorded allergy matching a scanned medication, **when** the dispense check runs (online), **then** ALLERGY_MATCH blocks with the existing override machinery.
6. **Given** the new Hub allergy endpoint for pharmacists, **then** it is consent-gated, audited (Rule #6), returns only what the check needs (substance codes/display + criticality), and is registered in the CI contract test (Story 59.2 when available).
7. **Given** CLAUDE.md's allergy-display testing rule, **then** snapshot tests assert the allergy section renders first, in red (destructive tokens), uncollapsed — including the new unknown state (amber) — in LTR and RTL.
8. **Zero regression:** the existing QR verification chain (expiry → KRL → cached key → Ed25519), interaction-check override flow, offline dispensing, and all pre-existing pharmacy tests pass unchanged; no feature or functionality is removed or degraded; `pnpm typecheck` passes.

## Tasks / Subtasks

- [x] **Task 1: Hub allergy endpoint for dispensing** (AC: 5, 6)
  - [x] 1.1 Add `allergy.listForDispense` (or extend `allergy.list` authz) in `apps/hub-api/src/trpc/routers/allergy.ts`: pharmacist role, patient resolved from prescription ref, consent-gated via `enforceConsentMiddleware`, audit event emitted, `enforceEntitlement('PHARMACY_LITE')`.
- [x] **Task 2: Patient resolution in the scan flow** (AC: 1, 3)
  - [x] 2.1 In `apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx` (`loadPrescriptions` call at `:135`): resolve patient by `prescription.pat` — local `db.patients` lookup + Hub allergy fetch (Task 1) merged; set into the fulfillment context explicitly keyed to the prescription.
  - [x] 2.2 Add identity assertion in `FulfillmentChecklist.tsx:79` / `fulfillment-store.ts:80-110`: allergies are only consumed when their source patient ref matches `prescription.pat`; on mismatch, clear and re-resolve.
  - [x] 2.3 Call `clearPatient()` (defined `stores/patient-store.ts:13`, currently never called) on fulfillment completion, cancellation, and new-scan.
- [x] **Task 3: Unknown-allergy-state UI** (AC: 2, 7)
  - [x] 3.1 Extend `AllergyBanner.tsx:20-68` with a third state: `unknown` (amber, `bg-destructive/10`-style semantics but warning-toned, never collapsed, i18n'd in en/ar/prs/ps) distinct from `none` (NKA) and `present`. `undefined` allergies map to `unknown`, never NKA.
  - [x] 3.2 Wire `DispensingConfirmationModal.tsx:52` so `unknown` state requires the override-with-reason path (mirror the UNAVAILABLE interaction-check flow in `dispense-interaction-check.ts`).
- [x] **Task 4: Navigation fix** (AC: 4)
  - [x] 4.1 `DashboardActionHub.tsx:17-24`: replace `window.location.href = '/scan'` with locale-aware `router.push` (note the current call also drops the locale prefix).
- [x] **Task 5: Tests** (AC: 5, 7, 8)
  - [x] 5.1 Snapshot: allergy-first/red/uncollapsed, LTR+RTL, all three states (currently zero AllergyBanner tests exist — audit-verified).
  - [x] 5.2 Integration: scan → patient resolution → OPD-sourced allergy blocks dispense; stale-patient mismatch cleared; offline+no-local-record → unknown banner + override required.
- [x] **Task 6: Regression verification** (AC: 8)
  - [x] 6.1 Full pharmacy-lite suite (179 files) + hub allergy router tests; manual: QR happy path, offline dispense, override flow unchanged; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **C-SYS-3 [V]** (audit §2) — the single most dangerous clinical finding: `loadPrescriptions` never sets a patient; the only `setActivePatient` call is followed by a store-wiping full reload; `undefined` allergies render as NKA; pharmacy never calls hub allergy endpoints; no patient↔prescription identity check; stale-patient wrong-allergy risk. The interaction-check machinery itself (`runDispenseInteractionCheck`) is verified excellent — this story fixes its *input*.

### Architecture

- QR payloads contain no demographics by design (CLAUDE.md) — the `pat` ref is the join key. Offline resolution uses the local registry; online adds the Hub fetch. Cache fetched allergies locally (encrypted Dexie) keyed by patient ref with a staleness marker, so a recently-fetched record still protects an offline re-dispense.
- Model the unknown-state override on the existing `_ultranos.reviewOverride` pattern (≥10-char reason + supervisor) — reuse, don't fork.
- OPD's `AllergyBanner` (which correctly handles the "hub-says-allergies-exist-but-not-synced" state) is the reference implementation.
- Coordinate with Story 58.4 (consent enforcement) so the new endpoint lands consent-gated from day one.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. QR verification, the interaction-check pipeline, override logging, offline dispensing, and the fulfillment checklist all behave identically except for the corrected allergy input and the new unknown state. All 179 pre-existing pharmacy test files pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `PharmacyScannerView.tsx`, `FulfillmentChecklist.tsx`, `DispensingConfirmationModal.tsx`, `AllergyBanner.tsx`, `DashboardActionHub.tsx`, `stores/patient-store.ts`, `stores/fulfillment-store.ts`, `lib/dispense-interaction-check.ts`, hub `allergy.ts`.
**New files:** `apps/pharmacy-lite/src/lib/patient-resolution.ts`, `apps/pharmacy-lite/src/__tests__/allergy-banner.test.tsx`, `.../scan-fulfillment-allergy.test.tsx`, `apps/hub-api/src/__tests__/allergy-dispense-endpoint.test.ts`.
**i18n:** add `allergyUnknown.*` keys to all four locale files (1,645-key parity must be maintained).

### References

- [Source: docs/system-audit-2026-09-23.md#2-systemic-critical-findings] — C-SYS-3 full evidence chain
- [Source: apps/pharmacy-lite/src/lib/dispense-interaction-check.ts] — Rule #3-compliant checker (the pattern to feed, not change)
- [Source: apps/opd-lite/src/components/patient/AllergyBanner*] — reference allergy display incl. not-synced state
- [Source: CLAUDE.md#⛔-healthcare-safety-rules] — Rules #2, #3, #4

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — completion & combined verification.

### Debug Log References
None. (Account spend-limit interrupted the first pass post-implementation; resumed in the same worktree for verification.)

### Completion Notes List
- **Task 1:** New hub procedure `allergy.listForDispense` (`allergy.ts`) — PHARMACIST/ADMIN, `enforceVerifiedOrg`, `PHARMACY_LITE` entitlement, `enforceConsentMiddleware('AllergyIntolerance')`, PHI_READ audit; returns only `substanceText/Code/System` + `criticality`. `enforceConsent.ts` gained the `AllergyIntolerance → PRESCRIPTIONS` scope mapping (coordinate with Story 58.4).
- **Task 2:** `patient-resolution.ts` resolves by `prescription.pat` (local `db.patients` + hub `allergy.listForDispense`, merged, with an encrypted staleness-marked cache); `PharmacyScannerView` sets the resolved patient explicitly; `fulfillment-store` asserts the ref matches `prescription.pat`; `clearPatient()` now called on complete/error/reset/new-scan (was never called).
- **Task 3:** `AllergyBanner` has three states — active (red/destructive), **unknown** (`undefined`/`null` → amber `bg-warning`, `role=alert`, never NKA), NKA (`[]` only). `DispensingConfirmationModal` folds the unknown state into the existing override path (≥10-char reason + supervisor), same as an UNAVAILABLE interaction check.
- **Task 4:** `DashboardActionHub` uses locale-aware `router.push('/${locale}/scan')` (was `window.location.href`, which wiped the in-memory store and dropped the locale).
- **Task 5/6:** New tests — `allergy-banner.test.tsx` (allergy-first/red/uncollapsed, LTR+RTL, all three states), `scan-fulfillment-allergy.test.tsx` (OPD-sourced allergy blocks; stale-patient mismatch cleared; offline+no-record → unknown + override), hub `allergy-dispense-endpoint.test.ts`. Regression fixes exposed by verification: DB bumped to **v22** (encrypted `patientAllergyCache` table, added to `phi-cleanup` PHI_TABLES); 4 pre-existing tests updated for the verno bump; 2 stale FulfillmentChecklist RTL snapshots regenerated to show the amber banner (the spec-mandated change: 0 "NKA" / 4 "unknown").
- **Note:** the hub allergy query relies on the consent gate for authz (mirrors existing `allergy.list`); flagged for the contract test.

### Verification (combined tree)
- `pnpm -F pharmacy-lite typecheck` + `pnpm -F hub-api typecheck` → clean.
- `pnpm -F pharmacy-lite test` → 179 files, 1096 pass, 0 fail (co-resident with 56.1 auth changes).
- hub `allergy-dispense-endpoint.test.ts` (10) + new pharmacy allergy tests → pass; hub full suite 1679 pass.

### File List
Modified — `apps/hub-api/src/trpc/routers/allergy.ts`, `src/trpc/middleware/enforceConsent.ts`; `apps/pharmacy-lite/src/components/pharmacy/{AllergyBanner,DashboardActionHub,DispensingConfirmationModal,FulfillmentChecklist,PharmacyScannerView}.tsx`, `src/lib/db.ts`, `src/lib/phi-cleanup.ts`, `src/stores/fulfillment-store.ts`, `messages/{en,ar,prs,ps}.json`, `src/__tests__/PharmacyScannerView.test.tsx`, `src/__tests__/__snapshots__/FulfillmentChecklist.test.tsx.snap`, plus phi-cleanup/schema test verno fixes.
New — `apps/pharmacy-lite/src/lib/patient-resolution.ts`, `src/__tests__/allergy-banner.test.tsx` (+ snapshot), `src/__tests__/scan-fulfillment-allergy.test.tsx`, `apps/hub-api/src/__tests__/allergy-dispense-endpoint.test.ts`.

### Change Log
- 2026-09-23: Story 57.1 implemented (Wave 1). All 6 tasks complete + combined-tree verified. New `allergy.listForDispense`; pharmacy DB → v22. Status → review.
