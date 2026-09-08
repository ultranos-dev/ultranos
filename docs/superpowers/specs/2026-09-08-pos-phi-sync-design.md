# POS (Invoice/Payment/LedgerEntry) PHI Sync (Design)

**Date:** 2026-09-08
**Apps:** `apps/hub-api/` (ingestion + encryption) + `apps/pharmacy-lite/` (pull) + `packages/crypto/` (field config) + `supabase/migrations/`
**Status:** Approved design — pending implementation plan
**Epic:** Hub Inventory/Order Backend. The **first PHI-bearing** org-scoped sync — registers the POS domain (`Invoice`, `Payment`, `LedgerEntry`) with **field-level encryption** on PHI columns and per-write audit, per the CLAUDE.md healthcare safety rules.

## 1. Overview

`Invoice`/`Payment`/`LedgerEntry` are **enqueued today but ORPHANED** on the Hub. Unlike the prior operational slices (plaintext, non-PHI), POS carries PHI: an Invoice links a patient to **medication names** (line-item descriptions); a LedgerEntry has a patient + a free-text note. This slice registers all three on the org-scoped pattern **with field-level AES-256-GCM encryption on the PHI columns** (reusing the Hub's `randomizedFields` mechanism that already encrypts clinical columns) and relies on `sync.push`'s existing per-op audit for the PHI-write audit trail.

**In scope:** add 2 POS PHI column names to the crypto `randomizedFields` config; 3 Hub tables (migration); 3 flatteners (with PHI-specific column renames); map/org-scoped/RBAC; client pull registration with reversals. No new client enqueue (all three already enqueue).

**Out of scope:** `PatientAccount`/`CashDrawer` (not the focus; can follow the same pattern later); patient-scoped pull (POS is org-owned financial data — org-scoped with encrypted PHI content is the chosen posture); a bespoke POS audit event (the generic `sync.push` SYNC/SUCCESS audit already covers every op).

## 2. Locked decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Scope | Org-scoped tables (financial, org-owned) with **PHI content encrypted at rest**; `patient_id` stored **plaintext** as an opaque reference | Mirrors the clinical precedent (encounters store `subject_id` plaintext; the CONTENT — diagnosis/med text — is what's encrypted). The patient↔medication linkage lives only in the encrypted `invoice_items`. |
| D2 | Encryption mechanism | Add PHI column names to `randomizedFields` in `packages/crypto/src/server-crypto.ts`; `db.toRow` auto-encrypts them (AES-256-GCM, `v1:` ciphertext), `db.fromRows` auto-decrypts | Same mechanism the clinical tables use (`medication_text`, `dosage_instruction`, `soap_*`). No bespoke crypto. |
| D3 | Which columns encrypt | **`invoice_items`** (Invoice line items — contains med descriptions) and **`ledger_note`** (LedgerEntry free-text). Everything else plaintext. | Those are the PHI-content columns. Financial totals + opaque refs (patient_id, invoice_id, dispense_ids) are references/amounts, treated as the clinical precedent treats patient refs. |
| D4 | Column names (avoid global clash + reserved words) | Invoice `items` → column **`invoice_items`** (NOT `items` — that name is a non-PHI JSONB on PurchaseOrder/GoodsReceipt/StockTransfer/StockCount; adding `items` to `randomizedFields` would wrongly encrypt those). LedgerEntry `note` → **`ledger_note`**. Payment `timestamp` → **`payment_timestamp`**; LedgerEntry `timestamp` → **`ledger_timestamp`** (reserved word; per the `CustomerLedgerEntry.entryTimestamp` precedent) | Field-name-driven encryption is GLOBAL by column name — PHI columns must have POS-unique names so only POS rows are encrypted. |
| D5 | Encrypted-column SQL types | `invoice_items` **JSONB** (holds the `"v1:…"` ciphertext string scalar), `ledger_note` **TEXT** | Precedent: `dosage_instruction JSONB` (encrypted), `medication_text TEXT` (encrypted). |
| D6 | Money | Amounts (subtotal/tax_amount/total/amount_paid/amount_due/payment amount/ledger amount) = integer minor units → **BIGINT**. `tax_rate` (a percentage, not money) → **NUMERIC**. | Matches the money-as-minor-units convention. |
| D7 | Audit | **Reuse** the existing `sync.push` per-op SYNC/SUCCESS audit event (actor, resourceType, resourceId, source) | CLAUDE.md Rule 6 ("audit every PHI write") is satisfied by the machinery that already audits every push op — verified in `sync.ts`. |
| D8 | Client enqueue | **No change** — Invoice/Payment/LedgerEntry already enqueue via `buildEncryptedSyncEntry` (create + update/void). | Slice is Hub ingestion + pull only. |
| D9 | Table name | POS ledger table is **`patient_ledger_entries`** (distinct from wholesale `customer_ledger_entries`) | Two different ledgers; avoid confusion + collision. |

## 3. Client data shapes (`apps/pharmacy-lite/src/lib/pos/types.ts`)

- **Invoice**: `id, invoiceNumber, patientId?, dispenseIds[], items[] {catalogItemId, stockBatchId, description(=med name, PHI), quantity, unitPrice, lineTotal}, subtotal, taxRate, taxAmount, total, amountPaid, amountDue, status, createdBy, createdAt, voidedBy?, voidedAt?, voidReason?, hlcTimestamp`.
- **Payment**: `id, invoiceId, method, amount, reference?, cashDrawerId?, receivedBy, timestamp` (no `hlcTimestamp` field — enqueue supplies HLC).
- **LedgerEntry**: `id, patientId, type, amount, invoiceId?, note?(PHI), createdBy, timestamp` (no `hlcTimestamp` field).

Dexie tables `db.invoices` / `db.payments` / `db.ledgerEntries` already exist.

## 4. Crypto config (`packages/crypto/src/server-crypto.ts`)

Add to `randomizedFields`: `'invoice_items'`, `'ledger_note'`. Rebuild `@ultranos/crypto` so the Hub (`@ultranos/crypto/server`) picks up the new list. (The existing `server-crypto.test.ts` uses `toContain` assertions — additions don't break it; add assertions for the two new fields.)

## 5. Hub migration `054_pos_phi_sync.sql` (Supabase MCP; confirm next free number)

```sql
CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  patient_id     TEXT,                                   -- opaque ref, nullable (walk-in), plaintext
  dispense_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,     -- opaque id refs, plaintext
  invoice_items  JSONB NOT NULL DEFAULT '[]'::jsonb,     -- PHI (med descriptions) — ENCRYPTED via randomizedFields
  subtotal       BIGINT NOT NULL DEFAULT 0,
  tax_rate       NUMERIC NOT NULL DEFAULT 0,
  tax_amount     BIGINT NOT NULL DEFAULT 0,
  total          BIGINT NOT NULL DEFAULT 0,
  amount_paid    BIGINT NOT NULL DEFAULT 0,
  amount_due     BIGINT NOT NULL DEFAULT 0,
  status         TEXT NOT NULL,
  created_by     TEXT NOT NULL,
  voided_by      TEXT,
  voided_at      TIMESTAMPTZ,
  void_reason    TEXT,
  org_id         UUID NOT NULL,
  hlc_timestamp  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  invoice_id        TEXT NOT NULL,
  method            TEXT NOT NULL,
  amount            BIGINT NOT NULL DEFAULT 0,
  reference         TEXT,
  cash_drawer_id    TEXT,
  received_by       TEXT NOT NULL,
  payment_timestamp TIMESTAMPTZ NOT NULL,
  org_id            UUID NOT NULL,
  hlc_timestamp     TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS patient_ledger_entries (
  id               TEXT PRIMARY KEY,
  patient_id       TEXT NOT NULL,                        -- opaque ref, plaintext
  type             TEXT NOT NULL,
  amount           BIGINT NOT NULL DEFAULT 0,
  invoice_id       TEXT,
  ledger_note      TEXT,                                 -- PHI free-text — ENCRYPTED via randomizedFields
  created_by       TEXT NOT NULL,
  ledger_timestamp TIMESTAMPTZ NOT NULL,
  org_id           UUID NOT NULL,
  hlc_timestamp    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- idx_<t>_org on org_id; RLS + service_role all policy for each.
```

## 6. Hub ingestion (`apps/hub-api/`)

- `resource-mappers.ts` — 3 flatteners (register in `mappers`):
```ts
function flattenInvoice(p) { return { id, invoiceNumber, patientId, dispenseIds: p.dispenseIds ?? [], invoiceItems: p.items ?? [], subtotal, taxRate, taxAmount, total, amountPaid, amountDue, status, createdBy, voidedBy, voidedAt, voidReason } }  // items -> invoiceItems (encrypted col)
function flattenPayment(p) { return { id, invoiceId, method, amount, reference, cashDrawerId, receivedBy, paymentTimestamp: p.timestamp } }  // timestamp -> paymentTimestamp
function flattenLedgerEntry(p) { return { id, patientId, type, amount, invoiceId, ledgerNote: p.note, createdBy, ledgerTimestamp: p.timestamp } }  // note -> ledgerNote (encrypted), timestamp -> ledgerTimestamp
```
`db.toRow` snake-cases → `invoice_items`/`ledger_note` are in `randomizedFields` → auto-encrypted. `dispense_ids`/`invoice_items` JSONB; the rest plaintext.
- `sync.ts`: `RESOURCE_TABLE_MAP` += `Invoice:'invoices', Payment:'payments', LedgerEntry:'patient_ledger_entries'`; `ORG_SCOPED_TABLES` += those 3.
- `rbac.ts`: `ROLE_PERMISSIONS.PHARMACIST` += `'Invoice','Payment','LedgerEntry'`.
- Pull + audit: no change (generic org-scoped branch; existing per-op SYNC audit covers POS).

## 7. Client pull (`apps/pharmacy-lite/wholesale-pull.ts`)

- Add `'Invoice'`,`'Payment'`,`'LedgerEntry'` to the pulled-types list; `tableFor`: `Invoice→db.invoices`, `Payment→db.payments`, `LedgerEntry→db.ledgerEntries`.
- `toClientRow` reversals (the Hub `db.fromRows` already DECRYPTED the PHI columns before the client sees them):
  - `Invoice`: `invoiceItems → items`.
  - `Payment`: `paymentTimestamp → timestamp`.
  - `LedgerEntry`: `ledgerNote → note`, `ledgerTimestamp → timestamp`.

## 8. Testing

**Crypto:** `server-crypto.test.ts` asserts `invoice_items` + `ledger_note` are in `randomizedFields`.
**Hub (`sync.test.ts`):** each of the 3 pushes lands in its table, org stamped; **encryption assertion** — the value written to `invoice_items`/`ledger_note` is a `v1:` ciphertext (NOT the plaintext med description / note); column renames (`payment_timestamp`, `ledger_timestamp`); Payment/LedgerEntry map correctly. (Reuse the real encryption path or assert the stored column is ciphertext.)
**Hub audit:** a POS push emits a SYNC audit event (reuse the existing audit-assertion pattern).
**Client pull (`wholesale-pull.test.ts`):** each of the 3 pulled rows lands in the right Dexie table; `invoiceItems→items`, `paymentTimestamp→timestamp`, `ledgerNote→note`+`ledgerTimestamp→timestamp`.
**Live (after build):** push an Invoice + Payment + LedgerEntry; DB query confirms `invoice_items`/`ledger_note` are `v1:` ciphertext at rest (PHI encrypted), financial totals plaintext, `patient_id` plaintext, org stamped; and the sync round-trips (pull decrypts back).

## 9. Reuse & safety

Reuses the proven org-scoped recipe + the Hub's existing `randomizedFields` encryption + the existing per-op audit. The only genuinely new element is registering 2 PHI columns for encryption (config + rebuild) with POS-unique names so encryption stays scoped to POS. PHI content is never at rest in plaintext on the Hub; `patient_id` is an opaque reference (plaintext, clinical precedent); every push is audited. No PHI in logs (error paths log `.message`/opaque ids only — preserve that).
