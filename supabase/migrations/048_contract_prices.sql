-- Migration 048: contract_prices table
-- Org-scoped wholesale contract pricing, RLS enabled.

CREATE TABLE IF NOT EXISTS contract_prices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID        NOT NULL,
  catalog_item_id  TEXT        NOT NULL,
  price            BIGINT      NOT NULL,
  created_by       TEXT        NOT NULL,
  org_id           UUID        NOT NULL,
  hlc_timestamp    TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, customer_id, catalog_item_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_prices_org_id
  ON contract_prices (org_id);

CREATE INDEX IF NOT EXISTS idx_contract_prices_org_customer
  ON contract_prices (org_id, customer_id);

-- Enable Row Level Security
ALTER TABLE contract_prices ENABLE ROW LEVEL SECURITY;

-- service_role full access (used by Hub API)
CREATE POLICY "service_role_all_contract_prices"
  ON contract_prices
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
