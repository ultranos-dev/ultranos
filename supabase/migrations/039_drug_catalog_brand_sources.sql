-- 039: per-brand provenance for brand_names. Maps each brand (lowercased key)
-- to the source that contributed it: 'drugbank' | 'rxnav' | 'regional'.
-- Optional/audit-only — populated by the brand-enrichment ETL runners
-- (run-rxnav-brands, run-regional-brands) when WRITE_BRAND_SOURCES=1.
ALTER TABLE drug_catalog ADD COLUMN IF NOT EXISTS brand_sources JSONB NOT NULL DEFAULT '{}';
