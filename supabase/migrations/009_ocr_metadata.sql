-- ============================================================
-- Migration 009: OCR Metadata Columns
-- Story 12.6: AI Metadata Extraction (OCR)
-- PRD: LAB-022 (AI Metadata Extraction)
--
-- Adds OCR audit fields to diagnostic_reports:
-- - ocr_metadata_verified: whether technician confirmed AI suggestions
-- - ocr_suggestions: JSON record of OCR-suggested values for audit
-- ============================================================

ALTER TABLE diagnostic_reports
  ADD COLUMN IF NOT EXISTS ocr_metadata_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ocr_suggestions JSONB;

COMMENT ON COLUMN diagnostic_reports.ocr_metadata_verified
  IS 'True if technician reviewed and confirmed OCR-suggested metadata (Story 12.6 AC 6)';

COMMENT ON COLUMN diagnostic_reports.ocr_suggestions
  IS 'JSON array of OCR suggestions with confidence scores, stored for audit (Story 12.6 AC 6)';
