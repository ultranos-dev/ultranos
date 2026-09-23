# Story 63.1: Safety-Critical i18n Sweep & Hardcoded-String Guard

Status: ready-for-dev

## Story

As an Arabic/Dari/Pashto-speaking clinician or pharmacist,
I want every user-facing string — especially the highest-stakes safety warnings — served from translation keys in all four locales, with a CI guard preventing new hardcoded strings,
so that a pharmacist in Herat never sees "DO NOT dispense — Fraud Warning" in a language they may not read.

## Acceptance Criteria

1. **Given** pharmacy-lite's scanner and fulfillment surfaces, **then** the ~20 hardcoded safety strings in `PharmacyScannerView.tsx:224-628` ("Fraud Warning", "Prescriber Key Revoked", "DO NOT dispense", "Already Dispensed Elsewhere", etc.), `AllergyBanner.tsx:35,64`, `FulfillmentChecklist.tsx:117`, and "Skip to content" are keyed and translated in en/ar/prs/ps (maintaining the existing 1,645-key × 4-locale parity).
2. **Given** OPD, **then** `ConsentRenewalModal.tsx:81-141` is fully keyed (its `TODO: t('consent.…')` comments resolved), rebuilt on the ui-kit `Dialog` instead of the hand-rolled fixed overlay, and the `(app)/layout.tsx:24` "Skip to content" is keyed.
3. **Given** admin-portal, **then** the ~60 never-keyed strings are keyed: merge wizard (`merge/page.tsx` ~15 strings incl. "Type MERGE below…"), `users/create/page.tsx` (~20), audit page/EventBrowser headers + `ACTION_GROUP_LABELS`, pagination controls, `AuthGuard.tsx:140-142` "Access Denied", `SessionTimer`, `ExportButton`, `AllUsersTab` badges — the 972-key × 4-locale files grow accordingly; `toLocaleString('en-GB')` (`patients/[patientId]/page.tsx:42`) becomes locale-aware.
4. **Given** lab-lite, **then** the transport module (`ActiveTransportCard.tsx`, `CourierPickupScreen.tsx`, `CourierDeliveryScreen.tsx` — 8 of the app's 16 TODOs) plus the scattered strings (`finance/PaymentForm.tsx:97`, `sidebar/LabHeader.tsx:20`, `reports/DonorReportReview.tsx:268`) are keyed in all four locales.
5. **Given** CI, **then** a hardcoded-string guard (scoped `react/jsx-no-literals` or equivalent lint with an allowlist for numerals/symbols) fails builds introducing new literal UI strings in the four apps.
6. **Zero regression:** every keyed string renders identically in English; RTL rendering of the new keys is snapshot-tested; no layout breaks from longer translations (spot-check the safety banners); all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: Pharmacy safety strings** (AC: 1) — extract → `scanner.*`/`allergy.*` namespaces; translate ×4; RTL snapshots for the fraud/revoked/dispensed warning states.
- [ ] **Task 2: OPD consent modal** (AC: 2) — keys + ui-kit `Dialog` migration (behavior-identical: same fields, validation, submit path); note the modal is reachable via `ConsentExpiryBanner` whose `consentExpiryDate` sourcing gap is tracked separately — do not expand scope.
- [ ] **Task 3: Admin sweep** (AC: 3) — batch-key by page; shared pagination-strings namespace; date-locale helper.
- [ ] **Task 4: Lab transport + stragglers** (AC: 4) — `useTranslations('transport.*')`; clear the 8 TODOs.
- [ ] **Task 5: Lint guard** (AC: 5) — configure + baseline (existing violations fixed by Tasks 1-4; any remainder explicitly allowlisted with a tracking note); wire to CI.
- [ ] **Task 6: Regression verification** (AC: 6) — full 4-app suites incl. new RTL snapshots; visual pass over the safety banners in ar; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **M-PHARM-7 [A]**, **M-OPD-6 [A]**, **Admin Low #1 [A]**, **M-LAB-9 [A]**, audit §10 Theme 7: "i18n is complete in the message files and incomplete in the code." Translation quality for ar/prs/ps should be flagged for native-speaker review — machine-draft + review checklist in the PR.

### Architecture

- Keys follow each app's existing namespace conventions; message files must keep exact parity across the four locales (tests exist for parity in some apps — extend where missing).
- RTL: new banner keys need the standard LTR+RTL snapshot pair (CLAUDE.md testing requirement).

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. English UX is string-for-string identical; components behave identically (the consent modal migration is visual-parity-checked); nothing is removed. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** listed components + 16 locale message files (4 apps × 4 locales); eslint configs; CI workflow.
**New files:** RTL snapshot tests for pharmacy warning states and consent modal.

### References

- [Source: docs/system-audit-2026-09-23.md#10-cross-cutting-themes] — Theme 7
- [Source: apps/pharmacy-lite/src/components/pharmacy/PharmacyScannerView.tsx:224-628]
- [Source: packages/ui-kit/src/components/ui/dialog] — Dialog to adopt in the consent modal

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
