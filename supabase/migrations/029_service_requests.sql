-- ============================================================
-- Migration 029: Service Requests (Test Orders)
-- Story 42.2: Electronic Test Order Reception from OPD-Lite
-- FHIR R4 ServiceRequest resource aligned.
--
-- Orders flow: OPD-Lite creates → Hub stores → Lab-Lite pulls.
-- Data minimization enforced at API layer (CLAUDE.md Rule #7):
-- Lab-Lite sees ONLY patient first name + age via lab.pullOrders.
-- ============================================================

CREATE TABLE IF NOT EXISTS service_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- FHIR R4 ServiceRequest core fields
  resource_type       TEXT NOT NULL DEFAULT 'ServiceRequest',
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('draft','active','on-hold','revoked','completed','entered-in-error','unknown')),
  intent              TEXT NOT NULL DEFAULT 'order'
                        CHECK (intent IN ('proposal','plan','directive','order','original-order','reflex-order','filler-order','instance-order','option')),
  priority            TEXT DEFAULT 'routine'
                        CHECK (priority IN ('routine','urgent','asap','stat')),
  -- What test (LOINC-coded)
  code_system         TEXT NOT NULL DEFAULT 'http://loinc.org',
  code_code           TEXT NOT NULL,
  code_display        TEXT,
  -- Additional test details (JSONB array of CodeableConcepts)
  order_detail        JSONB,
  -- References
  patient_id          UUID NOT NULL REFERENCES patients(id),
  encounter_id        UUID,
  requester_id        UUID NOT NULL REFERENCES practitioners(id),
  authored_on         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Clinical context (stored but NEVER exposed to Lab-Lite)
  reason_code         JSONB,        -- Array of CodeableConcepts — clinical reason
  supporting_info     JSONB,        -- Array of References — clinical context
  note                JSONB,        -- Array of Annotations
  -- Ultranos extensions
  hlc_timestamp       TEXT,
  is_offline_created  BOOLEAN NOT NULL DEFAULT FALSE,
  received_at         TIMESTAMPTZ,              -- When lab acknowledged
  received_by_lab_id  UUID REFERENCES labs(id),
  received_by_tech_id UUID,
  special_instructions TEXT,                     -- Free-text from physician
  -- FHIR Meta
  meta_last_updated   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta_version_id     TEXT NOT NULL DEFAULT '1',
  -- Provenance
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lab pull queries: active orders not yet received, or received by a specific lab
CREATE INDEX idx_service_requests_status ON service_requests (status);

-- Index for incremental sync (lab.pullOrders since=...)
CREATE INDEX idx_service_requests_meta_updated ON service_requests (meta_last_updated);

-- Index for patient-scoped lookups
CREATE INDEX idx_service_requests_patient_id ON service_requests (patient_id);

-- Index for requester lookups (ordering physician)
CREATE INDEX idx_service_requests_requester_id ON service_requests (requester_id);

-- Composite index for lab pull queries: covers the OR filter on received_by_lab_id
-- including NULLs (unassigned orders). No partial filter — both arms of the OR use this.
CREATE INDEX idx_service_requests_status_lab
  ON service_requests (status, received_by_lab_id);

-- Add ORDER_RECEIVED to notifications type constraint
-- so lab.acknowledgeOrder can dispatch notifications to ordering physician
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'LAB_RESULT_AVAILABLE',
      'LAB_RESULT_ESCALATION',
      'PRESCRIPTION_READY',
      'CONSENT_CHANGE',
      'SYNC_CONFLICT',
      'ALLERGY_UPDATE',
      'ORDER_RECEIVED'
    ));
