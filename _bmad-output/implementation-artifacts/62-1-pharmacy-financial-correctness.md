# Story 62.1: Pharmacy Financial Correctness (taxRate Units, Refunds/Cash-Out, Drawer Integrity)

Status: review

## Story

As a pharmacy owner,
I want the financial layer to be arithmetically and operationally correct — one taxRate convention everywhere, refund/void and cash-out flows that exist, drawer attribution that can't race, and invoice numbering that can't collide,
so that retail totals are right (not off by 100×) and every drawer close reconciles.

## Acceptance Criteria

1. **Given** `pharmacySettings.taxRate`, **then** ONE convention (percent — e.g., `10` means 10%) applies across POS, procurement, and wholesale: `invoice-service.ts:57` (currently `subtotal * taxRate`, fraction) and `InvoiceSummary.tsx:72` (`taxRate * 100` display) are converted; a settings migration normalizes stored values; a cross-domain unit test locks the convention.
2. **Given** a completed sale, **when** a refund/void is required, **then** a refund flow exists: negative invoice/void record, stock re-entry decision (restock vs quarantine), drawer `cashOut` written, audit trail. `cashOut` is no longer a never-written field, and drawer close reconciles after payouts.
3. **Given** `recordPayment`, **then** the cash drawer is resolved ONCE inside the transaction and the sync payload is built from the final object — hub and local copies can no longer disagree on `cashDrawerId` (`payment-service.ts:40-72`); `recordCreditPayment` no longer assumes cash unconditionally and handles the no-account case explicitly (`:171-189`).
4. **Given** concurrent tabs, **then** invoice numbers cannot duplicate (`getNextInvoiceNumber` made atomic via a Dexie tx counter — `invoice-service.ts:9-27`).
5. **Zero regression:** normal sale, payment, drawer open/close, procurement PO totals, and wholesale order totals all produce the same (correct-convention) results; historical invoices/POs render correctly (stored `taxRate` values on historical records are interpreted per their stored convention — migration marks them); all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [x] **Task 1: taxRate standardization** (AC: 1) — audit every `taxRate` consumer (`invoice-service.ts`, `InvoiceSummary.tsx`, `fulfillment-store.ts:286-288`, `po-totals.ts:46`, `wholesale/NewOrderPage.tsx:254`, `NewPurchaseOrderPage.tsx:97`, `NewSupplierInvoicePage.tsx:90`); convert POS to percent; migrate settings + annotate historical rows with `taxRateConvention` (or normalize with recompute guard); cross-domain test: same settings value → consistent tax in all three domains.
- [x] **Task 2: Refund/void + cash-out** (AC: 2) — design the minimal flow (void same-day vs refund-with-reason); write `cashOut` on payouts; drawer expected-balance formula already reads it (`cash-drawer-service.ts:34` init-only today); stock re-entry per pharmacist choice; audit events; i18n'd UI on the POS page.
- [x] **Task 3: Drawer/payment races** (AC: 3) — single in-tx drawer resolution; sync entry from final object (or the existing two-phase `buildEncryptedSyncEntry` pattern post-tx); credit-payment method handling.
- [x] **Task 4: Invoice numbering** (AC: 4) — atomic counter table in Dexie tx (the `.reverse().sortBy()` read pattern was verified correct — the race is between read and write).
- [x] **Task 5: Tests + regression verification** (AC: 5) — money-math property tests (integer minor units respected); concurrent-tab simulation for numbering/drawer; full pharmacy suite; manual sale→refund→drawer-close reconciliation; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **C-PHARM-2 [V]** (100× taxRate discrepancy — both formulas verified in source; same settings value feeds both domains), **M-PHARM-5 [A]** (drawer race, no refund/cash-out, credit-payment assumptions, invoice numbering), audit §6.

### Architecture

