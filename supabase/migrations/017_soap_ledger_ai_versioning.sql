-- Story 24.1: AI Clinical Scribe — SOAP Note Parsing
-- Extends soap_ledger with AI versioning columns for tracking
-- AI-generated vs physician-confirmed SOAP entries.

-- Add source column to distinguish manual, AI-generated, and AI-confirmed entries
ALTER TABLE soap_ledger
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'MANUAL'
  CHECK (source IN ('MANUAL', 'AI_GENERATED', 'AI_CONFIRMED'));

-- AI model version (e.g., 'gpt-4o-2024-11-20')
ALTER TABLE soap_ledger
  ADD COLUMN IF NOT EXISTS ai_model_version TEXT;

-- Raw freeform text the clinician typed before AI parsing (encrypted PHI)
ALTER TABLE soap_ledger
  ADD COLUMN IF NOT EXISTS original_freeform_text TEXT;

-- Full AI response before physician edits (encrypted PHI)
ALTER TABLE soap_ledger
  ADD COLUMN IF NOT EXISTS ai_raw_response TEXT;

-- Practitioner who confirmed the AI output
ALTER TABLE soap_ledger
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT;

-- Timestamp when AI output was confirmed
ALTER TABLE soap_ledger
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Index on source for filtering AI vs manual entries
CREATE INDEX IF NOT EXISTS idx_soap_ledger_source
  ON soap_ledger (source);

COMMENT ON COLUMN soap_ledger.source IS 'Entry origin: MANUAL (physician typed), AI_GENERATED (raw AI output), AI_CONFIRMED (physician-reviewed AI)';
COMMENT ON COLUMN soap_ledger.ai_model_version IS 'Exact LLM model ID used for parsing (e.g. gpt-4o-2024-11-20)';
COMMENT ON COLUMN soap_ledger.original_freeform_text IS 'Raw clinician text before AI parsing — encrypted PHI';
COMMENT ON COLUMN soap_ledger.ai_raw_response IS 'Full AI response before physician edits — encrypted PHI';
COMMENT ON COLUMN soap_ledger.confirmed_by IS 'Practitioner ID who confirmed AI output';
COMMENT ON COLUMN soap_ledger.confirmed_at IS 'Timestamp when AI output was confirmed by physician';
