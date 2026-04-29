-- ============================================================
-- Migration 005: Medication Requests table
-- Story 3.4: Global Prescription Invalidation Check
-- Enables pharmacists to verify prescription status globally.
-- ============================================================

CREATE TABLE IF NOT EXISTS medication_requests (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- FHIR R4 MedicationRequest core fields
  resource_type         TEXT NOT NULL DEFAULT 'MedicationRequest',
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','on-hold','cancelled','completed','entered-in-error','stopped','draft','unknown')),
  intent                TEXT NOT NULL DEFAULT 'order'
                          CHECK (intent IN ('proposal','plan','order','original-order','reflex-order','filler-order','instance-order','option')),
  -- Medication identity
  medication_code       TEXT NOT NULL,
  medication_display    TEXT NOT NULL,
  medication_text       TEXT,
  -- References
  patient_id            UUID NOT NULL REFERENCES patients(id),
  encounter_id          UUID,
  requester_id          UUID REFERENCES practitioners(id),
  authored_on           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dosage (stored as JSONB for FHIR flexibility)
  dosage_instruction    JSONB,
  dispense_request      JSONB,
  -- Ultranos extensions
  prescription_status   TEXT NOT NULL DEFAULT 'ACTIVE'
                          CHECK (prescription_status IN ('ACTIVE','DISPENSED','PARTIALLY_DISPENSED','EXPIRED','CANCELLED')),
  interaction_check     TEXT NOT NULL DEFAULT 'CLEAR'
                          CHECK (interaction_check IN ('CLEAR','WARNING','BLOCKED','UNAVAILABLE')),
  interaction_override  TEXT,
  qr_code_id            TEXT UNIQUE,
  is_offline_created    BOOLEAN NOT NULL DEFAULT FALSE,
  hlc_timestamp         TEXT,
  -- Fulfillment tracking
  dispensed_at          TIMESTAMPTZ,
  dispensed_by          UUID REFERENCES practitioners(id),
  -- FHIR Meta
  meta_last_updated     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta_version_id       TEXT NOT NULL DEFAULT '1',
  -- Provenance
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for status checks by prescription ID (primary lookup for pharmacist scan)
CREATE INDEX idx_medication_requests_qr_code_id ON medication_requests (qr_code_id) WHERE qr_code_id IS NOT NULL;

-- Index for patient-scoped lookups
CREATE INDEX idx_medication_requests_patient_id ON medication_requests (patient_id);

-- Index for status-based queries
CREATE INDEX idx_medication_requests_status ON medication_requests (prescription_status);
