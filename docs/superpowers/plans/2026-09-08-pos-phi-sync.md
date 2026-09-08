# POS (Invoice/Payment/LedgerEntry) PHI Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Register the POS domain (`Invoice`, `Payment`, `LedgerEntry`) on the org-scoped B1/B2 sync WITH field-level encryption on the PHI columns (`invoice_items`, `ledger_note`) and per-write audit — the first PHI-bearing org-scoped sync.

**Architecture:** Add 2 POS PHI column names to the crypto `randomizedFields` config (so `db.toRow`/`db.fromRows` auto-encrypt/decrypt them); 3 Hub tables; 3 flatteners with PHI-specific column renames (`items→invoice_items`, `note→ledger_note`, `timestamp→payment_timestamp`/`ledger_timestamp`); map/org-scoped/RBAC; client pull with reversals. No new client enqueue.

**Tech Stack:** Node/tRPC/Supabase (hub-api), Next.js/Dexie/Vitest (pharmacy-lite), `@ultranos/crypto`.

**Spec:** `docs/superpowers/specs/2026-09-08-pos-phi-sync-design.md`

## Global Constraints

- **PHI encryption is field-name-driven + GLOBAL.** Only `invoice_items` + `ledger_note` (POS-unique names) go into `randomizedFields`. NEVER add `items`/`note`/`notes` (shared non-PHI column names — would wrongly encrypt PurchaseOrder/GoodsReceipt/etc.).
- **Column renames** (in the flatteners): Invoice `items → invoiceItems` (→ `invoice_items`, JSONB, ENCRYPTED); LedgerEntry `note → ledgerNote` (→ `ledger_note`, TEXT, ENCRYPTED); Payment `timestamp → paymentTimestamp` (→ `payment_timestamp`); LedgerEntry `timestamp → ledgerTimestamp` (→ `ledger_timestamp`). Pull reverses each.
- **`patient_id` is PLAINTEXT** (opaque reference, clinical precedent); financial amounts plaintext BIGINT (minor units); `tax_rate` NUMERIC; `dispense_ids` plaintext JSONB.
- **Encryption verified LIVE, not in unit tests** — Hub unit tests mock encryption (identity), so the ciphertext-at-rest assertion is a live DB query in T5 (`invoice_items`/`ledger_note` start with `v1:`). Unit tests assert the flattener renames + table + org.
- **Audit** reuses the existing `sync.push` per-op SYNC/SUCCESS event (covers POS) — verified in T5.
- **No PHI in logs** — preserve the opaque-error pattern.
- **DB ops via Supabase MCP only.** Migration applied live. **NO-COMMIT mode.**

---

## File Structure

**Create:** `supabase/migrations/054_pos_phi_sync.sql`.
**Modify:** `packages/crypto/src/server-crypto.ts` (+ `__tests__/server-crypto.test.ts`); `apps/hub-api/src/lib/resource-mappers.ts`, `apps/hub-api/src/trpc/routers/sync.ts`, `apps/hub-api/src/trpc/rbac.ts`, `apps/hub-api/src/__tests__/sync.test.ts`; `apps/pharmacy-lite/src/lib/wholesale/wholesale-pull.ts` (+ test).

---

### Task 1: Crypto config — register the 2 PHI columns + rebuild

**Files:** Modify `packages/crypto/src/server-crypto.ts`, `packages/crypto/src/__tests__/server-crypto.test.ts`

- [ ] **Step 1: Write the failing test** — in `server-crypto.test.ts`, assert `config.randomizedFields` `toContain('invoice_items')` and `toContain('ledger_note')`. Run `pnpm -F @ultranos/crypto test` → FAIL.
- [ ] **Step 2: Implement** — add `'invoice_items'` and `'ledger_note'` to the `randomizedFields` array in `getEncryptionConfig()` (with a comment: POS PHI — Invoice line-item med descriptions; LedgerEntry free-text note). Run → PASS.
- [ ] **Step 3: Rebuild** — `pnpm --filter @ultranos/crypto build` so the Hub (`@ultranos/crypto/server`) picks up the new list. Confirm the built `dist` contains the two fields.
- [ ] **Step 4: Commit** (skip in NO-COMMIT).

**NOTE:** Controller may do this edit + rebuild directly (small shared-package change, like the sync-engine rebuild in the delete-sync slice).

---

### Task 2: Migration `054` — 3 POS tables

**Files:** Create `supabase/migrations/054_pos_phi_sync.sql`

- [ ] **Step 1:** `list_migrations` (confirm `054` free; 048-053 used). Write the 3-table SQL from spec §5 (TEXT id PKs; `patient_id` TEXT nullable on invoices, NOT NULL on patient_ledger_entries; `invoice_items` JSONB; `ledger_note` TEXT; money BIGINT; `tax_rate` NUMERIC; `payment_timestamp`/`ledger_timestamp` TIMESTAMPTZ; `org_id` UUID NOT NULL; `hlc_timestamp` TEXT NOT NULL; `created_at`; `idx_<t>_org`; RLS + `service_role` all policy).
- [ ] **Step 2:** `apply_migration` (name `054_pos_phi_sync`).
- [ ] **Step 3: Verify** via `execute_sql`: 3 tables; `invoices.invoice_items`=jsonb, `patient_ledger_entries.ledger_note`=text, `payments.payment_timestamp` exists, money cols BIGINT, `invoices.patient_id` nullable; `relrowsecurity=true` each.
- [ ] **Step 4: Commit** (skip).

**NOTE:** Controller may run this directly via Supabase MCP.

---

### Task 3: Hub ingestion — 3 flatteners + map + org-scoped + RBAC

