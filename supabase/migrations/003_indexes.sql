-- ============================================================
-- Migration 003: Performance indexes
-- PRD Section 15 — MPI matching requires fast lookups
-- ============================================================

-- Patient search indexes
CREATE INDEX IF NOT EXISTS idx_patients_national_id_hash ON patients (national_id_hash) WHERE national_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_phone            ON patients (telecom_phone)     WHERE telecom_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_name_local       ON patients USING gin (to_tsvector('simple', name_local));
CREATE INDEX IF NOT EXISTS idx_patients_active           ON patients (is_active)         WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_patients_guardian         ON patients (guardian_id)       WHERE guardian_id IS NOT NULL;

-- Practitioner lookup
CREATE INDEX IF NOT EXISTS idx_practitioners_email       ON practitioners (telecom_email);
CREATE INDEX IF NOT EXISTS idx_practitioners_kyc         ON practitioners (kyc_status);
CREATE INDEX IF NOT EXISTS idx_practitioners_expiry      ON practitioners (license_expiry) WHERE license_expiry IS NOT NULL;

-- Consent lookup — patient + status
CREATE INDEX IF NOT EXISTS idx_consent_patient_status    ON consent_records (patient_id, status);
CREATE INDEX IF NOT EXISTS idx_consent_granted_to        ON consent_records (granted_to_id) WHERE granted_to_id IS NOT NULL;

-- Audit log — patient queries (PHI access tracing)
CREATE INDEX IF NOT EXISTS idx_audit_patient_id          ON audit_log (patient_id)  WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_actor_id            ON audit_log (actor_id)    WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_timestamp           ON audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action              ON audit_log (action);
