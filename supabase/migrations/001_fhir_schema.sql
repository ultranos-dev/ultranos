-- ============================================================
-- Migration 001: FHIR R4-aligned schema
-- Ultranos Central Patient Ledger
-- PRD Sections 15, 16, 7.2, 12
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── PRACTITIONERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practitioners (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- FHIR Practitioner fields
  family_name           TEXT NOT NULL,
  given_name            TEXT NOT NULL,
  telecom_email         TEXT NOT NULL UNIQUE,
  telecom_phone         TEXT,
  -- Identifier (license)
  identifier_system     TEXT,           -- e.g. 'HAAD', 'JMC', 'MOH_UAE'
  identifier_value      TEXT,           -- license number
  qualification_code    TEXT,           -- specialty code
  qualification_display TEXT,
  -- Ultranos extensions
  password_hash         TEXT NOT NULL,
  totp_secret           TEXT,           -- TOTP secret (encrypted at app layer)
  role                  TEXT NOT NULL DEFAULT 'DOCTOR'
                          CHECK (role IN ('DOCTOR','PHARMACIST','LAB_TECH','ADMIN')),
  license_expiry        DATE,
  kyc_status            TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
                          CHECK (kyc_status IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','REVOKED')),
  clinic_name           TEXT,
  clinic_address        TEXT,
  gps_lat               DECIMAL(9,6),
  gps_lng               DECIMAL(9,6),
  consultation_languages TEXT[] DEFAULT ARRAY['en'],
  -- Timestamps (immutable creation)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PATIENTS ──────────────────────────────────────────────────
-- FHIR R4 Patient resource + MPI fields
CREATE TABLE IF NOT EXISTS patients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- FHIR name fields
  name_local        TEXT NOT NULL,    -- preferred script (NFD-normalized)
  name_latin        TEXT,             -- ALA-LC romanization
  name_phonetic     TEXT,             -- Double Metaphone (future: computed trigger)
  -- FHIR demographics
  gender            TEXT CHECK (gender IN ('male','female','other','unknown')),
  birth_date        DATE,
  birth_year_only   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Contact
  telecom_phone     TEXT,
  -- MPI identity
  national_id_hash  TEXT,             -- SHA-256 of national ID — never store raw
  -- Ultranos extensions
  guardian_id       UUID REFERENCES patients(id),
  consent_version   TEXT,
  mpi_warn          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  -- Provenance
  created_by        UUID REFERENCES practitioners(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CONSENT RECORDS ───────────────────────────────────────────
-- PRD Section 7.2 — Immutable consent data model
CREATE TABLE IF NOT EXISTS consent_records (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id       UUID NOT NULL REFERENCES patients(id),
  grantor_id       UUID NOT NULL,
  grantor_role     TEXT NOT NULL CHECK (grantor_role IN ('SELF','GUARDIAN','EMERGENCY_OVERRIDE')),
  purpose          TEXT NOT NULL CHECK (purpose IN ('TREATMENT','ANALYTICS','AI_PROCESSING','RESEARCH','THIRD_PARTY_SHARE')),
  scope            TEXT[] NOT NULL,
  granted_to_id    UUID,              -- NULL = system-level processing
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until      TIMESTAMPTZ,       -- NULL = persistent until withdrawn
  status           TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE','WITHDRAWN','EXPIRED','SUPERSEDED')),
  consent_version  TEXT NOT NULL,
  withdrawn_at     TIMESTAMPTZ,
  withdrawal_reason TEXT,
  audit_hash       TEXT NOT NULL,    -- SHA-256 tamper-evidence
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- No updated_at — consent records are append-only addenda
);

-- ── AUDIT LOG ─────────────────────────────────────────────────
-- PRD Section 12 — Append-only, hash-chained, tamper-evident
-- CRITICAL: Never grant UPDATE or DELETE on this table
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id      UUID,
  actor_role    TEXT NOT NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID,
  patient_id    UUID,
  session_id    UUID,
  device_id     TEXT,
  source_ip_hash TEXT,              -- SHA-256 hashed IP per GDPR
  outcome       TEXT NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE','DENIED')),
  denial_reason TEXT,
  chain_hash    TEXT NOT NULL,      -- SHA-256(prev_hash + event_data)
  metadata      JSONB
  -- No foreign keys on audit_log — must survive referenced row deletion
);

-- Trigger: prevent updates on immutable records
CREATE OR REPLACE FUNCTION prevent_audit_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only. Updates are not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_update();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_update();
