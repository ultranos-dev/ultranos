-- ============================================================
-- Migration 013: Partial unique index on national_id_hash
-- Story 16.2 — Patient CRUD Endpoints (AC #6)
--
-- Enforces uniqueness only when national_id_hash IS NOT NULL.
-- Patients without national IDs should not conflict with each other.
-- Replaces the non-unique index from 003_indexes.sql.
-- ============================================================

-- Drop the existing non-unique index (if it exists) before creating unique one
DROP INDEX IF EXISTS idx_patients_national_id_hash;

CREATE UNIQUE INDEX idx_patients_national_id_hash_unique
  ON patients (national_id_hash)
  WHERE national_id_hash IS NOT NULL;
