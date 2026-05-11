-- ============================================================
-- Migration 012: Add encrypted PHI columns for patient names (Option A)
-- Story 16.2 — Patient CRUD Endpoints
--
-- Strategy: Keep existing unencrypted columns (name_local, name_latin,
-- name_phonetic, birth_date) for ILIKE search. Add new *_enc columns
-- that store AES-256-GCM encrypted copies for secure read operations.
-- Write path: dual-write to both columns. Read path: decrypt from _enc.
-- ============================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS name_local_enc    TEXT,
  ADD COLUMN IF NOT EXISTS name_latin_enc    TEXT,
  ADD COLUMN IF NOT EXISTS name_phonetic_enc TEXT,
  ADD COLUMN IF NOT EXISTS birth_date_enc    TEXT;
