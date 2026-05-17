-- Story 23.3: Audit Chain Integrity Monitoring
-- Table to store audit chain verification history

CREATE TABLE IF NOT EXISTS audit_chain_verifications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  verified_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_count       INTEGER NOT NULL,
  valid               BOOLEAN,  -- null means job failed
  broken_at_event_id  UUID,     -- FK to audit_log (soft reference, no constraint — audit_log has no FK policy)
  job_duration_ms     INTEGER,
  error_reason        TEXT,     -- sanitized error for job failures
  is_full_verification BOOLEAN NOT NULL DEFAULT false,
  triggered_by        TEXT NOT NULL  -- 'CRON' or admin practitioner ID
);

-- Index for efficient history queries (most recent first)
CREATE INDEX idx_audit_chain_verifications_verified_at
  ON audit_chain_verifications (verified_at DESC);

-- Immutability: verification records are append-only (same philosophy as audit_log)
CREATE OR REPLACE FUNCTION prevent_audit_chain_verification_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_chain_verifications is append-only: updates are not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_chain_verifications_no_update
  BEFORE UPDATE ON audit_chain_verifications
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_chain_verification_update();

CREATE OR REPLACE FUNCTION prevent_audit_chain_verification_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_chain_verifications is append-only: deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_chain_verifications_no_delete
  BEFORE DELETE ON audit_chain_verifications
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_chain_verification_delete();

-- RLS: only service_role (Hub API) can access — no direct client access
ALTER TABLE audit_chain_verifications ENABLE ROW LEVEL SECURITY;
-- No policies = deny all for anon/authenticated; service_role bypasses RLS