- Money math: keep `Math.round` integer-minor-unit discipline; no floats introduced.
- Refund scope is MINIMAL viable (void + refund with drawer effect) — full returns-management is future scope; record what's deferred.
- Controlled-substance dispense gating (M-PHARM-8) is a PRD question, NOT in this story — tracked in the remediation overview as a decision item.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Sales, drawer sessions, PO/wholesale totals, payables, and statements all keep working; historical documents display unchanged amounts. The only arithmetic that changes is the currently-WRONG domain per the convention fix — and that change is the point, verified by the cross-domain test. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `lib/pos/invoice-service.ts`, `lib/pos/payment-service.ts`, `lib/pos/cash-drawer-service.ts`, `components/pos/InvoiceSummary.tsx`, settings storage, procurement/wholesale pages (prefill semantics).
**New files:** `src/__tests__/tax-convention.test.ts`, `src/__tests__/refund-flow.test.ts`, refund UI components.

### References

- [Source: docs/system-audit-2026-09-23.md#6-pharmacy-lite-appspharmacy-lite] — C-PHARM-2, M-PHARM-5
- [Source: apps/pharmacy-lite/src/lib/procurement/po-totals.ts:46] — percent-convention reference implementation

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Debug Log References
`pnpm -F pharmacy-lite typecheck` → clean. `pnpm -F pharmacy-lite test` → 189 files, 1153 passed, 0 failed (combined tree).

### Completion Notes List
- **Task 1 (taxRate convention):** ONE percent convention across POS/procurement/wholesale. `invoice-service.ts` POS tax converted from fraction to percent (`subtotal * taxRate / 100`); `InvoiceSummary.tsx` display no longer double-scales. Idempotent settings-scale migration + historical rows annotated with `taxRateConvention` so stored documents render at their original amounts. `tax-convention.test.ts` locks same-settings-value → identical tax across all three domains.
- **Task 2 (refund/void + cash-out):** new `lib/pos/refund-service.ts` (void same-day vs refund-with-reason) writes drawer `cashOut`, applies restock-vs-quarantine stock re-entry per pharmacist choice, emits audit events; `RefundVoidPanel.tsx` i18n'd POS UI (wired into `PosPage.tsx`). `cashOut` is now written (was init-only) so drawer close reconciles after payouts. Dexie **v24** adds the `refunds` store.
- **Task 3 (drawer/payment races):** `recordPayment` resolves the cash drawer ONCE inside the tx and builds the sync payload from the final object — hub/local `cashDrawerId` can no longer drift; `recordCreditPayment` handles payment method + the no-account case explicitly (no unconditional cash assumption).
- **Task 4 (invoice numbering):** atomic Dexie-tx counter — concurrent tabs can no longer collide on invoice numbers.
- **Respects 58.3:** invoice-line descriptions stay stripped of patient-linked med-text (resolve via `catalogItemId` at render, never re-persisted).
- New audit actions/resource types (`INVOICE_VOIDED`/`INVOICE_REFUNDED`/`CASH_DRAWER_PAYOUT`; `CASH_DRAWER`/`REFUND`) added to `packages/shared-types/src/enums.ts`.

### File List
New — `apps/pharmacy-lite/src/lib/pos/refund-service.ts`, `src/lib/pos/audit.ts`, `src/components/pharmacy/pos/RefundVoidPanel.tsx`, `src/__tests__/{tax-convention,refund-flow,pos-concurrency}.test.ts`.
Modified — pharmacy `lib/pos/{invoice-service,payment-service,types}.ts`, `lib/db.ts` (v24), `lib/pos-db.ts`, `lib/inventory/types.ts`, `lib/phi-cleanup.ts`, `components/pharmacy/pos/{InvoiceSummary,PosPage}.tsx`, `messages/{en,ar,prs,ps}.json`; `packages/shared-types/src/enums.ts`.

### Change Log
- 2026-09-24: Story 62.1 implemented (Wave 5 batch 2), verified, integrated. ONE percent taxRate convention; refund/void + cash-out; drawer race fixed; atomic invoice numbering. Dexie v24. Status → review.
