-- Migration 035: Pharmacy prices — per-facility retail prices for drugs
-- Written by Pharmacy-Lite when pharmacists update drug pricing.
-- Queried by Pharmopedia for the real-time pharmacy finder.

CREATE TABLE IF NOT EXISTS pharmacy_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atc_code TEXT NOT NULL REFERENCES drug_catalog(atc_code) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES pharmacy_facilities(id) ON DELETE CASCADE,
  retail_price NUMERIC(10, 2) NOT NULL CHECK (retail_price >= 0),
  stock_signal TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (stock_signal IN ('in_stock', 'low_stock', 'out_of_stock')),
  dose_form TEXT,
  quantity INTEGER,
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(atc_code, facility_id, dose_form)
);

CREATE INDEX IF NOT EXISTS pharmacy_prices_atc_code_idx ON pharmacy_prices (atc_code);
CREATE INDEX IF NOT EXISTS pharmacy_prices_facility_id_idx ON pharmacy_prices (facility_id);

ALTER TABLE pharmacy_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacy_prices_service_all ON pharmacy_prices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY pharmacy_prices_authenticated_read ON pharmacy_prices
  FOR SELECT TO authenticated USING (true);
