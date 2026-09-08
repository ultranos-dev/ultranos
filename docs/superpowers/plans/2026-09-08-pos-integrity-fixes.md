# POS Integrity Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close two verified POS integrity gaps from the audit: (1) a cash payment must be blocked when no cash drawer is open (currently records an orphaned cash payment with no `cashDrawerId`, breaking reconciliation); (2) a patient credit charge must respect the account's `creditLimit` (currently never checked) — plus make the limit settable + visible so enforcement isn't inert.

**Design / current state (verified):**
- `recordPayment` (`src/lib/pos/payment-service.ts:38-43`): `if (method === 'cash') { const openDrawer = ...; if (openDrawer) { payment.cashDrawerId = openDrawer.id } }` — NO else; a cash payment with no open drawer proceeds with `cashDrawerId` undefined.
- Credit charge branch (`:71-102`): creates a `charge` LedgerEntry + increments `PatientAccount.balance` (or creates the account at `:93-101`) — never checks `creditLimit`.
- `PatientAccount { id, patientId, balance, creditLimit? }` (`src/lib/pos/types.ts:64-68`); money = integer minor units. `patient-account-service.ts` has NO update/set function. `PatientAccountsPage.tsx` has a per-account detail view (`selectedPatientId`; balance shown at ~:136; a credit-payment input at ~:169).
- (Out of scope, deferred — bigger than a "fix": the Unverified-Dispenses `dispenseReview` Hub router does NOT exist at all — `.list` + `.updateStatus` are both missing; that's a new Hub feature + review data-model, not a small fix.)

**Architecture:** two small, client-side integrity guards + a minimal credit-limit setter/display. All optional-safe (a cash payment with a drawer, or a charge under/without a limit, behaves exactly as today). Throwing rejects the operation atomically (Dexie txn rollback); the caller (PaymentForm) already surfaces errors.

**Tech Stack:** Next.js/Dexie/Vitest (pharmacy-lite).

## Global Constraints

- **Money = integer minor units** (balance/amount/creditLimit); UI setter major→minor via `Math.round(x*10^minorUnits)`, display via the page's `fmt`/`formatAmount`.
- **Fail-loud, atomic:** guards `throw` a clear Error; the credit-limit check runs so the whole `recordPayment` txn rolls back on violation (no partial charge). Error copy via i18n (add keys × 4 locales).
- **Backward-compatible:** cash payment WITH an open drawer unchanged; a charge with NO `creditLimit` set (undefined) is always allowed (enforcement only when a limit is set).
- **Layout/token/RTL/i18n standards** for the UI additions; no PHI in logs (POS is patient-linked but the guard messages carry no PHI).
- **NO-COMMIT mode.**

---

### Task 1: Enforce open cash drawer for cash payments

**Files:** Modify `src/lib/pos/payment-service.ts`; Test `src/__tests__/` (the existing payment-service/pos test — find it, e.g. `payment-service.test.ts`).

- [ ] **Step 1: Write the failing test** — `recordPayment({ method:'cash', ... })` with NO open cash drawer in `db.cashDrawers` → REJECTS (throws) and does NOT add a payment/ledger row. And a cash payment WITH an open drawer still succeeds + sets `cashDrawerId` (regression). Reuse the existing test harness (db reset + encryption key).
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test payment` → FAIL (no throw today).
- [ ] **Step 3: Implement** — in the pre-transaction cash block (`:38-43`): resolve the open drawer and `if (!openDrawer) throw new Error(<i18n or clear message>)` BEFORE building the sync entry / entering the txn (so nothing is persisted). Keep the existing `payment.cashDrawerId = openDrawer.id` assignment. (The in-txn block at `:57-69` can stay; it will always find the drawer now.) Non-cash payments unaffected.
- [ ] **Step 4: Run to verify PASS** — green (+ existing payment tests).
- [ ] **Step 5: Commit** (skip in NO-COMMIT).

---

### Task 2: Enforce + set + display patient credit limit

**Files:** Modify `src/lib/pos/payment-service.ts` (enforce), `src/lib/pos/patient-account-service.ts` (add setter), `src/components/pharmacy/pos/PatientAccountsPage.tsx` (display + setter UI); Tests alongside; i18n × 4 locales.

- [ ] **Step 1: Write failing tests:**
  - **Enforce (payment-service test):** given an existing `PatientAccount` with `creditLimit` set and `balance` such that `balance + amount > creditLimit`, `recordPayment({ method:'credit', patientId, amount, ... })` REJECTS (throws) and adds NO charge/ledger row (txn rolled back). A charge that stays within the limit, or an account with NO `creditLimit`, still succeeds.
  - **Setter (patient-account-service test):** `setPatientCreditLimit(patientId, limitMinor)` updates the account's `creditLimit` (creates the account if none exists).
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test payment patient-account` → FAIL.
- [ ] **Step 3: Implement:**
  - `payment-service.ts` credit branch: after loading `existingAccount` (`~:83-86`), before creating the charge/updating balance, `if (existingAccount?.creditLimit != null && existingAccount.balance + amount > existingAccount.creditLimit) throw new Error(<credit-limit-exceeded message>)`. (Throw inside the txn → atomic rollback; recordPayment rejects.)
  - `patient-account-service.ts`: add `export async function setPatientCreditLimit(patientId: string, creditLimit: number): Promise<void>` — update the existing account's `creditLimit` (+ `lastActivityAt`), or create a `{ id, patientId, balance: 0, creditLimit, lastActivityAt }` if none. (Follows the account-create shape in payment-service.)
  - `PatientAccountsPage.tsx` account-detail view: DISPLAY the `creditLimit` (via `fmt`, next to balance; show "—"/"No limit" when unset) and add a small **setter** — a major-unit number input + a "Set limit" button → `setPatientCreditLimit(patientId, parseMajorToMinor(x))` then refresh. Layout/token/RTL standards; i18n keys.
  - i18n: add the enforce error + the credit-limit label/set-button/placeholder keys to ALL FOUR message files (native where straightforward; English fallback OK — note it).
- [ ] **Step 4: Run to verify PASS** — green (+ existing pos/account tests).
- [ ] **Step 5: Commit** (skip).

---

### Task 3: Verification

**Files:** none.

- [ ] **Step 1: Suites** — `pnpm -F pharmacy-lite test payment patient-account PatientAccounts` → new cases + existing green (only the known `DatabaseClosedError` flake tolerated).
- [ ] **Step 2: i18n parity** — the new keys present in all 4 message files.
- [ ] **Step 3: Typecheck** — `pnpm -F pharmacy-lite typecheck` → no NEW errors in `payment-service.ts` / `patient-account-service.ts` / `PatientAccountsPage.tsx` (pre-existing noise out of scope).
- [ ] **Step 4: Final review** — cash guard blocks orphaned cash (atomic, non-cash unaffected); credit-limit enforced atomically only when set (charge within/no-limit unaffected); setter persists; display correct; money minor-units; i18n parity; no PHI in logs/errors.

---

## Self-Review

**Coverage:** cash-drawer enforce → T1; credit-limit enforce+set+display → T2; verify → T3. **Backward-compat:** cash-with-drawer + charge-within/no-limit unchanged; guards only reject the unsafe cases. **Type consistency:** `creditLimit?: number` (minor units) read in the enforce check (T2 payment-service) ↔ written by `setPatientCreditLimit` (T2 service) ↔ displayed/edited (T2 page). Atomic rejection via Dexie txn rollback. **Placeholder scan:** none. dispenseReview explicitly deferred (bigger than a fix).