**Files:** Modify `resource-mappers.ts`, `sync.ts`, `rbac.ts`; Test `sync.test.ts`.

- [ ] **Step 1: Write failing tests** — add a `describe('sync.push — POS ingestion')` block (reuse the push caller + capture harness). One case each:
  - Invoice → `invoices`, org stamped, `invoiceItems` present (from client `items`), `patientId` present, financial totals present.
  - Payment → `payments`, org stamped, `paymentTimestamp` present (from client `timestamp`), `amount` present.
  - LedgerEntry → `patient_ledger_entries`, org stamped, `ledgerNote` present (from `note`), `ledgerTimestamp` present (from `timestamp`), `patientId` present.
  (Unit tests mock encryption → assert the RENAMED camelCase fields on the captured row; the ciphertext-at-rest is a T5 LIVE check, not here.)
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F hub-api test sync` → FAIL (`Unknown resource type: Invoice`).
- [ ] **Step 3: Implement** the 3 flatteners (spec §6, with the renames), register in `mappers`; `RESOURCE_TABLE_MAP` += `Invoice:'invoices', Payment:'payments', LedgerEntry:'patient_ledger_entries'`; `ORG_SCOPED_TABLES` += those 3; `rbac.ts` PHARMACIST += `'Invoice','Payment','LedgerEntry'`.
- [ ] **Step 4: Run to verify PASS** — `pnpm -F hub-api test sync` → PASS (+ existing green).
- [ ] **Step 5: Commit** (skip).

---

### Task 4: Client pull registration + reversals

**Files:** Modify `wholesale-pull.ts`; Test `wholesale-pull.test.ts`. (Confirm the Dexie table names first: `db.invoices`/`db.payments`/`db.ledgerEntries` — grep `apps/pharmacy-lite/src/lib/db.ts`.)

- [ ] **Step 1: Write failing tests** — add to `wholesale-pull.test.ts`: a pulled Invoice (Hub data with `invoiceItems`) lands in `db.invoices` with `items` present (not `invoiceItems`); a pulled Payment (`paymentTimestamp`) → `db.payments` with `timestamp`; a pulled LedgerEntry (`ledgerNote`+`ledgerTimestamp`) → `db.ledgerEntries` with `note`+`timestamp`; request input contains `'Invoice'`.
- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test wholesale-pull` → FAIL.
- [ ] **Step 3: Implement** — add `'Invoice'`,`'Payment'`,`'LedgerEntry'` to the pulled-types list; `tableFor`: `Invoice→db.invoices`, `Payment→db.payments`, `LedgerEntry→db.ledgerEntries`; `toClientRow` branches: `Invoice` `{invoiceItems, ...rest}→{...rest, items: invoiceItems}`; `Payment` `{paymentTimestamp, ...rest}→{...rest, timestamp: paymentTimestamp}`; `LedgerEntry` `{ledgerNote, ledgerTimestamp, ...rest}→{...rest, note: ledgerNote, timestamp: ledgerTimestamp}`. (The Hub `db.fromRows` already decrypted the PHI columns before the client sees them.)
- [ ] **Step 4: Run to verify PASS** — green (+ existing pull tests).
- [ ] **Step 5: Commit** (skip).

---

### Task 5: Verification (incl. LIVE encryption-at-rest + audit)

**Files:** none.

- [ ] **Step 1: Suites** — `pnpm -F @ultranos/crypto test` (crypto config); `pnpm -F hub-api test sync` (POS ingestion + existing); `pnpm -F pharmacy-lite test wholesale-pull` (pull + existing) — all green.
- [ ] **Step 2: Typecheck** — `pnpm -F pharmacy-lite typecheck` + `pnpm -F hub-api typecheck` → no NEW slice-file errors (pre-existing noise out of scope).
- [ ] **Step 3: LIVE encryption-at-rest (critical — the whole point of the slice)** — if a session is available, push an Invoice + Payment + LedgerEntry (or via a controller-run scripted push), then `execute_sql`: confirm `invoices.invoice_items` and `patient_ledger_entries.ledger_note` start with `'v1:'` (ciphertext, PHI encrypted at rest); `invoices.patient_id` + financial totals are plaintext; org stamped; and a `sync.push` SYNC audit row exists for the POS resourceType. If no session, record deferred BUT still assert the mechanism via the crypto config test + the `randomizedFields` membership (encryption is guaranteed by column-name membership + the clinical precedent).
- [ ] **Step 4: Final review** — dispatch the opus whole-branch reviewer (PHI-critical): confirm PHI columns are encrypted (via randomizedFields membership + no plaintext PHI column), patient_id-as-plaintext-reference is the intended posture, renames symmetric, no PHI in logs, audit covers POS.

---

## Self-Review

**Spec coverage:** §4 crypto config → T1. §5 migration → T2. §6 ingestion → T3. §7 pull → T4. §8 tests → each task + T5 (incl. the live ciphertext check). §7 audit reuse → T5 confirm.

**Placeholder scan:** no TBD/TODO. The live encryption check (T5) is explicit; unit tests assert renames (encryption is mocked in unit tests — stated).

**Type consistency:** `items`↔`invoice_items`↔`invoiceItems`, `note`↔`ledger_note`↔`ledgerNote`, `timestamp`↔`payment_timestamp`/`ledger_timestamp`↔`paymentTimestamp`/`ledgerTimestamp` — each renamed in T3 flatten and reversed in T4 pull (symmetric). Table names `invoices`/`payments`/`patient_ledger_entries` consistent T2 ↔ T3 (map) ↔ T4 (tableFor → db.invoices/db.payments/db.ledgerEntries). `invoice_items`/`ledger_note` in randomizedFields (T1) match the encrypted columns (T2). Migration `054`.
