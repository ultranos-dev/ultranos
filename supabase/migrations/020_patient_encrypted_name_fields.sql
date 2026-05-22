-- Migration 020: Add AES-256-GCM encrypted copies of patronymic name fields.
-- The plain-text columns (name_given, name_father, name_grandfather) are used
-- for MPI phonetic matching. The _enc columns store the encrypted source for display.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS name_given_enc        TEXT,
  ADD COLUMN IF NOT EXISTS name_father_enc       TEXT,
  ADD COLUMN IF NOT EXISTS name_grandfather_enc  TEXT;

COMMENT ON COLUMN patients.name_given_enc IS 'AES-256-GCM encrypted copy of name_given — source of truth for display';
COMMENT ON COLUMN patients.name_father_enc IS 'AES-256-GCM encrypted copy of name_father';
COMMENT ON COLUMN patients.name_grandfather_enc IS 'AES-256-GCM encrypted copy of name_grandfather';
