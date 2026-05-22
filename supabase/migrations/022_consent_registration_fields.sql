-- Migration 022: Add consent method/witness/language columns to consent_records table.
-- consent_version already exists on consent_records — not re-added.
-- These fields are required for the atomic create_patient_with_consent() RPC.
--
-- Note: The actual table name is consent_records (not consents).

ALTER TABLE consent_records
  ADD COLUMN IF NOT EXISTS consent_method   TEXT
    CONSTRAINT consent_method_values CHECK (consent_method IN ('WRITTEN', 'VERBAL_WITNESSED', 'SELF_REGISTERED')),

  ADD COLUMN IF NOT EXISTS witnessed_by     UUID REFERENCES practitioners(id),

  ADD COLUMN IF NOT EXISTS consent_language TEXT
    CONSTRAINT consent_language_values CHECK (consent_language IN ('en', 'ar', 'prs'));

-- A VERBAL_WITNESSED consent must have a witness
ALTER TABLE consent_records
  ADD CONSTRAINT consent_verbal_requires_witness CHECK (
    (consent_method = 'VERBAL_WITNESSED' AND witnessed_by IS NOT NULL)
    OR (consent_method IS NULL OR consent_method != 'VERBAL_WITNESSED')
  );

COMMENT ON COLUMN consent_records.consent_method IS 'WRITTEN | VERBAL_WITNESSED | SELF_REGISTERED — how consent was obtained';
COMMENT ON COLUMN consent_records.witnessed_by IS 'Practitioner UUID who witnessed verbal consent — required when consent_method = VERBAL_WITNESSED';
COMMENT ON COLUMN consent_records.consent_language IS 'Language in which consent was presented (en | ar | prs)';
