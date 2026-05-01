-- ============================================================
-- Migration 006: Lab Registration Tables
-- Story 12.1: Lab Credentialing & Technician Authentication
-- PRD: LAB-001 (Lab Registration), LAB-002 (Technician Identity Binding)
-- ============================================================

-- ── LABS ──────────────────────────────────────────────────────
-- Registered laboratories. Start in PENDING until back-office verification.
CREATE TABLE IF NOT EXISTS labs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  license_ref       TEXT NOT NULL UNIQUE,      -- Operating license reference (one lab per license)
  accreditation_ref TEXT,                     -- ISO 15189 accreditation (optional)
  status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at       TIMESTAMPTZ              -- Set by back-office on verification
);

-- ── LAB TECHNICIANS ──────────────────────────────────────────
-- Binds a practitioner (with LAB_TECH role) to a specific lab.
-- One practitioner per lab; ensures identity traceability per PRD LAB-002.
CREATE TABLE IF NOT EXISTS lab_technicians (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practitioner_id   UUID NOT NULL REFERENCES practitioners(id),
  lab_id            UUID NOT NULL REFERENCES labs(id),
  credential_ref    TEXT,                     -- Technician credential reference
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (practitioner_id)                    -- One lab affiliation per technician
);

-- Index for fast lookup by practitioner
CREATE INDEX IF NOT EXISTS idx_lab_technicians_practitioner
  ON lab_technicians (practitioner_id);

-- Index for lab status checks
CREATE INDEX IF NOT EXISTS idx_labs_status
  ON labs (status);
