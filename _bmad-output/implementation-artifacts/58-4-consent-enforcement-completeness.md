# Story 58.4: Consent Enforcement Completeness (lab.* + medication-statement.*)

Status: review

## Story

As a privacy officer,
I want consent checks applied consistently to every Hub procedure that returns patient-derived data — closing the verified gaps in `lab.ts` and `medication-statement.ts`,
so that a patient's consent withdrawal actually stops data flow on every surface, not just the ones that happen to have the middleware.

## Acceptance Criteria

1. **Given** the consent policy already enforced via `enforceConsentMiddleware` on patient/encounter/medication/diagnostic-report procedures, **when** lab procedures returning patient-derived data execute (`verifyPatient`, `getOrderPatientDetails`, order/specimen/result reads that carry patient fields), **then** the same consent policy applies — with any deliberate exemption (e.g., safety-critical result delivery) explicitly documented in code and in CLAUDE.md.
2. **Given** `medicationStatement.listActive` and `listActiveForPharmacist`, **when** called, **then** consent is checked before returning a patient's medication list (this feeds the dispense interaction check — see exemption analysis in Dev Notes).
3. **Given** a consent-withdrawn patient, **when** any newly-gated procedure is called, **then** the denial is audited and returns the same error shape the existing consent-gated procedures use (clients already handle it).
4. **Given** the middleware inconsistency where `getOrderPatientDetails`/`pullOrders`/`pullDispenseMonitoringEvents` skip `enforceVerifiedOrg()`/`enforceEntitlement('LAB_LITE')` that sibling procedures apply, **then** the middleware stack is made uniform across `lab.ts`.
5. **Zero regression:** consented patients' flows are entirely unchanged (order pipeline, dispensing, verification); all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded for consented care.

## Tasks / Subtasks

- [x] **Task 1: Consent gap analysis → policy matrix** (AC: 1, 2)
  - [x] 1.1 Enumerate every `lab.ts` + `medication-statement.ts` procedure returning patient-derived data; classify: consent-gated | exempt-with-rationale (write the rationale). Safety analysis is REQUIRED for: result submission/delivery (blocking a result on withdrawn consent may be clinically wrong — likely exempt as safety-critical), and `listActiveForPharmacist` (blocking meds data degrades the interaction check — if exempted, the check must surface "consent-limited data" rather than silently passing; coordinate with Story 57.2).
  - [x] 1.2 Present the matrix's contentious rows (result delivery, dispense meds) as a decision point before wiring, per project Decision Points rule.
- [x] **Task 2: Apply middleware** (AC: 1, 2, 3, 4)
  - [x] 2.1 Wire `enforceConsentMiddleware` per the approved matrix; unify `enforceVerifiedOrg`/`enforceEntitlement` across `lab.ts` (`:534-537` vs `:675-677`, `:1867-1868`, `:2058-2059`).
  - [x] 2.2 Audit events on consent denials (opaque IDs).
- [x] **Task 3: Tests + regression verification** (AC: 3, 5)
  - [x] 3.1 Per-procedure tests: withdrawn consent → denial (or documented exemption behavior); active consent → unchanged output.
  - [x] 3.2 Full hub suite + lab-lite/pharmacy integration flows with a consented fixture; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-HUB-7 [V]** (audit §3): grep-verified — `enforceConsentMiddleware` in `patient.ts:816`, `encounter.ts:196,596`, `medication.ts:288,475,822`, `diagnostic-report.ts:37,150`; **zero hits in `lab.ts` and `medication-statement.ts`**. **M-HUB-14 [A]**: lab middleware stack inconsistency. Also audit §9 workflow 4 (consent captured and priority-1 synced, but not enforced on lab surfaces).

### Architecture

- Consent is an append-only priority-1 ledger (`consent.ts:94-149`) — the enforcement data is fresh; this story only closes application gaps.
- CLAUDE.md: "Consent grants/withdrawals … affect data access enforcement at the Hub API layer" — this story is that sentence made true for the remaining routers.
- The data-min tiers (Story 58.2) and consent are independent layers — both apply.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. For consented patients (the overwhelming case), every flow is byte-identical. Only withdrawn/expired-consent access changes, per the approved matrix. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `apps/hub-api/src/trpc/routers/lab.ts`, `medication-statement.ts`; CLAUDE.md (documented exemptions).
**New files:** `apps/hub-api/src/__tests__/consent-enforcement-lab.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#3-hub-api-appshub-api] — H-HUB-7, M-HUB-14
- [Source: apps/hub-api/src/trpc/routers/encounter.ts:196] — middleware application pattern
- [Source: packages/shared-types/src/fhir/consent.ts] — consent data model

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Decision #3 Resolution (consent matrix)
| Procedure | Decision | Rationale |
|---|---|---|
| `lab.verifyPatient`, `lab.getOrderPatientDetails`, `medicationStatement.listActive` | GATED | patient-derived PHI reads |
| `lab.submitResult` + result-delivery/specimen pipeline | EXEMPT | safety-critical — a completed result must reach the clinician regardless of consent state |
| `lab.searchPatients/checkDuplicates/registerPatient` | EXEMPT | pre-consent MPI/registration |
| `lab.pullOrders`, `pullDispenseMonitoringEvents` | EXEMPT (bulk) | data-minimized (name+age), per-patient consent enforced at drill-in |
| `medicationStatement.listActiveForPharmacist` | EXEMPT-but-SURFACED | returns `consentLimited: true` (no statements) → dispense check shows "consent-limited" + requires override, mirroring UNAVAILABLE (never silent-pass) |

### Completion Notes List
- **Task 1/2:** applied per the matrix. Used in-body `checkConsent()` (not `enforceConsentMiddleware`) on lab procedures — the middleware keys on `input.patientId`, but per Rule #7 no lab procedure receives a real patient UUID as input (only orderId / blind ref / National-ID query), so the middleware would 400; the in-body guard (same pattern as the file-download routes) runs right after the UUID resolves. Denials audited (opaque IDs). Unified `enforceVerifiedOrg`+`enforceEntitlement('LAB_LITE')` across `getOrderPatientDetails`/`pullOrders`/`pullDispenseMonitoringEvents` (M-HUB-14). `listActiveForPharmacist` gained `consentLimited` surfaced through `active-medications.ts` → `DispensingConfirmationModal` (folds into 57.2/57.4's degraded-check path).
- **Task 3:** withdrawn/active/consent-limited tests across lab + medication-statement + pharmacy; existing suites given a `consents` fixture so consented flows stay byte-identical.
- CLAUDE.md gained a "Consent Enforcement at the Hub API Layer" section with the full matrix.

### Verification (combined tree)
hub-api + pharmacy-lite + lab-lite typecheck clean; hub full suite **1788 pass, 0 fail** (incl. new consent tests); pharmacy full suite **1135 pass, 0 fail**.

### File List
Modified — `apps/hub-api/src/trpc/routers/{lab,medication-statement}.ts`, `types/app-router.d.ts`, lab/medication-statement/diagnostic tests; `apps/pharmacy-lite/src/lib/active-medications.ts`, `src/components/pharmacy/DispensingConfirmationModal.tsx`, tests; `CLAUDE.md`.

### Change Log
- 2026-09-23: Story 58.4 implemented (Wave 4), verified, integrated. Decision #3 matrix resolved (result delivery + registration + bulk feeds exempt; listActiveForPharmacist exempt-but-surfaced). Status → review.
