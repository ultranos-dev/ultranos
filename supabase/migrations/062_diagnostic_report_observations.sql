-- ============================================================
-- Migration 062: Diagnostic Report Observations (structured analytes)
-- Per-analyte lab result values hanging off a diagnostic_reports row.
-- Blind-ref-safe: no patient UUID here — the parent report holds the
-- opaque patient_ref. FHIR R4 DiagnosticReport.result -> Observation.
-- ============================================================
CREATE TABLE IF NOT EXISTS diagnostic_report_observations (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  diagnostic_report_id UUID NOT NULL REFERENCES diagnostic_reports(id) ON DELETE CASCADE,
  observation_id       UUID NOT NULL,          -- client-generated Observation.id (idempotency)
  loinc_code           TEXT NOT NULL,
  loinc_display        TEXT,
  value_quantity       JSONB,                  -- { value, unit?, system?, code? }
  value_string         TEXT,
  interpretation       JSONB,                  -- FHIR interpretation coding (abnormal flags)
  reference_range      JSONB,                  -- { low?, high?, text? }
  note                 JSONB,                  -- [{ text }]
  effective_date_time  TIMESTAMPTZ,
  _ultranos_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dro_report
  ON diagnostic_report_observations (diagnostic_report_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dro_report_obs
  ON diagnostic_report_observations (diagnostic_report_id, observation_id);
