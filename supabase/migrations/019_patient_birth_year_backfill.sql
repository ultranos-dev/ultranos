-- Migration 019: Backfill birth_year from birth_date for existing records.
-- birth_date is a DATE column, so we cast to TEXT for pattern matching.
-- Safe to re-run (updates only rows where birth_year IS NULL and birth_date IS NOT NULL).

UPDATE patients
SET birth_year = EXTRACT(YEAR FROM birth_date)::SMALLINT
WHERE birth_date IS NOT NULL
  AND birth_year IS NULL;
