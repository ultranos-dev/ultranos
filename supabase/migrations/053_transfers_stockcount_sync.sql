-- Transfers & Stock-Count org-scoped sync: register StockTransfer + StockCount on
-- the B1/B2 pattern. Non-PHI operational data; quantity-based (no money columns).
-- All client id / location-id columns are TEXT (client ids are strings; seed/imported
-- data uses non-UUID strings). org_id stays UUID (stamped from context). items = JSONB.

CREATE TABLE IF NOT EXISTS stock_transfers (
  id                 TEXT PRIMARY KEY,
  from_location_id   TEXT NOT NULL,
  from_location_name TEXT NOT NULL,
  to_location_id     TEXT NOT NULL,
  to_location_name   TEXT NOT NULL,
  status             TEXT NOT NULL,
  items              JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_by       TEXT NOT NULL,
  requested_at       TIMESTAMPTZ NOT NULL,
  approved_by        TEXT,
  approved_at        TIMESTAMPTZ,
  shipped_at         TIMESTAMPTZ,
  received_at        TIMESTAMPTZ,
  received_by        TEXT,
  cancelled_reason   TEXT,
  org_id             UUID NOT NULL,
  hlc_timestamp      TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_org ON stock_transfers(org_id);
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_stock_transfers" ON stock_transfers TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS stock_counts (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL,
  status               TEXT NOT NULL,
  counted_by           TEXT NOT NULL,
  items                JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_variance_items INTEGER NOT NULL DEFAULT 0,
  started_at           TIMESTAMPTZ NOT NULL,
  completed_at         TIMESTAMPTZ,
  org_id               UUID NOT NULL,
  hlc_timestamp        TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_counts_org ON stock_counts(org_id);
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_stock_counts" ON stock_counts TO service_role USING (true) WITH CHECK (true);
