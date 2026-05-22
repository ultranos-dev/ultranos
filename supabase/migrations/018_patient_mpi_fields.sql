-- Migration 018: Patient MPI Phase 1 — new identity columns
-- All new columns nullable to avoid breaking existing records.
-- Note: birth_year_range constraint was corrected in 020b_patient_mpi_constraints_fix.sql
-- Note: mpi_score_range constraint added in 020b_patient_mpi_constraints_fix.sql

ALTER TABLE patients
  -- Structured patronymic name (plain-text, for MPI matching and display)
  ADD COLUMN IF NOT EXISTS name_given          TEXT,
  ADD COLUMN IF NOT EXISTS name_father         TEXT,
  ADD COLUMN IF NOT EXISTS name_grandfather    TEXT,

  -- Phonetic token arrays — GIN-indexed in migration 021
  ADD COLUMN IF NOT EXISTS name_phonetic_given        TEXT[],
  ADD COLUMN IF NOT EXISTS name_phonetic_father       TEXT[],
  ADD COLUMN IF NOT EXISTS name_phonetic_grandfather  TEXT[],

  -- Birth year (standalone; populated from birth_date in migration 019)
  ADD COLUMN IF NOT EXISTS birth_year  SMALLINT
    CONSTRAINT birth_year_range CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2100)),

  -- Geographic origin (stable MPI signal)
  ADD COLUMN IF NOT EXISTS address_province_origin  TEXT,
  ADD COLUMN IF NOT EXISTS address_district_origin  TEXT,
  ADD COLUMN IF NOT EXISTS address_village_origin   TEXT,

  -- Current residence (logistics only — not an MPI signal)
  ADD COLUMN IF NOT EXISTS address_province_current  TEXT,
  ADD COLUMN IF NOT EXISTS address_district_current  TEXT,
  ADD COLUMN IF NOT EXISTS address_village_current   TEXT,

  -- Nomadic flag
  ADD COLUMN IF NOT EXISTS is_nomadic  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Biometric (hash only — raw template never stored)
  ADD COLUMN IF NOT EXISTS biometric_fingerprint_hash    TEXT,
  ADD COLUMN IF NOT EXISTS biometric_algorithm_version   TEXT,

  -- Paper Tazkira blind index (HMAC of jild|safa|shumara — never raw values)
  ADD COLUMN IF NOT EXISTS tazkira_paper_hash  TEXT,

  -- FHIR R4 identifier array (e-Tazkira, passport, QR — hashed values only)
  ADD COLUMN IF NOT EXISTS identifiers  JSONB,

  -- MPI score from last duplicate check (informational)
  ADD COLUMN IF NOT EXISTS mpi_score  INTEGER;

COMMENT ON COLUMN patients.name_given IS 'Normalized plain-text for MPI phonetic indexing — NOT a display field. Display name is in name_given_enc. PHI: write phonetic form only.';
COMMENT ON COLUMN patients.name_father IS 'Normalized plain-text for MPI phonetic indexing — NOT a display field. Display name is in name_father_enc. PHI: write phonetic form only.';
COMMENT ON COLUMN patients.name_grandfather IS 'Normalized plain-text for MPI phonetic indexing — NOT a display field. Display name is in name_grandfather_enc. PHI: write phonetic form only.';
COMMENT ON COLUMN patients.name_phonetic_given IS 'Double Metaphone tokens for given name — GIN indexed for MPI candidate retrieval';
COMMENT ON COLUMN patients.tazkira_paper_hash IS 'HMAC(jild + | + safa + | + shumara) — blind index for paper Tazkira deduplication';
COMMENT ON COLUMN patients.is_nomadic IS 'True for patients whose address changes seasonally — current address not a reliable MPI signal';
