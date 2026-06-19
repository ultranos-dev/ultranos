-- 037: Replace the PLLR-deprecated single-letter pregnancy_category with a
-- structured pregnancy_clinical JSONB column
-- ({ pregnancy, lactation, reproductivePotential, legacyCategory }).
-- Lossy by design — repopulated by ETL re-enrichment.

ALTER TABLE drug_catalog DROP COLUMN IF EXISTS pregnancy_category;
ALTER TABLE drug_catalog ADD COLUMN IF NOT EXISTS pregnancy_clinical JSONB NOT NULL DEFAULT '{}';
