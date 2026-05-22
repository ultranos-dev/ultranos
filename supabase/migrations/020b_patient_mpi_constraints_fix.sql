-- Migration 020b: Corrective fixes for migration 018 quality issues.

-- Fix 1: Document plain-text name columns as phonetic-only (NOT display names).
-- These columns store normalized text for MPI matching — encrypted _enc columns are source of truth for display.
COMMENT ON COLUMN patients.name_given IS 'Normalized plain-text for MPI phonetic indexing — NOT a display field. Display name is in name_given_enc. PHI: write phonetic form only.';
COMMENT ON COLUMN patients.name_father IS 'Normalized plain-text for MPI phonetic indexing — NOT a display field. Display name is in name_father_enc. PHI: write phonetic form only.';
COMMENT ON COLUMN patients.name_grandfather IS 'Normalized plain-text for MPI phonetic indexing — NOT a display field. Display name is in name_grandfather_enc. PHI: write phonetic form only.';

-- Fix 2: Replace static birth_year upper bound (2100) with dynamic current-year + 1.
-- This rejects obvious data-entry errors (e.g. 2080 for someone born in 1980).
ALTER TABLE patients DROP CONSTRAINT IF EXISTS birth_year_range;
ALTER TABLE patients ADD CONSTRAINT birth_year_range CHECK (
  birth_year IS NULL OR (
    birth_year >= 1900 AND birth_year <= EXTRACT(YEAR FROM NOW())::SMALLINT + 1
  )
);

-- Fix 3: Add range constraint on mpi_score (0–1000 matches MPI engine scale).
ALTER TABLE patients ADD CONSTRAINT mpi_score_range CHECK (
  mpi_score IS NULL OR (mpi_score >= 0 AND mpi_score <= 1000)
);
