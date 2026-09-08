-- Inventory & Procurement org-scoped sync: register Supplier, PurchaseOrder,
-- GoodsReceipt, StockBatch, StockMovement on the B1/B2 org-scoped pattern.
-- All non-PHI operational data (plaintext columns). Money = integer minor units (BIGINT).
-- org_id stamped by the Hub push loop; hlc_timestamp from the sync op.
-- StockMovement.timestamp -> movement_timestamp (reserved-word avoidance; reversed on pull).
--
-- NOTE: the pharmacy-lite Supplier/PurchaseOrder spoke tables are named pharmacy_*
-- because bare `suppliers`/`purchase_orders` already exist on the Hub with a DIFFERENT,
-- incompatible hub-native schema (total_items not total_cost, contact_email not email,
-- status not is_active, and NO hlc_timestamp). Those pre-existing tables are left
-- untouched; the pharmacy spoke uses its own tables that match the client shape.

CREATE TABLE IF NOT EXISTS pharmacy_suppliers (
  id             UUID PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_name   TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  lead_time_days INTEGER,
  payment_terms  TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  org_id         UUID NOT NULL,
  hlc_timestamp  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_suppliers_org ON pharmacy_suppliers(org_id);
ALTER TABLE pharmacy_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_pharmacy_suppliers" ON pharmacy_suppliers TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS pharmacy_purchase_orders (
  id            UUID PRIMARY KEY,
  supplier_id   UUID NOT NULL,
  supplier_name TEXT NOT NULL,
  status        TEXT NOT NULL,
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_cost    BIGINT NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    TEXT NOT NULL,
  sent_at       TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  org_id        UUID NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_purchase_orders_org ON pharmacy_purchase_orders(org_id);
ALTER TABLE pharmacy_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_pharmacy_purchase_orders" ON pharmacy_purchase_orders TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id                UUID PRIMARY KEY,
  supplier_id       UUID,
  purchase_order_id UUID,
  received_by       TEXT NOT NULL,
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_cost        BIGINT NOT NULL DEFAULT 0,
  notes             TEXT,
  received_at       TIMESTAMPTZ NOT NULL,
  org_id            UUID NOT NULL,
  hlc_timestamp     TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_org ON goods_receipts(org_id);
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_goods_receipts" ON goods_receipts TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS stock_batches (
  id               UUID PRIMARY KEY,
  catalog_item_id  TEXT NOT NULL,
  batch_number     TEXT NOT NULL,
  lot_number       TEXT,
  expiry_date      TEXT NOT NULL,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  cost_price       BIGINT NOT NULL DEFAULT 0,
  selling_price    BIGINT NOT NULL DEFAULT 0,
  zone_id          TEXT,
  supplier_id      UUID,
  goods_receipt_id UUID,
  received_at      TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL,
  location_id      TEXT NOT NULL,
  org_id           UUID NOT NULL,
  hlc_timestamp    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_batches_org ON stock_batches(org_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_catalog ON stock_batches(catalog_item_id);
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_stock_batches" ON stock_batches TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS stock_movements (
  id                 UUID PRIMARY KEY,
  stock_batch_id     UUID NOT NULL,
  catalog_item_id    TEXT NOT NULL,
  type               TEXT NOT NULL,
  quantity           INTEGER NOT NULL,
  reason             TEXT,
  reference_id       TEXT,
  reference_type     TEXT,
  performed_by       TEXT NOT NULL,
  movement_timestamp TIMESTAMPTZ NOT NULL,
  org_id             UUID NOT NULL,
  hlc_timestamp      TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org ON stock_movements(org_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(stock_batch_id);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_stock_movements" ON stock_movements TO service_role USING (true) WITH CHECK (true);
