-- 047: Wholesale sync ingestion tables (B1). Org-scoped; Hub connects as service_role.
CREATE TABLE IF NOT EXISTS wholesale_customers (
  id                 UUID PRIMARY KEY,
  name               TEXT NOT NULL,
  contact_name       TEXT,
  phone              TEXT,
  email              TEXT,
  address            TEXT,
  payment_terms_days INTEGER,
  credit_limit       BIGINT,
  ultranos_org_id    TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  org_id             UUID NOT NULL,
  hlc_timestamp      TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wholesale_customers_org ON wholesale_customers(org_id);
ALTER TABLE wholesale_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_wholesale_customers" ON wholesale_customers TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS sales_orders (
  id            UUID PRIMARY KEY,
  order_number  TEXT NOT NULL,
  customer_id   UUID NOT NULL,
  status        TEXT NOT NULL,
  lines         JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal      BIGINT NOT NULL DEFAULT 0,
  tax_rate      NUMERIC NOT NULL DEFAULT 0,
  tax_amount    BIGINT NOT NULL DEFAULT 0,
  total         BIGINT NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    TEXT NOT NULL,
  fulfilled_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  org_id        UUID NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_org ON sales_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_sales_orders" ON sales_orders TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS customer_ledger_entries (
  id              UUID PRIMARY KEY,
  customer_id     UUID NOT NULL,
  type            TEXT NOT NULL,
  amount          BIGINT NOT NULL,
  sales_order_id  UUID,
  note            TEXT,
  created_by      TEXT NOT NULL,
  entry_timestamp TIMESTAMPTZ NOT NULL,
  org_id          UUID NOT NULL,
  hlc_timestamp   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_org ON customer_ledger_entries(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger_entries(customer_id);
ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_customer_ledger_entries" ON customer_ledger_entries TO service_role USING (true) WITH CHECK (true);
