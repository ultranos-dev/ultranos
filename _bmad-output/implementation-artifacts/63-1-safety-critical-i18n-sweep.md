# Story 63.1: Safety-Critical i18n Sweep & Hardcoded-String Guard

Status: review

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

- [x] **Task 1: Pharmacy safety strings** (AC: 1) — `PharmacyScannerView` fraud/key-revoked/already-dispensed/offline warnings + buttons keyed (mostly the pre-existing `prescription` namespace); `FulfillmentChecklist` + skip-to-content. `AllergyBanner` was already fully keyed (story refs stale) — display behavior untouched (Safety Rule #4). +11 keys ×4 (parity 1730×4). New `scanner-safety-rtl-snapshots.test.tsx` (LTR-en + RTL-ar).
- [x] **Task 2: OPD consent modal** (AC: 2) — `ConsentRenewalModal` fully keyed + rebuilt on ui-kit `Dialog` (behavior-identical: same props/fields/validation/`/consent.renew` submit path/reachability), skip-to-content keyed. +17 keys ×4. New behavior suite. `consentExpiryDate` gap NOT expanded.
- [x] **Task 3: Admin sweep** (AC: 3) — merge/users-create/audit/EventBrowser(+`ACTION_GROUP_LABELS`)/AllUsersTab/AuthGuard/SessionTimer/ExportButton/PatientComparisonTable/MergePreview/patient-detail keyed; new shared `pagination` namespace + admin-local `date-locale.ts` (locale-aware `toLocaleString`). +~144 keys ×4.
- [x] **Task 4: Lab transport + stragglers** (AC: 4) — `ActiveTransportCard`/`CourierPickupScreen`/`CourierDeliveryScreen` (8 TODOs cleared, `transport.*`) + `PaymentForm`/`LabHeader`/`DonorReportReview`. +~60 keys ×4.
- [x] **Task 5: Lint guard** (AC: 5) — custom `no-hardcoded-ui-string` eslint rule in `packages/config-eslint/rules/` (no new dep; Latin+Arabic-script detection, numeral/symbol allowlist). **Ratcheting** (Decision): enforced as `error` on exactly the 22 keyed files now — repo-wide would fail on a large pre-existing backlog (`pnpm lint` already exits 1 on hundreds of unrelated pre-existing errors); future i18n stories widen the glob. CI wiring unchanged (runs via `pnpm lint`).
- [x] **Task 6: Regression verification** (AC: 6) — pharmacy 1159, opd 1472, admin 334, lab 3970 — 0 failures; parity OK all namespaces; typecheck clean; new RTL snapshots pass.

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
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Debug Log References
Typecheck (4 apps) clean; pharmacy 1159, opd 1472, admin 334, lab 3970 — 0 failures; parity OK (pharmacy 1730 / opd 1308 / admin 1202 / lab 3441 keys ×4); `no-hardcoded-ui-string` violations = 0 on the enforced surface, guard demonstrably fires on an injected literal.

### Completion Notes List
- **Lint guard is RATCHETING (Decision, accepted):** enforced on the 22 Story-63.1-keyed files, not repo-wide — the four apps carry a large pre-existing un-keyed backlog and `pnpm lint` already fails on hundreds of unrelated pre-existing errors; repo-wide enforcement would fail builds on untouched files. In-code note directs future i18n stories to widen the `files` glob to `apps/*/src/**/*.tsx`.
- **Consent modal:** migrated to ui-kit `Dialog` (`hideClose` + `ModalHeader`, mirroring `BookingModal`); same interface/fields/validation/submit/reachability — behavior verified by the new suite.
- **Custom rule:** `no-hardcoded-ui-string.js` flags `JSXText` + user-facing attrs (`aria-label`/`placeholder`/`title`/`alt`/`label`) containing Latin OR Arabic letters; allowlists numerals/symbols/technical attrs/`code|pre|kbd|samp`. Route-segment globs (`[locale]`/`(app)`) had to be escaped (an unescaped pattern silently never matched — caught in verification).
- **Native-speaker review flagged (ar/prs/ps machine-draft):** pharmacy `prescription.fraudWarning*`/`keyRevoked*`/`alreadyDispensedElsewhere`/`globalCheckUnavailable*`/`verificationUnavailable*`; lab `transport.delivery.stabilityWarning{Red,Amber}`; opd consent method/witness labels + `renewError`. ICU plurals also need review.
- **Snapshot integration note:** the 2 legit `FulfillmentChecklist` snapshot refreshes (keyed `days` line) were regenerated at integration after an over-broad churn-discard; verified green. All other touched `__snapshots__` were CRLF-only and excluded.

### File List
New — `packages/config-eslint/rules/no-hardcoded-ui-string.js` (+test), `apps/admin-portal/src/lib/date-locale.ts`, `apps/pharmacy-lite/src/__tests__/scanner-safety-rtl-snapshots.test.tsx`, `apps/opd-lite/src/__tests__/consent-renewal-modal.test.tsx`.
Modified — 16 message files (`{pharmacy,opd,admin,lab}-lite ... ` × `en/ar/prs/ps`); pharmacy `PharmacyScannerView.tsx`/`FulfillmentChecklist.tsx`/`(app)/layout.tsx`; opd `ConsentRenewalModal.tsx`/`(app)/layout.tsx`; admin `merge/page.tsx`/`users/create/page.tsx`/`audit/page.tsx`/`EventBrowser.tsx`/`AllUsersTab.tsx`/`AuthGuard.tsx`/`SessionTimer.tsx`/`ExportButton.tsx`/`PatientComparisonTable.tsx`/`MergePreview.tsx`/`patients/[patientId]/page.tsx`; lab `ActiveTransportCard.tsx`/`CourierPickupScreen.tsx`/`CourierDeliveryScreen.tsx`/`PaymentForm.tsx`/`LabHeader.tsx`/`DonorReportReview.tsx`; `packages/config-eslint` base config; test-harness assertion updates + FulfillmentChecklist snapshot.

### Change Log
- 2026-09-24: Story 63.1 implemented (Wave 6 batch 2), verified, integrated. Safety-critical strings keyed ×4 across all apps; consent modal → ui-kit Dialog; custom ratcheting hardcoded-string eslint rule; RTL safety-banner snapshots. Status → review. ar/prs/ps flagged for native-speaker review.
