-- POS PHI sync: Invoice / Payment / LedgerEntry on the org-scoped B1/B2 pattern.
-- FIRST PHI-bearing org-scoped sync. PHI columns invoice_items (Invoice line items
-- w/ medication descriptions) + ledger_note (patient-ledger free text) are ENCRYPTED
-- at rest by the Hub's randomizedFields mechanism (added to packages/crypto server config).
-- patient_id is an opaque reference (plaintext, clinical precedent). Money = BIGINT
-- minor units; tax_rate NUMERIC (a rate). patient_ledger_entries is named distinctly
-- from wholesale customer_ledger_entries.

CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  patient_id     TEXT,                                 -- opaque ref, nullable (walk-in), plaintext
  dispense_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,   -- opaque id refs, plaintext
  invoice_items  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- PHI (med descriptions) — ENCRYPTED via randomizedFields
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
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_invoices" ON invoices TO service_role USING (true) WITH CHECK (true);

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
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(org_id);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_payments" ON payments TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS patient_ledger_entries (
  id               TEXT PRIMARY KEY,
  patient_id       TEXT NOT NULL,                       -- opaque ref, plaintext
  type             TEXT NOT NULL,
  amount           BIGINT NOT NULL DEFAULT 0,
  invoice_id       TEXT,
  ledger_note      TEXT,                                -- PHI free-text — ENCRYPTED via randomizedFields
  created_by       TEXT NOT NULL,
  ledger_timestamp TIMESTAMPTZ NOT NULL,
  org_id           UUID NOT NULL,
  hlc_timestamp    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patient_ledger_entries_org ON patient_ledger_entries(org_id);
ALTER TABLE patient_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_patient_ledger_entries" ON patient_ledger_entries TO service_role USING (true) WITH CHECK (true);
