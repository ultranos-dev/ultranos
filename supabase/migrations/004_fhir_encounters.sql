-- ============================================================
-- Migration 004: FHIR R4 Encounter table
-- Story 1.2 — Hub API & tRPC Scaffolding
-- Ref: https://hl7.org/fhir/R4/encounter.html
-- ============================================================

CREATE TABLE IF NOT EXISTS encounters (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- FHIR Encounter.status
  status                TEXT NOT NULL DEFAULT 'planned'
                          CHECK (status IN (
                            'planned', 'arrived', 'triaged', 'in-progress',
                            'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown'
                          )),

  -- FHIR Encounter.class (coding)
  class_system          TEXT NOT NULL DEFAULT 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  class_code            TEXT NOT NULL DEFAULT 'AMB',
  class_display         TEXT,

  -- FHIR Encounter.type (stored as JSONB array of CodeableConcept)
  type                  JSONB,

  -- FHIR Encounter.subject — reference to Patient
  subject_id            UUID NOT NULL REFERENCES patients(id),

  -- FHIR Encounter.participant (stored as JSONB array)
  participant           JSONB,

  -- FHIR Encounter.period
  period_start          TIMESTAMPTZ,
  period_end            TIMESTAMPTZ,

  -- FHIR Encounter.reasonCode (stored as JSONB array of CodeableConcept)
  reason_code           JSONB,

  -- FHIR Encounter.diagnosis (stored as JSONB array)
  diagnosis             JSONB,

  -- Ultranos extensions (_ultranos namespace)
  clinic_id             TEXT,
  soap_note_id          UUID,
  is_offline_created    BOOLEAN NOT NULL DEFAULT FALSE,
  hlc_timestamp         TEXT NOT NULL,            -- HLC stored as string per Developer Guardrails

  -- FHIR Meta
  version_id            TEXT NOT NULL DEFAULT '1',
  last_updated          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ultranos _ultranos.createdAt (not in meta per CLAUDE.md)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_encounters_subject_id ON encounters(subject_id);
CREATE INDEX IF NOT EXISTS idx_encounters_status ON encounters(status);
CREATE INDEX IF NOT EXISTS idx_encounters_period_start ON encounters(period_start);
CREATE INDEX IF NOT EXISTS idx_encounters_hlc_timestamp ON encounters(hlc_timestamp);

-- Row Level Security (matches pattern from migration 002)
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_encounters" ON encounters TO service_role USING (true) WITH CHECK (true);
