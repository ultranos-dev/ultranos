-- Migration 040: Branded medications — trade-name products linked to the generic
-- drug_catalog. Two normalized tables:
--   drug_brands               — the trade name (Augmentin) + manufacturer, per generic
--   drug_brand_presentations  — the marketed product/pack (625mg tablet, 14-pack, price)
-- Non-PHI reference data: no field-level encryption. `version` is an epoch-ms sync
-- watermark, bumped on INSERT and UPDATE (so new rows sync immediately).

-- ── drug_brands ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drug_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generic_atc_code TEXT NOT NULL REFERENCES drug_catalog (atc_code) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  manufacturer TEXT NOT NULL DEFAULT '',       -- '' = unknown MAH (keeps UNIQUE upsert clean)
  brand_name_local JSONB NOT NULL DEFAULT '{}', -- { ar, prs, ps }
  rx_status TEXT NOT NULL DEFAULT 'unknown' CHECK (rx_status IN ('rx', 'otc', 'unknown')),
  etl_source TEXT,
  last_etl_refresh TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (generic_atc_code, brand_name, manufacturer)
);

CREATE INDEX IF NOT EXISTS drug_brands_atc_idx ON drug_brands (generic_atc_code);
CREATE INDEX IF NOT EXISTS drug_brands_version_idx ON drug_brands (version);

-- ── drug_brand_presentations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drug_brand_presentations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES drug_brands (id) ON DELETE CASCADE,
  -- Deterministic slug of the identifying attributes — stable conflict target for
  -- idempotent loader upserts (strength|dose_form|pack_size|pack_unit|volume).
  presentation_key TEXT NOT NULL,
  strength TEXT,                  -- "625 mg"
  dose_form TEXT,                 -- tablet / suspension
  route TEXT,
  pack_size INTEGER,              -- 14
  pack_unit TEXT,                 -- tablets
  volume TEXT,                    -- "100 mL"
  gtin TEXT,                      -- barcode
  registration_number TEXT,
  registration_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (registration_status IN ('marketed', 'withdrawn', 'unknown')),
  market TEXT,                    -- country/market of registration
  reference_price NUMERIC(12, 2), -- indicative list price (NOT the per-pharmacy price)
  currency TEXT,
  packaging_photo_url TEXT,
  version BIGINT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, presentation_key)
);

CREATE INDEX IF NOT EXISTS drug_brand_presentations_brand_idx ON drug_brand_presentations (brand_id);
CREATE INDEX IF NOT EXISTS drug_brand_presentations_version_idx ON drug_brand_presentations (version);

-- ── Version watermark trigger (shared; fires on INSERT and UPDATE) ───────────────
CREATE OR REPLACE FUNCTION increment_branded_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 + floor(random() * 1000)::BIGINT;
  NEW.last_updated := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER drug_brands_version_trigger
  BEFORE INSERT OR UPDATE ON drug_brands
  FOR EACH ROW EXECUTE FUNCTION increment_branded_version();

CREATE TRIGGER drug_brand_presentations_version_trigger
  BEFORE INSERT OR UPDATE ON drug_brand_presentations
  FOR EACH ROW EXECUTE FUNCTION increment_branded_version();

-- ── RLS: service_role full; authenticated read-only (non-PHI reference data) ─────
ALTER TABLE drug_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY drug_brands_service_all ON drug_brands
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY drug_brands_authenticated_read ON drug_brands
  FOR SELECT TO authenticated USING (true);

ALTER TABLE drug_brand_presentations ENABLE ROW LEVEL SECURITY;
CREATE POLICY drug_brand_presentations_service_all ON drug_brand_presentations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY drug_brand_presentations_authenticated_read ON drug_brand_presentations
  FOR SELECT TO authenticated USING (true);
