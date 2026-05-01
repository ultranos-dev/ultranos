-- ============================================================
-- Migration 007: Diagnostic Reports & Lab Result Files
-- Story 12.3: Result Upload & Metadata Tagging
-- PRD: LAB-020 (File Upload), LAB-021 (Metadata Tagging)
--
-- FHIR R4 DiagnosticReport resource aligned.
-- Files stored separately from metadata for encryption isolation.
-- ============================================================

-- ── DIAGNOSTIC REPORTS ───────────────────────────────────────
-- FHIR DiagnosticReport metadata. PHI fields encrypted at rest (AES-256-GCM).
CREATE TABLE IF NOT EXISTS diagnostic_reports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status            TEXT NOT NULL DEFAULT 'preliminary'
                      CHECK (status IN ('preliminary', 'final', 'amended', 'cancelled')),
  loinc_code        TEXT NOT NULL,                -- LOINC code from test category
  loinc_display     TEXT NOT NULL,                -- Human-readable test category name
  patient_ref       TEXT NOT NULL,                -- Opaque HMAC reference (never raw ID in app layer)
  performer_id      UUID NOT NULL REFERENCES practitioners(id),
  lab_id            UUID NOT NULL REFERENCES labs(id),
  issued            TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- Upload timestamp (FHIR: issued)
  collection_date   DATE NOT NULL,                       -- Sample collection date
  report_conclusion TEXT,                         -- Encrypted: optional text conclusion
  virus_scan_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'error')),
  _ultranos_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── LAB RESULT FILES ─────────────────────────────────────────
-- Encrypted binary file storage for lab result documents.
-- Linked 1:1 to diagnostic_reports.
CREATE TABLE IF NOT EXISTS lab_result_files (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  diagnostic_report_id UUID NOT NULL REFERENCES diagnostic_reports(id) ON DELETE CASCADE,
  file_name           TEXT NOT NULL,
  file_type           TEXT NOT NULL CHECK (file_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  file_size           INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  encrypted_content   TEXT NOT NULL,              -- AES-256-GCM encrypted (v1:<base64>)
  file_hash           TEXT NOT NULL,              -- SHA-256 hash of original file (for audit)
  _ultranos_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_patient_ref
  ON diagnostic_reports (patient_ref);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_lab
  ON diagnostic_reports (lab_id);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_performer
  ON diagnostic_reports (performer_id);

CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_status
  ON diagnostic_reports (status);

CREATE INDEX IF NOT EXISTS idx_lab_result_files_report
  ON lab_result_files (diagnostic_report_id);
