-- Migration: add brand_names_text generated column to drug_catalog
-- Enables ILIKE brand-name search via PostgREST and powers the Pharmopedia API fallback.

-- IMMUTABLE wrapper required for Postgres generated column expressions
CREATE OR REPLACE FUNCTION brand_names_to_text(arr TEXT[])
  RETURNS TEXT LANGUAGE SQL IMMUTABLE PARALLEL SAFE
  AS $$ SELECT array_to_string($1, ' ') $$;

-- Add generated column that flattens brand_names TEXT[] to a single searchable string
ALTER TABLE drug_catalog
  ADD COLUMN IF NOT EXISTS brand_names_text TEXT
  GENERATED ALWAYS AS (brand_names_to_text(brand_names)) STORED;

-- Trigram index supports ILIKE queries (required for PostgREST .ilike. filter)
CREATE INDEX IF NOT EXISTS idx_drug_catalog_brand_names_trgm
  ON drug_catalog USING gin(brand_names_text gin_trgm_ops);
