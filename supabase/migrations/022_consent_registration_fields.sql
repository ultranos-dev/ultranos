-- Migration 022: Add consent method/witness/language/version columns to consents table.
-- These fields are required for the atomic create_patient_with_consent() RPC.
--
-- NOTE: This migration was SKIPPED during Task 8 (2026-05-21) because the `consents`
-- table did not yet exist in the database. This migration must be applied AFTER the
-- consents table is created (see the base FHIR schema). Re-apply when consents table
-- is present, before invoking create_patient_with_consent() RPC.

ALTER TABLE consents
  ADD COLUMN IF NOT EXISTS consent_method   TEXT
    CONSTRAINT consent_method_values CHECK (consent_method IN ('WRITTEN', 'VERBAL_WITNESSED', 'SELF_REGISTERED')),

  ADD COLUMN IF NOT EXISTS witnessed_by     UUID REFERENCES practitioners(id),

  ADD COLUMN IF NOT EXISTS consent_language TEXT
    CONSTRAINT consent_language_values CHECK (consent_language IN ('en', 'ar', 'prs')),

  ADD COLUMN IF NOT EXISTS consent_version  TEXT NOT NULL DEFAULT 'v1.0-en';

-- A VERBAL_WITNESSED consent must have a witness
ALTER TABLE consents
  ADD CONSTRAINT consent_verbal_requires_witness CHECK (
    (consent_method = 'VERBAL_WITNESSED' AND witnessed_by IS NOT NULL)
    OR (consent_method IS NULL OR consent_method != 'VERBAL_WITNESSED')
  );

COMMENT ON COLUMN consents.consent_method IS 'WRITTEN | VERBAL_WITNESSED | SELF_REGISTERED — how consent was obtained';
COMMENT ON COLUMN consents.witnessed_by IS 'Practitioner UUID who witnessed verbal consent — required when consent_method = VERBAL_WITNESSED';
COMMENT ON COLUMN consents.consent_language IS 'Language in which consent was presented (en | ar | prs)';
COMMENT ON COLUMN consents.consent_version IS 'Consent text version (e.g. v1.0-en) — allows consent renewal on text change';
