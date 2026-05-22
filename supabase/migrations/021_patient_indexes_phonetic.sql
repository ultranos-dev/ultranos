-- Migration 021: GIN indexes on phonetic arrays + scalar indexes for MPI candidate retrieval.
-- These indexes make the fetch_mpi_candidates() query efficient.
-- GIN indexes support the && (array overlap) operator used in candidate retrieval.

CREATE INDEX IF NOT EXISTS idx_patients_phonetic_given
  ON patients USING GIN (name_phonetic_given);

CREATE INDEX IF NOT EXISTS idx_patients_phonetic_father
  ON patients USING GIN (name_phonetic_father);

CREATE INDEX IF NOT EXISTS idx_patients_phonetic_grandfather
  ON patients USING GIN (name_phonetic_grandfather);

CREATE INDEX IF NOT EXISTS idx_patients_birth_year
  ON patients (birth_year)
  WHERE birth_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_district_origin
  ON patients (address_district_origin)
  WHERE address_district_origin IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_biometric
  ON patients (biometric_fingerprint_hash)
  WHERE biometric_fingerprint_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_tazkira_paper
  ON patients (tazkira_paper_hash)
  WHERE tazkira_paper_hash IS NOT NULL;

-- mpi_warn index for admin review queue (existing column, new partial index)
CREATE INDEX IF NOT EXISTS idx_patients_mpi_warn
  ON patients (mpi_warn)
  WHERE mpi_warn = TRUE;
