-- 038: per-field/per-lang machine|confirmed status for displayed translations.
ALTER TABLE drug_catalog ADD COLUMN IF NOT EXISTS translation_status JSONB NOT NULL DEFAULT '{}';
