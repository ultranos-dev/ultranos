-- Migration 033: Drug catalog — centralized drug reference database
-- Non-PHI table: no field-level encryption required.
-- version column is an epoch-ms integer used as a sync watermark.

CREATE TABLE IF NOT EXISTS drug_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Core identity
  atc_code TEXT NOT NULL UNIQUE,
  rxnorm_cui TEXT,
  drugbank_id TEXT,
  inn_name TEXT NOT NULL,
  brand_names TEXT[] NOT NULL DEFAULT '{}',
  dose_forms TEXT[] NOT NULL DEFAULT '{}',
  therapeutic_class TEXT NOT NULL DEFAULT '',

  -- Local enrichment (curated by OPD-Lite / Pharmacy-Lite, never overwritten by ETL)
  local_names JSONB NOT NULL DEFAULT '{}',

  -- Tier 1 fields (all authenticated users)
  summary_plain JSONB NOT NULL DEFAULT '{}',
  used_for JSONB NOT NULL DEFAULT '[]',
  common_side_effects JSONB NOT NULL DEFAULT '[]',
  when_to_seek_help JSONB NOT NULL DEFAULT '{}',
  storage_instructions JSONB NOT NULL DEFAULT '{}',
  pregnancy_summary_plain JSONB NOT NULL DEFAULT '{}',
  warnings_summary_plain JSONB NOT NULL DEFAULT '{}',

  -- Tier 2 fields (clinical roles)
  mechanism_of_action TEXT,
  indications_clinical JSONB NOT NULL DEFAULT '[]',
  adult_dosing JSONB NOT NULL DEFAULT '[]',
  pediatric_dosing JSONB NOT NULL DEFAULT '[]',
  renal_adjustment TEXT,
  adverse_events JSONB NOT NULL DEFAULT '[]',
  contraindications JSONB NOT NULL DEFAULT '[]',
  interactions JSONB NOT NULL DEFAULT '[]',
  pregnancy_category TEXT,
  administration_notes JSONB NOT NULL DEFAULT '{}',
  pharmacokinetics JSONB NOT NULL DEFAULT '{}',

  -- Tier 3 fields (pharmacist — enrichment columns)
  formulary_status TEXT CHECK (formulary_status IN ('on_formulary', 'off_formulary', 'restricted')),
  dispensing_notes TEXT,
  substitutes TEXT[] NOT NULL DEFAULT '{}',
  recall_alerts JSONB NOT NULL DEFAULT '[]',
  unit_cost NUMERIC(10, 2),

  -- ETL source tracking
  etl_source TEXT,
  last_etl_refresh TIMESTAMPTZ,

  -- Sync watermark (epoch-ms, auto-incremented on every update)
  version BIGINT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS drug_catalog_atc_code_idx ON drug_catalog (atc_code);
CREATE INDEX IF NOT EXISTS drug_catalog_version_idx ON drug_catalog (version);
CREATE INDEX IF NOT EXISTS drug_catalog_inn_name_fts_idx
  ON drug_catalog USING gin(to_tsvector('simple', inn_name));

-- Auto-increment version on every row update
CREATE OR REPLACE FUNCTION increment_drug_catalog_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 +
                 floor(random() * 1000)::BIGINT;
  NEW.last_updated := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER drug_catalog_version_trigger
  BEFORE UPDATE ON drug_catalog
  FOR EACH ROW EXECUTE FUNCTION increment_drug_catalog_version();

-- RLS: service_role can do everything; authenticated users read-only
ALTER TABLE drug_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY drug_catalog_service_all ON drug_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY drug_catalog_authenticated_read ON drug_catalog
  FOR SELECT TO authenticated USING (true);
